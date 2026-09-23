/**
 * Dueli Realtime Worker — T5.1
 * ============================
 * Cloudflare Worker + Durable Objects لتوصيل الأحداث اللحظية بدفع أصلي
 * (يستبدل polling الـSSE عندما يُنشر ويُضبط REALTIME_WS_URL في الواجهة).
 *
 * المعمارية:
 *   - غرفة DO لكل قناة (user:<id> | competition:<id> | global)
 *   - WebSocket Hibernation API → لا تُحاسب على الاتصالات الخاملة
 *   - التحقق من الهوية مرة واحدة عند المصافحة عبر POST /api/realtime/redeem
 *     في تطبيق Pages (تذكرة أحادية 60s مربوطة بالقناة — C4/SEC-11: لا جلسة خام
 *     في الـURL أبداً، لا هنا ولا في Pages)
 *   - النشر داخلياً من تطبيق Pages عبر POST /publish (محمي بـREALTIME_PUBLISH_SECRET)
 *
 * النشر (بالترتيب — كسره يعطل المصافحة):
 *   1. انشر تطبيق Pages أولاً (يحمل POST /api/realtime/redeem).
 *   2. cd workers/dueli-realtime && wrangler deploy
 *   3. اضبط PAGES_API_URL وREALTIME_PUBLISH_SECRET كأسرار للـWorker،
 *      وREALTIME_PUBLISH_SECRET + REALTIME_WS_URL=wss://<worker-domain>/ws في Pages.
 */

export interface Env {
    REALTIME_ROOM: DurableObjectNamespace;
    PAGES_API_URL: string;              // e.g. https://dueli.maelshpro.com
    REALTIME_PUBLISH_SECRET: string;    // shared secret with the Pages app
}

/**
 * غرفة قناة واحدة — كل العملاء المتصلين بنفس القناة يشتركون في نسخة واحدة.
 *
 * SEC-10 (docs/12-SECURITY-REMEDIATION.md): لا تُستخدم مجموعة في الذاكرة
 * (`this.sockets`) للبثّ — الكود يستدعي `state.acceptWebSocket()` الذي يُفعّل
 * الـHibernation API، وبعد إيقاظ الغرفة من السكون Cloudflare تبني نسخة *جديدة*
 * من الكلاس بينما اتصالات WebSocket تبقى حيّة. أي حالة في الذاكرة (كمجموعة
 * `Set` هنا) تُصفَّر عند الإيقاظ فيصبح البثّ صامتاً (لا خطأ ولا سجل) رغم أن
 * العملاء ما زالوا متصلين فعلياً. الإصلاح: `state.getWebSockets()` يُعيد كل
 * الاتصالات الحيّة المُدارة من Cloudflare نفسها — لا حالة محلية إطلاقاً.
 */
export class RealtimeRoom implements DurableObject {
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
        const ticket = url.searchParams.get('ticket') || '';

        if (!channel) return new Response('channel required', { status: 400 });

        // قنوات المستخدم تتطلب تذكرة صالحة مربوطة بنفس القناة (C4/SEC-11:
        // raw session token مرفوض نهائياً — لا ?token= هنا ولا في Pages)
        if (channel.startsWith('user:')) {
            const auth = await this.authenticate(ticket, channel);
            if (!auth.valid) return new Response('Unauthorized', { status: 401 });
            const targetId = parseInt(channel.split(':')[1] || '0', 10);
            if (auth.userId !== targetId && !auth.isAdmin) {
                return new Response('Forbidden', { status: 403 });
            }
        }

        const pair = new WebSocketPair();
        this.state.acceptWebSocket(pair[1]);

        // تهيئة أولية
        pair[1].send(JSON.stringify({ type: 'connected', channel }));

        return new Response(null, { status: 101, webSocket: pair[0] });
    }

    /**
     * استهلاك تذكرة المصافحة عبر تطبيق Pages (مرة واحدة عند الاتصال).
     * العقد: POST {PAGES_API_URL}/api/realtime/redeem بترويسة X-Publish-Secret
     * وجسم {ticket, channel} ⇒ {valid, userId, isAdmin}. التذكرة أحادية 60s.
     */
    private async authenticate(ticket: string, channel: string): Promise<{ valid: boolean; userId?: number; isAdmin?: boolean }> {
        if (!ticket || !channel) return { valid: false };
        try {
            const res = await fetch(`${this.env.PAGES_API_URL}/api/realtime/redeem`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Publish-Secret': this.env.REALTIME_PUBLISH_SECRET
                },
                body: JSON.stringify({ ticket, channel })
            });
            if (!res.ok) return { valid: false };
            const data: any = await res.json();
            if (!data?.valid || !data?.userId) return { valid: false };
            return { valid: true, userId: data.userId, isAdmin: !!data.isAdmin };
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

        // SEC-10: state.getWebSockets() returns every live hibernating
        // connection Cloudflare is tracking for this DO — including ones
        // accepted by a previous (now-hibernated) instance of this class.
        let delivered = 0;
        for (const ws of this.state.getWebSockets()) {
            try {
                ws.send(message);
                delivered++;
            } catch {
                // Cloudflare cleans up dead sockets on its own; nothing to do here.
            }
        }
        return Response.json({ delivered });
    }

    // Hibernation callbacks — no in-memory cleanup needed (SEC-10): Cloudflare
    // removes closed/errored sockets from state.getWebSockets() automatically.
    webSocketClose(_ws: WebSocket) {}

    webSocketError(_ws: WebSocket) {}
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
            return stub.fetch(`https://do/connect?channel=${encodeURIComponent(channel)}&ticket=${encodeURIComponent(url.searchParams.get('ticket') || '')}`, request);
        }

        return new Response('Dueli Realtime — see docs/08-PUBLIC-API.md', { status: 200 });
    }
};
