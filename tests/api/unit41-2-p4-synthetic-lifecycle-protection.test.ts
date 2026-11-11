/**
 * UNIT41.2-P4 — synthetic-competition lifecycle protection (incident
 * remediation for the PR #160 / LifecycleSweep auto-complete incident).
 *
 * Contract under test:
 * - Automatic lifecycle processing (CronHandler Rules A/B/C scans, the
 *   scheduled-task engine, and the read-time pending-expiry law) must NEVER
 *   delete, cancel, complete, expire or hide a synthetic competition
 *   (`is_fake = 1`). `COALESCE(is_fake, 0) = 0` identifies real records;
 *   NULL/unknown is treated as real.
 * - Real competitions keep the exact pre-incident behavior.
 * - The final UPDATE in the shared live-limit operation carries the
 *   real-record predicate, so a bypassed read guard still cannot write a
 *   synthetic row.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { ScheduledTaskService } from '../../src/lib/services/ScheduledTaskService';
import { handleLifecycleTimers } from '../../src/lib/services/CronHandler';
import { CompetitionModel } from '../../src/models/CompetitionModel';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;
const d1 = (db: SqliteD1) => db as unknown as D1Database;

const hoursAgo = (h: number): string =>
    new Date(Date.now() - h * 3600_000).toISOString().slice(0, 19).replace('T', ' ');

async function seed(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country, is_fake) VALUES
         (2, 'creator@p4.local', 'creatorp4', 'x', 'Creator P4', 1, 'ar', 'SA', 1),
         (4, 'opponent@p4.local', 'opponentp4', 'x', 'Opponent P4', 1, 'ar', 'SA', 1)`,
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (10, 'dialogue', 'حوار', 'Dialogue')`,
    ).run();
}

async function insertCompetition(db: SqliteD1, opts: {
    title?: string;
    status?: string;
    type?: string;
    isFake?: number;
    opponent?: number | null;
    createdAt?: string;
    startedAt?: string | null;
    scheduledAt?: string | null;
}): Promise<number> {
    const r = await db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, creator_id, opponent_id, language, status,
             competition_type, created_at, started_at, scheduled_at, is_fake)
         VALUES (?, 'd', 'r', 10, 2, ?, 'ar', ?, ?, ?, ?, ?, ?)`,
    ).bind(
        opts.title ?? 'P4 probe',
        opts.opponent ?? null,
        opts.status ?? 'pending',
        opts.type ?? 'instant',
        opts.createdAt ?? hoursAgo(0),
        opts.startedAt ?? null,
        opts.scheduledAt ?? null,
        opts.isFake ?? 0,
    ).run();
    return Number(r.meta.last_row_id);
}

async function row(db: SqliteD1, id: number): Promise<any | null> {
    return db.prepare(`SELECT * FROM competitions WHERE id = ?`).bind(id).first();
}

/**
 * Simulates a bypassed/mis-sequenced read guard: the live-limit SELECT still
 * runs, but its `is_fake` value is hidden from the caller. The final UPDATE
 * must then be the only thing protecting the synthetic row.
 */
function stripIsFakeFromRead(base: SqliteD1): D1Database {
    const original = base.prepare.bind(base);
    return {
        prepare(sql: string) {
            const stmt = original(sql);
            if (sql.includes('started_at, is_fake FROM competitions')) {
                return {
                    bind(...params: unknown[]) {
                        const bound = stmt.bind(...params);
                        return {
                            async first<T = any>(): Promise<T | null> {
                                const value = await bound.first<T>();
                                return (value ? { ...value, is_fake: 0 } : value) as T | null;
                            },
                        };
                    },
                };
            }
            return stmt;
        },
        batch: (statements: never[]) => base.batch(statements as never),
    } as unknown as D1Database;
}

