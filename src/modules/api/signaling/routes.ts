/**
 * Signaling Routes for WebRTC P2P
 * مسارات الإشارات لاتصال WebRTC
 * 
 * Uses D1 Database for persistent storage across Workers
 * يستخدم قاعدة بيانات D1 للتخزين الدائم عبر Workers
 */

import { Hono } from 'hono';
import type { Bindings, Variables, Language } from '../../../config/types';
import { t } from '../../../i18n';

const signalingRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/signaling/ice-servers
 * Returns TURN/STUN server configuration
 */
signalingRoutes.get('/ice-servers', async (c) => {
    return c.json({
        success: true,
        data: {
            iceServers: [
                // Free STUN servers
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun.cloudflare.com:3478' },
            ]
        }
    });
});

/**
 * POST /api/signaling/room/create
 * Create a new signaling room for a competition
 */
signalingRoutes.post('/room/create', async (c) => {
    const lang = (c.get('lang') || 'en') as Language;
    const { DB } = c.env;

    try {
        const body = await c.req.json();
        const { competition_id, user_id } = body;

        if (!competition_id || !user_id) {
            return c.json({
                success: false,
                error: t('errors.missing_parameters', lang)
            }, 400);
        }

        const roomId = `comp_${competition_id}`;

        // Check if room already exists
        const existing = await DB.prepare(
            'SELECT * FROM signaling_rooms WHERE id = ?'
        ).bind(roomId).first();

        if (existing) {
            return c.json({
                success: true,
                data: {
                    room_id: roomId,
                    already_exists: true,
                    host_joined: !!existing.host_user_id,
                    opponent_joined: !!existing.opponent_user_id
                }
            });
        }

        // Create new room
        await DB.prepare(
            `INSERT INTO signaling_rooms (id, competition_id, created_at, updated_at) 
             VALUES (?, ?, datetime('now'), datetime('now'))`
        ).bind(roomId, competition_id).run();

        return c.json({
            success: true,
            data: {
                room_id: roomId,
                created: true
            }
        });
    } catch (error) {
        console.error('Error creating room:', error);
        return c.json({
            success: false,
            error: t('server_error', lang)
        }, 500);
    }
});

/**
 * POST /api/signaling/room/join
 * Join an existing room
 */
signalingRoutes.post('/room/join', async (c) => {
    const lang = (c.get('lang') || 'en') as Language;
    const { DB } = c.env;

    try {
        const body = await c.req.json();
        const { room_id, user_id, role } = body;

        if (!room_id || !user_id || !role) {
            return c.json({
                success: false,
                error: t('errors.missing_parameters', lang)
            }, 400);
        }

        // Get or create room
        let room = await DB.prepare(
            'SELECT * FROM signaling_rooms WHERE id = ?'
        ).bind(room_id).first();

        if (!room) {
            // Auto-create room if doesn't exist
            const competitionId = parseInt(room_id.replace('comp_', ''));
            await DB.prepare(
                `INSERT INTO signaling_rooms (id, competition_id, created_at, updated_at) 
                 VALUES (?, ?, datetime('now'), datetime('now'))`
            ).bind(room_id, competitionId).run();

            room = await DB.prepare(
                'SELECT * FROM signaling_rooms WHERE id = ?'
            ).bind(room_id).first();
        }

        // Update room based on role
        if (role === 'host') {
            if (room?.host_user_id && room.host_user_id !== user_id) {
                return c.json({
                    success: false,
                    error: 'Host already joined'
                }, 409);
            }
            await DB.prepare(
                `UPDATE signaling_rooms 
                 SET host_user_id = ?, host_joined_at = datetime('now'), updated_at = datetime('now') 
                 WHERE id = ?`
            ).bind(user_id, room_id).run();
        } else if (role === 'opponent') {
            if (room?.opponent_user_id && room.opponent_user_id !== user_id) {
                return c.json({
                    success: false,
                    error: 'Opponent already joined'
                }, 409);
            }
            await DB.prepare(
                `UPDATE signaling_rooms 
                 SET opponent_user_id = ?, opponent_joined_at = datetime('now'), updated_at = datetime('now') 
                 WHERE id = ?`
            ).bind(user_id, room_id).run();
        } else {
            // Viewer - just increment count
            await DB.prepare(
                `UPDATE signaling_rooms 
                 SET viewer_count = viewer_count + 1, updated_at = datetime('now') 
                 WHERE id = ?`
            ).bind(room_id).run();
        }

        // Get updated room
        const updatedRoom = await DB.prepare(
            'SELECT * FROM signaling_rooms WHERE id = ?'
        ).bind(room_id).first();

        return c.json({
            success: true,
            data: {
                joined: true,
                role,
                host_joined: !!updatedRoom?.host_user_id,
                opponent_joined: !!updatedRoom?.opponent_user_id,
                viewer_count: updatedRoom?.viewer_count || 0
            }
        });
    } catch (error) {
        console.error('Error joining room:', error);
        return c.json({
            success: false,
            error: t('server_error', lang)
        }, 500);
    }
});

/**
 * POST /api/signaling/signal
 * Send a signaling message (offer/answer/ice-candidate)
 */
