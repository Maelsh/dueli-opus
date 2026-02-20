/**
 * @file src/models/EarningsModel.ts
 * @description نموذج أرباح المستخدمين
 * @module models/EarningsModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

/**
 * Earnings Interface
 */
export interface Earnings {
    id: number;
    user_id: number;
    available: number;
    pending: number;
    on_hold: number;
    total: number;
    withdrawn: number;
    updated_at: string;
}

/**
 * Withdrawal Request Interface
 */
export interface WithdrawalRequest {
    id: number;
    user_id: number;
    amount: number;
    status: 'pending' | 'processing' | 'completed' | 'rejected';
    payment_method: string;
    payment_details: string;
    created_at: string;
    processed_at: string | null;
    transaction_id: string | null;
}

/**
 * Create Withdrawal Request Data
 */
export interface CreateWithdrawalRequest {
    user_id: number;
    amount: number;
    payment_method: string;
    payment_details: string;
}

/**
 * Earnings Model Class
 * نموذج الأرباح
 */
export class EarningsModel extends BaseModel<Earnings> {
    protected readonly tableName = 'user_earnings';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<Earnings>): Promise<Earnings> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} 
            (user_id, available, pending, on_hold, total, withdrawn, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            data.user_id,
            data.available || 0,
            data.pending || 0,
            data.on_hold || 0,
            data.total || 0,
            data.withdrawn || 0,
            now
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create earnings record');
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<Earnings>): Promise<Earnings | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.available !== undefined) {
            updates.push('available = ?');
            values.push(data.available);
        }
        if (data.pending !== undefined) {
            updates.push('pending = ?');
            values.push(data.pending);
        }
        if (data.on_hold !== undefined) {
            updates.push('on_hold = ?');
            values.push(data.on_hold);
        }
        if (data.total !== undefined) {
            updates.push('total = ?');
            values.push(data.total);
        }
        if (data.withdrawn !== undefined) {
            updates.push('withdrawn = ?');
            values.push(data.withdrawn);
        }

        if (updates.length === 0) return this.findById(id);

        updates.push('updated_at = ?');
        values.push(new Date().toISOString());
        values.push(id);

        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }

    /**
     * Get or create earnings for user
     */
    async getOrCreateForUser(userId: number): Promise<Earnings> {
        let earnings = await this.db.prepare(
            `SELECT * FROM ${this.tableName} WHERE user_id = ?`
        ).bind(userId).first<Earnings>();

        if (!earnings) {
            earnings = await this.create({ user_id: userId });
        }

        return earnings;
    }

    /**
     * Get earnings for user
     */
    async getForUser(userId: number): Promise<Earnings | null> {
        return this.db.prepare(
            `SELECT * FROM ${this.tableName} WHERE user_id = ?`
        ).bind(userId).first<Earnings>();
    }

    /**
     * Add earnings to user (from ad revenue)
     */
    async addEarnings(userId: number, amount: number, type: 'available' | 'pending' | 'on_hold' = 'pending'): Promise<Earnings | null> {
        const earnings = await this.getOrCreateForUser(userId);

        const updateData: Partial<Earnings> = {
            total: earnings.total + amount
        };

        if (type === 'available') {
            updateData.available = earnings.available + amount;
        } else if (type === 'pending') {
            updateData.pending = earnings.pending + amount;
        } else {
            updateData.on_hold = earnings.on_hold + amount;
        }

        return this.update(earnings.id, updateData);
    }

    /**
     * Move pending to available (after holding period)
     */
    async movePendingToAvailable(userId: number, amount: number): Promise<Earnings | null> {
        const earnings = await this.getForUser(userId);
        if (!earnings || earnings.pending < amount) return null;

        return this.update(earnings.id, {
            pending: earnings.pending - amount,
            available: earnings.available + amount
        });
    }

    /**
     * Create withdrawal request
     */
    async createWithdrawalRequest(data: CreateWithdrawalRequest): Promise<WithdrawalRequest | null> {
        const earnings = await this.getForUser(data.user_id);
        if (!earnings || earnings.available < data.amount || data.amount < 50) {
            return null;
        }

        const now = new Date().toISOString();

        // Start transaction-like operation
        // 1. Deduct from available
        await this.update(earnings.id, {
            available: earnings.available - data.amount,
            withdrawn: earnings.withdrawn + data.amount
        });

        // 2. Create withdrawal request
        const result = await this.db.prepare(`
            INSERT INTO withdrawal_requests 
            (user_id, amount, status, payment_method, payment_details, created_at)
            VALUES (?, ?, 'pending', ?, ?, ?)
        `).bind(
            data.user_id,
            data.amount,
            data.payment_method,
            data.payment_details,
            now
        ).run();

        if (result.success && result.meta.last_row_id) {
            return this.db.prepare(
                `SELECT * FROM withdrawal_requests WHERE id = ?`
            ).bind(result.meta.last_row_id).first<WithdrawalRequest>();
        }

        // Rollback if insert failed
        await this.update(earnings.id, {
            available: earnings.available,
            withdrawn: earnings.withdrawn
        });

        return null;
    }

    /**
     * Get withdrawal requests for user
     */
    async getWithdrawalRequests(userId: number, limit: number = 20, offset: number = 0): Promise<WithdrawalRequest[]> {
        const result = await this.db.prepare(`
            SELECT * FROM withdrawal_requests 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?
        `).bind(userId, limit, offset).all<WithdrawalRequest>();

        return result.results || [];
    }

    /**
     * Get all pending withdrawal requests (for admin)
     */
    async getPendingWithdrawalRequests(limit: number = 50, offset: number = 0): Promise<(WithdrawalRequest & { username: string })[]> {
        const result = await this.db.prepare(`
            SELECT wr.*, u.username 
            FROM withdrawal_requests wr
            JOIN users u ON wr.user_id = u.id
            WHERE wr.status = 'pending'
            ORDER BY wr.created_at ASC
            LIMIT ? OFFSET ?
        `).bind(limit, offset).all<WithdrawalRequest & { username: string }>();

        return result.results || [];
    }

    /**
     * Process withdrawal request (admin action)
     */
    async processWithdrawalRequest(
        requestId: number,
        adminId: number,
        status: 'completed' | 'rejected',
        transactionId?: string
    ): Promise<WithdrawalRequest | null> {
        const request = await this.db.prepare(
            `SELECT * FROM withdrawal_requests WHERE id = ?`
        ).bind(requestId).first<WithdrawalRequest>();

        if (!request || request.status !== 'pending') return null;

        const now = new Date().toISOString();

        await this.db.prepare(`
            UPDATE withdrawal_requests 
            SET status = ?, processed_at = ?, transaction_id = ?
            WHERE id = ?
        `).bind(status, now, transactionId || null, requestId).run();

        // If rejected, refund the amount
        if (status === 'rejected') {
            const earnings = await this.getForUser(request.user_id);
            if (earnings) {
                await this.update(earnings.id, {
                    available: earnings.available + request.amount,
                    withdrawn: earnings.withdrawn - request.amount
                });
            }
        }

        return this.db.prepare(
            `SELECT * FROM withdrawal_requests WHERE id = ?`
        ).bind(requestId).first<WithdrawalRequest>();
    }
}

export default EarningsModel;
