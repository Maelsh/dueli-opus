/**
 * R4-CHUNK-UPLOAD-SAFE-1 (row 28) — exclusive host recorder (lease/fencing).
 *
 * EXTRACTED from PR110/HOLD (commit 6e7ca1039484980affbcaf6f0eab548a82c35d17,
 * path tests/api/recording-lease.test.ts) with row-28 adaptations: the
 * competition_status publish assertions (PR110 transition feature, row 30
 * territory) are removed — this suite pins the extracted lease lifecycle
 * only (model atomicity + route gates + end-release). PR110 is preserved.
 *
 * Server contract under test:
 *  - RecordingLeaseModel: atomic acquire / same-holder idempotency /
 *    active-holder rejection / generation-fenced heartbeat / release /
 *    TTL-expiry takeover / unconditional end-release / race safety.
 *  - POST /api/chunks/lease/{acquire,heartbeat,release} + GET /lease/:id:
 *    auth (401), creator-only (403), live-only (404), 409 lease_held with
 *    expiry info, 503 lease_unavailable only when the store is missing.
 *  - /end frees the lease so no competition stays locked.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { RecordingLeaseModel } from '../../src/models/RecordingLeaseModel';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function authed(token: string | undefined, method = 'GET', body?: unknown) {
    const h: Record<string, string> = { 'X-CSRF-Token': 'recording-lease-test' };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) {
        h['Content-Type'] = 'application/json';
        return { method, headers: h, body: JSON.stringify(body) };
    }
    return { method, headers: h };
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

describe('R4-CHUNK-UPLOAD-SAFE-1 recording lease (model)', () => {
    let db: SqliteD1;
    let model: RecordingLeaseModel;

    beforeEach(async () => {
        db = new SqliteD1();
        // recording_leases has an FK to competitions (cascade cleanup) —
        // seed the referenced rows (users + category + competition).
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active) VALUES (1, 'a@t.local', 'host_a', 'x', 'A', 1)`
        ).run();
        await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'test', 'T', 'T')`).run().catch(() => undefined);
        await db.prepare(
            `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status) VALUES (7, 'T', 'R', 1, 1, NULL, 'pending')`
        ).run();
        model = new RecordingLeaseModel(db as unknown as D1Database);
    });

    it('1. first acquire wins as generation 1 and reports held', async () => {
        const r = await model.acquire(7, 'hash-A');
        expect(r).toEqual({ acquired: true, generation: 1, took_over: false });
        const st = await model.status(7);
        expect(st.held).toBe(true);
        expect(st.generation).toBe(1);
    });

    it('2. same-holder re-acquire is idempotent (no generation bump)', async () => {
        await model.acquire(7, 'hash-A');
        const r = await model.acquire(7, 'hash-A');
        expect(r).toEqual({ acquired: true, generation: 1, took_over: false });
    });

    it('3. another holder is rejected while active (with expiry info)', async () => {
        await model.acquire(7, 'hash-A');
        const r = await model.acquire(7, 'hash-B');
        expect(r.acquired).toBe(false);
        if (!r.acquired) {
            expect(r.reason).toBe('held');
            expect(r.generation).toBe(1);
            expect(r.expires_in_seconds).toBeGreaterThan(0);
        }
    });

    it('4. heartbeat succeeds for holder+generation, fails otherwise', async () => {
        await model.acquire(7, 'hash-A');
        expect(await model.heartbeat(7, 'hash-A', 1)).toEqual({ held: true, generation: 1 });
        expect((await model.heartbeat(7, 'hash-A', 99)).held).toBe(false);
        expect((await model.heartbeat(7, 'hash-B', 1)).held).toBe(false);
    });

    it('5. release frees the lease; next holder takes over at generation+1', async () => {
        await model.acquire(7, 'hash-A');
        expect(await model.release(7, 'hash-A')).toBe(true);
        expect((await model.status(7)).held).toBe(false);
        const r = await model.acquire(7, 'hash-B');
        expect(r).toEqual({ acquired: true, generation: 2, took_over: true });
    });

    it('6. expired leases (no heartbeat past TTL) are taken over, generation bumps', async () => {
        await model.acquire(7, 'hash-A', 45);
        await db.prepare(`UPDATE recording_leases SET last_heartbeat_at = datetime('now', '-120 seconds') WHERE competition_id = 7`).run();
        expect((await model.status(7)).held).toBe(false);
        const r = await model.acquire(7, 'hash-B');
        expect(r).toEqual({ acquired: true, generation: 2, took_over: true });
    });

    it('7. releaseForCompetition frees any holder unconditionally (end path)', async () => {
        await model.acquire(7, 'hash-A');
        await model.releaseForCompetition(7);
        expect((await model.status(7)).held).toBe(false);
    });

    it('8. concurrent double-acquire: exactly one winner, atomic', async () => {
        const [r1, r2] = await Promise.all([model.acquire(7, 'hash-A'), model.acquire(7, 'hash-B')]);
        const winners = [r1, r2].filter((r) => r.acquired);
        expect(winners.length).toBe(1);
        const st = await model.status(7);
        expect(st.held).toBe(true);
        expect(st.generation).toBe(1);
    });
});

describe('R4-CHUNK-UPLOAD-SAFE-1 recording lease (routes)', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seedUsers(db);
    });

    it('9. auth + creator + live gates (401/403/404)', async () => {
        await seedComp(db, 50, 'live', 2);
        const anon = await app.request('/api/chunks/lease/acquire', authed(undefined, 'POST', { competition_id: 50, holder_nonce: 'a1b2c3d4' }), env(db));
        expect(anon.status).toBe(401);
        const stranger = await app.request('/api/chunks/lease/acquire', authed('sess-3', 'POST', { competition_id: 50, holder_nonce: 'a1b2c3d4' }), env(db));
        expect(stranger.status).toBe(403);
        await seedComp(db, 51, 'pending', null);
        const pending = await app.request('/api/chunks/lease/acquire', authed('sess-1', 'POST', { competition_id: 51, holder_nonce: 'a1b2c3d4' }), env(db));
        expect(pending.status).toBe(404);
    });

    it('10. two host sessions race: one holds (200), the other gets 409 lease_held', async () => {
        await seedComp(db, 50, 'live', 2);
        const first = await app.request('/api/chunks/lease/acquire', authed('sess-1', 'POST', { competition_id: 50, holder_nonce: 'a1b2c3d4' }), env(db));
        expect(first.status).toBe(200);
        // Same bearer token but a different per-tab nonce = different holder.
        const second = await app.request('/api/chunks/lease/acquire', authed('sess-1', 'POST', { competition_id: 50, holder_nonce: 'e5f6071829aa' }), env(db));
        expect(second.status).toBe(409);
        const body: any = await second.json();
        expect(body.code).toBe('lease_held');
        expect(body.expires_in_seconds).toBeGreaterThan(0);
    });

    it('11. heartbeat generation fencing + release + public status', async () => {
        await seedComp(db, 50, 'live', 2);
        await app.request('/api/chunks/lease/acquire', authed('sess-1', 'POST', { competition_id: 50, holder_nonce: 'a1b2c3d4' }), env(db));
        const stale = await app.request('/api/chunks/lease/heartbeat', authed('sess-1', 'POST', { competition_id: 50, holder_nonce: 'a1b2c3d4', generation: 99 }), env(db));
        expect(((await stale.json()) as any).data.held).toBe(false);
        const ok = await app.request('/api/chunks/lease/heartbeat', authed('sess-1', 'POST', { competition_id: 50, holder_nonce: 'a1b2c3d4', generation: 1 }), env(db));
        expect(((await ok.json()) as any).data).toMatchObject({ held: true, generation: 1 });
        const rel = await app.request('/api/chunks/lease/release', authed('sess-1', 'POST', { competition_id: 50, holder_nonce: 'a1b2c3d4' }), env(db));
        expect(((await rel.json()) as any).data.released).toBe(true);
        const st = await app.request('/api/chunks/lease/50', authed('sess-1'), env(db));
        expect(((await st.json()) as any).data.held).toBe(false);
    });

    it('12. /end frees the lease (no stuck lock survives an end)', async () => {
        await seedComp(db, 50, 'live', 2);
        await app.request('/api/chunks/lease/acquire', authed('sess-1', 'POST', { competition_id: 50, holder_nonce: 'a1b2c3d4' }), env(db));
        const end = await app.request('/api/competitions/50/end', authed('sess-1', 'POST', { vod_url: 'https://cdn.example/vod/match_50.mp4' }), env(db));
        expect(end.status).toBe(200);
        const st = await app.request('/api/chunks/lease/50', authed('sess-1'), env(db));
        expect(((await st.json()) as any).data.held).toBe(false);
        // A post-end acquire starts a fresh generation (recovery path).
        const reacquire = await app.request('/api/chunks/lease/acquire', authed('sess-1', 'POST', { competition_id: 50, holder_nonce: 'a1b2c3d4' }), env(db));
        expect(reacquire.status).toBe(404); // competition no longer live — fail closed
    });
});
