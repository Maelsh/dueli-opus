/**
 * Dueli Realtime Worker — T5.1
 * ============================
 * Cloudflare Worker + Durable Objects لتوصيل الأحداث اللحظية بدفع أصلي
 * (يستبدل polling الـSSE عندما يُنشر ويُضبط REALTIME_WS_URL في الواجهة).
 *
 * المعمارية:
 *   - غرفة DO لكل قناة (user:<id> | competition:<id> | global)
 *   - WebSocket Hibernation API → لا تُحاسب على الاتصالات الخاملة
 *   - التحقق من الهوية مرة واحدة عند المصافحة عبر /api/auth/session في تطبيق Pages
 *   - النشر داخلياً من تطبيق Pages عبر POST /publish (محمي بـREALTIME_PUBLISH_SECRET)
 *
 * النشر:
 *   cd workers/dueli-realtime
 *   wrangler deploy
 *   ثم اضبط PAGES_API_URL وREALTIME_PUBLISH_SECRET كأسرار للـWorker،
 *   وأضف REALTIME_WS_URL=wss://<worker-domain>/ws في متغيرات صفحات Dueli.
 */

export interface Env {
    REALTIME_ROOM: DurableObjectNamespace;
    PAGES_API_URL: string;              // e.g. https://dueli.maelshpro.com
    REALTIME_PUBLISH_SECRET: string;    // shared secret with the Pages app
}

/** غرفة قناة واحدة — كل العملاء المتصلين بنفس القناة يشتركون في نسخة واحدة */
export class RealtimeRoom implements DurableObject {
    private readonly sockets = new Set<WebSocket>();

    constructor(private readonly state: DurableObjectState, private readonly env: Env) {}

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);

        // مصادقة المصافحة: جلسة صالحة في تطبيق Pages
        if (url.pathname === '/connect') {
            return this.handleConnect(request, url);
        }

        // نشر حدث لكل المتصلين بهذه الغرفة (من تطبيق Pages فقط)
        if (url.pathname === '/broadcast' && request.method === 'POST') {
            return this.handleBroadcast(request);
        }

        return new Response('Not found', { status: 404 });
    }

    private async handleConnect(request: Request, url: URL): Promise<Response> {
        const channel = url.searchParams.get('channel') || '';
        const token = url.searchParams.get('token') || '';

        if (!channel) return new Response('channel required', { status: 400 });

        // قنوات المستخدم تتطلب جلسة صالحة وتطابق هوية المستخدم
        if (channel.startsWith('user:')) {
            const auth = await this.authenticate(token);
            if (!auth.valid) return new Response('Unauthorized', { status: 401 });
            const targetId = parseInt(channel.split(':')[1] || '0', 10);
            if (auth.userId !== targetId && !auth.isAdmin) {
                return new Response('Forbidden', { status: 403 });
            }
        }

        const pair = new WebSocketPair();
        this.state.acceptWebSocket(pair[1]);
        this.sockets.add(pair[1]);

        // تهيئة أولية
        pair[1].send(JSON.stringify({ type: 'connected', channel }));

        return new Response(null, { status: 101, webSocket: pair[0] });
    }

    /** تحقق الجلسة عبر تطبيق Pages (مرة واحدة عند المصافحة) */
    private async authenticate(token: string): Promise<{ valid: boolean; userId?: number; isAdmin?: boolean }> {
        if (!token) return { valid: false };
        try {
            const res = await fetch(`${this.env.PAGES_API_URL}/api/auth/session`, {
                headers: { Authorization: 'Bearer ' + token }
            });
            if (!res.ok) return { valid: false };
            const data: any = await res.json();
            const user = data?.data?.user || data?.user;
            if (!user?.id) return { valid: false };
            return { valid: true, userId: user.id, isAdmin: !!user.is_admin };
        } catch {
            return { valid: false };
        }
    }

    private async handleBroadcast(request: Request): Promise<Response> {
        const secret = request.headers.get('X-Publish-Secret') || '';
        if (secret !== this.env.REALTIME_PUBLISH_SECRET) {
            return new Response('Forbidden', { status: 403 });
        }

        const body: any = await request.json().catch(() => null);
        if (!body?.event) return new Response('event required', { status: 400 });

        const message = JSON.stringify({
            id: body.id || Date.now(),
            event: body.event,
            data: body.payload ?? {}
        });

        let delivered = 0;
        for (const ws of this.sockets) {
            try {
                ws.send(message);
                delivered++;
            } catch {
                this.sockets.delete(ws);
            }
        }
        return Response.json({ delivered });
    }

    // Hibernation callbacks
    webSocketClose(ws: WebSocket) {
        this.sockets.delete(ws);
    }

    webSocketError(ws: WebSocket) {
        this.sockets.delete(ws);
    }
}

/** توجيه الغرف حسب اسم القناة */
function roomKeyFor(channel: string): string {
    return channel;
}

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        const url = new URL(request.url);

        // نقطة النشر الداخلية من تطبيق Pages
        if (url.pathname === '/publish' && request.method === 'POST') {
            const secret = request.headers.get('X-Publish-Secret') || '';
            if (secret !== env.REALTIME_PUBLISH_SECRET) {
                return Response.json({ error: 'Forbidden' }, { status: 403 });
            }
            const body: any = await request.json().catch(() => null);
            if (!body?.channel || !body?.event) {
                return Response.json({ error: 'channel and event required' }, { status: 400 });
            }
            const roomId = env.REALTIME_ROOM.idFromName(roomKeyFor(body.channel));
            const stub = env.REALTIME_ROOM.get(roomId);
            const res = await stub.fetch('https://do/broadcast', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Publish-Secret': env.REALTIME_PUBLISH_SECRET
                },
                body: JSON.stringify({ event: body.event, payload: body.payload, id: body.id })
            });
            return Response.json(await res.json(), { status: res.status });
        }

        // مصافحة WebSocket
        if (url.pathname === '/ws') {
            const upgradeHeader = request.headers.get('Upgrade') || '';
            if (upgradeHeader.toLowerCase() !== 'websocket') {
                return new Response('Expected websocket', { status: 426 });
            }
            const channel = url.searchParams.get('channel') || '';
            const roomId = env.REALTIME_ROOM.idFromName(roomKeyFor(channel));
            const stub = env.REALTIME_ROOM.get(roomId);
            return stub.fetch(`https://do/connect?channel=${encodeURIComponent(channel)}&token=${encodeURIComponent(url.searchParams.get('token') || '')}`, request);
        }

        return new Response('Dueli Realtime — see docs/08-PUBLIC-API.md', { status: 200 });
    }
};
