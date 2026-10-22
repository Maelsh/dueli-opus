import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

function env(db: SqliteD1) {
    return { DB: db, FFMPEG_SERVER_URL: 'https://upload.example.com' } as unknown as Parameters<typeof app.request>[2];
}

const auth = (sessionId: string | null) => {
    const headers: Record<string, string> = { 'X-CSRF-Token': 'download-route-test' };
    if (sessionId) headers.Authorization = `Bearer ${sessionId}`;
    return { headers };
};

const get = (db: SqliteD1, path: string, sessionId: string | null = 'sess-3') =>
    app.request(path, auth(sessionId), env(db));

async function seed(db: SqliteD1) {
    for (const [id, name] of [[1, 'host'], [2, 'opponent'], [3, 'viewer']] as const) {
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active) VALUES (?, ?, ?, 'x', ?, 1)`
        ).bind(id, `${name}@t.local`, name, name).run();
        await db.prepare(
            `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))`
        ).bind(`sess-${id}`, id).run();
    }
    await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'test', 'T', 'T')`).run().catch(() => undefined);

    for (const [id, opponent, status] of [[70, 2, 'completed'], [71, null, 'live']] as const) {
        await db.prepare(
            `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status) VALUES (?, 'T', 'R', 1, 1, ?, ?)`
        ).bind(id, opponent, status).run();
    }

    const insertChunk = (competitionId: number, sequence: number, state: string, duration: number | null) =>
        db.prepare(
            `INSERT INTO recording_chunks
             (competition_id, generation, sequence, object_path, object_hash, container, codec_video, codec_audio, bytes, declared_duration_ms, duration_ms, state, created_at, updated_at)
             VALUES (?, 1, ?, ?, NULL, 'mp4', 'h264', 'aac', 1000, NULL, ?, ?, '2026-10-22T09:00:00.000Z', '2026-10-22T09:00:00.000Z')`
        ).bind(competitionId, sequence, `live/match_${competitionId}/chunk_${String(sequence).padStart(4, '0')}.mp4`, duration, state).run();

    await insertChunk(70, 1, 'ready', 5000);
    await insertChunk(70, 2, 'ready', 5000);
    await insertChunk(70, 3, 'ready', 5000);
    await db.prepare(
        `INSERT INTO recording_finals (competition_id, finalized_at, uploaded_count, ready_count, total_ready_ms, marker_generation)
         VALUES (70, '2026-10-22T10:00:00.000Z', 3, 3, 15000, 1)`
    ).run();

    // Finalized but gapped: seq 2 is missing, seq 3 is uploaded (unverified).
    await insertChunk(71, 1, 'ready', 4000);
    await insertChunk(71, 3, 'uploaded', null);
    await db.prepare(
        `INSERT INTO recording_finals (competition_id, finalized_at, uploaded_count, ready_count, total_ready_ms, marker_generation)
         VALUES (71, '2026-10-22T10:00:00.000Z', 2, 1, 4000, 1)`
    ).run();
}

describe('GET /api/chunks/download/:id', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    afterEach(() => db.close());

    it('returns the complete authenticated manifest with viewer rights and private caching', async () => {
        const res = await get(db, '/api/chunks/download/70');
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control')).toContain('private');
        expect(res.headers.get('cache-control')).toContain('no-store');
        expect(res.headers.get('vary')).toContain('Authorization');
        const body = await res.json() as any;
        expect(body.success).toBe(true);
        expect(body.data).toMatchObject({
            competition_id: 70,
            role: 'viewer',
            finalized: true,
            complete: true,
            format: 'mp4',
            mode: 'mp4-remux',
            total_duration_ms: 15000,
            total_bytes: 3000,
        });
        expect(body.data.rights.notice_key).toBe('download_ui.rights_viewer');
        expect(body.data.chunks).toHaveLength(3);
        expect(body.data.chunks[0]).toMatchObject({
            sequence: 1,
            timeline_start_ms: 0,
            duration_ms: 5000,
            container: 'mp4',
        });
        expect(body.data.chunks[0].url).toBe('https://upload.example.com/stream.php?path=live/match_70/chunk_0001.mp4');
        expect(body.data.gaps).toEqual([]);
    });

    it('gives competitors the competitor rights notice', async () => {
        const creator = await (await get(db, '/api/chunks/download/70', 'sess-1')).json() as any;
        const opponent = await (await get(db, '/api/chunks/download/70', 'sess-2')).json() as any;
        expect(creator.data.role).toBe('creator');
        expect(opponent.data.role).toBe('opponent');
        expect(creator.data.rights.notice_key).toBe('download_ui.rights_competitor');
        expect(opponent.data.rights.republication).toBe('competitors_may_republish_and_monetize');
    });

    it('never labels a gapped/unverified recording complete', async () => {
        const res = await get(db, '/api/chunks/download/71');
        expect(res.status).toBe(200);
        const body = await res.json() as any;
        expect(body.data.complete).toBe(false);
        expect(body.data.gaps).toEqual([2]);
        expect(body.data.unready_sequences).toEqual([3]);
        expect(body.data.chunks.map((c: any) => c.sequence)).toEqual([1]);
        expect(body.data.counts).toMatchObject({ ready: 1, uploaded: 1, missing: 1 });
        expect(body.data.blockers).toEqual(expect.arrayContaining([
            expect.objectContaining({ code: 'recording_incomplete', sequences: [2] }),
            expect.objectContaining({ code: 'unready_chunks', sequences: [3] }),
        ]));
    });

    it('rejects guests (download metadata is authenticated only)', async () => {
        const res = await get(db, '/api/chunks/download/70', null);
        expect(res.status).toBe(401);
    });

    it('returns 404 for an unknown competition and 400 for a malformed id', async () => {
        expect((await get(db, '/api/chunks/download/999')).status).toBe(404);
        expect((await get(db, '/api/chunks/download/not-a-number')).status).toBe(400);
    });
});
