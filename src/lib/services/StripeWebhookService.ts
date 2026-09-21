/**
 * StripeWebhookService — مسار الدفع الفعلي المرتبط بـLedgerService (المهمة 8.C)
 *
 * المصدر الوحيد للأثر المالي هو `LedgerService` (M1–M6). هذا الـ service
 * يُترجم أحداث Stripe الموقّعة إلى قيود ledger متوازنة، ولا يكتب أي رصيد
 * ولا ينشئ مساراً مالياً موازناً (لا user_earnings، لا financial_log، لا
 * تحديث مباشر لأي عمود مبلغ).
 *
 * القواعد الحاكمة (المتطلبات 1–10):
 *
 * 1. التوقيع يُفحص دائماً أولاً (StripeService.verifyWebhookSignature) — لا
 *    معالجة قبل نجاحه (400 عند الفشل).
 * 2. Idempotency على `event.id` (M4 الأساسية): جدول
 *    `stripe_webhook_events` بـUNIQUE(event_id) + فحص وجود مسبق + فحص
 *    `LedgerService` على tx_id. نفس الحدث 10 مرات ⇒ أثر مالي واحد.
 * 3. عدم الثقة بالعميل/webhook وحده: المبلغ يُطابَق دائماً مع
 *    `donations.amount_cents` (السجل الداخلي) — أي تعارض ⇒ رفض صامت بلا
 *    أثر مالي (200 للحدث، لكن لا قيود).
 * 4. الأحداث المدعومة:
 *      - checkout.session.completed / payment_intent.succeeded ⇒ قيود دائنة
 *        (نجاح الدفع).
 *      - charge.failed / payment_intent.payment_failed ⇒ حالة فشل بلا قيود.
 *      - charge.refunded ⇒ قيود عكسية متوازنة (استرداد).
 *      - أي حدث آخر ⇒ 200 ولا أثر مالي.
 * 5. المبالغ integer cents فقط؛ لا `Math.round` على فاصلة عائمة في الحساب
 *    المالي (التحويل من الدولار يحدث مرة واحدة عند الإنشاء).
 *
 * 8.E (تبرعات المتنافسين — امتداد بلا تغيير لسياسة 8.C):
 * - التبرع المرتبط بمستلم يُقسَّم عند الالتقاط: رسوم المنصة
 *   (`platform_share_percentage` الموثقة في 8.B) + صافي المتنافس في
 *   `user:<id>` — كلها عبر LedgerService.post() في batch واحد.
 * - التبرع بلا مستلم يكتب شكله الأصلي حرفياً (سياسة 8.C untouched).
 * - الاسترداد الكامل لتبرع مقسّم = مرآة معكوسة لقيود الالتقاط الأصلية
 *   عبر المسار الموثوق نفسه؛ الجزئي/القديم على مسار 8.C كما هو.
 */

import { DonationModel, splitDonationCents } from '../../models/DonationModel';
import { LedgerService } from './LedgerService';
import { PlatformSettingsModel } from '../../models/PlatformSettingsModel';

/** نتيجة معالجة حدث webhook واحدة. */
export interface WebhookEventResult {
    /** true ⇒ أُنشئت قيود ledger جديدة؛ false ⇒ لا أثر مالي. */
    applied: boolean;
    /** سبب عدم التطبيق — للتسجيل وللاختبارات فقط. */
    reason?: string;
    /** معرّف حدث Stripe (idempotency key). */
    eventId: string;
    /** tx_id المرتبط في ledger (إن وُجد). */
    txId?: string;
    /**
     * 8.E — نوع الأثر المالي (additive): 'capture' للالتقاط، 'refund'
     * للاسترداد. يحتاجه المسار لتمييز نجاح التبرع (يُبث SSE) عن الاسترداد
     * (لا يُبث حدث استلام). غائب في مسارات 8.C القديمة بلا أثر.
     */
    kind?: 'capture' | 'refund';
    /**
     * 8.E — سياق التبرع (additive): يُملأ عند ربط الحدث بتبرع داخلي،
     * ليبثّ المسار حدث SSE دون استعلام إضافي. غائب للتبرعات القديمة
     * والأحداث غير المرتبطة — لا يغيّر عقد 8.C.
     */
    donationId?: number;
    /** سياق البث الحي (NULL = خارج البث — لا حدث SSE). */
    competitionId?: number | null;
    /** مبلغ التبرع بالسنت (للحمولة فقط — الحقيقة المالية في ledger). */
    amountCents?: number;
}

