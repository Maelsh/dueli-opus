/**
 * @file src/models/ScheduleModel.ts
 * @description نموذج الجدولة والتذكيرات
 * @module models/ScheduleModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

/**
 * Competition Reminder Interface
 */
export interface CompetitionReminder {
    id: number;
    competition_id: number;
    user_id: number;
    remind_at: string;
    sent: number;
    created_at: string;
}

/**
 * Reminder with competition details
 */
export interface ReminderWithDetails extends CompetitionReminder {
    competition_title: string;
    scheduled_at: string | null;
    creator_username: string;
}

/**
 * Schedule Model Class
 * نموذج الجدولة والتذكيرات
 */
export class ScheduleModel extends BaseModel<CompetitionReminder> {
    protected readonly tableName = 'competition_reminders';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<CompetitionReminder>): Promise<CompetitionReminder> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} (competition_id, user_id, remind_at, created_at)
            VALUES (?, ?, ?, ?)
        `).bind(data.competition_id, data.user_id, data.remind_at, now).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create reminder');
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<CompetitionReminder>): Promise<CompetitionReminder | null> {
        if (data.sent !== undefined) {
            await this.db.prepare(`
                UPDATE ${this.tableName} SET sent = ? WHERE id = ?
            `).bind(data.sent, id).run();
        }
        return this.findById(id);
    }

    /**
     * Check if reminder exists
     */
    async hasReminder(competitionId: number, userId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            SELECT 1 FROM ${this.tableName} WHERE competition_id = ? AND user_id = ?
        `).bind(competitionId, userId).first();
        return !!result;
    }

    /**
     * Add reminder for competition
     */
    async addReminder(competitionId: number, userId: number, remindAt: string): Promise<CompetitionReminder | null> {
        if (await this.hasReminder(competitionId, userId)) {
            return null; // Already exists
        }
        return this.create({ competition_id: competitionId, user_id: userId, remind_at: remindAt });
    }

    /**
     * Remove reminder
     */
    async removeReminder(competitionId: number, userId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            DELETE FROM ${this.tableName} WHERE competition_id = ? AND user_id = ?
        `).bind(competitionId, userId).run();
        return result.success && (result.meta.changes ?? 0) > 0;
    }

    /**
     * Get user's upcoming reminders
     */
    async getUserReminders(userId: number, limit: number = 20): Promise<ReminderWithDetails[]> {
        const result = await this.db.prepare(`
            SELECT r.*, c.title as competition_title, c.scheduled_at, u.username as creator_username
            FROM ${this.tableName} r
            JOIN competitions c ON r.competition_id = c.id
            JOIN users u ON c.creator_id = u.id
            WHERE r.user_id = ? AND r.sent = 0
            ORDER BY r.remind_at ASC
            LIMIT ?
        `).bind(userId, limit).all<ReminderWithDetails>();
        return result.results || [];
    }

    /**
     * Get pending reminders to send
     */
    async getPendingReminders(): Promise<ReminderWithDetails[]> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            SELECT r.*, c.title as competition_title, c.scheduled_at, u.username as creator_username
            FROM ${this.tableName} r
            JOIN competitions c ON r.competition_id = c.id
            JOIN users u ON c.creator_id = u.id
            WHERE r.sent = 0 AND r.remind_at <= ?
            ORDER BY r.remind_at ASC
            LIMIT 100
        `).bind(now).all<ReminderWithDetails>();
        return result.results || [];
    }

    /**
     * Mark reminder as sent
     */
    async markSent(reminderId: number): Promise<void> {
        await this.update(reminderId, { sent: 1 });
    }

    /**
     * Get user's scheduled competitions (competitions they created or joined)
     */
    async getUserSchedule(userId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT c.*, cat.name_ar as category_name_ar, cat.name_en as category_name_en,
                   CASE WHEN c.creator_id = ? THEN 1 ELSE 0 END as is_creator
            FROM competitions c
            LEFT JOIN categories cat ON c.category_id = cat.id
            WHERE (c.creator_id = ? OR c.opponent_id = ?)
            AND c.scheduled_at IS NOT NULL
            AND c.scheduled_at >= datetime('now')
            ORDER BY c.scheduled_at ASC
        `).bind(userId, userId, userId).all();
        return result.results || [];
    }
}

export default ScheduleModel;
