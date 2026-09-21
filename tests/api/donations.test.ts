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
        const entries = await ledger.entriesForTx(`donation:capture:${donationId}`);
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

    it('8b. partial refund of a competitor donation ⇒ split reversal on the refund amount', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, {
            amount: 100,
            payment_method: 'stripe',
            competitor_id: 2,
        });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;

        const cap = await postWebhook(db, capturePayload(donationId, 100_00, 'evt_8e_pcap'));
        expect(((await cap.json()) as { applied: boolean }).applied).toBe(true);

        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(80_00);
        expect(await ledger.balance('platform:revenue')).toBe(20_00);

        // استرداد جزئي 2500 سنت ⇒ رسوم 500 + صافي 2000 (نفس سياسة التقسيم).
        const ref = await postWebhook(db, refundPayload(donationId, 25_00, 'evt_8e_prefund_1'));
        expect(ref.status).toBe(200);
        expect(((await ref.json()) as { applied: boolean }).applied).toBe(true);

        const refundEntries = await ledger.entriesForTx('stripe:refund:evt_8e_prefund_1');
        expect(refundEntries).toHaveLength(3);
        const sum = (dir: string, account: string) =>
            refundEntries.filter((e) => e['direction'] === dir && e['account'] === account)
                .reduce((a, e) => a + Number(e['amount_cents']), 0);
        expect(sum('debit', 'reserve:gateway')).toBe(25_00);
        expect(sum('credit', 'platform:revenue')).toBe(5_00);
        expect(sum('credit', 'user:2')).toBe(20_00);

        // لا جزء مسترد بقي منسوباً للمتنافس: رصيده انخفض بالصافي المسترد.
        expect(await ledger.balance('user:2')).toBe(60_00);
        expect(await ledger.balance('platform:revenue')).toBe(15_00);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('8c. repeated partial refund webhook ⇒ exactly one financial effect', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, {
            amount: 100,
            payment_method: 'stripe',
            competitor_id: 2,
        });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;

        const cap = await postWebhook(db, capturePayload(donationId, 100_00, 'evt_8e_pcap_dup'));
        expect(((await cap.json()) as { applied: boolean }).applied).toBe(true);

        const raw = refundPayload(donationId, 25_00, 'evt_8e_prefund_dup');
        const results: boolean[] = [];
        for (let i = 0; i < 3; i++) {
            const res = await postWebhook(db, raw);
            expect(res.status).toBe(200);
            results.push(((await res.json()) as { applied: boolean }).applied);
        }
        // مرة واحدة فقط طبّقت الأثر المالي.
        expect(results.filter(Boolean)).toHaveLength(1);

        const ledger = new LedgerService(db as unknown as D1Database);
        const refundEntries = await ledger.entriesForTx('stripe:refund:evt_8e_prefund_dup');
        expect(refundEntries).toHaveLength(3);
        expect(await ledger.balance('user:2')).toBe(60_00);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
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

/**
 * 8.E — تصحيحات REMOTE الخمسة (RED-FIRST: تفشل قبل الإصلاح وتنجح بعده).
 *
 * R1. نوعا capture مختلفان لنفس التبرع ⇒ أثر مالي واحد (donation-level guard).
 * R2. حمولة charge.refunded الحقيقية: amount=الأصل وamount_refunded=التراكمي
 *     ⇒ يُعكَس الفرق الجديد فقط.
 * R3. مجموع partial refunds لا يتجاوز الأصل أبداً (حجز ذري + رفض الزائد).
 * R4. تسوية التقريب: مجموع العكسيات = التخصيص الأصلي بالضبط عند الاكتمال.
 * R5. سياق المنافسة: live + المستلم أحد المتنافسَين وإلا رفض بلا أي أثر.
 */

function capturePayloadTyped(donationId: number, amountCents: number, eventId: string, type: string): string {
    return JSON.stringify({
        id: eventId,
        type,
        data: {
            object: {
                id: type.startsWith('payment_intent') ? 'pi_8e_x' : 'cs_8e_x',
                client_reference_id: String(donationId),
                metadata: { donation_id: String(donationId) },
                amount_total: amountCents,
                amount_received: amountCents,
            },
        },
    });
}

