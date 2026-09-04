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
     * فتح القناة اللحظية للمستخدم الحالي (تُستدعى بعد تسجيل الدخول)
     * T5.1: WebSocket (Durable Objects) أولاً عند توفر REALTIME_WS_URL، وإلا SSE.
     */
    static connect(): void {
        const user = State.currentUser as any;
        if (!user?.id) return;
        // تجنب الاتصال المزدوج لنفس المستخدم
        if ((this.source || this.ws) && this.connectedUserId === user.id) return;
        this.disconnect();

        const token = State.sessionId || '';
        this.connectedUserId = user.id;

        const wsUrl = (window as any).REALTIME_WS_URL || '';
        if (wsUrl) {
            this.connectWebSocket(wsUrl, user.id, token);
        } else {
            this.connectSse(user.id, token);
        }
    }

    /** T5.1: قناة Durable Objects عبر Worker الوقت الحقيقي */
    private static connectWebSocket(wsBase: string, userId: number, token: string): void {
        try {
            const url = `${wsBase.replace(/\/+$/, '')}?channel=user:${userId}&token=${encodeURIComponent(token)}`;
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

    /** القناة الأصلية: SSE عبر تطبيق Pages */
    private static connectSse(userId: number, token: string): void {
        const url = `/api/sse?channel=user:${userId}&token=${encodeURIComponent(token)}`;
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
