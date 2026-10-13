/**
 * R4-CHUNK-INDEX-1 (row 27) — D1 chunk metadata authority, focused T/B.
 *
 * Model (SqliteD1 runs the real migrations incl. 0041):
 *  - ordering / idempotent retry / conflict-without-overwrite;
 *  - client declarations NEVER mark ready; receipts do (idempotent; failed
 *    terminal; bad input rejected);
 *  - gaps / resume base / range / continuation / timeline / time lookup
 *    (confirmed prefix only — nothing invented);
 *  - writer guards (live + host-only) and input validation;
 *  - final marker idempotency + ended-vs-finalized distinction;
 *  - legacy import mapping (uploaded-only, skips unmatchable).
 *
 * Routes (same file, app.request with stubbed upstream + seeded D1):
 *  - legacy contract byte-identical when D1 has no rows (proxy ok / empty
 *    / invalid / error / bad id / cache header / no-DB env);
 *  - D1 authority when rows exist (annotations, verified durations,
 *    orphans, gaps metadata; dead proxy still serves video);
 *  - missing 0041 table degrades to proxy-only (deployment window);
 *  - /end snapshots the final marker without blocking the transition.
 *
 * Manifest: known_history carries 0041 (membership, no new baseline).
 */
import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { ChunkIndexModel } from '../../src/models/ChunkIndexModel';

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(resolve(__dirname, '../../dev-tools/release-schema-manifest.json'), 'utf-8'));

const realFetch = globalThis.fetch;
function stubUpstream(handler: (url: string) => any) {
    (globalThis as any).fetch = async (url: any) => handler(String(url));
}
const okJson = (data: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
});

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}
function authed(token: string | undefined, method = 'GET', body?: unknown) {
    const h: Record<string, string> = { 'X-CSRF-Token': 'chunk-index-test' };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) {
        h['Content-Type'] = 'application/json';
        return { method, headers: h, body: JSON.stringify(body) };
    }
    return { method, headers: h };
}
const get = (db: SqliteD1, path: string) =>
    app.request(path, { headers: { 'X-CSRF-Token': 'chunk-index-test' } }, env(db));

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

const chunk = (seq: number, extra?: Record<string, unknown>) => ({
    sequence: seq,
    object_path: `live/match_50/chunk_${String(seq).padStart(4, '0')}.mp4`,
    container: 'mp4' as const,
    ...(extra ?? {}),
});

