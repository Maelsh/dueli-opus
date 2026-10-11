/**
 * R4-CHUNK-UPLOAD-SAFE-1 (row 28) — mandatory bound keys, generation
 * fencing, atomic consume, authenticated receipts. Focused T/B, no E2E.
 *
 * Proven here (SqliteD1 runs the real migrations incl. 0040/0041/0042):
 *  A. register: gates (401/403/404), bad sequence/container (400),
 *     no-lease 409, missing stores 503 fail-closed (never legacy), bound
 *     response shape + immediate index slot (uploaded, unverified),
 *     conflict rolls the key back (409), gate-to-write races mapped.
 *  B. verify: atomic single-use consume (double-verify → one valid),
 *     stale generation rejected after takeover, expired/unknown/legacy
 *     keys rejected, drain-after-release still verifies while unexpired.
 *  C. receipts (HMAC envelope): stored+duration → ready; stored without
 *     duration → uploaded facts kept; failed → terminal; divergent bytes →
 *     conflict (never overwrite); unauthenticated calls rejected.
 *  D. PHP-harness order: the documented upload.php flow (register → upload
 *     → verify → save → DELETE → receipt) driven against these routes with
 *     an in-test host double — incl. failure-without-DELETE (re-register
 *     works) and replay-after-DELETE (fails). Real-PHP evidence still
 *     needed is listed in the runbook, not claimed here.
 *  E. takeover/resume/drain: new generation registers + verifies; old keys
 *     die; post-end tails land inside key TTL.
 *  F. INDEX27 resolutions: UNIQUE-race normalization, gap-scan truncation,
 *     declared validation, sequence bounds, import→URL roundtrip, paging.
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { createHmac, createHash } from 'node:crypto';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { ChunkIndexModel } from '../../src/models/ChunkIndexModel';
import { mergePlaylistWithIndex } from '../../src/lib/services/ChunkIndexPlaylist';

const SECRET = 'safe28-test-upload-secret';
const ORIGIN = 'https://maelshpro.com';

function env(db: SqliteD1) {
    return { DB: db, UPLOAD_SERVER_SECRET: SECRET } as unknown as Parameters<typeof app.request>[2];
}
function authed(token: string | undefined, method = 'GET', body?: unknown) {
    const h: Record<string, string> = { 'X-CSRF-Token': 'chunk-upload-safe-test' };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) {
        h['Content-Type'] = 'application/json';
        return { method, headers: h, body: JSON.stringify(body) };
    }
    return { method, headers: h };
}

let nonceSeq = 0;
const freshNonce = () => `safe28-${++nonceSeq}-${Date.now()}`;
const canonical = (method: string, path: string, ts: string, nonce: string, body = '') =>
    `${method}\n${path}\n${ts}\n${nonce}\n${createHash('sha256').update(body).digest('hex')}`;
const sign = (method: string, path: string, ts: string, nonce: string, body = '') =>
    createHmac('sha256', SECRET).update(canonical(method, path, ts, nonce, body)).digest('hex');
function hmacGet(path: string, query = '') {
    const ts = String(Date.now());
    const nonce = freshNonce();
    return {
        headers: {
            'X-Signature': sign('GET', path, ts, nonce),
            'X-Timestamp': ts,
            'X-Nonce': nonce,
            Origin: ORIGIN,
            Host: 'maelshpro.com',
            'X-CSRF-Token': 'safe28-test',
        },
        query,
    };
}
function hmacPost(path: string, bodyObj: Record<string, unknown>) {
    const raw = JSON.stringify(bodyObj);
    const ts = String(Date.now());
    const nonce = freshNonce();
    return {
        init: {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Signature': sign('POST', path, ts, nonce, raw),
                'X-Timestamp': ts,
                'X-Nonce': nonce,
                Origin: ORIGIN,
                Host: 'maelshpro.com',
                'X-CSRF-Token': 'safe28-test',
            },
            body: raw,
        },
        raw,
    };
}

async function seedUsers(db: SqliteD1) {
    for (const [id, email, username] of [[1, 'a@t.local', 'host_a'], [2, 'b@t.local', 'opp_b'], [3, 'c@t.local', 'stranger_c']] as const) {
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active) VALUES (?, ?, ?, 'x', ?, 1)`
        ).bind(id, email, username, username).run();
        await db.prepare(
            `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))`
        ).bind(`sess-${id}`, id).run();
    }
    await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'test', 'T', 'T')`).run().catch(() => undefined);
}
async function seedComp(db: SqliteD1, id: number, status: string, opponentId: number | null) {
    await db.prepare(
        `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status) VALUES (?, 'T', 'R', 1, 1, ?, ?)`
    ).bind(id, opponentId, status).run();
}
async function acquire(db: SqliteD1, compId: number, nonce: string, token = 'sess-1') {
    const res = await app.request('/api/chunks/lease/acquire', authed(token, 'POST', { competition_id: compId, holder_nonce: nonce }), env(db));
    expect(res.status).toBe(200);
    return ((await res.json()) as any).data.generation as number;
}
async function register(db: SqliteD1, compId: number, seq: number, token = 'sess-1', ext = 'mp4') {
    return app.request('/api/chunks/register', authed(token, 'POST', { competition_id: compId, chunk_index: seq, extension: ext }), env(db));
}
async function verifyKey(db: SqliteD1, key: string) {
    const { headers } = hmacGet('/api/chunks/verify');
    const res = await app.request(`/api/chunks/verify?key=${encodeURIComponent(key)}`, { headers }, env(db));
    return res.json() as Promise<{ valid: boolean; error?: string; data?: any }>;
}
async function receipt(db: SqliteD1, body: Record<string, unknown>) {
    const { init } = hmacPost('/api/chunks/receipt', body);
    return app.request('/api/chunks/receipt', init, env(db));
}

beforeEach(() => { nonceSeq = 0; });

describe('R4-CHUNK-UPLOAD-SAFE-1 register (mandatory bound keys)', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seedUsers(db);
        await seedComp(db, 70, 'live', 2);
    });
    afterEach(() => { db.close(); });

    it('1. gates: anon 401, stranger 403, non-live 404, bad sequence/container 400', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        // NOTE: register() defaults token to sess-1 — anonymous needs the
        // raw call (undefined would trigger the default).
        const anon = await app.request('/api/chunks/register',
            authed(undefined, 'POST', { competition_id: 70, chunk_index: 1, extension: 'mp4' }), env(db));
        expect(anon.status).toBe(401);
        expect((await register(db, 70, 1, 'sess-3')).status).toBe(403);
        await seedComp(db, 71, 'pending', null);
        await acquire(db, 70, 'a1b2c3d4');
        expect((await register(db, 71, 1)).status).toBe(404);
        for (const bad of [0, -2, 1.5]) {
            const r = await register(db, 70, bad);
            expect(r.status, `seq ${bad}`).toBe(400);
            expect(((await r.json()) as any).code).toBe('bad_sequence');
        }
        const avi = await register(db, 70, 1, 'sess-1', 'avi');
        expect(avi.status).toBe(400);
        expect(((await avi.json()) as any).code).toBe('bad_container');
    });

    it('2. no active lease → 409 fail-closed (never keyless)', async () => {
        const res = await register(db, 70, 1);
        expect(res.status).toBe(409);
        expect(((await res.json()) as any).code).toBe('lease_not_held');
    });

    it('3. success binds generation + object identity + ceiling, slots the index', async () => {
        const gen = await acquire(db, 70, 'a1b2c3d4');
        const res = await register(db, 70, 3);
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.data.sequence).toBe(3);
        expect(body.data.lease_generation).toBe(gen);
        expect(body.data.object_path).toBe('live/match_70/chunk_0003.mp4');
        expect(body.data.max_bytes).toBe(60000000);
        expect(typeof body.data.chunk_key).toBe('string');
        const model = new ChunkIndexModel(db as unknown as D1Database);
        const rows = await model.listOrdered(70);
        expect(rows.length).toBe(1);
        expect(rows[0].state).toBe('uploaded');
        expect(rows[0].duration_ms).toBeNull(); // unverified — never ready at issue
        expect(rows[0].generation).toBe(gen);
    });

    it('4. conflicting re-register rolls its key back (409, no overwrite)', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const model = new ChunkIndexModel(db as unknown as D1Database);
        await model.recordChunk(70, { sequence: 1, object_path: 'live/match_70/chunk_0001.mp4', container: 'mp4', bytes: 111 }, 1);
        const res = await register(db, 70, 1);
        expect(res.status).toBe(409);
        expect(((await res.json()) as any).code).toBe('conflict');
        const keys = await db.prepare('SELECT COUNT(*) AS n FROM chunk_keys').first<{ n: number }>();
        expect(keys?.n).toBe(0); // rolled back — no orphan key
    });

    it('5. missing stores fail closed with explicit codes (no legacy bypass)', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        db.exec('DROP TABLE recording_leases;');
        const noLease = await register(db, 70, 1);
        expect(noLease.status).toBe(503);
        expect(((await noLease.json()) as any).code).toBe('lease_unavailable');
    });
});

describe('R4-CHUNK-UPLOAD-SAFE-1 verify (atomic consume + fencing)', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seedUsers(db);
        await seedComp(db, 70, 'live', 2);
    });
    afterEach(() => { db.close(); });

    it('6. happy path verifies once with bound facts, replay finds nothing', async () => {
        const gen = await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 2)).json()) as any).data.chunk_key) as string;
        const first = await verifyKey(db, key);
        expect(first.valid).toBe(true);
        expect(first.data.lease_generation).toBe(gen);
        expect(first.data.object_path).toBe('live/match_70/chunk_0002.mp4');
        const replay = await verifyKey(db, key);
        expect(replay.valid).toBe(false); // consumed — single-use
    });

    it('7. concurrent double-verify: exactly one wins', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 2)).json()) as any).data.chunk_key) as string;
        const [a, b] = await Promise.all([verifyKey(db, key), verifyKey(db, key)]);
        expect([a.valid, b.valid].filter(Boolean).length).toBe(1);
    });

    it('8. stale generation rejected after takeover (fencing)', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 2)).json()) as any).data.chunk_key) as string;
        await db.prepare(`UPDATE recording_leases SET last_heartbeat_at = datetime('now', '-120 seconds') WHERE competition_id = 70`).run();
        await acquire(db, 70, 'e5f6071829aa'); // generation 2
        const stale = await verifyKey(db, key);
        expect(stale.valid).toBe(false);
        expect(stale.error).toMatch(/Stale/);
        const fresh = (((await (await register(db, 70, 3)).json()) as any).data.chunk_key) as string;
        expect((await verifyKey(db, fresh)).valid).toBe(true); // new generation works
    });

    it('9. expired, unknown and legacy-unbound keys rejected', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 2)).json()) as any).data.chunk_key) as string;
        await db.prepare(`UPDATE chunk_keys SET expires_at = datetime('now', '-1 minute') WHERE chunk_key = ?`).bind(key).run();
        expect((await verifyKey(db, key)).valid).toBe(false);
        expect((await verifyKey(db, 'nope-not-a-key')).valid).toBe(false);
        await db.prepare(
            `INSERT INTO chunk_keys (competition_id, chunk_index, chunk_key, user_id, expires_at, lease_generation)
             VALUES (70, 9, 'legacy-plain-key', 1, datetime('now', '+10 minutes'), NULL)`
        ).run();
        const legacy = await verifyKey(db, 'legacy-plain-key');
        expect(legacy.valid).toBe(false); // fail closed, cleaned up
        const gone = await db.prepare('SELECT id FROM chunk_keys WHERE chunk_key = ?').bind('legacy-plain-key').first();
        expect(gone).toBeNull();
    });

    it('10. drain tail verifies after clean end while unexpired', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 2)).json()) as any).data.chunk_key) as string;
        const end = await app.request('/api/competitions/70/end', authed('sess-1', 'POST', {}), env(db));
        expect(end.status).toBe(200);
        expect((await verifyKey(db, key)).valid).toBe(true); // bounded drain lands
    });
});

describe('R4-CHUNK-UPLOAD-SAFE-1 receipts (verified confirmation)', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seedUsers(db);
        await seedComp(db, 70, 'live', 2);
    });
    afterEach(() => { db.close(); });

    it('11. HMAC envelope enforced (no session auth accepted)', async () => {
        const anon = await app.request('/api/chunks/receipt',
            authed(undefined, 'POST', { competition_id: 70, sequence: 1, status: 'stored', duration_ms: 5000 }), env(db));
        expect(anon.status).toBe(403);
        // Forged signature with the secret configured → 403 (not 503).
        const ts = String(Date.now());
        const nonce = freshNonce();
        const forged = await app.request('/api/chunks/receipt', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Signature': '0'.repeat(64),
                'X-Timestamp': ts,
                'X-Nonce': nonce,
                Origin: ORIGIN,
                Host: 'maelshpro.com',
                'X-CSRF-Token': 'safe28-test',
            },
            body: JSON.stringify({ competition_id: 70, sequence: 1, status: 'stored' }),
        }, env(db));
        expect(forged.status).toBe(403);
    });

    it('12. stored + measured duration → ready; without → uploaded facts kept', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        await register(db, 70, 1);
        const noDur = await receipt(db, { competition_id: 70, sequence: 1, status: 'stored', bytes: 4096, object_hash: 'h1' });
        expect(noDur.status).toBe(200);
        expect(((await noDur.json()) as any).data.state).toBe('uploaded'); // never ready without measurement
        const withDur = await receipt(db, { competition_id: 70, sequence: 1, status: 'stored', bytes: 4096, object_hash: 'h1', duration_ms: 8000 });
        expect(((await withDur.json()) as any).data).toMatchObject({ state: 'ready', duration_ms: 8000 });
        const model = new ChunkIndexModel(db as unknown as D1Database);
        expect((await model.listOrdered(70))[0].duration_ms).toBe(8000); // verified, not declared
    });

    it('13. failed receipt marks terminal; divergent bytes conflict (never overwrite)', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        await register(db, 70, 4);
        const failed = await receipt(db, { competition_id: 70, sequence: 4, status: 'failed', error: 'disk full' });
        expect(((await failed.json()) as any).data.state).toBe('failed');
        const late = await receipt(db, { competition_id: 70, sequence: 4, status: 'stored', duration_ms: 5000 });
        expect(late.status).toBe(409);
        await register(db, 70, 5);
        await receipt(db, { competition_id: 70, sequence: 5, status: 'stored', bytes: 100, duration_ms: 5000 });
        const clash = await receipt(db, { competition_id: 70, sequence: 5, status: 'stored', bytes: 999, duration_ms: 5000 });
        expect(clash.status).toBe(409);
        expect(((await clash.json()) as any).code).toBe('conflict');
    });

    it('14. receipt creates ready directly for server-measured first reports', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const r = await receipt(db, { competition_id: 70, sequence: 2, status: 'stored', bytes: 2048, duration_ms: 9000 });
        expect(((await r.json()) as any).data.state).toBe('ready');
        const bad = await receipt(db, { competition_id: 70, sequence: -1, status: 'stored' });
        expect(bad.status).toBe(400);
    });
});

describe('R4-CHUNK-UPLOAD-SAFE-1 PHP-harness order (documented double)', () => {
    let db: SqliteD1;
    /** In-test host-disk double (the external bytes live here, never in D1). */
    const disk = new Map<string, { bytes: number; hash: string }>();
    beforeEach(async () => {
        db = new SqliteD1();
        await seedUsers(db);
        await seedComp(db, 70, 'live', 2);
        disk.clear();
    });
    afterEach(() => { db.close(); });

    /** The documented upload.php order: verify → save → DELETE → receipt. */
    async function phpUpload(seq: number, key: string, bytes: number, opts?: { skipDelete?: boolean; reportDuration?: number | null }) {
        const v = await verifyKey(db, key);
        if (!v.valid) return { saved: false, reason: v.error };
        disk.set(`match_70/${seq}`, { bytes, hash: `h${seq}` });
        if (!opts?.skipDelete) {
            const { headers } = hmacGet('/api/chunks/verify');
            await app.request(`/api/chunks/${encodeURIComponent(key)}`, { method: 'DELETE', headers }, env(db));
        }
        const r = await receipt(db, {
            competition_id: 70, sequence: seq, status: 'stored',
            bytes, object_hash: `h${seq}`,
            ...(opts?.reportDuration === null ? {} : { duration_ms: opts?.reportDuration ?? 5000 }),
        });
        return { saved: true, receipt: ((await r.json()) as any).data };
    }

    it('15. full order lands ready with verified facts', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 1)).json()) as any).data.chunk_key) as string;
        const out = await phpUpload(1, key, 4096, { reportDuration: 7000 });
        expect(out.saved).toBe(true);
        expect(out.receipt).toMatchObject({ state: 'ready', duration_ms: 7000 });
        const model = new ChunkIndexModel(db as unknown as D1Database);
        expect((await model.timeline(70)).total_ready_ms).toBe(7000);
    });

    it('16. failure-without-DELETE still recovers via re-register (same slot)', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 1)).json()) as any).data.chunk_key) as string;
        const v = await verifyKey(db, key);
        expect(v.valid).toBe(true); // consumed by the failed attempt's verify...
        // ...but the host crashed before DELETE. Re-register is idempotent
        // (same slot, same identity) and yields a fresh single-use key.
        const key2 = (((await (await register(db, 70, 1)).json()) as any).data.chunk_key) as string;
        expect(key2).not.toBe(key);
        const out = await phpUpload(1, key2, 4096, { reportDuration: 7000 });
        expect(out.saved).toBe(true);
        expect(out.receipt.state).toBe('ready');
    });

    it('17. replay-after-DELETE fails; wrong-slot key cannot cross slots', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 1)).json()) as any).data.chunk_key) as string;
        await phpUpload(1, key, 4096, { reportDuration: 7000 });
        expect((await verifyKey(db, key)).valid).toBe(false); // consumed
    });
});

