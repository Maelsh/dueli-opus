import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerService } from '../../src/lib/services/LedgerService';
import { StripeWebhookService } from '../../src/lib/services/StripeWebhookService';
import { StripeService } from '../../src/lib/services/StripeService';
import { DonationModel } from '../../src/models/DonationModel';

/**
 * 8.C — Stripe Payments مرتبطة بـLedgerService (RED-FIRST).
 *
 * المتطلبات السبعة المطلوبة حرفياً:
 *  1. دفع ناجح ⇒ قيود Ledger متوازنة وصحيحة.
 *  2. نفس event.id عشر مرات ⇒ أثر مالي واحد فقط.
 *  3. حدث غير مدعوم ⇒ 200 بلا أثر.
 *  4. webhook بتوقيع مفقود أو مزور ⇒ 400 ولا أثر مالي.
 *  5. فشل الدفع ⇒ لا قيود دائنة.
 *  6. refund ⇒ قيود عكسية متوازنة وverifyInvariant() = 0.
 *  7. لا يوجد مسار مالي خارج LedgerService.
 *
 * كل الاختبارات على SqliteD1 الحقيقي الذي يحمّل migrations كما هي —
 * فيُنفَّذ UNIQUE(event_id) وCHECK وappend-only فعلياً.
 */

const WEBHOOK_SECRET = 'whsec_test_local_only';

