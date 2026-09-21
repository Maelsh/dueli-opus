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
 * - تصحيحات REMOTE: capture قطعي لكل تبرع (`donation:capture:<id>` —
 *   نوعا Stripe لنفس الدفع = أثر واحد)؛ الاسترداد بدلالات Stripe
 *   الحقيقية (amount_refunded تراكمي ⇒ الفرق الجديد فقط) مع سقف تراكمي
 *   ذري (migration ‏0023) وتسوية تقريب من التخصيص الأصلي.
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
    private async resolveDonation(obj: Record<string, unknown> | null | undefined): Promise<{ id: number; amountCents: number; paymentStatus: string; transactionId: string | null; recipientUserId: number | null; competitionId: number | null; refundedCents: number } | null> {
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
            refundedCents: typeof donation.refunded_cents === 'number' ? donation.refunded_cents : 0,
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
     * إصلاح REMOTE 1 (منع Double Capture): معرّف الحركة قطعي لكل تبرع
     * ‏(`donation:capture:<donationId>`) لا لكل حدث — فنوعا Stripe
     * المختلفان لنفس الدفع (payment_intent.succeeded + checkout.session.
     * completed) يتصارعان على نفس tx: الفائز الوحيد يكتب (M4 ‏UNIQUE)،
     * والخاسر يعود `tx_already_applied` بلا أثر. الترتيب ledger أولاً ثم
     * علامة الحالة المشروطة — فلا فجوة انهيار تُضيع مالاً (إعادة المحاولة
     * تجد tx موجوداً فتُكمل العلامة باتساق).
     *
     * Σ(debit) − Σ(credit) = 0 دائماً، وكل شيء داخل db.batch() واحد عبر
     * LedgerService.post() (M2). integer cents فقط.
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

        // R1: حارس على مستوى التبرع — نفس tx لكل أحداث capture لهذا التبرع.
        const txId = `donation:capture:${donation.id}`;

        // (2) Idempotency — الطبقة الثانية: ledger tx_id. إعادة الإرسال أو
        // حدث ثانٍ لنفس الدفع لا يُنشئ قيداً ثانياً.
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

        // علامة الحالة المشروطة (pending/failed → completed) — best-effort
        // بعد ledger: الفائز بالمال يثبّت الحالة، والخاسر لا يصل هنا أصلاً.
        await this.donations.claimCapture(donation.id, eventId);

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
     * تبرع لمتنافس (8.E + تصحيحات REMOTE 2/3/4):
     * - R2 (دلالات Stripe الحقيقية): `amount` في Charge هو الأصل، و
     *   ‏`amount_refunded` هو التراكمي — فيُعكَس الفرق الجديد فقط
     *   ‏(R = التراكمي − ما سبق) لا مبلغ الـcharge.
     * - R3 (السقف التراكمي): حجز ذري `refunded_cents + R <= amount_cents`
     *   (migration ‏0023) — فيستحيل تجاوز الأصل تحت التزامن. الرفض بلا
     *   تسجيل حدث (فيعيد Stripe المحاولة باتساق) وبلا أي أثر مالي.
     * - R4 (التسوية): أرجل كل استرداد تُشتق من التخصيص الأصلي الفعلي
     *   (C0/F0 من قيود الالتقاط) باستهداف تراكمي integer-exact —
     *   فتنتهي المجموعات بالضبط إلى الأصل عند الاكتمال (لا خلق/هدر سنتات).
     * - الاسترداد الكامل من الصفر يظل مرآة قيود الالتقاط الأصلية (الأدق —
     *   القيم المسجلة فعلاً لا المحسوبة).
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

        // (R2) التراكمي من حمولة Stripe — `amount_refunded` هو التراكمي
        // المعتمد، و`amount` (الأصل) fallback للتوافق فقط. لا يُفترض أبداً
        // أن amount هو مبلغ الاسترداد.
        const cumulative = this.extractCumulativeRefund(obj);
        if (cumulative === null || cumulative > donation.amountCents) {
            await this.recordEvent(db, eventId, eventType, null);
            return { applied: false, reason: 'invalid_refund_amount', eventId };
        }

        // الزيادة الجديدة فقط فوق ما سبق اعتماده (لا إعادة عكس المعالَج).
        const incremental = cumulative - donation.refundedCents;
        if (incremental <= 0) {
            await this.recordEvent(db, eventId, eventType, null);
            return { applied: false, reason: 'no_new_refund', eventId };
        }

        // Idempotency على الحدث قبل أي حجز (إعادة الإرسال ⇒ no-op).
        const already = await this.findProcessedEvent(db, eventId);
        if (already) {
            return { applied: false, reason: 'already_processed', eventId, txId: already.tx_id ?? undefined };
        }

        const txId = this.txIdFor(eventId, 'refund');

        const existingTx = await this.ledger.entriesForTx(txId);
        if (existingTx.length > 0) {
            await this.recordEvent(db, eventId, eventType, txId);
            return { applied: false, reason: 'tx_already_applied', eventId, txId };
        }

        // 8.E: مرآة الالتقاط للاسترداد الكامل من الصفر (القيم المسجلة فعلاً).
        let entries: Array<{ account: string; direction: 'debit' | 'credit'; amountCents: number }> | null = null;
        const captureTxId = `donation:capture:${donation.id}`;
        if (donation.recipientUserId != null && donation.refundedCents === 0 && incremental === donation.amountCents) {
            const captureEntries = await this.ledger.entriesForTx(captureTxId);
            if (captureEntries.length > 0) {
                entries = captureEntries.map((row) => ({
                    account: String(row['account']),
                    direction: (row['direction'] === 'debit' ? 'credit' : 'debit') as 'debit' | 'credit',
                    amountCents: Number(row['amount_cents']),
                }));
            }
        }
        // (R4) تسوية الاسترداد من التخصيص الأصلي — تنتهي المجموعات إلى
        // الأصل بالسنت عند الاكتمال (لا خلق/هدر من التقريب).
        if (entries === null && donation.recipientUserId != null) {
            entries = await this.buildReconciledRefundEntries(db, donation, incremental);
        }
        // المسار الموثوق 8.C (تبرعات المنصة): عكس عبر ساق المنصة/البوابة
        // بالزيادة الجديدة.
        entries ??= [
            { account: RESERVE_ACCOUNT, direction: 'debit', amountCents: incremental },
            { account: PLATFORM_DONATION_ACCOUNT, direction: 'credit', amountCents: incremental },
        ];

        // (R3) حجز السقف التراكمي ذرياً قبل الكتابة (تبرعات المتنافسين فقط —
        // مسار 8.C بلا حجز كما كان). الفشل ⇒ رفض بلا تسجيل حدث (إعادة
        // المحاولة لاحقاً تُعيد الحساب على أساس أحدث) وبلا أي أثر مالي.
        const needsClaim = donation.recipientUserId != null;
        if (needsClaim && !(await this.donations.claimRefund(donation.id, incremental))) {
            return { applied: false, reason: 'refund_exceeds_total', eventId };
        }

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
            // فشل الكتابة ⇒ تحرير الحجز ثم إعادة الرمي (الحدث غير مسجَّل —
            // إعادة المحاولة تحجز من جديد باتساق؛ لا مال تحرك).
            if (needsClaim) {
                await this.donations.releaseRefundClaim(donation.id, incremental);
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

    /**
     * R2: التراكمي المسترد من حمولة charge.refunded الحقيقية.
     * `amount_refunded` هو التراكمي المعتمد؛ `amount` (الأصل) يُقبل
     * fallback للتوافق مع الحمولات التركيبية القديمة فقط. integer ≥ 0
     * وإلا null (لا تقريب ولا إكراه عائم).
     */
    private extractCumulativeRefund(obj: Record<string, unknown> | null | undefined): number | null {
        if (!obj || typeof obj !== 'object') return null;
        const raw = obj['amount_refunded'] ?? obj['amount'];
        const value = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN;
        if (!Number.isInteger(value) || value < 0) return null;
        return value;
    }

    /**
     * R4: أرجل استرداد مسوّاة من التخصيص الأصلي الفعلي.
     *
     * المدخلات حقائق من ledger (لا إعادة حساب عمياء لكل refund):
     * - C0/F0: ما ناله المتنافس/المنصة في الالتقاط (أرجل debit الأصلية؛
     *   وعند غيابها — حالة حدّية — splitDonationCents بنفس النسبة).
     * - Cr/Fr: ما عُكس منهما سابقاً (أرجل credit على معاملات refund).
     * الهدف التراكمي للمتنافس بعد هذا الاسترداد = floor((cumAfter*C0)/T)
     * integer-exact (عقيدة 8.B) — فيكون رجل المتنافس = الهدف − Cr، ورجل
     * المنصة = الباقي. بالبرهان: الرجلان ≥ 0 وداخل المتبقي، والمجموع R،
     * وعند الاكتمال (cumAfter=T) المجموعان = C0/F0 بالضبط.
     */
    private async buildReconciledRefundEntries(
        db: D1Database,
        donation: { id: number; amountCents: number; recipientUserId: number | null },
        incremental: number
    ): Promise<Array<{ account: string; direction: 'debit' | 'credit'; amountCents: number }>> {
        const total = donation.amountCents;
        const recipientId = donation.recipientUserId as number;

        let originalNet = 0;
        let originalFee = 0;
        const captureEntries = await this.ledger.entriesForTx(`donation:capture:${donation.id}`);
        for (const row of captureEntries) {
            const amount = Number(row['amount_cents']);
            if (row['direction'] === 'debit' && row['account'] === `user:${recipientId}`) originalNet += amount;
            if (row['direction'] === 'debit' && row['account'] === PLATFORM_DONATION_ACCOUNT) originalFee += amount;
        }
        if (captureEntries.length === 0) {
            const pct = await this.settings.getPlatformSharePercentage();
            const split = splitDonationCents(total, pct);
            originalNet = split.netCents;
            originalFee = split.feeCents;
        }

        let reversedNet = 0;
        let reversedFee = 0;
        const prior = await db
            .prepare(
                `SELECT account, direction, COALESCE(SUM(amount_cents), 0) AS s FROM ledger_entries
                 WHERE ref_type = 'donation' AND ref_id = ? AND tx_id LIKE 'stripe:refund:%'
                 GROUP BY account, direction`
            )
            .bind(donation.id)
            .all<{ account: string; direction: string; s: number }>();
        for (const r of prior.results ?? []) {
            if (r.direction === 'credit' && r.account === `user:${recipientId}`) reversedNet += r.s;
            if (r.direction === 'credit' && r.account === PLATFORM_DONATION_ACCOUNT) reversedFee += r.s;
        }

        const cumAfter = reversedNet + reversedFee + incremental;
        const numerator = cumAfter * originalNet;
        const fairCumNet = total > 0 ? (numerator - (numerator % total)) / total : 0;
        let netLeg = fairCumNet - reversedNet;
        if (netLeg < 0) netLeg = 0;
        let feeLeg = incremental - netLeg;
        if (feeLeg < 0) {
            feeLeg = 0;
            netLeg = incremental;
        }

        const entries: Array<{ account: string; direction: 'debit' | 'credit'; amountCents: number }> = [
            { account: RESERVE_ACCOUNT, direction: 'debit', amountCents: incremental },
        ];
        if (feeLeg > 0) {
            entries.push({ account: PLATFORM_DONATION_ACCOUNT, direction: 'credit', amountCents: feeLeg });
        }
        if (netLeg > 0) {
            entries.push({ account: `user:${recipientId}`, direction: 'credit', amountCents: netLeg });
        }
        return entries;
    }
}

export default StripeWebhookService;
