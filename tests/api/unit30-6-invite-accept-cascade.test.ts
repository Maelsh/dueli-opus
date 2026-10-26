/**
 * UNIT30.6 / D-01 — invitation acceptance must answer with the REAL outcome
 * (truthful 200) even when the acceptor's auto-delete cleans up their other
 * pending competitions.
 *
 * Production evidence (competitions 2262/2263, 2026-10-25, users 9045/9046):
 * the atomic accept committed, then handleAutoDeleteOnJoin deleted the
 * acceptor's other pending competitions with a BARE competition delete.
 * Every pending competition owns rows in no-action FK tables —
 * competition_scheduled_tasks (0006) at minimum — so the bare DELETE
 * violated the foreign key, threw AFTER the accept had already committed,
 * and the endpoint answered HTTP 500. The accepted state only appeared
 * after a page refresh; the invitation_accepted notification and the SSE
 * pushes were lost (verified: no invitation_accepted notification existed
 * for the creator of 2262/2263).
 *
 * Contract (R2-J + 15 §15.10 D-01): the auto-delete uses the same atomic
 * cascade delete as moderation (one db.batch surveying all dependents), so
 * a successful accept returns 200 {accepted: true} exactly once, keeps the
 * acceptance notification/event exactly once, and never fabricates success
 * when the core operation failed.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../../src/main';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';

const CREATOR = 7401; // inviter (A)
const INVITEE = 7402; // acceptor (B)
const CREATOR_SESSION = 'u306-sess-creator';
const INVITEE_SESSION = 'u306-sess-invitee';

const env = (database: SqliteD1) => ({ DB: database as unknown as D1Database } as never);

let db: SqliteD1;

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

function seedBase(): void {
    db.exec(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active)
        VALUES (${CREATOR}, 'u306-creator@test.local', 'u306_creator', 'x', 'U306 Creator', 1, 1),
               (${INVITEE}, 'u306-invitee@test.local', 'u306_invitee', 'x', 'U306 Invitee', 1, 1);
        INSERT INTO categories (id, slug, name_ar, name_en) VALUES (7400, 'u306-cat', 'U306', 'U306 Cat');
        INSERT INTO sessions (id, user_id, expires_at) VALUES
            ('${CREATOR_SESSION}', ${CREATOR}, datetime('now', '+1 day')),
            ('${INVITEE_SESSION}', ${INVITEE}, datetime('now', '+1 day'));
    `);
}

function insertCompetition(
    id: number,
    options: { creator?: number; status?: string; scheduledAt?: string | null } = {}
): void {
    const creator = options.creator ?? CREATOR;
    const status = options.status ?? 'pending';
    const scheduledAt = options.scheduledAt ?? null;
    const type = scheduledAt === null ? 'instant' : 'scheduled';
    db.exec(`
        INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, scheduled_at, competition_type)
        VALUES (${id}, 'U306 comp ${id}', 'rules', 7400, ${creator}, NULL, '${status}',
                ${scheduledAt === null ? 'NULL' : `'${scheduledAt}'`}, '${type}');
    `);
}

/**
 * Mirror the production 2262/2263 dependent shape: every pending competition
 * owns a lifecycle task row (competition_scheduled_tasks — FK with NO
 * ON DELETE action). This is the deterministic foreign-key blocker that made
 * the bare DELETE throw after the accept had committed.
 */
function insertScheduledTask(competitionId: number): void {
    db.exec(`
        INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status)
        VALUES (${competitionId}, 'end', datetime('now', '+1 hour'), 'pending');
    `);
}

async function scalar(sql: string): Promise<unknown> {
    const row = (await db.prepare(sql).first()) as Record<string, unknown> | null;
    return row === null ? null : Object.values(row)[0];
}

beforeEach(() => {
    db = createSqliteD1();
    seedBase();
});

