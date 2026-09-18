/**
 * @file tests/services/lifecycle-consolidation.test.ts
 * @description F-6: proves the Competition lifecycle is now a Single Source
 * of Truth in ScheduledTaskService, exercised through BOTH the cron scan path
 * (CronHandler.runMinuteMaintenance -> handleLifecycleTimers) and the
 * scheduled-task engine (ScheduledTaskService.processPendingTasks). Real
 * migrations + real SQL via tests/helpers/sqlite-d1.ts (node:sqlite). No
 * new dependencies.
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { ScheduledTaskService } from '../../src/lib/services/ScheduledTaskService';
import { runMinuteMaintenance } from '../../src/lib/services/CronHandler';
import type { CronEnv } from '../../src/lib/services/CronHandler';
import { createSqliteD1 } from '../helpers/sqlite-d1';
import type { D1Database } from '@cloudflare/workers-types';

const db = () => createSqliteD1() as unknown as D1Database;

async function exec(d: D1Database, sql: string) {
    await d.prepare(sql).run();
}

async function statusOf(d: D1Database, id: number): Promise<string | null> {
    const r = (await d.prepare(`SELECT status FROM competitions WHERE id = ?`).bind(id).first()) as { status: string } | null;
    return r?.status ?? null;
}

async function exists(d: D1Database, sql: string): Promise<boolean> {
    return (await d.prepare(sql).first()) !== null;
}

async function notesFor(d: D1Database, userId: number): Promise<{ title: string; message: string }[]> {
    const r = (await d.prepare(`SELECT title, message FROM notifications WHERE user_id = ? ORDER BY id ASC`).bind(userId).all()) as any;
    return r.results as { title: string; message: string }[];
}

async function isBusy(d: D1Database, userId: number): Promise<boolean> {
    const r = (await d.prepare(`SELECT is_busy FROM users WHERE id = ?`).bind(userId).first()) as any;
    return r?.is_busy === 1;
}

async function taskStatus(d: D1Database, compId: number): Promise<string | null> {
    const r = (await d.prepare(`SELECT status FROM competition_scheduled_tasks WHERE competition_id = ?`).bind(compId).first()) as any;
    return r?.status ?? null;
}

async function seedBase(d: D1Database) {
    await exec(d, `INSERT INTO users (id, email, username, password_hash, display_name, is_verified) VALUES (9001, 'a@test.local', 'a', 'x', 'A', 1);`);
    await exec(d, `INSERT INTO users (id, email, username, password_hash, display_name, is_verified) VALUES (9002, 'b@test.local', 'b', 'x', 'B', 1);`);
    await exec(d, `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (9001, 'c', 'C', 'C');`);
}

/* safely past the 1h boundary */
const PAST_1H = `datetime('now', '-2 hours')`;
/* safely past the 2h boundary */
const PAST_2H = `datetime('now', '-2 hours', '-5 minutes')`;

