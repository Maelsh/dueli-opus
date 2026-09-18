/**
 * @file src/lib/services/CronHandler.ts
 * @description Handles Cloudflare Workers cron triggers
 * @module lib/services
 *
 * Task 8: Added explicit timer checks for:
 * - Rule A: Instant competitions without opponent for 1+ hour
 * - Rule B: Scheduled competitions not started 1+ hour post-schedule
 * - Rule C: Live competitions exceeding 2 hours
 *
 * F-6: The actual lifecycle *transitions + side effects* now live only in
 * ScheduledTaskService as the Single Source of Truth. CronHandler keeps the
 * scan queries (its unique job: catching competitions with no scheduled-task
 * row that the task engine would never fire) and delegates each transition to
 * those shared operations, instead of duplicating the raw-SQL writes.
 */

import { ScheduledTaskService } from './ScheduledTaskService';

export interface CronEnv {
    DB: D1Database;
}

/**
 * T1.5: Run all minute-level maintenance tasks.
 * Used by the Workers `scheduled` event AND by the secured HTTP trigger
 * (/api/cron/run) since Cloudflare Pages has no native cron support.
 */
export async function runMinuteMaintenance(env: CronEnv): Promise<{
    processed: number;
    errors: number;
}> {
    const taskService = new ScheduledTaskService(env.DB);
    const taskResult = await taskService.processPendingTasks();
    console.log(`[CRON] Processed ${taskResult.processed} tasks, ${taskResult.errors} errors`);

    await handleLifecycleTimers(env);

    return taskResult;
}

/**
 * Main cron handler - dispatched from worker's scheduled event
 */
export async function handleCron(event: { cron: string }, env: CronEnv): Promise<void> {
    const taskService = new ScheduledTaskService(env.DB);

    console.log(`[CRON] Running: ${event.cron} at ${new Date().toISOString()}`);

    try {
        switch (event.cron) {
            case '* * * * *':
                await runMinuteMaintenance(env);
                break;

            case '*/5 * * * *':
                const expiredCount = await taskService.cleanupExpiredRequests();
                console.log(`[CRON] Expired ${expiredCount} requests`);
                break;

            case '0 * * * *':
                const heartbeatsCleared = await taskService.cleanupStaleHeartbeats();
                console.log(`[CRON] Cleared ${heartbeatsCleared} stale heartbeats`);

                const stuckFreed = await env.DB.prepare(`
                    UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
                    WHERE is_busy = 1 AND busy_since < datetime('now', '-3 hours')
                `).run();
                console.log(`[CRON] Freed ${stuckFreed.meta.changes} stuck users`);
                break;

            case '0 3 * * *':
                const notifsCleared = await taskService.cleanupOldNotifications();
                console.log(`[CRON] Cleared ${notifsCleared} old notifications`);
                break;

            default:
                console.log(`[CRON] Unknown trigger: ${event.cron}`);
        }
    } catch (error) {
        console.error(`[CRON] Error in ${event.cron}:`, error);
    }
}

/**
 * F-6 (Task 8): Process lifecycle timer rules every minute.
 *
 * This scan is CronHandler's unique responsibility — it catches competitions
 * that have NO scheduled-task row (the ScheduledTaskService task engine never
 * fires for them). The transition + side effects are delegated to the shared
 * operations in ScheduledTaskService so the two paths cannot drift apart:
 *
 * - Rule A: Instant competitions deleted after 1 hour without an opponent
 * - Rule B: Scheduled competitions cancelled 1 hour post-schedule w/o starting
 * - Rule C: Live competitions auto-terminated after 2 hours
 */
async function handleLifecycleTimers(env: CronEnv): Promise<void> {
    const db = env.DB;
    const taskService = new ScheduledTaskService(db);

    // Rule A: Delete instant competitions that have been pending without opponent for 1+ hour
    try {
        const instantExpired = await db.prepare(`
            SELECT id FROM competitions
            WHERE competition_type = 'instant'
            AND status = 'pending'
            AND opponent_id IS NULL
            AND created_at < datetime('now', '-1 hour')
        `).all();

        for (const comp of (instantExpired.results || []) as any[]) {
            await taskService.expireInstantWithoutOpponent(comp.id);
            console.log(`[CRON] Rule A: Deleted instant competition ${comp.id}`);
        }
    } catch (e) {
        console.error('[CRON] Rule A error:', e);
    }

    // Rule B: Cancel scheduled competitions not started 1+ hour post-schedule
    try {
        const scheduledExpired = await db.prepare(`
            SELECT id, opponent_id FROM competitions
            WHERE competition_type = 'scheduled'
            AND status IN ('pending', 'accepted')
            AND scheduled_at IS NOT NULL
            AND scheduled_at < datetime('now', '-1 hour')
        `).all();

        for (const comp of (scheduledExpired.results || []) as any[]) {
            if (comp.opponent_id) {
                await taskService.cancelScheduledNotStarted(comp.id);
            } else {
                await taskService.cancelScheduledWithoutOpponent(comp.id);
            }
            console.log(`[CRON] Rule B: Cancelled scheduled competition ${comp.id}`);
        }
    } catch (e) {
        console.error('[CRON] Rule B error:', e);
    }

    // Rule C: Auto-end live competitions that have been live for 2+ hours
    try {
        const liveExpired = await db.prepare(`
            SELECT id FROM competitions
            WHERE status = 'live'
            AND started_at < datetime('now', '-2 hours')
        `).all();

        for (const comp of (liveExpired.results || []) as any[]) {
            await taskService.endLiveMaxDuration(comp.id, 2);
            console.log(`[CRON] Rule C: Auto-ended live competition ${comp.id}`);
        }
    } catch (e) {
        console.error('[CRON] Rule C error:', e);
    }
}

export default handleCron;
