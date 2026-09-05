/**
 * Chunk Keys Routes for Upload Security
 * مسارات مفاتيح القطع لتأمين الرفع
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';
import { DEFAULT_UPLOAD_SERVER_ORIGINS, DEFAULT_UPLOAD_URL } from '../../../config/defaults';

const chunksRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Generate a cryptographically random key (SEC-06: predictable PRNGs must
// never back security tokens). 24 bytes = 192-bit entropy.
function generateChunkKey(): string {
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

// Short-lived one-time upload keys: 10 minutes is ample for a 5s chunk.
const CHUNK_KEY_TTL = "datetime('now', '+10 minutes')";

// Origin verification middleware for upload server
// التحقق من أن الطلب قادم من سيرفر الرفع المصرح به
const verifyUploadServerOrigin = async (c: any, next: any) => {
    // Get allowed origins from env, fallback to defaults.ts
    const allowedHosts = (c.env.UPLOAD_SERVER_ORIGINS || DEFAULT_UPLOAD_SERVER_ORIGINS)
        .split(',')
        .map((o: string) => {
            try {
                return new URL(o.trim()).host.toLowerCase();
            } catch {
                return '';
            }
        })
        .filter(Boolean);

    // Check Origin header or Referer — compare EXACT hosts (SEC-03):
    // prefix matching would accept https://allowed.com.attacker.net
    const raw = c.req.header('Origin') || c.req.header('Referer') || '';
    let host = '';
    try {
        host = new URL(raw).host.toLowerCase();
    } catch {
        host = '';
    }

    if (!host || !allowedHosts.includes(host)) {
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

        // Generate unique key bound to (user, competition, chunk) with a
        // short expiry — the upload server must present it within minutes.
        const chunk_key = generateChunkKey();

        // Insert into database
        await DB.prepare(
            `INSERT INTO chunk_keys (competition_id, chunk_index, chunk_key, user_id, expires_at)
             VALUES (?, ?, ?, ?, ${CHUNK_KEY_TTL})`
        ).bind(competition_id, chunk_index, chunk_key, user?.id ?? null).run();

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
            'SELECT id, competition_id, chunk_index, user_id, expires_at FROM chunk_keys WHERE chunk_key = ?'
        ).bind(key).first() as any;

        if (!chunkKey) {
            return c.json({ valid: false, error: 'Key not found' });
        }

        // Short-lived keys: reject expired ones and clean them up
        if (chunkKey.expires_at && new Date(chunkKey.expires_at).getTime() < Date.now()) {
            await DB.prepare('DELETE FROM chunk_keys WHERE chunk_key = ?').bind(key).run();
            return c.json({ valid: false, error: 'Key expired' });
        }

        return c.json({
            valid: true,
            data: {
                competition_id: chunkKey.competition_id,
                chunk_index: chunkKey.chunk_index,
                user_id: chunkKey.user_id ?? null
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

/**
 * GET /api/chunks/playlist/:id
 * T1.3: Server-side proxy for the streaming server playlist.
 *
 * The remote playlist.php sends NO CORS headers, so browsers on
 * dueli.maelshpro.com could never call it directly — viewers were unable to
 * discover chunks for live skip-to-latest and VOD playback. This proxy fetches
 * server-side (no CORS restriction) and normalizes the response.
 */
chunksRoutes.get('/playlist/:id', async (c) => {
    const id = c.req.param('id');

    if (!/^\d+$/.test(id)) {
        return c.json({ success: false, error: 'Invalid competition id' }, 400);
    }

    const base = (c.env.FFMPEG_SERVER_URL || DEFAULT_UPLOAD_URL).replace(/\/+$/, '');

    try {
        const res = await fetch(`${base}/playlist.php?id=${id}`, {
            signal: AbortSignal.timeout(10_000)
        });
        const text = await res.text();

        // The PHP endpoint may answer 200 with an EMPTY body — treat as "no chunks yet"
        let data: any = { chunks: [] };
        if (text && text.trim()) {
            try {
                data = JSON.parse(text);
            } catch {
                data = { chunks: [] };
            }
        }

        return c.json({
            success: true,
            id: Number(id),
            chunks: Array.isArray(data.chunks) ? data.chunks : []
        });
    } catch (error: any) {
        console.error('[chunks/playlist] upstream error:', error);
        // Graceful degradation: empty playlist, never a hard failure
        return c.json({ success: true, id: Number(id), chunks: [] });
    }
});

export default chunksRoutes;