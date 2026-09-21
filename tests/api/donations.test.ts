import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerService } from '../../src/lib/services/LedgerService';
import { DonationModel } from '../../src/models/DonationModel';
import { t } from '../../src/i18n';

/**
 * 8.E — التبرعات للمتنافسين (RED-FIRST).
 *
 * السياسة الموثقة (لا أرقام مخترعة):
 * - الحد الأدنى $1 (100 سنت): i18n payment_min_amount + فحص POST / + واجهة
 *   donate-page — ثلاثة مصادر متطابقة.
 * - لا حد أقصى على مستوى Dueli (قرار موثق — رفض البوابة الخارجي يُعالَج
 *   بأمان بلا قيود مالية).
 * - رسوم المنصة = platform_share_percentage (الافتراضي 20 — سياسة 8.B
 *   الموثقة، لا سياسة جديدة).
 *
 * الاختبارات الثمانية المطلوبة (عبر Hono الحقيقي + SqliteD1 بالترحيلات
 * الفعلية، بما فيها 0022):
 *  1. مبلغ صحيح ⇒ قيود مالية متوازنة (رسوم + صافي).
 *  2. أقل من الحد الأدنى ⇒ 400.
 *  3. بلا حد Dueli: مبلغ ضخم يُقبل إنشاؤه، ورفض المعالج ⇒ بلا قيود.
 *  4. المتبرع محظور من المتنافس ⇒ 403 (خادمياً).
 *  5. فشل الدفع ⇒ لا قيود مالية.
 *  6. تبرعان متزامنان صحيحان ⇒ كلاهما ينجح والثابت محفوظ.
 *  7. التبرع أثناء البث ⇒ حدث SSE صحيح على قناة المنافسة.
 *  8. refund ⇒ عكس مرآتي عبر المسار الموثوق وverifyInvariant() = 0.
 */

const WEBHOOK_SECRET = 'whsec_test_donations_8e';

function env(db: SqliteD1) {
    return { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as unknown as Parameters<typeof app.request>[2];
}

function headers(token?: string) {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'donations-8e-test',
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function sign(rawPayload: string, secret: string, ts: number): Promise<string> {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await crypto.subtle.sign('HMAC', key, enc.encode(`${ts}.${rawPayload}`));
    const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, '0')).join('');
    return `t=${ts},v1=${hex}`;
}

/** زرع ممثلين: متبرع (1) + متنافس (2) + جلساتهما. */
async function seedActors(db: SqliteD1): Promise<{ donorToken: string }> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active) VALUES
         (1, 'donor@8e.local', 'donor8e', 'x', 'Donor', 1),
         (2, 'comp@8e.local', 'comp8e', 'x', 'Competitor', 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-8e-donor', 1, datetime('now', '+1 day'))`
    ).run();
    return { donorToken: 'sess-8e-donor' };
}

/** زرع منافسة حية (لاختبار SSE أثناء البث). */
async function seedLiveCompetition(db: SqliteD1, id = 7): Promise<number> {
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'debate', 'مناظرة', 'Debate')`
    ).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status)
         VALUES (?, 'Live 8E', 'rules', 1, 2, 1, 'live')`
    ).bind(id).run();
    return id;
}

async function createDonation(
    db: SqliteD1,
    token: string | undefined,
    body: Record<string, unknown>
) {
    return app.request('/api/donations?lang=en', { method: 'POST', headers: headers(token), body: JSON.stringify(body) }, env(db));
}

function capturePayload(donationId: number, amountCents: number, eventId: string): string {
    return JSON.stringify({
        id: eventId,
        type: 'checkout.session.completed',
        data: {
            object: {
                id: 'cs_8e_1',
                client_reference_id: String(donationId),
                metadata: { donation_id: String(donationId) },
                amount_total: amountCents,
                amount_received: amountCents,
            },
        },
    });
}

function refundPayload(donationId: number, amountCents: number, eventId: string): string {
    return JSON.stringify({
        id: eventId,
        type: 'charge.refunded',
        data: {
            object: {
                id: 'ch_8e_1',
                client_reference_id: String(donationId),
                metadata: { donation_id: String(donationId) },
                amount_refunded: amountCents,
                amount: amountCents,
            },
        },
    });
}

function failedPayload(donationId: number, eventId: string): string {
    return JSON.stringify({
        id: eventId,
        type: 'payment_intent.payment_failed',
        data: {
            object: {
                id: 'pi_8e_1',
                client_reference_id: String(donationId),
                metadata: { donation_id: String(donationId) },
            },
        },
    });
}

async function postWebhook(db: SqliteD1, raw: string) {
    const sig = await sign(raw, WEBHOOK_SECRET, Math.floor(Date.now() / 1000));
    return app.request(
        '/api/donations/webhook',
        { method: 'POST', headers: { ...headers(), 'Stripe-Signature': sig }, body: raw },
        env(db)
    );
}

