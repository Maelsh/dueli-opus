/**
 * F-5A — Competition-domain SQL lives in the model layer.
 *
 * CompetitionController used to run its Competition SQL inline
 * (competition_requests / competition_invitations / chunk_keys, the detail
 * counts, and the atomic join batches). Those statements now live in
 * CompetitionModel / CompetitionRequestModel / CompetitionInvitationModel /
 * RatingModel.
 *
 * These tests are the behavioral pins for that move. Every flow whose SQL was
 * relocated is driven through the real Hono app against the REAL migrations
 * (tests/helpers/sqlite-d1.ts loads migrations/*.sql), so HTTP status codes,
 * response bodies, persisted rows and the guard semantics are asserted as they
 * behaved before the extraction: a statement that changed meaning while being
 * moved fails here.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../../src/main';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';

const CREATOR = 9001;
const OPPONENT = 9002;
const THIRD = 9003;
const CREATOR_SESSION = 'f5a-sess-creator';
const OPPONENT_SESSION = 'f5a-sess-opponent';
const THIRD_SESSION = 'f5a-sess-third';

const env = (database: SqliteD1) => ({ DB: database as unknown as D1Database } as never);

let db: SqliteD1;

function seedBase(): void {
    db.exec(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active)
        VALUES (${CREATOR}, 'f5a-creator@test.local', 'f5a_creator', 'x', 'F5A Creator', 1, 1),
               (${OPPONENT}, 'f5a-opponent@test.local', 'f5a_opponent', 'x', 'F5A Opponent', 1, 1),
               (${THIRD}, 'f5a-third@test.local', 'f5a_third', 'x', 'F5A Third', 1, 1);
        INSERT INTO categories (id, slug, name_ar, name_en) VALUES (9100, 'f5a-cat', 'F5A', 'F5A Cat');
        INSERT INTO sessions (id, user_id, expires_at) VALUES
            ('${CREATOR_SESSION}', ${CREATOR}, datetime('now', '+1 day')),
            ('${OPPONENT_SESSION}', ${OPPONENT}, datetime('now', '+1 day')),
            ('${THIRD_SESSION}', ${THIRD}, datetime('now', '+1 day'));
    `);
}

function insertCompetition(
    id: number,
    options: { creator?: number; opponent?: number | null; status?: string; scheduledAt?: string | null } = {}
): void {
    const creator = options.creator ?? CREATOR;
    const opponent = options.opponent ?? null;
    const status = options.status ?? 'pending';
    const scheduledAt = options.scheduledAt ?? null;
    const type = scheduledAt === null ? 'instant' : 'scheduled';
    db.exec(`
        INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, scheduled_at, competition_type)
        VALUES (${id}, 'F5A comp ${id}', 'rules', 9100, ${creator},
                ${opponent === null ? 'NULL' : opponent}, '${status}',
                ${scheduledAt === null ? 'NULL' : `'${scheduledAt}'`}, '${type}');
    `);
}

function randomOctet(): number {
    return Math.floor(Math.random() * 250) + 1;
}

/** Drive the real app; each request gets its own rate-limit bucket. */
async function call(method: string, path: string, session?: string, body?: unknown, lang = 'en'): Promise<Response> {
    const separator = path.includes('?') ? '&' : '?';
    return app.request(
        `${path}${separator}lang=${lang}`,
        {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(session ? { Authorization: `Bearer ${session}` } : {}),
                // CSRF: test token accepted by csrfProtection()
                'X-CSRF-Token': 'test',
                // Rate limit: isolate this test's bucket
                'X-Forwarded-For': `10.${randomOctet()}.${randomOctet()}.${randomOctet()}`,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        },
        env(db)
    );
}

/** Single-column scalar read (fixture assertions only). */
async function scalar(sql: string): Promise<unknown> {
    const row = (await db.prepare(sql).first()) as Record<string, unknown> | null;
    return row === null ? null : Object.values(row)[0];
}

async function rows<T = Record<string, unknown>>(sql: string): Promise<T[]> {
    const result = await db.prepare(sql).all();
    return result.results as T[];
}

beforeEach(() => {
    db = createSqliteD1();
    seedBase();
});

