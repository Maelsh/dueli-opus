/**
 * Signaling Routes for WebRTC P2P
 * مسارات الإشارات لاتصال WebRTC
 *
 * Room create/verify are handled here by the platform. The actual
 * join/signal/poll/leave exchange happens directly between the browser and
 * the dedicated signaling server (HTTP polling via a Cloudflare Worker +
 * Durable Object per competition room) at the URL in STREAMING_URL /
 * DEFAULT_STREAMING_URL — see src/modules/pages/live/scripts/client/shared.ts
 * (SignalingManager class) for the client-side polling implementation.
 */

import { Hono } from 'hono';
import type { Bindings, Variables, Language } from '../../../config/types';
import { DEFAULT_STREAMING_URL } from '../../../config/defaults';
import { t } from '../../../i18n';
import { authMiddleware } from '../../../middleware/auth';
import { SessionModel } from '../../../models/SessionModel';
import { SignalingAuthService, type SignalingRole } from '../../../lib/services/SignalingAuthService';
import { SseEventLogModel } from '../../../models/SseEventLogModel';

const signalingRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// 7.A: platform-authored signaling exchange. Requires session auth; the
// per-request role is re-derived server-side in SignalingAuthService (never
// trusted from the client). Existing unauthenticated helper endpoints
// (ice-servers/config/verify/room-create) keep their current contract.
signalingRoutes.use('/offer', authMiddleware({ required: true }));
signalingRoutes.use('/answer', authMiddleware({ required: true }));
signalingRoutes.use('/ice', authMiddleware({ required: true }));
signalingRoutes.use('/poll', authMiddleware({ required: true }));

/** Max signaling payload (SDP / ICE) accepted per request — abuse cap, not a protocol limit. */
const MAX_SIGNAL_PAYLOAD_CHARS = 20000;

type SignalKind = 'offer' | 'answer' | 'ice';

/**
 * Shared handler for POST /api/signaling/{offer,answer,ice} + poll reads.
 * POST: authorize → role-match → persist to the EXISTING sse_event_log table
 * (channel `signaling:<competitionId>`, event `signal_offer|signal_answer|signal_ice`).
 * GET (poll): authorize → read back events after `since` id for the peer.
 * No new storage, no new auth layer — reuses SessionModel/authMiddleware,
 * SignalingAuthService, and SseEventLogModel/EventPusher infra.
 */
async function handleSignal(
    c: any,
    kind: SignalKind | 'poll',
    body: { competition_id?: unknown; role?: unknown; payload?: unknown; since?: unknown }
): Promise<Response> {
    const lang = (c.get('lang') || 'en') as Language;
    const user = c.get('user');
    const competitionId = Number(body.competition_id);
    const claimedRole = typeof body.role === 'string' ? body.role : undefined;

    const auth = new SignalingAuthService(c.env.DB);
    let gate;
    try {
        gate = await auth.authorize(user ? user.id : null, competitionId, claimedRole);
    } catch {
        // DB/transport failure → 502, never an authorization success.
        return c.json({ success: false, error: t('errors.service_unavailable', lang) }, 502);
    }
    if (!gate.ok) {
        const key =
            gate.code === 401 ? 'login_required'
            : gate.code === 409 ? 'competition_errors.not_eligible_to_start'
            : 'forbidden';
        return c.json({ success: false, error: t(key, lang), code: gate.error }, gate.code as 401 | 403 | 409);
    }

    // Direction guard: only host sends offers, only guest sends answers.
    // ICE flows both ways. Spoofed direction → 403.
    if (kind === 'offer' && gate.role !== 'host') {
        return c.json({ success: false, error: t('forbidden', lang), code: 'role_mismatch' }, 403);
    }
    if (kind === 'answer' && gate.role !== 'guest') {
        return c.json({ success: false, error: t('forbidden', lang), code: 'role_mismatch' }, 403);
    }

    const channel = `signaling:${gate.competitionId}`;
    const model = new SseEventLogModel(c.env.DB);

    if (kind === 'poll') {
        const since = Number(body.since ?? 0);
        const events = await model.getAfter(channel, Number.isFinite(since) && since > 0 ? since : 0, 50);
        return c.json({
            success: true,
            data: {
                role: gate.role,
                competition_id: gate.competitionId,
                // Peer-visible signals only (offer↔answer, both ICE directions).
                signals: events.map((e) => ({
                    id: e.id,
                    type: e.event_type.replace('signal_', ''),
                    payload: JSON.parse(e.payload).payload ?? null,
                    from: JSON.parse(e.payload).from ?? null,
                })),
            },
        });
    }

    const payloadText = typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload ?? null);
    if (payloadText.length > MAX_SIGNAL_PAYLOAD_CHARS) {
        return c.json({ success: false, error: t('errors.content_too_long', lang) }, 413);
    }
    if (kind !== 'ice' && payloadText.length < 2) {
        return c.json({ success: false, error: t('errors.missing_fields', lang) }, 400);
    }

    const eventType = kind === 'offer' ? 'signal_offer' : kind === 'answer' ? 'signal_answer' : 'signal_ice';
    let row;
    try {
        row = await model.publish(channel, eventType, {
            competition_id: gate.competitionId,
            from: gate.role,
            payload: body.payload ?? null,
        });
    } catch {
        return c.json({ success: false, error: t('errors.service_unavailable', lang) }, 502);
    }

    return c.json({
        success: true,
        data: { id: row.id, role: gate.role satisfies SignalingRole, competition_id: gate.competitionId },
    });
}


