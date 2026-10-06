/**
 * @file src/models/PaymentMethodModel.ts
 * @description نموذج طرق الدفع (FR-018)
 * @module models/PaymentMethodModel
 * 
 * Payment options: Bank Account (IBAN), PayPal, Wise
 * Payment is only after receiving from advertisers + 7 day safety period
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

/**
 * Payment Method Type
 */
export type PaymentMethodType = 'bank' | 'paypal' | 'wise';

/**
 * Payment Method Interface
 */
export interface PaymentMethod {
    id: number;
    user_id: number;
    type: PaymentMethodType;
    is_default: number;
    // Bank Account
    bank_name: string | null;
    iban: string | null;
    swift_code: string | null;
    account_holder: string | null;
    // PayPal / Wise
    email: string | null;
    // Metadata
    is_verified: number;
    created_at: string;
    updated_at: string;
}

/**
 * Payout execution snapshot carried by a withdrawal request.
 * Written once at creation from the chosen saved method; never updated
 * afterwards, so later edits/deletes of the method cannot change it.
 */
export interface PayoutSnapshot {
    type: PaymentMethodType;
    bank_name: string | null;
    iban: string | null;
    swift_code: string | null;
    account_holder: string | null;
    email: string | null;
}

/**
 * Build the immutable execution snapshot for a saved method.
 * Also derives the legacy display pair (payment_method/payment_details)
 * so older readers (admin queue, history) keep working unchanged.
 */
export function buildPayoutSnapshot(method: PaymentMethod): { snapshot: string; payment_method: string; payment_details: string } {
    const snap: PayoutSnapshot = {
        type: method.type,
        bank_name: method.bank_name,
        iban: method.iban,
        swift_code: method.swift_code,
        account_holder: method.account_holder,
        email: method.email,
    };
    const payment_method = method.type;
    const payment_details = method.type === 'bank'
        ? [method.bank_name, method.iban, method.swift_code, method.account_holder].filter(Boolean).join(' · ')
        : (method.email || '');
    return { snapshot: JSON.stringify(snap), payment_method, payment_details };
}

/**
 * Payment Method Model Class
 * نموذج طرق الدفع
 */
export class PaymentMethodModel extends BaseModel<PaymentMethod> {
    protected readonly tableName = 'payment_methods';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create payment method
     */
    async create(data: Partial<PaymentMethod>): Promise<PaymentMethod> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} 
            (user_id, type, is_default, bank_name, iban, swift_code, account_holder, email, is_verified, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `).bind(
            data.user_id,
            data.type,
            data.is_default ?? 0,
            data.bank_name || null,
            data.iban || null,
            data.swift_code || null,
            data.account_holder || null,
            data.email || null,
            now,
            now
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create payment method');
    }

    /**
     * Update payment method
     */
    async update(id: number, data: Partial<PaymentMethod>): Promise<PaymentMethod | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.type !== undefined) { updates.push('type = ?'); values.push(data.type); }
        if (data.bank_name !== undefined) { updates.push('bank_name = ?'); values.push(data.bank_name); }
        if (data.iban !== undefined) { updates.push('iban = ?'); values.push(data.iban); }
        if (data.swift_code !== undefined) { updates.push('swift_code = ?'); values.push(data.swift_code); }
        if (data.account_holder !== undefined) { updates.push('account_holder = ?'); values.push(data.account_holder); }
        if (data.email !== undefined) { updates.push('email = ?'); values.push(data.email); }
        if (data.is_default !== undefined) { updates.push('is_default = ?'); values.push(data.is_default); }

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
     * Get user's payment methods
     */
    async getUserMethods(userId: number): Promise<PaymentMethod[]> {
        const result = await this.db.prepare(`
            SELECT * FROM ${this.tableName}
            WHERE user_id = ?
            ORDER BY is_default DESC, created_at DESC
        `).bind(userId).all<PaymentMethod>();
        return result.results || [];
    }

    /**
     * Set a payment method as default — atomically (single batch: clear
     * all of the user's flags, then set the chosen owned row). Returns
     * false when the row does not belong to the user (no flag is cleared
     * in that case, because the batch never runs).
     */
    async setDefault(userId: number, methodId: number): Promise<boolean> {
        const owned = await this.db.prepare(
            `SELECT id FROM ${this.tableName} WHERE id = ? AND user_id = ?`
        ).bind(methodId, userId).first();
        if (!owned) return false;
        await this.db.batch([
            this.db.prepare(
                `UPDATE ${this.tableName} SET is_default = 0 WHERE user_id = ?`
            ).bind(userId),
            this.db.prepare(
                `UPDATE ${this.tableName} SET is_default = 1 WHERE id = ? AND user_id = ?`
            ).bind(methodId, userId),
        ]);
        return true;
    }

    /**
     * Get user's default payment method
     */
    async getDefault(userId: number): Promise<PaymentMethod | null> {
        return this.db.prepare(`
            SELECT * FROM ${this.tableName}
            WHERE user_id = ? AND is_default = 1
        `).bind(userId).first<PaymentMethod>();
    }

    /**
     * Delete a payment method.
     *
     * R2-P default invariant: deleting the default promotes the oldest
     * remaining method of the same user to default (by id); with no
     * methods left there is simply no default. Old withdrawal requests
     * are unaffected either way — they carry their own snapshot (and the
     * link NULLs via ON DELETE SET NULL).
     *
     * @returns the promoted default id (null when none remains).
     */
    async deleteMethod(userId: number, methodId: number): Promise<{ deleted: boolean; newDefaultId: number | null }> {
        const existing = await this.db.prepare(
            `SELECT id, is_default FROM ${this.tableName} WHERE id = ? AND user_id = ?`
        ).bind(methodId, userId).first<{ id: number; is_default: number }>();
        if (!existing) return { deleted: false, newDefaultId: null };
        await this.db.prepare(
            `DELETE FROM ${this.tableName} WHERE id = ? AND user_id = ?`
        ).bind(methodId, userId).run();
        let newDefaultId: number | null = null;
        if (existing.is_default) {
            const next = await this.db.prepare(
                `SELECT id FROM ${this.tableName} WHERE user_id = ? ORDER BY id ASC LIMIT 1`
            ).bind(userId).first<{ id: number }>();
            if (next) {
                await this.db.prepare(
                    `UPDATE ${this.tableName} SET is_default = 1 WHERE id = ?`
                ).bind(next.id).run();
                newDefaultId = next.id;
            }
        }
        return { deleted: true, newDefaultId };
    }
}

export default PaymentMethodModel;