describe('F-6 lifecycle consolidation (real SQLite + real migrations)', () => {
    let d: D1Database;
    let svc: ScheduledTaskService;

    beforeEach(async () => {
        d = db();
        svc = new ScheduledTaskService(d);
        await seedBase(d);
    });

    /* ---------- RULE A ---------- */
    it('Rule A cron: instant pending >1h w/o opponent deleted + cleaned + notified', async () => {
        await exec(d, `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, created_at) VALUES (1, 'i', 'r', 9001, 9001, NULL, 'pending', 'instant', ${PAST_1H});`);
        await exec(d, `INSERT INTO competition_requests (competition_id, requester_id) VALUES (1, 9002);`);
        await exec(d, `INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id) VALUES (1, 9001, 9002);`);

        await runMinuteMaintenance({ DB: d } as CronEnv);

        expect(await statusOf(d, 1)).toBeNull();
        expect(await exists(d, `SELECT 1 FROM competition_requests WHERE competition_id = 1`)).toBe(false);
        expect(await exists(d, `SELECT 1 FROM competition_invitations WHERE competition_id = 1`)).toBe(false);
        expect(await isBusy(d, 9001)).toBe(false);
        expect((await notesFor(d, 9001)).some(n => n.title === 'Competition Deleted')).toBe(true);
    });

    it('Rule A task path: auto_delete task produces the same result', async () => {
        await exec(d, `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, created_at) VALUES (2, 'i', 'r', 9001, 9001, NULL, 'pending', 'instant', ${PAST_1H});`);
        await exec(d, `INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status, created_at) VALUES (2, 'auto_delete_if_not_live', ${PAST_1H}, 'pending', datetime('now'));`);

        const r = await svc.processPendingTasks();
        expect(r.processed).toBeGreaterThan(0);
        expect(await statusOf(d, 2)).toBeNull();
        expect(await isBusy(d, 9001)).toBe(false);
    });

    it('Rule A: instant pending <1h untouched by cron', async () => {
        await exec(d, `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, created_at) VALUES (3, 'i', 'r', 9001, 9001, NULL, 'pending', 'instant', datetime('now', '-30 minutes'));`);
        await runMinuteMaintenance({ DB: d } as CronEnv);
        expect(await statusOf(d, 3)).toBe('pending');
    });

    /* ---------- RULE B ---------- */
    it('Rule B cron: scheduled w/o opponent >1h past scheduled_at cancelled + cleaned + notified', async () => {
        await exec(d, `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, scheduled_at, created_at) VALUES (4, 's', 'r', 9001, 9001, NULL, 'pending', 'scheduled', ${PAST_1H}, ${PAST_1H});`);

        await runMinuteMaintenance({ DB: d } as CronEnv);

        expect(await statusOf(d, 4)).toBe('cancelled');
        expect(await isBusy(d, 9001)).toBe(false);
        expect(await exists(d, `SELECT 1 FROM competition_requests WHERE competition_id = 4`)).toBe(false);
        expect((await notesFor(d, 9001)).some(n => n.message === 'Your scheduled competition was cancelled because no opponent joined within 1 hour of the scheduled time.')).toBe(true);
    });

    it('Rule B cron: scheduled WITH opponent cancels + frees both users + dual notify', async () => {
        await exec(d, `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, scheduled_at, created_at) VALUES (5, 's', 'r', 9001, 9001, 9002, 'accepted', 'scheduled', ${PAST_1H}, ${PAST_1H});`);
        await runMinuteMaintenance({ DB: d } as CronEnv);
        expect(await statusOf(d, 5)).toBe('cancelled');
        expect(await isBusy(d, 9001)).toBe(false);
        expect(await isBusy(d, 9002)).toBe(false);
        expect((await notesFor(d, 9001)).some(n => n.title === 'Competition Cancelled')).toBe(true);
        expect((await notesFor(d, 9002)).some(n => n.title === 'Competition Cancelled')).toBe(true);
    });

    it('Rule B: fresh scheduled (within 1h) untouched', async () => {
        await exec(d, `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, scheduled_at, created_at) VALUES (6, 's', 'r', 9001, 9001, 9002, 'accepted', 'scheduled', datetime('now', '-30 minutes'), datetime('now'));`);
        await runMinuteMaintenance({ DB: d } as CronEnv);
        expect(await statusOf(d, 6)).toBe('accepted');
    });

    /* ---------- RULE C ---------- */
    it('Rule C cron: live >=2h auto-ended, users freed, chunk_keys deleted', async () => {
        await exec(d, `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, started_at, created_at) VALUES (7, 'l', 'r', 9001, 9001, 9002, 'live', 'scheduled', ${PAST_2H}, ${PAST_2H});`);
        await exec(d, `INSERT INTO chunk_keys (competition_id, chunk_index, chunk_key) VALUES (7, 1, 'k1');`);

        await runMinuteMaintenance({ DB: d } as CronEnv);

        expect(await statusOf(d, 7)).toBe('completed');
        expect(await isBusy(d, 9001)).toBe(false);
        expect(await isBusy(d, 9002)).toBe(false);
        expect(await exists(d, `SELECT 1 FROM chunk_keys WHERE competition_id = 7`)).toBe(false);
        const row7 = (await d.prepare(`SELECT auto_deleted_reason FROM competitions WHERE id = 7`).first()) as any;
        expect(row7?.auto_deleted_reason).toBe('live_max_2hr');
    });

    it('Rule C task path: auto_end_live (1.9h threshold) ends live competition', async () => {
        await exec(d, `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, started_at, created_at) VALUES (8, 'l', 'r', 9001, 9001, 9002, 'live', 'scheduled', ${PAST_2H}, ${PAST_2H});`);
        await exec(d, `INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status, created_at) VALUES (8, 'auto_end_live', ${PAST_1H}, 'pending', datetime('now'));`);

        await svc.processPendingTasks();
        expect(await statusOf(d, 8)).toBe('completed');
        expect(await isBusy(d, 9001)).toBe(false);
    });

    /* ---------- EQUIVALENCE / IDEMPOTENCY ---------- */
    it('scan path catches competitions the task engine never fires for', async () => {
        await exec(d, `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, started_at, created_at) VALUES (9, 'l', 'r', 9001, 9001, 9002, 'live', 'scheduled', ${PAST_2H}, ${PAST_2H});`);
        await svc.processPendingTasks();
        expect(await statusOf(d, 9)).toBe('live');
        await runMinuteMaintenance({ DB: d } as CronEnv);
        expect(await statusOf(d, 9)).toBe('completed');
    });

    it('cron is idempotent: second run does not duplicate notifications', async () => {
        await exec(d, `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, created_at) VALUES (10, 'i', 'r', 9001, 9001, NULL, 'pending', 'instant', ${PAST_1H});`);
        await runMinuteMaintenance({ DB: d } as CronEnv);
        await runMinuteMaintenance({ DB: d } as CronEnv);
        expect((await notesFor(d, 9001)).filter(n => n.title === 'Competition Deleted').length).toBe(1);
    });

    it('task path marks task rows completed (duplicate execution protection)', async () => {
        // Use auto_end_live so the competition row is NOT deleted — task row
        // survives and executeTask can mark it 'completed'. Proves that a
        // second processPendingTasks() call leaves the row as 'completed'
        // (status != 'pending' → skipped by the query) and no duplicate action.
        await exec(d, `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type, started_at, created_at) VALUES (11, 'l', 'r', 9001, 9001, 9002, 'live', 'scheduled', ${PAST_2H}, ${PAST_2H});`);
        await exec(d, `INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status, created_at) VALUES (11, 'auto_end_live', ${PAST_1H}, 'pending', datetime('now'));`);

        await svc.processPendingTasks();
        expect(await taskStatus(d, 11)).toBe('completed');
        await svc.processPendingTasks();
        expect(await taskStatus(d, 11)).toBe('completed');
    });
});

