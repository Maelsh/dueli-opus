import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';
import { ContentTooLongError, ValidationError } from '../lib/errors/AppError';

/**
 * R2-M (H6): independent admin-messaging store.
 *
 * Owns the `support_threads` / `support_messages` tables ONLY — never the
 * personal `messages` / `conversations` tables. A support thread belongs
 * to exactly one user; admin replies carry `sender_kind = 'admin'` with
 * the agent's id (audit) while the UI renders the official identity.
 */
export const SUPPORT_MESSAGE_MAX_CONTENT_LENGTH = 4000;
export const SUPPORT_THREAD_MAX_SUBJECT_LENGTH = 200;

export type SupportThreadStatus = 'open' | 'closed';
export type SupportSenderKind = 'user' | 'admin';

export interface SupportThread {
    id: number;
    user_id: number;
    subject: string;
    status: SupportThreadStatus;
    created_at: string;
    updated_at: string;
}

export interface SupportMessage {
    id: number;
    thread_id: number;
    sender_kind: SupportSenderKind;
    sender_id: number;
    content: string;
    is_read: number;
    created_at: string;
}

export interface SupportThreadWithMeta extends SupportThread {
    username: string | null;
    display_name: string | null;
    message_count: number;
    unread_admin: number;
    last_message_at: string | null;
}

function checkContent(content: string): string {
    const text = (content || '').trim();
    if (!text) throw new ValidationError('Empty content');
    if (text.length > SUPPORT_MESSAGE_MAX_CONTENT_LENGTH) throw new ContentTooLongError();
    return text;
}

export class SupportModel extends BaseModel<SupportThread> {
    protected readonly tableName = 'support_threads';

    constructor(db: D1Database) {
        super(db);
    }

    async create(data: Partial<SupportThread>): Promise<SupportThread> {
        throw new Error('Use createThread() — threads are always born with a first user message');
    }

    async update(id: number, data: Partial<SupportThread>): Promise<SupportThread | null> {
        return this.findById(id);
    }

    /**
     * Open a thread with its first user message (one logical write unit).
     */
    async createThread(userId: number, subject: string, content: string): Promise<{ thread: SupportThread; message: SupportMessage }> {
        const cleanContent = checkContent(content);
        const cleanSubject = (subject || '').trim().slice(0, SUPPORT_THREAD_MAX_SUBJECT_LENGTH);
        const threadRes = await this.db.prepare(`
            INSERT INTO support_threads (user_id, subject, status, created_at, updated_at)
            VALUES (?, ?, 'open', datetime('now'), datetime('now'))
        `).bind(userId, cleanSubject).run();
        const threadId = threadRes.meta.last_row_id as number;
        const msgRes = await this.db.prepare(`
            INSERT INTO support_messages (thread_id, sender_kind, sender_id, content, is_read, created_at)
            VALUES (?, 'user', ?, ?, 0, datetime('now'))
        `).bind(threadId, userId, cleanContent).run();
        const thread = (await this.findById(threadId))!;
        const message = await this.db.prepare(
            `SELECT * FROM support_messages WHERE id = ?`
        ).bind(msgRes.meta.last_row_id as number).first<SupportMessage>();
        return { thread, message: message! };
    }

    async findThread(threadId: number): Promise<SupportThread | null> {
        return this.findById(threadId);
    }

    /** Threads owned by one user (user inbox), newest first. */
    async getUserThreads(userId: number, limit = 50, offset = 0): Promise<SupportThread[]> {
        return this.query<SupportThread>(
            `SELECT * FROM support_threads WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?`,
            userId, limit, offset
        );
    }

    /** Owner threads with counters (user-side badges). */
    async getUserThreadsWithMeta(userId: number, limit = 50, offset = 0): Promise<(SupportThread & { message_count: number; unread_user: number; last_message_at: string | null })[]> {
        return this.query<SupportThread & { message_count: number; unread_user: number; last_message_at: string | null }>(`
            SELECT t.*,
                   (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id) AS message_count,
                   (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id AND m.sender_kind = 'admin' AND m.is_read = 0) AS unread_user,
                   (SELECT MAX(m.created_at) FROM support_messages m WHERE m.thread_id = t.id) AS last_message_at
            FROM support_threads t
            WHERE t.user_id = ?
            ORDER BY t.updated_at DESC, t.id DESC
            LIMIT ? OFFSET ?
        `, userId, limit, offset);
    }

