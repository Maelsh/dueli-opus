/**
 * @file src/lib/services/ScheduledTaskService.ts
 * @description Cron-driven scheduled task processor
 * @module lib/services
 * 
 * خدمة المهام المجدولة - تعمل مع Cron Jobs
 * Solution 7, 8 from the master plan
 */

export class ScheduledTaskService {
    constructor(private db: D1Database) { }

    /**
     * Schedule a new task
     */
    async schedule(
        competitionId: number,
        taskType: string,
        executeAt: Date
    ): Promise<number> {
        const result = await this.db.prepare(`
            INSERT INTO competition_scheduled_tasks 
            (competition_id, task_type, execute_at, status, created_at)
            VALUES (?, ?, ?, 'pending', datetime('now'))
        `).bind(competitionId, taskType, executeAt.toISOString()).run();
        return result.meta.last_row_id as number;
    }

    /**
     * Cancel a pending task
     */
    async cancel(competitionId: number, taskType: string): Promise<void> {
        await this.db.prepare(`
            UPDATE competition_scheduled_tasks 
            SET status = 'completed', result_message = 'Cancelled'
            WHERE competition_id = ? AND task_type = ? AND status = 'pending'
        `).bind(competitionId, taskType).run();
    }

    /**
     * Process all pending tasks that are due
     * Called by cron every minute
     */
    async processPendingTasks(): Promise<{ processed: number; errors: number }> {
        let processed = 0;
        let errors = 0;

        const tasks = await this.db.prepare(`
            SELECT t.*, c.status as competition_status, c.creator_id, c.opponent_id
            FROM competition_scheduled_tasks t
            JOIN competitions c ON t.competition_id = c.id
            WHERE t.execute_at <= datetime('now')
            AND t.status = 'pending'
            ORDER BY t.execute_at ASC
            LIMIT 50
        `).all();

        for (const task of tasks.results as any[]) {
            try {
                await this.executeTask(task);
                processed++;
            } catch (error) {
                errors++;
                await this.db.prepare(`
                    UPDATE competition_scheduled_tasks 
                    SET status = 'failed', 
                        result_message = ?,
                        executed_at = datetime('now')
                    WHERE id = ?
                `).bind((error as Error).message, task.id).run();
            }
        }

        return { processed, errors };
    }

    /**
     * Execute a single task based on its type
     */
    private async executeTask(task: any): Promise<void> {
        switch (task.task_type) {
            case 'auto_delete_if_not_live':
                await this.handleAutoDelete(task);
                break;
            case 'auto_end_live':
                await this.handleAutoEnd(task);
                break;
            case 'send_reminder':
                await this.handleReminder(task);
                break;
            case 'distribute_earnings':
                await this.handleEarnings(task);
                break;
            case 'check_disconnection':
                await this.handleDisconnectionCheck(task);
                break;
            default:
                throw new Error(`Unknown task type: ${task.task_type}`);
        }

        // Mark as completed
        await this.db.prepare(`
            UPDATE competition_scheduled_tasks 
            SET status = 'completed', executed_at = datetime('now'), result_message = 'Success'
            WHERE id = ?
        `).bind(task.id).run();
    }

