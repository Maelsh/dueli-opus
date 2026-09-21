import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerService } from '../../src/lib/services/LedgerService';
import { StripeWebhookService } from '../../src/lib/services/StripeWebhookService';
import { DonationModel } from '../../src/models/DonationModel';

/**
 * 8.G FINAL MONEY GATE — correction pass (RED-FIRST).
 *
 * Four blockers from the REMOTE 8.G NO-GO:
 *  F1 — refund crash window: reservation (refunded_cents) commits, then a
 *       crash happens before ledger.post(). Stripe redelivers, the system
 *       sees incremental = 0, records the event with NO financial effect,
 *       Stripe stops retrying — money is lost accounting-wise.
 *  F2 — concurrent cumulative refund race: two requests read the same stale
 *       refunded_cents and both apply their full delta (500 instead of 300).
 *  F3 — negative balance after paid withdrawal + full refund. NO authoritative
 *       financial policy exists for this case (searched docs/02-*, PLAN-STATUS,
 *       WORKLOG, model/service comments) — so this test DOCUMENTS the current
 *       behaviour quantitatively and is marked BLOCKED pending a Project Lead
 *       policy decision. Behaviour is NOT changed by this pass.
 *  F4 — SEC-01 manual completion route (covered in donations-security.test.ts).
 *
 * Route-level via the real Hono app + SqliteD1 carrying the REAL migrations.
 * Money assertions always read ledger_entries (LedgerService = source of truth).
 */

const WEBHOOK_SECRET = 'whsec_test_money_gate_8g';

