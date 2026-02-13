/**
 * @file src/controllers/ScheduleController.ts
 * @description متحكم الجدولة والتذكيرات + Cron Jobs
 * @module controllers/ScheduleController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { ScheduleModel } from '../models/ScheduleModel';
import { CompetitionModel } from '../models/CompetitionModel';
import { UserModel } from '../models/UserModel';

/**
 * Schedule Controller Class
 * متحكم الجدولة والتذكيرات + Cron Jobs
 */
export class ScheduleController extends BaseController {

    /**
     * Add reminder for competition
     * POST /api/competitions/:id/remind
     */
    async addReminder(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const competitionId = this.getParamInt(c, 'id');
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            // Check competition exists and has scheduled time
            const competitionModel = new CompetitionModel(c.env.DB);
            const competition = await competitionModel.findById(competitionId);
            if (!competition) {
                return this.notFound(c);
            }
            if (!competition.scheduled_at) {
                return this.validationError(c, this.t('schedule.not_scheduled', c));
            }

            const body = await this.getBody<{ remind_before_minutes?: number }>(c);
            const beforeMinutes = body?.remind_before_minutes || 30;

            // Calculate remind_at time
            const scheduledAt = new Date(competition.scheduled_at);
            const remindAt = new Date(scheduledAt.getTime() - beforeMinutes * 60 * 1000);

            const scheduleModel = new ScheduleModel(c.env.DB);
            const reminder = await scheduleModel.addReminder(competitionId, user.id, remindAt.toISOString());

            if (!reminder) {
                return this.error(c, this.t('schedule.already_set', c), 400);
            }

            return this.success(c, { reminder });
        } catch (error) {
            console.error('Add reminder error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Remove reminder
     * DELETE /api/competitions/:id/remind
     */
    async removeReminder(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const competitionId = this.getParamInt(c, 'id');
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const scheduleModel = new ScheduleModel(c.env.DB);
            const removed = await scheduleModel.removeReminder(competitionId, user.id);

            if (!removed) {
                return this.notFound(c, this.t('schedule.not_found', c));
            }

            return this.success(c, { removed: true });
        } catch (error) {
            console.error('Remove reminder error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get user's reminders
     * GET /api/reminders
     */
    async getReminders(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const limit = this.getQueryInt(c, 'limit') || 20;

            const scheduleModel = new ScheduleModel(c.env.DB);
            const reminders = await scheduleModel.getUserReminders(user.id, limit);

            return this.success(c, { reminders });
        } catch (error) {
            console.error('Get reminders error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get user's schedule (upcoming competitions)
     * GET /api/schedule
     */
    async getSchedule(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const scheduleModel = new ScheduleModel(c.env.DB);
            const schedule = await scheduleModel.getUserSchedule(user.id);

            return this.success(c, { schedule });
        } catch (error) {
            console.error('Get schedule error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Check if user has reminder for competition
     * GET /api/competitions/:id/remind
     */
    async hasReminder(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) {
                return this.success(c, { hasReminder: false });
            }

            const competitionId = this.getParamInt(c, 'id');
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const scheduleModel = new ScheduleModel(c.env.DB);
            const hasReminder = await scheduleModel.hasReminder(competitionId, user.id);

            return this.success(c, { hasReminder });
        } catch (error) {
            console.error('Check reminder error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Cron handler - called by Cloudflare Workers cron trigger
     * معالج المهام المجدولة
     * GET /api/cron?type=cleanup|tasks|notifications|users|busy_timeout
     */
    async handleCron(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        const cronType = c.req.query('type') || 'cleanup';
        
        try {
            let result;
            
            switch (cronType) {
                case 'cleanup':
                    result = await this.cleanupAbandonedCompetitions(c);
                    break;
                case 'tasks':
                    result = await this.executeScheduledTasks(c);
                    break;
                case 'notifications':
                    result = await this.cleanupOldNotifications(c);
                    break;
                case 'users':
                    result = await this.cleanupInactiveUsers(c);
                    break;
                case 'busy_timeout':
                    result = await this.freeBusyTimeouts(c);
                    break;
                default:
                    return this.error(c, 'Unknown cron type', 400);
            }
            
            return this.success(c, result);
        } catch (error) {
            console.error('Cron error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Cleanup abandoned competitions (every 5 minutes)
     * تنظيف المنافسات المهجورة
     */
    private async cleanupAbandonedCompetitions(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        const db = c.env.DB;
        const competitionModel = new CompetitionModel(db);
        let deleted = 0, cancelled = 0, completed = 0;
        
        // 1. Delete pending without opponent (immediate: >1hr, scheduled: >1hr after scheduled_at)
        const pendingResult = await db.prepare(`
            DELETE FROM competitions 
            WHERE status = 'pending' 
            AND opponent_id IS NULL
            AND (
                (scheduled_at IS NULL AND created_at < datetime('now', '-1 hour'))
                OR
                (scheduled_at IS NOT NULL AND scheduled_at < datetime('now', '-1 hour'))
            )
        `).run();
        deleted = pendingResult.meta.changes || 0;
        
        // 2. Cancel accepted without live (>1hr after accepted_at or scheduled_at)
        const acceptedToCancel = await db.prepare(`
            SELECT id FROM competitions 
            WHERE status = 'accepted'
            AND (
                (scheduled_at IS NULL AND accepted_at < datetime('now', '-1 hour'))
                OR
                (scheduled_at IS NOT NULL AND scheduled_at < datetime('now', '-1 hour'))
            )
        `).all();
        
        for (const comp of (acceptedToCancel.results || [])) {
            await competitionModel.updateStatus((comp as any).id, 'cancelled');
            cancelled++;
        }
        
        // 3. Complete live competitions >2 hours
        const liveToComplete = await db.prepare(`
            SELECT id FROM competitions 
            WHERE status = 'live' 
            AND started_at < datetime('now', '-2 hours')
        `).all();
        
        for (const comp of (liveToComplete.results || [])) {
            await competitionModel.updateStatus((comp as any).id, 'completed');
            completed++;
        }
        
        return { deleted, cancelled, completed };
    }

    /**
     * Execute scheduled tasks (every 1 minute)
     * تنفيذ المهام المجدولة
     */
    private async executeScheduledTasks(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        const db = c.env.DB;
        let executed = 0;
        
        // Get pending tasks
        const tasks = await db.prepare(`
            SELECT * FROM competition_scheduled_tasks 
            WHERE status = 'pending' 
            AND execute_at <= datetime('now')
            LIMIT 100
        `).all();
        
        for (const task of (tasks.results || [])) {
            try {
                const t = task as any;
                await this.executeTask(c, t);
                
                await db.prepare(`
                    UPDATE competition_scheduled_tasks 
                    SET status = 'completed', executed_at = datetime('now')
                    WHERE id = ?
                `).bind(t.id).run();
                
                executed++;
            } catch (error) {
                console.error('Task execution error:', error);
                await db.prepare(`
                    UPDATE competition_scheduled_tasks 
                    SET status = 'failed', 
                        result_message = ?,
                        executed_at = datetime('now')
                    WHERE id = ?
                `).bind((error as Error).message, (task as any).id).run();
            }
        }
        
        return { executed };
    }

    /**
     * Execute single scheduled task
     */
    private async executeTask(c: Context<{ Bindings: Bindings; Variables: Variables }>, task: any) {
        const db = c.env.DB;
        const competitionModel = new CompetitionModel(db);
        
        switch (task.task_type) {
            case 'auto_delete_if_not_live':
                const comp = await competitionModel.findById(task.competition_id);
                if (comp && comp.status !== 'live') {
                    await competitionModel.deleteWithRelations(task.competition_id);
                }
                break;
                
            case 'auto_end_live':
                await competitionModel.updateStatus(task.competition_id, 'completed');
                break;
                
            case 'send_reminder':
                // Send notification
                const reminder = await db.prepare(`
                    SELECT * FROM competition_reminders WHERE competition_id = ?
                `).bind(task.competition_id).all();
                
                for (const r of (reminder.results || [])) {
                    await db.prepare(`
                        INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                        VALUES (?, 'competition_starting', 'تذكير بمنافسة', 'منافستك ستبدأ قريباً', 'competition', ?, datetime('now'))
                    `).bind((r as any).user_id, task.competition_id).run();
                }
                break;
                
            case 'distribute_earnings':
                // TODO: Implement earnings distribution
                break;
                
            case 'check_disconnection':
                // TODO: Check heartbeat and handle disconnection
                break;
        }
    }

    /**
     * Cleanup old notifications (monthly)
     * تنظيف الإشعارات القديمة
     */
    private async cleanupOldNotifications(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        const db = c.env.DB;
        
        const result = await db.prepare(`
            DELETE FROM notifications 
            WHERE created_at < datetime('now', '-30 days')
        `).run();
        
        return { deleted: result.meta.changes || 0 };
    }

    /**
     * Cleanup inactive users (yearly)
     * تنظيف المستخدمين غير النشطين
     */
    private async cleanupInactiveUsers(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        const db = c.env.DB;
        
        // Find inactive users (>1 year, no competitions)
        const inactiveUsers = await db.prepare(`
            SELECT id, email FROM users 
            WHERE last_active_at < datetime('now', '-1 year')
            AND role = 'user'
            AND id NOT IN (SELECT DISTINCT creator_id FROM competitions WHERE status = 'completed')
            AND id NOT IN (SELECT DISTINCT opponent_id FROM competitions WHERE status = 'completed')
        `).all();
        
        let warned = 0, deleted = 0;
        
        for (const user of (inactiveUsers.results || [])) {
            const u = user as any;
            
            // Check if warning was sent
            const warningSent = await db.prepare(`
                SELECT 1 FROM notifications 
                WHERE user_id = ? 
                AND type = 'system' 
                AND message LIKE '%سيتم حذف حسابك%'
                AND created_at > datetime('now', '-7 days')
            `).bind(u.id).first();
            
            if (!warningSent) {
                // Send warning notification
                await db.prepare(`
                    INSERT INTO notifications (user_id, type, title, message, created_at)
                    VALUES (?, 'system', 'تحذير: حسابك غير نشط', 'حسابك غير نشط منذ أكثر من سنة. سيتم حذفه بعد 7 أيام ما لم تسجل دخول.', datetime('now'))
                `).bind(u.id).run();
                warned++;
            } else {
                // Warning was sent >7 days ago, delete user
                await db.prepare(`DELETE FROM users WHERE id = ?`).bind(u.id).run();
                deleted++;
            }
        }
        
        return { warned, deleted };
    }

    /**
     * Free busy users with timeout (every 10 minutes)
     * تحرير المستخدمين المشغولين بعد انتهاء المهلة
     */
    private async freeBusyTimeouts(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        const db = c.env.DB;
        const userModel = new UserModel(db);
        
        // Find busy users >10min whose competition is not live
        const busyUsers = await db.prepare(`
            SELECT u.id, u.current_competition_id
            FROM users u
            WHERE u.is_busy = 1
            AND u.busy_since < datetime('now', '-10 minutes')
            AND (
                u.current_competition_id IS NULL
                OR
                u.current_competition_id IN (
                    SELECT id FROM competitions WHERE status != 'live'
                )
            )
        `).all();
        
        let freed = 0;
        
        for (const user of (busyUsers.results || [])) {
            await userModel.setFree((user as any).id);
            freed++;
        }
        
        return { freed };
    }
}

export default ScheduleController;