    /**
     * Auto-delete competition if it hasn't gone live
     * Plan Solution 7: حذف تلقائي للمنافسات المعلقة
     */
    private async handleAutoDelete(task: any): Promise<void> {
        if (task.competition_status === 'live' || task.competition_status === 'completed') {
            return; // Already live or completed, skip
        }

        // Notify participants
        const userIds = [task.creator_id, task.opponent_id].filter(Boolean);
        for (const userId of userIds) {
            await this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', 'تم إلغاء المنافسة', 
                    'تم إلغاء المنافسة تلقائياً لعدم بدء البث في الوقت المحدد', 
                    'competition', ?, datetime('now'))
            `).bind(userId, task.competition_id).run();
        }

        // Cancel the competition
        await this.db.prepare(`
            UPDATE competitions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?
        `).bind(task.competition_id).run();
    }

    /**
     * Auto-end live competition after max duration (2 hours)
     * Plan Solution 8: إنهاء تلقائي بعد 2 ساعة
     */
    private async handleAutoEnd(task: any): Promise<void> {
        if (task.competition_status !== 'live') {
            return; // Not live anymore, skip
        }

        // End the competition
        await this.db.prepare(`
            UPDATE competitions 
            SET status = 'completed', ended_at = datetime('now'), updated_at = datetime('now')
            WHERE id = ?
        `).bind(task.competition_id).run();

        // Free both users
        await this.db.prepare(`
            UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
            WHERE current_competition_id = ?
        `).bind(task.competition_id).run();

        // Delete chunk keys
        await this.db.prepare(`
            DELETE FROM chunk_keys WHERE competition_id = ?
        `).bind(task.competition_id).run();

        // Notify participants
        const userIds = [task.creator_id, task.opponent_id].filter(Boolean);
        for (const userId of userIds) {
            await this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', 'انتهت المنافسة', 
                    'تم إنهاء المنافسة تلقائياً لانتهاء الوقت المحدد (ساعتين)',
                    'competition', ?, datetime('now'))
            `).bind(userId, task.competition_id).run();
        }
    }

    /**
     * Send reminder notification
     */
    private async handleReminder(task: any): Promise<void> {
        const userIds = [task.creator_id, task.opponent_id].filter(Boolean);
        for (const userId of userIds) {
            await this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', 'تذكير بالمنافسة', 
                    'المنافسة ستبدأ قريباً',
                    'competition', ?, datetime('now'))
            `).bind(userId, task.competition_id).run();
        }
    }

    /**
     * Distribute earnings after competition ends
     */
    private async handleEarnings(task: any): Promise<void> {
        // Calculate ad revenue split
        const competition = await this.db.prepare(`
            SELECT total_ad_revenue FROM competitions WHERE id = ?
        `).bind(task.competition_id).first() as any;

        if (!competition || !competition.total_ad_revenue) return;

        const totalRevenue = competition.total_ad_revenue;
        const platformShare = totalRevenue * 0.3; // 30% platform
        const creatorShare = totalRevenue * 0.35; // 35% to each competitor
        const opponentShare = totalRevenue * 0.35;

        // Record platform earnings
        await this.db.prepare(`
            INSERT INTO platform_earnings (competition_id, amount, earning_type, description, created_at)
            VALUES (?, ?, 'commission', 'Platform commission (30%)', datetime('now'))
        `).bind(task.competition_id, platformShare).run();

        // Record user earnings 
        if (task.creator_id) {
            await this.db.prepare(`
                INSERT INTO user_earnings (user_id, competition_id, amount, earning_type, status, created_at)
                VALUES (?, ?, ?, 'competition', 'available', datetime('now'))
            `).bind(task.creator_id, task.competition_id, creatorShare).run();
        }

        if (task.opponent_id) {
            await this.db.prepare(`
                INSERT INTO user_earnings (user_id, competition_id, amount, earning_type, status, created_at)
                VALUES (?, ?, ?, 'competition', 'available', datetime('now'))
            `).bind(task.opponent_id, task.competition_id, opponentShare).run();
        }

        // Update competition earnings fields
        await this.db.prepare(`
            UPDATE competitions 
            SET creator_earnings = ?, opponent_earnings = ?, platform_earnings = ?
            WHERE id = ?
        `).bind(creatorShare, opponentShare, platformShare, task.competition_id).run();
    }

    /**
     * Check for disconnections via heartbeat
     */
    private async handleDisconnectionCheck(task: any): Promise<void> {
        if (task.competition_status !== 'live') return;

        // Check if both competitors have recent heartbeats
        const stale = await this.db.prepare(`
            SELECT user_id FROM competition_heartbeats
            WHERE competition_id = ?
            AND last_seen < datetime('now', '-2 minutes')
        `).bind(task.competition_id).all();

        if (stale.results.length >= 2) {
            // Both disconnected -> end the competition
            await this.handleAutoEnd(task);
        }
    }

    /**
     * Cleanup expired requests (TTL 24 hours)
     * Plan Solution 4: طلبات معلقة للأبد
     */
    async cleanupExpiredRequests(): Promise<number> {
        const result = await this.db.prepare(`
            UPDATE competition_requests 
            SET status = 'expired', updated_at = datetime('now')
            WHERE status = 'pending' 
            AND created_at < datetime('now', '-24 hours')
        `).run();
        return result.meta.changes;
    }

    /**
     * Cleanup old notifications (30+ days, read)
     * Plan Solution 1: حذف الإشعارات القديمة
     */
    async cleanupOldNotifications(): Promise<number> {
        const result = await this.db.prepare(`
            DELETE FROM notifications 
            WHERE created_at < datetime('now', '-30 days')
            AND is_read = 1
        `).run();
        return result.meta.changes;
    }

    /**
     * Cleanup stale heartbeats
     */
    async cleanupStaleHeartbeats(): Promise<number> {
        const result = await this.db.prepare(`
            DELETE FROM competition_heartbeats
            WHERE last_seen < datetime('now', '-1 hour')
        `).run();
        return result.meta.changes;
    }
}

export default ScheduledTaskService;
