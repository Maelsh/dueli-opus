/**
 * @file src/models/WithdrawalRequestModel.ts
 * @description Model for user withdrawal requests (Task 6)
 *              نموذج طلبات سحب أرباح المستخدمين
 * @module models/WithdrawalRequestModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

// =============================================
// Interfaces / Types
// =============================================

export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'rejected';

export interface WithdrawalRequest {
    id: number;
    user_id: number;
    amount: number;
    status: WithdrawalStatus;
    payment_method: string;
    payment_details: string;
    created_at: string;
    processed_at: string | null;
    transaction_id: string | null;
    approved_by: number | null;
    admin_note: string | null;
}

export interface WithdrawalRequestWithUser extends WithdrawalRequest {
    username: string;
    display_name: string;
    avatar_url: string | null;
}

export interface CreateWithdrawalData {
    user_id: number;
    amount: number;
    payment_method: string;
    payment_details: string;
}

export interface WithdrawalFilters {
    status?: WithdrawalStatus;
    user_id?: number;
    limit?: number;
    offset?: number;
}

// =============================================
// Model
// =============================================

export class WithdrawalRequestModel extends BaseModel<WithdrawalRequest> {
    protected readonly tableName = 'withdrawal_requests';

    constructor(db: D1Database) {
        super(db);
    }

    /** Required by BaseModel – creates a raw withdrawal row */
    async create(data: Partial<WithdrawalRequest>): Promise<WithdrawalRequest> {
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName}
                (user_id, amount, status, payment_method, payment_details, created_at)
            VALUES (?, ?, 'pending', ?, ?, datetime('now'))
        `).bind(
            data.user_id,
            data.amount,
            data.payment_method,
            data.payment_details
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create withdrawal request');
    }

    /** Required by BaseModel – partial update */
    async update(id: number, data: Partial<WithdrawalRequest>): Promise<WithdrawalRequest | null> {
        const sets: string[] = [];
        const vals: any[] = [];

        if (data.status !== undefined)        { sets.push('status = ?');         vals.push(data.status); }
        if (data.processed_at !== undefined)  { sets.push('processed_at = ?');   vals.push(data.processed_at); }
        if (data.transaction_id !== undefined){ sets.push('transaction_id = ?'); vals.push(data.transaction_id); }
        if (data.approved_by !== undefined)   { sets.push('approved_by = ?');    vals.push(data.approved_by); }
        if (data.admin_note !== undefined)    { sets.push('admin_note = ?');      vals.push(data.admin_note); }

        if (sets.length === 0) return this.findById(id);

        vals.push(id);
        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${sets.join(', ')} WHERE id = ?`
        ).bind(...vals).run();

        return this.findById(id);
    }

    // -------------------------------------------------------
    // Domain helpers
    // -------------------------------------------------------

    /**
     * Create a withdrawal request after validating available balance.
     * Atomically deducts from user_earnings.available.
     */
    async requestWithdrawal(data: CreateWithdrawalData): Promise<{ request: WithdrawalRequest } | { error: string }> {
        const MIN_AMOUNT = 10; // $10 minimum

        if (data.amount < MIN_AMOUNT) {
            return { error: `Minimum withdrawal amount is $${MIN_AMOUNT}` };
        }

        // Check available balance
        const earnings = await this.db.prepare(
            `SELECT * FROM user_earnings WHERE user_id = ?`
        ).bind(data.user_id).first<{ id: number; available: number; withdrawn: number }>();

        if (!earnings) {
            return { error: 'No earnings wallet found' };
        }
        if (earnings.available < data.amount) {
            return { error: 'Insufficient available balance' };
        }

        // Deduct from available
        await this.db.prepare(
            `UPDATE user_earnings SET available = available - ?, withdrawn = withdrawn + ?, updated_at = datetime('now') WHERE id = ?`
        ).bind(data.amount, data.amount, earnings.id).run();

        // Create the request row
        try {
            const request = await this.create({
                user_id:        data.user_id,
                amount:         data.amount,
                payment_method: data.payment_method,
                payment_details: data.payment_details
            });
            return { request };
        } catch (e) {
            // Rollback balance deduction
            await this.db.prepare(
                `UPDATE user_earnings SET available = available + ?, withdrawn = withdrawn - ?, updated_at = datetime('now') WHERE id = ?`
            ).bind(data.amount, data.amount, earnings.id).run();
            return { error: 'Failed to create withdrawal request' };
        }
    }

    /**
     * Approve a withdrawal request (admin action).
     * Marks status → 'completed' and records the txn ID.
     */
    async approve(
        id: number,
        adminId: number,
        transactionId: string,
        note?: string
    ): Promise<WithdrawalRequest | null> {
        const req = await this.findById(id);
        if (!req || req.status !== 'pending') return null;

        return this.update(id, {
            status:         'completed',
            processed_at:   new Date().toISOString(),
            transaction_id: transactionId,
            approved_by:    adminId,
            admin_note:     note || null
        });
    }

    /**
     * Reject a withdrawal request (admin action).
     * Refunds the amount back to user_earnings.available.
     */
    async reject(
        id: number,
        adminId: number,
        reason: string
    ): Promise<WithdrawalRequest | null> {
        const req = await this.findById(id);
        if (!req || req.status !== 'pending') return null;

        // Refund
        await this.db.prepare(
            `UPDATE user_earnings SET available = available + ?, withdrawn = withdrawn - ?, updated_at = datetime('now') WHERE user_id = ?`
        ).bind(req.amount, req.amount, req.user_id).run();

        return this.update(id, {
            status:       'rejected',
            processed_at: new Date().toISOString(),
            approved_by:  adminId,
            admin_note:   reason
        });
    }

    /** Cancel a pending request by the user (refund balance) */
    async cancelByUser(id: number, userId: number): Promise<boolean> {
        const req = await this.findById(id);
        if (!req || req.user_id !== userId || req.status !== 'pending') return false;

        await this.db.prepare(
            `UPDATE user_earnings SET available = available + ?, withdrawn = withdrawn - ?, updated_at = datetime('now') WHERE user_id = ?`
        ).bind(req.amount, req.amount, userId).run();

        await this.db.prepare(
            `UPDATE ${this.tableName} SET status = 'rejected', admin_note = 'Cancelled by user', processed_at = datetime('now') WHERE id = ?`
        ).bind(id).run();

        return true;
    }

    /** Get all requests for a single user (paginated) */
    async getForUser(userId: number, limit = 20, offset = 0): Promise<WithdrawalRequest[]> {
        const res = await this.db.prepare(`
            SELECT * FROM ${this.tableName}
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ? OFFSET ?
        `).bind(userId, limit, offset).all<WithdrawalRequest>();

        return res.results || [];
    }

    /** Get admin queue (pending requests with user info) */
    async getAdminQueue(filters: WithdrawalFilters = {}): Promise<WithdrawalRequestWithUser[]> {
        const conditions: string[] = [];
        const params: any[] = [];

        if (filters.status) {
            conditions.push('wr.status = ?');
            params.push(filters.status);
        }
        if (filters.user_id) {
            conditions.push('wr.user_id = ?');
            params.push(filters.user_id);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
        const limit  = filters.limit  ?? 50;
        const offset = filters.offset ?? 0;

        const res = await this.db.prepare(`
            SELECT wr.*,
                   u.username,
                   u.display_name,
                   u.avatar_url
            FROM ${this.tableName} wr
            JOIN users u ON wr.user_id = u.id
            ${where}
            ORDER BY wr.created_at ASC
            LIMIT ? OFFSET ?
        `).bind(...params, limit, offset).all<WithdrawalRequestWithUser>();

        return res.results || [];
    }

    /** Count pending withdrawal requests */
    async countPending(): Promise<number> {
        return this.countBy('status', 'pending');
    }
}

export default WithdrawalRequestModel;