/** حساب المنصة لاستقبال تبرعات الدفع — نمط حساب ledger المعتمد (8.A). */
const PLATFORM_DONATION_ACCOUNT = 'platform:revenue';
/** حساب احتياطي المنصة — الطرف الدائن عند نجاح الدفع. */
const RESERVE_ACCOUNT = 'reserve:gateway';

/**
 * شكل الحدث الذي يحتاجه المعالج. مقتطف من حمولة Stripe الخام — لا نقبل
 * سوى الحقول المستخدمة، وكلها تُمرَّر عبر JSON.parse بعد التحقق من التوقيع.
 */
export interface StripeEventShape {
    id: string;
    type: string;
    data?: {
        object?: Record<string, unknown> | null;
    };
}

export class StripeWebhookService {
    private readonly ledger: LedgerService;
    private readonly donations: DonationModel;
    private readonly settings: PlatformSettingsModel;

    constructor(db: D1Database) {
        this.ledger = new LedgerService(db);
        this.donations = new DonationModel(db);
        this.settings = new PlatformSettingsModel(db);
    }

    /**
     * التحقق من حدث تم استلامه مسبقاً (idempotency على event.id).
     * يُستخدم قبل أي معالجة لتقصير الدائرة على إعادة الإرسال.
     */
    private async findProcessedEvent(db: D1Database, eventId: string): Promise<{ tx_id: string | null } | null> {
        return db
            .prepare('SELECT tx_id FROM stripe_webhook_events WHERE event_id = ? LIMIT 1')
            .bind(eventId)
            .first<{ tx_id: string | null }>();
    }

    /**
     * تسجيل حدث مُعالَج. يُستخدم `INSERT OR IGNORE` لأن UNIQUE(event_id)
     * يحرّض المخطط على رفض التكرار — والفائدة: لا سباق بين فحص و Exist
     * وINSERT (M4 يحميه قيد قاعدة البيانات نفسها).
     *
     * ملاحظة: لا تُسجَّل حالة مالية هنا إطلاقاً — tx_id مرجع فقط.
     */
    private async recordEvent(
        db: D1Database,
        eventId: string,
        eventType: string,
        txId: string | null
    ): Promise<void> {
        await db
            .prepare('INSERT OR IGNORE INTO stripe_webhook_events (event_id, event_type, tx_id) VALUES (?, ?, ?)')
            .bind(eventId, eventType, txId)
            .run();
    }

    /**
     * استخراج معرّف التبرع من بيانات الحدث (client_reference_id أو
     * metadata.donation_id)، ثم تحميل السجل الداخلي.
     */
    private async resolveDonation(obj: Record<string, unknown> | null | undefined): Promise<{ id: number; amountCents: number; paymentStatus: string; transactionId: string | null; recipientUserId: number | null; competitionId: number | null } | null> {
        if (!obj || typeof obj !== 'object') return null;

        const meta = obj['metadata'] as Record<string, unknown> | null | undefined;
        const refId = typeof obj['client_reference_id'] === 'string' ? obj['client_reference_id'] : null;
        const metaDonationId = meta && typeof meta['donation_id'] === 'string' ? meta['donation_id'] : null;

        const rawId = refId ?? metaDonationId;
        if (!rawId) return null;

        const donationId = Number.parseInt(rawId, 10);
        if (!Number.isInteger(donationId) || donationId <= 0) return null;

        const donation = await this.donations.findById(donationId);
        if (!donation) return null;

        return {
            id: donation.id,
            amountCents: typeof donation.amount_cents === 'number' ? donation.amount_cents : 0,
            paymentStatus: donation.payment_status,
            transactionId: donation.transaction_id,
            recipientUserId: donation.recipient_user_id ?? null,
            competitionId: donation.competition_id ?? null,
        };
    }

