/**
 * @file src/models/DonationModel.ts
 * @description نموذج المنح والتبرعات (FR-020)
 * @module models/DonationModel
 * 
 * Types:
 * - user → platform (support the platform)
 * - user → user (direct support)
 * Minimum: $1
 * Transparency: publicly displayed if sender agrees
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

/**
 * Donation Interface
 */
export interface Donation {
    id: number;
    sender_id: number;
    receiver_id: number | null;  // null = platform donation
    amount: number;
    currency: string;
    message: string | null;
    is_public: number;  // 1 = publicly visible, 0 = private
    status: 'pending' | 'completed' | 'failed';
    payment_method: string | null;
    transaction_id: string | null;
    created_at: string;
}

/**
 * Donation with user details
 */
export interface DonationWithDetails extends Donation {
    sender_username: string;
    sender_display_name: string;
    sender_avatar: string | null;
    receiver_username?: string;
    receiver_display_name?: string;
    receiver_avatar?: string | null;
}

/**
 * Donation Model Class
 * نموذج التبرعات
 */
export class DonationModel extends BaseModel<Donation> {
    protected readonly tableName = 'donations';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create donation
     */
    async create(data: Partial<Donation>): Promise<Donation> {
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} 
            (sender_id, receiver_id, amount, currency, message, is_public, status, payment_method, created_at)
            VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, datetime('now'))
        `).bind(
            data.sender_id,
            data.receiver_id || null,
            data.amount,
            data.currency || 'USD',
            data.message || null,
            data.is_public ?? 1,
            data.payment_method || null
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create donation');
    }

    /**
     * Update donation status
     */
    async update(id: number, data: Partial<Donation>): Promise<Donation | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.status !== undefined) {
            updates.push('status = ?');
            values.push(data.status);
        }
        if (data.transaction_id !== undefined) {
            updates.push('transaction_id = ?');
            values.push(data.transaction_id);
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }

    /**
     * Get public donations (for transparency page)
     */
    async getPublicDonations(limit: number = 50, offset: number = 0): Promise<DonationWithDetails[]> {
        const result = await this.db.prepare(`
            SELECT d.*,
                   s.username as sender_username, s.display_name as sender_display_name, s.avatar_url as sender_avatar,
                   r.username as receiver_username, r.display_name as receiver_display_name, r.avatar_url as receiver_avatar
            FROM ${this.tableName} d
            JOIN users s ON d.sender_id = s.id
            LEFT JOIN users r ON d.receiver_id = r.id
            WHERE d.is_public = 1 AND d.status = 'completed'
            ORDER BY d.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(limit, offset).all<DonationWithDetails>();
        return result.results || [];
    }

    /**
     * Get donations received by a user
     */
    async getReceivedDonations(userId: number, limit: number = 20, offset: number = 0): Promise<DonationWithDetails[]> {
        const result = await this.db.prepare(`
            SELECT d.*,
                   s.username as sender_username, s.display_name as sender_display_name, s.avatar_url as sender_avatar
            FROM ${this.tableName} d
            JOIN users s ON d.sender_id = s.id
            WHERE d.receiver_id = ? AND d.status = 'completed'
            ORDER BY d.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(userId, limit, offset).all<DonationWithDetails>();
        return result.results || [];
    }

    /**
     * Get donations sent by a user
     */
    async getSentDonations(userId: number, limit: number = 20, offset: number = 0): Promise<DonationWithDetails[]> {
        const result = await this.db.prepare(`
            SELECT d.*,
                   r.username as receiver_username, r.display_name as receiver_display_name, r.avatar_url as receiver_avatar
            FROM ${this.tableName} d
            LEFT JOIN users r ON d.receiver_id = r.id
            WHERE d.sender_id = ? AND d.status = 'completed'
            ORDER BY d.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(userId, limit, offset).all<DonationWithDetails>();
        return result.results || [];
    }

    /**
     * Get platform donations total
     */
    async getPlatformDonationsTotal(): Promise<number> {
        const result = await this.db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total
            FROM ${this.tableName}
            WHERE receiver_id IS NULL AND status = 'completed'
        `).first<{ total: number }>();
        return result?.total || 0;
    }
}

export default DonationModel;
