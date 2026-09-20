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
import {
    SignalingAuthService,
    type SignalingAccessResult,
    type SignalingRole,
    type SignalingSignalKind,
} from '../../../lib/services/SignalingAuthService';
import { SignalingSessionService, type SignalingSessionState } from '../../../lib/services/SignalingSessionService';
import { SignalingReconnectService } from '../../../lib/services/SignalingReconnectService';
import { SseEventLogModel, type SseEventLog } from '../../../models/SseEventLogModel';

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

/** 7.B signal kinds published on the existing channel. */
type SignalKind = SignalingSignalKind;

const SIGNAL_EVENT_TYPES: Record<SignalKind, SseEventLog['event_type']> = {
    offer: 'signal_offer',
    answer: 'signal_answer',
    ice: 'signal_ice',
    request_offer: 'signal_request_offer',
};

const SIGNAL_EVENT_KINDS: Record<string, SignalKind> = {
    signal_offer: 'offer',
    signal_answer: 'answer',
    signal_ice: 'ice',
    signal_request_offer: 'request_offer',
};

/** Localized HTTP failure mapping shared by every signaling handler. */
function accessFailure(c: any, gate: Extract<SignalingAccessResult, { ok: false }>, lang: Language): Response {
    const key =
        gate.code === 401 ? 'login_required'
        : gate.code === 409 ? 'competition_errors.not_eligible_to_start'
        : 'forbidden';
    return c.json({ success: false, error: t(key, lang), code: gate.error }, gate.code as 401 | 403 | 409);
}

/** Store/transport failure must never look like an authorization success. */
function serviceUnavailable(c: any, lang: Language): Response {
    return c.json({ success: false, error: t('errors.service_unavailable', lang) }, 502);
}

/**
 * 7.B: resolve the target peer of a signal — server-side, per role.
 *  - host  → null (broadcast to participants) | 'guest' | 'viewer:<userId>'
 *  - guest → null | 'host'
 *  - viewer → REQUIRED, participant target only ('host' | 'guest')
 * A client can never retarget a signal outside its role's reach.
 */
function resolveTarget(
    kind: SignalKind,
    role: 'host' | 'guest' | 'viewer',
    rawTo: unknown
): { ok: true; to: string | null } | { ok: false; reason: 'invalid' | 'required' } {
    const to = typeof rawTo === 'string' && rawTo.length > 0 ? rawTo : null;
    if (role === 'viewer') {
        if (to === null) return { ok: false, reason: 'required' };
        return SignalingAuthService.isParticipantPeer(to)
            ? { ok: true, to }
            : { ok: false, reason: 'invalid' };
    }
    if (to === null) return { ok: true, to: null };
    if (role === 'guest') {
        // The guest answers the host (broadcast = legacy 7.A behaviour).
        return to === 'host' ? { ok: true, to } : { ok: false, reason: 'invalid' };
    }
    // host: participant broadcast, guest target, or a present viewer peer.
    if (to === 'guest') return { ok: true, to };
    if (SignalingAuthService.isViewerPeer(to) && (kind === 'offer' || kind === 'ice')) {
        return { ok: true, to };
    }
    return { ok: false, reason: 'invalid' };
}

function parseEventPayload(event: SseEventLog): Record<string, any> | null {
    try {
        const parsed = JSON.parse(event.payload);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : null;
    } catch {
        return null;
    }
}

/**
 * Map persisted signal events to the peer-visible shape.
 * Presence events (session_join/leave) are never returned as signals, and a
 * signal is only visible to (a) participants for broadcast/participant
 * targets, or (b) the exact viewer peer it is addressed to.
 */
function visibleSignals(events: SseEventLog[], targetPeer: string | null, ownPeer: string) {
    const out: Array<{ id: number; type: SignalKind | string; payload: unknown; from: string | null; peer: string | null; to: string | null }> = [];
    for (const event of events) {
        const kind = SIGNAL_EVENT_KINDS[event.event_type];
        if (!kind) continue;
        const body = parseEventPayload(event);
        const from = typeof body?.from === 'string' ? body.from : null;
        const peer = typeof body?.peer === 'string' ? body.peer : from;
        const to = typeof body?.to === 'string' ? body.to : null;
        if (targetPeer !== null) {
            // viewer view: only signals addressed to this exact peer
            if (to !== targetPeer) continue;
        } else if (to !== null && to !== ownPeer) {
            // participant view: broadcast + own-peer signals only
            continue;
        }
        out.push({ id: event.id, type: kind, payload: body?.payload ?? null, from, peer, to });
    }
    return out;
}