function env(db: SqliteD1) {
    return { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as unknown as Parameters<typeof app.request>[2];
}

function headers(token?: string) {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'money-gate-8g-test',
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

/** Seed donor (1) + competitor (2) + admin (3) with sessions. */
async function seedActors(db: SqliteD1): Promise<{ donorToken: string; competitorToken: string; adminToken: string }> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active) VALUES
         (1, 'donor@8g.local', 'donor8g', 'x', 'Donor', 0, 1),
         (2, 'comp@8g.local', 'comp8g', 'x', 'Competitor', 0, 1),
         (3, 'admin@8g.local', 'admin8g', 'x', 'Admin', 1, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('sess-8g-donor', 1, datetime('now', '+1 day')),
         ('sess-8g-comp', 2, datetime('now', '+1 day')),
         ('sess-8g-admin', 3, datetime('now', '+1 day'))`
    ).run();
    return { donorToken: 'sess-8g-donor', competitorToken: 'sess-8g-comp', adminToken: 'sess-8g-admin' };
}

async function createDonation(db: SqliteD1, token: string | undefined, body: Record<string, unknown>) {
    return app.request('/api/donations?lang=en', { method: 'POST', headers: headers(token), body: JSON.stringify(body) }, env(db));
}

async function donationIdOf(res: Response): Promise<number> {
    const body = (await res.json()) as { success: boolean; data: { donation_id: number } };
    expect(body.success).toBe(true);
    return body.data.donation_id;
}

function capturePayload(donationId: number, amountCents: number, eventId: string): string {
    return JSON.stringify({
        id: eventId,
        type: 'checkout.session.completed',
        data: {
            object: {
                id: 'cs_8g_1',
                client_reference_id: String(donationId),
                metadata: { donation_id: String(donationId) },
                amount_total: amountCents,
                amount_received: amountCents,
            },
        },
    });
}

/** Real Stripe shape: amount = original, amount_refunded = CUMULATIVE. */
function stripeRefundPayload(donationId: number, originalCents: number, cumulativeRefunded: number, eventId: string): string {
    return JSON.stringify({
        id: eventId,
        type: 'charge.refunded',
        data: {
            object: {
                id: 'ch_8g_real',
                client_reference_id: String(donationId),
                metadata: { donation_id: String(donationId) },
                amount: originalCents,
                amount_refunded: cumulativeRefunded,
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

/** Reversed totals from ledger (source of truth). */
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

async function refundCheckpoint(db: SqliteD1, donationId: number): Promise<number> {
    const row = await db.prepare('SELECT refunded_cents AS c FROM donations WHERE id = ?')
        .bind(donationId).first<{ c: number }>();
    return row?.c ?? -1;
}

async function refundLedgerRows(db: SqliteD1, donationId: number): Promise<number> {
    return (await db.prepare(
        `SELECT COUNT(*) AS c FROM ledger_entries WHERE ref_type = 'donation' AND ref_id = ? AND tx_id LIKE 'stripe:refund:%'`
    ).bind(donationId).first<{ c: number }>())?.c ?? -1;
}

async function assertInvariantZero(db: SqliteD1): Promise<void> {
    const ledger = new LedgerService(db as unknown as D1Database);
    expect((await ledger.verifyInvariant()).difference).toBe(0);
}

/** Service-level capture event (same shape the route delivers after signature check). */
function svcCaptureEvent(donationId: number, amountCents: number, eventId: string) {
    return {
        id: eventId,
        type: 'checkout.session.completed',
        data: {
            object: {
                client_reference_id: String(donationId),
                metadata: { donation_id: String(donationId) },
                amount_total: amountCents,
                amount_received: amountCents,
            },
        },
    };
}

/** Service-level refund event with real Stripe cumulative semantics. */
function svcRefundEvent(donationId: number, originalCents: number, cumulativeRefunded: number, eventId: string) {
    return {
        id: eventId,
        type: 'charge.refunded',
        data: {
            object: {
                client_reference_id: String(donationId),
                metadata: { donation_id: String(donationId) },
                amount: originalCents,
                amount_refunded: cumulativeRefunded,
            },
        },
    };
}

/** Seed a competitor donation + capture it, all through production code. */
async function seedCapturedCompetitorDonation(
    db: SqliteD1,
    svc: StripeWebhookService,
    donorToken: string,
    dollars: number,
    captureTag: string
): Promise<number> {
    const donationId = await donationIdOf(
        await createDonation(db, donorToken, { amount: dollars, payment_method: 'stripe', competitor_id: 2 })
    );
    const cents = Math.round(dollars * 100);
    const cap = await svc.processEvent(db as unknown as D1Database, svcCaptureEvent(donationId, cents, captureTag));
    expect(cap.applied).toBe(true);
    return donationId;
}

// ─── F1 — crash consistency ──────────────────────────────────────────────
describe('8.G F1 — refund crash consistency (RED-FIRST)', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    it('F1a. checkpoint claimed but ledger never posted (simulated kill) ⇒ redelivery heals, no lost refund, no duplicate', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await donationIdOf(
            await createDonation(db, donorToken, { amount: 10, payment_method: 'stripe', competitor_id: 2 })
        );
        expect((await (await postWebhook(db, capturePayload(donationId, 10_00, 'evt_f1a_cap'))).json()) as { applied: boolean }).toMatchObject({ applied: true });
        await assertInvariantZero(db);

        // Simulate the crash: reservation committed, process killed before ledger.post().
        // (Old code shape: bare refunded_cents bump, no recoverable intent row.)
        await db.prepare('UPDATE donations SET refunded_cents = ? WHERE id = ?').bind(2_00, donationId).run();
        expect(await refundCheckpoint(db, donationId)).toBe(2_00);
        expect(await refundLedgerRows(db, donationId)).toBe(0);

        // Stripe redelivers (new event id, same cumulative truth).
        const redelivery = await postWebhook(db, stripeRefundPayload(donationId, 10_00, 2_00, 'evt_f1a_redeliver'));
        expect(redelivery.status).toBe(200);

        // The refund must NOT be lost: exactly 200 reversed, checkpoint intact.
        const sums = await refundedSums(db, donationId);
        expect(sums.total).toBe(2_00);
        expect(await refundCheckpoint(db, donationId)).toBe(2_00);
        await assertInvariantZero(db);

        // Further redelivery of the same cumulative truth ⇒ no duplicate.
        await postWebhook(db, stripeRefundPayload(donationId, 10_00, 2_00, 'evt_f1a_redeliver2'));
        expect((await refundedSums(db, donationId)).total).toBe(2_00);
        expect(await refundCheckpoint(db, donationId)).toBe(2_00);
        await assertInvariantZero(db);
    });

    it('F1b. ledger.post() throws after reservation ⇒ retry completes exactly once', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await donationIdOf(
            await createDonation(db, donorToken, { amount: 10, payment_method: 'stripe', competitor_id: 2 })
        );
        await postWebhook(db, capturePayload(donationId, 10_00, 'evt_f1b_cap'));

        // Kill the process exactly between reservation and ledger write.
        const postSpy = vi.spyOn(LedgerService.prototype, 'post').mockRejectedValueOnce(new Error('crash-sim'));
        const crashed = await postWebhook(db, stripeRefundPayload(donationId, 10_00, 10_00, 'evt_f1b_ref'));
        expect(crashed.status).toBe(500);
        postSpy.mockRestore();

        // Reservation survived the crash (recoverable), ledger untouched.
        expect(await refundCheckpoint(db, donationId)).toBe(10_00);
        expect(await refundLedgerRows(db, donationId)).toBe(0);

        // Retry (Stripe redelivery of the SAME event) completes the reversal.
        const retry = await postWebhook(db, stripeRefundPayload(donationId, 10_00, 10_00, 'evt_f1b_ref'));
        expect(retry.status).toBe(200);
        expect((await refundedSums(db, donationId)).total).toBe(10_00);
        expect(await refundCheckpoint(db, donationId)).toBe(10_00);
        await assertInvariantZero(db);

        // Third delivery ⇒ no duplicate reversal.
        await postWebhook(db, stripeRefundPayload(donationId, 10_00, 10_00, 'evt_f1b_ref'));
        expect((await refundedSums(db, donationId)).total).toBe(10_00);
        expect(await refundLedgerRows(db, donationId)).toBe(3);
        await assertInvariantZero(db);
    });
});

// ─── F2 — concurrent cumulative refunds ──────────────────────────────────
describe('8.G F2 — concurrent cumulative refund race (RED-FIRST)', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    it('F2a. concurrent cumulative 200 + 300 on a 1000 donation ⇒ checkpoint 300, reversal 300, no over-reversal', async () => {
        // Service level (not HTTP): the two coroutines share one tick with only
        // a handful of awaits, so both READ the same stale checkpoint before
        // either CLAIMS — the exact race window. Route-level Promise.all
        // staggers through crypto/signature awaits and serializes by luck.
        await seedActors(db);
        const svc = new StripeWebhookService(db as unknown as D1Database);
        const model = new DonationModel(db as unknown as D1Database);
        const donation = await model.createDonation({ user_id: 1, recipient_user_id: 2, amount: 10, payment_method: 'stripe' });
        expect(donation.amount_cents).toBe(10_00);
        const donationId = donation.id;
        const cap = await svc.processEvent(db as unknown as D1Database, svcCaptureEvent(donationId, 10_00, 'evt_f2a_cap'));
        expect(cap.applied).toBe(true);
        await assertInvariantZero(db);

        const [r1, r2] = await Promise.all([
            svc.processEvent(db as unknown as D1Database, svcRefundEvent(donationId, 10_00, 2_00, 'evt_f2a_A')),
            svc.processEvent(db as unknown as D1Database, svcRefundEvent(donationId, 10_00, 3_00, 'evt_f2a_B')),
        ]);
        expect([r1.applied, r2.applied].filter(Boolean).length).toBeGreaterThanOrEqual(1);

        // Stripe truth is 300 — the ledger must say exactly 300, not 500.
        expect(await refundCheckpoint(db, donationId)).toBe(3_00);
        const sums = await refundedSums(db, donationId);
        expect(sums.total).toBe(3_00);
        // Exact allocation reconciliation: net 800/fee 200 split pro-rata.
        expect(sums.comp).toBe(2_40);
        expect(sums.plat).toBe(60);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(8_00 - 2_40);
        await assertInvariantZero(db);
    });

    it('F2b. 10 concurrent events (mixed cumulatives, repeats, regressions, over-cap) ⇒ exact full reconciliation', async () => {
        await seedActors(db);
        const svc = new StripeWebhookService(db as unknown as D1Database);
        const donationId = await seedCapturedCompetitorDonation(db, svc, 'sess-8g-donor', 10, 'evt_f2b_cap');

        const cumulatives = [1_00, 1_00, 2_00, 1_50, 3_00, 3_00, 2_50, 4_00, 3_50, 10_00];
        await Promise.all(
            cumulatives.map((cum, i) =>
                svc.processEvent(db as unknown as D1Database, svcRefundEvent(donationId, 10_00, cum, `evt_f2b_${i}`))
            )
        );

        expect(await refundCheckpoint(db, donationId)).toBe(10_00);
        const sums = await refundedSums(db, donationId);
        expect(sums.total).toBe(10_00);
        expect(sums.comp).toBe(8_00);
        expect(sums.plat).toBe(2_00);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(0);
        expect(await ledger.balance('platform:revenue')).toBe(0);
        await assertInvariantZero(db);
    });

    it('F2c. lower-than-checkpoint and over-donation cumulatives never move money', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await donationIdOf(
            await createDonation(db, donorToken, { amount: 10, payment_method: 'stripe', competitor_id: 2 })
        );
        await postWebhook(db, capturePayload(donationId, 10_00, 'evt_f2c_cap'));
        await postWebhook(db, stripeRefundPayload(donationId, 10_00, 6_00, 'evt_f2c_r1'));
        expect((await refundedSums(db, donationId)).total).toBe(6_00);

        // Regression below the checkpoint ⇒ no-op.
        const regressive = await postWebhook(db, stripeRefundPayload(donationId, 10_00, 4_00, 'evt_f2c_reg'));
        expect(((await regressive.json()) as { applied: boolean }).applied).toBe(false);
        // Over-donation cumulative ⇒ rejected, no effect.
        const over = await postWebhook(db, stripeRefundPayload(donationId, 10_00, 10_01, 'evt_f2c_over'));
        expect(((await over.json()) as { applied: boolean }).applied).toBe(false);

        expect((await refundedSums(db, donationId)).total).toBe(6_00);
        expect(await refundCheckpoint(db, donationId)).toBe(6_00);
        await assertInvariantZero(db);
    });
});

// ─── F3 — paid withdrawal then refund (policy decision required) ─────────
describe('8.G F3 — withdrawal paid then full refund [BLOCKED: policy decision required]', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    /**
     * No authoritative policy was found for this case. Searched: docs/02-*,
     * PLAN-STATUS, WORKLOG, DonationModel / WithdrawalRequestModel /
     * LedgerService / StripeWebhookService comments, migrations 0019–0023.
     * Existing rules only guard withdrawals AT REQUEST TIME (sufficient
     * balance) — nothing covers a post-paid-withdrawal refund clawback, user
     * debt, or platform absorption of the shortfall.
     *
     * This test therefore DOCUMENTS current behaviour (and must keep passing
     * unchanged): the claw-back drives the recipient balance NEGATIVE while
     * the ledger invariant stays 0. A Project Lead must choose between
     * (1) platform absorbs shortfall, (2) refund capped at withdrawable
     * balance, (3) negative user debt — this pass implements NONE of them.
     */
    it('F3doc. donation 30000 → fee 6000 + net 24000 → withdraw 6000 paid → full refund ⇒ recipient balance is negative (-6000), invariant 0', async () => {
        const { donorToken, competitorToken, adminToken } = await seedActors(db);
        const donationId = await donationIdOf(
            await createDonation(db, donorToken, { amount: 300, payment_method: 'stripe', competitor_id: 2 })
        );
        await postWebhook(db, capturePayload(donationId, 300_00, 'evt_f3_cap'));

        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(240_00);
        await assertInvariantZero(db);

        // Withdraw $60 → requested → approved → paid.
        const wr = await app.request(
            '/api/withdrawals',
            { method: 'POST', headers: headers(competitorToken), body: JSON.stringify({ amount: 60, payment_method: 'bank', payment_details: 'IBAN-F3' }) },
            env(db)
        );
        expect(wr.status).toBe(201);
        const { request } = ((await wr.json()) as { data: { request: { id: number } } }).data;
        const paid = await app.request(
            `/api/admin/withdrawals/${request.id}/approve`,
            { method: 'PUT', headers: headers(adminToken), body: JSON.stringify({ transaction_id: 'TXN-F3', note: 'bank transfer' }) },
            env(db)
        );
        expect(paid.status).toBe(200);
        expect(await ledger.balance('user:2')).toBe(180_00);
        await assertInvariantZero(db);

        // Stripe refunds the original $300 in full.
        const refund = await postWebhook(db, stripeRefundPayload(donationId, 300_00, 300_00, 'evt_f3_ref'));
        expect(refund.status).toBe(200);
        expect((await refundedSums(db, donationId)).total).toBe(300_00);

        // CURRENT (undocumented-policy) outcome: recipient goes negative.
        expect(await ledger.balance('user:2')).toBe(-60_00);
        await assertInvariantZero(db);

        const model = new DonationModel(db as unknown as D1Database);
        expect((await model.findById(donationId))?.payment_status).toBe('refunded');
    });
});

// ─── Cross-stage composition matrix (§10) ────────────────────────────────
describe('8.G cross-stage money matrix (RED-FIRST)', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    it('M1. donation → capture → refund ⇒ balances return to zero, invariant 0 at every step', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await donationIdOf(
            await createDonation(db, donorToken, { amount: 25, payment_method: 'stripe', competitor_id: 2 })
        );
        await assertInvariantZero(db);
        await postWebhook(db, capturePayload(donationId, 25_00, 'evt_m1_cap'));
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(20_00);
        await assertInvariantZero(db);
        await postWebhook(db, stripeRefundPayload(donationId, 25_00, 25_00, 'evt_m1_ref'));
        expect(await ledger.balance('user:2')).toBe(0);
        expect(await ledger.balance('platform:revenue')).toBe(0);
        expect(await ledger.balance('reserve:gateway')).toBe(0);
        await assertInvariantZero(db);
    });

    it('M2. capture → partial 2500 → partial 6000 ⇒ exact deltas, invariant 0 at every step', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await donationIdOf(
            await createDonation(db, donorToken, { amount: 100, payment_method: 'stripe', competitor_id: 2 })
        );
        await postWebhook(db, capturePayload(donationId, 100_00, 'evt_m2_cap'));
        await assertInvariantZero(db);
        await postWebhook(db, stripeRefundPayload(donationId, 100_00, 25_00, 'evt_m2_r1'));
        expect((await refundedSums(db, donationId)).total).toBe(25_00);
        await assertInvariantZero(db);
        await postWebhook(db, stripeRefundPayload(donationId, 100_00, 60_00, 'evt_m2_r2'));
        expect((await refundedSums(db, donationId)).total).toBe(60_00);
        await assertInvariantZero(db);
    });

    it('M3. same refund event delivered 5× concurrently ⇒ exactly one financial effect', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await donationIdOf(
            await createDonation(db, donorToken, { amount: 100, payment_method: 'stripe', competitor_id: 2 })
        );
        await postWebhook(db, capturePayload(donationId, 100_00, 'evt_m3_cap'));
        const raw = stripeRefundPayload(donationId, 100_00, 25_00, 'evt_m3_same');
        const results = await Promise.all([0, 1, 2, 3, 4].map(() => postWebhook(db, raw)));
        const applied = await Promise.all(results.map(async (r) => ((await r.json()) as { applied: boolean }).applied));
        expect(applied.filter(Boolean)).toHaveLength(1);
        expect((await refundedSums(db, donationId)).total).toBe(25_00);
        await assertInvariantZero(db);
    });

    it('M4. capture → withdrawal request ⇒ hold reduces spendable balance, invariant 0', async () => {
        const { donorToken, competitorToken } = await seedActors(db);
        const donationId = await donationIdOf(
            await createDonation(db, donorToken, { amount: 300, payment_method: 'stripe', competitor_id: 2 })
        );
        await postWebhook(db, capturePayload(donationId, 300_00, 'evt_m4_cap'));
        await assertInvariantZero(db);
        const wr = await app.request(
            '/api/withdrawals',
            { method: 'POST', headers: headers(competitorToken), body: JSON.stringify({ amount: 100, payment_method: 'bank', payment_details: 'IBAN-M4' }) },
            env(db)
        );
        expect(wr.status).toBe(201);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(240_00 - 100_00);
        await assertInvariantZero(db);
    });

    it('M6. refund → redelivery with fresh event ids at same cumulative ⇒ no extra effect', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await donationIdOf(
            await createDonation(db, donorToken, { amount: 50, payment_method: 'stripe', competitor_id: 2 })
        );
        await postWebhook(db, capturePayload(donationId, 50_00, 'evt_m6_cap'));
        await postWebhook(db, stripeRefundPayload(donationId, 50_00, 20_00, 'evt_m6_r1'));
        expect((await refundedSums(db, donationId)).total).toBe(20_00);
        await assertInvariantZero(db);
        const [a, b] = await Promise.all([
            postWebhook(db, stripeRefundPayload(donationId, 50_00, 20_00, 'evt_m6_dupA')),
            postWebhook(db, stripeRefundPayload(donationId, 50_00, 20_00, 'evt_m6_dupB')),
        ]);
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        expect((await refundedSums(db, donationId)).total).toBe(20_00);
        await assertInvariantZero(db);
    });

    it('M7. partial refund → withdrawal of the remainder ⇒ hold succeeds exactly, invariant 0', async () => {
        const { donorToken, competitorToken } = await seedActors(db);
        const donationId = await donationIdOf(
            await createDonation(db, donorToken, { amount: 100, payment_method: 'stripe', competitor_id: 2 })
        );
        await postWebhook(db, capturePayload(donationId, 100_00, 'evt_m7_cap'));
        await postWebhook(db, stripeRefundPayload(donationId, 100_00, 25_00, 'evt_m7_r1'));
        const ledger = new LedgerService(db as unknown as D1Database);
        // Net was 8000; fair(2500) reverses 2000 ⇒ 6000 ($60) remain.
        expect(await ledger.balance('user:2')).toBe(60_00);
        await assertInvariantZero(db);
        const wr = await app.request(
            '/api/withdrawals',
            { method: 'POST', headers: headers(competitorToken), body: JSON.stringify({ amount: 60, payment_method: 'bank', payment_details: 'IBAN-M7' }) },
            env(db)
        );
        expect(wr.status).toBe(201);
        expect(await ledger.balance('user:2')).toBe(0);
        await assertInvariantZero(db);
    });

    it('M8. dual capture event types concurrently ⇒ one effect, invariant 0', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await donationIdOf(
            await createDonation(db, donorToken, { amount: 25, payment_method: 'stripe', competitor_id: 2 })
        );
        const pi = JSON.stringify({
            id: 'evt_m8_pi', type: 'payment_intent.succeeded',
            data: { object: { id: 'pi_m8', client_reference_id: String(donationId), metadata: { donation_id: String(donationId) }, amount_received: 25_00, amount_total: 25_00 } },
        });
        const [h1, h2] = await Promise.all([
            postWebhook(db, pi),
            postWebhook(db, capturePayload(donationId, 25_00, 'evt_m8_cs')),
        ]);
        const applied = [((await h1.json()) as { applied: boolean }).applied, ((await h2.json()) as { applied: boolean }).applied];
        expect(applied.filter(Boolean)).toHaveLength(1);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(20_00);
        await assertInvariantZero(db);
    });
});
