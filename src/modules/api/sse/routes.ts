/**
 * @file src/modules/api/sse/routes.ts
 * @description Central Server-Sent Events (SSE) endpoint (Task 9)
 *              نقطة نهاية SSE المركزية للأحداث الفورية
 *
 * Clients connect via:
 *   GET /api/sse?channel=competition:42   (live comment feed)
 *   GET /api/sse?channel=user:7           (personal notification channel)
 *   GET /api/sse?channel=global           (platform-wide events)
 *
 * Reconnect:
 *   Client sends "Last-Event-Id" header → server replays missed events.
 *
 * @module api/sse
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';
import { EventPusher } from '../../../lib/services/EventPusher';

const sseRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Optional auth – user channels require it; competition channels are public
sseRoutes.use('*', authMiddleware({ required: false }));

/**
 * GET /api/sse
 * Establishes an SSE stream for the given channel.
 *
 * Query params:
 *   channel   – Required. One of: competition:<id>, user:<id>, global
 *   heartbeat – Optional. Interval in seconds (default: 25)
 */
sseRoutes.get('/', async (c) => {
    const channel   = c.req.query('channel') || '';
    const user      = c.get('user');

    // Validate channel
    if (!channel) {
        return c.json({ error: 'channel parameter required' }, 400);
    }

    // User channels require authentication
    if (channel.startsWith('user:') && !user) {
        return c.json({ error: 'Authentication required for user channels' }, 401);
    }

    // Protect user channel from cross-user snooping
    if (channel.startsWith('user:') && user) {
        const targetUserId = parseInt(channel.split(':')[1] || '0', 10);
        if (targetUserId !== user.id && !user.is_admin) {
            return c.json({ error: 'Forbidden' }, 403);
        }
    }

    const lastEventIdHeader = c.req.header('Last-Event-Id');
    const lastEventId       = lastEventIdHeader ? parseInt(lastEventIdHeader, 10) : 0;
    const pusher            = new EventPusher(c.env.DB);
    const HEARTBEAT_MS      = 25_000; // 25 seconds

    // Cloudflare Workers ReadableStream SSE pattern
    const stream = new ReadableStream({
        async start(controller) {
            const encoder = new TextEncoder();

            const enqueue = (chunk: string) => {
                try {
                    controller.enqueue(encoder.encode(chunk));
                } catch {
                    // Stream closed
                }
            };

            // Send initial connection confirmation
            enqueue(`: connected to channel=${channel}\n\n`);

            // Replay missed events (reconnect support)
            if (lastEventId > 0) {
                const catchUp = await pusher.getCatchUp(channel, lastEventId);
                if (catchUp) enqueue(catchUp);
            }

            // Poll for new events every 2 seconds
            // (In a Durable Objects setup this would be a push; here we use
            //  a polling loop backed by the D1 event log.)
            let latestId = lastEventId;
            let pollCount = 0;
            const MAX_POLLS = 1500; // ~50 minutes at 2s intervals

            const poll = async () => {
                if (pollCount++ >= MAX_POLLS) {
                    // Send reconnect hint and close
                    enqueue(`: reconnect\n\n`);
                    controller.close();
                    return;
                }

                try {
                    const events = await new (await import('../../../models/SseEventLogModel').then(m => m.SseEventLogModel))(c.env.DB)
                        .getAfter(channel, latestId, 20);

                    for (const event of events) {
                        enqueue(EventPusher.formatSseMessage(
                            event.id,
                            event.event_type,
                            JSON.parse(event.payload)
                        ));
                        latestId = event.id;
                    }

                    // Heartbeat
                    if (pollCount % Math.floor(HEARTBEAT_MS / 2000) === 0) {
                        enqueue(EventPusher.heartbeat());
                    }
                } catch {
                    // DB error – send heartbeat and continue
                    enqueue(EventPusher.heartbeat());
                }

                // Schedule next poll (non-blocking in Cloudflare Workers via setTimeout)
                // Note: Cloudflare Workers support setTimeout within ReadableStream start()
                setTimeout(poll, 2000);
            };

            // Start polling
            setTimeout(poll, 500);
        }
    });

    return new Response(stream, {
        headers: {
            'Content-Type':                'text/event-stream',
            'Cache-Control':               'no-cache, no-store',
            'Connection':                  'keep-alive',
            'X-Accel-Buffering':           'no',   // Disable nginx buffering
            'Access-Control-Allow-Origin': '*'
        }
    });
});

export default sseRoutes;