/**
 * Shared handler for POST /api/signaling/{offer,answer,ice,request-offer} + poll reads.
 * POST: authorize → capability matrix → target resolution → persist to the EXISTING
 * sse_event_log table (channel `signaling:<competitionId>`).
 * GET (poll): participant-only — authorize → read back peer-visible signals.
 * No new storage, no new auth layer — reuses SessionModel/authMiddleware,
 * SignalingAuthService, and SseEventLogModel/EventPusher infra.
 */
async function handleSignal(
    c: any,
    kind: SignalKind | 'poll',
    body: { competition_id?: unknown; role?: unknown; payload?: unknown; since?: unknown; to?: unknown }
): Promise<Response> {
    const lang = (c.get('lang') || 'en') as Language;
    const user = c.get('user');
    const competitionId = Number(body.competition_id);
    const claimedRole = typeof body.role === 'string' ? body.role : undefined;

    const auth = new SignalingAuthService(c.env.DB);
    let gate: SignalingAccessResult;
    try {
        gate = await auth.authorizeViewer(user ? user.id : null, competitionId, claimedRole);
    } catch {
        // DB/transport failure → 502, never an authorization success.
        return serviceUnavailable(c, lang);
    }
    if (!gate.ok) {
        return accessFailure(c, gate, lang);
    }
    // 7.A boundary: reading the participant signal stream stays participant-only.
    // Viewers use GET /api/signaling/viewer/poll instead (their publishes are
    // decided by the capability matrix below).
    if (kind === 'poll' && gate.role === 'viewer') {
        return c.json({ success: false, error: t('forbidden', lang), code: 'participant_required' }, 403);
    }

    const channel = SignalingSessionService.channelFor(gate.competitionId);
    const model = new SseEventLogModel(c.env.DB);

    if (kind === 'poll') {
        const since = Number(body.since ?? 0);
        let events: SseEventLog[];
        try {
            events = await model.getAfter(channel, Number.isFinite(since) && since > 0 ? since : 0, 50);
        } catch {
            return serviceUnavailable(c, lang);
        }
        return c.json({
            success: true,
            data: {
                role: gate.role,
                peer: gate.peer,
                competition_id: gate.competitionId,
                signals: visibleSignals(events, null, gate.peer),
            },
        });
    }

    // 7.B capability matrix: viewers are receive-only peers (they may answer an
    // offer + exchange ICE, but can never offer as a participant).
    if (!SignalingAuthService.canPublish(gate.role, kind)) {
        return c.json({ success: false, error: t('forbidden', lang), code: 'role_mismatch' }, 403);
    }

    const target = resolveTarget(kind, gate.role, body.to);
    if (!target.ok) {
        if (target.reason === 'required') {
            return c.json({ success: false, error: t('errors.missing_fields', lang), code: 'target_required' }, 400);
        }
        return c.json({ success: false, error: t('forbidden', lang), code: 'invalid_target' }, 403);
    }

    // A host may only address viewers that are actually present in this
    // session — never arbitrary or foreign user ids.
    if (SignalingAuthService.isViewerPeer(target.to)) {
        try {
            const presence = await new SignalingSessionService(c.env.DB).getPresence(gate.competitionId);
            if (!presence.viewers.includes(target.to)) {
                return c.json({ success: false, error: t('forbidden', lang), code: 'target_not_present' }, 403);
            }
        } catch {
            return serviceUnavailable(c, lang);
        }
    }

    const payloadText = typeof body.payload === 'string' ? body.payload : JSON.stringify(body.payload ?? null);
    if (payloadText.length > MAX_SIGNAL_PAYLOAD_CHARS) {
        return c.json({ success: false, error: t('errors.content_too_long', lang) }, 413);
    }
    if (kind !== 'ice' && kind !== 'request_offer' && payloadText.length < 2) {
        return c.json({ success: false, error: t('errors.missing_fields', lang) }, 400);
    }

    let row: SseEventLog;
    try {
        row = await model.publish(channel, SIGNAL_EVENT_TYPES[kind], {
            competition_id: gate.competitionId,
            from: gate.role,
            peer: gate.peer,
            to: target.to,
            payload: body.payload ?? null,
        });
    } catch {
        return serviceUnavailable(c, lang);
    }

    return c.json({
        success: true,
        data: {
            id: row.id,
            role: gate.role satisfies SignalingRole | 'viewer',
            peer: gate.peer,
            to: target.to,
            competition_id: gate.competitionId,
        },
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

/** Wire shape (snake_case, like every other API payload) for session state. */
function sessionPayload(state: SignalingSessionState) {
    return {
        competition_id: state.competitionId,
        role: state.role,
        peer: state.peer,
        live: state.live,
        competition_status: state.competitionStatus,
        started_at: state.startedAt,
        presence: {
            host: state.presence.host,
            guest: state.presence.guest,
            viewers: state.presence.viewers,
            viewer_count: state.presence.viewerCount,
            last_event_id: state.presence.lastEventId,
        },
        presence_ttl_seconds: state.presenceTtlSeconds,
        last_event_id: state.lastEventId,
    };
}

/**
 * 7.B: live session discovery/state + presence (late join).
 * GET  /api/signaling/session?competition_id=&claimed_role= — read-only state.
 * POST /api/signaling/session/join   — announce presence (also the heartbeat).
 * POST /api/signaling/session/leave  — announce departure.
 *
 * Authorization is the same single authority (`authorizeViewer`): host/guest
 * for a participant, `viewer` for any authenticated user while the session is
 * live, 401/403/409 otherwise. Announcing presence never touches an existing
 * peer connection.
 */
async function handleSession(c: any, action: 'describe' | 'join' | 'leave'): Promise<Response> {
    const lang = (c.get('lang') || 'en') as Language;
    const user = c.get('user');

    let competitionIdRaw: unknown;
    let claimedRole: string | undefined;
    if (action === 'describe') {
        competitionIdRaw = c.req.query('competition_id');
        const claim = c.req.query('claimed_role') ?? c.req.query('role');
        claimedRole = typeof claim === 'string' ? claim : undefined;
    } else {
        const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
        competitionIdRaw = (body as Record<string, unknown>).competition_id;
        const claim = (body as Record<string, unknown>).claimed_role ?? (body as Record<string, unknown>).role;
        claimedRole = typeof claim === 'string' ? claim : undefined;
    }

    const auth = new SignalingAuthService(c.env.DB);
    let gate: SignalingAccessResult;
    try {
        gate = await auth.authorizeViewer(user ? user.id : null, Number(competitionIdRaw), claimedRole);
    } catch {
        return serviceUnavailable(c, lang);
    }
    if (!gate.ok) {
        return accessFailure(c, gate, lang);
    }

    const sessions = new SignalingSessionService(c.env.DB);
    try {
        if (action === 'describe') {
            return c.json({ success: true, data: sessionPayload(await sessions.describe(gate)) });
        }
        const { eventId, state } = await sessions.announce(gate, action);
        return c.json({ success: true, data: { ...sessionPayload(state), action, event_id: eventId } });
    } catch {
        return serviceUnavailable(c, lang);
    }
}

/**
 * GET /api/signaling/viewer/poll?competition_id=&since=
 * Viewer-only read of the signals addressed to this exact viewer peer.
 * Participants keep using /poll; a viewer can never read participant traffic.
 */
signalingRoutes.get('/viewer/poll', authMiddleware({ required: true }), async (c) => {
    const lang = (c.get('lang') || 'en') as Language;
    const user = c.get('user');

    const auth = new SignalingAuthService(c.env.DB);
    let gate: SignalingAccessResult;
    try {
        gate = await auth.authorizeViewer(user ? user.id : null, Number(c.req.query('competition_id')), c.req.query('claimed_role') ?? undefined);
    } catch {
        return serviceUnavailable(c, lang);
    }
    if (!gate.ok) {
        return accessFailure(c, gate, lang);
    }
    if (gate.role !== 'viewer') {
        return c.json({ success: false, error: t('forbidden', lang), code: 'viewer_required' }, 403);
    }

    const since = Number(c.req.query('since') ?? 0);
    let events: SseEventLog[];
    try {
        events = await new SseEventLogModel(c.env.DB).getAfter(
            SignalingSessionService.channelFor(gate.competitionId),
            Number.isFinite(since) && since > 0 ? since : 0,
            50
        );
    } catch {
        return serviceUnavailable(c, lang);
    }

    return c.json({
        success: true,
        data: {
            role: gate.role,
            peer: gate.peer,
            competition_id: gate.competitionId,
            signals: visibleSignals(events, gate.peer, gate.peer),
        },
    });
});

/**
 * 7.C: POST /api/signaling/reconnect — bounded recovery after a WebRTC or
 * signaling/network interruption. Authorization is the SAME single authority
 * (`authorizeViewer`): role/peer are re-derived server-side, so a reconnect
 * can never change host/guest/viewer or spoof an identity. The handler only
 * re-announces presence (heartbeat refresh) via SignalingReconnectService and
 * returns the session state + retry bounds — no peer connection is touched.
 */
signalingRoutes.post('/reconnect', authMiddleware({ required: true }), async (c) => {
    const lang = (c.get('lang') || 'en') as Language;
    const user = c.get('user');
    const body = await c.req.json().catch(() => ({} as Record<string, unknown>));
    const raw = body as Record<string, unknown>;
    const claim = raw.claimed_role ?? raw.role;
    const claimedRole = typeof claim === 'string' ? claim : undefined;

    const auth = new SignalingAuthService(c.env.DB);
    let gate: SignalingAccessResult;
    try {
        gate = await auth.authorizeViewer(user ? user.id : null, Number(raw.competition_id), claimedRole);
    } catch {
        return serviceUnavailable(c, lang);
    }
    if (!gate.ok) {
        return accessFailure(c, gate, lang);
    }

    try {
        const result = await new SignalingReconnectService(c.env.DB).reconnect(gate);
        return c.json({
            success: true,
            data: {
                ...sessionPayload(result.state),
                action: 'reconnect',
                resumed_at_event_id: result.resumedAtEventId,
                retry_policy: result.policy,
            },
        });
    } catch {
        return serviceUnavailable(c, lang);
    }
});

signalingRoutes.get('/session', authMiddleware({ required: true }), async (c) => handleSession(c, 'describe'));
signalingRoutes.get('/session', authMiddleware({ required: true }), async (c) => handleSession(c, 'describe'));
signalingRoutes.post('/session/join', authMiddleware({ required: true }), async (c) => handleSession(c, 'join'));
signalingRoutes.post('/session/leave', authMiddleware({ required: true }), async (c) => handleSession(c, 'leave'));

/**
 * POST /api/signaling/offer — host publishes an SDP offer (7.A, auth required).
 * POST /api/signaling/answer — guest (or viewer) publishes an SDP answer.
 * POST /api/signaling/ice — any authorized peer publishes an ICE candidate.
 * POST /api/signaling/request-offer — late-joining guest/viewer asks the host
 *     for a fresh offer (7.B late join).
 * GET  /api/signaling/poll?competition_id=&since= — participant reads peer signals.
 *
 * All re-derive the role server-side via SignalingAuthService (single
 * authority), apply the 7.B capability matrix, and persist to / read from the
 * EXISTING sse_event_log table (no new storage).
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

signalingRoutes.post('/request-offer', authMiddleware({ required: true }), async (c) => {
    const body = await c.req.json().catch(() => ({}));
    return handleSignal(c, 'request_offer', body);
});

signalingRoutes.get('/poll', async (c) => {
    return handleSignal(c, 'poll', {
        competition_id: c.req.query('competition_id'),
        role: c.req.query('role'),
        since: c.req.query('since'),
    });
});

export default signalingRoutes;
