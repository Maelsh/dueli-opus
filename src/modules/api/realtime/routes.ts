/**
 * @file src/modules/api/realtime/routes.ts
 * @description SSE connection tickets (C4 — SEC-11 docs/12-SECURITY-REMEDIATION.md)
 *
 * EventSource cannot send Authorization headers, so clients used to put the raw
 * session in `?token=` — leaking it into logs, history and Referer. Instead:
 *
 *   POST /api/realtime/ticket  (normal Bearer/cookie auth)  { channel }
 *     ⇒ { ticket, expires_in } — 60s, single-use, bound to (user, channel)
 *
 *   GET /api/sse?channel=<ch>&ticket=<ticket>
 *
 * A ticket reveals nothing about the session and dies on first use.
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';
import { RealtimeTicketService, REALTIME_TICKET_TTL_SECONDS } from '../../../lib/services/RealtimeTicketService';

const realtimeRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const CHANNEL_RE = /^(competition:\d+|user:\d+|global)$/;

realtimeRoutes.post('/ticket', authMiddleware({ required: true }), async (c) => {
    const user = c.get('user');
    if (!user) {
        return c.json({ success: false, error: 'Authentication required' }, 401);
    }
    let channel = '';
    try {
        const body = await c.req.json();
        channel = typeof body?.channel === 'string' ? body.channel : '';
    } catch {
        return c.json({ success: false, error: 'Invalid JSON body' }, 400);
    }

    if (!CHANNEL_RE.test(channel)) {
        return c.json({ success: false, error: 'Invalid channel' }, 400);
    }

    // user: channels are private — bind only to self (admins may subscribe for moderation).
    if (channel.startsWith('user:')) {
        const target = parseInt(channel.split(':')[1] || '0', 10);
        if (target !== user.id && !user.is_admin) {
            return c.json({ success: false, error: 'Forbidden' }, 403);
        }
    }

    const service = new RealtimeTicketService(c.env.DB);
    const { ticket } = await service.mint(user.id, channel);
    return c.json({ success: true, data: { ticket, expires_in: REALTIME_TICKET_TTL_SECONDS } });
});

/**
 * POST /api/realtime/redeem — worker-only ticket redemption (C4 WS path).
 *
 * The Durable Objects worker cannot touch D1, so it redeems handshake tickets
 * through this endpoint, gated by the shared REALTIME_PUBLISH_SECRET
 * (X-Publish-Secret header — the same secret as /publish). Never exposed to
 * browsers; the response carries no session secret.
 */
realtimeRoutes.post('/redeem', async (c) => {
    const secret = c.env.REALTIME_PUBLISH_SECRET as string | undefined;
    if (!secret) {
        return c.json({ valid: false, error: 'Realtime auth not configured' }, 503);
    }
    const provided = c.req.header('X-Publish-Secret') || '';
    if (!provided || provided !== secret) {
        return c.json({ valid: false, error: 'Forbidden' }, 403);
    }

    let ticket = '';
    let channel = '';
    try {
        const body = await c.req.json();
        ticket = typeof body?.ticket === 'string' ? body.ticket : '';
        channel = typeof body?.channel === 'string' ? body.channel : '';
    } catch {
        return c.json({ valid: false, error: 'Invalid JSON body' }, 400);
    }
    if (!ticket || !channel) {
        return c.json({ valid: false, error: 'ticket and channel required' }, 400);
    }

    const userId = await new RealtimeTicketService(c.env.DB).redeem(ticket, channel);
    if (userId === null) {
        return c.json({ valid: false }, 401);
    }
    const user = await c.env.DB.prepare(
        'SELECT id, is_admin FROM users WHERE id = ?'
    ).bind(userId).first<{ id: number; is_admin: number }>();
    if (!user) {
        return c.json({ valid: false }, 401);
    }
    return c.json({ valid: true, userId: user.id, isAdmin: !!user.is_admin });
});

export default realtimeRoutes;
