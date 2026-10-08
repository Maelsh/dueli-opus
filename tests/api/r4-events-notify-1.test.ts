/**
 * R4-EVENTS-NOTIFY-1 — notifications/events focused pins.
 *
 * RED-FIRST: on BASE (5a74310) these FAIL because —
 *   1. POST /api/notifications/:id/star has no route (404) and the star is
 *      kept in memory only (is_starred column exists since 0001, never written);
 *   2. a NEW join request links the creator to /competition/:id, a page that
 *      shows the creator no Accept/Decline (the decision lives on /my-requests);
 *   3. DELETE /api/competitions/:id uses the plain row delete, so pending
 *      invite/request children FK-abort (or orphan) instead of cascading.
 * After the fix they pass. SqliteD1 runs the REAL migrations (FK ON), so the
 * N-07 cascade behaviour is production SQL, not an approximation.
 *
 * Out of scope (not asserted here): R1/R2/R3-closed journeys, permanent
 * closed=read policy (unapproved), production cleanup execution (leader-gated,
 * runbook in dev-tools/r4-events-notify-cleanup.sql).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../../src/main';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';
import { NotificationModel } from '../../src/models/NotificationModel';
import { t } from '../../src/i18n';

const CREATOR = 8101;
const REQUESTER = 8102;
const INVITEE = 8103;
const CREATOR_SESSION = 'r4n-sess-creator';
const REQUESTER_SESSION = 'r4n-sess-requester';
const INVITEE_SESSION = 'r4n-sess-invitee';

const CUTOFF = "datetime('2026-10-08T03:31:39Z')";

const env = (database: SqliteD1) => ({ DB: database as unknown as D1Database } as never);

let db: SqliteD1;

function seedBase(): void {
    db.exec(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active)
        VALUES (${CREATOR}, 'r4n-creator@test.local', 'r4n_creator', 'x', 'R4N Creator', 1, 1),
               (${REQUESTER}, 'r4n-requester@test.local', 'r4n_requester', 'x', 'R4N Requester', 1, 1),
               (${INVITEE}, 'r4n-invitee@test.local', 'r4n_invitee', 'x', 'R4N Invitee', 1, 1);
        INSERT INTO categories (id, slug, name_ar, name_en) VALUES (8100, 'r4n-cat', 'R4N', 'R4N Cat');
        INSERT INTO sessions (id, user_id, expires_at) VALUES
            ('${CREATOR_SESSION}', ${CREATOR}, datetime('now', '+1 day')),
            ('${REQUESTER_SESSION}', ${REQUESTER}, datetime('now', '+1 day')),
            ('${INVITEE_SESSION}', ${INVITEE}, datetime('now', '+1 day'));
    `);
}

function insertCompetition(id: number): void {
    db.exec(`
        INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, scheduled_at, competition_type)
        VALUES (${id}, 'R4N comp ${id}', 'rules', 8100, ${CREATOR}, NULL, 'pending', NULL, 'instant');
    `);
}

let ipOctet = 11;

/** Drive the real app; each request gets its own rate-limit bucket. */
async function call(
    method: string,
    path: string,
    session?: string,
    body?: unknown,
    lang = 'en'
): Promise<Response> {
    const separator = path.includes('?') ? '&' : '?';
    ipOctet = (ipOctet % 250) + 1;
    return app.request(
        `${path}${separator}lang=${lang}`,
        {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...(session ? { Authorization: `Bearer ${session}` } : {}),
                'X-CSRF-Token': 'test',
                'X-Forwarded-For': `10.9.9.${ipOctet}`,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
        },
        env(db)
    );
}

async function jsonBody(res: Response): Promise<any> {
    return res.json() as Promise<any>;
}

async function scalar(sql: string, ...params: unknown[]): Promise<unknown> {
    const bound = params.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
    const row = (await bound.first()) as Record<string, unknown> | null;
    return row === null ? null : Object.values(row)[0];
}

