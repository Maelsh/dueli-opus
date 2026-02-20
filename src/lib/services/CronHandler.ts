/**
 * @file src/lib/services/CronHandler.ts
 * @description Handles Cloudflare Workers cron triggers
 * @module lib/services
 * 
 * معالج مهام الكرون - يتم استدعاؤه تلقائياً
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
            // Every minute: process due scheduled tasks
            case '* * * * *':
                const taskResult = await taskService.processPendingTasks();
                console.log(`[CRON] Processed ${taskResult.processed} tasks, ${taskResult.errors} errors`);
                break;

            // Every 5 minutes: cleanup expired requests
            case '*/5 * * * *':
                const expiredCount = await taskService.cleanupExpiredRequests();
                console.log(`[CRON] Expired ${expiredCount} requests`);
                break;

            // Every hour: cleanup stale heartbeats + check stuck busy users
            case '0 * * * *':
                const heartbeatsCleared = await taskService.cleanupStaleHeartbeats();
                console.log(`[CRON] Cleared ${heartbeatsCleared} stale heartbeats`);

                // Auto-free users stuck in busy state > 3 hours
                const stuckFreed = await env.DB.prepare(`
                    UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
                    WHERE is_busy = 1 AND busy_since < datetime('now', '-3 hours')
                `).run();
                console.log(`[CRON] Freed ${stuckFreed.meta.changes} stuck users`);
                break;

            // Daily at 3 AM: cleanup old notifications
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

export default handleCron;
