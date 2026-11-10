/**
 * UNIT41.2-P1 (G5) — 1-hour lifecycle expiry for pending instant
 * competitions without an opponent + the opportunistic lifecycle sweep.
 *
 * Contract under test:
 * - ScheduledTaskService.expireInstantWithoutOpponent / cancelScheduled-
 *   WithoutOpponent are guarded operations: an opponent joining between the
 *   scan and the call makes the transition a no-op (`changes == 0`).
 * - The scanned maintenance (CronHandler.handleLifecycleTimers) ages an
 *   instant pending row >1h without an opponent OUT of every public read
 *   (delete for instant, cancel for scheduled) while accepted/live/
 *   completed rows and joined pending rows are untouched.
 * - Public reads hide an expired instant-pending row even before the sweep
 *   deletes it (CompetitionModel.EXPIRED_INSTANT_PENDING_SQL rides every
 *   listing/search/recommendation path).
 * - LifecycleSweep.trigger runs the same maintenance through
 *   executionCtx.waitUntil when present, with a 60s per-isolate interval.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { ScheduledTaskService } from '../../src/lib/services/ScheduledTaskService';
import { LifecycleSweep } from '../../src/lib/services/LifecycleSweep';
import { handleLifecycleTimers } from '../../src/lib/services/CronHandler';
import { CompetitionModel } from '../../src/models/CompetitionModel';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

const d1 = (db: SqliteD1) => db as unknown as D1Database;
const hoursAgo = (h: number): string => new Date(Date.now() - h * 3600_000).toISOString().slice(0, 19).replace('T', ' ');
const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString().slice(0, 19).replace('T', ' ');

async function seed(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country) VALUES
         (2, 'creator@g5.local', 'creatorg5', 'x', 'Creator G5', 1, 'ar', 'SA'),
         (4, 'opponent@g5.local', 'opponentg5', 'x', 'Opponent G5', 1, 'ar', 'SA')`,
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (10, 'dialogue', 'حوار', 'Dialogue')`,
    ).run();
}

async function insertPending(db: SqliteD1, opts: {
    type?: string; ageH?: number; opponent?: number | null; status?: string;
    scheduledAt?: string | null; title?: string;
}): Promise<number> {
    const r = await db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, creator_id, opponent_id, language, status,
             competition_type, created_at, scheduled_at, is_fake)
         VALUES (?, 'd', 'r', 10, 2, ?, 'ar', ?, ?, ?, ?, 0)`,
    ).bind(
        opts.title ?? 'G5 probe', opts.opponent ?? null, opts.status ?? 'pending',
        opts.type ?? 'instant', minutesAgo((opts.ageH ?? 0) * 60), opts.scheduledAt ?? null,
    ).run();
    return Number(r.meta.last_row_id);
}

async function exists(db: SqliteD1, id: number, status?: string): Promise<boolean> {
    const row = await db.prepare(
        `SELECT status FROM competitions WHERE id = ?`,
    ).bind(id).first<{ status: string }>();
    if (!row) return false;
    return status ? row.status === status : true;
}

/**
 * C-1: a competition whose opponent joins AFTER the lifecycle read but
 * BEFORE the deletion batch. The join is applied inside `batch()` — i.e.
 * exactly inside the race window the four sequential deletes used to leave
 * open (task deleted, join lands, competition delete fails, the row survives
 * WITHOUT its scheduled task and dependencies).
 */
function joinBeforeBatch(base: SqliteD1, competitionId: number, opponentId = 4): D1Database {
    const racing = {
        prepare: (sql: string) => base.prepare(sql),
        batch: (statements: unknown[]) =>
            base.prepare(
                `UPDATE competitions SET status = 'accepted', opponent_id = ? WHERE id = ?`,
            ).bind(opponentId, competitionId).run().then(() => base.batch(statements as never[])),
    };
    return racing as unknown as D1Database;
}

