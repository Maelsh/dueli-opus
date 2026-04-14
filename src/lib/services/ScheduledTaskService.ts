/**
 * @file src/lib/services/ScheduledTaskService.ts
 * @description Cron-driven scheduled task processor with strict lifecycle timers
 * @module lib/services
 *
 * Task 8: Competition Lifecycle & Strict Timers
 * - Rule A (Instant): "Instant" open competitions deleted entirely (with requests) if 1 hour passes without an opponent
 * - Rule B (Scheduled): "Scheduled" open competitions free the creator and cancel if 1 hour passes post-schedule without starting
 * - Rule C (Live Limit): Live broadcasts auto-terminate after exactly 2 hours max
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
            SELECT t.*, c.status as competition_status, c.creator_id, c.opponent_id,
                   c.competition_type, c.scheduled_at, c.started_at, c.created_at as competition_created_at
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

        await this.db.prepare(`
            UPDATE competition_scheduled_tasks
            SET status = 'completed', executed_at = datetime('now'), result_message = 'Success'
            WHERE id = ?
        `).bind(task.id).run();
    }

    /**
     * Rule A (Instant): "Instant" open competitions get deleted entirely
     * (with requests) if 1 hour passes without an opponent.
     */
    private async handleAutoDelete(task: any): Promise<void> {
        if (task.competition_status === 'live' || task.competition_status === 'completed') {
            return;
        }

        const competition = await this.db.prepare(`
            SELECT id, creator_id, opponent_id, competition_type, status, created_at
            FROM competitions WHERE id = ?
        `).bind(task.competition_id).first() as any;

        if (!competition) return;

        if (competition.competition_type === 'instant' && !competition.opponent_id) {
            // Rule A: Instant competition without opponent for 1 hour -> DELETE entirely
            const userIds = [competition.creator_id].filter(Boolean);
            for (const userId of userIds) {
                await this.db.prepare(`
                    INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                    VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
                `).bind(
                    userId,
                    'Competition Deleted',
                    'Your instant competition was deleted because no opponent joined within 1 hour.',
                    task.competition_id
                ).run();
            }

            // Delete all associated requests
            await this.db.prepare(`
                DELETE FROM competition_requests WHERE competition_id = ?
            `).bind(task.competition_id).run();

            // Delete all associated invitations
            await this.db.prepare(`
                DELETE FROM competition_invitations WHERE competition_id = ?
            `).bind(task.competition_id).run();

            // Delete the competition entirely
            await this.db.prepare(`
                DELETE FROM competitions WHERE id = ?
            `).bind(task.competition_id).run();

            // Free the creator
            await this.db.prepare(`
                UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
                WHERE id = ?
            `).bind(competition.creator_id).run();

        } else if (competition.competition_type === 'scheduled' && !competition.opponent_id) {
            // Rule B: Scheduled competition - free the creator and cancel if 1 hour passes post-schedule
            await this.handleScheduledNoOpponent(task, competition);
        } else if (competition.opponent_id && competition.status !== 'live' && competition.status !== 'completed') {
            // Has opponent but hasn't started - cancel after 1 hour post-schedule
            await this.handleScheduledNotStarted(task, competition);
        } else {
            // Generic: cancel old pending competitions
            await this.db.prepare(`
                UPDATE competitions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?
            `).bind(task.competition_id).run();

            const userIds = [competition.creator_id, competition.opponent_id].filter(Boolean);
            for (const userId of userIds) {
                await this.db.prepare(`
                    INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                    VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
                `).bind(
                    userId,
                    'Competition Cancelled',
                    'The competition was cancelled because it did not start in time.',
                    task.competition_id
                ).run();
            }

            await this.db.prepare(`
                UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
                WHERE current_competition_id = ?
            `).bind(task.competition_id).run();
        }
    }

    /**
     * Rule B (Scheduled): Scheduled competition without opponent -
     * free the creator and cancel 1 hour after scheduled time
     */
    private async handleScheduledNoOpponent(task: any, competition: any): Promise<void> {
        const scheduledAt = competition.scheduled_at;
        if (!scheduledAt) return;

        const scheduledTime = new Date(scheduledAt).getTime();
        const now = Date.now();
        const hoursSinceScheduled = (now - scheduledTime) / (1000 * 60 * 60);

        if (hoursSinceScheduled < 1) return;

        // Free the creator
        await this.db.prepare(`
            UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
            WHERE id = ?
        `).bind(competition.creator_id).run();

        // Cancel the competition
        await this.db.prepare(`
            UPDATE competitions SET status = 'cancelled', auto_deleted_reason = 'scheduled_no_opponent_1hr', updated_at = datetime('now') WHERE id = ?
        `).bind(task.competition_id).run();

        // Delete associated requests and invitations
        await this.db.prepare(`
            DELETE FROM competition_requests WHERE competition_id = ?
        `).bind(task.competition_id).run();

        await this.db.prepare(`
            DELETE FROM competition_invitations WHERE competition_id = ?
        `).bind(task.competition_id).run();

        // Notify creator
        await this.db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
            VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
        `).bind(
            competition.creator_id,
            'Competition Cancelled',
            'Your scheduled competition was cancelled because no opponent joined within 1 hour of the scheduled time.',
            task.competition_id
        ).run();
    }

    /**
     * Rule B (Scheduled): Scheduled competition with opponent but not started -
     * free both users and cancel 1 hour post-schedule
     */
    private async handleScheduledNotStarted(task: any, competition: any): Promise<void> {
        const scheduledAt = competition.scheduled_at;
        if (!scheduledAt) return;

        const scheduledTime = new Date(scheduledAt).getTime();
        const now = Date.now();
        const hoursSinceScheduled = (now - scheduledTime) / (1000 * 60 * 60);

        if (hoursSinceScheduled < 1) return;

        // Free both users
        await this.db.prepare(`
            UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
            WHERE current_competition_id = ?
        `).bind(task.competition_id).run();

        // Cancel the competition
        await this.db.prepare(`
            UPDATE competitions SET status = 'cancelled', auto_deleted_reason = 'scheduled_not_started_1hr', updated_at = datetime('now') WHERE id = ?
        `).bind(task.competition_id).run();

        // Notify participants
        const userIds = [competition.creator_id, competition.opponent_id].filter(Boolean);
        for (const userId of userIds) {
            await this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
            `).bind(
                userId,
                'Competition Cancelled',
                'The scheduled competition was cancelled because it did not start within 1 hour of the scheduled time.',
                task.competition_id
            ).run();
        }
    }

    /**
     * Rule C (Live Limit): Live broadcasts auto-terminate after exactly 2 hours max
     */
    private async handleAutoEnd(task: any): Promise<void> {
        if (task.competition_status !== 'live') {
            return;
        }

        const competition = await this.db.prepare(`
            SELECT id, creator_id, opponent_id, started_at FROM competitions WHERE id = ?
        `).bind(task.competition_id).first() as any;

        if (!competition) return;

        // Verify it has actually been live for >= 2 hours
        if (competition.started_at) {
            const startedAt = new Date(competition.started_at).getTime();
            const now = Date.now();
            const hoursLive = (now - startedAt) / (1000 * 60 * 60);

            if (hoursLive < 1.9) {
                return;
            }
        }

        // End the competition
        await this.db.prepare(`
            UPDATE competitions
            SET status = 'completed', ended_at = datetime('now'), updated_at = datetime('now'),
                auto_deleted_reason = 'live_max_2hr'
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
        const userIds = [competition.creator_id, competition.opponent_id].filter(Boolean);
        for (const userId of userIds) {
            await this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
            `).bind(
                userId,
                'Competition Ended',
                'The live competition was automatically ended after reaching the 2-hour maximum duration.',
                task.competition_id
            ).run();
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
                VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
            `).bind(
                userId,
                'Competition Reminder',
                'The competition will start soon!',
                task.competition_id
            ).run();
        }
    }

    /**
     * Distribute earnings after competition ends
     */
    private async handleEarnings(task: any): Promise<void> {
        const competition = await this.db.prepare(`
            SELECT total_ad_revenue FROM competitions WHERE id = ?
        `).bind(task.competition_id).first() as any;

        if (!competition || !competition.total_ad_revenue) return;

        const totalRevenue = competition.total_ad_revenue;
        const platformShare = totalRevenue * 0.3;
        const creatorShare = totalRevenue * 0.35;
        const opponentShare = totalRevenue * 0.35;

        await this.db.prepare(`
            INSERT INTO platform_earnings (competition_id, amount, earning_type, description, created_at)
            VALUES (?, ?, 'commission', 'Platform commission (30%)', datetime('now'))
        `).bind(task.competition_id, platformShare).run();

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

        const stale = await this.db.prepare(`
            SELECT user_id FROM competition_heartbeats
            WHERE competition_id = ?
            AND last_seen < datetime('now', '-2 minutes')
        `).bind(task.competition_id).all();

        if (stale.results.length >= 2) {
            await this.handleAutoEnd(task);
        }
    }

    /**
     * Cleanup expired requests (TTL 24 hours)
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

    /**
     * Get the timer deadline for a competition based on its type and status
     * Used by the API to provide countdown info to the frontend
     */
    static getTimerDeadline(competition: {
        competition_type: string;
        status: string;
        created_at: string;
        scheduled_at: string | null;
        started_at: string | null;
    }): { type: string; deadline: string | null; labelKey: string } | null {
        if (competition.status === 'pending' || competition.status === 'accepted') {
            if (competition.competition_type === 'instant') {
                // Rule A: Instant - 1 hour from creation without opponent
                const createdAt = new Date(competition.created_at).getTime();
                const deadline = new Date(createdAt + 60 * 60 * 1000);
                return {
                    type: 'instant_join',
                    deadline: deadline.toISOString(),
                    labelKey: 'timers.time_to_join'
                };
            } else if (competition.competition_type === 'scheduled' && competition.scheduled_at) {
                // Rule B: Scheduled - 1 hour after scheduled time without starting
                const scheduledAt = new Date(competition.scheduled_at).getTime();
                const deadline = new Date(scheduledAt + 60 * 60 * 1000);
                return {
                    type: 'scheduled_start',
                    deadline: deadline.toISOString(),
                    labelKey: 'timers.time_to_start'
                };
            }
        } else if (competition.status === 'live' && competition.started_at) {
            // Rule C: Live - 2 hours max
            const startedAt = new Date(competition.started_at).getTime();
            const deadline = new Date(startedAt + 2 * 60 * 60 * 1000);
            return {
                type: 'live_max',
                deadline: deadline.toISOString(),
                labelKey: 'timers.broadcast_ends_in'
            };
        }

        return null;
    }
}

export default ScheduledTaskService;
