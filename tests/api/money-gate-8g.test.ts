import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerService } from '../../src/lib/services/LedgerService';
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

// ─── F1/F2 under the non-refundable policy ─────────────────────────────
// The 8.G crash/race machinery is superseded by the F3 policy: donation
// refunds are rejected before any financial side effect, so these tests now
// assert rejection + zero money movement (no re-verification of F1/F2 here).
describe('8.G F1/F2 — refund attempts under the non-refundable policy', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    async function createCaptured10(donorToken: string, capTag: string): Promise<number> {
        const donationId = await donationIdOf(
            await createDonation(db, donorToken, {
                amount: 10, payment_method: 'stripe', competitor_id: 2,
                non_refundable_accepted: true, amount_confirmed: true,
            })
        );
        expect((await (await postWebhook(db, capturePayload(donationId, 10_00, capTag))).json()) as { applied: boolean }).toMatchObject({ applied: true });
        return donationId;
    }

    it('F1a-policy. legacy claimed checkpoint + redelivery ⇒ still rejected, no money moves', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await createCaptured10(donorToken, 'evt_f1a_cap');
        await assertInvariantZero(db);

        // Legacy crash state: checkpoint claimed, ledger never posted.
        await db.prepare('UPDATE donations SET refunded_cents = ? WHERE id = ?').bind(2_00, donationId).run();

        const redelivery = await postWebhook(db, stripeRefundPayload(donationId, 10_00, 2_00, 'evt_f1a_redeliver'));
        expect(redelivery.status).toBe(200);
        expect(((await redelivery.json()) as { applied: boolean }).applied).toBe(false);

        expect(await refundLedgerRows(db, donationId)).toBe(0);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(8_00);
        await assertInvariantZero(db);

        await postWebhook(db, stripeRefundPayload(donationId, 10_00, 2_00, 'evt_f1a_redeliver2'));
        expect(await refundLedgerRows(db, donationId)).toBe(0);
        await assertInvariantZero(db);
    });

    it('F1b-policy. refund attempt never reaches ledger.post()', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await createCaptured10(donorToken, 'evt_f1b_cap');

        const postSpy = vi.spyOn(LedgerService.prototype, 'post');
        const res = await postWebhook(db, stripeRefundPayload(donationId, 10_00, 10_00, 'evt_f1b_ref'));
        expect(res.status).toBe(200);
        expect(((await res.json()) as { applied: boolean }).applied).toBe(false);
        expect(postSpy).not.toHaveBeenCalled();
        postSpy.mockRestore();

        expect(await refundCheckpoint(db, donationId)).toBe(0);
        expect(await refundLedgerRows(db, donationId)).toBe(0);
        await assertInvariantZero(db);
    });

    it('F2a-policy. concurrent cumulative 200 + 300 ⇒ both rejected, checkpoint 0, balances intact', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await createCaptured10(donorToken, 'evt_f2a_cap');

        const [r1, r2] = await Promise.all([
            postWebhook(db, stripeRefundPayload(donationId, 10_00, 2_00, 'evt_f2a_A')),
            postWebhook(db, stripeRefundPayload(donationId, 10_00, 3_00, 'evt_f2a_B')),
        ]);
        expect(r1.status).toBe(200);
        expect(r2.status).toBe(200);
        expect(((await r1.json()) as { applied: boolean }).applied).toBe(false);
        expect(((await r2.json()) as { applied: boolean }).applied).toBe(false);

        expect(await refundCheckpoint(db, donationId)).toBe(0);
        expect((await refundedSums(db, donationId)).total).toBe(0);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(8_00);
        expect(await ledger.balance('platform:revenue')).toBe(2_00);
        await assertInvariantZero(db);
    });

    it('F2b-policy. 10 concurrent refund events ⇒ all rejected, zero reversals', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await createCaptured10(donorToken, 'evt_f2b_cap');

        const cumulatives = [1_00, 1_00, 2_00, 1_50, 3_00, 3_00, 2_50, 4_00, 3_50, 10_00];
        const results = await Promise.all(
            cumulatives.map((cum, i) => postWebhook(db, stripeRefundPayload(donationId, 10_00, cum, `evt_f2b_${i}`)))
        );
        for (const r of results) {
            expect(r.status).toBe(200);
            expect(((await r.json()) as { applied: boolean }).applied).toBe(false);
        }

        expect(await refundCheckpoint(db, donationId)).toBe(0);
        expect((await refundedSums(db, donationId)).total).toBe(0);
        await assertInvariantZero(db);
    });

    it('F2c-policy. first, regressive and over-donation refunds ⇒ all rejected', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await createCaptured10(donorToken, 'evt_f2c_cap');

        for (const [cum, tag] of [[6_00, 'evt_f2c_r1'], [4_00, 'evt_f2c_reg'], [10_01, 'evt_f2c_over']] as Array<[number, string]>) {
            const res = await postWebhook(db, stripeRefundPayload(donationId, 10_00, cum, tag));
            expect(res.status).toBe(200);
            expect(((await res.json()) as { applied: boolean }).applied).toBe(false);
        }

        expect((await refundedSums(db, donationId)).total).toBe(0);
        expect(await refundCheckpoint(db, donationId)).toBe(0);
        await assertInvariantZero(db);
    });
});