/** حمولة charge.refunded بأسلوب Stripe الحقيقي: amount=الأصل، amount_refunded=التراكمي. */
function stripeRefundPayload(donationId: number, originalCents: number, cumulativeRefunded: number, eventId: string): string {
    return JSON.stringify({
        id: eventId,
        type: 'charge.refunded',
        data: {
            object: {
                id: 'ch_8e_real',
                client_reference_id: String(donationId),
                metadata: { donation_id: String(donationId) },
                amount: originalCents,
                amount_refunded: cumulativeRefunded,
            },
        },
    });
}

/** مجموع ما عُكس لهذا التبرع عبر مسار refund (من ledger — مصدر الحقيقة). */
async function refundedSums(db: SqliteD1, donationId: number): Promise<{ total: number; comp: number; plat: number }> {
    const rows = await db.prepare(
        `SELECT account, direction, COALESCE(SUM(amount_cents), 0) AS s FROM ledger_entries
         WHERE ref_type = 'donation' AND ref_id = ? AND tx_id LIKE 'stripe:refund:%'
         GROUP BY account, direction`
    ).bind(donationId).all<{ account: string; direction: string; s: number }>();
    let comp = 0;
    let plat = 0;
    for (const r of rows.results ?? []) {
        if (r.direction === 'credit' && r.account.startsWith('user:')) comp += r.s;
        if (r.direction === 'credit' && r.account === 'platform:revenue') plat += r.s;
    }
    return { total: comp + plat, comp, plat };
}

async function captureCount(db: SqliteD1): Promise<number> {
    return (await db.prepare(`SELECT COUNT(*) AS c FROM ledger_entries WHERE tx_id LIKE '%:capture:%'`).first<{ c: number }>())?.c ?? -1;
}

async function seedTrio(db: SqliteD1): Promise<{ donorToken: string }> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active) VALUES
         (1, 'donor@8e.local', 'donor8e', 'x', 'Donor', 1),
         (2, 'comp@8e.local', 'comp8e', 'x', 'Competitor', 1),
         (3, 'out@8e.local', 'outsider8e', 'x', 'Outsider', 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-8e-donor', 1, datetime('now', '+1 day'))`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'debate', 'مناظرة', 'Debate')`
    ).run();
    return { donorToken: 'sess-8e-donor' };
}

async function seedCompetition(db: SqliteD1, id: number, status: string, creator: number, opponent: number | null): Promise<void> {
    await db.prepare(
        `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status)
         VALUES (?, 'Ctx 8E', 'rules', 1, ?, ?, ?)`
    ).bind(id, creator, opponent, status).run();
}