    /**
     * استخراج المبلغ من الحدث بالسنتات الصحيحة فقط. مبلغ Stripe يأتي
     * أصلاً بالسنت (integer) — أي قيمة غير صحيحة تُرفض (لا تقريب ولا
     * إكراه لفاصلة عائمة).
     */
    private extractAmountCents(obj: Record<string, unknown> | null | undefined): number | null {
        if (!obj || typeof obj !== 'object') return null;
        const raw = obj['amount_received'] ?? obj['amount_total'] ?? obj['amount'];
        const amount = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
        if (!Number.isInteger(amount) || amount <= 0) return null;
        return amount;
    }

    /**
     * بناء tx_id deterministic من الحدث. النمط ثابت ومرتبط بمعرّف الحدث
     * بحيث يبقى idempotent على مستوى ledger أيضاً (طبقة ثانية من الحماية).
     */
    private txIdFor(eventId: string, kind: 'capture' | 'refund'): string {
        return `stripe:${kind}:${eventId}`;
    }

    /**
     * معالجة حدث موقّع (التحقق من التوقيع يتم في المسار).
     *
     * يعيد `{ applied: false, reason }` للحالات التالية — وكلها بلا أثر مالي:
     *  - الحدث مُعالَج مسبقاً (idempotent).
     *  - نوع غير مدعوم.
     *  - تعذّر ربط الحدث ببريد داخلي.
     *  - تعارض المبلغ مع السجل الداخلي (عدم ثقة).
     */
    async processEvent(db: D1Database, event: StripeEventShape): Promise<WebhookEventResult> {
        const eventId = event.id;
        if (!eventId || typeof eventId !== 'string') {
            return { applied: false, reason: 'missing_event_id', eventId: '' };
        }

        // (2) Idempotency — الطبقة الأولى: سجل الأحداث.
        const already = await this.findProcessedEvent(db, eventId);
        if (already) {
            return { applied: false, reason: 'already_processed', eventId, txId: already.tx_id ?? undefined };
        }

        const obj = event.data?.object ?? null;

        // (4) تفريع الأنواع المدعومة. كل شيء آخر ⇒ 200 ولا أثر.
        const type = event.type;

        if (type === 'checkout.session.completed' || type === 'payment_intent.succeeded') {
            return this.processCapture(db, eventId, type, obj);
        }

        if (type === 'charge.refunded') {
            return this.processRefund(db, eventId, type, obj);
        }

        if (type === 'charge.failed' || type === 'payment_intent.payment_failed') {
            const donation = await this.resolveDonation(obj);
            if (donation) {
                await this.donations.markFailed(donation.id);
            }
            // فشل الدفع ⇒ لا قيود دائنة إطلاقاً.
            await this.recordEvent(db, eventId, type, null);
            return { applied: false, reason: 'payment_failed_no_credit', eventId };
        }

        // حدث غير مدعوم ⇒ 200 ولا أثر مالي (يُسجَّل لمنع إعادة المعالجة).
        await this.recordEvent(db, eventId, type, null);
        return { applied: false, reason: 'unsupported_event', eventId };
    }

