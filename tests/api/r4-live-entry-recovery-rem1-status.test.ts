/**
 * R4-LIVE-ENTRY-RECOVERY-REM1 (unit 28.3.1) — lifecycle SSE contract.
 *
 * Both parties must leave pending and see LIVE without a refresh. The
 * signal rides the EXISTING competition channel (`competition:<id>`):
 *   - invite accepted      → competition_status { status: 'accepted', opponent_id }
 *   - request accepted     → competition_status { status: 'accepted', opponent_id }
 *   - competition started  → competition_status { status: 'live', started_by }
 *
 * The competitions row stays authoritative; the event is display metadata.
 * Emission is best-effort: a realtime/DB failure must never roll back the
 * committed acceptance or start.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db } as unknown as Env);

let ipSeq = 7000;
function headers(token: string): Record<string, string> {
    ipSeq += 1;
    return {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'X-CSRF-Token': 'rem1-test',
        'CF-Connecting-IP': `10.33.33.${(ipSeq % 250) + 1}`,
        'X-Forwarded-For': `10.33.33.${(ipSeq % 250) + 1}`,
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
         VALUES (111, 'rem1-creator@local', 'rem1_creator', 'Creator', 'x', 1, 'ar'),
                (112, 'rem1-opponent@local', 'rem1_opponent', 'Opponent', 'x', 1, 'ar'),
                (113, 'rem1-other@local', 'rem1_other', 'Other', 'x', 1, 'en')`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
          ('sess-rem1-creator', 111, datetime('now', '+1 day')),
          ('sess-rem1-opponent', 112, datetime('now', '+1 day')),
          ('sess-rem1-other', 113, datetime('now', '+1 day'))`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (50, 'rem1', 'قسم', 'Category')`
    ).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, language, status)
         VALUES
          (6001, 'REM1 invite', 'r', 50, 111, NULL, 'ar', 'pending'),
          (6002, 'REM1 request', 'r', 50, 111, NULL, 'ar', 'pending'),
          (6003, 'REM1 start', 'r', 50, 111, 112, 'ar', 'accepted'),
          (6004, 'REM1 closed', 'r', 50, 111, NULL, 'ar', 'pending')`
    ).run();
    await db.prepare(
        `INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status)
         VALUES (6001, 111, 112, 'pending')`
    ).run();
    await db.prepare(
        `INSERT INTO competition_requests (id, competition_id, requester_id, status)
         VALUES (7001, 6002, 112, 'pending')`
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

/** Proxy that fails inserts into the SSE log only (realtime/DB outage). */
function failingSseDb(db: SqliteD1): any {
    return new Proxy(db as any, {
        get(target, prop) {
            if (prop === 'prepare') {
                return (sql: string) => {
                    if (/insert\s+into\s+sse_event_log/i.test(sql)) {
                        const boom = async () => { throw new Error('sse_event_log unavailable'); };
                        const stmt: any = { bind: () => stmt, run: boom, first: boom, all: boom };
                        return stmt;
                    }
                    return target.prepare(sql);
                };
            }
            const value = Reflect.get(target, prop, target);
            return typeof value === 'function' ? value.bind(target) : value;
        },
    });
}

describe('R4-LIVE-ENTRY-RECOVERY-REM1 lifecycle SSE', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('1. invite acceptance emits accepted + opponent_id on the competition channel', async () => {
        const res = await post(db, '/api/competitions/6001/accept-invite', 'sess-rem1-opponent');
        expect(res.status).toBe(200);
        expect(res.json?.success).toBe(true);

        const events = await statusEvents(db, 6001);
        expect(events.length).toBe(1);
        expect(events[0]).toMatchObject({
            competition_id: 6001,
            status: 'accepted',
            opponent_id: 112,
        });
        // The row stays authoritative (event never replaces the DB state).
        const row = await db.prepare('SELECT status, opponent_id FROM competitions WHERE id = 6001')
            .first<{ status: string; opponent_id: number }>();
        expect(row).toMatchObject({ status: 'accepted', opponent_id: 112 });
    });

    it('2. request acceptance emits the same accepted event for both parties', async () => {
        const res = await post(db, '/api/competitions/6002/accept-request', 'sess-rem1-creator', { request_id: 7001 });
        expect(res.status).toBe(200);

        const events = await statusEvents(db, 6002);
        expect(events.length).toBe(1);
        expect(events[0]).toMatchObject({
            competition_id: 6002,
            status: 'accepted',
            opponent_id: 112,
        });
    });

    it('3. start emits live + started_by (no refresh, same channel)', async () => {
        const res = await post(db, '/api/competitions/6003/start', 'sess-rem1-creator');
        expect(res.status).toBe(200);
        expect(res.json?.data?.status).toBe('live');

        const events = await statusEvents(db, 6003);
        expect(events.length).toBe(1);
        expect(events[0]).toMatchObject({
            competition_id: 6003,
            status: 'live',
            started_by: 111,
        });
    });

    it('4. failed/unrelated transitions emit no lifecycle event', async () => {
        // Not the invited party → 409; nothing accepted, nothing emitted.
        const invite = await post(db, '/api/competitions/6001/accept-invite', 'sess-rem1-other');
        expect(invite.status).toBe(409);
        expect(await statusEvents(db, 6001)).toEqual([]);

        // Pending (not accepted) cannot start → 409; nothing emitted.
        const start = await post(db, '/api/competitions/6004/start', 'sess-rem1-creator');
        expect(start.status).toBe(409);
        expect(await statusEvents(db, 6004)).toEqual([]);
    });

    it('5. realtime failure never rolls back a committed acceptance', async () => {
        const flaky = failingSseDb(db);
        const res = await post(flaky, '/api/competitions/6001/accept-invite', 'sess-rem1-opponent');
        expect(res.status).toBe(200);
        expect(res.json?.success).toBe(true);
        const row = await db.prepare('SELECT status, opponent_id FROM competitions WHERE id = 6001')
            .first<{ status: string; opponent_id: number }>();
        expect(row).toMatchObject({ status: 'accepted', opponent_id: 112 });
        expect(await statusEvents(db, 6001)).toEqual([]);
    });
});