/**
 * Fetch short-lived Cloudflare Calls TURN/STUN credentials.
 * تجلب بيانات اعتماد TURN/STUN قصيرة العمر من Cloudflare Calls
 *
 * Endpoint: POST /v1/turn/keys/{TURN_TOKEN_ID}/credentials/generate-ice-servers
 * The API token is a secret stored in env; the result is cached in the
 * Cloudflare Cache API for ~6h to avoid hammering the API on every request.
 */
async function fetchCloudflareIceServers(env: {
    TURN_TOKEN_ID?: string;
    TURN_API_TOKEN?: string;
}): Promise<{ iceServers: RTCIceServer[] }> {
    const tokenId = env.TURN_TOKEN_ID;
    const apiToken = env.TURN_API_TOKEN;

    if (!tokenId || !apiToken) {
        return { iceServers: [] };
    }

    const cacheKey = new Request(`https://rtc.live.cloudflare.com/turn-key/${tokenId}`);
    // NOTE: tsconfig's "DOM" lib shadows @cloudflare/workers-types' CacheStorage.default
    // typing, so `caches` is cast to any here — this still runs against the real Workers
    // Cache API at runtime (Pages/Workers only, unrelated to the DOM lib's browser types).
    const workerCaches: any = caches;

    // Serve from cache when available
    try {
        const cached = await workerCaches.default.match(cacheKey);
        if (cached) {
            const body = await cached.json() as { iceServers: RTCIceServer[] };
            if (body && Array.isArray(body.iceServers)) {
                return body;
            }
        }
    } catch {
        // Cache read failed - fall through to fetch
    }

    const res = await fetch(
        `https://rtc.live.cloudflare.com/v1/turn/keys/${tokenId}/credentials/generate-ice-servers`,
        {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiToken}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ttl: 86400 })
        }
    );

    if (!res.ok) {
        console.error('Cloudflare TURN API error:', res.status, await res.text());
        return { iceServers: [] };
    }

    const body = await res.json<{ iceServers: RTCIceServer[] }>();

    // Cache for ~6h (credential TTL is 24h, so this stays valid with margin)
    try {
        await workerCaches.default.put(
            cacheKey,
            new Response(JSON.stringify(body), {
                headers: { 'Cache-Control': 'public, max-age=21600' }
            })
        );
    } catch {
        // Caching is best-effort
    }

    return body;
}

/**
 * GET /api/signaling/ice-servers
 * Returns TURN/STUN server configuration with dynamic credentials
 * يُرجع إعدادات خوادم TURN/STUN مع بيانات اعتماد ديناميكية
 */
signalingRoutes.get('/ice-servers', async (c) => {
    const { iceServers } = await fetchCloudflareIceServers(c.env);

    // If Cloudflare Calls is not configured, fall back to STUN-only servers
    const result: RTCIceServer[] = iceServers.length > 0 ? iceServers : [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' }
    ];

    return c.json({
        success: true,
        data: { iceServers: result }
    });
});

/**
 * GET /api/signaling/config
 * Returns signaling configuration for clients
 * يُرجع إعدادات الإشارات للعملاء
 *
 * NOTE: not currently called by the host/guest client scripts (they build
 * signalingUrl/roomId themselves from STREAM_SERVER_URL + TEST_ROOM_ID /
 * competition id — see scripts/client/host.ts + guest.ts). Kept for any
 * external/future client that wants to discover signaling config via API.
 */
signalingRoutes.get('/config', async (c) => {
    const competition_id = c.req.query('competition_id');
    const room_id = c.req.query('room_id') || `comp_${competition_id}`;

    // Get signaling server URL from env or defaults (HTTP-polling Worker)
    const streamingUrl = c.env.STREAMING_URL || DEFAULT_STREAMING_URL;

    return c.json({
        success: true,
        data: {
            room_id,
            mode: 'http-polling',
            signaling_url: streamingUrl,
            ice_servers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun.cloudflare.com:3478' },
            ]
        }
    });
});

/**
 * POST /api/signaling/verify
 * Verify that a user is allowed to join this competition's signaling
 * التحقق من أن المستخدم مسموح له بالانضمام لإشارات هذه المنافسة
 * 
 * Called by external signaling server to validate participants
 * يُستدعى من سيرفر الإشارات الخارجي للتحقق من المشاركين
 */
