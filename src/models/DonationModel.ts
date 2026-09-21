/**
 * @file src/models/DonationModel.ts
 * @description نموذج التبرعات
 * @module models/DonationModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

// =============================================
// 8.E policy — ثوابت موثقة وفق السياسة الموجودة فعلياً في المشروع
// =============================================

/**
 * الحد الأدنى للتبرع = دولار واحد (100 سنت).
 * المصدر: i18n ‏`payment_min_amount` (ar+en: «$1») + فحص `amount < 1` في
 * `POST /api/donations` + فحص العميل في `donate-page.ts` — ثلاثة مصادر
 * متطابقة، لا رقم جديد.
 */
export const MIN_DONATION_CENTS = 100;

/**
 * لا يوجد حد أقصى للتبرع على مستوى Dueli (قرار موثق 8.E).
 * بُحث المشروع كاملاً (platform_settings seeds، المسارات، الواجهة، الوثائق)
 * فلم توجد أي سياسة حد أقصى — وأي حد تفرضه بوابة الدفع (Stripe) يبقى حداً
 * تقنياً خارجياً يُعالَج فشله بأمان (بلا قيود مالية)، لا سياسة Dueli.
 * لهذا لا يوجد MAX_DONATION_CENTS عمداً — ومفتاح i18n ‏`donations.max`
 * يصف غياب الحد بدل عرض رقم مخترع.
 */
export const NO_DUELI_DONATION_MAX = true;

/** رموز أخطاء مبلغ التبرع — يترجمها المسار عبر t('donations.*'). */
export type DonationAmountError = 'invalid_amount' | 'below_minimum';

/**
 * نتيجة تقسيم التبرع: رسوم المنصة + صافي المتنافس (integer cents فقط).
 */
export interface DonationSplitCents {
    totalCents: number;
    feeCents: number;
    netCents: number;
    platformPercentage: number;
}

/**
 * تقسيم التبرع بين المنصة والمتنافس (8.E).
 *
 * - نسبة المنصة هي `platform_share_percentage` من `platform_settings`
 *   (الافتراضي 20 — نفس السياسة الموثقة في 8.B، لا سياسة رسوم جديدة).
 * - الحساب integer-exact بعقيدة 8.B نفسها: حصة المنصة بـ floor الصحيح
 *   ‏((total*pct − ‏(total*pct % 100)) / 100) والصافي = الباقي —
 *   فيبقى feeCents + netCents === totalCents بالضبط (لا سنت يضيع ولا يُخلق).
 * - لا floating-point في أي خطوة بعد التحويل الأولي عند الإنشاء.
 */
export function splitDonationCents(totalCents: number, platformPercentage: number): DonationSplitCents {
    if (!Number.isInteger(totalCents) || totalCents < 0) {
        throw new Error('totalCents must be a non-negative integer');
    }
    const pct = Number.isFinite(platformPercentage) ? Math.min(100, Math.max(0, platformPercentage)) : 20;
    const numerator = totalCents * pct;
    const feeCents = (numerator - (numerator % 100)) / 100;
    return {
        totalCents,
        feeCents,
        netCents: totalCents - feeCents,
        platformPercentage: pct,
    };
}

/**
 * Donation Interface
 */