async function ledgerCount(db: SqliteD1): Promise<number> {
    return (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? -1;
}

describe('8.E competitor donations (RED-FIRST) — route-level via real Hono app', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    it('1. valid amount ⇒ balanced ledger entries (fee + net), invariant 0', async () => {
        const { donorToken } = await seedActors(db);

        const created = await createDonation(db, donorToken, {
            amount: 25,
            payment_method: 'stripe',
            competitor_id: 2,
            donor_name: 'Donor',
        });
        expect(created.status).toBe(200);
        const createdBody = (await created.json()) as { success: boolean; data: { donation_id: number } };
        const donationId = createdBody.data.donation_id;
        expect(donationId).toBeGreaterThan(0);

        const hook = await postWebhook(db, capturePayload(donationId, 25_00, 'evt_8e_cap_1'));
        expect(hook.status).toBe(200);
        expect(((await hook.json()) as { applied: boolean }).applied).toBe(true);

        // 3 قيود مميزة الحسابات (M4): رسوم (20%) + صافي (80%) + ساق البوابة
        // بالإجمالي — integer cents فقط، حركة واحدة في batch واحد (M2).
        const ledger = new LedgerService(db as unknown as D1Database);
        const entries = await ledger.entriesForTx('stripe:capture:evt_8e_cap_1');
        expect(entries).toHaveLength(3);
        const sum = (dir: string, account: string) =>
            entries.filter((e) => e['direction'] === dir && e['account'] === account)
                .reduce((a, e) => a + Number(e['amount_cents']), 0);
        expect(sum('debit', 'platform:revenue')).toBe(5_00);
        expect(sum('debit', 'user:2')).toBe(20_00);
        expect(sum('credit', 'reserve:gateway')).toBe(25_00);

        // الصافي وصل فعلاً لرصيد المتنافس في الدفتر (مصدر الحقيقة الوحيد).
        expect(await ledger.balance('user:2')).toBe(20_00);
        expect((await ledger.verifyInvariant()).difference).toBe(0);

        const model = new DonationModel(db as unknown as D1Database);
        expect((await model.findById(donationId))?.payment_status).toBe('completed');
    });

    it('2. below the $1 minimum ⇒ 400 with donations.min', async () => {
        const { donorToken } = await seedActors(db);

        const res = await createDonation(db, donorToken, {
            amount: 0.5,
            payment_method: 'stripe',
            competitor_id: 2,
        });
        expect(res.status).toBe(400);
        const body = (await res.json()) as { success: boolean; error: { message: string } };
        expect(body.error.message).toBe(t('donations.min', 'en'));

        // لا صف ولا مال.
        const row = await db.prepare('SELECT id FROM donations LIMIT 1').first<{ id: number }>();
        expect(row).toBeNull();
        expect(await ledgerCount(db)).toBe(0);
    });

    it('3. no Dueli maximum: huge amount passes creation; processor rejection ⇒ no ledger entries', async () => {
        const { donorToken } = await seedActors(db);

        // لا حد أقصى على مستوى Dueli — الإنشاء يمرّ لبوابة الدفع.
        const created = await createDonation(db, donorToken, {
            amount: 50000,
            payment_method: 'stripe',
            competitor_id: 2,
        });
        expect(created.status).toBe(200);
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;

        // رفض المعالج (فشل الدفع) ⇒ بلا أي قيود مالية إطلاقاً.
        const hook = await postWebhook(db, failedPayload(donationId, 'evt_8e_fail_3'));
        expect(hook.status).toBe(200);
        expect(((await hook.json()) as { applied: boolean }).applied).toBe(false);
        expect(await ledgerCount(db)).toBe(0);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
        const model = new DonationModel(db as unknown as D1Database);
        expect((await model.findById(donationId))?.payment_status).toBe('failed');

        // donations.max يصف غياب الحد — بلا أي رقم مخترع.
        const { ar } = await import('../../src/i18n/ar');
        const { en } = await import('../../src/i18n/en');
        for (const lang of [ar, en]) {
            expect((lang.donations as Record<string, string>).max).toBeTruthy();
            expect((lang.donations as Record<string, string>).max).not.toMatch(/\d/);
        }
    });

    it('4. donor blocked by the competitor ⇒ 403 server-side, no row, no money', async () => {
        const { donorToken } = await seedActors(db);
        // المتنافس (2) حظر المتبرع (1) — الاتجاه المطلوب في 3.A.
        await db.prepare(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (2, 1)`).run();

        const res = await createDonation(db, donorToken, {
            amount: 10,
            payment_method: 'stripe',
            competitor_id: 2,
        });
        expect(res.status).toBe(403);
        const body = (await res.json()) as { success: boolean; error: { message: string } };
        expect(body.error.message).toBe(t('donations.blocked', 'en'));

        const row = await db.prepare('SELECT id FROM donations LIMIT 1').first<{ id: number }>();
        expect(row).toBeNull();
        expect(await ledgerCount(db)).toBe(0);
    });

    it('4b. reverse direction (donor blocked the competitor) is NOT the 3.A case ⇒ allowed', async () => {
        const { donorToken } = await seedActors(db);
        await db.prepare(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (1, 2)`).run();

        const res = await createDonation(db, donorToken, {
            amount: 10,
            payment_method: 'stripe',
            competitor_id: 2,
        });
        expect(res.status).toBe(200);
    });

    it('5. payment failure ⇒ NO ledger entries at all', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, {
            amount: 12,
            payment_method: 'stripe',
            competitor_id: 2,
        });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;

        const hook = await postWebhook(db, failedPayload(donationId, 'evt_8e_fail_5'));
        expect(hook.status).toBe(200);
        expect(((await hook.json()) as { applied: boolean }).applied).toBe(false);

        expect(await ledgerCount(db)).toBe(0);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('6. two concurrent valid donations ⇒ both succeed, invariant holds', async () => {
        const { donorToken } = await seedActors(db);

        const [c1, c2] = await Promise.all([
            createDonation(db, donorToken, { amount: 10, payment_method: 'stripe', competitor_id: 2 }),
            createDonation(db, donorToken, { amount: 10, payment_method: 'stripe', competitor_id: 2 }),
        ]);
        expect(c1.status).toBe(200);
        expect(c2.status).toBe(200);
        const id1 = ((await c1.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;
        const id2 = ((await c2.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;
        expect(id1).not.toBe(id2);

        const [h1, h2] = await Promise.all([
            postWebhook(db, capturePayload(id1, 10_00, 'evt_8e_race_a')),
            postWebhook(db, capturePayload(id2, 10_00, 'evt_8e_race_b')),
        ]);
        expect(h1.status).toBe(200);
        expect(h2.status).toBe(200);
        expect(((await h1.json()) as { applied: boolean }).applied).toBe(true);
        expect(((await h2.json()) as { applied: boolean }).applied).toBe(true);

        // صافي المتنافس = 2 × 800 سنت، والثابت محفوظ.
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(16_00);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('7. live donation ⇒ correct SSE event on the existing competition channel', async () => {
        const { donorToken } = await seedActors(db);
        const competitionId = await seedLiveCompetition(db, 7);

        const created = await createDonation(db, donorToken, {
            amount: 25,
            payment_method: 'stripe',
            competitor_id: 2,
            competition_id: competitionId,
        });
        expect(created.status).toBe(200);
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;

        const hook = await postWebhook(db, capturePayload(donationId, 25_00, 'evt_8e_live_1'));
        expect(hook.status).toBe(200);
        expect(((await hook.json()) as { applied: boolean }).applied).toBe(true);

        // حدث واحد على قناة المنافسة عبر بنية SSE القائمة (لا نظام جديد).
        const rows = await db.prepare(
            `SELECT event_type, payload FROM sse_event_log WHERE channel = ?`
        ).bind(`competition:${competitionId}`).all<{ event_type: string; payload: string }>();
        expect(rows.results).toHaveLength(1);
        expect(rows.results[0].event_type).toBe('donation_new');
        const payload = JSON.parse(rows.results[0].payload) as Record<string, unknown>;
        expect(payload['donation_id']).toBe(donationId);
        expect(payload['competitor_id']).toBe(2);
        expect(payload['amount_cents']).toBe(25_00);
        expect(payload['net_cents']).toBe(20_00);
    });

    it('8. refund ⇒ mirror reversal via the trusted path, invariant 0', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, {
            amount: 40,
            payment_method: 'stripe',
            competitor_id: 2,
        });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;

        const cap = await postWebhook(db, capturePayload(donationId, 40_00, 'evt_8e_ref_cap'));
        expect(((await cap.json()) as { applied: boolean }).applied).toBe(true);

        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(32_00);

        const ref = await postWebhook(db, refundPayload(donationId, 40_00, 'evt_8e_ref_1'));
        expect(ref.status).toBe(200);
        expect(((await ref.json()) as { applied: boolean }).applied).toBe(true);

        // العكس المرآتي: 3 قيود تعيد الصافي والرسوم معاً — لا Ledger بديل.
        const refundEntries = await ledger.entriesForTx('stripe:refund:evt_8e_ref_1');
        expect(refundEntries).toHaveLength(3);
        expect(await ledger.balance('user:2')).toBe(0);
        expect(await ledger.balance('platform:revenue')).toBe(0);
        expect((await ledger.verifyInvariant()).difference).toBe(0);

        const model = new DonationModel(db as unknown as D1Database);
        expect((await model.findById(donationId))?.payment_status).toBe('refunded');
    });

    it('9. donations i18n keys exist in ar + en and differ', async () => {
        const { ar } = await import('../../src/i18n/ar');
        const { en } = await import('../../src/i18n/en');
        for (const k of ['send', 'thanks', 'min', 'max', 'blocked'] as const) {
            const a = (ar.donations as Record<string, string>)[k];
            const e = (en.donations as Record<string, string>)[k];
            expect(a).toBeTruthy();
            expect(e).toBeTruthy();
            expect(a).not.toBe(e);
        }
    });
});
