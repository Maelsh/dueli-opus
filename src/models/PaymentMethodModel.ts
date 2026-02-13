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
     * Set a payment method as default
     */
    async setDefault(userId: number, methodId: number): Promise<boolean> {
        // Unset all as default
        await this.db.prepare(`
            UPDATE ${this.tableName} SET is_default = 0 WHERE user_id = ?
        `).bind(userId).run();

        // Set the chosen one as default
        const result = await this.db.prepare(`
            UPDATE ${this.tableName} SET is_default = 1 WHERE id = ? AND user_id = ?
        `).bind(methodId, userId).run();

        return result.meta.changes > 0;
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
     * Delete payment method (only if not used in pending payments)
     */
    async deleteMethod(userId: number, methodId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            DELETE FROM ${this.tableName} WHERE id = ? AND user_id = ?
        `).bind(methodId, userId).run();
        return result.meta.changes > 0;
    }
}

export default PaymentMethodModel;