async function creatorNotifications(lang = 'en'): Promise<any[]> {
    const res = await call('GET', '/api/notifications', CREATOR_SESSION, undefined, lang);
    expect(res.status).toBe(200);
    const body = await jsonBody(res);
    return body.data.notifications as any[];
}

beforeEach(() => {
    db = createSqliteD1();
});

describe('R4-EVENTS-NOTIFY-1 — N-05 star route (was: 404 + memory-only)', () => {
    it('owner stars and unstars with persistence; presented ar+en', async () => {
        seedBase();
        const notes = new NotificationModel(db as unknown as D1Database);
        const note = await notes.createForType({
            user_id: CREATOR, type: 'follow', payload: { actor: 'R4N Requester' },
            reference_type: 'user', reference_id: REQUESTER,
        });

        const star = await call('POST', `/api/notifications/${note.id}/star`, CREATOR_SESSION, { starred: true });
        expect(star.status).toBe(200);
        expect((await jsonBody(star)).data.starred).toBe(true);
        expect(await scalar('SELECT is_starred FROM notifications WHERE id = ?', note.id)).toBe(1);

        for (const lang of ['en', 'ar'] as const) {
            const rows = await creatorNotifications(lang);
            expect(rows.find((n) => n.id === note.id)?.starred).toBe(true);
        }

        const unstar = await call('POST', `/api/notifications/${note.id}/star`, CREATOR_SESSION, { starred: false });
        expect(unstar.status).toBe(200);
        expect(await scalar('SELECT is_starred FROM notifications WHERE id = ?', note.id)).toBe(0);
    });

    it('cross-user star is 404 and touches nothing; anon 401; non-boolean 422', async () => {
        seedBase();
        const notes = new NotificationModel(db as unknown as D1Database);
        const note = await notes.createForType({
            user_id: CREATOR, type: 'follow', payload: { actor: 'X' },
            reference_type: 'user', reference_id: REQUESTER,
        });

        const cross = await call('POST', `/api/notifications/${note.id}/star`, REQUESTER_SESSION, { starred: true });
        expect(cross.status).toBe(404);
        expect(await scalar('SELECT is_starred FROM notifications WHERE id = ?', note.id)).toBe(0);

        const anon = await call('POST', `/api/notifications/${note.id}/star`, undefined, { starred: true });
        expect(anon.status).toBe(401);

        const bad = await call('POST', `/api/notifications/${note.id}/star`, CREATOR_SESSION, { starred: 'yes' });
        expect(bad.status).toBe(422);
        expect(await scalar('SELECT is_starred FROM notifications WHERE id = ?', note.id)).toBe(0);

        const missing = await call('POST', '/api/notifications/99991/star', CREATOR_SESSION, { starred: true });
        expect(missing.status).toBe(404);
    });
});

describe('R4-EVENTS-NOTIFY-1 — read persistence + badge from server (N-02/M-4)', () => {
    it('read flips is_read, unreadCount follows, repeat is idempotent', async () => {
        seedBase();
        const notes = new NotificationModel(db as unknown as D1Database);
        const a = await notes.createForType({ user_id: CREATOR, type: 'follow', payload: { actor: 'A' } });
        await notes.createForType({ user_id: CREATOR, type: 'follow', payload: { actor: 'B' } });

        const before = await call('GET', '/api/notifications', CREATOR_SESSION);
        expect((await jsonBody(before)).data.unreadCount).toBe(2);

        const read = await call('POST', `/api/notifications/${a.id}/read`, CREATOR_SESSION);
        expect(read.status).toBe(200);
        expect(await scalar('SELECT is_read FROM notifications WHERE id = ?', a.id)).toBe(1);

        const after = await call('GET', '/api/notifications', CREATOR_SESSION);
        expect((await jsonBody(after)).data.unreadCount).toBe(1);

        const repeat = await call('POST', `/api/notifications/${a.id}/read`, CREATOR_SESSION);
        expect(repeat.status).toBe(200);
        const still = await call('GET', '/api/notifications', CREATOR_SESSION);
        expect((await jsonBody(still)).data.unreadCount).toBe(1);
    });
});

