/**
 * Chunk Keys Routes for Upload Security
 * مسارات مفاتيح القطع لتأمين الرفع
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';
import { DEFAULT_UPLOAD_SERVER_ORIGINS } from '../../../config/defaults';

const chunksRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Generate random key
function generateChunkKey(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 32; i++) {
        key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return key;
}

// Origin verification middleware for upload server
// التحقق من أن الطلب قادم من سيرفر الرفع المصرح به
const verifyUploadServerOrigin = async (c: any, next: any) => {
    // Get allowed origins from env, fallback to defaults.ts
    const allowedOrigins = (c.env.UPLOAD_SERVER_ORIGINS || DEFAULT_UPLOAD_SERVER_ORIGINS)
        .split(',')
        .map((o: string) => o.trim());

    // Check Origin header or Referer
    const origin = c.req.header('Origin') || c.req.header('Referer') || '';
    const isAllowed = allowedOrigins.some((allowed: string) => origin.startsWith(allowed));

    if (!isAllowed) {
        return c.json({ valid: false, error: 'Origin not allowed' }, 403);
    }

    await next();
};

/**
 * POST /api/chunks/register
 * Register a new chunk key before upload
 * المضيف يسجل مفتاح جديد لقطعة قبل رفعها
 */
chunksRoutes.post('/register', authMiddleware({ required: true }), async (c) => {
    const { DB } = c.env;
    const user = c.get('user');

    try {
        const body = await c.req.json();
        const { competition_id, chunk_index } = body;

        if (!competition_id || chunk_index === undefined) {
            return c.json({ success: false, error: 'Missing competition_id or chunk_index' }, 400);
        }

        // Verify user is host of competition
        const competition = await DB.prepare(
            'SELECT creator_id FROM competitions WHERE id = ? AND status = ?'
        ).bind(competition_id, 'live').first();

        if (!competition) {
            return c.json({ success: false, error: 'Competition not found or not live' }, 404);
        }

        if (competition.creator_id !== user?.id) {
            return c.json({ success: false, error: 'Only host can register chunk keys' }, 403);
        }

        // Generate unique key
        const chunk_key = generateChunkKey();

        // Insert into database
        await DB.prepare(
            'INSERT INTO chunk_keys (competition_id, chunk_index, chunk_key) VALUES (?, ?, ?)'
        ).bind(competition_id, chunk_index, chunk_key).run();

        return c.json({
            success: true,
            data: { chunk_key }
        });

    } catch (error: any) {
        console.error('Register chunk error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});

/**
 * GET /api/chunks/verify
 * Verify a chunk key (called by upload server)
 * التحقق من مفتاح القطعة (يستدعيه سيرفر الرفع)
 */
chunksRoutes.get('/verify', verifyUploadServerOrigin, async (c) => {
    const { DB } = c.env;

    try {
        const key = c.req.query('key');

        if (!key) {
            return c.json({ valid: false, error: 'Missing key' }, 400);
        }

        const chunkKey = await DB.prepare(
            'SELECT id, competition_id, chunk_index FROM chunk_keys WHERE chunk_key = ?'
        ).bind(key).first();

        if (!chunkKey) {
            return c.json({ valid: false, error: 'Key not found' });
        }

        return c.json({
            valid: true,
            data: {
                competition_id: chunkKey.competition_id,
                chunk_index: chunkKey.chunk_index
            }
        });

    } catch (error: any) {
        console.error('Verify chunk error:', error);
        return c.json({ valid: false, error: error.message }, 500);
    }
});

/**
 * DELETE /api/chunks/:key
 * Delete a chunk key after successful upload
 * حذف مفتاح القطعة بعد الرفع الناجح
 */
chunksRoutes.delete('/:key', verifyUploadServerOrigin, async (c) => {
    const { DB } = c.env;

    try {
        const key = c.req.param('key');

        if (!key) {
            return c.json({ success: false, error: 'Missing key' }, 400);
        }

        const result = await DB.prepare(
            'DELETE FROM chunk_keys WHERE chunk_key = ?'
        ).bind(key).run();

        return c.json({
            success: true,
            deleted: result.meta.changes > 0
        });

    } catch (error: any) {
        console.error('Delete chunk error:', error);
        return c.json({ success: false, error: error.message }, 500);
    }
});

export default chunksRoutes;