describe('8.E REMOTE corrections — five findings (RED-FIRST)', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    // ── R1: منع Double Capture ──────────────────────────────────────
    it('R1a. payment_intent.succeeded then checkout.session.completed ⇒ one effect', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, { amount: 25, payment_method: 'stripe', competitor_id: 2 });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;

        const h1 = await postWebhook(db, capturePayloadTyped(donationId, 25_00, 'evt_r1_pi', 'payment_intent.succeeded'));
        const h2 = await postWebhook(db, capturePayloadTyped(donationId, 25_00, 'evt_r1_cs', 'checkout.session.completed'));
        const applied = [((await h1.json()) as { applied: boolean }).applied, ((await h2.json()) as { applied: boolean }).applied];
        expect(applied.filter(Boolean)).toHaveLength(1);

        expect(await captureCount(db)).toBe(3);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(20_00);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
        const model = new DonationModel(db as unknown as D1Database);
        expect((await model.findById(donationId))?.payment_status).toBe('completed');
    });

    it('R1b. reverse order ⇒ one effect', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, { amount: 25, payment_method: 'stripe', competitor_id: 2 });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;

        const h1 = await postWebhook(db, capturePayloadTyped(donationId, 25_00, 'evt_r1b_cs', 'checkout.session.completed'));
        const h2 = await postWebhook(db, capturePayloadTyped(donationId, 25_00, 'evt_r1b_pi', 'payment_intent.succeeded'));
        const applied = [((await h1.json()) as { applied: boolean }).applied, ((await h2.json()) as { applied: boolean }).applied];
        expect(applied.filter(Boolean)).toHaveLength(1);

        expect(await captureCount(db)).toBe(3);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('R1c. concurrent dual-type captures ⇒ one effect', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, { amount: 25, payment_method: 'stripe', competitor_id: 2 });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;

        const [h1, h2] = await Promise.all([
            postWebhook(db, capturePayloadTyped(donationId, 25_00, 'evt_r1c_pi', 'payment_intent.succeeded')),
            postWebhook(db, capturePayloadTyped(donationId, 25_00, 'evt_r1c_cs', 'checkout.session.completed')),
        ]);
        const applied = [((await h1.json()) as { applied: boolean }).applied, ((await h2.json()) as { applied: boolean }).applied];
        expect(applied.filter(Boolean)).toHaveLength(1);

        expect(await captureCount(db)).toBe(3);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(20_00);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('R1d. same event id repeated ⇒ one effect (existing guard preserved)', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, { amount: 25, payment_method: 'stripe', competitor_id: 2 });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;

        const raw = capturePayloadTyped(donationId, 25_00, 'evt_r1d_same', 'checkout.session.completed');
        const results: boolean[] = [];
        for (let i = 0; i < 3; i++) {
            const res = await postWebhook(db, raw);
            results.push(((await res.json()) as { applied: boolean }).applied);
        }
        expect(results.filter(Boolean)).toHaveLength(1);
        expect(await captureCount(db)).toBe(3);
    });

    // ── R2: حمولة الاسترداد الجزئي الحقيقية ──────────────────────────
    it('R2a. amount=10000 + amount_refunded=2500 ⇒ refund 2500 only', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, { amount: 100, payment_method: 'stripe', competitor_id: 2 });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;
        await postWebhook(db, capturePayload(donationId, 100_00, 'evt_r2_cap'));

        const ref = await postWebhook(db, stripeRefundPayload(donationId, 100_00, 25_00, 'evt_r2_ref1'));
        expect(ref.status).toBe(200);
        expect(((await ref.json()) as { applied: boolean }).applied).toBe(true);

        const sums = await refundedSums(db, donationId);
        expect(sums.total).toBe(25_00);
        expect(sums.comp).toBe(20_00);
        expect(sums.plat).toBe(5_00);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('R2b. cumulative 6000 after 2500 ⇒ only the new 3500 delta', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, { amount: 100, payment_method: 'stripe', competitor_id: 2 });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;
        await postWebhook(db, capturePayload(donationId, 100_00, 'evt_r2b_cap'));
        await postWebhook(db, stripeRefundPayload(donationId, 100_00, 25_00, 'evt_r2b_ref1'));

        const ref2 = await postWebhook(db, stripeRefundPayload(donationId, 100_00, 60_00, 'evt_r2b_ref2'));
        expect(((await ref2.json()) as { applied: boolean }).applied).toBe(true);

        const sums = await refundedSums(db, donationId);
        expect(sums.total).toBe(60_00);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(80_00 - sums.comp);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('R2c. resending the same refund event ⇒ no extra effect', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, { amount: 100, payment_method: 'stripe', competitor_id: 2 });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;
        await postWebhook(db, capturePayload(donationId, 100_00, 'evt_r2c_cap'));

        const raw = stripeRefundPayload(donationId, 100_00, 25_00, 'evt_r2c_ref');
        const results: boolean[] = [];
        for (let i = 0; i < 3; i++) {
            const res = await postWebhook(db, raw);
            results.push(((await res.json()) as { applied: boolean }).applied);
        }
        expect(results.filter(Boolean)).toHaveLength(1);
        expect((await refundedSums(db, donationId)).total).toBe(25_00);
    });

    // ── R3: منع Cumulative Over-Refund ───────────────────────────────
    it('R3a. 100 ⇒ 60 ok, then 40 ok, then anything extra refused', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, { amount: 100, payment_method: 'stripe', competitor_id: 2 });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;
        await postWebhook(db, capturePayload(donationId, 100_00, 'evt_r3_cap'));

        const r1 = await postWebhook(db, stripeRefundPayload(donationId, 100_00, 60_00, 'evt_r3_ref1'));
        expect(((await r1.json()) as { applied: boolean }).applied).toBe(true);
        const r2 = await postWebhook(db, stripeRefundPayload(donationId, 100_00, 100_00, 'evt_r3_ref2'));
        expect(((await r2.json()) as { applied: boolean }).applied).toBe(true);

        // أي استرداد إضافي (تراكمي فوق الأصل) ⇒ رفض بلا أثر.
        const r3 = await postWebhook(db, stripeRefundPayload(donationId, 100_00, 100_00, 'evt_r3_ref3_dup'));
        expect(((await r3.json()) as { applied: boolean }).applied).toBe(false);
        const r4 = await postWebhook(db, refundPayload(donationId, 1_00, 'evt_r3_ref4_extra'));
        expect(((await r4.json()) as { applied: boolean }).applied).toBe(false);

        const sums = await refundedSums(db, donationId);
        expect(sums.total).toBe(100_00);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(0);
        expect(await ledger.balance('platform:revenue')).toBe(0);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('R3b. concurrent 60+60 ⇒ overspend impossible, balances never negative', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, { amount: 100, payment_method: 'stripe', competitor_id: 2 });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;
        await postWebhook(db, capturePayload(donationId, 100_00, 'evt_r3b_cap'));

        const [h1, h2] = await Promise.all([
            postWebhook(db, stripeRefundPayload(donationId, 100_00, 60_00, 'evt_r3b_a')),
            postWebhook(db, stripeRefundPayload(donationId, 100_00, 100_00, 'evt_r3b_b')),
        ]);
        const applied = [((await h1.json()) as { applied: boolean }).applied, ((await h2.json()) as { applied: boolean }).applied];
        // الفائز الأول يستهلك حصته؛ الثاني إما فرق مشروع أو مرفوض — لكن
        // المجموع لا يتجاوز الأصل أبداً.
        const sums = await refundedSums(db, donationId);
        expect(sums.total).toBeLessThanOrEqual(100_00);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBeGreaterThanOrEqual(0);
        expect(await ledger.balance('platform:revenue')).toBeGreaterThanOrEqual(0);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
        expect(applied.filter(Boolean).length).toBeGreaterThanOrEqual(1);
    });

    it('R3c. 10 race rounds ⇒ never exceeds the original total', async () => {
        const { donorToken } = await seedActors(db);
        for (let round = 0; round < 10; round++) {
            const created = await createDonation(db, donorToken, { amount: 100, payment_method: 'stripe', competitor_id: 2 });
            const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;
            await postWebhook(db, capturePayload(donationId, 100_00, `evt_r3c_cap_${round}`));
            await Promise.all([
                postWebhook(db, stripeRefundPayload(donationId, 100_00, 60_00, `evt_r3c_a_${round}`)),
                postWebhook(db, stripeRefundPayload(donationId, 100_00, 100_00, `evt_r3c_b_${round}`)),
            ]);
            const sums = await refundedSums(db, donationId);
            expect(sums.total).toBeLessThanOrEqual(100_00);
        }
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    // ── R4: تسوية التقريب عبر استردادات متعددة ───────────────────────
    it('R4a. three partials to exactly full ⇒ original allocation restored', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, { amount: 100, payment_method: 'stripe', competitor_id: 2 });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;
        await postWebhook(db, capturePayload(donationId, 100_00, 'evt_r4_cap'));

        await postWebhook(db, stripeRefundPayload(donationId, 100_00, 33_33, 'evt_r4_r1'));
        await postWebhook(db, stripeRefundPayload(donationId, 100_00, 66_66, 'evt_r4_r2'));
        await postWebhook(db, stripeRefundPayload(donationId, 100_00, 100_00, 'evt_r4_r3'));

        // الأصل: صافي 8000 + رسوم 2000 — يجب استعادتهما بالسنت.
        const sums = await refundedSums(db, donationId);
        expect(sums.total).toBe(100_00);
        expect(sums.comp).toBe(80_00);
        expect(sums.plat).toBe(20_00);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('R4b. many tiny refunds ⇒ exact reconciliation, no created/lost cents', async () => {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, { amount: 10, payment_method: 'stripe', competitor_id: 2 });
        const donationId = ((await created.json()) as { success: boolean; data: { donation_id: number } }).data.donation_id;
        await postWebhook(db, capturePayload(donationId, 10_00, 'evt_r4b_cap'));

        // 10 استردادات صغيرة (100 سنت each تراكمياً) — الأصل صافي 800/رسوم 200.
        for (let i = 1; i <= 10; i++) {
            const res = await postWebhook(db, stripeRefundPayload(donationId, 10_00, i * 100, `evt_r4b_r${i}`));
            expect(((await res.json()) as { applied: boolean }).applied).toBe(true);
        }
        const sums = await refundedSums(db, donationId);
        expect(sums.total).toBe(10_00);
        expect(sums.comp).toBe(8_00);
        expect(sums.plat).toBe(2_00);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    // ── R5: سياق المنافسة ───────────────────────────────────────────
    it('R5a. live + recipient is a competitor ⇒ accepted', async () => {
        const { donorToken } = await seedTrio(db);
        await seedCompetition(db, 21, 'live', 2, 1);
        const res = await createDonation(db, donorToken, { amount: 10, payment_method: 'stripe', competitor_id: 2, competition_id: 21 });
        expect(res.status).toBe(200);
    });

    it('R5b. live + recipient is NOT a competitor ⇒ 400, no row, no ledger, no SSE', async () => {
        const { donorToken } = await seedTrio(db);
        await seedCompetition(db, 22, 'live', 2, 1);
        const res = await createDonation(db, donorToken, { amount: 10, payment_method: 'stripe', competitor_id: 3, competition_id: 22 });
        expect(res.status).toBe(400);

        const row = await db.prepare('SELECT id FROM donations LIMIT 1').first<{ id: number }>();
        expect(row).toBeNull();
        expect(await ledgerCount(db)).toBe(0);
        const sse = await db.prepare(`SELECT id FROM sse_event_log WHERE channel = 'competition:22'`).first<{ id: number }>();
        expect(sse).toBeNull();
    });

    it('R5c. non-live + recipient competitor ⇒ 400, no side effects', async () => {
        const { donorToken } = await seedTrio(db);
        await seedCompetition(db, 23, 'completed', 2, 1);
        const res = await createDonation(db, donorToken, { amount: 10, payment_method: 'stripe', competitor_id: 2, competition_id: 23 });
        expect(res.status).toBe(400);

        const row = await db.prepare('SELECT id FROM donations LIMIT 1').first<{ id: number }>();
        expect(row).toBeNull();
        expect(await ledgerCount(db)).toBe(0);
    });

    it('R5d. unknown competition ⇒ 404 (existing behavior preserved)', async () => {
        const { donorToken } = await seedTrio(db);
        const res = await createDonation(db, donorToken, { amount: 10, payment_method: 'stripe', competitor_id: 2, competition_id: 999 });
        expect(res.status).toBe(404);
    });

    it('R5e. no competition_id ⇒ normal donation unaffected', async () => {
        const { donorToken } = await seedTrio(db);
        const res = await createDonation(db, donorToken, { amount: 10, payment_method: 'stripe', competitor_id: 2 });
        expect(res.status).toBe(200);
    });

    it('R5f. competition without recipient ⇒ 400', async () => {
        const { donorToken } = await seedTrio(db);
        await seedCompetition(db, 24, 'live', 2, 1);
        const res = await createDonation(db, donorToken, { amount: 10, payment_method: 'stripe', competition_id: 24 });
        expect(res.status).toBe(400);
    });

    it('R5g. donations.invalid_competition i18n key exists in ar + en and differs', async () => {
        const { ar } = await import('../../src/i18n/ar');
        const { en } = await import('../../src/i18n/en');
        const a = (ar.donations as Record<string, string>).invalid_competition;
        const e = (en.donations as Record<string, string>).invalid_competition;
        expect(a).toBeTruthy();
        expect(e).toBeTruthy();
        expect(a).not.toBe(e);
    });
});
