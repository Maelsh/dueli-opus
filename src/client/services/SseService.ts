/**
 * @file src/client/services/SseService.ts
 * @description خدمة الأحداث الفورية (Server-Sent Events) - T2.2
 *
 * اتصال دائم بقناة المستخدم `user:<id>` عبر /api/sse
 * - إعادة اتصال تلقائية مع Last-Event-Id (يدعمها المتصفح أصلاً)
 * - Toast فوري للدعوات وقراراتها وتحديث شارة الإشعارات
 *
 * @module client/services/SseService
 */

import { State } from '../core/State';
import { Toast } from '../ui/Toast';
import { NotificationsUI } from '../ui/NotificationsUI';
import { t } from '../../i18n';

/** بيانات حدث الدعوة الواردة من السيرفر */
interface InvitePayload {
    competition_id: number;
    inviter_username?: string;
    invitee_username?: string;
    message?: string;
    accepted?: boolean;
}

export class SseService {
    private static source: EventSource | null = null;
    private static ws: WebSocket | null = null;
    private static wsRetryTimer: ReturnType<typeof setTimeout> | null = null;
    private static connectedUserId: number | null = null;
    /**
     * B3: lifecycle guard for a connect() deferred until window load.
     * - loadListenerArmed: exactly one pending load listener per connect generation.
     * - connectGeneration: invalidates a stale deferred connect after
     *   disconnect()/logout() (or a newer connect()) so it never opens a
     *   connection afterwards.
     */
    private static loadListenerArmed = false;
    private static pendingUserId: number | null = null;
    private static connectGeneration = 0;

    /** Safe window.load hook: never assumes window.addEventListener exists. */
    private static onWindowLoad(callback: () => void): boolean {
        try {
            const w = (typeof window !== 'undefined' ? (window as any) : undefined) as
                | { addEventListener?: unknown; document?: { readyState?: string } }
                | undefined;
            // jsdom/Vitest partial windows, web workers, or SSR: no functional
            // addEventListener — caller must fall back to an immediate connect
            // attempt instead of throwing (B2 regression).
            if (!w || typeof w.addEventListener !== 'function') return false;
            // Document already complete (or no document state to consult):
            // run now to avoid a listener that never fires in test envs.
            const readyState =
                (typeof document !== 'undefined' ? (document as any).readyState : undefined) ??
                w.document?.readyState;
            if (readyState === 'complete') return false;
            w.addEventListener('load', callback, { once: true });
            return true;
        } catch {
            return false;
        }
    }

    /**
     * فتح القناة اللحظية للمستخدم الحالي (تُستدعى بعد تسجيل الدخول)
     * T5.1: WebSocket (Durable Objects) أولاً عند توفر REALTIME_WS_URL، وإلا SSE.
     */
    static connect(): void {
        const user = State.currentUser as any;
        if (!user?.id) return;
        // تجنب الاتصال المزدوج لنفس المستخدم
        if ((this.source || this.ws) && this.connectedUserId === user.id) return;
        // B3: coalesce repeated pre-load connect() calls for the same pending
        // user into the single armed load listener (no duplicate listeners,
        // one EventSource). disconnect() clears pendingUserId + bumps the
        // generation, so a stale deferred connect can never fire afterwards.
        if (this.loadListenerArmed && this.pendingUserId === user.id) return;
        // B3: an already-live socket for another user is torn down first; the
        // disconnect bumps the generation so any older deferred connect below
        // becomes stale and can never fire afterwards.
        this.disconnect();

        const token = State.sessionId || '';
        this.connectedUserId = user.id;
        const generation = ++this.connectGeneration;

        const doConnect = () => {
            // Stale deferred connect (disconnect/logout or newer connect won
            // the race): never open a connection afterwards. Also clear the
            // armed flag only for the generation that owns the listener.
            if (generation !== this.connectGeneration) return;
            this.loadListenerArmed = false;
            this.pendingUserId = null;
            let wsUrl = '';
            try {
                wsUrl = (typeof window !== 'undefined' ? (window as any).REALTIME_WS_URL : '') || '';
            } catch {
                wsUrl = '';
            }
            if (wsUrl) {
                this.connectWebSocket(wsUrl, user.id, token);
            } else {
                this.connectSse(user.id, token);
            }
        };

        if (typeof document !== 'undefined' && document.readyState === 'complete') {
            doConnect();
            return;
        }
        // B3: multiple pre-load connect() calls arm exactly one load listener;
        // the guarded fallback below also covers B2 partial-window envs.
        if (!this.loadListenerArmed && this.onWindowLoad(doConnect)) {
            this.loadListenerArmed = true;
            this.pendingUserId = user.id;
            return;
        }
        doConnect();
    }