describe('R4-EVENTS-NOTIFY-1 — N-03 QA sample (HEAD roles + links + decision)', () => {
    it('sample A (requester -> creator): notification links to the decision surface; creator accepts', async () => {
        seedBase();
        insertCompetition(8201);

        // Requester asks to join: 201 + creator notification is created.
        const req = await call('POST', '/api/competitions/8201/request', REQUESTER_SESSION, { message: 'let me in' });
        expect(req.status).toBe(201);
        const requestRow = (await jsonBody(req)).data;

        // Creator inbox: a NEW join-request notification whose link IS the
        // decision surface (was: /competition/8201, which shows the creator
        // no Accept/Decline).
        const rows = await creatorNotifications('en');
        const joinRow = rows.find((n) => n.type === 'request');
        expect(joinRow, 'creator has the join-request notification').toBeTruthy();
        expect(joinRow.link).toBe('/my-requests?lang=en');

        // The authorized decider (creator) reaches the pending request...
        const pending = await call('GET', '/api/competitions/8201/requests', CREATOR_SESSION);
        expect(pending.status).toBe(200);
        const list = (await jsonBody(pending)).data as any[];
        expect(list.some((r) => r.id === requestRow.id && r.status === 'pending')).toBe(true);

        // ...and the Accept decision works.
        const accept = await call('POST', '/api/competitions/8201/accept-request', CREATOR_SESSION, { request_id: requestRow.id });
        expect(accept.status).toBe(200);
    });

    it('sample B (creator -> invitee): invitation links to /competition/:id; invitee declines', async () => {
        seedBase();
        insertCompetition(8202);

        const inv = await call('POST', '/api/competitions/8202/invite', CREATOR_SESSION, { invitee_id: INVITEE });
        expect(inv.status).toBe(200);

        const res = await call('GET', '/api/notifications', INVITEE_SESSION, undefined, 'ar');
        expect(res.status).toBe(200);
        const rows = ((await jsonBody(res)).data.notifications as any[]);
        const inviteRow = rows.find((n) => n.type === 'invitation');
        expect(inviteRow, 'invitee has the invitation notification').toBeTruthy();
        // Invitee decides ON the competition page: link unchanged (working path).
        expect(inviteRow.link).toBe('/competition/8202?lang=ar');

        // The authorized decider (invitee) reaches the Decline decision.
        const decline = await call('POST', '/api/competitions/8202/decline-invite', INVITEE_SESSION, {});
        expect(decline.status).toBe(200);
    });

    it('accept receipt keeps the competition link (never the decision surface)', async () => {
        seedBase();
        insertCompetition(8203);
        const req = await call('POST', '/api/competitions/8203/request', REQUESTER_SESSION, {});
        const requestRow = (await jsonBody(req)).data;
        await call('POST', '/api/competitions/8203/accept-request', CREATOR_SESSION, { request_id: requestRow.id });

        const res = await call('GET', '/api/notifications', REQUESTER_SESSION);
        const rows = ((await jsonBody(res)).data.notifications as any[]);
        const receipt = rows.find((n) => n.type === 'request');
        expect(receipt, 'requester has the accept receipt').toBeTruthy();
        expect(receipt.link).toBe('/competition/8203?lang=en');
    });
});

