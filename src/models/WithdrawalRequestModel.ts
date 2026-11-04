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
 * المصدر: platform_settings.min_withdrawal_amount (seed في 0003)
 * + نص الواجهة min_withdrawal ($50) + حارس requestWithdrawal أدناه.
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
    // R2-P: saved-method link (NULL for legacy free-text requests; NULLed
    // on method delete) + immutable execution snapshot (written once at
    // creation, never updated — see update() allowlist below).
    payout_method_id: number | null;
    payout_snapshot: string;
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
    payout_method_id?: number | null;
    payout_snapshot?: string;
}

export interface WithdrawalFilters {
    status?: WithdrawalStatus;
    user_id?: number;
    limit?: number;
    offset?: number;
}

/**
 * G2 — ملخص المحفظة المشتق من دفتر الأستاذ فقط.
 * كل القيم بالسنت (نفس وحدة available الحالية — لا تغيير دلالة).
 * `pending` صفر دائماً: لا يوجد في العقد الحالي مصدر قيود «معلّقة» غير
 * الحجز، والحجز يظهر في on_hold. لا يُخترع مصدر جديد.
 */
export interface WalletSummary {
    available: number;
    pending: number;
    on_hold: number;
    withdrawn: number;
    total: number;
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
                 payment_details, payout_method_id, payout_snapshot, hold_tx_id, created_at)
            VALUES (?, ?, ?, ?, 'requested', ?, ?, ?, ?, ?, datetime('now'))
        `).bind(
            data.user_id,
            data.amount,
            data.amount_cents,
            data.fee_cents ?? WITHDRAWAL_FEE_CENTS,
            data.payment_method,
            data.payment_details,
            data.payout_method_id ?? null,
            data.payout_snapshot ?? '{}',
            data.hold_tx_id ?? null
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create withdrawal request');
    }

    /**
     * Required by BaseController – partial update.
     *
     * R2-P: payout_method_id/payout_snapshot are deliberately NOT updatable
     * here — the execution snapshot is frozen at creation so later method
     * edits/deletes can never rewrite an old request.
     */
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
            payout_method_id: data.payout_method_id ?? null,
            payout_snapshot: data.payout_snapshot ?? '{}',
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
     *
     * G3 (fail-closed): لا يُسمح بالانتقال إلى paid إلا إذا أثبت دفتر الأستاذ
     * أن حجزاً **قائماً** لهذا الطلب ما زال يغطي amount_cents + fee_cents.
     * الحارس داخل عبارة UPDATE نفسها (لا فحص JS منفصل)، صافي الحجز =
     * (دائن المستخدم − مدين المستخدم) لنفس ref_type/ref_id:
     * - hold يكتب +amount، release العكسي يكتب −amount ⇒ بعد التحرير الصافي 0
     *   فيفشل الحارس (لا دفع بعد تحرير).
     * - طلب بلا حجز (نافذة انهيار أ) صافيه 0 ⇒ 0 صفوف متغيرة ⇒ الرفض 409
     *   والحالة والرصيد لا يتغيران.
     */
    async approve(
        id: number,
        adminId: number,
        transactionId: string,
        note?: string
    ): Promise<WithdrawalRequest | null> {
        const row = await this.findById(id);
        if (!row) return null;

        const now = new Date().toISOString();
        const userAccount = `user:${row.user_id}`;
        // الحجز يغطي المبلغ + الرسوم (الرسوم صفر حالياً لكن العقد لا يفترض ذلك).
        const heldCents = row.amount_cents + row.fee_cents;

        const results = await this.db.batch([
            this.db.prepare(
                `UPDATE ${this.tableName}
                 SET status = 'approved', approved_by = ?, admin_note = ?
                 WHERE id = ? AND status = 'requested'
                   AND (
                       SELECT COALESCE(SUM(CASE WHEN le.direction = 'credit'
                                                THEN le.amount_cents
                                                ELSE -le.amount_cents END), 0)
                       FROM ledger_entries le
                       WHERE le.ref_type = 'withdrawal_request'
                         AND le.ref_id = ?
                         AND le.account = ?
                   ) >= ?`
            ).bind(adminId, note ?? null, id, id, userAccount, heldCents),
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
     * تحرير الحجز: عكس الحجز الفعلي تماماً (debit للمستخدم + credit للمنصة)،
     * فيعود الرصيد كاملاً ويبقى verifyInvariant() صفراً. idempotent.
     *
     * G3 (window B): لا يعتمد على hold_tx_id إطلاقاً — الانهيار بين قيد الحجز
     * وكتابة hold_tx_id يترك العمود NULL بينما المال محجوز فعلاً. لذلك يُشتق
     * الحجز من الدفتر نفسه بمرجع الطلب: قيد دائن لحساب المستخدم بـ
     * ref_type='withdrawal_request' و ref_id=row.id. قيد التحرير العكسي هو
     * debit لنفس الحساب/المرجع، فلا يطابق الاستعلام. المبلغ المُعاد هو مبلغ
     * الحجز المسجل (amount_cents + fee_cents) لا row.amount_cents.
     * - لا حجز في الدفتر (نافذة أ) ⇒ لا شيء لتحريره، والمكافأة صفر بلا أثر.
     * - إعادة التحرير ⇒ نفس tx_id الحتمي ⇒ no-op (M4)، لا تحرير مزدوج.
     */
    private async releaseHold(row: WithdrawalRequest): Promise<void> {
        const hold = await this.db.prepare(
            `SELECT tx_id, amount_cents
             FROM ledger_entries
             WHERE ref_type = 'withdrawal_request'
               AND ref_id = ?
               AND account = ?
               AND direction = 'credit'
             ORDER BY id DESC
             LIMIT 1`
        ).bind(row.id, `user:${row.user_id}`).first<{ tx_id: string; amount_cents: number }>();

        if (!hold) return;

        const releaseTxId = `${RELEASE_TX_PREFIX}${row.id}`;
        await this.ledger.post({
            txId:      releaseTxId,
            createdBy: row.approved_by != null ? `admin:${row.approved_by}` : `user:${row.user_id}`,
            ref:       { ref_type: 'withdrawal_request', ref_id: row.id },
            entries: [
                { account: `user:${row.user_id}`, direction: 'debit', amountCents: hold.amount_cents },
                { account: 'platform:withdrawals', direction: 'credit', amountCents: hold.amount_cents }
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

    /**
     * G2 — ملخص محفظة المستخدم من دفتر الأستاذ حصراً (لا user_earnings).
     *
     * الاشتقاق:
     * - available = LedgerService.balance(user:<id>) — نفس دلالة العرض الحالية
     *   (سنت، بعد خصم الحجوزات والمدفوع).
     * - لكل طلب: held = Σ(دائن المستخدم) − Σ(مدين المستخدم) على قيود
     *   ref_type='withdrawal_request' و ref_id=الطلب. الحجز +amount، والتحرير
     *   العكسي −amount ⇒ بعد الرفض/الإلغاء يصبح held = 0.
     * - on_hold = Σ max(held, 0) للطلبات غير المدفوعة. يشمل requested و
     *   approved، ويشمل rejected التي لم يصلها قيد التحرير بعد (نافذة انهيار:
     *   المال ما زال محجوزاً فعلاً، فلا يختفي من العرض).
     * - withdrawn = Σ max(held, 0) للطلبات paid (الحجز بقي بلا تحرير = دُفع).
     * - pending = 0: لا قيود «معلّقة» في العقد الحالي.
     * - total = available + on_hold + withdrawn (تطابق تام على الحالات الثلاث).
     *
     * حدّ معروف: القيود اليتيمة بلا صف طلب (أو لطلب محذوف) لا تدخل المجاميع؛
     * والصفوف السابقة للدفتر (legacy) بلا قيود تساهم 0 — لا تُخترع أرصدة.
     */
    async getWalletSummary(userId: number): Promise<WalletSummary> {
        const [available, row] = await Promise.all([
            this.ledger.balance(`user:${userId}`),
            this.db.prepare(`
                SELECT
                    COALESCE(SUM(CASE WHEN wr.status = 'paid' THEN 0
                                      ELSE MAX(h.held_cents, 0) END), 0) AS on_hold,
                    COALESCE(SUM(CASE WHEN wr.status = 'paid' THEN MAX(h.held_cents, 0)
                                      ELSE 0 END), 0) AS withdrawn
                FROM (
                    SELECT le.ref_id AS request_id,
                           SUM(CASE WHEN le.direction = 'credit'
                                    THEN le.amount_cents
                                    ELSE -le.amount_cents END) AS held_cents
                    FROM ledger_entries le
                    WHERE le.ref_type = 'withdrawal_request'
                      AND le.account = ?
                    GROUP BY le.ref_id
                ) h
                JOIN withdrawal_requests wr ON wr.id = h.request_id
                WHERE wr.user_id = ?
            `).bind(`user:${userId}`, userId).first<{ on_hold: number | null; withdrawn: number | null }>()
        ]);

        const onHold = row?.on_hold ?? 0;
        const withdrawn = row?.withdrawn ?? 0;
        return {
            available,
            pending: 0,
            on_hold: onHold,
            withdrawn,
            total: available + onHold + withdrawn
        };
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