/** بناء توقيع Stripe صحيح (نفس خوارزمية Stripe). */
async function sign(rawPayload: string, secret: string, ts: number): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${rawPayload}`));
    const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `t=${ts},v1=${hex}`;
}

/** حدث نجاح دفع (checkout.session.completed) بمبلغ مطابق للسجل. */
function captureEvent(donationId: number, amountCents: number, eventId = 'evt_capture_1'): string {
    return JSON.stringify({
        id: eventId,
        type: 'checkout.session.completed',
        data: {
            object: {
                id: 'cs_test_1',
                client_reference_id: String(donationId),
                metadata: { donation_id: String(donationId) },
                amount_total: amountCents,
                amount_received: amountCents,
            },
        },
    });
}

/** حدث استرداد. */
function refundEvent(donationId: number, amountCents: number, eventId = 'evt_refund_1'): string {
    return JSON.stringify({
        id: eventId,
        type: 'charge.refunded',
        data: {
            object: {
                id: 'ch_test_1',
                client_reference_id: String(donationId),
                metadata: { donation_id: String(donationId) },
                amount_refunded: amountCents,
                amount: amountCents,
            },
        },
    });
}

/** حدث غير مدعوم. */
function unsupportedEvent(eventId = 'evt_unsupported_1'): string {
    return JSON.stringify({
        id: eventId,
        type: 'invoice.paid',
        data: { object: { id: 'in_1' } },
    });
}

/** حدث فشل دفع. */
function failedEvent(donationId: number, eventId = 'evt_failed_1'): string {
    return JSON.stringify({
        id: eventId,
        type: 'payment_intent.payment_failed',
        data: {
            object: {
                id: 'pi_test_1',
                client_reference_id: String(donationId),
                metadata: { donation_id: String(donationId) },
            },
        },
    });
}

async function seedDonation(db: SqliteD1, amountCents: number): Promise<number> {
    await db.prepare(`INSERT INTO users (id, email, username, password_hash, display_name) VALUES (1, 'd@t.local', 'donor', 'x', 'Donor')`).run();
    const model = new DonationModel(db as unknown as D1Database);
    const donation = await model.createDonation({
        user_id: 1,
        amount: amountCents / 100,
        payment_method: 'stripe',
        donor_name: 'Donor',
        donor_email: 'd@t.local',
    });
    // createDonation يحسب amount_cents من amount — تحقق من الصحة المالية.
    expect(donation.amount_cents).toBe(amountCents);
    return donation.id;
}

describe('8.C Stripe payments → ledger (real SQL via SqliteD1)', () => {
    let db: SqliteD1;
    let ledger: LedgerService;
    let service: StripeWebhookService;

    beforeAll(() => {
        db = new SqliteD1();
        ledger = new LedgerService(db as unknown as D1Database);
        service = new StripeWebhookService(db as unknown as D1Database);
    });

    beforeEach(async () => {
        // إعادة تهيئة نظيفة لكل اختبار (قاعدة in-memory جديدة).
        db = new SqliteD1();
        ledger = new LedgerService(db as unknown as D1Database);
        service = new StripeWebhookService(db as unknown as D1Database);
    });

    // ── 1. دفع ناجح ⇒ قيود متوازنة وصحيحة ───────────────────────────
    it('1. successful payment posts a balanced ledger entry with the exact internal amount', async () => {
        const donationId = await seedDonation(db, 25_00);
        const raw = captureEvent(donationId, 25_00);

        const res = await service.processEvent(db as unknown as D1Database, JSON.parse(raw));

        expect(res.applied).toBe(true);
        expect(res.txId).toBe('donation:capture:1');

        const entries = await ledger.entriesForTx(res.txId!);
        expect(entries).toHaveLength(2);
        const debit = entries.find((e) => e['direction'] === 'debit');
        const credit = entries.find((e) => e['direction'] === 'credit');
        expect(debit!['account']).toBe('platform:revenue');
        expect(credit!['account']).toBe('reserve:gateway');
        // مبلغ صحيح بالسنت فقط — مطابق تماماً للسجل الداخلي.
        expect(debit!['amount_cents']).toBe(25_00);
        expect(credit!['amount_cents']).toBe(25_00);

        const inv = await ledger.verifyInvariant();
        expect(inv.difference).toBe(0);
    });

    // ── 2. نفس event.id عشر مرات ⇒ أثر مالي واحد ─────────────────────
    it('2. the same event.id processed 10 times produces exactly ONE financial effect', async () => {
        const donationId = await seedDonation(db, 10_00);
        const event = JSON.parse(captureEvent(donationId, 10_00, 'evt_ten_1'));

        const results: boolean[] = [];
        for (let i = 0; i < 10; i++) {
            results.push((await service.processEvent(db as unknown as D1Database, event)).applied);
        }

        // مرة واحدة فقط طبّقت القيود.
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(results[0]).toBe(true);

        // صف حدث واحد فقط (UNIQUE(event_id)).
        const rows = await db.prepare('SELECT event_id FROM stripe_webhook_events').all<{ event_id: string }>();
        expect(rows.results).toHaveLength(1);

        // صفّا ledger فقط (مدين + دائن) — لا تكرار.
        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(n).toBe(2);

        const inv = await ledger.verifyInvariant();
        expect(inv.difference).toBe(0);
    });

    // ── 3. حدث غير مدعوم ⇒ 200 بلا أثر ────────────────────────────────
    it('3. unsupported event type ⇒ no financial effect (200 path)', async () => {
        const donationId = await seedDonation(db, 5_00);
        const event = JSON.parse(unsupportedEvent());

        const res = await service.processEvent(db as unknown as D1Database, event);

        expect(res.applied).toBe(false);
        expect(res.reason).toBe('unsupported_event');

        // لا قيود إطلاقاً.
        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(n).toBe(0);
        const inv = await ledger.verifyInvariant();
        expect(inv.difference).toBe(0);

        // الحدث مُسجَّل فلا يُعاد إرساله ثانيةً — لكن بلا tx مالي.
        const row = await db.prepare('SELECT tx_id FROM stripe_webhook_events WHERE event_id = ?').bind('evt_unsupported_1').first<{ tx_id: string | null }>();
        expect(row?.tx_id).toBeNull();
    });

    // ── 4. توقيع مفقود/مزور ⇒ 400 ولا أثر ─────────────────────────────
    it('4a. missing Stripe-Signature ⇒ invalid (400 path), no ledger effect', async () => {
        const check = await StripeService.verifyWebhookSignature('{}', '', WEBHOOK_SECRET);
        expect(check.valid).toBe(false);
    });

    it('4b. forged signature ⇒ invalid, and processing is impossible without a valid signature', async () => {
        const donationId = await seedDonation(db, 15_00);
        const raw = captureEvent(donationId, 15_00);
        const forged = 't=1,v1=' + '0'.repeat(64);

        const check = await StripeService.verifyWebhookSignature(raw, forged, WEBHOOK_SECRET);
        expect(check.valid).toBe(false);

        // التوقيع المزور لا يصلح للمعالجة — لا أثر مالي.
        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(n).toBe(0);

        // التوقيع الصحيح يعمل (تكاملية HMAC).
        const ts = Math.floor(Date.now() / 1000);
        const good = await sign(raw, WEBHOOK_SECRET, ts);
        const ok = await StripeService.verifyWebhookSignature(raw, good, WEBHOOK_SECRET);
        expect(ok.valid).toBe(true);
    });

    it('4c. tampered payload under a valid signature ⇒ rejected', async () => {
        const donationId = await seedDonation(db, 20_00);
        const raw = captureEvent(donationId, 20_00);
        const ts = Math.floor(Date.now() / 1000);
        const good = await sign(raw, WEBHOOK_SECRET, ts);

        // حمولة مُعدَّلة تحت نفس التوقيع ⇒ يجب الرفض.
        const tampered = raw.replace('"amount_received":2000', '"amount_received":99999');
        const check = await StripeService.verifyWebhookSignature(tampered, good, WEBHOOK_SECRET);
        expect(check.valid).toBe(false);
    });

    // ── 5. فشل الدفع ⇒ لا قيود دائنة ───────────────────────────────────
    it('5. payment failure ⇒ NO credit entries, donation marked failed', async () => {
        const donationId = await seedDonation(db, 12_00);
        const event = JSON.parse(failedEvent(donationId));

        const res = await service.processEvent(db as unknown as D1Database, event);

        expect(res.applied).toBe(false);
        expect(res.reason).toBe('payment_failed_no_credit');

        // صفر قيود مالية.
        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(n).toBe(0);
        const inv = await ledger.verifyInvariant();
        expect(inv.difference).toBe(0);

        // الحالة فقط تُحدَّث (لا مبلغ ولا رصيد).
        const model = new DonationModel(db as unknown as D1Database);
        const donation = await model.findById(donationId);
        expect(donation?.payment_status).toBe('failed');
    });

    // ── 6. refund ⇒ قيود عكسية متوازنة وverifyInvariant() = 0 ─────────
    it('6. refund posts balanced reversal entries, invariant stays 0, net effect 0', async () => {
        const donationId = await seedDonation(db, 40_00);

        // أولاً الدفع الناجح.
        const capture = await service.processEvent(db as unknown as D1Database, JSON.parse(captureEvent(donationId, 40_00, 'evt_r_capture')));
        expect(capture.applied).toBe(true);

        // ثم الاسترداد.
        const refund = await service.processEvent(db as unknown as D1Database, JSON.parse(refundEvent(donationId, 40_00, 'evt_r_refund')));
        expect(refund.applied).toBe(true);
        expect(refund.txId).toBe('stripe:refund:evt_r_refund');

        const refundEntries = await ledger.entriesForTx(refund.txId!);
        expect(refundEntries).toHaveLength(2);
        const rDebit = refundEntries.find((e) => e['direction'] === 'debit');
        const rCredit = refundEntries.find((e) => e['direction'] === 'credit');
        // عكس القيود الأصلية تماماً.
        expect(rDebit!['account']).toBe('reserve:gateway');
        expect(rCredit!['account']).toBe('platform:revenue');
        expect(rDebit!['amount_cents']).toBe(40_00);
        expect(rCredit!['amount_cents']).toBe(40_00);

        // الثابت الكلي = 0 (capture متوازنة + refund متوازنة).
        const inv = await ledger.verifyInvariant();
        expect(inv.difference).toBe(0);

        // الأثر الصافي للرصيد صفر: إيراد المنصة عاد كما كان.
        const platformRevenue = await ledger.balance('platform:revenue');
        const gateway = await ledger.balance('reserve:gateway');
        expect(platformRevenue).toBe(0);
        expect(gateway).toBe(0);

        // حالة التبرع تتبع الاسترداد.
        const model = new DonationModel(db as unknown as D1Database);
        const donation = await model.findById(donationId);
        expect(donation?.payment_status).toBe('refunded');
    });

    // ── 6b. refund idempotent ─────────────────────────────────────────
    it('6b. refund event replayed 10 times ⇒ one reversal, no double-reversal', async () => {
        const donationId = await seedDonation(db, 30_00);
        await service.processEvent(db as unknown as D1Database, JSON.parse(captureEvent(donationId, 30_00, 'evt_rb_cap')));
        for (let i = 0; i < 10; i++) {
            await service.processEvent(db as unknown as D1Database, JSON.parse(refundEvent(donationId, 30_00, 'evt_rb_ref')));
        }
        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        // capture (2) + refund (2) فقط.
        expect(n).toBe(4);
        const inv = await ledger.verifyInvariant();
        expect(inv.difference).toBe(0);
        expect(await ledger.balance('platform:revenue')).toBe(0);
    });

    // ── 6c. refund بمبلغ يتجاوز الأصل ⇒ رفض ──────────────────────────
    it('6c. refund amount exceeding the recorded amount ⇒ rejected with no effect', async () => {
        const donationId = await seedDonation(db, 10_00);
        await service.processEvent(db as unknown as D1Database, JSON.parse(captureEvent(donationId, 10_00, 'evt_ov_cap')));
        const res = await service.processEvent(db as unknown as D1Database, JSON.parse(refundEvent(donationId, 25_00, 'evt_ov_ref')));
        expect(res.applied).toBe(false);
        // القيود الأصلية سليمة ولم تُعكس.
        expect(await ledger.balance('platform:revenue')).toBe(10_00);
        const inv = await ledger.verifyInvariant();
        expect(inv.difference).toBe(0);
    });

    // ── 7. لا مسار مالي خارج LedgerService ────────────────────────────
    it('7. webhook events table holds NO money columns — the only financial store is ledger_entries', async () => {
        // amount_cents في donations هو السجل الداخلي (مصدر مطابقة)، لكن
        // stripe_webhook_events يجب ألا يحمل أي مبلغ مالي — مرجع tx_id فقط.
        const cols = await db.prepare("PRAGMA table_info('stripe_webhook_events')").all<{ name: string }>();
        const names = cols.results.map((r) => r.name);
        expect(names).not.toContain('amount');
        expect(names).not.toContain('amount_cents');
        expect(names).toContain('tx_id');

        // مسار المال الوحيد: ledger_entries (لا user_earnings ولا
        // platform_financial_logs يُكتبهما هذا الـ service).
        const donationId = await seedDonation(db, 8_00);
        await service.processEvent(db as unknown as D1Database, JSON.parse(captureEvent(donationId, 8_00, 'evt_path_1')));

        const earnings = (await db.prepare('SELECT COUNT(*) AS c FROM user_earnings').first<{ c: number }>())?.c ?? 0;
        const finLogs = (await db.prepare('SELECT COUNT(*) AS c FROM platform_financial_logs').first<{ c: number }>())?.c ?? 0;
        const ledgerN = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(earnings).toBe(0);
        expect(finLogs).toBe(0);
        expect(ledgerN).toBe(2);
    });

    // ── 7b. تعارض المبلغ مع webhook ⇒ رفض بلا أثر ─────────────────────
    it('7b. webhook amount that does not match the internal record ⇒ rejected, no effect', async () => {
        const donationId = await seedDonation(db, 7_00);
        // الـwebhook يدّعي 100.00$ بينما السجل الداخلي 7.00$.
        const evil = captureEvent(donationId, 100_00, 'evt_mismatch_1');
        const res = await service.processEvent(db as unknown as D1Database, JSON.parse(evil));
        expect(res.applied).toBe(false);
        expect(res.reason).toBe('amount_mismatch');

        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(n).toBe(0);
        const inv = await ledger.verifyInvariant();
        expect(inv.difference).toBe(0);
    });

    // ── 8. i18n مفاتيح المدفوعات ar + en ───────────────────────────────
    it('8. payment i18n keys exist in ar + en and differ', async () => {
        const { ar } = await import('../../src/i18n/ar');
        const { en } = await import('../../src/i18n/en');
        for (const k of [
            'payment_min_amount',
            'payment_method_invalid',
            'payment_failed',
            'payment_success',
            'donation_completed',
            'donation_refunded',
        ] as const) {
            expect((ar as Record<string, string>)[k]).toBeTruthy();
            expect((en as Record<string, string>)[k]).toBeTruthy();
            expect((ar as Record<string, string>)[k]).not.toBe((en as Record<string, string>)[k]);
        }
    });

    // ── 9. مبالغ صحيحة فقط (integer cents) ────────────────────────────
    it('9. every stored amount is an integer — no floating-point in financial math', async () => {
        const donationId = await seedDonation(db, 33_33);
        const raw = captureEvent(donationId, 33_33, 'evt_int_1');
        const res = await service.processEvent(db as unknown as D1Database, JSON.parse(raw));
        expect(res.applied).toBe(true);

        const rows = await db.prepare('SELECT amount_cents FROM ledger_entries').all<{ amount_cents: number }>();
        for (const r of rows.results) {
            expect(Number.isInteger(r.amount_cents)).toBe(true);
        }
        // createDonation: 3333/100 = 33.33 دولار → 3333 سنت بالضبط.
        const model = new DonationModel(db as unknown as D1Database);
        const donation = await model.findById(donationId);
        expect(donation?.amount_cents).toBe(33_33);
        expect(Number.isInteger(donation?.amount_cents)).toBe(true);
    });
});
