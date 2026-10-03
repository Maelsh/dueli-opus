/**
 * R2-J — Invite / Join lifecycle (settled H3 contract).
 *
 * Runs the real Hono app against the REAL migrations (tests/helpers/sqlite-d1.ts),
 * so guard semantics, CHECK constraints, datetimes and the atomic batches are
 * asserted as production runs them.
 *
 * Covers: H3 mutual/conflicting invite-vs-request paths, duplicate + concurrent
 * accept (single opponent, single acceptance notification), accepted_at in the
 * invoked atomic path, decline/reject/expiry, blocked/ineligible/unauth,
 * distinct localized acceptance notification with language-correct link,
 * incoming/outgoing persisted history, current-user-scoped show state, and the
 * 401/403/409 API contracts.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../../src/main';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';

const CREATOR = 7101;
const OPPONENT = 7102; // B
const THIRD = 7103; // C
const FOURTH = 7104; // D
const CREATOR_SESSION = 'r2j-sess-creator';
const B_SESSION = 'r2j-sess-b';
const C_SESSION = 'r2j-sess-c';
const D_SESSION = 'r2j-sess-d';

const env = (database: SqliteD1) => ({ DB: database as unknown as D1Database } as never);

let db: SqliteD1;

function seedBase(): void {
    db.exec(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active)
        VALUES (${CREATOR}, 'r2j-creator@test.local', 'r2j_creator', 'x', 'R2J Creator', 1, 1),
               (${OPPONENT}, 'r2j-b@test.local', 'r2j_b', 'x', 'R2J B', 1, 1),
               (${THIRD}, 'r2j-c@test.local', 'r2j_c', 'x', 'R2J C', 1, 1),
               (${FOURTH}, 'r2j-d@test.local', 'r2j_d', 'x', 'R2J D', 1, 1);
        INSERT INTO categories (id, slug, name_ar, name_en) VALUES (7100, 'r2j-cat', 'R2J', 'R2J Cat');
        INSERT INTO sessions (id, user_id, expires_at) VALUES
            ('${CREATOR_SESSION}', ${CREATOR}, datetime('now', '+1 day')),
            ('${B_SESSION}', ${OPPONENT}, datetime('now', '+1 day')),
            ('${C_SESSION}', ${THIRD}, datetime('now', '+1 day')),
            ('${D_SESSION}', ${FOURTH}, datetime('now', '+1 day'));
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
        VALUES (${id}, 'R2J comp ${id}', 'rules', 7100, ${creator},
                ${opponent === null ? 'NULL' : opponent}, '${status}',
                ${scheduledAt === null ? 'NULL' : `'${scheduledAt}'`}, '${type}');
    `);
}

function randomOctet(): number {
    return Math.floor(Math.random() * 250) + 1;
}

/** Drive the real app; each request gets its own rate-limit bucket. */
async function call(
    method: string,
    path: string,
    session?: string,
    body?: unknown,
    lang = 'en'
): Promise<Response> {
    const separator = path.includes('?') ? '&' : '?';
    return app.request(
        `${path}${separator}lang=${lang}`,
        {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(session ? { Authorization: `Bearer ${session}` } : {}),
                'X-CSRF-Token': 'test',
                'X-Forwarded-For': `10.${randomOctet()}.${randomOctet()}.${randomOctet()}`,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        },
        env(db)
    );
}

async function scalar(sql: string): Promise<unknown> {
    const row = (await db.prepare(sql).first()) as Record<string, unknown> | null;
    return row === null ? null : Object.values(row)[0];
}

async function row(sql: string): Promise<Record<string, unknown> | null> {
    return (await db.prepare(sql).first()) as Record<string, unknown> | null;
}

async function errJson(res: Response): Promise<string> {
    const json = (await res.json()) as { error?: string };
    return json.error ?? '';
}

beforeEach(() => {
    db = createSqliteD1();
    seedBase();
});

