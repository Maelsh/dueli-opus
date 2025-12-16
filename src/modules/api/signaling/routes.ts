/**
 * Signaling Routes for WebRTC P2P
 * مسارات الإشارات لاتصال WebRTC
 * 
 * Handles room management and SDP/ICE exchange for P2P connections
 * بدون Durable Objects - استخدام ذاكرة بسيطة للغرف
 */

import { Hono } from 'hono';
import type { Bindings, Variables, Language } from '../../../config/types';
import { t } from '../../../i18n';

const signalingRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// In-memory room storage (for Workers, this resets on cold start)
// في الإنتاج يمكن استخدام Durable Objects أو KV
interface RoomParticipant {
    id: string;
    role: 'host' | 'opponent' | 'viewer';
    joined_at: number;
}

interface Room {
    id: string;
    competition_id: number;
    host?: RoomParticipant;
    opponent?: RoomParticipant;
    viewers: RoomParticipant[];
    created_at: number;
    // Pending signals to be polled
    pendingSignals: {
        target: 'host' | 'opponent';
        type: 'offer' | 'answer' | 'ice-candidate';
        data: any;
        timestamp: number;
    }[];
}

const rooms = new Map<string, Room>();

/**
 * GET /api/signaling/ice-servers
 * Returns TURN/STUN server configuration
 */
signalingRoutes.get('/ice-servers', async (c) => {
    // Cloudflare TURN servers - check if we have credentials
    const turnUsername = c.env.CLOUDFLARE_API_TOKEN ? 'cloudflare' : undefined;

    return c.json({
        success: true,
        data: {
            iceServers: [
                // Free STUN servers
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun.cloudflare.com:3478' },
                // Note: Add TURN servers when available
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
        if (rooms.has(roomId)) {
            const existingRoom = rooms.get(roomId)!;
            return c.json({
                success: true,
                data: {
                    room_id: roomId,
                    already_exists: true,
                    host_joined: !!existingRoom.host,
                    opponent_joined: !!existingRoom.opponent
                }
            });
        }

        // Create new room
        const room: Room = {
            id: roomId,
            competition_id,
            viewers: [],
            created_at: Date.now(),
            pendingSignals: []
        };

        rooms.set(roomId, room);

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

    try {
        const body = await c.req.json();
        const { room_id, user_id, role } = body;

        if (!room_id || !user_id || !role) {
            return c.json({
                success: false,
                error: t('errors.missing_parameters', lang)
            }, 400);
        }

        const room = rooms.get(room_id);
        if (!room) {
            return c.json({
                success: false,
                error: 'Room not found'
            }, 404);
        }

        const participant: RoomParticipant = {
            id: user_id.toString(),
            role,
            joined_at: Date.now()
        };

        if (role === 'host') {
            if (room.host) {
                return c.json({
                    success: false,
                    error: 'Host already joined'
                }, 409);
            }
            room.host = participant;
        } else if (role === 'opponent') {
            if (room.opponent) {
                return c.json({
                    success: false,
                    error: 'Opponent already joined'
                }, 409);
            }
            room.opponent = participant;
        } else {
            room.viewers.push(participant);
        }

        return c.json({
            success: true,
            data: {
                joined: true,
                role,
                host_joined: !!room.host,
                opponent_joined: !!room.opponent,
                viewer_count: room.viewers.length
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

    try {
        const body = await c.req.json();
        const { room_id, from_role, signal_type, signal_data } = body;

        if (!room_id || !from_role || !signal_type || !signal_data) {
            return c.json({
                success: false,
                error: t('errors.missing_parameters', lang)
            }, 400);
        }

        const room = rooms.get(room_id);
        if (!room) {
            return c.json({
                success: false,
                error: 'Room not found'
            }, 404);
        }

        // Determine target based on sender
        const target = from_role === 'host' ? 'opponent' : 'host';

        // Add to pending signals
        room.pendingSignals.push({
            target: target as 'host' | 'opponent',
            type: signal_type,
            data: signal_data,
            timestamp: Date.now()
        });

        // Clean old signals (older than 30 seconds)
        room.pendingSignals = room.pendingSignals.filter(
            s => Date.now() - s.timestamp < 30000
        );

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
 * Poll for pending signals (long polling alternative to WebSocket)
 */
signalingRoutes.get('/poll', async (c) => {
    const room_id = c.req.query('room_id');
    const role = c.req.query('role') as 'host' | 'opponent';

    if (!room_id || !role) {
        return c.json({
            success: false,
            error: 'Missing room_id or role'
        }, 400);
    }

    const room = rooms.get(room_id);
    if (!room) {
        return c.json({
            success: false,
            error: 'Room not found'
        }, 404);
    }

    // Get signals targeted at this role
    const signals = room.pendingSignals.filter(s => s.target === role);

    // Remove consumed signals
    room.pendingSignals = room.pendingSignals.filter(s => s.target !== role);

    return c.json({
        success: true,
        data: {
            signals: signals.map(s => ({
                type: s.type,
                data: s.data
            })),
            room_status: {
                host_joined: !!room.host,
                opponent_joined: !!room.opponent,
                viewer_count: room.viewers.length
            }
        }
    });
});

/**
 * POST /api/signaling/room/leave
 * Leave a room
 */
signalingRoutes.post('/room/leave', async (c) => {
    try {
        const body = await c.req.json();
        const { room_id, user_id, role } = body;

        const room = rooms.get(room_id);
        if (!room) {
            return c.json({ success: true, data: { left: true } });
        }

        if (role === 'host') {
            room.host = undefined;
        } else if (role === 'opponent') {
            room.opponent = undefined;
        } else {
            room.viewers = room.viewers.filter(v => v.id !== user_id.toString());
        }

        // Delete room if empty
        if (!room.host && !room.opponent && room.viewers.length === 0) {
            rooms.delete(room_id);
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
    const room_id = c.req.param('room_id');

    const room = rooms.get(room_id);
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
            host_joined: !!room.host,
            opponent_joined: !!room.opponent,
            viewer_count: room.viewers.length,
            created_at: room.created_at
        }
    });
});

export default signalingRoutes;
