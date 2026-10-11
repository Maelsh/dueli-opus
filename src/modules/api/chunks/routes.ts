/**
 * Chunk Keys Routes for Upload Security
 * مسارات مفاتيح القطع لتأمين الرفع
 */

import { Hono } from 'hono';
import type { D1Database } from '@cloudflare/workers-types';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';
import { CryptoUtils } from '../../../lib/services/CryptoUtils';
import { findInitEnd } from '../../../lib/services/ChunkInitSegment';
import { ChunkIndexModel } from '../../../models/ChunkIndexModel';
import { mergePlaylistWithIndex } from '../../../lib/services/ChunkIndexPlaylist';
import type { RecordingChunk } from '../../../models/ChunkIndexModel';
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

// C2 (SEC-03 docs/12): server-to-server HMAC auth for the upload server.
// Canonical message: METHOD + '\n' + path + '\n' + timestamp + '\n' + nonce + '\n' + bodyHash,
// signature = HMAC-SHA256(UPLOAD_SERVER_SECRET, canonical), hex-encoded.
// Required headers: X-Signature, X-Timestamp (unix ms), X-Nonce (unique per request).
// Replay window: 5 minutes; nonces are single-use (chunk_upload_nonces, migration 0030).
// Comparison is constant-time. Origin check above stays as a second layer.
const UPLOAD_HMAC_SKEW_MS = 5 * 60 * 1000;

