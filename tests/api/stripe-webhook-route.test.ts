import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerService } from '../../src/lib/services/LedgerService';
import { DonationModel } from '../../src/models/DonationModel';
import { Donation } from '../../src/models/DonationModel';

/**
 * 8.C — اختبارات على مستوى المسار (route-level) عبر تطبيق Hono الحقيقي.
 *
 * مطلب #4 بالنص: «webhook بتوقيع مفقود أو مزور ⇒ 400 ولا أثر مالي».
 * هنا نُثبت رمز الحالة الفعلي (400) وليس مجرد نتيجة دالة التحقق.
 * كذلك نُثبت 200 للأحداث غير المدعومة بلا أثر، ونجاح الدفع من البداية للنهاية.
 */

const WEBHOOK_SECRET = 'whsec_test_local_only_route';

async function sign(rawPayload: string, secret: string, ts: number): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${rawPayload}`));
    const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `t=${ts},v1=${hex}`;
}

function env(db: SqliteD1, secret = WEBHOOK_SECRET) {
    return { DB: db, STRIPE_WEBHOOK_SECRET: secret } as unknown as Parameters<typeof app.request>[2];
}

function webhookHeaders(sig: string | undefined) {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        // CSRF: تقديم إثبات نية same-origin (مثل بقية اختبارات المسارات).
        'X-CSRF-Token': 'route-test',
    };
    if (sig !== undefined) h['Stripe-Signature'] = sig;
    return h;
}

async function postWebhook(db: SqliteD1, raw: string, sig: string | undefined, secret = WEBHOOK_SECRET) {
    return app.request(
        '/api/donations/webhook',
        { method: 'POST', headers: webhookHeaders(sig), body: raw },
        env(db, secret)
    );
}

async function seed(db: SqliteD1, cents: number): Promise<Donation> {
    await db.prepare(`INSERT INTO users (id, email, username, password_hash, display_name) VALUES (1, 'r@t.local', 'rdonor', 'x', 'R')`).run();
    const model = new DonationModel(db as unknown as D1Database);
    return model.createDonation({
        user_id: 1,
        amount: cents / 100,
        payment_method: 'stripe',
        donor_name: 'R',
        donor_email: 'r@t.local',
    });
}

describe('8.C POST /api/donations/webhook — route-level status codes', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    it('4a. missing Stripe-Signature header ⇒ 400, no ledger effect', async () => {
        const donation = await seed(db, 10_00);
        const raw = JSON.stringify({
            id: 'evt_route_missing',
            type: 'checkout.session.completed',
            data: { object: { client_reference_id: String(donation.id), metadata: { donation_id: String(donation.id) }, amount_total: 10_00, amount_received: 10_00 } },
        });

        const res = await postWebhook(db, raw, undefined);
        expect(res.status).toBe(400);

        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(n).toBe(0);
    });

    it('4b. forged signature ⇒ 400, no ledger effect', async () => {
        const donation = await seed(db, 10_00);
        const raw = JSON.stringify({
            id: 'evt_route_forged',
            type: 'checkout.session.completed',
            data: { object: { client_reference_id: String(donation.id), metadata: { donation_id: String(donation.id) }, amount_total: 10_00, amount_received: 10_00 } },
        });
        const forged = `t=${Math.floor(Date.now() / 1000)},v1=${'a'.repeat(64)}`;

        const res = await postWebhook(db, raw, forged);
        expect(res.status).toBe(400);

        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(n).toBe(0);
    });

    it('4c. secret not configured ⇒ 503 (not a silent 200)', async () => {
        const res = await postWebhook(db, '{}', 't=1,v1=x', '');
        expect(res.status).toBe(503);
    });

    it('3. unsupported event type with valid signature ⇒ 200, no financial effect', async () => {
        const raw = JSON.stringify({ id: 'evt_route_unsup', type: 'invoice.paid', data: { object: { id: 'in_1' } } });
        const ts = Math.floor(Date.now() / 1000);
        const sig = await sign(raw, WEBHOOK_SECRET, ts);

        const res = await postWebhook(db, raw, sig);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { received: boolean; applied: boolean };
        expect(body.received).toBe(true);
        expect(body.applied).toBe(false);

        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(n).toBe(0);
    });

    it('1+2. valid successful payment ⇒ 200, balanced ledger; replay ⇒ single effect', async () => {
        const donation = await seed(db, 20_00);
        const raw = JSON.stringify({
            id: 'evt_route_capture',
            type: 'checkout.session.completed',
            data: { object: { client_reference_id: String(donation.id), metadata: { donation_id: String(donation.id) }, amount_total: 20_00, amount_received: 20_00 } },
        });
        const sig = await sign(raw, WEBHOOK_SECRET, Math.floor(Date.now() / 1000));

        const first = await postWebhook(db, raw, sig);
        expect(first.status).toBe(200);
        const firstBody = (await first.json()) as { received: boolean; applied: boolean };
        expect(firstBody.applied).toBe(true);

        // إعادة الإرسال 9 مرات إضافية ⇒ أثر واحد.
        for (let i = 0; i < 9; i++) {
            const again = await postWebhook(db, raw, sig);
            expect(again.status).toBe(200);
        }

        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(n).toBe(2);

        const ledger = new LedgerService(db as unknown as D1Database);
        const inv = await ledger.verifyInvariant();
        expect(inv.difference).toBe(0);

        const model = new DonationModel(db as unknown as D1Database);
        const after = await model.findById(donation.id);
        expect(after?.payment_status).toBe('completed');
    });

    it('5. payment failure ⇒ 200, NO credit entries', async () => {
        const donation = await seed(db, 13_00);
        const raw = JSON.stringify({
            id: 'evt_route_fail',
            type: 'payment_intent.payment_failed',
            data: { object: { client_reference_id: String(donation.id), metadata: { donation_id: String(donation.id) } } },
        });
        const sig = await sign(raw, WEBHOOK_SECRET, Math.floor(Date.now() / 1000));

        const res = await postWebhook(db, raw, sig);
        expect(res.status).toBe(200);

        const n = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(n).toBe(0);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);

        const model = new DonationModel(db as unknown as D1Database);
        const after = await model.findById(donation.id);
        expect(after?.payment_status).toBe('failed');
    });

    it('6. refund ⇒ 200 but rejected (non-refundable policy), capture intact, still completed', async () => {
        const donation = await seed(db, 50_00);
        const capture = JSON.stringify({
            id: 'evt_route_cap2',
            type: 'checkout.session.completed',
            data: { object: { client_reference_id: String(donation.id), metadata: { donation_id: String(donation.id) }, amount_total: 50_00, amount_received: 50_00 } },
        });
        const refund = JSON.stringify({
            id: 'evt_route_ref2',
            type: 'charge.refunded',
            data: { object: { client_reference_id: String(donation.id), metadata: { donation_id: String(donation.id) }, amount_refunded: 50_00, amount: 50_00 } },
        });

        await postWebhook(db, capture, await sign(capture, WEBHOOK_SECRET, Math.floor(Date.now() / 1000)));
        const res = await postWebhook(db, refund, await sign(refund, WEBHOOK_SECRET, Math.floor(Date.now() / 1000)));
        expect(res.status).toBe(200);
        expect(((await res.json()) as { applied: boolean }).applied).toBe(false);

        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
        expect(await ledger.balance('platform:revenue')).toBe(50_00);
        expect(await ledger.balance('reserve:gateway')).toBe(-50_00);

        const model = new DonationModel(db as unknown as D1Database);
        const after = await model.findById(donation.id);
        expect(after?.payment_status).toBe('completed');
    });
});
