import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { AdvertisementModel } from '../../src/models/AdvertisementModel';
import { LedgerService } from '../../src/lib/services/LedgerService';

/**
 * 9.E final-gate remediation — impression identity (N-1 + N-3). RED-FIRST.
 *
 * Route-level via the real Hono app + SqliteD1 carrying the REAL migrations.
 *
 * N-1: settleImpressionKey updated by `key` alone while 0028 scopes identity
 * to (key, ad, NULL-safe user). A settle for one identity must never rewrite
 * another identity's row sharing the same key.
 *
 * N-3: the impression route trusted anonymous `body.user_id` as a real user
 * identity (frequency-cap DoS, attribution forgery, FK failure). Session is
 * the only identity; anonymous stays NULL-identity, always.
 */

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function headers(token?: string, ip?: string) {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'ads-9e-test',
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (ip !== undefined) h['X-Forwarded-For'] = ip;
    return h;
}

const ADV = 'sess-9e-adv';
const ADMIN = 'sess-9e-admin';
const VICTIM = 'sess-9e-victim'; // user 5
const SPOOFER = 'sess-9e-spoofer'; // user 6 (authenticated attacker for forged-body probes)

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active) VALUES
         (2, 'adv@9e.local', 'adv9e', 'x', 'Advertiser', 0, 1),
         (3, 'admin@9e.local', 'admin9e', 'x', 'Admin', 1, 1),
         (5, 'victim@9e.local', 'victim9e', 'x', 'Victim', 0, 1),
         (6, 'spoofer@9e.local', 'spoofer9e', 'x', 'Spoofer', 0, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('${ADV}', 2, datetime('now', '+1 day')),
         ('${ADMIN}', 3, datetime('now', '+1 day')),
         ('${VICTIM}', 5, datetime('now', '+1 day')),
         ('${SPOOFER}', 6, datetime('now', '+1 day'))`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'general9e', 'عام', 'General')`
    ).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, rules, category_id, creator_id, status) VALUES
         (1, 'Ads identity comp', 'rules', 1, 2, 'live')`
    ).run();
}

async function createCampaign(db: SqliteD1, budgetCents: number, cost: number): Promise<number> {
    const res = await app.request('/api/advertiser/campaigns?lang=en', {
        method: 'POST', headers: headers(ADV),
        body: JSON.stringify({ title: 'Identity campaign', budget_cents: budgetCents, cost_per_impression_cents: cost }),
    }, env(db));
    expect(res.status).toBe(201);
    const id = ((await res.json()) as { data: { ad: { id: number } } }).data.ad.id;
    expect((await app.request(`/api/advertiser/campaigns/${id}/submit-review?lang=en`,
        { method: 'POST', headers: headers(ADV) }, env(db))).status).toBe(200);
    expect((await app.request(`/api/admin/ads/campaigns/${id}/review?lang=en`,
        { method: 'PUT', headers: headers(ADMIN), body: JSON.stringify({ approve: true }) }, env(db))).status).toBe(200);
    return id;
}

function impression(
    db: SqliteD1,
    adId: number,
    body: Record<string, unknown>,
    token?: string,
    ip = '10.20.30.40'
) {
    return app.request(`/api/advertisements/${adId}/impression?lang=en`, {
        method: 'POST', headers: headers(token, ip),
        body: JSON.stringify({ competition_id: 1, ...body }),
    }, env(db));
}

async function chargeCount(db: SqliteD1, adId: number): Promise<number> {
    const row = await db.prepare(
        `SELECT COUNT(*) as n FROM ledger_entries
         WHERE ref_type = 'ad_impression' AND ref_id = ? AND direction = 'credit'`
    ).bind(adId).first<{ n: number }>();
    return row?.n ?? 0;
}

async function dedupRows(db: SqliteD1, key: string): Promise<{ ad_id: number; user_id: number | null; served: number; spent_cents: number }[]> {
    const res = await db.prepare(
        `SELECT ad_id, user_id, served, spent_cents FROM ad_impression_dedup WHERE key = ? ORDER BY ad_id, user_id`
    ).bind(key).all<{ ad_id: number; user_id: number | null; served: number; spent_cents: number }>();
    return res.results ?? [];
}

async function impressionUserIds(db: SqliteD1, adId: number): Promise<(number | null)[]> {
    const res = await db.prepare(
        `SELECT user_id FROM ad_impressions WHERE ad_id = ? ORDER BY id`
    ).bind(adId).all<{ user_id: number | null }>();
    return (res.results ?? []).map((r) => r.user_id);
}

async function recentCount(db: SqliteD1, adId: number, userId: number): Promise<number> {
    return new AdvertisementModel(db as unknown as D1Database).countRecentImpressions(adId, userId);
}

describe('9.E — N-1 dedup settlement is identity-scoped', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('settle touches only its own (key, ad, user) row', async () => {
        const ad = await createCampaign(db, 1000, 7);
        const model = new AdvertisementModel(db as unknown as D1Database);
        // Any-cast call: runs against the old 3-param signature AND the fixed
        // 5-param signature (receiver preserved) — only the fixed one isolates.
        const scoped = model as unknown as {
            settleImpressionKey: (key: string, adId: number, userId: number | null, served: boolean, spent: number) => Promise<void>;
        };

        expect(await model.claimImpressionKey('K', ad, 5)).toBe(true);
        expect(await model.claimImpressionKey('K', ad, 6)).toBe(true);
        await scoped.settleImpressionKey('K', ad, 5, true, 7);

        const rows = await dedupRows(db, 'K');
        expect(rows.find((r) => r.user_id === 5)).toEqual({ ad_id: ad, user_id: 5, served: 1, spent_cents: 7 });
        // B's row must be untouched by A's settlement.
        expect(rows.find((r) => r.user_id === 6)).toEqual({ ad_id: ad, user_id: 6, served: 0, spent_cents: 0 });
    });

    it("B's failed settle cannot corrupt A's settled delivery (no phantom re-charge)", async () => {
        const ad = await createCampaign(db, 7, 7); // exactly one impression of budget
        // A serves and settles (1, 7).
        let res = await impression(db, ad, { idempotency_key: 'K' }, VICTIM);
        expect(res.status).toBe(200);
        expect(await chargeCount(db, ad)).toBe(1);

        // B reuses the same key: claims its own row, charge fails (depleted),
        // settles (0, 0) — must not rewrite A's row.
        res = await impression(db, ad, { idempotency_key: 'K' }, SPOOFER);
        expect(res.status).toBe(409);

        // A's retry replays the settled delivery — no second charge.
        res = await impression(db, ad, { idempotency_key: 'K' }, VICTIM);
        expect(res.status).toBe(200);
        const body = (await res.json()) as { success: boolean; data: { deduped: boolean; spentCents: number } };
        expect(body.data.deduped).toBe(true);
        expect(body.data.spentCents).toBe(7);
        expect(await chargeCount(db, ad)).toBe(1);
    });

    it('anonymous settled delivery survives an authenticated failure on the same key', async () => {
        const ad = await createCampaign(db, 7, 7);
        let res = await impression(db, ad, { idempotency_key: 'K' }, undefined, '10.9.9.1');
        expect(res.status).toBe(200);

        // Authenticated caller, same key: own row, failed charge, failed settle.
        res = await impression(db, ad, { idempotency_key: 'K' }, VICTIM, '10.9.9.2');
        expect(res.status).toBe(409);

        // Anonymous retry still replays — exactly one charge total.
        res = await impression(db, ad, { idempotency_key: 'K' }, undefined, '10.9.9.1');
        expect(res.status).toBe(200);
        expect((((await res.json()) as { data: { deduped: boolean } }).data.deduped)).toBe(true);
        expect(await chargeCount(db, ad)).toBe(1);
        const rows = await dedupRows(db, 'K');
        expect(rows.find((r) => r.user_id === null)).toEqual({ ad_id: ad, user_id: null, served: 1, spent_cents: 7 });
    });

    it('same key on different ads stays independent', async () => {
        const adX = await createCampaign(db, 1000, 7);
        const adY = await createCampaign(db, 1000, 7);
        expect((await impression(db, adX, { idempotency_key: 'K' }, VICTIM)).status).toBe(200);
        expect((await impression(db, adY, { idempotency_key: 'K' }, VICTIM)).status).toBe(200);
        expect(await chargeCount(db, adX)).toBe(1);
        expect(await chargeCount(db, adY)).toBe(1);
    });

    it('concurrent retries on one identity charge exactly once', async () => {
        const ad = await createCampaign(db, 1000, 7);
        const results = await Promise.all(
            Array.from({ length: 10 }, (_, i) => impression(db, ad, { idempotency_key: 'K' }, VICTIM, `10.8.8.${i + 1}`))
        );
        const ok = results.filter((r) => r.status === 200).length;
        const conflict = results.filter((r) => r.status === 409).length;
        expect(ok + conflict).toBe(10);
        expect(ok).toBeGreaterThanOrEqual(1);
        expect(await chargeCount(db, ad)).toBe(1);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });
});

describe('9.E — N-3 client identity is never trusted', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('authenticated + forged body.user_id serves as the session user only', async () => {
        const ad = await createCampaign(db, 1000, 7);
        // Spoofer (user 6) claims to be the victim (user 5).
        const res = await impression(db, ad, { user_id: 5 }, SPOOFER);
        expect(res.status).toBe(200);
        expect(await impressionUserIds(db, ad)).toEqual([6]);
        expect(await recentCount(db, ad, 5)).toBe(0);
        expect(await recentCount(db, ad, 6)).toBe(1);
    });

    it('anonymous + real body.user_id stays anonymous and touches no cap', async () => {
        const ad = await createCampaign(db, 1000, 7);
        const res = await impression(db, ad, { user_id: 5 }, undefined, '10.7.7.7');
        expect(res.status).toBe(200);
        expect(await impressionUserIds(db, ad)).toEqual([null]);
        expect(await recentCount(db, ad, 5)).toBe(0);
    });

    it('anonymous + nonexistent body.user_id causes no FK failure and no masked error', async () => {
        const ad = await createCampaign(db, 1000, 7);
        const res = await impression(db, ad, { user_id: 99999 }, undefined, '10.7.7.8');
        expect(res.status).toBe(200);
        const body = (await res.json()) as { success: boolean; data: { served: boolean } };
        expect(body.data.served).toBe(true);
        expect(await impressionUserIds(db, ad)).toEqual([null]);
    });

    it('anonymous spoof storm cannot consume the victim frequency cap (DoS probe)', async () => {
        const ad = await createCampaign(db, 1000, 1);
        // Five anonymous forgeries naming the victim (cap = 5/day).
        for (let i = 0; i < 5; i++) {
            const res = await impression(db, ad, { user_id: 5 }, undefined, `10.6.6.${i + 1}`);
            expect(res.status).toBe(200);
        }
        expect(await recentCount(db, ad, 5)).toBe(0);
        // The victim's own quota is intact: five served, sixth capped.
        for (let i = 0; i < 5; i++) {
            expect((await impression(db, ad, {}, VICTIM)).status).toBe(200);
        }
        const capped = await impression(db, ad, {}, VICTIM);
        expect(capped.status).toBe(429);
    });

    it('regression: normal authed/anon flow, dedup replay, click tokens, ledger', async () => {
        const ad = await createCampaign(db, 1000, 7);
        // Normal authenticated + anonymous impressions both serve.
        expect((await impression(db, ad, {}, VICTIM)).status).toBe(200);
        const anon = await impression(db, ad, {}, undefined, '10.5.5.5');
        expect(anon.status).toBe(200);
        const anonBody = (await anon.json()) as { data: { click_token: string | null } };
        expect(typeof anonBody.data.click_token).toBe('string');

        // Dedup replay without a second charge.
        const before = await chargeCount(db, ad);
        const replay = await impression(db, ad, { idempotency_key: 'RK' }, VICTIM);
        expect(replay.status).toBe(200);
        const replay2 = await impression(db, ad, { idempotency_key: 'RK' }, VICTIM);
        expect((((await replay2.json()) as { data: { deduped: boolean } }).data.deduped)).toBe(true);
        expect(await chargeCount(db, ad)).toBe(before + 1);

        // Click-token flow still counts exactly one click per token.
        const minted = await app.request(`/api/advertisements/${ad}/click-token?lang=en`, {
            method: 'POST', headers: headers(VICTIM), body: JSON.stringify({}),
        }, env(db));
        expect(minted.status).toBe(200);
        const token = ((await minted.json()) as { data: { click_token: string } }).data.click_token;
        const clicked = await app.request(`/api/advertisements/${ad}/click?lang=en`, {
            method: 'POST', headers: headers(VICTIM), body: JSON.stringify({ click_token: token }),
        }, env(db));
        expect(clicked.status).toBe(200);
        const replayedClick = await app.request(`/api/advertisements/${ad}/click?lang=en`, {
            method: 'POST', headers: headers(VICTIM), body: JSON.stringify({ click_token: token }),
        }, env(db));
        expect(replayedClick.status).toBe(409);

        // Legacy money/display columns cannot move portal numbers or the ledger.
        await db.prepare(
            'UPDATE advertisements SET budget = 999999, budget_remaining = 999999, views_count = 9999, clicks_count = 9999 WHERE id = ?'
        ).bind(ad).run();
        const analytics = await app.request(`/api/advertiser/campaigns/${ad}/analytics?lang=en`, {
            method: 'GET', headers: headers(ADV),
        }, env(db));
        expect(analytics.status).toBe(200);
        const aBody = (await analytics.json()) as {
            data: { analytics: { total_impressions: number; total_clicks: number; budget_remaining: number; total_spend: number } };
        };
        expect(aBody.data.analytics.total_impressions).toBe(3);
        expect(aBody.data.analytics.total_clicks).toBe(1);
        expect(aBody.data.analytics.budget_remaining).toBeCloseTo((1000 - 3 * 7) / 100, 8);
        expect(aBody.data.analytics.total_spend).toBeCloseTo((3 * 7) / 100, 8);

        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });
});