    /**
     * نجاح الدفع: قيود متوازنة عبر LedgerService فقط.
     *
     * تبرع المنصة (8.C — بلا تغيير):
     *   debit  platform:revenue   <amount>   (إيراد المنصة)
     *   credit reserve:gateway    <amount>   (نقد في البوابة)
     *
     * تبرع لمتنافس (8.E — تقسيم بنفس عقيدة 8.B):
     *   debit  platform:revenue   <fee>      (رسوم المنصة الموثقة)
     *   debit  user:<recipient>   <net>      (صافي المتنافس بعد الرسوم)
     *   credit reserve:gateway    <fee+net>  (ساق واحدة — M4 تمنع التكرار)
     *
     * Σ(debit) − Σ(credit) = 0 دائماً (fee + net === total)، وكل شيء داخل
     * db.batch() واحد عبر LedgerService.post() (M2). integer cents فقط.
     */
    private async processCapture(
        db: D1Database,
        eventId: string,
        eventType: string,
        obj: Record<string, unknown> | null | undefined
    ): Promise<WebhookEventResult> {
        const donation = await this.resolveDonation(obj);
        if (!donation) {
            await this.recordEvent(db, eventId, eventType, null);
            return { applied: false, reason: 'donation_not_found', eventId };
        }

        // (3) مطابقة المبلغ مع السجل الداخلي — لا ثقة بالـwebhook وحده.
        const eventAmount = this.extractAmountCents(obj);
        if (eventAmount === null) {
            await this.recordEvent(db, eventId, eventType, null);
            return { applied: false, reason: 'invalid_event_amount', eventId };
        }
        if (eventAmount !== donation.amountCents || donation.amountCents <= 0) {
            // تعارض ⇒ رفض بلا أثر مالي.
            await this.recordEvent(db, eventId, eventType, null);
            return { applied: false, reason: 'amount_mismatch', eventId };
        }

        const txId = this.txIdFor(eventId, 'capture');

        // (2) Idempotency — الطبقة الثانية: ledger tx_id. إعادة الإرسال بعد
        // فشل جزئي لا تُنشئ قيداً ثانياً.
        const existingTx = await this.ledger.entriesForTx(txId);
        if (existingTx.length > 0) {
            await this.recordEvent(db, eventId, eventType, txId);
            return { applied: false, reason: 'tx_already_applied', eventId, txId };
        }

        // 8.E: بناء القيود — تقسيم للمتنافس، أو شكل 8.C القديم للمنصة.
        const recipientId = donation.recipientUserId;
        const entries: Array<{ account: string; direction: 'debit' | 'credit'; amountCents: number }> =
            recipientId == null
                ? [
                    { account: PLATFORM_DONATION_ACCOUNT, direction: 'debit', amountCents: donation.amountCents },
                    { account: RESERVE_ACCOUNT, direction: 'credit', amountCents: donation.amountCents },
                ]
                : await this.buildRecipientEntries(donation.amountCents, recipientId);

        try {
            const result = await this.ledger.post({
                txId,
                currency: 'USD',
                createdBy: 'system:stripe',
                ref: { ref_type: 'donation', ref_id: donation.id },
                entries,
            });

            if (!result.applied) {
                // سبق تطبيقه تحت نفس tx_id (سباق أو إعادة إرسال).
                await this.recordEvent(db, eventId, eventType, txId);
                return { applied: false, reason: 'tx_already_applied', eventId, txId };
            }
        } catch (e) {
            // تعارض UNIQUE متزامن ⇒ لا أثر مالي مكرر.
            const msg = e instanceof Error ? e.message : String(e);
            if (/UNIQUE constraint failed|constraint failed/i.test(msg)) {
                await this.recordEvent(db, eventId, eventType, txId);
                return { applied: false, reason: 'tx_already_applied', eventId, txId };
            }
            // خطأ حقيقي ⇒ لا نُسجّل الحدث كـمعالَج، فيعيد Stripe المحاولة.
            throw e;
        }

        // تحديث حالة التبرع فقط (لا مبلغ ولا رصيد) — الترتيب: ledger أولاً.
        await this.donations.markCompleted(donation.id, eventId);

        await this.recordEvent(db, eventId, eventType, txId);
        return {
            applied: true,
            kind: 'capture',
            eventId,
            txId,
            donationId: donation.id,
            competitionId: donation.competitionId,
            amountCents: donation.amountCents,
        };
    }

