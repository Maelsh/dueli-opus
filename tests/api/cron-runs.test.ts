import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { runMinuteMaintenance } from '../../src/lib/services/CronHandler';
import { CronRunGuard } from '../../src/lib/services/CronRunGuard';
import { ScheduledTaskService } from '../../src/lib/services/ScheduledTaskService';

/**
 * C6 (SEC-04 operational): D1 execution lock + run logging.
 *
 * Auth (Bearer-only, no ?key=, POST-only) was locked by PR #49 and is NOT
 * reopened here — see tests/api/cron-auth.test.ts. This file pins only the
 * operational remainder: concurrent/duplicate suppression, audit rows,
 * failure visibility, and lock release/recovery.
 */

const CRON_SECRET = 'cron_test_local_only_c6';

function env(db: SqliteD1) {
    return { DB: db, CRON_SECRET } as unknown as Parameters<typeof app.request>[2];
}

function headers() {
    return { 'X-CSRF-Token': 'c6-test' };
}

async function runs(db: SqliteD1) {
    const out = await db.prepare('SELECT task, success, detail FROM cron_runs ORDER BY id').all<{
        task: string; success: number; detail: string | null;
    }>();
    return (Array.isArray(out) ? out : (out as { results: { task: string; success: number; detail: string | null }[] }).results);
}

describe('C6 — cron execution lock + run logging', () => {
    let db: SqliteD1;
    beforeEach(() => {
        db = new SqliteD1();
    });

    it('1. successful HTTP trigger executes and logs success', async () => {
        const res = await app.request('/api/cron/run', {
            method: 'POST',
            headers: { ...headers(), Authorization: `Bearer ${CRON_SECRET}` },
        }, env(db));
        expect(res.status).toBe(200);
        const rows = await runs(db);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ task: 'minute-maintenance', success: 1 });
        expect(rows[0]!.detail).toContain('processed=');
    });

    it('2. duplicate run while the lock is held is skipped and logged', async () => {
        // Simulate an in-flight runner holding the lock.
        const holder = new CronRunGuard(db as unknown as D1Database);
        expect(await holder.acquire('minute-maintenance', 'runner-A')).toBe(true);

        const result = await runMinuteMaintenance({ DB: db as unknown as D1Database });
        expect(result.skipped).toBe(true);
        expect(result.processed).toBe(0);

        const rows = await runs(db);
        expect(rows).toHaveLength(1);
        expect(rows[0]!.success).toBe(0);
        expect(rows[0]!.detail).toContain('skipped: duplicate execution');
        await holder.release('minute-maintenance', 'runner-A');
    });

    it('3. lock is released after success — sequential runs both execute', async () => {
        const first = await runMinuteMaintenance({ DB: db as unknown as D1Database });
        const second = await runMinuteMaintenance({ DB: db as unknown as D1Database });
        expect(first.skipped).toBeUndefined();
        expect(second.skipped).toBeUndefined();
        expect(await db.prepare('SELECT COUNT(*) c FROM cron_runs').first<{ c: number }>()).toMatchObject({ c: 2 });
        expect(await db.prepare('SELECT COUNT(*) c FROM cron_locks').first<{ c: number }>()).toMatchObject({ c: 0 });
    });

    it('4. failed run is logged with the error and the lock is still released', async () => {
        vi.spyOn(ScheduledTaskService.prototype, 'processPendingTasks').mockRejectedValueOnce(new Error('boom-c6'));
        await expect(runMinuteMaintenance({ DB: db as unknown as D1Database })).rejects.toThrow('boom-c6');
        const rows = await runs(db);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({ task: 'minute-maintenance', success: 0 });
        expect(rows[0]!.detail).toContain('failed: boom-c6');
        // Recovery: the next trigger executes normally (no wedged lock).
        const next = await runMinuteMaintenance({ DB: db as unknown as D1Database });
        expect(next.skipped).toBeUndefined();
        vi.restoreAllMocks();
    });

    it('5. stale lock does not wedge the scheduler (expired holder is replaced)', async () => {
        await db.prepare(
            `INSERT INTO cron_locks (lock_name, owner, expires_at)
             VALUES ('minute-maintenance', 'crashed-runner', datetime('now', '-10 minutes'))`,
        ).run();
        const result = await runMinuteMaintenance({ DB: db as unknown as D1Database });
        expect(result.skipped).toBeUndefined();
    });

    it('6. guard primitives: second acquirer loses, release frees, strangers cannot release', async () => {
        const guard = new CronRunGuard(db as unknown as D1Database);
        expect(await guard.acquire('t', 'A')).toBe(true);
        expect(await guard.acquire('t', 'B')).toBe(false);
        await guard.release('t', 'B'); // stranger release is a no-op
        expect(await guard.acquire('t', 'B')).toBe(false);
        await guard.release('t', 'A');
        expect(await guard.acquire('t', 'B')).toBe(true);
        await guard.release('t', 'B');
    });
});