describe('R2-J H3: no parallel join request beside a pending invitation', () => {
    it('a pending invite blocks requestJoin with 409 (ar + en)', async () => {
        insertCompetition(5001);
        const invited = await call('POST', '/api/competitions/5001/invite', CREATOR_SESSION, { invitee_id: OPPONENT });
        expect(invited.status).toBe(200);

        const blockedAr = await call('POST', '/api/competitions/5001/request', B_SESSION, {}, 'ar');
        expect(blockedAr.status).toBe(409);
        expect(await errJson(blockedAr)).toBe('لديك دعوة معلقة لهذه المنافسة — اقبلها أو ارفضها أولاً');

        const blockedEn = await call('POST', '/api/competitions/5001/request', B_SESSION, {}, 'en');
        expect(blockedEn.status).toBe(409);
        expect(await errJson(blockedEn)).toContain('pending invitation');

        // No request row was written by the blocked attempts.
        expect(await scalar('SELECT COUNT(*) FROM competition_requests WHERE competition_id = 5001')).toBe(0);
    });

    it('a pending join request blocks invite with 409', async () => {
        insertCompetition(5002);
        const requested = await call('POST', '/api/competitions/5002/request', B_SESSION, { message: 'pick me' });
        expect(requested.status).toBe(201);

        const blocked = await call('POST', '/api/competitions/5002/invite', CREATOR_SESSION, { invitee_id: OPPONENT }, 'ar');
        expect(blocked.status).toBe(409);
        expect(await errJson(blocked)).toBe('لدى المستخدم طلب انضمام معلق لهذه المنافسة');
        expect(await scalar('SELECT COUNT(*) FROM competition_invitations WHERE competition_id = 5002')).toBe(0);
    });

    it('declining the invite frees the request path again', async () => {
        insertCompetition(5003);
        expect((await call('POST', '/api/competitions/5003/invite', CREATOR_SESSION, { invitee_id: OPPONENT })).status).toBe(200);
        expect((await call('POST', '/api/competitions/5003/decline-invite', B_SESSION, {})).status).toBe(200);
        expect(await scalar(`SELECT status FROM competition_invitations WHERE competition_id = 5003 AND invitee_id = ${OPPONENT}`)).toBe('declined');

        const requested = await call('POST', '/api/competitions/5003/request', B_SESSION, {});
        expect(requested.status).toBe(201);
    });

    it('duplicate invite and duplicate request are 409 with translated errors', async () => {
        insertCompetition(5004);
        expect((await call('POST', '/api/competitions/5004/invite', CREATOR_SESSION, { invitee_id: OPPONENT })).status).toBe(200);
        const dupInvite = await call('POST', '/api/competitions/5004/invite', CREATOR_SESSION, { invitee_id: OPPONENT }, 'ar');
        expect(dupInvite.status).toBe(409);
        expect(await errJson(dupInvite)).toBe('تمت دعوة المستخدم مسبقاً');

        insertCompetition(5005);
        expect((await call('POST', '/api/competitions/5005/request', B_SESSION, {})).status).toBe(201);
        const dupRequest = await call('POST', '/api/competitions/5005/request', B_SESSION, {}, 'ar');
        expect(dupRequest.status).toBe(409);
        expect(await errJson(dupRequest)).toBe('لقد طلبت الانضمام مسبقاً');
    });
});