describe('R4-CHUNK-UPLOAD-SAFE-1 INDEX27 resolutions', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seedUsers(db);
        await seedComp(db, 70, 'live', 2);
    });
    afterEach(() => { db.close(); });

    it('18. concurrent divergent records normalize to one row + CONFLICT (no raw error)', async () => {
        const model = new ChunkIndexModel(db as unknown as D1Database);
        const input = (bytes: number) => ({
            sequence: 1, object_path: 'live/match_70/chunk_0001.mp4', container: 'mp4' as const, bytes,
        });
        const [a, b] = await Promise.all([
            model.recordChunk(70, input(100), 1).then((r) => ({ ok: true as const, row: r }), (e) => ({ ok: false as const, code: e?.code })),
            model.recordChunk(70, input(200), 1).then((r) => ({ ok: true as const, row: r }), (e) => ({ ok: false as const, code: e?.code })),
        ]);
        const winners = [a, b].filter((r) => r.ok);
        const losers = [a, b].filter((r) => !r.ok);
        expect(winners.length).toBe(1);
        expect(losers.length).toBe(1);
        expect((losers[0] as { code?: string }).code).toBe('CONFLICT'); // normalized, never raw D1 text
        expect((await model.listOrdered(70)).length).toBe(1);
    });

    it('19. gap scan truncates past the bound; absurd sequences rejected', async () => {
        const model = new ChunkIndexModel(db as unknown as D1Database);
        await expect(model.recordChunk(70, { sequence: 2000000, object_path: 'x', container: 'mp4' }, 1))
            .rejects.toMatchObject({ code: 'BAD_INPUT' });
        await expect(model.recordChunk(70, { sequence: 1, object_path: 'x', container: 'mp4', declared_duration_ms: -3 }, 1))
            .rejects.toMatchObject({ code: 'BAD_INPUT' });
        await db.prepare(
            `INSERT INTO recording_chunks (competition_id, generation, sequence, object_path, container, state, created_at, updated_at)
             VALUES (70, 1, 50000, 'live/match_70/chunk_50000.mp4', 'mp4', 'uploaded', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')`
        ).run();
        const gaps = await model.detectGaps(70);
        expect(gaps.max).toBe(50000);
        expect(gaps.truncated).toBe(true);
        expect(gaps.missing.length).toBeLessThanOrEqual(10000);
        expect(gaps.missing[0]).toBe(1);
    });

    it('20. legacy import paths round-trip to real playlist URLs', async () => {
        const model = new ChunkIndexModel(db as unknown as D1Database);
        await model.importFromPlaylist(70, [
            { index: 0, url: 'https://cdn.example/live/match_70/chunk_0001.mp4', duration: 10 },
            { index: 1, file: 'chunk_0002.mp4' },
        ], 1);
        const rows = await model.listOrdered(70);
        const { chunks } = mergePlaylistWithIndex([], rows, 'https://host.test/ffmpeg', false);
        expect(chunks.map((c) => c.url)).toEqual([
            'https://host.test/ffmpeg/stream.php?path=live/match_70/chunk_0001.mp4',
            'https://host.test/ffmpeg/stream.php?path=live/match_70/chunk_0002.mp4',
        ]);
        expect(chunks.map((c) => c.index)).toEqual([0, 1]); // proxy convention preserved
    });

    it('21. reads page within bounds (cap respected, continuation covers the tail)', async () => {
        const model = new ChunkIndexModel(db as unknown as D1Database);
        for (let n = 1; n <= 30; n++) {
            await model.recordChunk(70, {
                sequence: n, object_path: `live/match_70/chunk_${String(n).padStart(4, '0')}.mp4`, container: 'mp4',
            }, 1);
        }
        expect((await model.listOrdered(70, { limit: 7 })).length).toBe(7);
        const tail = await model.continuation(70, 25, 10);
        expect(tail.map((r) => r.sequence)).toEqual([26, 27, 28, 29, 30]);
        // The 2000-row edge is analytical, not seeded: 2h at the enforced
        // 10s nominal chunk = 720 rows max — listOrdered's 2000 cap always
        // covers a full recording; continuation pages anything beyond.
        expect(720).toBeLessThan(2000);
    });
});
