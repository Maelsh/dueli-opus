/**
 * @file src/models/DonationModel.ts
 * @description نموذج التبرعات
 * @module models/DonationModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

/**
 * Donation Interface
 */
export interface Donation {
    id: number;
    user_id: number | null;
    amount: number;
    currency: string;
    payment_method: string;
    payment_status: 'pending' | 'completed' | 'failed' | 'refunded';
    transaction_id: string | null;
    donor_name: string | null;
    donor_email: string | null;
    message: string | null;
    is_anonymous: boolean;
    created_at: string;
}

/**
 * Create Donation Data
 */
export interface CreateDonationData {
    user_id?: number;
    amount: number;
    currency?: string;
    payment_method: string;
    donor_name?: string;
    donor_email?: string;
    message?: string;
    is_anonymous?: boolean;
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
     * Create - required by BaseModel
     */
    async create(data: Partial<Donation>): Promise<Donation> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} 
            (user_id, amount, currency, payment_method, payment_status, donor_name, donor_email, message, is_anonymous, created_at)
            VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
        `).bind(
            data.user_id || null,
            data.amount,
            data.currency || 'USD',
            data.payment_method,
            data.donor_name || null,
            data.donor_email || null,
            data.message || null,
            data.is_anonymous ? 1 : 0,
            now
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create donation');
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<Donation>): Promise<Donation | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.payment_status !== undefined) {
            updates.push('payment_status = ?');
            values.push(data.payment_status);
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
     * Create a new donation
     */
    async createDonation(data: CreateDonationData): Promise<Donation> {
        return this.create({
            user_id: data.user_id,
            amount: data.amount,
            currency: data.currency || 'USD',
            payment_method: data.payment_method,
            donor_name: data.donor_name,
            donor_email: data.donor_email,
            message: data.message,
            is_anonymous: data.is_anonymous || false
        });
    }

    /**
     * Mark donation as completed
     */
    async markCompleted(id: number, transactionId: string): Promise<Donation | null> {
        return this.update(id, {
            payment_status: 'completed',
            transaction_id: transactionId
        });
    }

    /**
     * Mark donation as failed
     */
    async markFailed(id: number): Promise<Donation | null> {
        return this.update(id, { payment_status: 'failed' });
    }

    /**
     * Get top supporters
     */
    async getTopSupporters(limit: number = 10): Promise<{ donor_name: string; total_amount: number; avatar: string }[]> {
        const result = await this.db.prepare(`
            SELECT 
                COALESCE(donor_name, 'Anonymous') as donor_name,
                SUM(amount) as total_amount
            FROM ${this.tableName}
            WHERE payment_status = 'completed'
            GROUP BY donor_name
            ORDER BY total_amount DESC
            LIMIT ?
        `).bind(limit).all<{ donor_name: string; total_amount: number }>();

        return (result.results || []).map((r, i) => ({
            donor_name: r.donor_name,
            total_amount: r.total_amount,
            avatar: `https://api.dicebear.com/7.x/avataaars/svg?seed=${r.donor_name || i}`
        }));
    }

    /**
     * Get donations by user
     */
    async getDonationsByUser(userId: number, limit: number = 20): Promise<Donation[]> {
        const result = await this.db.prepare(`
            SELECT * FROM ${this.tableName}
            WHERE user_id = ? AND payment_status = 'completed'
            ORDER BY created_at DESC
            LIMIT ?
        `).bind(userId, limit).all<Donation>();

        return result.results || [];
    }

    /**
     * Get total donations amount
     */
    async getTotalDonations(): Promise<number> {
        const result = await this.db.prepare(`
            SELECT SUM(amount) as total FROM ${this.tableName}
            WHERE payment_status = 'completed'
        `).first<{ total: number }>();

        return result?.total || 0;
    }
}

export default DonationModel;