// ─── F3 — non-refundable donation policy (lead decision implemented) ───
// Policy (8.G-F3, authoritative): ALL Dueli donations are non-refundable
// once completed — even if the recipient withdrew nothing. No full/partial
// refund, no clawback, no negative balance, no recipient debt, no platform
// absorption. Any donation refund attempt is rejected BEFORE any financial
// side effect. Creation requires BOTH explicit confirmations:
//   nonRefundablePolicyAccepted === true AND amountConfirmed === true.
describe('8.G F3 — donations are non-refundable (RED-FIRST)', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    async function consentBody(extra: Record<string, unknown> = {}) {
        return {
            amount: 10,
            payment_method: 'stripe',
            competitor_id: 2,
            non_refundable_accepted: true,
            amount_confirmed: true,
            ...extra,
        };
    }

    async function createCaptured(donationBody: Record<string, unknown>, capTag: string): Promise<number> {
        const { donorToken } = await seedActors(db);
        const created = await createDonation(db, donorToken, donationBody);
        expect(created.status).toBe(200);
        const donationId = await donationIdOf(created);
        const cents = Math.round(Number(donationBody['amount']) * 100);
        const cap = await postWebhook(db, capturePayload(donationId, cents, capTag));
        expect(((await cap.json()) as { applied: boolean }).applied).toBe(true);
        return donationId;
    }

    it('F3A. refund of a completed donation with NO withdrawal ⇒ rejected, zero financial side effects', async () => {
        const donationId = await createCaptured(await consentBody(), 'evt_f3a_cap');
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(8_00);
        await assertInvariantZero(db);

        const refund = await postWebhook(db, stripeRefundPayload(donationId, 10_00, 10_00, 'evt_f3a_ref'));
        expect(refund.status).toBe(200);
        const body = (await refund.json()) as { applied: boolean };
        expect(body.applied).toBe(false);

        // No reversal, no checkpoint movement, status untouched, balances intact.
        expect(await refundLedgerRows(db, donationId)).toBe(0);
        expect(await refundCheckpoint(db, donationId)).toBe(0);
        expect(await ledger.balance('user:2')).toBe(8_00);
        expect(await ledger.balance('platform:revenue')).toBe(2_00);
        const model = new DonationModel(db as unknown as D1Database);
        expect((await model.findById(donationId))?.payment_status).toBe('completed');
        await assertInvariantZero(db);
    });

    it('F3B. refund after the recipient withdrew part ⇒ rejected, no clawback, no negative balance', async () => {
        const { competitorToken, adminToken } = await seedActors(db);
        const created = await createDonation(db, 'sess-8g-donor', {
            amount: 300, payment_method: 'stripe', competitor_id: 2,
            non_refundable_accepted: true, amount_confirmed: true,
        });
        expect(created.status).toBe(200);
        const donationId = await donationIdOf(created);
        await postWebhook(db, capturePayload(donationId, 300_00, 'evt_f3b_cap'));

        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(240_00);

        const wr = await app.request(
            '/api/withdrawals',
            { method: 'POST', headers: headers(competitorToken), body: JSON.stringify({ amount: 60, payment_method: 'bank', payment_details: 'IBAN-F3B' }) },
            env(db)
        );
        expect(wr.status).toBe(201);
        const { request } = ((await wr.json()) as { data: { request: { id: number } } }).data;
        const paid = await app.request(
            `/api/admin/withdrawals/${request.id}/approve`,
            { method: 'PUT', headers: headers(adminToken), body: JSON.stringify({ transaction_id: 'TXN-F3B', note: 'bank' }) },
            env(db)
        );
        expect(paid.status).toBe(200);
        expect(await ledger.balance('user:2')).toBe(180_00);

        // Full refund attempt ⇒ rejected; balance stays positive, nothing moves.
        const refund = await postWebhook(db, stripeRefundPayload(donationId, 300_00, 300_00, 'evt_f3b_ref'));
        expect(refund.status).toBe(200);
        expect(((await refund.json()) as { applied: boolean }).applied).toBe(false);
        expect(await refundLedgerRows(db, donationId)).toBe(0);
        expect(await refundCheckpoint(db, donationId)).toBe(0);
        expect(await ledger.balance('user:2')).toBe(180_00);
        const model = new DonationModel(db as unknown as D1Database);
        expect((await model.findById(donationId))?.payment_status).toBe('completed');
        await assertInvariantZero(db);
    });

    it('F3C. repeated refund attempts (new events, partial and full) ⇒ all rejected', async () => {
        const donationId = await createCaptured(await consentBody(), 'evt_f3c_cap');
        const attempts: Array<[number, string]> = [
            [25_00, 'evt_f3c_r1'],
            [25_00, 'evt_f3c_r1_dup'],
            [60_00, 'evt_f3c_r2'],
            [10_00, 'evt_f3c_r3'],
        ];
        for (const [cum, tag] of attempts) {
            const res = await postWebhook(db, stripeRefundPayload(donationId, 10_00, cum, tag));
            expect(res.status).toBe(200);
            expect(((await res.json()) as { applied: boolean }).applied).toBe(false);
        }
        expect(await refundLedgerRows(db, donationId)).toBe(0);
        expect(await refundCheckpoint(db, donationId)).toBe(0);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(8_00);
        await assertInvariantZero(db);
    });

    it('F3D. creation WITHOUT accepting the non-refundable policy ⇒ rejected, no donation row', async () => {
        const { donorToken } = await seedActors(db);
        const before = (await db.prepare('SELECT COUNT(*) AS c FROM donations').first<{ c: number }>())?.c ?? -1;
        const res = await createDonation(db, donorToken, {
            amount: 10, payment_method: 'stripe', competitor_id: 2, amount_confirmed: true,
        });
        expect(res.status).toBe(400);
        const after = (await db.prepare('SELECT COUNT(*) AS c FROM donations').first<{ c: number }>())?.c ?? -2;
        expect(after).toBe(before);
    });

    it('F3E. policy accepted but amount NOT confirmed ⇒ rejected, no donation row', async () => {
        const { donorToken } = await seedActors(db);
        const before = (await db.prepare('SELECT COUNT(*) AS c FROM donations').first<{ c: number }>())?.c ?? -1;
        const res = await createDonation(db, donorToken, {
            amount: 10, payment_method: 'stripe', competitor_id: 2, non_refundable_accepted: true,
        });
        expect(res.status).toBe(400);
        const after = (await db.prepare('SELECT COUNT(*) AS c FROM donations').first<{ c: number }>())?.c ?? -2;
        expect(after).toBe(before);
    });

    it('F3F. creation succeeds ONLY with BOTH confirmations together', async () => {
        const { donorToken } = await seedActors(db);
        const res = await createDonation(db, donorToken, {
            amount: 10, payment_method: 'stripe', competitor_id: 2,
            non_refundable_accepted: true, amount_confirmed: true,
        });
        expect(res.status).toBe(200);
        expect(((await res.json()) as { success: boolean }).success).toBe(true);
    });

    it('F3G. non-refundable i18n keys exist in ar + en and differ', async () => {
        const { ar } = await import('../../src/i18n/ar');
        const { en } = await import('../../src/i18n/en');
        for (const k of [
            'non_refundable',
            'non_refundable_accept',
            'non_refundable_required',
            'amount_confirm',
            'amount_confirm_required',
        ] as const) {
            const a = (ar.donations as Record<string, string>)[k];
            const e = (en.donations as Record<string, string>)[k];
            expect(a, `ar.donations.${k}`).toBeTruthy();
            expect(e, `en.donations.${k}`).toBeTruthy();
            expect(a, `ar/en differ for ${k}`).not.toBe(e);
        }
    });
});