describe('R4-EVENTS-NOTIFY-1 — N-07 competition delete cascades (was: FK-abort/orphans)', () => {
    it('creator delete removes requests + invitations, keeps notification history', async () => {
        seedBase();
        insertCompetition(8301);
        await call('POST', '/api/competitions/8301/request', REQUESTER_SESSION, {});
        const inv = await call('POST', '/api/competitions/8301/invite', CREATOR_SESSION, { invitee_id: INVITEE });
        expect(inv.status).toBe(200);
        expect(await scalar('SELECT COUNT(*) FROM competition_requests WHERE competition_id = 8301')).toBe(1);
        expect(await scalar('SELECT COUNT(*) FROM competition_invitations WHERE competition_id = 8301')).toBe(1);
        const notesBefore = await scalar('SELECT COUNT(*) FROM notifications WHERE reference_type = ? AND reference_id = ?', 'competition', 8301);

        const del = await call('DELETE', '/api/competitions/8301', CREATOR_SESSION);
        expect(del.status).toBe(200);

        expect(await scalar('SELECT COUNT(*) FROM competitions WHERE id = 8301')).toBe(0);
        expect(await scalar('SELECT COUNT(*) FROM competition_requests WHERE competition_id = 8301')).toBe(0);
        expect(await scalar('SELECT COUNT(*) FROM competition_invitations WHERE competition_id = 8301')).toBe(0);
        // History is preserved, never deleted by the competition delete.
        expect(await scalar('SELECT COUNT(*) FROM notifications WHERE reference_type = ? AND reference_id = ?', 'competition', 8301)).toBe(notesBefore);
    });

    it('non-creator delete stays 403; anon 401', async () => {
        seedBase();
        insertCompetition(8302);
        expect((await call('DELETE', '/api/competitions/8302', REQUESTER_SESSION)).status).toBe(403);
        expect((await call('DELETE', '/api/competitions/8302', undefined)).status).toBe(401);
        expect(await scalar('SELECT COUNT(*) FROM competitions WHERE id = 8302')).toBe(1);
    });
});

describe('R4-EVENTS-NOTIFY-1 — one-time cleanup SQL (local proof, NOT production)', () => {
    function seedAgedRows(): void {
        db.exec(`
            INSERT INTO notifications (id, user_id, type, title, message, reference_type, reference_id, is_read, created_at)
            VALUES (9101, ${CREATOR}, 'system', 'notification.system_notice', 'old unread', NULL, NULL, 0, '2026-09-01 00:00:00'),
                   (9102, ${CREATOR}, 'system', 'notification.system_notice', 'old read', NULL, NULL, 1, '2026-09-01 00:00:00'),
                   (9103, ${CREATOR}, 'system', 'notification.system_notice', 'just before cutoff', NULL, NULL, 0, '2026-10-08 03:31:38'),
                   (9104, ${CREATOR}, 'system', 'notification.system_notice', 'just after cutoff', NULL, NULL, 0, '2026-10-08 03:31:40'),
                   (9105, ${CREATOR}, 'system', 'notification.system_notice', 'new unread', NULL, NULL, 0, '2026-10-20 00:00:00');
        `);
    }

    /** The exact guarded UPDATE shipped in dev-tools/r4-events-notify-cleanup.sql. */
    async function guardedUpdate(): Promise<number> {
        const file = readFileSync(join(process.cwd(), 'dev-tools', 'r4-events-notify-cleanup.sql'), 'utf8');
        const update = file
            .split('\n')
            .filter((line) => !line.trim().startsWith('--'))
            .join('\n')
            .split(';')
            .map((s) => s.trim())
            .find((s) => s.startsWith('UPDATE notifications'));
        expect(update, 'guarded UPDATE present in the runbook file').toBeTruthy();
        expect(update).toContain('is_read = 0');
        expect(update).toContain("datetime('2026-10-08T03:31:39Z')");
        expect(update).not.toContain('DELETE');
        const outcome = await db.prepare(update!).run();
        return outcome.meta.changes;
    }

    it('only pre-cutoff unread rows flip; re-run changes 0 (idempotent)', async () => {
        seedBase();
        seedAgedRows();

        const before = await scalar(
            `SELECT COUNT(*) FROM notifications WHERE is_read = 0 AND created_at < ${CUTOFF}`
        );
        expect(before).toBe(2);

        const first = await guardedUpdate();
        expect(first).toBe(2);

        const page = await db
            .prepare('SELECT id, is_read FROM notifications WHERE id BETWEEN 9101 AND 9105 ORDER BY id')
            .all();
        const states = page.results as unknown as { id: number; is_read: number }[];
        expect(states.map((r) => [r.id, r.is_read])).toEqual([
            [9101, 1], [9102, 1], [9103, 1], [9104, 0], [9105, 0],
        ]);

        const after = await scalar(
            `SELECT COUNT(*) FROM notifications WHERE is_read = 0 AND created_at < ${CUTOFF}`
        );
        expect(after).toBe(0);

        const rerun = await guardedUpdate();
        expect(rerun).toBe(0);
        expect(await scalar('SELECT COUNT(*) FROM notifications')).toBe(5);
    });
});