describe('R2-J atomic accept: one opponent, accepted_at, single notification', () => {
    it('invite→accept writes accepted_at on competition + invitation and closes the rest', async () => {
        insertCompetition(5101);
        expect((await call('POST', '/api/competitions/5101/invite', CREATOR_SESSION, { invitee_id: OPPONENT })).status).toBe(200);
        expect((await call('POST', '/api/competitions/5101/invite', CREATOR_SESSION, { invitee_id: THIRD })).status).toBe(200);
        // Invoked insert path carries an expiry window.
        expect(await scalar(`SELECT expires_at FROM competition_invitations WHERE competition_id = 5101 AND invitee_id = ${OPPONENT}`)).not.toBeNull();

        db.exec(`INSERT INTO competition_requests (competition_id, requester_id, status, created_at)
                 VALUES (5101, ${FOURTH}, 'pending', datetime('now'));`);

        const accepted = await call('POST', '/api/competitions/5101/accept-invite', B_SESSION, {});
        expect(accepted.status).toBe(200);

        const comp = await row('SELECT opponent_id, status, accepted_at FROM competitions WHERE id = 5101');
        expect(comp?.opponent_id).toBe(OPPONENT);
        expect(comp?.status).toBe('accepted');
        expect(comp?.accepted_at).not.toBeNull();

        const winnerInvite = await row(`SELECT status, accepted_at FROM competition_invitations WHERE competition_id = 5101 AND invitee_id = ${OPPONENT}`);
        expect(winnerInvite?.status).toBe('accepted');
        expect(winnerInvite?.accepted_at).not.toBeNull();

        expect(await scalar(`SELECT status FROM competition_invitations WHERE competition_id = 5101 AND invitee_id = ${THIRD}`)).toBe('declined');
        expect(await scalar('SELECT COUNT(*) FROM competition_invitations WHERE competition_id = 5101 AND status = \'pending\'')).toBe(0);
        expect(await scalar('SELECT COUNT(*) FROM competition_invitations WHERE competition_id = 5101 AND status = \'accepted\'')).toBe(1);

        // Competing join requests are closed per schema (requests carry no CHECK; auto_declined persists).
        expect(await scalar(`SELECT status FROM competition_requests WHERE competition_id = 5101 AND requester_id = ${FOURTH}`)).toBe('auto_declined');

        // Exactly one acceptance notification, on the dedicated type.
        expect(await scalar(`SELECT COUNT(*) FROM notifications WHERE user_id = ${CREATOR} AND type = 'invitation_accepted'`)).toBe(1);
        expect(await scalar(`SELECT COUNT(*) FROM notifications WHERE user_id = ${CREATOR} AND type = 'request'`)).toBe(0);
    });

    it('concurrent accepts produce exactly one winner, one opponent, one notification', async () => {
        insertCompetition(5102);
        expect((await call('POST', '/api/competitions/5102/invite', CREATOR_SESSION, { invitee_id: OPPONENT })).status).toBe(200);
        expect((await call('POST', '/api/competitions/5102/invite', CREATOR_SESSION, { invitee_id: THIRD })).status).toBe(200);

        const [rB, rC] = await Promise.all([
            call('POST', '/api/competitions/5102/accept-invite', B_SESSION, {}),
            call('POST', '/api/competitions/5102/accept-invite', C_SESSION, {}),
        ]);
        expect([rB.status, rC.status].sort()).toEqual([200, 409]);

        const winnerId = rB.status === 200 ? OPPONENT : THIRD;
        const loserId = rB.status === 200 ? THIRD : OPPONENT;
        expect(await scalar('SELECT opponent_id FROM competitions WHERE id = 5102')).toBe(winnerId);
        expect(await scalar('SELECT COUNT(*) FROM competition_invitations WHERE competition_id = 5102 AND status = \'accepted\'')).toBe(1);
        expect(await scalar(`SELECT status FROM competition_invitations WHERE competition_id = 5102 AND invitee_id = ${loserId}`)).toBe('declined');
        expect(await scalar(`SELECT COUNT(*) FROM notifications WHERE user_id = ${CREATOR} AND type = 'invitation_accepted'`)).toBe(1);
        expect(await scalar('SELECT accepted_at FROM competitions WHERE id = 5102')).not.toBeNull();
    });

    it('repeated accept after winning or losing is 409 and never duplicates', async () => {
        insertCompetition(5103);
        expect((await call('POST', '/api/competitions/5103/invite', CREATOR_SESSION, { invitee_id: OPPONENT })).status).toBe(200);
        expect((await call('POST', '/api/competitions/5103/invite', CREATOR_SESSION, { invitee_id: THIRD })).status).toBe(200);
        expect((await call('POST', '/api/competitions/5103/accept-invite', B_SESSION, {})).status).toBe(200);

        // Winner retry: no pending invitation left.
        const retry = await call('POST', '/api/competitions/5103/accept-invite', B_SESSION, {}, 'ar');
        expect(retry.status).toBe(409);
        expect(await errJson(retry)).toBe('الدعوة غير موجودة أو منتهية');

        // Loser retry: invitation already declined, competition already has an opponent.
        const loser = await call('POST', '/api/competitions/5103/accept-invite', C_SESSION, {});
        expect(loser.status).toBe(409);

        expect(await scalar('SELECT COUNT(*) FROM competition_invitations WHERE competition_id = 5103 AND status = \'accepted\'')).toBe(1);
        expect(await scalar(`SELECT COUNT(*) FROM notifications WHERE user_id = ${CREATOR} AND type = 'invitation_accepted'`)).toBe(1);
    });

    it('accept-request writes accepted_at and closes competing rows in one path', async () => {
        insertCompetition(5104);
        const created = await call('POST', '/api/competitions/5104/request', B_SESSION, { message: 'x' });
        expect(created.status).toBe(201);
        expect(await scalar(`SELECT expires_at FROM competition_requests WHERE competition_id = 5104 AND requester_id = ${OPPONENT}`)).not.toBeNull();
        const reqId = ((await created.json()) as { data: { id: number } }).data.id;

        const accepted = await call('POST', '/api/competitions/5104/accept-request', CREATOR_SESSION, { request_id: reqId });
        expect(accepted.status).toBe(200);

        const comp = await row('SELECT opponent_id, status, accepted_at FROM competitions WHERE id = 5104');
        expect(comp?.opponent_id).toBe(OPPONENT);
        expect(comp?.accepted_at).not.toBeNull();

        // The joiner's own immediate rows are auto-deleted on join (standing
        // lifecycle, see F-5A): the accepted row itself is gone → 404 here.
        const again = await call('POST', '/api/competitions/5104/accept-request', CREATOR_SESSION, { request_id: reqId });
        expect(again.status).toBe(404);

        // A competing still-pending request can never steal the slot afterwards.
        db.exec(`INSERT INTO competition_requests (competition_id, requester_id, status, created_at)
                 VALUES (5104, ${THIRD}, 'pending', datetime('now'));`);
        const rivalId = await scalar(`SELECT id FROM competition_requests WHERE competition_id = 5104 AND requester_id = ${THIRD}`);
        const rival = await call('POST', '/api/competitions/5104/accept-request', CREATOR_SESSION, { request_id: rivalId });
        expect(rival.status).toBe(409);
        expect(await scalar('SELECT opponent_id FROM competitions WHERE id = 5104')).toBe(OPPONENT);
    });
});

