/**
 * Notification Model
 * نموذج الإشعار
 */

import { BaseModel, QueryOptions } from './base/BaseModel';
import type { Notification, NotificationType } from '../config/types';
import {
    NotificationPresenter,
    type NotificationPayload,
} from '../lib/services/NotificationPresenter';

/**
 * Notification creation data.
 *
 * B9 contract: `title` is an **i18n key**, never a translated sentence, and
 * user content is carried as an untranslated `payload`. The label/body are
 * generated at render time by `NotificationPresenter` in the recipient's
 * language. Legacy callers may still pass a plain `message` (already-rendered
 * snapshot) — those rows keep working through the presenter's fallback path.
 */
export interface CreateNotificationData {
    user_id: number;
    type: NotificationType;
    /** i18n key of the label (e.g. `notification.new_message`) — not text. */
    title: string;
    /** Plain, untranslated content (legacy path). Prefer `payload` for new code. */
    message?: string;
    /** Structured untranslated payload — stored as JSON in the `message` column. */
    payload?: NotificationPayload;
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
     * Create notification.
     * Stores `type + title (i18n key) + payload` — never a translated sentence.
     */
    async create(data: CreateNotificationData): Promise<Notification> {
        const payloadText = data.payload
            ? JSON.stringify(data.payload)
            : (data.message || '');

        const result = await this.db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, is_read, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 0, datetime('now'))
        `).bind(
            data.user_id,
            data.type,
            data.title,
            payloadText,
            data.reference_type || null,
            data.reference_id || null
        ).run();

        return (await this.findById(result.meta.last_row_id as number))!;
    }

    /**
     * B9: preferred creation path — persists `type + payload` only.
     * The label is derived from the type's i18n key at render time, so callers
     * cannot accidentally store a translated sentence in the database.
     */
    async createForType(data: {
        user_id: number;
        type: NotificationType;
        payload?: NotificationPayload;
        reference_type?: string;
        reference_id?: number;
    }): Promise<Notification> {
        return this.create({
            user_id: data.user_id,
            type: data.type,
            title: NotificationPresenter.titleKeyFor(data.type, data.reference_type ?? null),
            payload: data.payload,
            reference_type: data.reference_type,
            reference_id: data.reference_id,
        });
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