describe('R4-EVENTS-NOTIFY-1 REMEDIATION P1 — full cascade + atomicity', () => {
    const COMP = 8401;

    /** Every competition-owned dependent with a real FK, plus history that must survive. */
    function seedFull(): void {
        seedBase();
        insertCompetition(COMP);
        db.exec(`
            INSERT INTO competition_requests (competition_id, requester_id, status, message, created_at)
                VALUES (${COMP}, ${REQUESTER}, 'pending', 'hi', datetime('now'));
            INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status, message, created_at)
                VALUES (${COMP}, ${CREATOR}, ${INVITEE}, 'pending', 'yo', datetime('now'));
            INSERT INTO ratings (competition_id, user_id, competitor_id, rating)
                VALUES (${COMP}, ${REQUESTER}, ${CREATOR}, 5);
            INSERT INTO comments (competition_id, user_id, content)
                VALUES (${COMP}, ${REQUESTER}, 'nice');
            INSERT INTO chunk_keys (competition_id, chunk_index, chunk_key)
                VALUES (${COMP}, 0, 'r4n-key-8401');
            INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status)
                VALUES (${COMP}, 'finalize_payouts', datetime('now', '+1 hour'), 'pending');
            INSERT INTO scheduled_competitions (user_id, competition_id, scheduled_at)
                VALUES (${CREATOR}, ${COMP}, datetime('now', '+1 hour'));
            INSERT INTO competition_suspensions (competition_id, admin_id, reason)
                VALUES (${COMP}, ${CREATOR}, 'r4n review');
            INSERT INTO user_hidden_competitions (user_id, competition_id)
                VALUES (${REQUESTER}, ${COMP});
            INSERT INTO likes (user_id, competition_id) VALUES (${REQUESTER}, ${COMP});
            INSERT INTO competition_views (competition_id, identity_kind, identity_key, view_day)
                VALUES (${COMP}, 'user', 'u:${REQUESTER}', date('now'));
            INSERT INTO watch_history (user_id, competition_id) VALUES (${REQUESTER}, ${COMP});
            INSERT INTO donations (user_id, amount, payment_method, competition_id)
                VALUES (${REQUESTER}, 5.0, 'card', ${COMP});
            INSERT INTO reports (reporter_id, target_type, target_id, reason)
                VALUES (${REQUESTER}, 'competition', ${COMP}, 'spam');
        `);
        db.exec(`UPDATE users SET current_competition_id = ${COMP} WHERE id = ${CREATOR}`);
    }

    async function count(table: string): Promise<unknown> {
        return scalar(`SELECT COUNT(*) FROM ${table} WHERE ${table === 'competitions' ? 'id' : 'competition_id'} = ${COMP}`);
    }

    it('delete with a live scheduled task removes every owned dependent in ONE batch; history survives', async () => {
        seedFull();
        const notes = new NotificationModel(db as unknown as D1Database);
        await notes.createForType({
            user_id: CREATOR, type: 'invitation_accepted', payload: { actor: 'R4N Invitee' },
            reference_type: 'competition', reference_id: COMP,
        });
        const batchSpy = vi.spyOn(db, 'batch');

        const del = await call('DELETE', `/api/competitions/${COMP}`, CREATOR_SESSION);
        expect(del.status).toBe(200);

        // One serialized write transaction — never statement-by-statement.
        expect(batchSpy).toHaveBeenCalledTimes(1);
        batchSpy.mockRestore();

        // Explicitly-deleted owned dependents (no ON DELETE action).
        for (const table of [
            'competitions', 'competition_requests', 'competition_invitations',
            'ratings', 'comments', 'chunk_keys', 'competition_scheduled_tasks',
            'scheduled_competitions', 'competition_suspensions', 'user_hidden_competitions',
        ]) {
            expect(await count(table), `${table} gone`).toBe(0);
        }
        // DB-cascaded dependents go with the parent automatically.
        for (const table of ['likes', 'competition_views', 'watch_history']) {
            expect(await count(table), `${table} cascaded`).toBe(0);
        }
        // History and money are preserved, never deleted here.
        expect(await scalar('SELECT COUNT(*) FROM notifications WHERE reference_type = ? AND reference_id = ?', 'competition', COMP)).toBe(1);
        expect(await scalar('SELECT COUNT(*) FROM reports WHERE target_type = ? AND target_id = ?', 'competition', COMP)).toBe(1);
        // SET NULL relations are nulled by the DB, rows kept.
        expect(await scalar('SELECT competition_id FROM donations WHERE user_id = ?', REQUESTER)).toBeNull();
        expect(await scalar('SELECT current_competition_id FROM users WHERE id = ?', CREATOR)).toBeNull();
    });

    it('injected batch failure ⇒ 500 with NOTHING partially deleted', async () => {
        seedBase();
        insertCompetition(COMP);
        db.exec(`
            INSERT INTO competition_requests (competition_id, requester_id, status, created_at)
                VALUES (${COMP}, ${REQUESTER}, 'pending', datetime('now'));
            INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status, created_at)
                VALUES (${COMP}, ${CREATOR}, ${INVITEE}, 'pending', datetime('now'));
        `);
        const batchSpy = vi.spyOn(db, 'batch').mockRejectedValueOnce(new Error('r4n-boom'));
        const del = await call('DELETE', `/api/competitions/${COMP}`, CREATOR_SESSION);
        expect(del.status).toBe(500);
        batchSpy.mockRestore();

        expect(await count('competitions')).toBe(1);
        expect(await count('competition_requests')).toBe(1);
        expect(await count('competition_invitations')).toBe(1);
    });

    it('batch rollback semantics: a mid-batch failure undoes earlier statements', async () => {
        seedBase();
        insertCompetition(COMP);
        db.exec(`
            INSERT INTO competition_requests (competition_id, requester_id, status, created_at)
                VALUES (${COMP}, ${REQUESTER}, 'pending', datetime('now'));
        `);
        await expect(
            db.batch([
                db.prepare('DELETE FROM competition_requests WHERE competition_id = ?').bind(COMP),
                db.prepare('DELETE FROM no_such_table_xyz WHERE id = ?').bind(1),
            ])
        ).rejects.toThrow();
        // The first DELETE was rolled back with the failed batch.
        expect(await count('competition_requests')).toBe(1);
    });
});

describe('R4-EVENTS-NOTIFY-1 — notification labels ar/en (item 6)', () => {
    it('dropdown/page keys exist, differ by language, and are honest', () => {
        for (const key of ['no_notifications', 'loading', 'mark_all_read', 'view'] as const) {
            const ar = t(key, 'ar');
            const en = t(key, 'en');
            expect(ar, `${key} ar`).not.toBe(key);
            expect(en, `${key} en`).not.toBe(key);
            expect(ar, `${key} ar!=en`).not.toBe(en);
        }
        for (const key of ['notification.star', 'notification.unstar'] as const) {
            expect(t(key, 'ar'), `${key} ar`).not.toBe(key);
            expect(t(key, 'en'), `${key} en`).not.toBe(key);
            expect(t(key, 'ar'), `${key} ar!=en`).not.toBe(t(key, 'en'));
        }
        expect(t('notifications_page.mark_read', 'ar')).not.toBe('notifications_page.mark_read');
        expect(t('notifications_page.mark_read', 'en')).not.toBe('notifications_page.mark_read');
    });
});