describe('R2-J decline / reject / expiry / closed states', () => {
    it('decline-invite marks declined; a second decline is 409', async () => {
        insertCompetition(5201);
        db.exec(`INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status, created_at)
                 VALUES (5201, ${CREATOR}, ${OPPONENT}, 'pending', datetime('now'));`);
        expect((await call('POST', '/api/competitions/5201/decline-invite', B_SESSION, {})).status).toBe(200);
        expect(await scalar(`SELECT status FROM competition_invitations WHERE competition_id = 5201 AND invitee_id = ${OPPONENT}`)).toBe('declined');

        const again = await call('POST', '/api/competitions/5201/decline-invite', B_SESSION, {}, 'ar');
        expect(again.status).toBe(409);
        expect(await errJson(again)).toBe('لا توجد دعوة معلقة');
    });

    it('decline-request marks declined; unknown or non-pending requests are 404/409', async () => {
        insertCompetition(5202);
        const created = await call('POST', '/api/competitions/5202/request', B_SESSION, {});
        const reqId = ((await created.json()) as { data: { id: number } }).data.id;
        expect((await call('POST', '/api/competitions/5202/decline-request', CREATOR_SESSION, { request_id: reqId })).status).toBe(200);
        expect(await scalar(`SELECT status FROM competition_requests WHERE id = ${reqId}`)).toBe('declined');

        const again = await call('POST', '/api/competitions/5202/decline-request', CREATOR_SESSION, { request_id: reqId });
        expect(again.status).toBe(409);

        const unknown = await call('POST', '/api/competitions/5202/decline-request', CREATOR_SESSION, { request_id: 999999 });
        expect(unknown.status).toBe(404);
    });

    it('an expired invitation cannot be accepted and is marked expired', async () => {
        insertCompetition(5203);
        db.exec(`INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status, expires_at, created_at)
                 VALUES (5203, ${CREATOR}, ${OPPONENT}, 'pending', datetime('now', '-1 hour'), datetime('now', '-25 hours'));`);

        const res = await call('POST', '/api/competitions/5203/accept-invite', B_SESSION, {}, 'ar');
        expect(res.status).toBe(409);
        expect(await errJson(res)).toBe('الدعوة غير موجودة أو منتهية');
        expect(await scalar(`SELECT status FROM competition_invitations WHERE competition_id = 5203 AND invitee_id = ${OPPONENT}`)).toBe('expired');
        expect(await scalar('SELECT opponent_id FROM competitions WHERE id = 5203')).toBeNull();
    });

    it('an expired join request cannot be accepted and is marked expired', async () => {
        insertCompetition(5204);
        db.exec(`INSERT INTO competition_requests (competition_id, requester_id, status, expires_at, created_at)
                 VALUES (5204, ${OPPONENT}, 'pending', datetime('now', '-1 hour'), datetime('now', '-25 hours'));`);
        const reqId = await scalar(`SELECT id FROM competition_requests WHERE competition_id = 5204 AND requester_id = ${OPPONENT}`);

        const res = await call('POST', '/api/competitions/5204/accept-request', CREATOR_SESSION, { request_id: reqId });
        expect(res.status).toBe(409);
        expect(await scalar(`SELECT status FROM competition_requests WHERE id = ${reqId}`)).toBe('expired');
        expect(await scalar('SELECT opponent_id FROM competitions WHERE id = 5204')).toBeNull();
    });

    it('closed competitions disable invite/request/accept with translated 409s', async () => {
        insertCompetition(5205);
        expect((await call('POST', '/api/competitions/5205/invite', CREATOR_SESSION, { invitee_id: OPPONENT })).status).toBe(200);
        expect((await call('POST', '/api/competitions/5205/accept-invite', B_SESSION, {})).status).toBe(200);

        // New invitation on a competition that already has an opponent.
        const inviteClosed = await call('POST', '/api/competitions/5205/invite', CREATOR_SESSION, { invitee_id: THIRD }, 'ar');
        expect(inviteClosed.status).toBe(409);
        expect(await errJson(inviteClosed)).toBe('تم تعيين الخصم بالفعل');

        // New join request on a competition that already has an opponent.
        const requestClosed = await call('POST', '/api/competitions/5205/request', C_SESSION, {});
        expect(requestClosed.status).toBe(409);

        // A seeded pending invitation cannot be accepted into a closed competition.
        db.exec(`INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status, created_at)
                 VALUES (5205, ${CREATOR}, ${FOURTH}, 'pending', datetime('now'));`);
        const acceptClosed = await call('POST', '/api/competitions/5205/accept-invite', D_SESSION, {});
        expect(acceptClosed.status).toBe(409);
        expect(await scalar('SELECT opponent_id FROM competitions WHERE id = 5205')).toBe(OPPONENT);
    });
});

