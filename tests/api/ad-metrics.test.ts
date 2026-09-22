import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { t } from '../../src/i18n';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function headers(token?: string) {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'ads-9c-test',
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    return h;
}

const ADV = 'sess-9c-adv';
const ADMIN = 'sess-9c-admin';
const VIEWER = 'sess-9c-viewer';

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active, language, country) VALUES
         (2, 'adv@9c.local', 'adv9c', 'x', 'Advertiser', 0, 1, 'ar', 'EG'),
         (3, 'admin@9c.local', 'admin9c', 'x', 'Admin', 1, 1, 'ar', 'EG'),
         (5, 'viewer@9c.local', 'viewer9c', 'x', 'Viewer', 0, 1, 'ar', 'EG')`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('${ADV}', 2, datetime('now', '+1 day')),
         ('${ADMIN}', 3, datetime('now', '+1 day')),
         ('${VIEWER}', 5, datetime('now', '+1 day'))`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES
         (10, 'debate9c', 'مناظرة', 'Debate')`
    ).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, rules, category_id, creator_id, status, language, country) VALUES
         (100, 'Comp ar/EG/debate', 'rules', 10, 2, 'live', 'ar', 'EG')`
    ).run();
}

async function createCampaign(
    db: SqliteD1,
    body: Record<string, unknown> = {}
): Promise<number> {
    const res = await app.request('/api/advertiser/campaigns?lang=en', {
        method: 'POST',
        headers: headers(ADV),
        body: JSON.stringify({ title: 'Campaign 9.C', budget_cents: 100000, cost_per_impression_cents: 7, ...body }),
    }, env(db));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { success: boolean; data: { ad: { id: number } } };
    const id = json.data.ad.id;
    expect(
        (await app.request(`/api/advertiser/campaigns/${id}/submit-review?lang=en`, {
            method: 'POST', headers: headers(ADV),
        }, env(db))).status
    ).toBe(200);
    expect(
        (await app.request(`/api/admin/ads/campaigns/${id}/review?lang=en`, {
            method: 'PUT', headers: headers(ADMIN),
            body: JSON.stringify({ approve: true }),
        }, env(db))).status
    ).toBe(200);
    return id;
}

async function impression(db: SqliteD1, adId: number, extra: Record<string, unknown> = {}) {
    return app.request(`/api/advertisements/${adId}/impression?lang=en`, {
        method: 'POST', headers: headers(VIEWER),
        body: JSON.stringify({ competition_id: 100, ...extra }),
    }, env(db));
}

async function mintClickToken(db: SqliteD1, adId: number): Promise<string> {
    const res = await app.request(`/api/advertisements/${adId}/click-token?lang=en`, {
        method: 'POST', headers: headers(VIEWER),
        body: JSON.stringify({}),
    }, env(db));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { success: boolean; data: { click_token: string } };
    expect(typeof json.data.click_token).toBe('string');
    expect(json.data.click_token.length).toBeGreaterThan(16);
    return json.data.click_token;
}

async function click(db: SqliteD1, adId: number, body: Record<string, unknown>) {
    return app.request(`/api/advertisements/${adId}/click?lang=en`, {
        method: 'POST', headers: headers(VIEWER),
        body: JSON.stringify(body),
    }, env(db));
}

async function analytics(db: SqliteD1, adId: number) {
    const res = await app.request(`/api/advertiser/campaigns/${adId}/analytics?lang=en`, {
        headers: headers(ADV),
    }, env(db));
    expect(res.status).toBe(200);
    return (await res.json()) as {
        success: boolean;
        data: {
            analytics: {
                total_impressions: number; total_clicks: number;
                total_spend: number; ctr: number;
            };
            labels: { impressions: string; clicks: string; ctr: string; spend: string };
        };
    };
}

async function clickCount(db: SqliteD1, adId: number): Promise<number> {
    const row = await db.prepare(
        'SELECT COUNT(*) as n FROM ad_clicks WHERE ad_id = ?'
    ).bind(adId).first<{ n: number }>();
    return row?.n ?? 0;
}

