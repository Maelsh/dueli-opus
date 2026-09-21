/**
 * @file src/models/WithdrawalRequestModel.ts
 * @description نموذج طلبات سحب الأرباح — دورة الحياة الموثقة (8.D)
 *              requested → approved → paid | rejected
 * @module models/WithdrawalRequestModel
 *
 * القواعد المالية (8.D) — كل الأثر المالي عبر LedgerService فقط:
 * - الحجز (hold) لحظة الطلب عبر LedgerService.withdraw() — فحص الرصيد وكتابته
 *   ذريان في SQL (M3)، فيمنع حجز المبلغ نفسه مرتين تحت التزامن.
 * - الرفض/الإلغاء يحرر الحجز بقيود عكسية عبر LedgerService.post().
 * - الموافقة والدفع لا يحركان مالاً (محجوز سلفاً) — انتقالات حالة فقط + تدقيق.
 * - لا كتابة مباشرة في user_earnings ولا أي مسار مالي موازٍ.
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';
import { LedgerService, LedgerError } from '../lib/services/LedgerService';

// =============================================
// 8.D policy — ثوابت موثقة وفق السياسة الموجودة فعلياً في المشروع
// =============================================

/**
 * الحد الأدنى للسحب = 50 دولاراً (5000 سنت).
 * المصدر: platform_settings.min_withdrawal_amount (seed في 0003) + فحص
 * EarningsModel (‎< 50 مرفوض) + نص الواجهة min_withdrawal ($50).
 */
export const MIN_WITHDRAWAL_CENTS = 5000;

/**
 * رسوم السحب = صفر.
 * لا توجد أي سياسة رسوم سحب في المشروع (لا مفتاح في platform_settings
 * ولا كود ولا واجهة)، فتبقى الرسوم صفراً — لا تُخترع سياسة مالية جديدة.
 */
export const WITHDRAWAL_FEE_CENTS = 0;

/** بادئات tx_id في ledger لدورة السحب (عدم تكرار M4 + تدقيق M5). */
export const HOLD_TX_PREFIX = 'withdrawal:hold:';
export const RELEASE_TX_PREFIX = 'withdrawal:release:';

// =============================================
// Interfaces / Types
// =============================================

export type WithdrawalStatus = 'requested' | 'approved' | 'paid' | 'rejected';

/** رموز أخطاء الطلب — يترجمها المتحكم عبر t('withdrawals.*'). */
export type WithdrawalRequestError =
    | 'min_amount'
    | 'insufficient_balance'
    | 'invalid_amount'
    | 'creation_failed';

export interface WithdrawalRequest {
    id: number;
    user_id: number;
    amount: number;
    amount_cents: number;
    fee_cents: number;
    status: WithdrawalStatus;
    payment_method: string;
    payment_details: string;
    created_at: string;
    processed_at: string | null;
    transaction_id: string | null;
    approved_by: number | null;
    admin_note: string | null;
    hold_tx_id: string | null;
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

    private readonly ledger: LedgerService;

    constructor(db: D1Database) {
        super(db);
        this.ledger = new LedgerService(db);
    }