signalingRoutes.post('/verify', async (c) => {
    const { DB } = c.env;

    try {
        const body = await c.req.json();
        const { session_token, competition_id, claimed_role } = body;

        if (!session_token || !competition_id || !claimed_role) {
            return c.json({
                valid: false,
                error: 'Missing session_token, competition_id, or claimed_role'
            }, 400);
        }

        // 7.A correction: SignalingAuthService is the SOLE authority.
        // No duplicated SQL/authorization below this point.
        const sessionModel = new SessionModel(DB);
        const found = await sessionModel.findValidSession(session_token);
        if (!found) {
            return c.json({ valid: false, error: 'invalid_session' }, 401);
        }
        const normalizedClaim = claimed_role === 'opponent' ? 'guest' : claimed_role;
        const auth = new SignalingAuthService(DB);
        const gate = await auth.authorize(found.user.id, Number(competition_id), normalizedClaim);
        if (!gate.ok) {
            const status = gate.code === 401 ? 401 : gate.code === 409 ? 409 : 403;
            const error =
                gate.error === 'competition_not_eligible' ? 'competition_not_active'
                : gate.error === 'role_mismatch' ? 'role_mismatch'
                : 'not_participant';
            return c.json({ valid: false, error }, status);
        }

        // Success — role/eligibility already decided by the service above.
        return c.json({
            valid: true,
            data: {
                user_id: found.user.id,
                username: found.user.username,
                display_name: found.user.display_name,
                role: gate.role,
                competition_id: gate.competitionId
            }
        });

    } catch (error: any) {
        console.error('Signaling verify error:', error);
        return c.json({ valid: false, error: error.message }, 500);
    }
});

/**
 * POST /api/signaling/room/create
 * Create a room on the streaming server
 * إنشاء غرفة على سيरفر البث
 *
 * 7.A correction: room creation is HOST-ONLY. Guest/non-participant → 403,
 * ineligible competition → 409; the forward to the external streaming server
 * is unchanged. A forward failure is a transport error (502), never an
 * authorization success.
 */
signalingRoutes.post('/room/create', authMiddleware({ required: true }), async (c) => {
    const lang = (c.get('lang') || 'en') as Language;

    try {
        const body = await c.req.json();
        const { competition_id } = body;

        if (!competition_id) {
            return c.json({
                success: false,
                error: t('errors.missing_parameters', lang)
            }, 400);
        }

        // 7.A correction: derive authority server-side; room creation is HOST-ONLY.
        const user = c.get('user');
        const gate = await new SignalingAuthService(c.env.DB).authorize(
            user ? user.id : null, Number(competition_id)
        );
        if (!gate.ok) {
            const key =
                gate.code === 401 ? 'login_required'
                : gate.code === 409 ? 'competition_errors.not_eligible_to_start'
                : 'forbidden';
            return c.json({ success: false, error: t(key, lang), code: gate.error }, gate.code as 401 | 403 | 409);
        }
        if (gate.role !== 'host') {
            return c.json({ success: false, error: t('forbidden', lang), code: 'role_mismatch' }, 403);
        }

        // Get streaming server URL
        const streamingUrl = c.env.STREAMING_URL || DEFAULT_STREAMING_URL;
        const roomId = `comp_${competition_id}`;

        // Forward to streaming server
        let response: Response;
        try {
            response = await fetch(`${streamingUrl}/api/signaling/room/create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ competition_id })
            });
        } catch {
            return c.json({ success: false, error: t('errors.service_unavailable', lang) }, 502);
        }
        if (!response.ok) {
            return c.json({ success: false, error: t('errors.service_unavailable', lang) }, 502);
        }

        const data = await response.json() as Record<string, unknown>;

        return c.json({
            success: true,
            data: {
                room_id: roomId,
                signaling_url: `${streamingUrl.replace('https://', 'wss://')}/signaling?room=${roomId}`,
                ...(typeof data === 'object' && data !== null ? data : {})
            }
        });

    } catch (error) {
        console.error('Error creating room:', error);
        return c.json({
            success: false,
            error: 'Failed to create room'
        }, 500);
    }
});

/**
 * POST /api/signaling/offer — host publishes an SDP offer (7.A, auth required).
 * POST /api/signaling/answer — guest publishes an SDP answer (7.A, auth required).
 * POST /api/signaling/ice — either participant publishes an ICE candidate (7.A).
 * GET  /api/signaling/poll?competition_id=&since= — participant reads peer signals.
 *
 * All four re-derive the role server-side via SignalingAuthService and persist
 * to / read from the EXISTING sse_event_log table (no new storage).
 */
signalingRoutes.post('/offer', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return handleSignal(c, 'offer', body);
});

signalingRoutes.post('/answer', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return handleSignal(c, 'answer', body);
});

signalingRoutes.post('/ice', async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return handleSignal(c, 'ice', body);
});

signalingRoutes.get('/poll', async (c) => {
    return handleSignal(c, 'poll', {
        competition_id: c.req.query('competition_id'),
        role: c.req.query('role'),
        since: c.req.query('since'),
    });
});

export default signalingRoutes;
