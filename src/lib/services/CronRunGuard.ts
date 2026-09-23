/**
 * CronRunGuard — C6 (SEC-04 operational, docs/12-SECURITY-REMEDIATION.md)
 *
 * D1 execution lock: concurrent/duplicate triggers of the same task race on
 * the `cron_locks` PRIMARY KEY — exactly one INSERT wins, losers skip instead
 * of double-running the payout engine. Stale locks expire and are cleared.
 *
 * Every trigger (executed / skipped / failed) is appended to `cron_runs` for
 * auditability and failure visibility. No secrets are ever logged.
 */

export const CRON_LOCK_TTL_SECONDS = 300;

export class CronRunGuard {
    constructor(private readonly db: D1Database) {}

    /** Returns true iff this caller now holds the lock. */
    async acquire(lockName: string, owner: string, ttlSeconds = CRON_LOCK_TTL_SECONDS): Promise<boolean> {
        // Clear only stale locks — a live holder is never disturbed.
        await this.db.prepare(
            "DELETE FROM cron_locks WHERE lock_name = ? AND expires_at <= datetime('now')"
        ).bind(lockName).run().catch(() => undefined);
        try {
            // NOTE: ttl is an internal number — interpolated, never caller input.
            await this.db.prepare(
                `INSERT INTO cron_locks (lock_name, owner, expires_at)
                 VALUES (?, ?, datetime('now', '+${ttlSeconds} seconds'))`
            ).bind(lockName, owner).run();
            return true;
        } catch {
            return false; // UNIQUE race lost — another runner holds it.
        }
    }

    async release(lockName: string, owner: string): Promise<void> {
        await this.db.prepare(
            'DELETE FROM cron_locks WHERE lock_name = ? AND owner = ?'
        ).bind(lockName, owner).run().catch(() => undefined);
    }

    async logRun(run: {
        task: string;
        startedAt: string;
        finishedAt: string;
        success: boolean;
        detail?: string;
    }): Promise<void> {
        await this.db.prepare(
            `INSERT INTO cron_runs (task, started_at, finished_at, success, detail)
             VALUES (?, ?, ?, ?, ?)`
        ).bind(run.task, run.startedAt, run.finishedAt, run.success ? 1 : 0, run.detail ?? null).run();
    }
}