describe('R2-J blocked / ineligible / unauth', () => {
    it('requestJoin to a blocker is 403 with translated error', async () => {
        insertCompetition(5301);
        db.exec(`INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (${CREATOR}, ${OPPONENT}, 'spam', datetime('now'))`);
        const res = await call('POST', '/api/competitions/5301/request', B_SESSION, {}, 'ar');
        expect(res.status).toBe(403);
        expect(await errJson(res)).toBe('لا يمكن التفاعل مع هذا المستخدم');
        expect(await scalar('SELECT COUNT(*) FROM competition_requests WHERE competition_id = 5301')).toBe(0);
    });

    it('accepting an invitation across a block is 403 and sets no opponent', async () => {
        insertCompetition(5302);
        expect((await call('POST', '/api/competitions/5302/invite', CREATOR_SESSION, { invitee_id: OPPONENT })).status).toBe(200);
        db.exec(`INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (${OPPONENT}, ${CREATOR}, 'spam', datetime('now'))`);

        const res = await call('POST', '/api/competitions/5302/accept-invite', B_SESSION, {});
        expect(res.status).toBe(403);
        expect(await scalar('SELECT opponent_id FROM competitions WHERE id = 5302')).toBeNull();
    });

    it('joining your own competition is 403', async () => {
        insertCompetition(5303);
        const res = await call('POST', '/api/competitions/5303/request', CREATOR_SESSION, {});
        expect(res.status).toBe(403);
    });

    it('all join/invite endpoints require auth (401, translated)', async () => {
        insertCompetition(5304);
        const targets: Array<[string, string, unknown?]> = [
            ['POST', '/api/competitions/5304/request', {}],
            ['DELETE', '/api/competitions/5304/request'],
            ['POST', '/api/competitions/5304/accept-request', { request_id: 1 }],
            ['POST', '/api/competitions/5304/decline-request', { request_id: 1 }],
            ['POST', '/api/competitions/5304/invite', { invitee_id: OPPONENT }],
            ['POST', '/api/competitions/5304/accept-invite', {}],
            ['POST', '/api/competitions/5304/decline-invite', {}],
        ];
        for (const [method, path, body] of targets) {
            const res = await call(method, path, undefined, body, 'ar');
            expect(res.status, `${method} ${path}`).toBe(401);
            expect(await errJson(res), `${method} ${path}`).toBe('غير مصرح');
        }
    });
});

