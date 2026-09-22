import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { campaignAccount } from '../../src/lib/services/AdCampaignManager';
import { LedgerService } from '../../src/lib/services/LedgerService';
import { translations } from '../../src/i18n';

/**
 * Phase 9.D — Advertiser Portal (RED-FIRST).
 *
 * Route-level via the real Hono app + SqliteD1 carrying the REAL migrations.
 * The portal API already exists (dashboard / create / submit / pause / resume /
 * end / analytics); this suite pins the 9.D contract on top of the 9.A–9.C
 * lifecycle WITHOUT redesigning it:
 *
 *  1. Advertiser A never sees B's campaigns (dashboard isolation).
 *  2. Cross-owner access is 401/403 by contract — never an empty list, a 409
 *     mislabel, or (worst) a successful state change on someone else's row.
 *  3. The owner keeps full allowed management (create→submit→approve→
 *     pause→resume→end + analytics), while admin-only approval stays admin-only.
 *  4. Money flows through LedgerService only (integer cents, balanced funding
 *     tx, dashboard/analytics derived from the ledger — no parallel truth).
 *  5. Every advertiser.* string resolves in ar AND en.
 *  6. Client-supplied ownership is ignored — the session is the only identity.
 */

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function headers(token?: string) {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'ads-9d-test',
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

const ADV_A = 'sess-9d-a';
const ADV_B = 'sess-9d-b';
const ADMIN = 'sess-9d-admin';

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active) VALUES
         (2, 'a@9d.local', 'adv9d_a', 'x', 'Advertiser A', 0, 1),
         (4, 'b@9d.local', 'adv9d_b', 'x', 'Advertiser B', 0, 1),
         (3, 'admin@9d.local', 'admin9d', 'x', 'Admin', 1, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('${ADV_A}', 2, datetime('now', '+1 day')),
         ('${ADV_B}', 4, datetime('now', '+1 day')),
         ('${ADMIN}', 3, datetime('now', '+1 day'))`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'general9d', 'عام', 'General')`
    ).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, rules, category_id, creator_id, status) VALUES
         (1, 'Ads portal comp', 'rules', 1, 2, 'live')`
    ).run();
}

async function createCampaign(db: SqliteD1, token: string, extra: Record<string, unknown> = {}): Promise<number> {
    const res = await app.request('/api/advertiser/campaigns?lang=en', {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify({ title: 'Portal campaign', budget_cents: 500, cost_per_impression_cents: 5, ...extra }),
    }, env(db));
    expect(res.status).toBe(201);
    const body = await res.json() as { success: boolean; data: { ad: { id: number } } };
    return body.data.ad.id;
}

async function dashboard(db: SqliteD1, token?: string) {
    return app.request('/api/advertiser/dashboard?lang=en', {
        method: 'GET', headers: headers(token),
    }, env(db));
}

async function statusOf(db: SqliteD1, adId: number): Promise<string> {
    const row = await db.prepare(
        'SELECT campaign_lifecycle_status FROM advertisements WHERE id = ?'
    ).bind(adId).first<{ campaign_lifecycle_status: string }>();
    return row!.campaign_lifecycle_status;
}

describe('9.D — advertiser portal ownership & budget', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('isolates dashboards: A sees only own campaigns, B sees an empty portal', async () => {
        const id = await createCampaign(db, ADV_A);

        const resA = await dashboard(db, ADV_A);
        expect(resA.status).toBe(200);
        const bodyA = await resA.json() as {
            success: boolean;
            data: { total_campaigns: number; campaigns: { ad_id: number }[] };
        };
        expect(bodyA.data.total_campaigns).toBe(1);
        expect(bodyA.data.campaigns.map((c) => c.ad_id)).toContain(id);

        // Not "no rows because none exist" — B must see an EMPTY portal, never A's row.
        const resB = await dashboard(db, ADV_B);
        expect(resB.status).toBe(200);
        const bodyB = await resB.json() as {
            success: boolean;
            data: { total_campaigns: number; campaigns: { ad_id: number }[] };
        };
        expect(bodyB.data.total_campaigns).toBe(0);
        expect(bodyB.data.campaigns).toEqual([]);
    });

    it('rejects cross-owner submit with 403 and leaves the draft untouched', async () => {
        const id = await createCampaign(db, ADV_A);

        const res = await app.request(`/api/advertiser/campaigns/${id}/submit-review?lang=en`, {
            method: 'POST', headers: headers(ADV_B),
        }, env(db));
        expect(res.status).toBe(403);
        expect(await statusOf(db, id)).toBe('draft');
    });

    it('rejects cross-owner pause/resume/end/analytics with 403 (never 409/200)', async () => {
        const id = await createCampaign(db, ADV_A);
        // Bring A's campaign to active through the legal path.
        expect((await app.request(`/api/advertiser/campaigns/${id}/submit-review?lang=en`,
            { method: 'POST', headers: headers(ADV_A) }, env(db))).status).toBe(200);
        expect((await app.request(`/api/admin/ads/campaigns/${id}/review?lang=en`,
            { method: 'PUT', headers: headers(ADMIN), body: JSON.stringify({ approve: true }) }, env(db))).status).toBe(200);
        expect(await statusOf(db, id)).toBe('active');

        for (const [method, path] of [
            ['PUT', `/api/advertiser/campaigns/${id}/pause?lang=en`],
            ['PUT', `/api/advertiser/campaigns/${id}/resume?lang=en`],
            ['PUT', `/api/advertiser/campaigns/${id}/end?lang=en`],
            ['GET', `/api/advertiser/campaigns/${id}/analytics?lang=en`],
        ] as const) {
            const res = await app.request(path, { method, headers: headers(ADV_B) }, env(db));
            expect(res.status).toBe(403);
        }
        // Nothing moved: still active, untouched by B.
        expect(await statusOf(db, id)).toBe('active');
    });

    it('returns 401 without a session and 404 for missing campaigns', async () => {
        expect((await dashboard(db, undefined)).status).toBe(401);
        expect((await app.request('/api/advertiser/campaigns?lang=en', {
            method: 'POST', headers: headers(undefined),
            body: JSON.stringify({ title: 'x', budget_cents: 10 }),
        }, env(db))).status).toBe(401);

        const id = await createCampaign(db, ADV_A);
        expect((await app.request(`/api/advertiser/campaigns/${id}/submit-review?lang=en`, {
            method: 'POST', headers: headers(undefined),
        }, env(db))).status).toBe(401);

        // Owner acting on a campaign that does not exist: 404, not 409/403.
        expect((await app.request('/api/advertiser/campaigns/99999/analytics?lang=en', {
            method: 'GET', headers: headers(ADV_A),
        }, env(db))).status).toBe(404);
        expect((await app.request('/api/advertiser/campaigns/99999/pause?lang=en', {
            method: 'PUT', headers: headers(ADV_A),
        }, env(db))).status).toBe(404);
    });

    it('lets the owner manage the allowed lifecycle while approval stays admin-only', async () => {
        const id = await createCampaign(db, ADV_A);

        // Advertiser has NO approval path: the admin review route refuses them…
        const forbidden = await app.request(`/api/admin/ads/campaigns/${id}/review?lang=en`, {
            method: 'PUT', headers: headers(ADV_A), body: JSON.stringify({ approve: true }),
        }, env(db));
        expect(forbidden.status).toBe(403);
        expect(await statusOf(db, id)).toBe('draft');

        // …and the legal path still works end to end.
        expect((await app.request(`/api/advertiser/campaigns/${id}/submit-review?lang=en`,
            { method: 'POST', headers: headers(ADV_A) }, env(db))).status).toBe(200);
        expect((await app.request(`/api/admin/ads/campaigns/${id}/review?lang=en`,
            { method: 'PUT', headers: headers(ADMIN), body: JSON.stringify({ approve: true }) }, env(db))).status).toBe(200);

        const analytics = await app.request(`/api/advertiser/campaigns/${id}/analytics?lang=en`, {
            method: 'GET', headers: headers(ADV_A),
        }, env(db));
        expect(analytics.status).toBe(200);

        expect((await app.request(`/api/advertiser/campaigns/${id}/pause?lang=en`,
            { method: 'PUT', headers: headers(ADV_A) }, env(db))).status).toBe(200);
        expect(await statusOf(db, id)).toBe('paused');
        expect((await app.request(`/api/advertiser/campaigns/${id}/resume?lang=en`,
            { method: 'PUT', headers: headers(ADV_A) }, env(db))).status).toBe(200);
        expect(await statusOf(db, id)).toBe('active');
        expect((await app.request(`/api/advertiser/campaigns/${id}/end?lang=en`,
            { method: 'PUT', headers: headers(ADV_A) }, env(db))).status).toBe(200);
        expect(await statusOf(db, id)).toBe('ended');
    });

    it('ignores client-supplied ownership: the session is the only identity', async () => {
        // A forges B's id in the create payload — the row must still belong to A.
        const id = await createCampaign(db, ADV_A, { advertiser_id: 4 } as unknown as Record<string, unknown>);
        const owner = await db.prepare(
            'SELECT advertiser_id FROM advertisements WHERE id = ?'
        ).bind(id).first<{ advertiser_id: number }>();
        expect(owner!.advertiser_id).toBe(2);

        const bodyB = await (await dashboard(db, ADV_B)).json() as {
            success: boolean; data: { total_campaigns: number };
        };
        expect(bodyB.data.total_campaigns).toBe(0);
    });

    it('funds and reports money through LedgerService only — integer cents, no parallel truth', async () => {
        const id = await createCampaign(db, ADV_A);

        // Funding tx exists in the ledger, balanced, integer cents.
        const entries = await db.prepare(
            `SELECT direction, amount_cents FROM ledger_entries WHERE tx_id = ?`
        ).bind(`ad_campaign_fund_${id}`).all<{ direction: string; amount_cents: number }>();
        expect(entries.results!.length).toBe(2);
        let signed = 0;
        for (const e of entries.results!) {
            expect(Number.isInteger(e.amount_cents)).toBe(true);
            signed += e.direction === 'debit' ? e.amount_cents : -e.amount_cents;
        }
        expect(signed).toBe(0);

        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance(campaignAccount(id))).toBe(500);
        expect((await ledger.verifyInvariant()).difference).toBe(0);

        // Dashboard + analytics read the SAME ledger balance (dollars are display-only).
        const dash = await (await dashboard(db, ADV_A)).json() as {
            success: boolean; data: { total_remaining: number };
        };
        expect(dash.data.total_remaining).toBeCloseTo(5, 8);

        // Forged legacy counters cannot move advertiser-visible numbers.
        await db.prepare(
            'UPDATE advertisements SET views_count = 9999, clicks_count = 9999 WHERE id = ?'
        ).bind(id).run();
        const analytics = await (await app.request(`/api/advertiser/campaigns/${id}/analytics?lang=en`, {
            method: 'GET', headers: headers(ADV_A),
        }, env(db))).json() as {
            success: boolean;
            data: { analytics: { total_impressions: number; total_clicks: number; budget_remaining: number } };
        };
        expect(analytics.data.analytics.total_impressions).toBe(0);
        expect(analytics.data.analytics.total_clicks).toBe(0);
        expect(analytics.data.analytics.budget_remaining).toBeCloseTo(5, 8);
    });

    it('translates every advertiser.* string in ar and en', async () => {
        const ar = translations.ar.advertiser as Record<string, string>;
        const en = translations.en.advertiser as Record<string, string>;
        // Parity both ways: no key left in one language only.
        for (const key of Object.keys(ar)) {
            expect(typeof en[key]).toBe('string');
            expect(en[key].length).toBeGreaterThan(0);
        }
        for (const key of Object.keys(en)) {
            expect(typeof ar[key]).toBe('string');
            expect(ar[key].length).toBeGreaterThan(0);
        }
        // Strings the portal page and the 403/422 flow actually render.
        for (const key of [
            'portal_title', 'dashboard', 'my_campaigns', 'create_campaign',
            'campaign_title', 'budget_cents_label', 'cost_cents_label',
            'image_url', 'link_url', 'target_language', 'target_country',
            'total_budget', 'total_remaining', 'impressions', 'clicks', 'spend', 'ctr',
            'active_campaigns', 'no_campaigns', 'submit_for_review',
            'pause_campaign', 'resume_campaign', 'end_campaign', 'not_your_campaign',
        ]) {
            expect(ar[key]?.length ?? 0).toBeGreaterThan(0);
            expect(en[key]?.length ?? 0).toBeGreaterThan(0);
        }
    });
});