describe('R4-CHUNK-INDEX-1 chunk metadata (model)', () => {
    let db: SqliteD1;
    let model: ChunkIndexModel;

    beforeEach(async () => {
        db = new SqliteD1();
        await seedUsers(db);
        await seedComp(db, 50, 'live', 2);
        model = new ChunkIndexModel(db as unknown as D1Database);
    });

    afterEach(() => { db.close(); });

    it('1. unordered records read back in sequence order', async () => {
        await model.recordChunk(50, chunk(3), 1);
        await model.recordChunk(50, chunk(1), 1);
        await model.recordChunk(50, chunk(2), 1);
        const rows = await model.listOrdered(50);
        expect(rows.map((r) => r.sequence)).toEqual([1, 2, 3]);
        expect(rows[0].state).toBe('uploaded');
    });

    it('2. identical retry is idempotent (no duplicate slot)', async () => {
        const first = await model.recordChunk(50, chunk(1, { bytes: 100 }), 1);
        const second = await model.recordChunk(50, chunk(1, { bytes: 100 }), 1);
        expect(second.id).toBe(first.id);
        expect((await model.listOrdered(50)).length).toBe(1);
    });

    it('3. same sequence with different bytes is a CONFLICT (never overwrites)', async () => {
        await model.recordChunk(50, chunk(1, { bytes: 100 }), 1);
        const attempt = model.recordChunk(50, chunk(1, { bytes: 999 }), 1);
        await expect(attempt).rejects.toMatchObject({ code: 'CONFLICT' });
        const rows = await model.listOrdered(50);
        expect(rows.length).toBe(1);
        expect(rows[0].bytes).toBe(100);
        expect(rows[0].object_path).toContain('chunk_0001.mp4');
    });

    it('4. client-declared duration NEVER marks ready (declared only)', async () => {
        const row = await model.recordChunk(50, chunk(1, { bytes: 100, declared_duration_ms: 10000 }), 1);
        expect(row.state).toBe('uploaded');
        expect(row.duration_ms).toBeNull();
        expect(row.declared_duration_ms).toBe(10000);
    });

    it('5. receipt confirms once (verified duration); re-confirm idempotent; failed terminal', async () => {
        await model.recordChunk(50, chunk(1, { bytes: 100 }), 1);
        const ready = await model.confirmChunk(50, 1, { duration_ms: 10000, bytes: 100, object_hash: 'h1' });
        expect(ready.state).toBe('ready');
        expect(ready.duration_ms).toBe(10000);
        expect(ready.object_hash).toBe('h1');
        const again = await model.confirmChunk(50, 1, { duration_ms: 10000 });
        expect(again.state).toBe('ready');
        await model.recordChunk(50, chunk(2), 1);
        // ROW28 item 5: the failure mutation is bound to the registered
        // generation AND the current lease generation (atomic guard).
        await db.prepare(
            `INSERT INTO recording_leases (competition_id, holder_hash, generation, acquired_at, last_heartbeat_at, ttl_seconds, released_at)
             VALUES (50, 'holder-1', 1, datetime('now'), datetime('now'), 45, NULL)`
        ).run();
        await model.failChunk(50, 2, { lease_generation: 1 });
        await expect(model.confirmChunk(50, 2, { duration_ms: 5000 })).rejects.toMatchObject({ code: 'FINAL' });
        // A superseded generation (lease row moved to 2) is refused before any write.
        await db.prepare('UPDATE recording_leases SET generation = 2 WHERE competition_id = 50').run();
        await model.recordChunk(50, chunk(3), 1);
        await expect(model.failChunk(50, 3, { lease_generation: 1 })).rejects.toMatchObject({ code: 'STALE_GENERATION' });
        await expect(model.confirmChunk(50, 99, { duration_ms: 5000 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
        await expect(model.confirmChunk(50, 1, { duration_ms: -5 })).rejects.toMatchObject({ code: 'BAD_INPUT' });
    });

    it('6. writer guards: live-only, host-only, validated input', async () => {
        await seedComp(db, 51, 'pending', null);
        await expect(model.recordChunk(51, chunk(1), 1)).rejects.toMatchObject({ code: 'NOT_LIVE' });
        await expect(model.recordChunk(50, chunk(1), 2)).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(model.recordChunk(50, chunk(1), 3)).rejects.toMatchObject({ code: 'FORBIDDEN' });
        await expect(model.recordChunk(999, chunk(1), 1)).rejects.toMatchObject({ code: 'NO_COMPETITION' });
        await expect(model.recordChunk(50, { sequence: 0, object_path: 'x', container: 'mp4' }, 1)).rejects.toMatchObject({ code: 'BAD_INPUT' });
        await expect(model.recordChunk(50, { sequence: 1, object_path: '', container: 'mp4' }, 1)).rejects.toMatchObject({ code: 'BAD_INPUT' });
        await expect(model.recordChunk(50, { sequence: 1, object_path: 'x', container: 'avi' as any }, 1)).rejects.toMatchObject({ code: 'BAD_INPUT' });
    });

    it('7. gaps, resume base, range, continuation are bounded and exact', async () => {
        for (const seq of [1, 2, 4, 5]) await model.recordChunk(50, chunk(seq), 1);
        // R4-CHUNK-UPLOAD-SAFE-1: gap scans report truncation past the bound.
        expect(await model.detectGaps(50)).toEqual({ max: 5, missing: [3], truncated: false });
        expect(await model.resumeBase(50)).toBe(5);
        expect((await model.listRange(50, 2, 4)).map((r) => r.sequence)).toEqual([2, 4]);
        await expect(model.listRange(50, 4, 2)).rejects.toMatchObject({ code: 'BAD_INPUT' });
        expect((await model.continuation(50, 2, 2)).map((r) => r.sequence)).toEqual([4, 5]);
        expect((await model.continuation(50, 0, 2)).map((r) => r.sequence)).toEqual([1, 2]);
        expect(await model.detectGaps(51)).toEqual({ max: 0, missing: [], truncated: false });
    });

    it('8. timeline + time lookup use the confirmed prefix only', async () => {
        await model.recordChunk(50, chunk(1), 1);
        await model.recordChunk(50, chunk(2), 1);
        await model.recordChunk(50, chunk(3), 1);
        await model.confirmChunk(50, 1, { duration_ms: 10000 });
        await model.confirmChunk(50, 3, { duration_ms: 6000 }); // gap at 2 stays a gap
        const tl = await model.timeline(50);
        expect(tl.entries.map((e) => [e.sequence, e.timeline_start_ms])).toEqual([[1, 0], [3, 10000]]);
        expect(tl.total_ready_ms).toBe(16000);
        expect(await model.timeLookup(50, 0)).toEqual({ sequence: 1, offset_ms: 0 });
        expect(await model.timeLookup(50, 9999)).toEqual({ sequence: 1, offset_ms: 9999 });
        expect(await model.timeLookup(50, 10000)).toEqual({ sequence: 3, offset_ms: 0 });
        expect(await model.timeLookup(50, 16000)).toBeNull(); // past the end — never invented
        expect(await model.timeLookup(51, 0)).toBeNull(); // nothing confirmed
        expect(await model.timeLookup(50, -1)).toBeNull();
    });

    it('9. final marker is idempotent; ended-vs-finalized stays distinct', async () => {
        await model.recordChunk(50, chunk(1), 1);
        await model.confirmChunk(50, 1, { duration_ms: 8000 });
        await model.recordChunk(50, chunk(2), 1);
        const first = await model.recordFinalMarker(50, 3);
        expect(first.ready_count).toBe(1);
        expect(first.uploaded_count).toBe(2);
        expect(first.total_ready_ms).toBe(8000);
        expect(first.marker_generation).toBe(3);
        const second = await model.recordFinalMarker(50, 9);
        expect(second.finalized_at).toBe(first.finalized_at); // winner kept
        let status = await model.recordingStatus(50);
        expect(status.ended).toBe(false); // live comp: ended false, finalized true
        expect(status.finalized).toBe(true);
        expect(status.ready).toBe(1);
        await db.prepare(`UPDATE competitions SET status = 'completed' WHERE id = 50`).run();
        status = await model.recordingStatus(50);
        expect(status.ended).toBe(true);
        expect(status.finalized).toBe(true);
    });

    it('10. legacy import maps filename numbers to uploaded-only rows (never ready)', async () => {
        const res = await model.importFromPlaylist(50, [
            { index: 0, url: 'https://cdn.example/live/match_50/chunk_0001.mp4', duration: 10, size: 500 },
            { index: 1, file: 'chunk_0002.mp4', duration: 9 },
            { nope: true },
            { index: 7, url: 'https://cdn.example/unrelated.mp4' },
        ], 1);
        expect(res).toEqual({ imported: 2, skipped: 2 });
        const rows = await model.listOrdered(50);
        expect(rows.map((r) => r.sequence)).toEqual([1, 2]);
        expect(rows.every((r) => r.state === 'uploaded')).toBe(true);
        expect(rows.every((r) => r.duration_ms === null)).toBe(true);
        expect(rows[0].declared_duration_ms).toBe(10000);
        expect(rows[0].object_path).toBe('live/match_50/chunk_0001.mp4');
    });

    it('11. bounded reads: 120 seeded chunks page exactly', async () => {
        for (let n = 1; n <= 120; n++) {
            await model.recordChunk(50, chunk(n), 1);
        }
        const page = await model.continuation(50, 100, 10);
        expect(page.map((r) => r.sequence)).toEqual([101, 102, 103, 104, 105, 106, 107, 108, 109, 110]);
        const limited = await model.listOrdered(50, { limit: 5 });
        expect(limited.length).toBe(5);
        expect((await model.listOrdered(50, { states: ['ready'] })).length).toBe(0);
    });
});

describe('R4-CHUNK-INDEX-1 playlist compatibility (routes)', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seedUsers(db);
        stubUpstream(() => okJson({ chunks: [] }));
    });

    afterEach(() => {
        globalThis.fetch = realFetch;
        db.close();
    });

    it('12. legacy shape byte-identical when D1 is empty (ok / empty / invalid / error)', async () => {
        stubUpstream(() => okJson({
            chunks: [
                { chunk_number: 3, url: 'https://cdn.example/live/match_9/chunk_0003.mp4', duration: 5, size: 100 },
                { index: 1, file: 'chunk_0001.mp4', duration: 5 },
            ],
        }));
        const ok: any = await (await get(db, '/api/chunks/playlist/9')).json();
        expect(ok.chunks.map((c: any) => c.index)).toEqual([1, 3]);
        expect(ok.chunk_count).toBe(2);
        expect(ok.max_index).toBe(3);
        expect(ok.total_duration).toBe(10);
        expect(ok.upstream).toBe('ok');
        expect('index_source' in ok).toBe(false); // no new fields without D1 rows
        expect('index_metadata' in ok).toBe(false);

        stubUpstream(() => okJson({ chunks: [] }));
        const empty: any = await (await get(db, '/api/chunks/playlist/9')).json();
        expect(empty.upstream).toBe('empty');
        expect(empty.chunks).toEqual([]);
        expect(empty.max_index).toBe(-1);

        stubUpstream(() => okJson('<html>nope</html>'));
        expect(((await (await get(db, '/api/chunks/playlist/9')).json()) as any).upstream).toBe('invalid');
        stubUpstream(async () => { throw new Error('down'); });
        expect(((await (await get(db, '/api/chunks/playlist/9')).json()) as any).upstream).toBe('error');
    });

    it('13. playlist stays public + cache header untouched', async () => {
        stubUpstream(() => okJson({ chunks: [{ index: 0, url: 'https://cdn.example/c.mp4' }] }));
        const res = await app.request('/api/chunks/playlist/9', { headers: { 'X-CSRF-Token': 't' } }, env(db));
        expect(res.status).toBe(200);
        expect(res.headers.get('cache-control') || '').toContain('max-age=5');
    });

    it('14. no-DB env still serves proxy-only (zero-D1 regression pin)', async () => {
        stubUpstream(() => okJson({ chunks: [{ index: 0, url: 'https://cdn.example/c.mp4' }] }));
        const res = await app.request('/api/chunks/playlist/9', { headers: { 'X-CSRF-Token': 't' } }, {} as any);
        expect(res.status).toBe(200);
        expect(((await res.json()) as any).upstream).toBe('ok');
    });

    it('15. D1 rows annotate + verify + report gaps (merged source)', async () => {
        await seedComp(db, 60, 'live', 2);
        const model = new ChunkIndexModel(db as unknown as D1Database);
        await model.recordChunk(60, { sequence: 1, object_path: 'live/match_60/chunk_0001.mp4', container: 'mp4', declared_duration_ms: 4000 }, 1);
        await model.recordChunk(60, { sequence: 2, object_path: 'live/match_60/chunk_0002.mp4', container: 'mp4', declared_duration_ms: 9000 }, 1);
        await model.recordChunk(60, { sequence: 4, object_path: 'live/match_60/chunk_0004.mp4', container: 'mp4' }, 1);
        await model.confirmChunk(60, 1, { duration_ms: 5000 });
        stubUpstream(() => okJson({
            chunks: [
                { index: 0, url: 'https://cdn.example/live/match_60/chunk_0001.mp4', duration: 4 },
                { index: 1, url: 'https://cdn.example/live/match_60/chunk_0002.mp4', duration: 9 },
                { index: 3, url: 'https://cdn.example/live/match_60/chunk_0004.mp4' },
                { index: 9, url: 'https://cdn.example/live/match_60/chunk_0010.mp4', duration: 7 },
            ],
        }));
        const body: any = await (await get(db, '/api/chunks/playlist/60')).json();
        expect(body.upstream).toBe('ok');
        expect(body.index_source).toBe('merged');
        expect(body.chunks.map((c: any) => c.index)).toEqual([0, 1, 3, 9]);
        const first = body.chunks[0];
        expect(first.ready).toBe(true);
        expect(first.duration).toBe(5); // verified truth overrides the proxy claim (4)
        expect(first.timeline_start_ms).toBe(0);
        expect(body.chunks[1].ready).toBe(false); // uploaded, unconfirmed
        expect(body.chunks[1].duration).toBe(9); // proxy fallback kept
        expect(body.chunks[2].ready).toBe(false);
        expect(body.index_metadata.gaps).toEqual([3]); // sequence 3 missing
        expect(body.index_metadata.ready_count).toBe(1);
        expect(body.index_metadata.total_ready_ms).toBe(5000);
        expect(body.index_metadata.finalized).toBe(false);
    });

    it('16. dead proxy + D1 rows still serves video (nothing erased, nothing invented)', async () => {
        await seedComp(db, 61, 'live', 2);
        const model = new ChunkIndexModel(db as unknown as D1Database);
        await model.recordChunk(61, { sequence: 1, object_path: 'live/match_61/chunk_0001.mp4', container: 'mp4' }, 1);
        await model.confirmChunk(61, 1, { duration_ms: 6000 });
        for (const upstream of ['empty', 'invalid', 'error'] as const) {
            stubUpstream(() => upstream === 'error'
                ? (async () => { throw new Error('down'); })()
                : okJson(upstream === 'empty' ? { chunks: [] } : '<html>nope</html>'));
            const body: any = await (await get(db, '/api/chunks/playlist/61')).json();
            expect(body.upstream, upstream).toBe('ok');
            expect(body.index_source, upstream).toBe('d1');
            expect(body.chunks.length, upstream).toBe(1);
            expect(body.chunks[0].url, upstream).toContain('live/match_61/chunk_0001.mp4');
            expect(body.chunks[0].ready, upstream).toBe(true);
            expect(body.total_duration, upstream).toBe(6);
        }
    });

    it('17. missing 0041 table degrades to proxy-only (deployment window)', async () => {
        db.exec('DROP TABLE recording_chunks; DROP TABLE recording_finals;');
        stubUpstream(() => okJson({ chunks: [{ index: 0, url: 'https://cdn.example/c.mp4' }] }));
        const body: any = await (await get(db, '/api/chunks/playlist/9')).json();
        expect(body.upstream).toBe('ok');
        expect(body.chunks.length).toBe(1);
        expect('index_source' in body).toBe(false);
    });

    it('18. /end snapshots the final marker without blocking the transition', async () => {
        await seedComp(db, 62, 'live', 2);
        const model = new ChunkIndexModel(db as unknown as D1Database);
        await model.recordChunk(62, { sequence: 1, object_path: 'live/match_62/chunk_0001.mp4', container: 'mp4' }, 1);
        await model.confirmChunk(62, 1, { duration_ms: 7000 });
        const end = await app.request('/api/competitions/62/end', authed('sess-1', 'POST', { vod_url: 'https://cdn.example/vod/match_62.mp4' }), env(db));
        expect(end.status).toBe(200);
        const marker = await model.getFinalMarker(62);
        expect(marker).not.toBeNull();
        expect(marker?.ready_count).toBe(1);
        expect(marker?.total_ready_ms).toBe(7000);
        const status = await model.recordingStatus(62);
        expect(status.ended).toBe(true);
        expect(status.finalized).toBe(true);
    });

    it('19. manifest carries 0042 as known history (baseline-0042)', async () => {
        // R4-RELEASE-RECOVERY-C: the manifest baseline is raised to 0042 so the
        // readiness gate can enforce the ROW28 window (0040 leases, 0041 index,
        // 0042 key binding) instead of trusting a 0039-only pin set.
        expect(manifest.manifest_version).toBe('R-RELEASE-1.baseline-0042');
        expect(manifest.known_history).toContain('0042_chunk_key_binding.sql');
        expect(manifest.required_migrations.map((m: any) => m.file)).toEqual(expect.arrayContaining([
            '0040_recording_leases.sql',
            '0041_chunk_index.sql',
            '0042_chunk_key_binding.sql',
        ]));
    });
});