describe('R2-J acceptance notification: distinct type, localized, language-correct link', () => {
    it('renders ar + en labels from the type with a lang-correct competition link', async () => {
        insertCompetition(5401);
        expect((await call('POST', '/api/competitions/5401/invite', CREATOR_SESSION, { invitee_id: OPPONENT })).status).toBe(200);
        expect((await call('POST', '/api/competitions/5401/accept-invite', B_SESSION, {})).status).toBe(200);

        const arRes = await call('GET', '/api/notifications', CREATOR_SESSION, undefined, 'ar');
        expect(arRes.status).toBe(200);
        const arJson = (await arRes.json()) as { data: { notifications: Array<Record<string, unknown>> } };
        const arNotif = arJson.data.notifications.find((n) => n.type === 'invitation_accepted');
        expect(arNotif, 'acceptance notification must exist').toBeTruthy();
        expect(arNotif?.title).toBe('تم قبول دعوتك');
        expect(arNotif?.link).toBe('/competition/5401?lang=ar');

        const enRes = await call('GET', '/api/notifications', CREATOR_SESSION, undefined, 'en');
        const enJson = (await enRes.json()) as { data: { notifications: Array<Record<string, unknown>> } };
        const enNotif = enJson.data.notifications.find((n) => n.type === 'invitation_accepted');
        expect(enNotif?.title).toBe('Invitation Accepted');
        expect(enNotif?.link).toBe('/competition/5401?lang=en');

        // The invite itself keeps its own type/label/link contract.
        const bRes = await call('GET', '/api/notifications', B_SESSION, undefined, 'en');
        const bJson = (await bRes.json()) as { data: { notifications: Array<Record<string, unknown>> } };
        const inviteNotif = bJson.data.notifications.find((n) => n.type === 'invitation');
        expect(inviteNotif?.title).toBe('Competition Invitation');
        expect(inviteNotif?.link).toBe('/competition/5401?lang=en');
    });
});