async function ledgerSpendCents(db: SqliteD1, adId: number): Promise<number> {
    const row = await db.prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) as total FROM ledger_entries
         WHERE account = ? AND ref_type = 'ad_impression' AND direction = 'credit'`
    ).bind(`reserve:campaign_${adId}`).first<{ total: number }>();
    return row?.total ?? 0;
}

describe('9.C — ad metrics & anti-fraud', () => {
    let db: SqliteD1;
    let adId: number;

    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
        adId = await createCampaign(db);
    });

    it('1. forged click without a token is rejected and not counted', async () => {
        const res = await click(db, adId, {});
        expect(res.status).toBe(422);
        expect(await clickCount(db, adId)).toBe(0);
    });

    it('2. click with an expired token is rejected and not counted', async () => {
        const token = await mintClickToken(db, adId);
        await db.prepare(
            `UPDATE ad_click_tokens SET expires_at = datetime('now', '-1 minute') WHERE token = ?`
        ).bind(token).run();
        const res = await click(db, adId, { click_token: token });
        expect([401, 403]).toContain(res.status);
        expect(await clickCount(db, adId)).toBe(0);
    });

    it('3. click with an invalid token is rejected and not counted', async () => {
        const res = await click(db, adId, { click_token: 'not-a-server-token-0000000000000000' });
        expect([401, 403]).toContain(res.status);
        expect(await clickCount(db, adId)).toBe(0);
    });

    it('4. reusing a consumed token does not count a second click', async () => {
        const token = await mintClickToken(db, adId);
        const first = await click(db, adId, { click_token: token });
        expect(first.status).toBe(200);
        const second = await click(db, adId, { click_token: token });
        expect(second.status).toBe(409);
        expect(await clickCount(db, adId)).toBe(1);
    });

    it('5. a genuine click counts exactly once', async () => {
        const token = await mintClickToken(db, adId);
        const res = await click(db, adId, { click_token: token });
        expect(res.status).toBe(200);
        expect(await clickCount(db, adId)).toBe(1);
        const { data } = await analytics(db, adId);
        expect(data.analytics.total_clicks).toBe(1);
    });

    it('6. stats derive from the financial/operational source, not forged counters', async () => {
        const impressions = 3;
        for (let i = 0; i < impressions; i++) {
            const res = await impression(db, adId);
            expect(res.status).toBe(200);
        }
        const token = await mintClickToken(db, adId);
        expect((await click(db, adId, { click_token: token })).status).toBe(200);

        // Attacker forges the legacy display counters directly in the DB.
        await db.prepare(
            `UPDATE advertisements SET views_count = 9999, clicks_count = 9999 WHERE id = ?`
        ).bind(adId).run();

        const { data } = await analytics(db, adId);
        // Counters are ignored: real operational rows rule.
        expect(data.analytics.total_impressions).toBe(impressions);
        expect(data.analytics.total_clicks).toBe(1);
        expect(data.analytics.ctr).toBeCloseTo(1 / impressions, 9);
        // Spend is the ledger truth in integer cents (cost 7c × 3 = 21c).
        const spendCents = await ledgerSpendCents(db, adId);
        expect(spendCents).toBe(impressions * 7);
        expect(data.analytics.total_spend).toBeCloseTo(spendCents / 100, 9);
        expect(Math.round(data.analytics.total_spend * 100)).toBe(spendCents);
        // i18n labels travel with the stats (no hard-coded display text).
        expect(data.labels.impressions).toBe(t('ads.impressions', 'en'));
        expect(data.labels.clicks).toBe(t('ads.clicks', 'en'));
        expect(data.labels.ctr).toBe(t('ads.ctr', 'en'));
        expect(data.labels.spend).toBe(t('ads.spend', 'en'));
    });

    it('7. 100 concurrent clicks neither double-count nor over-admit', async () => {
        // (a) one fresh token hammered 100× concurrently ⇒ exactly one
        // winner counts; every replay is rejected and nothing double-counts.
        const single = await mintClickToken(db, adId);
        const reuse = await Promise.all(
            Array.from({ length: 100 }, () =>
                click(db, adId, { click_token: single }).then((r) => r.status)
            )
        );
        expect(reuse.filter((s) => s === 200).length).toBe(1);
        expect(reuse.filter((s) => s === 409).length).toBe(99);
        expect(await clickCount(db, adId)).toBe(1);

        // (b) 100 distinct tokens redeemed concurrently ⇒ exactly 100 clicks.
        const ad2 = await createCampaign(db, { title: 'Concurrency probe' });
        const tokens: string[] = [];
        for (let i = 0; i < 100; i++) {
            const res = await app.request(`/api/advertisements/${ad2}/click-token?lang=en`, {
                method: 'POST', headers: headers(VIEWER),
                body: JSON.stringify({}),
            }, env(db));
            expect(res.status).toBe(200);
            tokens.push((((await res.json()) as { data: { click_token: string } }).data.click_token));
        }
        const results = await Promise.all(
            tokens.map((tok) => click(db, ad2, { click_token: tok }).then((r) => r.status))
        );
        expect(results.filter((s) => s === 200).length).toBe(100);
        expect(await clickCount(db, ad2)).toBe(100);

        // Ledger stays balanced throughout (money SSOT untouched).
        const inv = await db.prepare(
            `SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0) as diff
             FROM ledger_entries WHERE currency = 'USD'`
        ).first<{ diff: number }>();
        expect(inv?.diff).toBe(0);
    });

    it('8. duplicate impression delivery with the same idempotency key charges once', async () => {
        const key = 'imp-key-9c-dedup-001';
        const first = await impression(db, adId, { idempotency_key: key });
        expect(first.status).toBe(200);
        const second = await impression(db, adId, { idempotency_key: key });
        expect(second.status).toBe(200);
        const body = (await second.json()) as { success: boolean; data: { deduped?: boolean } };
        expect(body.data.deduped).toBe(true);
        const rows = await db.prepare(
            'SELECT COUNT(*) as n FROM ad_impressions WHERE ad_id = ?'
        ).bind(adId).first<{ n: number }>();
        expect(rows?.n).toBe(1);
        expect(await ledgerSpendCents(db, adId)).toBe(7);
        // A different key is a genuinely new serving, not a duplicate.
        const third = await impression(db, adId, { idempotency_key: 'imp-key-9c-dedup-002' });
        expect(third.status).toBe(200);
        const rows2 = await db.prepare(
            'SELECT COUNT(*) as n FROM ad_impressions WHERE ad_id = ?'
        ).bind(adId).first<{ n: number }>();
        expect(rows2?.n).toBe(2);
    });
});
