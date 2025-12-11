/**
 * Notification Model
 * نموذج الإشعار
 */

import { BaseModel, QueryOptions } from './base/BaseModel';
import type { Notification, NotificationType } from '../config/types';

/**
 * Notification creation data
 */
export interface CreateNotificationData {
    user_id: number;
    type: NotificationType;
    title: string;
    message: string;
    reference_type?: string;
    reference_id?: number;
}

/**
 * Notification Model Class
 */
export class NotificationModel extends BaseModel<Notification> {
    protected readonly tableName = 'notifications';

    /**
     * Find user's notifications
     */
    async findByUser(userId: number, options: QueryOptions = {}): Promise<Notification[]> {
        const { limit = 50, offset = 0 } = options;

        return this.query<Notification>(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?',
            userId, limit, offset
        );
    }

    /**
     * Find unread notifications
     */
    async findUnread(userId: number): Promise<Notification[]> {
        return this.query<Notification>(
            'SELECT * FROM notifications WHERE user_id = ? AND is_read = 0 ORDER BY created_at DESC',
            userId
        );
    }

    /**
     * Count unread notifications
     */
    async countUnread(userId: number): Promise<number> {
        const result = await this.queryOne<{ count: number }>(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
            userId
        );
        return result?.count || 0;
    }

    /**
     * Create notification
     */
    async create(data: CreateNotificationData): Promise<Notification> {
        const result = await this.db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
        `).bind(
            data.user_id,
            data.type,
            data.title,
            data.message,
            data.reference_type || null,
            data.reference_id || null
        ).run();

        return (await this.findById(result.meta.last_row_id as number))!;
    }

    /**
     * Update notification (mark as read)
     */
    async update(id: number, data: Partial<Notification>): Promise<Notification | null> {
        if (data.is_read !== undefined) {
            await this.db.prepare(
                'UPDATE notifications SET is_read = ? WHERE id = ?'
            ).bind(data.is_read ? 1 : 0, id).run();
        }
        return this.findById(id);
    }

    /**
     * Mark as read
     */
    async markAsRead(id: number): Promise<boolean> {
        const result = await this.db.prepare(
            'UPDATE notifications SET is_read = 1 WHERE id = ?'
        ).bind(id).run();
        return result.meta.changes > 0;
    }

    /**
     * Mark all as read for user
     */
    async markAllAsRead(userId: number): Promise<number> {
        const result = await this.db.prepare(
            'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0'
        ).bind(userId).run();
        return result.meta.changes;
    }
}

export default NotificationModel;