describe('UNIT41.2-P4 — synthetic lifecycle protection', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('1. scan path: old synthetic live stays live; old real live still auto-completes', async () => {
        const synthetic = await insertCompetition(db, {
            title: 'P4 synthetic live', status: 'live', type: 'scheduled',
            isFake: 1, opponent: 4, createdAt: hoursAgo(5), startedAt: hoursAgo(3),
        });
        const real = await insertCompetition(db, {
            title: 'P4 real live', status: 'live', type: 'scheduled',
            isFake: 0, opponent: 4, createdAt: hoursAgo(5), startedAt: hoursAgo(3),
        });

        await handleLifecycleTimers({ DB: d1(db) });

        const s = await row(db, synthetic);
        expect(s.status).toBe('live');
        expect(s.auto_deleted_reason).toBeNull();
        expect(s.end_reason).toBeNull();
        expect(s.ended_at).toBeNull();

        const r = await row(db, real);
        expect(r.status).toBe('completed');
        expect(r.auto_deleted_reason).toBe('live_max_2hr');
        expect(r.end_reason).toBe('auto_end');
    });

    it('2. scheduled-task path: old synthetic live stays live (auto_end_live)', async () => {
        const synthetic = await insertCompetition(db, {
            title: 'P4 synthetic task live', status: 'live', type: 'scheduled',
            isFake: 1, opponent: 4, createdAt: hoursAgo(5), startedAt: hoursAgo(3),
        });
        await db.prepare(
            `INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status, created_at)
             VALUES (?, 'auto_end_live', datetime('now', '-1 hour'), 'pending', datetime('now'))`,
        ).bind(synthetic).run();

        const result = await new ScheduledTaskService(d1(db)).processPendingTasks();
        expect(result.errors).toBe(0);

        const s = await row(db, synthetic);
        expect(s.status).toBe('live');
        expect(s.auto_deleted_reason).toBeNull();
        expect(s.end_reason).toBeNull();
        expect(s.ended_at).toBeNull();

        // The task row itself is consumed (engine ran) but produced no lifecycle effect.
        const task = await db.prepare(
            `SELECT status FROM competition_scheduled_tasks WHERE competition_id = ? AND task_type = 'auto_end_live'`,
        ).bind(synthetic).first<{ status: string }>();
        expect(task?.status).toBe('completed');

        // No notification was emitted for the synthetic participants.
        const notes = await db.prepare(
            `SELECT COUNT(*) AS n FROM notifications WHERE reference_id = ?`,
        ).bind(synthetic).first<{ n: number }>();
        expect(notes?.n).toBe(0);
    });

    it('3. scan path: old synthetic instant pending survives and stays publicly visible', async () => {
        const synthetic = await insertCompetition(db, {
            title: 'P4 synthetic pending visible', status: 'pending', type: 'instant',
            isFake: 1, createdAt: hoursAgo(3),
        });

        await handleLifecycleTimers({ DB: d1(db) });

        const s = await row(db, synthetic);
        expect(s.status).toBe('pending');

        // Read-time law: a synthetic row is not "expired" ...
        expect(CompetitionModel.isExpiredInstantPending({
            competition_type: 'instant', status: 'pending', opponent_id: null,
            created_at: hoursAgo(3), is_fake: 1,
        })).toBe(false);

        // ... and it is still listed publicly.
        const res = await app.request(
            `/api/competitions?lang=ar&limit=50`,
            { headers: { 'CF-Connecting-IP': '10.9.8.1' } },
            env(db),
        );
        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; data: Array<{ id: number }> };
        expect(json.success).toBe(true);
        expect(json.data.map((c) => c.id)).toContain(synthetic);

        const search = await app.request(
            `/api/search/competitions?q=${encodeURIComponent('P4 synthetic pending visible')}&lang=ar`,
            { headers: { 'CF-Connecting-IP': '10.9.8.2' } },
            env(db),
        );
        const searchJson = (await search.json()) as { success: boolean; data: { items: Array<{ id: number }> } };
        expect(searchJson.success).toBe(true);
        expect(searchJson.data.items.map((c) => c.id)).toContain(synthetic);
    });

    it('4. scan path: old real instant pending is still deleted and hidden', async () => {
        const real = await insertCompetition(db, {
            title: 'P4 real pending hidden', status: 'pending', type: 'instant',
            isFake: 0, createdAt: hoursAgo(3),
        });

        expect(CompetitionModel.isExpiredInstantPending({
            competition_type: 'instant', status: 'pending', opponent_id: null,
            created_at: hoursAgo(3), is_fake: 0,
        })).toBe(true);

        await handleLifecycleTimers({ DB: d1(db) });
        expect(await row(db, real)).toBeNull();

        // Hidden by the read-time law even before the sweep (fresh row).
        const fresh = await insertCompetition(db, {
            title: 'P4 real pending fresh', status: 'pending', type: 'instant',
            isFake: 0, createdAt: hoursAgo(3),
        });
        const res = await app.request(
            `/api/competitions?lang=ar&limit=50`,
            { headers: { 'CF-Connecting-IP': '10.9.8.3' } },
            env(db),
        );
        const json = (await res.json()) as { success: boolean; data: Array<{ id: number }> };
        expect(json.data.map((c) => c.id)).not.toContain(fresh);
    });

    it('5. scan path: synthetic scheduled pending/accepted untouched; real scheduled still cancels', async () => {
        const syntheticPending = await insertCompetition(db, {
            title: 'P4 synthetic scheduled pending', status: 'pending', type: 'scheduled',
            isFake: 1, createdAt: hoursAgo(3), scheduledAt: hoursAgo(2),
        });
        const syntheticAccepted = await insertCompetition(db, {
            title: 'P4 synthetic scheduled accepted', status: 'accepted', type: 'scheduled',
            isFake: 1, opponent: 4, createdAt: hoursAgo(3), scheduledAt: hoursAgo(2),
        });
        const realPending = await insertCompetition(db, {
            title: 'P4 real scheduled pending', status: 'pending', type: 'scheduled',
            isFake: 0, createdAt: hoursAgo(3), scheduledAt: hoursAgo(2),
        });
        const realAccepted = await insertCompetition(db, {
            title: 'P4 real scheduled accepted', status: 'accepted', type: 'scheduled',
            isFake: 0, opponent: 4, createdAt: hoursAgo(3), scheduledAt: hoursAgo(2),
        });

        await handleLifecycleTimers({ DB: d1(db) });

        for (const id of [syntheticPending, syntheticAccepted]) {
            expect((await row(db, id))?.status).toBe(id === syntheticPending ? 'pending' : 'accepted');
        }
        expect((await row(db, realPending))?.status).toBe('cancelled');
        expect((await row(db, realAccepted))?.status).toBe('cancelled');
    });

    it('6. final UPDATE is synthetic-proof even when the read guard is bypassed', async () => {
        const synthetic = await insertCompetition(db, {
            title: 'P4 synthetic bypass', status: 'live', type: 'scheduled',
            isFake: 1, opponent: 4, createdAt: hoursAgo(5), startedAt: hoursAgo(3),
        });

        const bypassed = stripIsFakeFromRead(db);
        const ended = await new ScheduledTaskService(bypassed).endLiveMaxDuration(synthetic, 2);

        expect(ended).toBe(false);
        const s = await row(db, synthetic);
        expect(s.status).toBe('live');
        expect(s.auto_deleted_reason).toBeNull();
        expect(s.end_reason).toBeNull();
        expect(s.ended_at).toBeNull();

        // Same bypass against a REAL row still completes (predicate is real-only).
        const real = await insertCompetition(db, {
            title: 'P4 real bypass', status: 'live', type: 'scheduled',
            isFake: 0, opponent: 4, createdAt: hoursAgo(5), startedAt: hoursAgo(3),
        });
        const endedReal = await new ScheduledTaskService(stripIsFakeFromRead(db)).endLiveMaxDuration(real, 2);
        expect(endedReal).toBe(true);
        expect((await row(db, real))?.status).toBe('completed');
    });

    it('7. NULL is_fake is treated as real (data policy)', async () => {
        const nullFake = await insertCompetition(db, {
            title: 'P4 null is_fake live', status: 'live', type: 'scheduled',
            isFake: 0, opponent: 4, createdAt: hoursAgo(5), startedAt: hoursAgo(3),
        });
        // Force the NULL/unknown case explicitly (schema default is 1).
        await db.prepare(`UPDATE competitions SET is_fake = NULL WHERE id = ?`).bind(nullFake).run();

        await handleLifecycleTimers({ DB: d1(db) });
        // NULL ⇒ real ⇒ the 2h live limit still applies.
        expect((await row(db, nullFake))?.status).toBe('completed');
    });
});
