/**
 * UNIT30.6 / D-02 — terminal not-recorded verdict for the zero-chunk
 * completed competition.
 *
 * Production evidence (competition 2263, 2026-10-25): a very short stream
 * plus an early end recorded ZERO chunks. The finals marker EXISTS with
 * zero counts, the D1 index has zero rows, and no recording lease is held —
 * so no chunk can ever arrive. Yet GET /api/chunks/playlist/:id served the
 * legacy empty shape with no verdict, so the competition page polled the
 * processing state for minutes, painted the recorded badge before
 * verification, and showed a zero-duration/zero-size "recording".
 *
 * Contract (15 §15.10 D-02 + 05 §2 "completed بلا تسجيل ليس مسجل"):
 *  - completed + zero index rows + NO active authorized drain → the
 *    response carries the additive authoritative verdict
 *    (index_metadata.recording_state === 'none') — additive only;
 *  - an actively held lease (authorized drain may still land its tail)
 *    or a live competition with no marker → NO verdict: the existing
 *    bounded-poll / live-waiting contracts stay byte-identical;
 *  - completed competitions WITH rows keep the d1-authority playlist.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../../src/main';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';

const realFetch = globalThis.fetch;

function stubUpstream(handler: (url: string) => any) {
    (globalThis as any).fetch = async (url: any) => handler(String(url));
}

const okJson = (data: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
});

let db: SqliteD1;

const get = (id: number) =>
    app.request(
        `/api/chunks/playlist/${id}`,
        { headers: { 'X-CSRF-Token': 'test' } },
        { DB: db as unknown as D1Database } as never
    );

function seed(): void {
    db.exec(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_active)
        VALUES (1, 'u306z@test.local', 'u306z', 'x', 'U306Z', 1);
        INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'u306z', 'U306Z', 'U306Z');
        INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type) VALUES
            (9301, 'zero terminal', 'R', 1, 1, NULL, 'completed', 'instant'),
            (9302, 'drain held',    'R', 1, 1, NULL, 'completed', 'instant'),
            (9303, 'stale lease',   'R', 1, 1, NULL, 'completed', 'instant'),
            (9304, 'live zero',     'R', 1, 1, NULL, 'live',      'instant');
        -- Zero-chunk finals markers (the production 2263 shape).
        INSERT INTO recording_finals (competition_id, finalized_at, uploaded_count, ready_count, total_ready_ms) VALUES
            (9301, '2026-10-25T23:36:01.185Z', 0, 0, 0),
            (9302, '2026-10-25T23:36:01.185Z', 0, 0, 0),
            (9303, '2026-10-25T23:36:01.185Z', 0, 0, 0);
        -- Actively held lease: the authorized drain contract must survive.
        INSERT INTO recording_leases (competition_id, holder_hash, generation, acquired_at, last_heartbeat_at, ttl_seconds)
            VALUES (9302, 'holder', 1, datetime('now'), datetime('now'), 45);
        -- Stale lease: heartbeat far older than the TTL → no active drain.
        INSERT INTO recording_leases (competition_id, holder_hash, generation, acquired_at, last_heartbeat_at, ttl_seconds)
            VALUES (9303, 'holder', 1, datetime('now', '-120 seconds'), datetime('now', '-120 seconds'), 45);
    `);
}

beforeEach(() => {
    db = createSqliteD1();
    seed();
    stubUpstream(() => okJson({ chunks: [] }));
});

afterEach(() => {
    globalThis.fetch = realFetch;
    db.close();
});

describe('UNIT30.6 D-02: playlist proxy terminal not-recorded verdict', () => {
    it('completed + zero rows + marker + no lease → recording_state none (additive metadata)', async () => {
        const body: any = await (await get(9301)).json();
        expect(body.success).toBe(true);
        expect(body.upstream).toBe('empty');
        expect(body.chunks).toEqual([]);
        expect(body.index_source).toBe('d1');
        expect(body.index_metadata).toBeTruthy();
        expect(body.index_metadata.recording_state).toBe('none');
        expect(body.index_metadata.finalized).toBe(true);
        expect(body.index_metadata.finalized_at).toBe('2026-10-25T23:36:01.185Z');
        expect(body.index_metadata.ready_count).toBe(0);
        expect(body.index_metadata.uploaded_count).toBe(0);
        expect(body.index_metadata.total_ready_ms).toBe(0);
    });

    it('actively held lease keeps the drain contract — no verdict, legacy shape', async () => {
        const body: any = await (await get(9302)).json();
        expect(body.upstream).toBe('empty');
        expect(body.chunks).toEqual([]);
        expect(body.index_metadata).toBeUndefined();
    });

    it('stale lease is not an active drain — verdict fires', async () => {
        const body: any = await (await get(9303)).json();
        expect(body.index_metadata).toBeTruthy();
        expect(body.index_metadata.recording_state).toBe('none');
    });

    it('live competition with zero chunks keeps the live waiting contract (no marker, no verdict)', async () => {
        const body: any = await (await get(9304)).json();
        expect(body.upstream).toBe('empty');
        expect(body.index_metadata).toBeUndefined();
    });

    it('completed competition WITH rows keeps the d1-authority playlist (no verdict)', async () => {
        db.exec(`
            INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type)
                VALUES (9305, 'with chunks', 'R', 1, 1, NULL, 'completed', 'instant');
            INSERT INTO recording_chunks
                (competition_id, generation, sequence, object_path, container, bytes, duration_ms, state, created_at, updated_at)
            VALUES
                (9305, 1, 1, 'live/match_9305/chunk_0001.mp4', 'mp4', 1000, 4000, 'ready', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
                (9305, 1, 2, 'live/match_9305/chunk_0002.mp4', 'mp4', 1000, 4000, 'ready', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z');
            INSERT INTO recording_finals (competition_id, finalized_at, uploaded_count, ready_count, total_ready_ms)
                VALUES (9305, '2026-10-25T23:28:18.325Z', 2, 2, 8000);
        `);
        const body: any = await (await get(9305)).json();
        expect(body.upstream).toBe('ok');
        expect(body.index_source).toBe('d1');
        expect(body.chunks.length).toBe(2);
        expect(body.index_metadata.ready_count).toBe(2);
        expect(body.index_metadata.recording_state).toBeUndefined();
    });

    it('verdict also attaches when upstream is invalid (HTML 200) — D1 is the authority', async () => {
        stubUpstream(() => okJson('<html><body>Not Found</body></html>'));
        const body: any = await (await get(9301)).json();
        expect(body.upstream).toBe('invalid');
        expect(body.index_metadata.recording_state).toBe('none');
    });

    it('no DB in env stays legacy (no crash, no verdict)', async () => {
        const res = await app.request(
            '/api/chunks/playlist/9301',
            { headers: { 'X-CSRF-Token': 'test' } },
            {} as never
        );
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.upstream).toBe('empty');
        expect(body.index_metadata).toBeUndefined();
    });

    it('result-page data stays available for the zero-recording competition', async () => {
        const res = await app.request(
            '/api/competitions/9301?lang=en',
            { headers: { 'X-CSRF-Token': 'test' } },
            { DB: db as unknown as D1Database } as never
        );
        expect(res.status).toBe(200);
        const body: any = await res.json();
        const comp = body.data ?? body;
        expect(comp.status).toBe('completed');
    });
});