    /**
     * قيود تبرع المتنافس (8.E): رسوم المنصة + صافي المستلم.
     * النسبة من `platform_share_percentage` (الموثقة في 8.B)، والتقسيم
     * integer-exact عبر splitDonationCents (fee + net === total دائماً).
     *
     * الشكل (نفس عقيدة 8.B — مدينون متعددون + دائن واحد بالإجمالي):
     *   debit  platform:revenue   <fee>
     *   debit  user:<recipient>   <net>
     *   credit reserve:gateway    <fee + net = total>
     * حركة واحدة في batch واحد (M2)، وحسابات مميزة داخلها (M4:
     * ‏UNIQUE(tx_id, account) يمنع تكرار نفس الحساب — لهذا ساق البوابة
     * واحدة بالإجمالي لا ساقين). الحالات الحدّية (رسوم صفر أو صافي صفر)
     * تُسقط القيد الصفري لأن LedgerService يرفض غير الموجب.
     */
    private async buildRecipientEntries(
        totalCents: number,
        recipientUserId: number
    ): Promise<Array<{ account: string; direction: 'debit' | 'credit'; amountCents: number }>> {
        const pct = await this.settings.getPlatformSharePercentage();
        const split = splitDonationCents(totalCents, pct);
        const entries: Array<{ account: string; direction: 'debit' | 'credit'; amountCents: number }> = [];
        if (split.feeCents > 0) {
            entries.push(
                { account: PLATFORM_DONATION_ACCOUNT, direction: 'debit', amountCents: split.feeCents },
            );
        }
        if (split.netCents > 0) {
            entries.push(
                { account: `user:${recipientUserId}`, direction: 'debit', amountCents: split.netCents },
            );
        }
        // ساق البوابة الدائنة واحدة بالإجمالي (M4) — ومجموع المدين يساويها
        // دائماً لأن fee + net === total (نفس نمط 8.B).
        entries.push(
            { account: RESERVE_ACCOUNT, direction: 'credit', amountCents: split.feeCents + split.netCents },
        );
        return entries;
    }