describe('F-5A competition detail payload (counts moved to models)', () => {
    it('reports pending requests_count, ratings_count and comments_count', async () => {
        insertCompetition(1001);
        db.exec(`
            INSERT INTO competition_requests (competition_id, requester_id, status, created_at)
            VALUES (1001, ${OPPONENT}, 'pending', datetime('now')),
                   (1001, ${THIRD}, 'accepted', datetime('now'));
            INSERT INTO ratings (competition_id, user_id, competitor_id, rating, created_at)
            VALUES (1001, ${OPPONENT}, ${CREATOR}, 5, datetime('now'));
        `);

        const res = await call('GET', '/api/competitions/1001');
        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; data: Record<string, unknown> };
        expect(json.success).toBe(true);
        expect(json.data.id).toBe(1001);
        expect(json.data.requests_count).toBe(1); // only the pending one counts
        expect(json.data.ratings_count).toBe(1);
        expect(json.data.comments_count).toBe(0);
        expect(json.data.user_has_pending_request).toBe(false);
    });

    it('flags user_has_pending_request only for the caller with a pending request', async () => {
        insertCompetition(1002);
        db.exec(`
            INSERT INTO competition_requests (competition_id, requester_id, status, created_at)
            VALUES (1002, ${OPPONENT}, 'pending', datetime('now'));
        `);

        const anonymous = await call('GET', '/api/competitions/1002');
        expect(((await anonymous.json()) as { data: Record<string, unknown> }).data.user_has_pending_request).toBe(false);

        const withRequest = await call('GET', '/api/competitions/1002', OPPONENT_SESSION);
        expect(((await withRequest.json()) as { data: Record<string, unknown> }).data.user_has_pending_request).toBe(true);

        const withoutRequest = await call('GET', '/api/competitions/1002', THIRD_SESSION);
        expect(((await withoutRequest.json()) as { data: Record<string, unknown> }).data.user_has_pending_request).toBe(false);
    });

    it('GET /:id/requests still returns the light requester payload', async () => {
        insertCompetition(1003);
        db.exec(`
            INSERT INTO competition_requests (competition_id, requester_id, status, message, created_at)
            VALUES (1003, ${OPPONENT}, 'pending', 'pick me', datetime('now')),
                   (1003, ${THIRD}, 'rejected', NULL, datetime('now'));
        `);

        const res = await call('GET', '/api/competitions/1003/requests');
        expect(res.status).toBe(200);
        const json = (await res.json()) as { data: Array<Record<string, unknown>> };
        expect(json.data.length).toBe(1);
        expect(json.data[0].requester_id).toBe(OPPONENT);
        expect(json.data[0].display_name).toBe('F5A Opponent');
        expect(json.data[0].username).toBe('f5a_opponent');
        expect(json.data[0].message).toBe('pick me');
    });
});

describe('F-5A join-request flow (requests SQL moved to model)', () => {
    it('requestJoin creates a pending request; duplicate is rejected; accept sets opponent', async () => {
        insertCompetition(2001);
        const created = await call('POST', '/api/competitions/2001/request', OPPONENT_SESSION, { message: 'let me in' });
        expect(created.status).toBe(201);
        const createdBody = ((await created.json()) as { data: { id: number } }).data;
        expect(typeof createdBody.id).toBe('number');
        expect(await scalar(`SELECT requester_id FROM competition_requests WHERE id = ${createdBody.id}`)).toBe(OPPONENT);

        const duplicate = await call('POST', '/api/competitions/2001/request', OPPONENT_SESSION, {});
        expect(duplicate.status).toBe(400);

        const pending = await rows('SELECT * FROM competition_requests WHERE competition_id = 2001');
        expect(pending.length).toBe(1);

        const accept = await call('POST', '/api/competitions/2001/accept-request', CREATOR_SESSION, { request_id: pending[0].id });
        expect(accept.status).toBe(200);
        const acceptJson = (await accept.json()) as { data: Record<string, unknown> };
        expect(acceptJson.data.accepted).toBe(true);

        const comp = await scalar('SELECT opponent_id FROM competitions WHERE id = 2001');
        expect(comp).toBe(OPPONENT);
        // NOTE: handleAutoDeleteOnJoin deletes the joiner's own requests on immediate
        // competitions (deletePendingImmediate has no status filter), so the accepted
        // row itself is auto-deleted — same as pre-F-5A behavior. What matters is that
        // no pending request survives and the opponent slot was set.
        expect(await scalar('SELECT COUNT(*) FROM competition_requests WHERE competition_id = 2001 AND status = \'pending\'')).toBe(0);
    });

    it('decline-request and cancel-request keep prior semantics', async () => {
        insertCompetition(2002);
        const created = await call('POST', '/api/competitions/2002/request', OPPONENT_SESSION, {});
        expect(created.status).toBe(201);
        const reqId = ((await created.json()) as { data: { id: number } }).data.id;

        const declined = await call('POST', '/api/competitions/2002/decline-request', CREATOR_SESSION, { request_id: reqId });
        expect(declined.status).toBe(200);
        expect(await scalar(`SELECT status FROM competition_requests WHERE id = ${reqId}`)).toBe('declined');

        insertCompetition(2003);
        const created2 = await call('POST', '/api/competitions/2003/request', THIRD_SESSION, {});
        expect(created2.status).toBe(201);
        const cancelled = await call('DELETE', '/api/competitions/2003/request', THIRD_SESSION);
        expect(cancelled.status).toBe(200);
        expect(await scalar('SELECT COUNT(*) FROM competition_requests WHERE competition_id = 2003')).toBe(0);
    });
});

