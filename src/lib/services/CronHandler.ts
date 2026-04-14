/**
 * @file src/lib/services/CronHandler.ts
 * @description Handles Cloudflare Workers cron triggers
 * @module lib/services
 *
 * Task 8: Added explicit timer checks for:
 * - Rule A: Instant competitions without opponent for 1+ hour
 * - Rule B: Scheduled competitions not started 1+ hour post-schedule
 * - Rule C: Live competitions exceeding 2 hours
 */

import { ScheduledTaskService } from './ScheduledTaskService';

export interface CronEnv {
    DB: D1Database;
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
                const taskResult = await taskService.processPendingTasks();
                console.log(`[CRON] Processed ${taskResult.processed} tasks, ${taskResult.errors} errors`);

                await handleLifecycleTimers(env);
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
 * Task 8: Process lifecycle timer rules every minute
 * - Rule A: Instant competitions deleted after 1 hour without opponent
 * - Rule B: Scheduled competitions cancelled 1 hour post-schedule without starting
 * - Rule C: Live competitions auto-terminated after 2 hours
 */
async function handleLifecycleTimers(env: CronEnv): Promise<void> {
    const db = env.DB;

    // Rule A: Delete instant competitions that have been pending without opponent for 1+ hour
    try {
        const instantExpired = await db.prepare(`
            SELECT id, creator_id FROM competitions
            WHERE competition_type = 'instant'
            AND status = 'pending'
            AND opponent_id IS NULL
            AND created_at < datetime('now', '-1 hour')
        `).all();

        for (const comp of (instantExpired.results || []) as any[]) {
            // Delete requests
            await db.prepare(`DELETE FROM competition_requests WHERE competition_id = ?`).bind(comp.id).run();
            await db.prepare(`DELETE FROM competition_invitations WHERE competition_id = ?`).bind(comp.id).run();
            // Delete competition entirely
            await db.prepare(`DELETE FROM competitions WHERE id = ?`).bind(comp.id).run();
            // Free creator
            await db.prepare(`UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL WHERE id = ?`).bind(comp.creator_id).run();
            // Notify creator
            await db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', 'Competition Deleted', 'Your instant competition was deleted because no opponent joined within 1 hour.', 'competition', ?, datetime('now'))
            `).bind(comp.creator_id, comp.id).run();

            console.log(`[CRON] Rule A: Deleted instant competition ${comp.id}`);
        }
    } catch (e) {
        console.error('[CRON] Rule A error:', e);
    }

    // Rule B: Cancel scheduled competitions not started 1+ hour post-schedule
    try {
        const scheduledExpired = await db.prepare(`
            SELECT id, creator_id, opponent_id FROM competitions
            WHERE competition_type = 'scheduled'
            AND status IN ('pending', 'accepted')
            AND scheduled_at IS NOT NULL
            AND scheduled_at < datetime('now', '-1 hour')
        `).all();

        for (const comp of (scheduledExpired.results || []) as any[]) {
            await db.prepare(`
                UPDATE competitions SET status = 'cancelled', auto_deleted_reason = 'scheduled_not_started_1hr', updated_at = datetime('now') WHERE id = ?
            `).bind(comp.id).run();

            // Free users
            await db.prepare(`UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL WHERE current_competition_id = ?`).bind(comp.id).run();

            // Notify participants
            const userIds = [comp.creator_id, comp.opponent_id].filter(Boolean);
            for (const userId of userIds) {
                await db.prepare(`
                    INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                    VALUES (?, 'system', 'Competition Cancelled', 'The scheduled competition was cancelled because it did not start within 1 hour of the scheduled time.', 'competition', ?, datetime('now'))
                `).bind(userId, comp.id).run();
            }

            console.log(`[CRON] Rule B: Cancelled scheduled competition ${comp.id}`);
        }
    } catch (e) {
        console.error('[CRON] Rule B error:', e);
    }

    // Rule C: Auto-end live competitions that have been live for 2+ hours
    try {
        const liveExpired = await db.prepare(`
            SELECT id, creator_id, opponent_id FROM competitions
            WHERE status = 'live'
            AND started_at < datetime('now', '-2 hours')
        `).all();

        for (const comp of (liveExpired.results || []) as any[]) {
            await db.prepare(`
                UPDATE competitions
                SET status = 'completed', ended_at = datetime('now'), updated_at = datetime('now'), auto_deleted_reason = 'live_max_2hr'
                WHERE id = ?
            `).bind(comp.id).run();

            await db.prepare(`UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL WHERE current_competition_id = ?`).bind(comp.id).run();

            await db.prepare(`DELETE FROM chunk_keys WHERE competition_id = ?`).bind(comp.id).run();

            const userIds = [comp.creator_id, comp.opponent_id].filter(Boolean);
            for (const userId of userIds) {
                await db.prepare(`
                    INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                    VALUES (?, 'system', 'Competition Ended', 'The live competition was automatically ended after reaching the 2-hour maximum duration.', 'competition', ?, datetime('now'))
                `).bind(userId, comp.id).run();
            }

            console.log(`[CRON] Rule C: Auto-ended live competition ${comp.id}`);
        }
    } catch (e) {
        console.error('[CRON] Rule C error:', e);
    }
}

export default handleCron;
