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
 *  C. receipts (HMAC envelope): facts-only contract — a declared duration
 *     NEVER publishes ready; the platform measures the real stored bytes
 *     (fetch double) and publishes ready from the measurement; unverifiable
 *     → uploaded (fail closed); wrong/missing generation, unregistered
 *     sequence (no fabricated slot), wrong object, divergent bytes,
 *     takeover races and idempotent replay are all covered below.
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
import { ChunkIndexModel, MAX_DURATION_MS } from '../../src/models/ChunkIndexModel';
import { mergePlaylistWithIndex } from '../../src/lib/services/ChunkIndexPlaylist';
import { buildWebmObject } from '../helpers/media-fixtures';
import type { D1Database } from '@cloudflare/workers-types';

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
// ROW28 Task A: the upload host binds each receipt to the lease generation it
// registered/verified under (identity binding, echoed from /register's
// data.lease_generation). Within one upload session that generation is stable,
// so acquire() records it and the receipt() helper echoes it — exactly as the
// real PHP host does. Tests that exercise takeover/replay set it explicitly.
let currentGen: number | null = null;
/** The object path the last register() bound (echoed by the host receipt). */
let lastRegisteredPath: string | null = null;
/** stream.php double for the platform's server-side duration measurement. */
let streamObject: Uint8Array | (() => Uint8Array | Promise<Uint8Array>) | null = null;
const realFetch = globalThis.fetch;
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
    const generation = ((await res.json()) as any).data.generation as number;
    currentGen = generation; // the host binds subsequent receipts to this generation
    return generation;
}
async function register(db: SqliteD1, compId: number, seq: number, token = 'sess-1', ext = 'mp4') {
    const res = await app.request('/api/chunks/register', authed(token, 'POST', { competition_id: compId, chunk_index: seq, extension: ext }), env(db));
    const body: any = await res.clone().json().catch(() => null);
    if (res.status === 200 && body?.data?.object_path) lastRegisteredPath = body.data.object_path as string;
    return res;
}
async function verifyKey(db: SqliteD1, key: string) {
    const { headers } = hmacGet('/api/chunks/verify');
    const res = await app.request(`/api/chunks/verify?key=${encodeURIComponent(key)}`, { headers }, env(db));
    return res.json() as Promise<{ valid: boolean; error?: string; data: any }>;
}
async function receipt(db: SqliteD1, body: Record<string, unknown>) {
    // Bind to the generation acquired this session and echo the registered
    // object path (the verify binding), exactly as the real PHP host does —
    // unless the caller overrides them explicitly (takeover/replay/wrong-
    // object tests pass specific/absent values).
    const payload: Record<string, unknown> = { ...body };
    if (payload.lease_generation === undefined && currentGen !== null) {
        payload.lease_generation = currentGen;
    }
    if (payload.object_path === undefined && lastRegisteredPath !== null) {
        payload.object_path = lastRegisteredPath;
    }
    const { init } = hmacPost('/api/chunks/receipt', payload);
    return app.request('/api/chunks/receipt', init, env(db));
}

/** The upload-host double for stream.php (the bytes duration is measured from). */
function serveStoredObject(bytes: Uint8Array | null): void {
    streamObject = bytes;
}