const verifyUploadServerHmac = async (c: any, next: any) => {
    const secret = c.env.UPLOAD_SERVER_SECRET as string | undefined;
    if (!secret) {
        return c.json({ valid: false, error: 'Upload auth not configured' }, 503);
    }

    const signature = c.req.header('X-Signature') || '';
    const timestamp = c.req.header('X-Timestamp') || '';
    const nonce = c.req.header('X-Nonce') || '';
    if (!signature || !timestamp || !nonce) {
        return c.json({ valid: false, error: 'Missing upload signature' }, 403);
    }

    const ts = Number(timestamp);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > UPLOAD_HMAC_SKEW_MS) {
        return c.json({ valid: false, error: 'Stale upload signature' }, 403);
    }

    const rawBody = await c.req.text().catch(() => '');
    const bodyHash = await CryptoUtils.sha256Hex(rawBody);
    const path = new URL(c.req.url).pathname;
    const canonical = `${c.req.method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
    const expected = await CryptoUtils.hmacSha256Hex(secret, canonical);
    if (!CryptoUtils.timingSafeEqualString(signature, expected)) {
        return c.json({ valid: false, error: 'Invalid upload signature' }, 403);
    }

    const { DB } = c.env;
    const seen = await DB.prepare(
        'SELECT nonce FROM chunk_upload_nonces WHERE nonce = ?'
    ).bind(nonce).first();
    if (seen) {
        return c.json({ valid: false, error: 'Reused upload nonce' }, 403);
    }
    await DB.prepare(
        'INSERT INTO chunk_upload_nonces (nonce) VALUES (?)'
    ).bind(nonce).run();
    // Opportunistic prune — keeps the table tiny without a cron dependency.
    await DB.prepare(
        "DELETE FROM chunk_upload_nonces WHERE created_at < datetime('now', '-10 minutes')"
    ).run().catch(() => undefined);

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
chunksRoutes.get('/verify', verifyUploadServerHmac, verifyUploadServerOrigin, async (c) => {
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
chunksRoutes.delete('/:key', verifyUploadServerHmac, verifyUploadServerOrigin, async (c) => {
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
 *
 * R4-CHUNK-PLAY-1 contract (backward compatible — `{success, id, chunks}`
 * keep their shape; new fields are additive):
 *  - `chunks`: validated, de-duplicated (first wins), index-sorted entries
 *    `{index, url, duration?, size?}` — the single ordering truth. Late,
 *    missing (gap), or duplicate upstream rows can never corrupt it.
 *  - `upstream`: 'ok' | 'empty' (valid reply, zero usable chunks) | 'error'
 *    (transport/timeout/non-OK status) | 'invalid' (non-JSON, e.g. an HTML
 *    error page with HTTP 200 — NEVER treated as video).
 *  - `extension` / `total_duration`: timeline/format metadata when the
 *    upstream provides it (null otherwise — callers fall back, never guess).
 *  - `chunk_count`, `max_index`, `checked_at`.
 *  - R4-CHUNK-INDEX-1: D1 is the metadata authority when rows exist (one
 *    bounded indexed SELECT + one PK lookup per call; proxy-only otherwise
 *    — including when c.env.DB is absent or migration 0041 is not applied
 *    yet, so legacy/error paths stay byte-identical). D1 rows annotate
 *    entries (`ready`, verified `duration`, `timeline_start_ms`) and supply
 *    orphan entries built from object_path; `index_source` + `index_metadata`
 *    are additive. A dead/empty proxy with D1 rows still serves the
 *    authority list (index_source 'd1') instead of erasing video.
 *  - `Cache-Control: public, max-age=5`: collapses multi-viewer fan-out at
 *    the edge without serving stale live data.
 */
interface NormalizedChunk {
    index: number;
    url: string;
    duration?: number;
    size?: number;
}

/** Extract a chunk number from any plausible upstream shape. */
function chunkEntryIndex(entry: unknown, position: number, url: string): number {
    if (entry && typeof entry === 'object') {
        const rec = entry as Record<string, unknown>;
        for (const key of ['index', 'chunk_number', 'chunkNumber', 'n', 'position']) {
            const v = rec[key];
            if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return Math.floor(v);
            if (typeof v === 'string' && /^\d+$/.test(v.trim())) return parseInt(v.trim(), 10);
        }
    }
    const fromUrl = url.match(/chunk_(\d+)/i);
    if (fromUrl) return parseInt(fromUrl[1], 10);
    return position;
}

/** Extract a playable URL from any plausible upstream shape. */
function chunkEntryUrl(entry: unknown, id: string, base: string): string | null {
    if (typeof entry === 'string') {
        const s = entry.trim();
        if (/^https?:\/\//i.test(s)) return s;
        const file = s.match(/(chunk_\d+\.(mp4|webm))/i);
        if (file) return `${base}/stream.php?path=live/match_${id}/${file[1]}`;
        return null;
    }
    if (entry && typeof entry === 'object') {
        const rec = entry as Record<string, unknown>;
        for (const key of ['url', 'file', 'filename', 'path']) {
            const v = rec[key];
            if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
        }
        for (const key of ['file', 'filename', 'path']) {
            const v = rec[key];
            if (typeof v === 'string') {
                const file = v.match(/(chunk_\d+\.(mp4|webm))/i);
                if (file) return `${base}/stream.php?path=live/match_${id}/${file[1]}`;
            }
        }
    }
    return null;
}

function finiteNumber(v: unknown): number | undefined {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
    if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) && Number(v) >= 0) return Number(v);
    return undefined;
}

chunksRoutes.get('/playlist/:id', async (c) => {
    const id = c.req.param('id');

    if (!/^\d+$/.test(id)) {
        return c.json({ success: false, error: 'Invalid competition id' }, 400);
    }

    const base = (c.env.FFMPEG_SERVER_URL || DEFAULT_UPLOAD_URL).replace(/\/+$/, '');
    const jsonHeaders = { 'Cache-Control': 'public, max-age=5' };
    const compId = Number(id);

    // R4-CHUNK-INDEX-1: D1 authority layer (dormant-safe). Absent DB (unit
    // tests pass no env), a missing 0041 table (prod before owner-gated
    // apply), or zero rows all fall through to the exact legacy behavior.
    let indexRows: RecordingChunk[] = [];
    let indexFinalized = false;
    const db = (c.env as unknown as { DB?: D1Database }).DB;
    if (db) {
        try {
            const indexModel = new ChunkIndexModel(db);
            indexRows = await indexModel.listOrdered(compId, { limit: 2000 });
            indexFinalized = (await indexModel.getFinalMarker(compId)) !== null;
        } catch {
            indexRows = [];
            indexFinalized = false;
        }
    }
    const hasIndex = indexRows.length > 0;

    const serveIndex = (proxyUpstream: string) => {
        // D1 serves the authority list even when the proxy is dead/empty/
        // invalid (e.g. the known-empty playlist.php): the response IS a
        // valid playlist, hence upstream 'ok' + provenance fields. Per-chunk
        // fetch failures stay loud downstream under existing bounds.
        const merged = mergePlaylistWithIndex([], indexRows, base, indexFinalized);
        const totalReady = merged.metadata.total_ready_ms;
        return c.json({
            success: true,
            id: compId,
            chunks: merged.chunks,
            chunk_count: merged.chunks.length,
            max_index: merged.chunks.length > 0 ? merged.chunks[merged.chunks.length - 1].index : -1,
            extension: merged.chunks.length > 0 ? (merged.chunks[0].url.match(/\.(mp4|webm)(?=[?#]|$)/i)?.[1].toLowerCase() ?? null) : null,
            total_duration: totalReady > 0 ? totalReady / 1000 : null,
            upstream: 'ok',
            checked_at: new Date().toISOString(),
            index_source: 'd1' as const,
            index_detail: { proxy_upstream: proxyUpstream },
            index_metadata: merged.metadata,
        }, 200, jsonHeaders);
    };

    const empty = (upstream: string) => {
        if (hasIndex) return serveIndex(upstream);
        return c.json({
        success: true,
        id: Number(id),
        chunks: [],
        chunk_count: 0,
        max_index: -1,
        extension: null,
        total_duration: null,
        upstream,
        checked_at: new Date().toISOString(),
    }, 200, jsonHeaders);
    };

    let res: Response;
    try {
        res = await fetch(`${base}/playlist.php?id=${id}`, {
            signal: AbortSignal.timeout(10_000)
        });
    } catch (error) {
        console.error('[chunks/playlist] upstream error:', error instanceof Error ? error.message : error);
        // Transport/timeout — distinct from "no chunks yet", never fatal.
        return empty('error');
    }

    if (!res.ok) {
        console.error('[chunks/playlist] upstream status:', res.status);
        return empty('error');
    }

    const text = await res.text();

    // The PHP endpoint may answer 200 with an EMPTY body — "no chunks yet".
    // A 200 with an HTML error page is NOT a playlist (invalid, never video).
    let data: unknown = null;
    if (text && text.trim()) {
        const trimmed = text.trim();
        if (trimmed[0] !== '{' && trimmed[0] !== '[') {
            return empty('invalid');
        }
        try {
            data = JSON.parse(trimmed) as unknown;
        } catch {
            return empty('invalid');
        }
    }
    if (!data) return empty('empty');

    const raw: unknown[] = Array.isArray(data)
        ? data
        : data !== null && typeof data === 'object' && Array.isArray((data as { chunks?: unknown }).chunks)
            ? (data as { chunks: unknown[] }).chunks
            : [];
    if (raw.length === 0 && !Array.isArray(data) && !(data !== null && typeof data === 'object' && Array.isArray((data as { chunks?: unknown }).chunks))) {
        return empty('invalid');
    }

    const seen = new Set<number>();
    const chunks: NormalizedChunk[] = [];
    raw.forEach((entry, position) => {
        const url = chunkEntryUrl(entry, id, base);
        if (!url) return; // unusable entry — dropped, never guessed
        const index = chunkEntryIndex(entry, position, url);
        if (seen.has(index)) return; // duplicate index — first wins, no overwrite
        seen.add(index);
        const chunk: NormalizedChunk = { index, url };
        const duration = entry && typeof entry === 'object'
            ? finiteNumber((entry as Record<string, unknown>).duration) : undefined;
        const size = entry && typeof entry === 'object'
            ? finiteNumber((entry as Record<string, unknown>).size ?? (entry as Record<string, unknown>).filesize) : undefined;
        if (duration !== undefined) chunk.duration = duration;
        if (size !== undefined) chunk.size = size;
        chunks.push(chunk);
    });
    chunks.sort((a, b) => a.index - b.index);

    if (chunks.length === 0) {
        // Valid reply shape but nothing usable — same "no chunks yet" as empty.
        return empty(raw.length === 0 ? 'empty' : 'invalid');
    }

    const firstUrl = chunks[0].url;
    const extMatch = firstUrl.match(/\.(mp4|webm)(?=[?#]|$)/i);
    const allDurations = chunks.every((ch) => typeof ch.duration === 'number');
    const totalDuration = allDurations
        ? chunks.reduce((sum, ch) => sum + (ch.duration as number), 0)
        : null;

    // R4-CHUNK-INDEX-1: D1 authority annotates (verified durations win,
    // orphans appended, gaps reported) — additive fields only. No D1 rows:
    // the exact legacy shape below is preserved untouched.
    if (hasIndex) {
        const merged = mergePlaylistWithIndex(chunks, indexRows, base, indexFinalized);
        const served = merged.chunks;
        const first = served.length > 0 ? served[0].url : null;
        const ext = first ? first.match(/\.(mp4|webm)(?=[?#]|$)/i) : null;
        const allDur = served.length > 0 && served.every((ch) => typeof ch.duration === 'number');
        return c.json({
            success: true,
            id: Number(id),
            chunks: served,
            chunk_count: served.length,
            max_index: served.length > 0 ? served[served.length - 1].index : -1,
            extension: ext ? ext[1].toLowerCase() : null,
            total_duration: allDur ? served.reduce((sum, ch) => sum + (ch.duration as number), 0) : null,
            upstream: 'ok',
            checked_at: new Date().toISOString(),
            index_source: 'merged' as const,
            index_metadata: merged.metadata,
        }, 200, jsonHeaders);
    }

    return c.json({
        success: true,
        id: Number(id),
        chunks,
        chunk_count: chunks.length,
        max_index: chunks[chunks.length - 1].index,
        extension: extMatch ? extMatch[1].toLowerCase() : null,
        total_duration: totalDuration,
        upstream: 'ok',
        checked_at: new Date().toISOString(),
    }, 200, jsonHeaders);
});

/**
 * GET /api/chunks/init/:id
 * R4-CHUNK-PLAY-1: serve the recording init segment (mp4 ftyp+moov / webm
 * header) for a competition, extracted server-side from its first saved
 * chunk. MediaRecorder timeslices are FRAGMENTS, not standalone files —
 * every blob after the first lacks init bytes and can never decode alone
 * (proven: 0 frames standalone vs decoded with init prepended). The host
 * prepends this init to every uploaded chunk so each stored chunk plays
 * standalone in a plain <video> (live sequential + VOD blob playback).
 *
 * Zero D1 reads (playlist + one bounded byte fetch). The init of a
 * competition never changes once written → `max-age=300`.
 */
chunksRoutes.get('/init/:id', async (c) => {
    const id = c.req.param('id');

    if (!/^\d+$/.test(id)) {
        return c.json({ success: false, error: 'Invalid competition id' }, 400);
    }

    const base = (c.env.FFMPEG_SERVER_URL || DEFAULT_UPLOAD_URL).replace(/\/+$/, '');
    const headers = { 'Cache-Control': 'public, max-age=300' };
    const fail = () => c.json({ success: false, error: 'No init segment available' }, 404, headers);

    // Reuse the normalized playlist (single ordering truth) to find chunk one.
    let firstUrl: string | null = null;
    try {
        const res = await fetch(`${base}/playlist.php?id=${id}`, {
            signal: AbortSignal.timeout(10_000)
        });
        if (!res.ok) return fail();
        const text = await res.text();
        if (!text || !text.trim() || (text.trim()[0] !== '{' && text.trim()[0] !== '[')) return fail();
        const data: unknown = JSON.parse(text.trim());
        const raw: unknown[] = Array.isArray(data)
            ? data
            : data !== null && typeof data === 'object' && Array.isArray((data as { chunks?: unknown }).chunks)
                ? (data as { chunks: unknown[] }).chunks
                : [];
        const sorted = raw
            .map((entry, position) => ({ url: chunkEntryUrl(entry, id, base), index: chunkEntryIndex(entry, position, '') }))
            .filter((e) => e.url !== null)
            .sort((a, b) => a.index - b.index);
        if (sorted.length === 0) return fail();
        const first = sorted[0].url;
        if (typeof first !== 'string') return fail();
        firstUrl = first;
    } catch {
        return fail();
    }

    try {
        const res = await fetch(firstUrl as string, { signal: AbortSignal.timeout(10_000) });
        if (!res.ok) return fail();
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length === 0 || buf.length > 256 * 1024) return fail();
        const extMatch = (firstUrl as string).match(/\.(mp4|webm)(?=[?#]|$)/i);
        const format = extMatch ? extMatch[1].toLowerCase() : null;
        if (!format) return fail();
        const cut = findInitEnd(buf, format);
        const init = cut > 0 ? buf.subarray(0, cut) : buf;
        if (init.length === 0) return fail();
        // Stack-safe base64 (init is small, but apply() on huge arrays blows up).
        let binary = '';
        const STEP = 8192;
        for (let i = 0; i < init.length; i += STEP) {
            binary += String.fromCharCode.apply(null, Array.from(init.subarray(i, i + STEP)) as number[]);
        }
        return c.json({
            success: true,
            id: Number(id),
            format,
            byteLength: init.length,
            init: btoa(binary),
        }, 200, headers);
    } catch {
        return fail();
    }
});

export default chunksRoutes;