    /** Required by BaseModel – creates a raw withdrawal row (status requested) */
    async create(data: Partial<WithdrawalRequest>): Promise<WithdrawalRequest> {
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName}
                (user_id, amount, amount_cents, fee_cents, status, payment_method,
                 payment_details, hold_tx_id, created_at)
            VALUES (?, ?, ?, ?, 'requested', ?, ?, ?, datetime('now'))
        `).bind(
            data.user_id,
            data.amount,
            data.amount_cents,
            data.fee_cents ?? WITHDRAWAL_FEE_CENTS,
            data.payment_method,
            data.payment_details,
            data.hold_tx_id ?? null
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
        if (data.hold_tx_id !== undefined)    { sets.push('hold_tx_id = ?');      vals.push(data.hold_tx_id); }

        if (sets.length === 0) return this.findById(id);

        vals.push(id);
        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${sets.join(', ')} WHERE id = ?`
        ).bind(...vals).run();

        return this.findById(id);
    }

    // -------------------------------------------------------
    // Domain: 8.D lifecycle (SQL-guarded transitions)
    // -------------------------------------------------------

    /**
     * طلب سحب جديد: إدراج الصف (requested) + حجز المبلغ لحظياً عبر
     * LedgerService.withdraw() — الفحص والكتابة ذريان في SQL فلا حجز مزدوج.
     * فشل الحجز ⇒ الصف يُرفض (rejected) بلا أي أثر مالي.
     */
    async requestWithdrawal(data: CreateWithdrawalData): Promise<{ request: WithdrawalRequest } | { error: WithdrawalRequestError }> {
        if (typeof data.amount !== 'number' || !Number.isFinite(data.amount) || data.amount <= 0) {
            return { error: 'invalid_amount' };
        }
        // التحويل الوحيد float→int عند الحدود، ثم integer cents فقط.
        const amountCents = Math.round(data.amount * 100);
        if (!Number.isInteger(amountCents) || amountCents <= 0) {
            return { error: 'invalid_amount' };
        }
        if (amountCents < MIN_WITHDRAWAL_CENTS) {
            return { error: 'min_amount' };
        }

        const request = await this.create({
            user_id:        data.user_id,
            amount:         data.amount,
            amount_cents:   amountCents,
            fee_cents:      WITHDRAWAL_FEE_CENTS,
            payment_method: data.payment_method,
            payment_details: data.payment_details,
            hold_tx_id:     null
        });
        const holdTxId = `${HOLD_TX_PREFIX}${request.id}`;

        try {
            await this.ledger.withdraw({
                userId:      data.user_id,
                amountCents: amountCents + WITHDRAWAL_FEE_CENTS,
                txId:        holdTxId,
                createdBy:   `user:${data.user_id}`,
                ref:         { ref_type: 'withdrawal_request', ref_id: request.id }
            });
        } catch (e) {
            if (e instanceof LedgerError && e.code === 'insufficient_funds') {
                // لا حجز ⇒ لا أثر مالي؛ الصف يُرفض صراحة فلا يبقى معلّقاً.
                await this.db.prepare(
                    `UPDATE ${this.tableName}
                     SET status = 'rejected', processed_at = datetime('now'),
                         admin_note = 'hold_failed_insufficient_balance'
                     WHERE id = ? AND status = 'requested'`
                ).bind(request.id).run();
                return { error: 'insufficient_balance' };
            }
            throw e;
        }

        const held = await this.update(request.id, { hold_tx_id: holdTxId });
        return { request: held! };
    }

    /**
     * موافقة الأدمن: requested → approved → paid في دفعة واحدة، كل انتقال
     * محروس بشرطه (changes===1 وإلا تعارض). الموافقة الثانية ⇒ 409 ولا دفع
     * مكرر — المال محجوز سلفاً ولا حركة مالية جديدة هنا.
     */
    async approve(
        id: number,
        adminId: number,
        transactionId: string,
        note?: string
    ): Promise<WithdrawalRequest | null> {
        const now = new Date().toISOString();
        const results = await this.db.batch([
            this.db.prepare(
                `UPDATE ${this.tableName}
                 SET status = 'approved', approved_by = ?, admin_note = ?
                 WHERE id = ? AND status = 'requested'`
            ).bind(adminId, note ?? null, id),
            this.db.prepare(
                `UPDATE ${this.tableName}
                 SET status = 'paid', processed_at = ?, transaction_id = ?
                 WHERE id = ? AND status = 'approved'`
            ).bind(now, transactionId, id)
        ]);
        const first = (results[0]?.meta as { changes?: number } | undefined)?.changes ?? 0;
        const second = (results[1]?.meta as { changes?: number } | undefined)?.changes ?? 0;
        if (first !== 1 || second !== 1) return null;
        return this.findById(id);
    }

    /**
     * رفض الأدمن: (requested|approved) → rejected + تحرير الحجز بقيود
     * LedgerService عكسية (idempotent على tx_id الحتمي).
     */
    async reject(
        id: number,
        adminId: number,
        reason: string
    ): Promise<WithdrawalRequest | null> {
        const result = await this.db.prepare(
            `UPDATE ${this.tableName}
             SET status = 'rejected', processed_at = datetime('now'),
                 approved_by = ?, admin_note = ?
             WHERE id = ? AND status IN ('requested', 'approved')`
        ).bind(adminId, reason, id).run();

        if ((result.meta.changes ?? 0) !== 1) {
            // مسار الاستشفاء: مرفوض سلفاً بلا تحرير (انهيار سابق) ⇒ أكمل التحرير.
            const row = await this.findById(id);
            if (row && row.status === 'rejected') {
                await this.releaseHold(row);
                return this.findById(id);
            }
            return null;
        }

        const row = (await this.findById(id))!;
        await this.releaseHold(row);
        return row;
    }

    /** إلغاء المستخدم لطلبه: requested → rejected (مالكه فقط) + تحرير الحجز */
    async cancelByUser(id: number, userId: number): Promise<boolean> {
        const result = await this.db.prepare(
            `UPDATE ${this.tableName}
             SET status = 'rejected', processed_at = datetime('now'),
                 admin_note = 'Cancelled by user'
             WHERE id = ? AND user_id = ? AND status = 'requested'`
        ).bind(id, userId).run();

        if ((result.meta.changes ?? 0) !== 1) return false;

        const row = (await this.findById(id))!;
        await this.releaseHold(row);
        return true;
    }

    /**
     * تحرير الحجز: عكس قيود الحجز تماماً (debit للمستخدم + credit للمنصة)،
     * فيعود الرصيد كاملاً ويبقى verifyInvariant() صفراً. idempotent.
     */
    private async releaseHold(row: WithdrawalRequest): Promise<void> {
        if (!row.hold_tx_id) return;
        const releaseTxId = `${RELEASE_TX_PREFIX}${row.id}`;
        await this.ledger.post({
            txId:      releaseTxId,
            createdBy: row.approved_by != null ? `admin:${row.approved_by}` : `user:${row.user_id}`,
            ref:       { ref_type: 'withdrawal_request', ref_id: row.id },
            entries: [
                { account: `user:${row.user_id}`, direction: 'debit', amountCents: row.amount_cents },
                { account: 'platform:withdrawals', direction: 'credit', amountCents: row.amount_cents }
            ]
        });
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

    /** Get admin queue (requests with user info, filterable by lifecycle status) */
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

    /** Count requested (pending-review) withdrawal requests */
    async countPending(): Promise<number> {
        return this.countBy('status', 'requested');
    }
}

export default WithdrawalRequestModel;
