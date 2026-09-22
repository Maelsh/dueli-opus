import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { campaignAccount } from '../../src/lib/services/AdCampaignManager';
import { LedgerService } from '../../src/lib/services/LedgerService';

/**
 * Phase 9.A — ad campaign lifecycle (RED-FIRST).
 *
 * Route-level via the real Hono app + SqliteD1 carrying the REAL migrations.
 * Money assertions always read ledger_entries (LedgerService = source of truth).
 *
 * Covered:
 *  1. guarded lifecycle: draft → pending_review → active → paused → ended
 *  2. invalid transitions are rejected by the SQL guard (409)
 *  3. an unreviewed campaign never serves (no debit, no impression)
 *  4. budget is debited through LedgerService only (no mirror column)
 *  5. exhaustion stops serving immediately (SQL condition in selection)
 *  6. concurrency: budget 100 cents, 101 concurrent impressions =>
 *     total debit == 100 exactly, campaign ends, invariant difference == 0
 */

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function headers(token?: string) {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'ads-9a-test',
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

const ADV = 'sess-9a-adv';
const OTHER = 'sess-9a-other';
const ADMIN = 'sess-9a-admin';

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active) VALUES
         (2, 'adv@9a.local', 'adv9a', 'x', 'Advertiser', 0, 1),
         (4, 'other@9a.local', 'other9a', 'x', 'Other', 0, 1),
         (3, 'admin@9a.local', 'admin9a', 'x', 'Admin', 1, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('${ADV}', 2, datetime('now', '+1 day')),
         ('${OTHER}', 4, datetime('now', '+1 day')),
         ('${ADMIN}', 3, datetime('now', '+1 day'))`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'general9a', 'عام', 'General')`
    ).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, rules, category_id, creator_id, status) VALUES
         (1, 'Ads lifecycle comp', 'rules', 1, 2, 'live')`
    ).run();
}

async function createCampaign(db: SqliteD1, budgetCents = 100, cost = 1): Promise<number> {
    const res = await app.request('/api/advertiser/campaigns?lang=en', {
        method: 'POST',
        headers: headers(ADV),
        body: JSON.stringify({
            title: 'Campaign 9.A',
            budget_cents: budgetCents,
            cost_per_impression_cents: cost,
        }),
    }, env(db));
    expect(res.status).toBe(201);
    const body = await res.json() as { success: boolean; data: { ad: { id: number; campaign_status: string } } };
    expect(body.data.ad.campaign_status).toBe('draft');
    return body.data.ad.id;
}

async function submit(db: SqliteD1, id: number) {
    return app.request(`/api/advertiser/campaigns/${id}/submit-review?lang=en`, {
        method: 'POST', headers: headers(ADV),
    }, env(db));
}

async function approve(db: SqliteD1, id: number) {
    return app.request(`/api/admin/ads/campaigns/${id}/review?lang=en`, {
        method: 'PUT', headers: headers(ADMIN),
        body: JSON.stringify({ approve: true }),
    }, env(db));
}

async function impression(db: SqliteD1, id: number, ip = '10.0.0.1') {
    return app.request(`/api/advertisements/${id}/impression?lang=en`, {
        method: 'POST', headers: { ...headers(), 'X-Forwarded-For': ip },
        body: JSON.stringify({ competition_id: 1, user_id: 2 }),
    }, env(db));
}

async function balanceOf(db: SqliteD1, adId: number): Promise<number> {
    const ledger = new LedgerService(db as unknown as D1Database);
    return ledger.balance(campaignAccount(adId));
}

async function invariantDifference(db: SqliteD1): Promise<number> {
    const ledger = new LedgerService(db as unknown as D1Database);
    return (await ledger.verifyInvariant()).difference;
}

async function statusOf(db: SqliteD1, adId: number): Promise<string> {
    const row = await db.prepare('SELECT campaign_status FROM advertisements WHERE id = ?').bind(adId).first<{ campaign_status: string }>();
    return row!.campaign_status;
}

describe('9.A — ad campaign lifecycle', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('walks the full lifecycle and debits impressions via the ledger', async () => {
        const id = await createCampaign(db);
        expect(await statusOf(db, id)).toBe('draft');
        // funding transaction landed in the ledger (single source of truth)
        expect(await balanceOf(db, id)).toBe(100);

        // draft must not serve
        let res = await impression(db, id);
        expect(res.status).toBe(409);
        expect(await balanceOf(db, id)).toBe(100);

        res = await submit(db, id);
        expect(res.status).toBe(200);
        expect(await statusOf(db, id)).toBe('pending_review');

        // pending_review must not serve (mandatory review before activity)
        res = await impression(db, id);
        expect(res.status).toBe(409);

        res = await approve(db, id);
        expect(res.status).toBe(200);
        expect(await statusOf(db, id)).toBe('active');

        res = await impression(db, id);
        expect(res.status).toBe(200);
        expect(await balanceOf(db, id)).toBe(99);

        res = await app.request(`/api/advertiser/campaigns/${id}/pause?lang=en`, { method: 'PUT', headers: headers(ADV) }, env(db));
        expect(res.status).toBe(200);
        expect(await statusOf(db, id)).toBe('paused');
        res = await impression(db, id);
        expect(res.status).toBe(409);

        res = await app.request(`/api/advertiser/campaigns/${id}/resume?lang=en`, { method: 'PUT', headers: headers(ADV) }, env(db));
        expect(res.status).toBe(200);
        expect(await statusOf(db, id)).toBe('active');
        res = await impression(db, id);
        expect(res.status).toBe(200);
        expect(await balanceOf(db, id)).toBe(98);

        res = await app.request(`/api/advertiser/campaigns/${id}/end?lang=en`, { method: 'PUT', headers: headers(ADV) }, env(db));
        expect(res.status).toBe(200);
        expect(await statusOf(db, id)).toBe('ended');
        res = await impression(db, id);
        expect(res.status).toBe(409);

        expect(await invariantDifference(db)).toBe(0);
    });

    it('rejects invalid transitions with 409', async () => {
        const id = await createCampaign(db);

        // pause / approve / end directly from draft — all rejected
        expect((await app.request(`/api/advertiser/campaigns/${id}/pause?lang=en`, { method: 'PUT', headers: headers(ADV) }, env(db))).status).toBe(409);
        expect((await approve(db, id)).status).toBe(409);
        expect((await app.request(`/api/advertiser/campaigns/${id}/end?lang=en`, { method: 'PUT', headers: headers(ADV) }, env(db))).status).toBe(409);
        expect(await statusOf(db, id)).toBe('draft');

        // double submit rejected
        expect((await submit(db, id)).status).toBe(200);
        expect((await submit(db, id)).status).toBe(409);

        // resume without pause rejected
        expect((await app.request(`/api/advertiser/campaigns/${id}/resume?lang=en`, { method: 'PUT', headers: headers(ADV) }, env(db))).status).toBe(409);

        // approve from pending_review works, approve again rejected
        expect((await approve(db, id)).status).toBe(200);
        expect((await approve(db, id)).status).toBe(409);

        // non-owner cannot transition someone else's campaign
        const res = await app.request(`/api/advertiser/campaigns/${id}/pause?lang=en`, { method: 'PUT', headers: headers(OTHER) }, env(db));
        expect(res.status).toBe(409);
        expect(await statusOf(db, id)).toBe('active');
    });

    it('budget 100 cents with 101 concurrent impressions: debit stops at exactly 100', async () => {
        const id = await createCampaign(db, 100, 1);
        await submit(db, id);
        expect((await approve(db, id)).status).toBe(200);

        const results = await Promise.all(
            Array.from({ length: 101 }, (_, i) => impression(db, id, `10.9.9.${i + 1}`))
        );
        const served = results.filter((r) => r.status === 200).length;
        const rejected = results.filter((r) => r.status === 409).length;

        expect(served).toBe(100);
        expect(rejected).toBe(101 - served);

        // total debit against the campaign reserve == budget exactly
        expect(await balanceOf(db, id)).toBe(0);
        expect(await statusOf(db, id)).toBe('ended');

        // no overspent impression rows either
        const row = await db.prepare('SELECT COUNT(*) AS n FROM ad_impressions WHERE ad_id = ?').bind(id).first<{ n: number }>();
        expect(row!.n).toBe(100);

        // ledger stays balanced and the final attempt is refused
        expect(await invariantDifference(db)).toBe(0);
        expect((await impression(db, id)).status).toBe(409);
        expect(await balanceOf(db, id)).toBe(0);
    });

    it('dashboard budget fields are derived from the ledger, not a column', async () => {
        const id = await createCampaign(db, 100, 1);
        await submit(db, id);
        await approve(db, id);
        await impression(db, id);

        const res = await app.request('/api/advertiser/dashboard?lang=en', { headers: headers(ADV) }, env(db));
        expect(res.status).toBe(200);
        const body = await res.json() as { data: { campaigns: Array<{ ad_id: number; budget: number; budget_remaining: number; total_spend: number; campaign_status: string }> } };
        const c = body.data.campaigns.find((x) => x.ad_id === id)!;
        expect(c.campaign_status).toBe('active');
        expect(c.budget).toBe(1);
        expect(c.budget_remaining).toBe(0.99);
        expect(c.total_spend).toBeCloseTo(0.01, 6);
    });
});