signalingRoutes.post('/signal', async (c) => {
    const lang = (c.get('lang') || 'en') as Language;
    const { DB } = c.env;

    try {
        const body = await c.req.json();
        const { room_id, from_role, signal_type, signal_data } = body;

        if (!room_id || !from_role || !signal_type || !signal_data) {
            return c.json({
                success: false,
                error: t('errors.missing_parameters', lang)
            }, 400);
        }

        // Determine target based on sender
        const target = from_role === 'host' ? 'opponent' : 'host';

        // Insert signal
        await DB.prepare(
            `INSERT INTO signaling_signals (room_id, target_role, signal_type, signal_data, consumed, created_at) 
             VALUES (?, ?, ?, ?, 0, datetime('now'))`
        ).bind(room_id, target, signal_type, JSON.stringify(signal_data)).run();

        // Clean old signals (older than 60 seconds)
        await DB.prepare(
            `DELETE FROM signaling_signals 
             WHERE created_at < datetime('now', '-60 seconds')`
        ).run();

        console.log(`[Signaling] Signal ${signal_type} from ${from_role} to ${target} in room ${room_id}`);

        return c.json({
            success: true,
            data: { sent: true }
        });
    } catch (error) {
        console.error('Error sending signal:', error);
        return c.json({
            success: false,
            error: t('server_error', lang)
        }, 500);
    }
});

/**
 * GET /api/signaling/poll
 * Poll for pending signals
 */
signalingRoutes.get('/poll', async (c) => {
    const { DB } = c.env;
    const room_id = c.req.query('room_id');
    const role = c.req.query('role') as 'host' | 'opponent';

    if (!room_id || !role) {
        return c.json({
            success: false,
            error: 'Missing room_id or role'
        }, 400);
    }

    try {
        // Get pending signals for this role
        const signals = await DB.prepare(
            `SELECT id, signal_type, signal_data FROM signaling_signals 
             WHERE room_id = ? AND target_role = ? AND consumed = 0
             ORDER BY created_at ASC`
        ).bind(room_id, role).all();

        // Mark signals as consumed
        if (signals.results && signals.results.length > 0) {
            const ids = signals.results.map(s => s.id).join(',');
            await DB.prepare(
                `UPDATE signaling_signals SET consumed = 1 WHERE id IN (${ids})`
            ).run();
        }

        // Get room status
        const room = await DB.prepare(
            'SELECT * FROM signaling_rooms WHERE id = ?'
        ).bind(room_id).first();

        return c.json({
            success: true,
            data: {
                signals: signals.results?.map(s => ({
                    type: s.signal_type,
                    data: JSON.parse(s.signal_data as string)
                })) || [],
                room_status: {
                    host_joined: !!room?.host_user_id,
                    opponent_joined: !!room?.opponent_user_id,
                    viewer_count: room?.viewer_count || 0
                }
            }
        });
    } catch (error) {
        console.error('Error polling signals:', error);
        return c.json({
            success: false,
            error: 'Poll error'
        }, 500);
    }
});

/**
 * POST /api/signaling/room/leave
 * Leave a room
 */
signalingRoutes.post('/room/leave', async (c) => {
    const { DB } = c.env;

    try {
        const body = await c.req.json();
        const { room_id, user_id, role } = body;

        if (role === 'host') {
            await DB.prepare(
                `UPDATE signaling_rooms SET host_user_id = NULL, host_joined_at = NULL WHERE id = ?`
            ).bind(room_id).run();
        } else if (role === 'opponent') {
            await DB.prepare(
                `UPDATE signaling_rooms SET opponent_user_id = NULL, opponent_joined_at = NULL WHERE id = ?`
            ).bind(room_id).run();
        } else {
            await DB.prepare(
                `UPDATE signaling_rooms SET viewer_count = MAX(0, viewer_count - 1) WHERE id = ?`
            ).bind(room_id).run();
        }

        // Clean up signals for this room if empty
        const room = await DB.prepare(
            'SELECT * FROM signaling_rooms WHERE id = ?'
        ).bind(room_id).first();

        if (room && !room.host_user_id && !room.opponent_user_id && room.viewer_count === 0) {
            await DB.prepare('DELETE FROM signaling_signals WHERE room_id = ?').bind(room_id).run();
            await DB.prepare('DELETE FROM signaling_rooms WHERE id = ?').bind(room_id).run();
        }

        return c.json({
            success: true,
            data: { left: true }
        });
    } catch (error) {
        return c.json({ success: true, data: { left: true } });
    }
});

/**
 * GET /api/signaling/room/:room_id/status
 * Get room status
 */
signalingRoutes.get('/room/:room_id/status', async (c) => {
    const { DB } = c.env;
    const room_id = c.req.param('room_id');

    try {
        const room = await DB.prepare(
            'SELECT * FROM signaling_rooms WHERE id = ?'
        ).bind(room_id).first();

        if (!room) {
            return c.json({
                success: false,
                error: 'Room not found'
            }, 404);
        }

        return c.json({
            success: true,
            data: {
                room_id,
                host_joined: !!room.host_user_id,
                opponent_joined: !!room.opponent_user_id,
                viewer_count: room.viewer_count,
                created_at: room.created_at
            }
        });
    } catch (error) {
        return c.json({
            success: false,
            error: 'Status error'
        }, 500);
    }
});

/**
 * POST /api/signaling/room/reset
 * Reset a room (for debugging/testing)
 */
signalingRoutes.post('/room/reset', async (c) => {
    const { DB } = c.env;

    try {
        const body = await c.req.json();
        const { room_id } = body;

        // Delete all signals
        await DB.prepare('DELETE FROM signaling_signals WHERE room_id = ?').bind(room_id).run();

        // Reset room participants
        await DB.prepare(
            `UPDATE signaling_rooms 
             SET host_user_id = NULL, host_joined_at = NULL, 
                 opponent_user_id = NULL, opponent_joined_at = NULL,
                 viewer_count = 0, updated_at = datetime('now')
             WHERE id = ?`
        ).bind(room_id).run();

        return c.json({
            success: true,
            data: { reset: true }
        });
    } catch (error) {
        return c.json({
            success: false,
            error: 'Reset error'
        }, 500);
    }
});

export default signalingRoutes;