describe('R2-J persisted incoming/outgoing history (SSOT, no local Set)', () => {
    it('sent/received/invitations return every status; others and guests are refused', async () => {
        insertCompetition(5501);
        db.exec(`
            INSERT INTO competition_requests (competition_id, requester_id, status, created_at)
            VALUES (5501, ${OPPONENT}, 'pending', datetime('now')),
                   (5501, ${THIRD}, 'declined', datetime('now', '-1 hour')),
                   (5501, ${FOURTH}, 'rejected', datetime('now', '-2 hours'));
            INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status, created_at)
            VALUES (5501, ${CREATOR}, ${OPPONENT}, 'pending', datetime('now')),
                   (5501, ${CREATOR}, ${THIRD}, 'declined', datetime('now', '-1 hour')),
                   (5501, ${CREATOR}, ${FOURTH}, 'expired', datetime('now', '-2 hours'));
        `);

        // Received: all three request statuses, not pending-only.
        const received = await call('GET', `/api/users/${CREATOR}/requests?type=received`, CREATOR_SESSION);
        expect(received.status).toBe(200);
        const receivedRows = ((await received.json()) as { data: Array<Record<string, unknown>> }).data;
        expect(receivedRows.map((r) => r.status).sort()).toEqual(['declined', 'pending', 'rejected']);

        // Invitations: every status for the invitee.
        const bInvites = await call('GET', `/api/users/${OPPONENT}/requests?type=invitations`, B_SESSION);
        expect(((await bInvites.json()) as { data: Array<unknown> }).data.length).toBe(1);
        const cInvites = await call('GET', `/api/users/${THIRD}/requests?type=invitations`, C_SESSION);
        const cRows = ((await cInvites.json()) as { data: Array<Record<string, unknown>> }).data;
        expect(cRows.map((r) => r.status)).toEqual(['declined']);

        // Expired invite history is persisted too (other invitee).
        const dInvites = await call('GET', `/api/users/${FOURTH}/requests?type=invitations`, D_SESSION);
        const dRows = ((await dInvites.json()) as { data: Array<Record<string, unknown>> }).data;
        expect(dRows.map((r) => r.status)).toEqual(['expired']);

        // Sent: the requester's own outgoing history.
        const bSent = await call('GET', `/api/users/${OPPONENT}/requests?type=sent`, B_SESSION);
        expect(((await bSent.json()) as { data: Array<Record<string, unknown>> }).data[0].competition_title).toBe('R2J comp 5501');

        // Privacy: another user's inbox is 403; anonymous is 401.
        expect((await call('GET', `/api/users/${CREATOR}/requests?type=received`, B_SESSION)).status).toBe(403);
        expect((await call('GET', `/api/users/${CREATOR}/requests?type=received`, undefined)).status).toBe(401);
    });
});

describe('R2-J show-page invite state is current-user-specific', () => {
    it('only the invitee sees user_has_pending_invitation', async () => {
        insertCompetition(5601);
        expect((await call('POST', '/api/competitions/5601/invite', CREATOR_SESSION, { invitee_id: OPPONENT })).status).toBe(200);

        const asB = (await (await call('GET', '/api/competitions/5601', B_SESSION)).json()) as { data: Record<string, unknown> };
        expect(asB.data.user_has_pending_invitation).toBe(true);
        expect(asB.data.user_has_pending_request).toBe(false);

        const asC = (await (await call('GET', '/api/competitions/5601', C_SESSION)).json()) as { data: Record<string, unknown> };
        expect(asC.data.user_has_pending_invitation).toBe(false);

        const anon = (await (await call('GET', '/api/competitions/5601')).json()) as { data: Record<string, unknown> };
        expect(anon.data.user_has_pending_invitation).toBe(false);

        // After acceptance the flag clears for the invitee too.
        expect((await call('POST', '/api/competitions/5601/accept-invite', B_SESSION, {})).status).toBe(200);
        const afterB = (await (await call('GET', '/api/competitions/5601', B_SESSION)).json()) as { data: Record<string, unknown> };
        expect(afterB.data.user_has_pending_invitation).toBe(false);
    });
});