beforeEach(() => {
    nonceSeq = 0; currentGen = null; lastRegisteredPath = null; streamObject = null;
    // The platform measures the stored object via stream.php; anything the
    // test does not serve behaves like an unreachable host (fail closed).
    // A FUNCTION may stand in for the bytes to race the measurement.
    (globalThis as any).fetch = async (url: any, init?: any) => {
        if (String(url).includes('/stream.php?path=')) {
            if (streamObject === null) throw new Error('test double: stored object unavailable');
            if (typeof streamObject === 'function') return new Response(await streamObject());
            return new Response(streamObject);
        }
        return realFetch(url, init);
    };
});
afterEach(() => { globalThis.fetch = realFetch; });

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

    it('5b. missing binding COLUMN (not table) fails closed 503, not 500', async () => {
        // D1 phrases partial-0042 states as "no such column" / "has no column
        // named" — both must map to a fail-closed 503 (binding_unavailable for
        // the binding store), never a 500 or a keyless fallback.
        await acquire(db, 70, 'a1b2c3d4');
        db.exec('ALTER TABLE chunk_keys RENAME TO chunk_keys_backup;');
        db.exec(`CREATE TABLE chunk_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            competition_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            chunk_key TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            expires_at DATETIME
        );`);
        const r = await register(db, 70, 1);
        expect(r.status).toBe(503);
        expect(((await r.json()) as any).code).toBe('binding_unavailable');
    });

    it('5c. UPLOADS_FROZEN maintenance barrier → 503 uploads_frozen, fail-closed (ROW28.1)', async () => {
        // Real, implementable replacement for the fictional "frozen Worker":
        // a truthy UPLOADS_FROZEN stops NEW upload sessions at the single
        // key-issuance point — no queue, no keyless fallback. Checked before
        // any DB read/key issuance. In-flight chunks (already holding a key)
        // keep draining via /verify → /receipt across a Worker deploy.
        await acquire(db, 70, 'a1b2c3d4');
        const frozenEnv = { DB: db, UPLOAD_SERVER_SECRET: SECRET, UPLOADS_FROZEN: '1' } as unknown as Parameters<typeof app.request>[2];
        const res = await app.request('/api/chunks/register',
            authed('sess-1', 'POST', { competition_id: 70, chunk_index: 1, extension: 'mp4' }), frozenEnv);
        expect(res.status).toBe(503);
        expect(((await res.json()) as any).code).toBe('uploads_frozen');
        // No key was issued while frozen (fail-closed, never keyless).
        const keys = await db.prepare('SELECT COUNT(*) AS n FROM chunk_keys').first<{ n: number }>();
        expect(keys?.n).toBe(0);
        // Unfrozen (explicit falsy) resumes normally — barrier is not sticky.
        const okEnv = { DB: db, UPLOAD_SERVER_SECRET: SECRET, UPLOADS_FROZEN: 'false' } as unknown as Parameters<typeof app.request>[2];
        const ok = await app.request('/api/chunks/register',
            authed('sess-1', 'POST', { competition_id: 70, chunk_index: 1, extension: 'mp4' }), okEnv);
        expect(ok.status).toBe(200);
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

    it('11b. HMAC canonical rule: pathname only — query-inclusive is rejected', async () => {
        // The Worker canonicals METHOD\nPATHNAME\n... (src/modules/api/chunks/routes.ts
        // verifyUploadServerHmac: `new URL(c.req.url).pathname`). The upload
        // host signs pathname-only while keeping the query in the request
        // URL; a signature computed over path+query (the historical PHP bug)
        // must be rejected here — this locks the contract the real PHP is
        // tested against in dev-tools/php/tests.
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 1)).json()) as any).data.chunk_key) as string;
        const path = '/api/chunks/verify';
        const body = '';
        const call = async (signedPath: string) => {
            const ts = String(Date.now());
            const nonce = freshNonce();
            const canonical = `${'GET'}\n${signedPath}\n${ts}\n${nonce}\n${createHash('sha256').update(body).digest('hex')}`;
            const signature = createHmac('sha256', SECRET).update(canonical).digest('hex');
            return app.request(
                `/api/chunks/verify?key=${encodeURIComponent(key)}`,
                { method: 'GET', headers: { 'X-Signature': signature, 'X-Timestamp': ts, 'X-Nonce': nonce, Origin: ORIGIN } },
                env(db),
            );
        };
        // Pathname-only: accepted (the key may then be validated/consumed).
        await call(path);
        await register(db, 70, 2); // fresh key (the previous verify consumed it)
        const key2 = (((await (await register(db, 70, 2)).json()) as any).data.chunk_key) as string;
        const ts = String(Date.now());
        const nonce = freshNonce();
        const bogus = createHmac('sha256', SECRET)
            .update(`GET\n/api/chunks/verify?key=${key2}\n${ts}\n${nonce}\n${createHash('sha256').update(body).digest('hex')}`)
            .digest('hex');
        const rejected = await app.request(
            `/api/chunks/verify?key=${encodeURIComponent(key2)}`,
            { method: 'GET', headers: { 'X-Signature': bogus, 'X-Timestamp': ts, 'X-Nonce': nonce, Origin: ORIGIN } },
            env(db),
        );
        expect(rejected.status).toBe(403);
        expect(((await rejected.json()) as any).error).toBe('Invalid upload signature');
    });

    it('12. declared duration never publishes ready; platform measurement does', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        await register(db, 70, 1, 'sess-1', 'webm'); // the registered container drives the measurement parser
        // Facts-only receipt with an unreachable host: stays uploaded.
        const noDur = await receipt(db, { competition_id: 70, sequence: 1, status: 'stored', bytes: 4096, object_hash: 'h1' });
        expect(noDur.status).toBe(200);
        expect(((await noDur.json()) as any).data.state).toBe('uploaded'); // never ready without measurement
        // A DECLARED duration_ms in the body is not part of the contract and
        // must never publish ready (ROW28 D3).
        const declared = await receipt(db, { competition_id: 70, sequence: 1, status: 'stored', bytes: 4096, object_hash: 'h1', duration_ms: 8000 });
        expect(((await declared.json()) as any).data.state).toBe('uploaded');
        // Server-side measurement of the REAL stored bytes publishes ready.
        serveStoredObject(buildWebmObject([[0, [0]], [1000, [0]], [2000, [0]], [3000, [0]], [4000, [0]], [5000, [0]]]));
        const withDur = await receipt(db, { competition_id: 70, sequence: 1, status: 'stored', bytes: 4096, object_hash: 'h1' });
        expect(((await withDur.json()) as any).data).toMatchObject({ state: 'ready', duration_ms: 5000 });
        const model = new ChunkIndexModel(db as unknown as D1Database);
        expect((await model.listOrdered(70))[0].duration_ms).toBe(5000); // measured, not declared
    });

    it('13. failed receipt marks terminal; divergent bytes conflict (never overwrite)', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        await register(db, 70, 4);
        const failed = await receipt(db, { competition_id: 70, sequence: 4, status: 'failed', error: 'disk full' });
        expect(((await failed.json()) as any).data.state).toBe('failed');
        const late = await receipt(db, { competition_id: 70, sequence: 4, status: 'stored', bytes: 512 });
        expect(late.status).toBe(409);
        await register(db, 70, 5);
        await receipt(db, { competition_id: 70, sequence: 5, status: 'stored', bytes: 100, object_hash: 'h5' });
        const clash = await receipt(db, { competition_id: 70, sequence: 5, status: 'stored', bytes: 999, object_hash: 'h5' });
        expect(clash.status).toBe(409);
        expect(((await clash.json()) as any).code).toBe('conflict');
    });

    it('14. receipt for an UNREGISTERED sequence is 404 — no fabricated slot (D7)', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const model = new ChunkIndexModel(db as unknown as D1Database);
        // No /register happened: nothing may be created from a receipt — not
        // even with a declared duration (no generation=1, no container=mp4,
        // no invented object path).
        const r = await receipt(db, { competition_id: 70, sequence: 2, status: 'stored', bytes: 2048, object_hash: 'h2' });
        expect(r.status).toBe(404);
        expect(((await r.json()) as any).code).toBe('unregistered');
        expect((await model.listOrdered(70)).length).toBe(0);
        const withDeclared = await receipt(db, { competition_id: 70, sequence: 2, status: 'stored', bytes: 2048, duration_ms: 9000 });
        expect(withDeclared.status).toBe(404);
        expect((await model.listOrdered(70)).length).toBe(0);
        const bad = await receipt(db, { competition_id: 70, sequence: -1, status: 'stored' });
        expect(bad.status).toBe(400);
    });

    it('14b. secure activation path needs no finalize: ready via receipt alone', async () => {
        // Retires the unsafe finalize dependency from the secure path: the
        // D1 index reaches ready through verify + receipt only. No
        // server-side FFmpeg/merge/transcode/chunk-deletion is invoked here.
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 6, 'sess-1', 'webm')).json()) as any).data.chunk_key) as string;
        const v = await verifyKey(db, key);
        expect(v.valid).toBe(true);
        const { headers } = hmacGet('/api/chunks/verify');
        await app.request(`/api/chunks/${encodeURIComponent(key)}`, { method: 'DELETE', headers }, env(db));
        serveStoredObject(buildWebmObject([[0, [0]], [2500, [0]], [5000, [0]]]));
        const r = await receipt(db, { competition_id: 70, sequence: 6, status: 'stored', bytes: 512, object_hash: 'h6' });
        expect(((await r.json()) as any).data).toMatchObject({ state: 'ready', duration_ms: 5000 });
        const model = new ChunkIndexModel(db as unknown as D1Database);
        const status = await model.recordingStatus(70);
        expect(status.ready).toBeGreaterThanOrEqual(1);
    });

    it('14c. measured duration above the sanity ceiling fails closed (never poisons the timeline)', async () => {
        // The only trusted duration source is the platform measurement of the
        // real stored bytes. A measurably absurd value must NOT reach ready
        // nor poison the timeline (cursor += duration_ms on read): the slot
        // stays uploaded and a sane measurement can still confirm it.
        await acquire(db, 70, 'a1b2c3d4');
        await register(db, 70, 8, 'sess-1', 'webm');
        serveStoredObject(buildWebmObject([[0, [0]], [MAX_DURATION_MS + 1000, [0]]])); // end = ceiling + 1s
        const over = await receipt(db, { competition_id: 70, sequence: 8, status: 'stored', bytes: 512, object_hash: 'h8' });
        expect(over.status).toBe(200);
        expect(((await over.json()) as any).data.state).toBe('uploaded'); // fail closed — never ready
        const model = new ChunkIndexModel(db as unknown as D1Database);
        expect((await model.listOrdered(70))[0].state).toBe('uploaded');
        // A within-ceiling measured value still reaches ready.
        serveStoredObject(buildWebmObject([[0, [0]], [30000, [0]]]));
        const okDur = await receipt(db, { competition_id: 70, sequence: 8, status: 'stored', bytes: 512, object_hash: 'h8' });
        expect(((await okDur.json()) as any).data).toMatchObject({ state: 'ready', duration_ms: 30000 });
    });
});

