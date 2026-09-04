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

const signalingRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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

        // 1. Verify session token and get user
        const session = await DB.prepare(
            `SELECT s.user_id, u.username, u.display_name 
             FROM sessions s 
             JOIN users u ON s.user_id = u.id 
             WHERE s.id = ? AND s.expires_at > datetime('now')`
        ).bind(session_token).first();

        if (!session) {
            return c.json({ valid: false, error: 'invalid_session' });
        }

        // 2. Get competition and verify status
        const competition = await DB.prepare(
            `SELECT id, creator_id, opponent_id, status 
             FROM competitions WHERE id = ?`
        ).bind(competition_id).first();

        if (!competition) {
            return c.json({ valid: false, error: 'competition_not_found' });
        }

        if (competition.status !== 'live' && competition.status !== 'accepted') {
            return c.json({ valid: false, error: 'competition_not_active' });
        }

        // 3. Verify role
        let actualRole: string | null = null;
        if (session.user_id === competition.creator_id) {
            actualRole = 'host';
        } else if (session.user_id === competition.opponent_id) {
            actualRole = 'opponent';
        }

        if (!actualRole) {
            return c.json({ valid: false, error: 'not_participant' });
        }

        if (claimed_role !== actualRole) {
            return c.json({ valid: false, error: 'role_mismatch' });
        }

        // 4. Success - user is verified
        return c.json({
            valid: true,
            data: {
                user_id: session.user_id,
                username: session.username,
                display_name: session.display_name,
                role: actualRole,
                competition_id: competition.id
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
 */
signalingRoutes.post('/room/create', async (c) => {
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

        // Get streaming server URL
        const streamingUrl = c.env.STREAMING_URL || DEFAULT_STREAMING_URL;
        const roomId = `comp_${competition_id}`;

        // Forward to streaming server
        const response = await fetch(`${streamingUrl}/api/signaling/room/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ competition_id })
        });

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

export default signalingRoutes;