    /**
     * T5.1: قناة Durable Objects عبر Worker الوقت الحقيقي.
     * C4 (SEC-11): تذكرة أحادية 60s بدل الجلسة الخام — يستهلكها الـWorker عبر
     * POST /api/realtime/redeem عند المصافحة.
     */
    private static async connectWebSocket(wsBase: string, userId: number, token: string): Promise<void> {
        const channel = `user:${userId}`;
        let ticket = '';
        try {
            const res = await fetch('/api/realtime/ticket', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                },
                body: JSON.stringify({ channel }),
            });
            if (!res.ok) throw new Error(`ticket ${res.status}`);
            const body = await res.json() as { success: boolean; data?: { ticket: string } };
            if (!body?.success || !body?.data?.ticket) throw new Error('ticket denied');
            ticket = body.data.ticket;
        } catch (err) {
            console.error('[SseService] WS ticket mint failed, falling back to SSE:', err);
            await this.connectSse(userId, token);
            return;
        }
        try {
            const url = `${wsBase.replace(/\/+$/, '')}?channel=${encodeURIComponent(channel)}&ticket=${encodeURIComponent(ticket)}`;
            this.ws = new WebSocket(url);

            this.ws.onmessage = (ev) => {
                try {
                    const msg = JSON.parse(ev.data);
                    if (!msg.event || msg.type === 'connected') {
                        if (msg.type === 'connected') Toast.info('⚡ Realtime');
                        return;
                    }
                    this.handleEvent(msg.event, typeof msg.data === 'string' ? msg.data : JSON.stringify(msg.data ?? {}));
                } catch { /* ignore malformed */ }
            };

            this.ws.onclose = () => {
                // إعادة محاولة لطيفة — وتراجع إلى SSE إذا فشل الوكر مراراً
                this.ws = null;
                this.wsRetryTimer = setTimeout(() => {
                    const u = State.currentUser as any;
                    if (u?.id === userId && State.sessionId) {
                        if (this.wsRetryCount < 3) {
                            this.wsRetryCount++;
                            this.connectWebSocket(wsBase, userId, State.sessionId);
                        } else {
                            this.connectSse(userId, State.sessionId);
                        }
                    }
                }, 5000);
            };
        } catch (err) {
            console.error('[SseService] WS connect failed, falling back to SSE:', err);
            this.connectSse(userId, token);
        }
    }

    private static wsRetryCount: number = 0;

    /**
     * القناة الأصلية: SSE عبر تطبيق Pages.
     * C4 (SEC-11): raw session NEVER goes in the URL — mint a single-use
     * ticket (60s, bound to this user+channel) and connect with it.
     */
    private static async connectSse(userId: number, token: string): Promise<void> {
        const channel = `user:${userId}`;
        let ticket = '';
        try {
            const res = await fetch('/api/realtime/ticket', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer ' + token,
                },
                body: JSON.stringify({ channel }),
            });
            if (!res.ok) throw new Error(`ticket ${res.status}`);
            const body = await res.json() as { success: boolean; data?: { ticket: string } };
            if (!body?.success || !body?.data?.ticket) throw new Error('ticket denied');
            ticket = body.data.ticket;
        } catch (err) {
            console.error('[SseService] ticket mint failed:', err);
            return;
        }
        const url = `/api/sse?channel=${encodeURIComponent(channel)}&ticket=${encodeURIComponent(ticket)}`;
        try {
            this.source = new EventSource(url);
            this.connectedUserId = userId;

            // T5.1: موزع واحد يخدم SSE وWebSocket معاً
            for (const eventName of ['invite_sent', 'invite_accepted', 'invite_declined', 'notification', 'withdrawal_status']) {
                this.source.addEventListener(eventName, (e: MessageEvent) => {
                    this.handleEvent(eventName, e.data);
                });
            }

            this.source.onerror = () => {
                // المتصفح يعيد المحاولة تلقائياً مع Last-Event-Id
            };
        } catch (err) {
            console.error('[SseService] connect failed:', err);
        }
    }

    /**
     * T5.1: الموزع الموحد للأحداث من أي قناة
     */
    private static handleEvent(event: string, rawData: string): void {
        let payload: any = {};
        try { payload = typeof rawData === 'string' ? JSON.parse(rawData) : (rawData || {}); } catch { payload = {}; }

        switch (event) {
            case 'invite_sent': {
                const who = payload.inviter_username || '';
                Toast.info(`${who} — ${t('sse.new_invite', State.lang)}`);
                NotificationsUI.init();
                break;
            }
            case 'invite_accepted':
            case 'invite_declined': {
                const accepted = event === 'invite_accepted';
                const key = accepted ? 'sse.invite_accepted' : 'sse.invite_declined';
                const who = payload.invitee_username || '';
                Toast.show(`${who} — ${t(key, State.lang)}`, accepted ? 'success' : 'info');
                NotificationsUI.init();
                break;
            }
            case 'notification':
            case 'withdrawal_status':
                NotificationsUI.init();
                break;
        }
    }

    /**
     * إغلاق القناة (عند الخروج أو تغيير المستخدم)
     */
    static disconnect(): void {
        // B3: invalidate any deferred pre-load connect() so it can never open
        // a connection after this disconnect/logout, then release the armed
        // load listener slot for the next generation.
        this.connectGeneration++;
        this.loadListenerArmed = false;
        this.pendingUserId = null;
        if (this.wsRetryTimer) { clearTimeout(this.wsRetryTimer); this.wsRetryTimer = null; }
        if (this.source) {
            try { this.source.close(); } catch { /* ignore */ }
            this.source = null;
        }
        if (this.ws) {
            try { this.ws.close(); } catch { /* ignore */ }
            this.ws = null;
        }
        this.connectedUserId = null;
        this.wsRetryCount = 0;
    }
}

export default SseService;