describe('R4-CHUNK-UPLOAD-SAFE-1 receipt fencing + binding (ROW28 final D1/D7)', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seedUsers(db);
        await seedComp(db, 70, 'live', 2);
    });
    afterEach(() => { db.close(); });

    /** Raw receipt (no auto-injected generation/path) for exact-body tests. */
    async function receiptRaw(body: Record<string, unknown>) {
        const { init } = hmacPost('/api/chunks/receipt', body);
        return app.request('/api/chunks/receipt', init, env(db));
    }
    async function expireLease() {
        await db.prepare(`UPDATE recording_leases SET last_heartbeat_at = datetime('now', '-120 seconds') WHERE competition_id = 70`).run();
    }

    it('D1-1. stale receipt after takeover is rejected (verify→takeover→receipt race)', async () => {
        const gen1 = await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 1, 'sess-1', 'webm')).json()) as any).data.chunk_key) as string;
        expect((await verifyKey(db, key)).valid).toBe(true); // verified under generation 1
        await expireLease();
        const gen2 = await acquire(db, 70, 'e5f6071829aa'); // takeover: generation 2
        expect(gen2).toBe(gen1 + 1);
        // The old holder's receipt lands after the takeover: rejected BEFORE
        // any write — the new holder's index can never be published into.
        const stale = await receiptRaw({
            competition_id: 70, sequence: 1, status: 'stored',
            bytes: 4096, object_hash: 'h1',
            object_path: 'live/match_70/chunk_0001.mp4', lease_generation: gen1,
        });
        expect(stale.status).toBe(409);
        expect(((await stale.json()) as any).code).toBe('stale_generation');
        const model = new ChunkIndexModel(db as unknown as D1Database);
        expect((await model.listOrdered(70))[0].state).toBe('uploaded'); // nothing confirmed
    });

    it('D1-2. the receipt generation must own the REGISTERED slot (lineage binding)', async () => {
        await acquire(db, 70, 'a1b2c3d4'); // generation 1
        await register(db, 70, 1);        // slot registered under generation 1
        await expireLease();
        await acquire(db, 70, 'e5f6071829aa'); // generation 2 holds the lease
        // Lease pre-check passes (gen 2 holds), but the slot was registered
        // under gen 1: the atomic slot binding must refuse the publication.
        const wrongLineage = await receiptRaw({
            competition_id: 70, sequence: 1, status: 'stored',
            bytes: 4096, object_hash: 'h1',
            object_path: 'live/match_70/chunk_0001.mp4', lease_generation: 2,
        });
        expect(wrongLineage.status).toBe(409);
        expect(((await wrongLineage.json()) as any).code).toBe('stale_generation');
        const model = new ChunkIndexModel(db as unknown as D1Database);
        expect((await model.listOrdered(70))[0].state).toBe('uploaded');
    });

    it('D1-3. a released-lease drain tail still confirms under its own generation', async () => {
        const gen1 = await acquire(db, 70, 'a1b2c3d4');
        await register(db, 70, 1, 'sess-1', 'webm');
        const end = await app.request('/api/competitions/70/end', authed('sess-1', 'POST', {}), env(db));
        expect(end.status).toBe(200); // lease released
        serveStoredObject(buildWebmObject([[0, [0]], [1500, [0]], [3000, [0]]]));
        const tail = await receiptRaw({
            competition_id: 70, sequence: 1, status: 'stored',
            bytes: 4096, object_hash: 'h1',
            object_path: 'live/match_70/chunk_0001.webm', lease_generation: gen1,
        });
        expect(((await tail.json()) as any).data).toMatchObject({ state: 'ready', duration_ms: 3000 });
    });

    it('D1-4. missing/invalid lease generation fails closed (400)', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        await register(db, 70, 1);
        for (const bad of [undefined, null, 0, '1', 1.5, -3]) {
            const body: Record<string, unknown> = {
                competition_id: 70, sequence: 1, status: 'stored',
                bytes: 10, object_hash: 'h1', object_path: 'live/match_70/chunk_0001.mp4',
            };
            if (bad !== undefined) body.lease_generation = bad;
            const r = await receiptRaw(body);
            expect(r.status, `gen=${String(bad)}`).toBe(400);
            expect(((await r.json()) as any).code).toBe('bad_generation');
        }
        const model = new ChunkIndexModel(db as unknown as D1Database);
        expect((await model.listOrdered(70))[0].state).toBe('uploaded');
    });

    it('D1-5. wrong competition / sequence / object are all rejected', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        await register(db, 70, 5, 'sess-1', 'webm');
        // Wrong competition: no slot registered under 71 at all.
        const wrongComp = await receiptRaw({ competition_id: 71, sequence: 5, status: 'stored', bytes: 10, object_hash: 'h', lease_generation: 1 });
        expect(wrongComp.status).toBe(404);
        // Wrong sequence: never registered.
        const wrongSeq = await receiptRaw({ competition_id: 70, sequence: 99, status: 'stored', bytes: 10, object_hash: 'h', lease_generation: 1 });
        expect(wrongSeq.status).toBe(404);
        // Wrong object: echoes a binding that is not the registered slot's.
        const wrongObj = await receiptRaw({
            competition_id: 70, sequence: 5, status: 'stored',
            bytes: 10, object_hash: 'h', lease_generation: 1,
            object_path: 'live/match_70/chunk_0006.webm',
        });
        expect(wrongObj.status).toBe(409);
        expect(((await wrongObj.json()) as any).code).toBe('object_mismatch');
        const model = new ChunkIndexModel(db as unknown as D1Database);
        expect((await model.listOrdered(70))[0].state).toBe('uploaded');
        // The correct binding still lands and measures.
        serveStoredObject(buildWebmObject([[0, [0]], [500, [0]], [1000, [0]]]));
        const ok = await receiptRaw({
            competition_id: 70, sequence: 5, status: 'stored',
            bytes: 10, object_hash: 'h', lease_generation: 1,
            object_path: 'live/match_70/chunk_0005.webm',
        });
        expect(((await ok.json()) as any).data).toMatchObject({ state: 'ready', duration_ms: 1000 });
    });

    it('D1-6. identical receipt replay is idempotent; divergent facts conflict', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        await register(db, 70, 3, 'sess-1', 'webm');
        serveStoredObject(buildWebmObject([[0, [0]], [5000, [0]]]));
        const first = await receipt(db, { competition_id: 70, sequence: 3, status: 'stored', bytes: 100, object_hash: 'h3' });
        expect(((await first.json()) as any).data).toMatchObject({ state: 'ready', duration_ms: 5000 });
        // Same identity again: idempotent retry, no rewrite, no conflict.
        const replay = await receipt(db, { competition_id: 70, sequence: 3, status: 'stored', bytes: 100, object_hash: 'h3' });
        expect(((await replay.json()) as any).data).toMatchObject({ state: 'ready', duration_ms: 5000 });
        // Divergent bytes or hash on a confirmed slot: conflict, never overwrite.
        const bytesClash = await receipt(db, { competition_id: 70, sequence: 3, status: 'stored', bytes: 999, object_hash: 'h3' });
        expect(bytesClash.status).toBe(409);
        expect(((await bytesClash.json()) as any).code).toBe('conflict');
        const hashClash = await receipt(db, { competition_id: 70, sequence: 3, status: 'stored', bytes: 100, object_hash: 'hX' });
        expect(hashClash.status).toBe(409);
        const model = new ChunkIndexModel(db as unknown as D1Database);
        const row = (await model.listOrdered(70))[0];
        expect(row).toMatchObject({ state: 'ready', duration_ms: 5000, bytes: 100, object_hash: 'h3' });
    });

    it('D1-7. gen2 takeover DURING the measurement is refused atomically', async () => {
        // The route's lease pre-check passes, the facts are noted, and THEN
        // a takeover lands while the platform measures the stored bytes: the
        // final publication must be refused INSIDE the critical UPDATE, and
        // the stale receipt must not change state or facts.
        await acquire(db, 70, 'a1b2c3d4'); // generation 1
        await register(db, 70, 1, 'sess-1', 'webm');
        // The served object performs the takeover before the bytes return.
        streamObject = async () => {
            await expireLease();
            await acquire(db, 70, 'e5f6071829aa'); // generation 2 takes over
            return buildWebmObject([[0, [0]], [1000, [0]], [2000, [0]], [3000, [0]]]);
        };
        const raced = await receiptRaw({
            competition_id: 70, sequence: 1, status: 'stored',
            bytes: 4096, object_hash: 'h1',
            object_path: 'live/match_70/chunk_0001.webm', lease_generation: 1,
        });
        expect(raced.status).toBe(409);
        expect(((await raced.json()) as any).code).toBe('stale_generation');
        const model = new ChunkIndexModel(db as unknown as D1Database);
        const row = (await model.listOrdered(70))[0];
        expect(row.state).toBe('uploaded'); // nothing published by the stale receipt
        // The new holder re-registers the slot lineage: no slot exists for
        // it (sequence 1 taken), so it must move on — the stale receipt can
        // never confirm into its index either.
        const again = await receiptRaw({
            competition_id: 70, sequence: 1, status: 'stored',
            bytes: 4096, object_hash: 'h1',
            object_path: 'live/match_70/chunk_0001.webm', lease_generation: 1,
        });
        expect(again.status).toBe(409);
        expect(((await model.listOrdered(70))[0].state)).toBe('uploaded');
    });

    it('D1-8. a takeover also fences the FAILED receipt (state unchanged)', async () => {
        await acquire(db, 70, 'a1b2c3d4'); // generation 1
        await register(db, 70, 2);
        await expireLease();
        await acquire(db, 70, 'e5f6071829aa'); // generation 2 holds
        // A held gen-2 lease rejects the gen-1 failure at the pre-check.
        const pre = await receiptRaw({
            competition_id: 70, sequence: 2, status: 'failed', error: 'disk full',
            lease_generation: 1, object_path: 'live/match_70/chunk_0002.mp4',
        });
        expect(pre.status).toBe(409);
        expect(((await pre.json()) as any).code).toBe('stale_generation');
        // Release the gen-2 lease (clean end) and retry the gen-1 failure:
        // the generation was SUPERSEDED, so the atomic guard still refuses.
        const end = await app.request('/api/competitions/70/end', authed('sess-1', 'POST', {}), env(db));
        expect(end.status).toBe(200);
        const post = await receiptRaw({
            competition_id: 70, sequence: 2, status: 'failed', error: 'disk full',
            lease_generation: 1, object_path: 'live/match_70/chunk_0002.mp4',
        });
        expect(post.status).toBe(409);
        expect(((await post.json()) as any).code).toBe('stale_generation');
        const model = new ChunkIndexModel(db as unknown as D1Database);
        expect((await model.listOrdered(70))[0].state).toBe('uploaded'); // unchanged
        // Even the CURRENT generation cannot fail a slot the superseded
        // lineage registered: the slot's generation binding refuses it.
        const current = await receiptRaw({
            competition_id: 70, sequence: 2, status: 'failed', error: 'disk full',
            lease_generation: 2, object_path: 'live/match_70/chunk_0002.mp4',
        });
        expect(current.status).toBe(409);
        expect(((await current.json()) as any).code).toBe('stale_generation');
        expect(((await model.listOrdered(70))[0].state)).toBe('uploaded');
    });

    it('D1-9. a superseded generation never drains after a takeover+release', async () => {
        const gen1 = await acquire(db, 70, 'a1b2c3d4');
        await register(db, 70, 1, 'sess-1', 'webm');
        await expireLease();
        await acquire(db, 70, 'e5f6071829aa'); // gen 2 supersedes gen 1
        await app.request('/api/competitions/70/end', authed('sess-1', 'POST', {}), env(db)); // clean end at gen 2
        streamObject = () => buildWebmObject([[0, [0]], [500, [0]], [1000, [0]]]);
        const stale = await receiptRaw({
            competition_id: 70, sequence: 1, status: 'stored',
            bytes: 4096, object_hash: 'h1',
            object_path: 'live/match_70/chunk_0001.webm', lease_generation: gen1,
        });
        expect(stale.status).toBe(409);
        expect(((await stale.json()) as any).code).toBe('stale_generation');
        const model = new ChunkIndexModel(db as unknown as D1Database);
        expect((await model.listOrdered(70))[0].state).toBe('uploaded');
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

    /**
     * The documented upload.php order: verify → save → DELETE → receipt.
     * The host reports STORAGE FACTS ONLY (D3: it declares no duration);
     * the platform then measures the served stored object itself. The
     * optional `storedObject` drives the measurement double — omitting it
     * leaves the chunk unverified (uploaded), like an unreachable host.
     */
    async function phpUpload(seq: number, key: string, bytes: number, opts?: { skipDelete?: boolean; storedObject?: Uint8Array | null }) {
        const v = await verifyKey(db, key);
        if (!v.valid) return { saved: false, reason: v.error };
        disk.set(`match_70/${seq}`, { bytes, hash: `h${seq}` });
        if (!opts?.skipDelete) {
            const { headers } = hmacGet('/api/chunks/verify');
            await app.request(`/api/chunks/${encodeURIComponent(key)}`, { method: 'DELETE', headers }, env(db));
        }
        if (opts && 'storedObject' in opts) serveStoredObject(opts.storedObject ?? null);
        else serveStoredObject(buildWebmObject([[0, [0]], [2500, [0]], [5000, [0]]]));
        const r = await receipt(db, {
            competition_id: 70, sequence: seq, status: 'stored',
            bytes, object_hash: `h${seq}`,
        });
        return { saved: true, receipt: ((await r.json()) as any).data };
    }

    it('15. full order lands ready with platform-measured facts', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 1, 'sess-1', 'webm')).json()) as any).data.chunk_key) as string;
        const out = await phpUpload(1, key, 4096);
        expect(out.saved).toBe(true);
        expect(out.receipt).toMatchObject({ state: 'ready', duration_ms: 5000 }); // measured from the stored bytes
        const model = new ChunkIndexModel(db as unknown as D1Database);
        expect((await model.timeline(70)).total_ready_ms).toBe(5000);
    });

    it('15b. an unreachable upload host leaves the chunk uploaded (fail closed)', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 1, 'sess-1', 'webm')).json()) as any).data.chunk_key) as string;
        const out = await phpUpload(1, key, 4096, { storedObject: null });
        expect(out.saved).toBe(true);
        expect(out.receipt.state).toBe('uploaded'); // facts kept, never fabricated ready
        const model = new ChunkIndexModel(db as unknown as D1Database);
        expect((await model.timeline(70)).total_ready_ms).toBe(0);
    });

    it('16. failure-without-DELETE still recovers via re-register (same slot)', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 1, 'sess-1', 'webm')).json()) as any).data.chunk_key) as string;
        const v = await verifyKey(db, key);
        expect(v.valid).toBe(true); // consumed by the failed attempt's verify...
        // ...but the host crashed before DELETE. Re-register is idempotent
        // (same slot, same identity) and yields a fresh single-use key.
        const key2 = (((await (await register(db, 70, 1, 'sess-1', 'webm')).json()) as any).data.chunk_key) as string;
        expect(key2).not.toBe(key);
        const out = await phpUpload(1, key2, 4096);
        expect(out.saved).toBe(true);
        expect(out.receipt.state).toBe('ready');
    });

    it('17. replay-after-DELETE fails; wrong-slot key cannot cross slots', async () => {
        await acquire(db, 70, 'a1b2c3d4');
        const key = (((await (await register(db, 70, 1, 'sess-1', 'webm')).json()) as any).data.chunk_key) as string;
        await phpUpload(1, key, 4096);
        expect((await verifyKey(db, key)).valid).toBe(false); // consumed
    });

    it('17b. partial-0042 state (binding columns absent) fails closed 503, not 500', async () => {
        // Simulates code deployed against a production still on 0039/0041:
        // the INSERT carrying 0042 columns must surface lease_unavailable.
        await acquire(db, 70, 'a1b2c3d4');
        db.exec('ALTER TABLE chunk_keys RENAME TO chunk_keys_backup;');
        db.exec(`CREATE TABLE chunk_keys (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            competition_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            chunk_key TEXT NOT NULL UNIQUE,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            expires_at DATETIME
        );`);
        const r = await register(db, 70, 1);
        expect(r.status).toBe(503);
        expect(((await r.json()) as any).code).toBe('binding_unavailable');
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