describe('UNIT41.2-P1 G5 — guarded lifecycle transitions', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('1. Rule A deletes an aged unopposed instant pending row and its dependencies', async () => {
        const id = await insertPending(db, { ageH: 2 });
        await db.prepare(
            `INSERT INTO competition_requests (competition_id, requester_id, status)
             VALUES (?, 4, 'pending')`,
        ).bind(id).run();
        await db.prepare(
            `INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status)
             VALUES (?, 2, 4, 'pending')`,
        ).bind(id).run();
        await db.prepare(`UPDATE users SET is_busy = 1, current_competition_id = ? WHERE id = 2`).bind(id).run();

        await new ScheduledTaskService(d1(db)).expireInstantWithoutOpponent(id);

        expect(await exists(db, id)).toBe(false);
        expect((await db.prepare(`SELECT COUNT(*) AS n FROM competition_requests WHERE competition_id = ?`)
            .bind(id).first<{ n: number }>())?.n).toBe(0);
        expect((await db.prepare(`SELECT COUNT(*) AS n FROM competition_invitations WHERE competition_id = ?`)
            .bind(id).first<{ n: number }>())?.n).toBe(0);
        const creator = await db.prepare(`SELECT is_busy FROM users WHERE id = 2`).first<{ is_busy: number }>();
        expect(creator?.is_busy).toBe(0);
        const alert = await db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = 2 AND reference_id = ?`)
            .bind(id).first<{ n: number }>();
        expect(alert?.n).toBeGreaterThan(0);
    });

    it('2. Rule A is a no-op when an opponent joined in the race', async () => {
        const id = await insertPending(db, { ageH: 2, opponent: 4 });
        // A join raced between the scan and the call: the READ guard sees the
        // opponent, and the guarded DELETE would also match 0 rows.
        await new ScheduledTaskService(d1(db)).expireInstantWithoutOpponent(id);
        expect(await exists(db, id, 'pending')).toBe(true);
    });

    it('3. Rule B cancels an aged unopposed scheduled row with the audit reason', async () => {
        const id = await insertPending(db, { type: 'scheduled', ageH: 2, scheduledAt: hoursAgo(1.5) });
        await new ScheduledTaskService(d1(db)).cancelScheduledWithoutOpponent(id);
        const row = await db.prepare(`SELECT status, auto_deleted_reason FROM competitions WHERE id = ?`)
            .bind(id).first<{ status: string; auto_deleted_reason: string }>();
        expect(row?.status).toBe('cancelled');
        expect(row?.auto_deleted_reason).toBe('scheduled_no_opponent_1hr');
    });

    it('4. Rule B leaves an unexpired schedule and a joined schedule alone', async () => {
        const fresh = await insertPending(db, {
            type: 'scheduled', ageH: 0.25, scheduledAt: new Date(Date.now() + 3600_000).toISOString().slice(0, 19).replace('T', ' '),
        });
        const joined = await insertPending(db, { type: 'scheduled', ageH: 2, opponent: 4, scheduledAt: hoursAgo(1.5) });
        await new ScheduledTaskService(d1(db)).cancelScheduledWithoutOpponent(fresh);
        await new ScheduledTaskService(d1(db)).cancelScheduledWithoutOpponent(joined);
        expect(await exists(db, fresh, 'pending')).toBe(true);
        expect(await exists(db, joined, 'pending')).toBe(true);
    });

    it('5. scanned maintenance ages the pending set; other statuses are untouched', async () => {
        const agedInstant = await insertPending(db, { ageH: 2, title: 'G5 aged instant' });
        const freshInstant = await insertPending(db, { ageH: 0.25, title: 'G5 fresh instant' });
        const joiner = await insertPending(db, { ageH: 2, opponent: 4, title: 'G5 joined' });
        const accepted = await insertPending(db, { ageH: 5, status: 'accepted', title: 'G5 accepted' });
        const live = await insertPending(db, { ageH: 5, status: 'live', title: 'G5 live' });
        const done = await insertPending(db, { ageH: 5, status: 'completed', title: 'G5 completed' });
        const agedScheduled = await insertPending(db, {
            type: 'scheduled', ageH: 2, scheduledAt: hoursAgo(1.5), title: 'G5 aged scheduled',
        });

        await handleLifecycleTimers({ DB: d1(db) });

        expect(await exists(db, agedInstant)).toBe(false);
        expect(await exists(db, agedScheduled, 'cancelled')).toBe(true);
        expect(await exists(db, freshInstant, 'pending')).toBe(true);
        expect(await exists(db, joiner, 'pending')).toBe(true);
        for (const id of [accepted, live, done]) {
            expect(await exists(db, id)).toBe(true);
        }
    });

    it('6. public reads hide an expired instant-pending row before the sweep runs', async () => {
        const expired = await insertPending(db, { ageH: 2, title: 'G5 expired visible' });
        // The exact law (UTC-safe twin): expired → hidden, fresh → public.
        const row = await db.prepare(
            `SELECT competition_type, status, opponent_id, created_at FROM competitions WHERE id = ?`,
        ).bind(expired).first<{
            competition_type: string; status: string; opponent_id: number | null; created_at: string;
        }>();
        expect(CompetitionModel.isExpiredInstantPending(row!)).toBe(true);

        const newList = await app.request(`/api/competitions?lang=ar&limit=50`, { headers: { 'CF-Connecting-IP': '10.7.8.1' } }, env(db));
        expect(newList.status).toBe(200);
        const listJson = (await newList.json()) as { success: boolean; data: Array<{ id: number }> };
        expect(listJson.success).toBe(true);
        // The list envelope is the ordered card array itself.
        expect(Array.isArray(listJson.data)).toBe(true);
        expect((listJson.data as Array<{ id: number }>).map((c) => c.id)).not.toContain(expired);

        const fresh = await app.request(`/api/search/competitions?q=${encodeURIComponent('G5 expired visible')}&lang=ar`, {
            headers: { 'CF-Connecting-IP': '10.7.8.2' },
        }, env(db));
        expect(fresh.status).toBe(200);
        const searchJson = (await fresh.json()) as { success: boolean; data: { items: Array<{ id: number }> } };
        expect(searchJson.success).toBe(true);
        expect(searchJson.data.items.map((c) => c.id)).not.toContain(expired);

        // The row-side twin normalizes the UTC stamp the scan wrote.
        expect(CompetitionModel.isExpiredInstantPending({
            competition_type: 'instant', status: 'pending', opponent_id: null, created_at: minutesAgo(15),
        })).toBe(false);
    });

    it('7. LifecycleSweep.trigger runs maintenance and honors the per-isolate interval', async () => {
        const firstId = await insertPending(db, { ageH: 2, title: 'G5 sweep one' });
        const now = 1_700_000_000_000;

        // Force the first pass (fresh isolate state is arranged by the timestamps).
        await LifecycleSweep.trigger(d1(db), { executionCtx: undefined } as never, { force: true, now });
        expect(await exists(db, firstId)).toBe(false);

        // A row that lands AFTER the first pass: within the 60s interval the
        // next trigger is skipped, so this aged row survives.
        const secondId = await insertPending(db, { ageH: 2, title: 'G5 sweep two' });
        await LifecycleSweep.trigger(d1(db), { executionCtx: undefined } as never, { now: now + 30_000 });
        expect(await exists(db, secondId)).toBe(true);

        // After the interval elapses the next public read sweeps again.
        await LifecycleSweep.trigger(d1(db), { executionCtx: undefined } as never, { now: now + 61_000 });
        expect(await exists(db, secondId)).toBe(false);
    });

    it('8. every public read/create path triggers the opportunistic sweep', () => {
        const src = readFileSync(join(process.cwd(), 'src/controllers/CompetitionController.ts'), 'utf-8');
        expect((src.match(/LifecycleSweep\.trigger\(/g) ?? []).length).toBeGreaterThanOrEqual(3);
    });

    it('9. (C-1) an opponent joining BEFORE the deletion batch leaves EVERYTHING intact', async () => {
        const id = await insertPending(db, { ageH: 2 });
        await db.prepare(
            `INSERT INTO competition_requests (competition_id, requester_id, status)
             VALUES (?, 4, 'pending')`,
        ).bind(id).run();
        await db.prepare(
            `INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status)
             VALUES (?, 2, 4, 'pending')`,
        ).bind(id).run();
        await db.prepare(
            `INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status, created_at)
             VALUES (?, 'auto_delete_if_not_live', ?, 'pending', datetime('now'))`,
        ).bind(id, new Date(Date.now() + 3600_000).toISOString()).run();
        await db.prepare(`UPDATE users SET is_busy = 1, current_competition_id = ? WHERE id = 2`).bind(id).run();

        // The opponent joins AFTER the lifecycle read, BEFORE the deletion
        // batch — exactly the race window the sequential deletes left open.
        await new ScheduledTaskService(joinBeforeBatch(db, id)).expireInstantWithoutOpponent(id);

        // The competition (and its opponent) survive the expiry attempt.
        const comp = await db.prepare(`SELECT status, opponent_id FROM competitions WHERE id = ?`)
            .bind(id).first<{ status: string; opponent_id: number | null }>();
        expect(comp?.status).toBe('accepted');
        expect(comp?.opponent_id).toBe(4);
        // EVERY dependency survives too — not one row was deleted.
        for (const table of ['competition_requests', 'competition_invitations', 'competition_scheduled_tasks']) {
            const n = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE competition_id = ?`)
                .bind(id).first<{ n: number }>();
            expect(n?.n).toBe(1);
        }
        // The creator is NOT freed and NO delete notification is sent.
        const creator = await db.prepare(`SELECT is_busy, current_competition_id FROM users WHERE id = 2`)
            .first<{ is_busy: number; current_competition_id: number | null }>();
        expect(creator?.is_busy).toBe(1);
        expect(creator?.current_competition_id).toBe(id);
        const notes = await db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = 2 AND reference_id = ?`)
            .bind(id).first<{ n: number }>();
        expect(notes?.n).toBe(0);
    });

    it('10. (C-1) expiry wins: dependencies, scheduled task and competition die as ONE unit', async () => {
        const id = await insertPending(db, { ageH: 2 });
        await db.prepare(
            `INSERT INTO competition_requests (competition_id, requester_id, status)
             VALUES (?, 4, 'pending')`,
        ).bind(id).run();
        await db.prepare(
            `INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status)
             VALUES (?, 2, 4, 'pending')`,
        ).bind(id).run();
        await db.prepare(
            `INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status, created_at)
             VALUES (?, 'auto_delete_if_not_live', ?, 'pending', datetime('now'))`,
        ).bind(id, new Date(Date.now() + 3600_000).toISOString()).run();
        await db.prepare(`UPDATE users SET is_busy = 1, current_competition_id = ? WHERE id = 2`).bind(id).run();

        await new ScheduledTaskService(d1(db)).expireInstantWithoutOpponent(id);

        // The competition is gone…
        expect(await exists(db, id)).toBe(false);
        // …and so is EVERY dependency: no partial remnant survives.
        for (const table of ['competition_requests', 'competition_invitations', 'competition_scheduled_tasks']) {
            const n = await db.prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE competition_id = ?`)
                .bind(id).first<{ n: number }>();
            expect(n?.n).toBe(0);
        }
        // The creator is freed and notified exactly once.
        const creator = await db.prepare(`SELECT is_busy FROM users WHERE id = 2`).first<{ is_busy: number }>();
        expect(creator?.is_busy).toBe(0);
        const notes = await db.prepare(`SELECT COUNT(*) AS n FROM notifications WHERE user_id = 2 AND reference_id = ?`)
            .bind(id).first<{ n: number }>();
        expect(notes?.n).toBe(1);
    });

    it('11. (C-1) the expiry sweep rides ONE guarded db.batch, not sequential deletes', () => {
        const src = readFileSync(join(process.cwd(), 'src/lib/services/ScheduledTaskService.ts'), 'utf-8');
        const start = src.indexOf('async expireInstantWithoutOpponent');
        const end = src.indexOf('async cancelScheduledWithoutOpponent');
        expect(start).toBeGreaterThan(-1);
        expect(end).toBeGreaterThan(start);
        const body = src.slice(start, end);

        // ONE atomic batch instead of four sequential .run() deletes.
        expect((body.match(/await this\.db\.batch\(/g) ?? []).length).toBe(1);
        // The four statements ride the batch in dependency order.
        const requests = body.indexOf('DELETE FROM competition_requests');
        const invitations = body.indexOf('DELETE FROM competition_invitations');
        const tasks = body.indexOf('DELETE FROM competition_scheduled_tasks');
        const competitions = body.indexOf('DELETE FROM competitions');
        expect(requests).toBeGreaterThan(-1);
        expect(invitations).toBeGreaterThan(requests);
        expect(tasks).toBeGreaterThan(invitations);
        expect(competitions).toBeGreaterThan(tasks);
        // Each dependency delete keeps the same pending/opponent-less guard.
        const guard = /AND EXISTS \(SELECT 1 FROM competitions WHERE id = \? AND status = 'pending' AND opponent_id IS NULL\)/g;
        expect((body.match(guard) ?? []).length).toBe(3);
        // The competition delete keeps its direct guard.
        expect(body).toMatch(/DELETE FROM competitions\s+WHERE id = \? AND status = 'pending' AND opponent_id IS NULL/);
        // Freeing the creator + notifying ride the 4th statement's change count.
        expect(body).toMatch(/batchResults\[3\]\?\.meta\?\.changes/);
        // No direct .run() left besides the creator UPDATE and the notification INSERT.
        expect((body.match(/\.run\(\)/g) ?? []).length).toBe(2);
    });
});
