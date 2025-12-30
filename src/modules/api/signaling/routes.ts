/**
 * Signaling Routes for WebRTC P2P
 * مسارات الإشارات لاتصال WebRTC
 * 
 * WebSocket-only mode via stream.maelsh.pro
 * وضع WebSocket فقط عبر سيرفر البث
 */

import { Hono } from 'hono';
import type { Bindings, Variables, Language } from '../../../config/types';
import { DEFAULT_STREAMING_URL } from '../../../config/defaults';
import { t } from '../../../i18n';

const signalingRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Generate TURN credentials using HMAC-SHA1
 * توليد بيانات اعتماد TURN باستخدام HMAC-SHA1
 * 
 * TURN REST API format:
 * - username: unix_timestamp:user_id
 * - password: base64(hmac-sha1(secret, username))
 */
async function generateTurnCredentials(secret: string, userId: string = 'dueli-user'): Promise<{ username: string, credential: string }> {
    // Expire after 24 hours
    const expiresAt = Math.floor(Date.now() / 1000) + 86400;
    const username = `${expiresAt}:${userId}`;

    // Generate HMAC-SHA1 signature
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-1' },
        false,
        ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(username));
    const credential = btoa(String.fromCharCode(...new Uint8Array(signature)));

    return { username, credential };
}

/**
 * GET /api/signaling/ice-servers
 * Returns TURN/STUN server configuration with dynamic credentials
 * يُرجع إعدادات خوادم TURN/STUN مع بيانات اعتماد ديناميكية
 */
signalingRoutes.get('/ice-servers', async (c) => {
    const turnUrl = c.env.TURN_URL || 'turn:maelsh.pro:3000';

    const iceServers: any[] = [
        // Free STUN servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun.cloudflare.com:3478' },
        // TURN without auth (for testing)
        { urls: turnUrl },
        { urls: `${turnUrl}?transport=tcp` }
    ];

    return c.json({
        success: true,
        data: { iceServers }
    });
});

/**
 * GET /api/signaling/config
 * Returns signaling configuration for clients
 * يُرجع إعدادات الإشارات للعملاء
 */
signalingRoutes.get('/config', async (c) => {
    const competition_id = c.req.query('competition_id');
    const room_id = c.req.query('room_id') || `comp_${competition_id}`;

    // Get streaming server URL from env or defaults
    const streamingUrl = c.env.STREAMING_URL || DEFAULT_STREAMING_URL;
    const wsUrl = streamingUrl.replace('https://', 'wss://').replace('http://', 'ws://');

    return c.json({
        success: true,
        data: {
            room_id,
            mode: 'websocket',
            signaling_url: `${wsUrl}/signaling?room=${room_id}`,
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