export interface Donation {
    id: number;
    user_id: number | null;
    /**
     * المتنافس المستلم (8.E). NULL = تبرع للمنصة (مسار 8.C القديم).
     */
    recipient_user_id: number | null;
    /**
     * سياق البث الحي (8.E). NULL = خارج البث (لا حدث SSE).
     */
    competition_id: number | null;
    /**
     * المبلغ المسترد المعتمد تراكمياً بالسنت (8.E تصحيح REMOTE —
     * migration ‏0023). حارس حجز ذري للسقف التراكمي، لا مصدر حقيقة مالية
     * (الحقيقة في ledger) — يُحجَز عبر claimRefund() المشروط فقط.
     */
    refunded_cents: number;
    amount: number;
    /**
     * المبلغ المالي المعتمد بالسنت (8.C). عدد صحيح فقط — هذا هو المصدر
     * المالي للتبرع، بينما `amount` (REAL dollars) يبقى للعرض فقط.
     */
    amount_cents: number;
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
    /** المتنافس المستلم (8.E) — غائب/NULL = تبرع للمنصة. */
    recipient_user_id?: number | null;
    /** سياق البث الحي (8.E) — غائب/NULL = خارج البث. */
    competition_id?: number | null;
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
     *
     * 8.C: `amount_cents` (integer cents) هو المبلغ المالي المعتمد. يُحسب
     * مرة واحدة عند الإنشاء من `amount` الدولاري (مصدر العميل) — بعدها كل
     * مسار الدفع يقرأ `amount_cents` فقط، فلا فاصلة عائمة في أي حساب مالي.
     */
    async create(data: Partial<Donation>): Promise<Donation> {
        const now = new Date().toISOString();
        const amountCents = this.toCents(data.amount);
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName}
            (user_id, recipient_user_id, competition_id, amount, amount_cents, currency, payment_method, payment_status, donor_name, donor_email, message, is_anonymous, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)
        `).bind(
            data.user_id || null,
            data.recipient_user_id || null,
            data.competition_id || null,
            data.amount ?? 0,
            amountCents,
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
     * تحويل مبلغ دولاري (رقم العميل) إلى سنتات صحيحة مرة واحدة عند
     * الإنشاء. `Math.round` هنا فقط (حدود العميل)، وليس داخل أي حساب مالي
     * لاحق — كل المسارات اللاحقة تستهلك `amount_cents` كعدد صحيح.
     */
    private toCents(amount: number | undefined | null): number {
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return 0;
        return Math.round(amount * 100);
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
            recipient_user_id: data.recipient_user_id ?? null,
            competition_id: data.competition_id ?? null,
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
     * التحقق من مبلغ التبرع بالسنت (8.E).
     * - غير رقمي/غير موجب ⇒ invalid_amount.
     * - أقل من الحد الأدنى الموثق ($1) ⇒ below_minimum.
     * - لا حد أقصى على مستوى Dueli (NO_DUELI_DONATION_MAX) — أي مبلغ
     *   فوق ذلك يمرّ لبوابة الدفع، ورفضها يُعالَج بلا قيود مالية.
     */
    validateAmountCents(amount: unknown): { ok: true; amountCents: number } | { ok: false; error: DonationAmountError } {
        if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
            return { ok: false, error: 'invalid_amount' };
        }
        const amountCents = Math.round(amount * 100);
        if (!Number.isInteger(amountCents) || amountCents < MIN_DONATION_CENTS) {
            return { ok: false, error: 'below_minimum' };
        }
        return { ok: true, amountCents };
    }

    /**
     * فحص الحظر الاتجاهي للتبرع (3.A — يُفرض على الخادم).
     * يعيد true فقط حين المستلم (المتنافس) حظر المتبرع فعلاً:
     * ‏`user_blocks(blocker_id = المستلم, blocked_id = المتبرع)`.
     * اتجاهي عمداً — يختلف عن isBlockedBetween ثنائي الاتجاه (B6) لأن
     * المطلوب هنا هو «مستخدم قام بحظرك» تحديداً. المتبرع المجهول (NULL)
     * بلا هوية تُحظر ⇒ مسموح.
     */
    async isBlockedByRecipient(recipientUserId: number, donorUserId: number | null | undefined): Promise<boolean> {
        if (donorUserId == null) return false;
        if (recipientUserId === donorUserId) return false;
        const row = await this.db.prepare(
            `SELECT 1 FROM user_blocks WHERE blocker_id = ? AND blocked_id = ? LIMIT 1`
        ).bind(recipientUserId, donorUserId).first<{ '1': number }>();
        return row !== null;
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
     * Mark donation as refunded (8.C — refund ⇒ قيود عكسية في ledger)
     */
    async markRefunded(id: number): Promise<Donation | null> {
        return this.update(id, { payment_status: 'refunded' });
    }

    /**
     * حجز capture على مستوى التبرع (إصلاح 1 — منع Double Capture).
     * انتقال حالة ذري بشرط SQL (عقيدة B5-1/B12): pending/failed → completed
     * مع تسجيل حدث الفائز. الفائز الوحيد يكمل؛ الخاسر يرى changes=0.
     * ملاحظة: الحارس المالي الحقيقي هو ledger (tx قطعي لكل تبرع) — هذا
     * الحارس علامة حالة متسقة فقط، والترتيب دائماً ledger أولاً في الخدمة.
     */
    async claimCapture(id: number, transactionId: string): Promise<boolean> {
        const res = await this.db.prepare(
            `UPDATE ${this.tableName} SET payment_status = 'completed', transaction_id = ?
             WHERE id = ? AND payment_status IN ('pending', 'failed')`
        ).bind(transactionId, id).run();
        return ((res.meta as { changes?: number } | undefined)?.changes ?? 0) === 1;
    }

    /**
     * حجز allowance استرداد (إصلاح 3 — منع Cumulative Over-Refund).
     * ذري بشرط SQL واحد: يُضاف R فقط حين لا يتجاوز المجموع الأصل —
     * فيستحيل الإسراف حتى تحت التزامن (لا SELECT-then-INSERT عارٍ).
     * يعيد true حين رُبح الحجز، false حين الرفض (تجاوز السقف).
     */
    async claimRefund(id: number, amountCents: number): Promise<boolean> {
        if (!Number.isInteger(amountCents) || amountCents <= 0) return false;
        const res = await this.db.prepare(
            `UPDATE ${this.tableName} SET refunded_cents = refunded_cents + ?
             WHERE id = ? AND refunded_cents + ? <= amount_cents`
        ).bind(amountCents, id, amountCents).run();
        return ((res.meta as { changes?: number } | undefined)?.changes ?? 0) === 1;
    }

    /**
     * تحرير حجز استرداد بعد فشل كتابة القيود (لا يُستدعى عند النجاح).
     * الطرح يتبادل مع الحجوزات المتزامنة (نفس R يُطرح) فلا يفسد المجاميع —
     * والاستدعاء فقط في مسار الخطأ قبل أي تسجيل حدث (فيعيد Stripe المحاولة
     * فيحجز من جديد باتساق).
     */
    async releaseRefundClaim(id: number, amountCents: number): Promise<void> {
        if (!Number.isInteger(amountCents) || amountCents <= 0) return;
        await this.db.prepare(
            `UPDATE ${this.tableName} SET refunded_cents = refunded_cents - ?
             WHERE id = ? AND refunded_cents >= ?`
        ).bind(amountCents, id, amountCents).run();
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
