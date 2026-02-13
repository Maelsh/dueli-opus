/**
 * @file src/controllers/ScheduleController.ts
 * @description متحكم الجدولة والتذكيرات
 * @module controllers/ScheduleController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { ScheduleModel } from '../models/ScheduleModel';
import { CompetitionModel } from '../models/CompetitionModel';

/**
 * Schedule Controller Class
 * متحكم الجدولة والتذكيرات
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
}

export default ScheduleController;
