/**
 * @file src/models/MessageModel.ts
 * @description نموذج الرسائل والمحادثات
 * @module models/MessageModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

/**
 * Conversation Interface
 */
export interface Conversation {
    id: number;
    user1_id: number;
    user2_id: number;
    last_message_at: string | null;
    created_at: string;
}

/**
 * Conversation with user details
 */
export interface ConversationWithUser extends Conversation {
    other_user_id: number;
    other_username: string;
    other_display_name: string;
    other_avatar: string | null;
    last_message?: string;
    unread_count: number;
}

/**
 * Message Interface
 */
export interface Message {
    id: number;
    conversation_id: number;
    sender_id: number;
    content: string;
    read_at: string | null;
    created_at: string;
}

/**
 * Message with sender info
 */
export interface MessageWithSender extends Message {
    sender_username: string;
    sender_display_name: string;
    sender_avatar: string | null;
}

/**
 * Message Model Class
 * نموذج الرسائل
 */
export class MessageModel extends BaseModel<Message> {
    protected readonly tableName = 'messages';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<Message>): Promise<Message> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} (conversation_id, sender_id, content, created_at)
            VALUES (?, ?, ?, ?)
        `).bind(data.conversation_id, data.sender_id, data.content, now).run();

        if (result.success && result.meta.last_row_id) {
            // Update conversation's last_message_at
            await this.db.prepare(`
                UPDATE conversations SET last_message_at = ? WHERE id = ?
            `).bind(now, data.conversation_id).run();

            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create message');
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<Message>): Promise<Message | null> {
        if (data.read_at !== undefined) {
            await this.db.prepare(`
                UPDATE ${this.tableName} SET read_at = ? WHERE id = ?
            `).bind(data.read_at, id).run();
        }
        return this.findById(id);
    }

    /**
     * Get messages in a conversation
     */
    async getConversationMessages(
        conversationId: number,
        limit: number = 50,
        offset: number = 0
    ): Promise<MessageWithSender[]> {
        const result = await this.db.prepare(`
            SELECT m.*, u.username as sender_username, 
                   u.display_name as sender_display_name, u.avatar_url as sender_avatar
            FROM ${this.tableName} m
            JOIN users u ON m.sender_id = u.id
            WHERE m.conversation_id = ?
            ORDER BY m.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(conversationId, limit, offset).all<MessageWithSender>();
        return result.results || [];
    }

    /**
     * Mark messages as read
     */
    async markAsRead(conversationId: number, userId: number): Promise<void> {
        const now = new Date().toISOString();
        await this.db.prepare(`
            UPDATE ${this.tableName} 
            SET read_at = ? 
            WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL
        `).bind(now, conversationId, userId).run();
    }

    /**
     * Get unread count for user
     */
    async getUnreadCount(userId: number): Promise<number> {
        const result = await this.db.prepare(`
            SELECT COUNT(*) as count 
            FROM ${this.tableName} m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE (c.user1_id = ? OR c.user2_id = ?) 
            AND m.sender_id != ? AND m.read_at IS NULL
        `).bind(userId, userId, userId).first<{ count: number }>();
        return result?.count || 0;
    }
}

/**
 * Conversation Model Class
 * نموذج المحادثات
 */
export class ConversationModel extends BaseModel<Conversation> {
    protected readonly tableName = 'conversations';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<Conversation>): Promise<Conversation> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} (user1_id, user2_id, created_at)
            VALUES (?, ?, ?)
        `).bind(data.user1_id, data.user2_id, now).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create conversation');
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<Conversation>): Promise<Conversation | null> {
        if (data.last_message_at !== undefined) {
            await this.db.prepare(`
                UPDATE ${this.tableName} SET last_message_at = ? WHERE id = ?
            `).bind(data.last_message_at, id).run();
        }
        return this.findById(id);
    }

    /**
     * Find or create conversation between two users
     */
    async findOrCreate(user1Id: number, user2Id: number): Promise<Conversation> {
        // Normalize order to prevent duplicates
        const [minId, maxId] = user1Id < user2Id ? [user1Id, user2Id] : [user2Id, user1Id];

        // Try to find existing
        const existing = await this.db.prepare(`
            SELECT * FROM ${this.tableName} 
            WHERE (user1_id = ? AND user2_id = ?) OR (user1_id = ? AND user2_id = ?)
        `).bind(minId, maxId, maxId, minId).first<Conversation>();

        if (existing) return existing;

        // Create new
        return this.create({ user1_id: minId, user2_id: maxId });
    }

    /**
     * Get user's conversations with latest message
     */
    async getUserConversations(userId: number, limit: number = 20, offset: number = 0): Promise<ConversationWithUser[]> {
        const result = await this.db.prepare(`
            SELECT 
                c.*,
                CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END as other_user_id,
                u.username as other_username,
                u.display_name as other_display_name,
                u.avatar_url as other_avatar,
                (SELECT content FROM messages WHERE conversation_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
                (SELECT COUNT(*) FROM messages WHERE conversation_id = c.id AND sender_id != ? AND read_at IS NULL) as unread_count
            FROM ${this.tableName} c
            JOIN users u ON u.id = CASE WHEN c.user1_id = ? THEN c.user2_id ELSE c.user1_id END
            WHERE c.user1_id = ? OR c.user2_id = ?
            ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
            LIMIT ? OFFSET ?
        `).bind(userId, userId, userId, userId, userId, limit, offset).all<ConversationWithUser>();
        return result.results || [];
    }

    /**
     * Check if user is part of conversation
     */
    async userHasAccess(conversationId: number, userId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            SELECT 1 FROM ${this.tableName} 
            WHERE id = ? AND (user1_id = ? OR user2_id = ?)
        `).bind(conversationId, userId, userId).first();
        return !!result;
    }
}

export default MessageModel;