// ─── Cross-stage composition matrix (§10, under the F3 policy) ─────────
describe('8.G cross-stage money matrix (non-refundable policy)', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    function consentCreate(token: string, dollars: number, tag: string) {
        return createDonation(db, token, {
            amount: dollars, payment_method: 'stripe', competitor_id: 2,
            non_refundable_accepted: true, amount_confirmed: true,
        }).then(async (created) => {
            expect(created.status).toBe(200);
            return donationIdOf(created);
        });
    }

    it('M1. donation → capture → refund attempt ⇒ balances intact, invariant 0 at every step', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await consentCreate(donorToken, 25, 'm1');
        await assertInvariantZero(db);
        await postWebhook(db, capturePayload(donationId, 25_00, 'evt_m1_cap'));
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:2')).toBe(20_00);
        await assertInvariantZero(db);
        const ref = await postWebhook(db, stripeRefundPayload(donationId, 25_00, 25_00, 'evt_m1_ref'));
        expect(((await ref.json()) as { applied: boolean }).applied).toBe(false);
        expect(await ledger.balance('user:2')).toBe(20_00);
        expect(await ledger.balance('platform:revenue')).toBe(5_00);
        // No reversal happened: gateway cash leg stays as captured (credit).
        expect(await ledger.balance('reserve:gateway')).toBe(-25_00);
        await assertInvariantZero(db);
    });

    it('M2. capture → partial attempts ⇒ exact rejection, invariant 0 at every step', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await consentCreate(donorToken, 100, 'm2');
        await postWebhook(db, capturePayload(donationId, 100_00, 'evt_m2_cap'));
        await assertInvariantZero(db);
        for (const [cum, tag] of [[25_00, 'evt_m2_r1'], [60_00, 'evt_m2_r2']] as Array<[number, string]>) {
            const res = await postWebhook(db, stripeRefundPayload(donationId, 100_00, cum, tag));
            expect(((await res.json()) as { applied: boolean }).applied).toBe(false);
            expect((await refundedSums(db, donationId)).total).toBe(0);
            await assertInvariantZero(db);
        }
    });

    it('M3. same refund event delivered 5× concurrently ⇒ zero financial effects', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await consentCreate(donorToken, 100, 'm3');
        await postWebhook(db, capturePayload(donationId, 100_00, 'evt_m3_cap'));
        const raw = stripeRefundPayload(donationId, 100_00, 25_00, 'evt_m3_same');
        const results = await Promise.all([0, 1, 2, 3, 4].map(() => postWebhook(db, raw)));
        const applied = await Promise.all(results.map(async (r) => ((await r.json()) as { applied: boolean }).applied));
        expect(applied.filter(Boolean)).toHaveLength(0);
        expect((await refundedSums(db, donationId)).total).toBe(0);
        await assertInvariantZero(db);
    });

    it('M4. capture → withdrawal request ⇒ hold reduces spendable balance, invariant 0', async () => {
        const { donorToken, competitorToken } = await seedActors(db);
        const donationId = await consentCreate(donorToken, 300, 'm4');
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

    it('M6. refund redeliveries with fresh event ids ⇒ no effect whatsoever', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await consentCreate(donorToken, 50, 'm6');
        await postWebhook(db, capturePayload(donationId, 50_00, 'evt_m6_cap'));
        const first = await postWebhook(db, stripeRefundPayload(donationId, 50_00, 20_00, 'evt_m6_r1'));
        expect(((await first.json()) as { applied: boolean }).applied).toBe(false);
        await assertInvariantZero(db);
        const [a, b] = await Promise.all([
            postWebhook(db, stripeRefundPayload(donationId, 50_00, 20_00, 'evt_m6_dupA')),
            postWebhook(db, stripeRefundPayload(donationId, 50_00, 20_00, 'evt_m6_dupB')),
        ]);
        expect(a.status).toBe(200);
        expect(b.status).toBe(200);
        expect((await refundedSums(db, donationId)).total).toBe(0);
        await assertInvariantZero(db);
    });

    it('M7. refund rejected ⇒ full captured net stays withdrawable, invariant 0', async () => {
        const { donorToken, competitorToken } = await seedActors(db);
        const donationId = await consentCreate(donorToken, 100, 'm7');
        await postWebhook(db, capturePayload(donationId, 100_00, 'evt_m7_cap'));
        const denied = await postWebhook(db, stripeRefundPayload(donationId, 100_00, 25_00, 'evt_m7_r1'));
        expect(((await denied.json()) as { applied: boolean }).applied).toBe(false);
        const ledger = new LedgerService(db as unknown as D1Database);
        // Net untouched (8000): the $60 withdrawal below leaves $20.
        expect(await ledger.balance('user:2')).toBe(80_00);
        await assertInvariantZero(db);
        const wr = await app.request(
            '/api/withdrawals',
            { method: 'POST', headers: headers(competitorToken), body: JSON.stringify({ amount: 60, payment_method: 'bank', payment_details: 'IBAN-M7' }) },
            env(db)
        );
        expect(wr.status).toBe(201);
        expect(await ledger.balance('user:2')).toBe(20_00);
        await assertInvariantZero(db);
    });

    it('M8. dual capture event types concurrently ⇒ one effect, invariant 0', async () => {
        const { donorToken } = await seedActors(db);
        const donationId = await consentCreate(donorToken, 25, 'm8');
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