    /**
     * الاسترداد: قيود عكسية متوازنة عبر المسار المالي الموثوق نفسه (8.C).
     *
     * تبرع المنصة (8.C — بلا تغيير):
     *   debit  reserve:gateway    <amount>   (إرجاع النقد)
     *   credit platform:revenue   <amount>   (عكس الإيراد)
     *
     * تبرع لمتنافس (8.E): الاسترداد الكامل يعكس قيود الالتقاط الأصلية
     * قيداً بقيد (مرآة معكوسة الاتجاه من `stripe:capture:<event>` المخزّن
     * في `donations.transaction_id`) — فيعود الصافي للمتنافس والرسوم
     * للمنصة بدقة السنت، والثابت 0. الاسترداد الجزئي يعكس نفس سياسة
     * التقسيم على مبلغ الاسترداد R: مدين البوابة R + دائن المنصة F(R) +
     * دائن المتنافس N(R) عبر `splitDonationCents` (لا fallback المنصة).
     *
     * Σ(debit) − Σ(credit) = 0 (M1) في كل الحالات.
     */
    private async processRefund(
        db: D1Database,
        eventId: string,
        eventType: string,
        obj: Record<string, unknown> | null | undefined
    ): Promise<WebhookEventResult> {
        const donation = await this.resolveDonation(obj);
        if (!donation) {
            await this.recordEvent(db, eventId, eventType, null);
            return { applied: false, reason: 'donation_not_found', eventId };
        }

        // (3) مطابقة مبلغ الاسترداد مع السجل الداخلي.
        const refundAmount = this.extractAmountCents(obj);
        if (refundAmount === null || refundAmount > donation.amountCents) {
            await this.recordEvent(db, eventId, eventType, null);
            return { applied: false, reason: 'invalid_refund_amount', eventId };
        }

        const txId = this.txIdFor(eventId, 'refund');

        const existingTx = await this.ledger.entriesForTx(txId);
        if (existingTx.length > 0) {
            await this.recordEvent(db, eventId, eventType, txId);
            return { applied: false, reason: 'tx_already_applied', eventId, txId };
        }

        // 8.E: مرآة الالتقاط للاسترداد الكامل من تبرع مقسّم.
        let entries: Array<{ account: string; direction: 'debit' | 'credit'; amountCents: number }> | null = null;
        if (donation.recipientUserId != null && refundAmount === donation.amountCents && donation.transactionId) {
            const captureTxId = `stripe:capture:${donation.transactionId}`;
            const captureEntries = await this.ledger.entriesForTx(captureTxId);
            if (captureEntries.length > 0) {
                entries = captureEntries.map((row) => ({
                    account: String(row['account']),
                    direction: (row['direction'] === 'debit' ? 'credit' : 'debit') as 'debit' | 'credit',
                    amountCents: Number(row['amount_cents']),
                }));
            }
        }
        // 8.E تصحيح: الاسترداد الجزئي لتبرع مقسّم يعكس نفس سياسة التقسيم
        // الأصلية على مبلغ الاسترداد (لا fallback المنصة الذي يُبقي الصافي
        // للمتنافس خطأً): مدين البوابة R + دائن المنصة F(R) + دائن المتنافس
        // ‏N(R)، حيث F(R)+N(R) === R دائماً عبر splitDonationCents بنفس نسبة
        // ‏platform_share_percentage. الأرجل الصفرية تُسقط (LedgerService
        // يرفض غير الموجب) والتوازن محفوظ لأن R>0 مضمون من الاستخراج.
        if (entries === null && donation.recipientUserId != null && refundAmount < donation.amountCents) {
            const pct = await this.settings.getPlatformSharePercentage();
            const split = splitDonationCents(refundAmount, pct);
            entries = [{ account: RESERVE_ACCOUNT, direction: 'debit', amountCents: refundAmount }];
            if (split.feeCents > 0) {
                entries.push({ account: PLATFORM_DONATION_ACCOUNT, direction: 'credit', amountCents: split.feeCents });
            }
            if (split.netCents > 0) {
                entries.push({ account: `user:${donation.recipientUserId}`, direction: 'credit', amountCents: split.netCents });
            }
        }
        // المسار الموثوق 8.C (تبرعات المنصة، أو احتياطي آمن لأي حالة حدّية):
        // عكس عبر ساق المنصة/البوابة بالمبلغ المسترد.
        entries ??= [
            { account: RESERVE_ACCOUNT, direction: 'debit', amountCents: refundAmount },
            { account: PLATFORM_DONATION_ACCOUNT, direction: 'credit', amountCents: refundAmount },
        ];

        try {
            const result = await this.ledger.post({
                txId,
                currency: 'USD',
                createdBy: 'system:stripe',
                ref: { ref_type: 'donation', ref_id: donation.id },
                entries,
            });

            if (!result.applied) {
                await this.recordEvent(db, eventId, eventType, txId);
                return { applied: false, reason: 'tx_already_applied', eventId, txId };
            }
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (/UNIQUE constraint failed|constraint failed/i.test(msg)) {
                await this.recordEvent(db, eventId, eventType, txId);
                return { applied: false, reason: 'tx_already_applied', eventId, txId };
            }
            throw e;
        }

        await this.donations.markRefunded(donation.id);

        await this.recordEvent(db, eventId, eventType, txId);
        return {
            applied: true,
            kind: 'refund',
            eventId,
            txId,
            donationId: donation.id,
            competitionId: donation.competitionId,
            amountCents: donation.amountCents,
        };
    }
}

export default StripeWebhookService;