describe('UNIT30.6 D-01: accept-invite answers truthfully across the auto-delete', () => {
    it('accept succeeds and cascade-deletes the acceptor blocked pending competition (production 2262/2263 defect)', async () => {
        // Target competition the creator invites B into (instant, pending).
        insertCompetition(7411);
        // B's OTHER pending instant competition — blocked by lifecycle-task
        // rows exactly like production 2245–2249 were.
        insertCompetition(7451, { creator: INVITEE });
        insertScheduledTask(7451);
        insertScheduledTask(7451);
        // And a legacy-shaped invitation row on it (invitations are CASCADE,
        // so alone they never blocked the delete — tasks did).
        db.exec(`
            INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status)
            VALUES (7451, ${INVITEE}, ${CREATOR}, 'pending');
        `);

        const invited = await call('POST', '/api/competitions/7411/invite', CREATOR_SESSION, { invitee_id: INVITEE });
        expect(invited.status).toBe(200);

        const accepted = await call('POST', '/api/competitions/7411/accept-invite', INVITEE_SESSION);
        // THE DEFECT: this was 500 while the accept had already committed.
        expect(accepted.status).toBe(200);
        const body = (await accepted.json()) as { success?: boolean; data?: { accepted?: boolean; autoDeleted?: number } };
        expect(body.success).toBe(true);
        expect(body.data?.accepted).toBe(true);
        expect(body.data?.autoDeleted).toBe(1);

        // The blocked pending competition and ALL its dependents are gone.
        expect(await scalar('SELECT COUNT(*) FROM competitions WHERE id = 7451')).toBe(0);
        expect(await scalar('SELECT COUNT(*) FROM competition_scheduled_tasks WHERE competition_id = 7451')).toBe(0);
        expect(await scalar('SELECT COUNT(*) FROM competition_invitations WHERE competition_id = 7451')).toBe(0);

        // The acceptance itself is real and the dedicated notification fired
        // exactly once (it never fired in production because the 500 hit
        // before createForType).
        expect(await scalar('SELECT opponent_id FROM competitions WHERE id = 7411')).toBe(INVITEE);
        expect(await scalar(
            `SELECT COUNT(*) FROM notifications
             WHERE user_id = ${CREATOR} AND type = 'invitation_accepted' AND reference_id = 7411`
        )).toBe(1);
    });

    it('retry / double click keeps a single acceptance notification and 409s the repeat', async () => {
        insertCompetition(7411);
        const invited = await call('POST', '/api/competitions/7411/invite', CREATOR_SESSION, { invitee_id: INVITEE });
        expect(invited.status).toBe(200);

        const first = await call('POST', '/api/competitions/7411/accept-invite', INVITEE_SESSION);
        expect(first.status).toBe(200);

        const second = await call('POST', '/api/competitions/7411/accept-invite', INVITEE_SESSION);
        expect(second.status).toBe(409);

        expect(await scalar(
            `SELECT COUNT(*) FROM notifications
             WHERE user_id = ${CREATOR} AND type = 'invitation_accepted' AND reference_id = 7411`
        )).toBe(1);
        expect(await scalar('SELECT COUNT(*) FROM competitions WHERE opponent_id = ' + INVITEE + ' AND id = 7411')).toBe(1);
    });

    it('scheduled-conflict auto-delete cascade-deletes the acceptor conflicting competition', async () => {
        // Scheduled target at 10:00; B's own pending scheduled comp inside the
        // 2h conflict window, blocked by its own lifecycle-task row.
        insertCompetition(7412, { scheduledAt: '2026-12-01 10:00:00' });
        insertCompetition(7452, { creator: INVITEE, scheduledAt: '2026-12-01 10:30:00' });
        insertScheduledTask(7452);

        const invited = await call('POST', '/api/competitions/7412/invite', CREATOR_SESSION, { invitee_id: INVITEE });
        expect(invited.status).toBe(200);

        const accepted = await call('POST', '/api/competitions/7412/accept-invite', INVITEE_SESSION);
        expect(accepted.status).toBe(200);
        const body = (await accepted.json()) as { success?: boolean; data?: { accepted?: boolean; autoDeleted?: number } };
        expect(body.success).toBe(true);
        expect(body.data?.accepted).toBe(true);
        expect(body.data?.autoDeleted).toBe(1);

        expect(await scalar('SELECT COUNT(*) FROM competitions WHERE id = 7452')).toBe(0);
        expect(await scalar('SELECT COUNT(*) FROM competition_scheduled_tasks WHERE competition_id = 7452')).toBe(0);
    });

    it('accept with no other pending competitions still succeeds (autoDeleted 0)', async () => {
        insertCompetition(7411);
        const invited = await call('POST', '/api/competitions/7411/invite', CREATOR_SESSION, { invitee_id: INVITEE });
        expect(invited.status).toBe(200);

        const accepted = await call('POST', '/api/competitions/7411/accept-invite', INVITEE_SESSION);
        expect(accepted.status).toBe(200);
        const body = (await accepted.json()) as { success?: boolean; data?: { accepted?: boolean; autoDeleted?: number } };
        expect(body.success).toBe(true);
        expect(body.data?.accepted).toBe(true);
        expect(body.data?.autoDeleted).toBe(0);
        expect(await scalar('SELECT opponent_id FROM competitions WHERE id = 7411')).toBe(INVITEE);
    });
});
