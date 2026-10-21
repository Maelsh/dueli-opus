/**
 * R4-LIVE-END-RECOVERY-1 (unit 28.5) — end propagation, permissions and
 * finalization boundaries.
 *
 * Required behavior:
 *  - creator and opponent may end; viewers never may; completed is idempotent;
 *  - the guarded live -> completed transition persists ended_at and emits ONE
 *    competition_status event with the persisted ended_at (all roles listen on
 *    the existing competition channel; no refresh);
 *  - an end request never becomes a recording claim: a client-supplied
 *    vod_url is ignored until verified completion evidence exists;
 *  - automatic end (2h rule) emits the same terminal event;
 *  - an end never waits for pending chunk uploads: the marker/receipt path is
 *    covered by the existing drain-tail tests and remains independent.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { ScheduledTaskService } from '../../src/lib/services/ScheduledTaskService';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db } as unknown as Env);

let ipSeq = 9100;
function headers(token: string): Record<string, string> {
    ipSeq += 1;
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-CSRF-Token': 'end-rem1-test',
        'CF-Connecting-IP': `10.44.44.${(ipSeq % 250) + 1}`,
        'X-Forwarded-For': `10.44.44.${(ipSeq % 250) + 1}`,
    };
}

async function post(db: SqliteD1 | any, path: string, token: string, body?: unknown) {
    const res = await app.request(path, {
        method: 'POST',
        headers: headers(token),
        body: body === undefined ? undefined : JSON.stringify(body),
    }, env(db));
    let json: any = null;
    try { json = await res.json(); } catch { json = null; }
    return { status: res.status, json };
}

async function seed(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, display_name, password_hash, is_active, language)
         VALUES (201, 'end-creator@local', 'end_creator', 'Creator', 'x', 1, 'en'),
                (202, 'end-opponent@local', 'end_opponent', 'Opponent', 'x', 1, 'en'),
                (203, 'end-viewer@local', 'end_viewer', 'Viewer', 'x', 1, 'en')`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
          ('sess-end-creator', 201, datetime('now', '+1 day')),
          ('sess-end-opponent', 202, datetime('now', '+1 day')),
          ('sess-end-viewer', 203, datetime('now', '+1 day'))`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (51, 'end-rem1', 'قسم', 'Category')`
    ).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, language, status, started_at)
         VALUES
          (7001, 'creator end', 'r', 51, 201, 202, 'en', 'live', datetime('now', '-10 minutes')),
          (7002, 'opponent end', 'r', 51, 201, 202, 'en', 'live', datetime('now', '-10 minutes')),
          (7003, 'idempotent end', 'r', 51, 201, 202, 'en', 'live', datetime('now', '-10 minutes')),
          (7004, 'not live end', 'r', 51, 201, 202, 'en', 'pending', NULL),
          (7005, 'auto end', 'r', 51, 201, 202, 'en', 'live', datetime('now', '-3 hours'))`
    ).run();
}

async function statusEvents(db: SqliteD1, competitionId: number) {
    const rows = await db.prepare(
        `SELECT event_type, payload FROM sse_event_log
         WHERE channel = ? AND event_type = 'competition_status'
         ORDER BY id ASC`
    ).bind(`competition:${competitionId}`).all<{ event_type: string; payload: string }>();
    return rows.results.map((r) => JSON.parse(r.payload) as Record<string, unknown>);
}

describe('R4-LIVE-END-RECOVERY-1 (28.5) end lifecycle', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('1. permissions: creator/opponent end; viewer and non-live are rejected', async () => {
        expect((await post(db, '/api/competitions/7001/end', 'sess-end-viewer', {})).status).toBe(403);
        expect(await statusEvents(db, 7001)).toEqual([]);

        expect((await post(db, '/api/competitions/7004/end', 'sess-end-creator', {})).status).toBe(409);
        expect(await statusEvents(db, 7004)).toEqual([]);

        const creator = await post(db, '/api/competitions/7001/end', 'sess-end-creator', {});
        expect(creator.status).toBe(200);
        expect(creator.json?.data?.status).toBe('completed');

        const opponent = await post(db, '/api/competitions/7002/end', 'sess-end-opponent', {});
        expect(opponent.status).toBe(200);
        expect(opponent.json?.data?.status).toBe('completed');
    });

    it('2. end persists ended_at, ignores a client vod_url claim, and publishes one terminal event', async () => {
        const claim = 'https://cdn.example/vod/attempted.mp4';
        const res = await post(db, '/api/competitions/7003/end', 'sess-end-creator', { vod_url: claim });
        expect(res.status).toBe(200);

        const row = await db.prepare(
            'SELECT status, ended_at, vod_url FROM competitions WHERE id = 7003'
        ).first<{ status: string; ended_at: string | null; vod_url: string | null }>();
        expect(row?.status).toBe('completed');
        expect(row?.ended_at).toBeTruthy();
        expect(res.json?.data?.ended_at).toBe(row?.ended_at);
        // An end action / attempted upload is NOT verified completion evidence.
        expect(row?.vod_url).toBeNull();

        const events = await statusEvents(db, 7003);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            competition_id: 7003,
            status: 'completed',
            ended_at: row?.ended_at,
        });
    });

    it('3. repeat end is idempotent and never re-finalizes or re-publishes', async () => {
        expect((await post(db, '/api/competitions/7003/end', 'sess-end-creator', {})).status).toBe(200);
        const repeat = await post(db, '/api/competitions/7003/end', 'sess-end-opponent', {});
        expect(repeat.status).toBe(200);
        expect(repeat.json?.data?.already_completed).toBe(true);
        expect(repeat.json?.data?.ended_at).toBeTruthy();
        expect(await statusEvents(db, 7003)).toHaveLength(1);
        // The guarded transition writes the final marker once, never twice.
        const finals = await db.prepare(
            'SELECT COUNT(*) AS c FROM recording_finals WHERE competition_id = 7003'
        ).first<{ c: number }>();
        expect(finals?.c).toBe(1);
    });

    it('4. automatic end publishes the same terminal status + ended_at', async () => {
        // The service only needs the D1 surface; SqliteD1 implements it.
        const svc = new ScheduledTaskService(db as unknown as D1Database);
        const ended = await svc.endLiveMaxDuration(7005, 2);
        expect(ended).toBe(true);

        const row = await db.prepare('SELECT status, ended_at FROM competitions WHERE id = 7005')
            .first<{ status: string; ended_at: string | null }>();
        expect(row?.status).toBe('completed');
        expect(row?.ended_at).toBeTruthy();
        const events = await statusEvents(db, 7005);
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({
            competition_id: 7005,
            status: 'completed',
            ended_at: row?.ended_at,
        });
    });
});