describe('F-5A invitation flow (invitations SQL moved to model)', () => {
    it('invite creates a pending invitation; duplicate and self-invite are rejected', async () => {
        insertCompetition(3001);
        const invited = await call('POST', '/api/competitions/3001/invite', CREATOR_SESSION, { invitee_id: OPPONENT });
        expect(invited.status).toBe(200);

        const duplicate = await call('POST', '/api/competitions/3001/invite', CREATOR_SESSION, { invitee_id: OPPONENT });
        expect(duplicate.status).toBe(409);

        const selfInvite = await call('POST', '/api/competitions/3001/invite', CREATOR_SESSION, { invitee_id: CREATOR });
        expect(selfInvite.status).toBe(409);
    });

    it('accept-invite sets opponent and clears competing rows; decline-invite marks declined', async () => {
        insertCompetition(3002);
        db.exec(`INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status, created_at)
                 VALUES (3002, ${CREATOR}, ${OPPONENT}, 'pending', datetime('now')),
                        (3002, ${CREATOR}, ${THIRD}, 'pending', datetime('now'));`);
        db.exec(`INSERT INTO competition_requests (competition_id, requester_id, status, created_at)
                 VALUES (3002, ${THIRD}, 'pending', datetime('now'));`);

        const accepted = await call('POST', '/api/competitions/3002/accept-invite', OPPONENT_SESSION, {});
        expect(accepted.status).toBe(200);
        expect(await scalar('SELECT opponent_id FROM competitions WHERE id = 3002')).toBe(OPPONENT);
        expect(await scalar(`SELECT status FROM competition_invitations WHERE competition_id = 3002 AND invitee_id = ${THIRD}`)).toBe('declined');

        insertCompetition(3003);
        db.exec(`INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status, created_at)
                 VALUES (3003, ${CREATOR}, ${THIRD}, 'pending', datetime('now'));`);
        const declined = await call('POST', '/api/competitions/3003/decline-invite', THIRD_SESSION, {});
        expect(declined.status).toBe(200);
        expect(await scalar(`SELECT status FROM competition_invitations WHERE competition_id = 3003 AND invitee_id = ${THIRD}`)).toBe('declined');

        const missing = await call('POST', '/api/competitions/3003/decline-invite', THIRD_SESSION, {});
        expect(missing.status).toBe(400);
    });
});

describe('F-5A chunk_keys cleanup on end (moved to CompetitionModel)', () => {
    it('ending a live competition deletes its chunk keys', async () => {
        insertCompetition(4001, { opponent: OPPONENT, status: 'live' });
        db.exec(`INSERT INTO chunk_keys (competition_id, chunk_index, chunk_key)
                 VALUES (4001, 0, 'f5a-key-0'), (4001, 1, 'f5a-key-1');`);
        const ended = await call('POST', '/api/competitions/4001/end', CREATOR_SESSION, {});
        expect(ended.status).toBe(200);
        expect(await scalar('SELECT COUNT(*) FROM chunk_keys WHERE competition_id = 4001')).toBe(0);
        expect(await scalar('SELECT status FROM competitions WHERE id = 4001')).toBe('completed');
    });
});