    /** Admin inbox: every thread with owner identity + counters. */
    async listThreadsForAdmin(status: SupportThreadStatus | null, limit = 50, offset = 0): Promise<SupportThreadWithMeta[]> {
        const where = status ? 'WHERE t.status = ?' : '';
        const params: unknown[] = status ? [status] : [];
        return this.query<SupportThreadWithMeta>(`
            SELECT t.*,
                   u.username, u.display_name,
                   (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id) AS message_count,
                   (SELECT COUNT(*) FROM support_messages m WHERE m.thread_id = t.id AND m.sender_kind = 'user' AND m.is_read = 0) AS unread_admin,
                   (SELECT MAX(m.created_at) FROM support_messages m WHERE m.thread_id = t.id) AS last_message_at
            FROM support_threads t
            JOIN users u ON u.id = t.user_id
            ${where}
            ORDER BY t.updated_at DESC, t.id DESC
            LIMIT ? OFFSET ?
        `, ...params, limit, offset);
    }

    async getMessages(threadId: number, limit = 100, offset = 0): Promise<SupportMessage[]> {
        return this.query<SupportMessage>(
            `SELECT * FROM support_messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC LIMIT ? OFFSET ?`,
            threadId, limit, offset
        );
    }

    /**
     * Append a message. The writer's side is explicit: 'user' requires
     * thread ownership, 'admin' requires an open thread (caller gates role).
     * Posting to a closed thread is rejected (409 upstream).
     */
    async postMessage(threadId: number, side: SupportSenderKind, senderId: number, content: string): Promise<SupportMessage> {
        const thread = await this.findById(threadId);
        if (!thread) throw new ValidationError('Unknown thread');
        if (thread.status !== 'open') throw new ValidationError('Thread closed');
        if (side === 'user' && thread.user_id !== senderId) throw new ValidationError('Not thread owner');
        const clean = checkContent(content);
        const res = await this.db.prepare(`
            INSERT INTO support_messages (thread_id, sender_kind, sender_id, content, is_read, created_at)
            VALUES (?, ?, ?, ?, 0, datetime('now'))
        `).bind(threadId, side, senderId, clean).run();
        await this.db.prepare(
            `UPDATE support_threads SET updated_at = datetime('now') WHERE id = ?`
        ).bind(threadId).run();
        return (await this.db.prepare(
            `SELECT * FROM support_messages WHERE id = ?`
        ).bind(res.meta.last_row_id as number).first<SupportMessage>())!;
    }

    /** Mark the OTHER side's messages read (per-side read state). */
    async markRead(threadId: number, readerSide: SupportSenderKind): Promise<number> {
        const other = readerSide === 'user' ? 'admin' : 'user';
        const res = await this.db.prepare(`
            UPDATE support_messages SET is_read = 1
            WHERE thread_id = ? AND sender_kind = ? AND is_read = 0
        `).bind(threadId, other).run();
        return res.meta.changes;
    }

    /** User badge: unread official replies across own threads. */
    async countUnreadForUser(userId: number): Promise<number> {
        const row = await this.queryOne<{ n: number }>(`
            SELECT COUNT(*) AS n FROM support_messages m
            JOIN support_threads t ON t.id = m.thread_id
            WHERE t.user_id = ? AND m.sender_kind = 'admin' AND m.is_read = 0
        `, userId);
        return row?.n ?? 0;
    }

    /** Admin badge: unread user messages across all threads. */
    async countUnreadForAdmin(): Promise<number> {
        const row = await this.queryOne<{ n: number }>(`
            SELECT COUNT(*) AS n FROM support_messages WHERE sender_kind = 'user' AND is_read = 0
        `);
        return row?.n ?? 0;
    }

    /** Open/close a thread (admin only upstream). Returns the updated row. */
    async setStatus(threadId: number, status: SupportThreadStatus): Promise<SupportThread | null> {
        await this.db.prepare(`
            UPDATE support_threads SET status = ?, updated_at = datetime('now') WHERE id = ?
        `).bind(status, threadId).run();
        return this.findById(threadId);
    }
}

export default SupportModel;
