import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { AdvertisementModel } from '../../src/models/AdvertisementModel';
import { UserAdPolicyModel } from '../../src/models/UserAdPolicyModel';
import { AdCampaignManager } from '../../src/lib/services/AdCampaignManager';
import { LivePayoutEngine, splitPayoutCents } from '../../src/lib/services/LivePayoutEngine';
import {
    AD_PRICING_SETTING_KEY,
    MAX_DURATION_SECONDS,
    effectiveImpressionCents,
    parseAdPricingConfig,
    validateAdPricingConfig,
} from '../../src/lib/services/AdPricing';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function headers(token?: string) {
    const h: Record<string, string> = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'u361' };
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
}

const ADMIN = 's-admin-36';
const PLAIN = 's-plain-36';
const CREATOR = 's-creator-36';
const OPPONENT = 's-opponent-36';

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_verified, is_active, language, country) VALUES
         (2, 'c@t.local', 'creator36', 'x', 'C', 0, 1, 1, 'ar', 'EG'),
         (3, 'o@t.local', 'opp36', 'x', 'O', 0, 1, 1, 'ar', 'EG'),
         (4, 'a@t.local', 'admin36', 'x', 'A', 1, 1, 1, 'en', 'EG'),
         (5, 'p@t.local', 'plain36', 'x', 'P', 0, 1, 1, 'ar', 'EG')`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('${ADMIN}', 4, datetime('now', '+1 day')),
         ('${PLAIN}', 5, datetime('now', '+1 day')),
         ('${CREATOR}', 2, datetime('now', '+1 day')),
         ('${OPPONENT}', 3, datetime('now', '+1 day'))`
    ).run();
    await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'c36', 'ت', 'T')`).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, language, country)
         VALUES (70, 'C', 'R', 1, 2, 3, 'live', 'ar', 'EG')`
    ).run();
}

interface AdOptions {
    house?: boolean;
    cost?: number;
    revenue?: number;
    media?: 'image' | 'gif' | 'video';
    duration?: number | null;
    targetLanguage?: string | null;
    funded?: number;
}

async function ad(db: SqliteD1, id: number, opts: AdOptions = {}) {
    const house = opts.house === true;
    await db.prepare(
        `INSERT INTO advertisements (
            id, title, image_url, link_url, is_active, created_by,
            cost_per_impression_cents, revenue_per_view, campaign_lifecycle_status, campaign_status,
            is_house, media_kind, duration_sec, target_language
         ) VALUES (?, ?, 'https://example.test/a.png', 'https://example.test', 1, 4, ?, ?, 'active', 'active', ?, ?, ?, ?)`
    ).bind(
        id,
        house ? `House ${id}` : `Ad ${id}`,
        house ? 0 : (opts.cost ?? 5),
        house ? 0 : (opts.revenue ?? 0.01),
        house ? 1 : 0,
        opts.media ?? 'image',
        opts.duration ?? null,
        opts.targetLanguage ?? null
    ).run();
    if (!house) {
        await db.prepare(
            `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
             VALUES (?, ?, 'debit', ?, 'USD', 'test', ?, 'test')`
        ).bind('fund-' + id, 'reserve:campaign_' + id, opts.funded ?? 100, id).run();
    }
}

async function adIds(
    db: SqliteD1,
    opts: {
        creatorMode?: string;
        opponentMode?: string;
        viewerId?: number;
        viewerBlockAd?: number;
        partyBlockAd?: number;
        limit?: number;
    } = {}
) {
    if (opts.creatorMode) {
        await new UserAdPolicyModel(db as never).setMode(2, opts.creatorMode as never);
    }
    if (opts.opponentMode) {
        await new UserAdPolicyModel(db as never).setMode(3, opts.opponentMode as never);
    }
    if (opts.viewerBlockAd) {
        await db.prepare('INSERT INTO ad_blocks (user_id, ad_id) VALUES (?, ?)').bind(opts.viewerId, opts.viewerBlockAd).run();
    }
    if (opts.partyBlockAd) {
        await db.prepare('INSERT INTO ad_blocks (user_id, ad_id) VALUES (?, ?)').bind(2, opts.partyBlockAd).run();
    }
    const rows = await new AdvertisementModel(db as never).getTargetedAds({
        creatorId: 2,
        opponentId: 3,
        blockedForUserId: opts.viewerId ?? null,
        limit: opts.limit ?? 10,
    });
    return rows.map((row) => row.id);
}

describe('UNIT36.1 ad pricing, competitor control, house ads', () => {
    describe('the one effective-price calculation', () => {
        it('keeps the campaign cost exactly when config is absent/empty', () => {
            expect(effectiveImpressionCents(7, null)).toBe(7);
            expect(effectiveImpressionCents(7, {})).toBe(7);
            expect(effectiveImpressionCents(7, { multipliers: {} })).toBe(7);
            expect(effectiveImpressionCents(0, null)).toBe(1);
        });

        it('applies country base and every configured multiplier once', () => {
            const price = effectiveImpressionCents(
                7,
                {
                    country_base_cents: { EG: 10 },
                    multipliers: {
                        h7: 2,
                        targeting: 1.5,
                        media: { video: 1.2 },
                        duration: { '15': 2 },
                    },
                },
                { country: 'eg', mediaKind: 'video', durationSec: 15, hasTargeting: true }
            );
            // 10 * 2 * 1.5 * 1.2 * 2 = 72
            expect(price).toBe(72);
        });

        it('falls back to campaign cost for an unconfigured country', () => {
            expect(effectiveImpressionCents(7, { country_base_cents: { US: 99 } }, { country: 'EG' })).toBe(7);
            expect(effectiveImpressionCents(7, { country_base_cents: { US: 99 } })).toBe(7);
        });

        it('charges targeting only when the campaign actually targets', () => {
            const config = { multipliers: { targeting: 3 } };
            expect(effectiveImpressionCents(10, config, { hasTargeting: false })).toBe(10);
            expect(effectiveImpressionCents(10, config, { hasTargeting: true })).toBe(30);
        });

        it('matches the exact video duration key only', () => {
            const config = { multipliers: { duration: { '15': 2 } } };
            expect(effectiveImpressionCents(10, config, { mediaKind: 'video', durationSec: 15 })).toBe(20);
            expect(effectiveImpressionCents(10, config, { mediaKind: 'video', durationSec: 14 })).toBe(10);
            expect(effectiveImpressionCents(10, config, { mediaKind: 'image', durationSec: 15 })).toBe(10);
            expect(effectiveImpressionCents(10, config, { mediaKind: 'video', durationSec: null })).toBe(10);
        });

        it('rounds once and never returns less than one cent', () => {
            expect(effectiveImpressionCents(10, { multipliers: { media: { video: 1.25 } } }, { mediaKind: 'video' })).toBe(13);
            expect(effectiveImpressionCents(7, { multipliers: { media: { image: 1.1 } } })).toBe(8);
            expect(effectiveImpressionCents(1, { multipliers: { media: { image: 0.01 } } })).toBe(1);
        });

        it('treats legacy/unset media as image and ignores invalid stored config', () => {
            expect(effectiveImpressionCents(10, { multipliers: { media: { image: 2 } } }, { mediaKind: null })).toBe(20);
            expect(parseAdPricingConfig('{not json')).toBeNull();
            expect(parseAdPricingConfig('{"countryBaseCents":{"EG":10}}')).toBeNull();
            expect(parseAdPricingConfig(null)).toBeNull();
        });

        it('validates and normalizes the admin payload strictly', () => {
            const ok = validateAdPricingConfig({
                country_base_cents: { eg: 10 },
                multipliers: { h7: 1.5, media: { video: 2 }, duration: { '15': 1.2 } },
            });
            expect(ok.ok).toBe(true);
            if (ok.ok) {
                expect(ok.config.country_base_cents).toEqual({ EG: 10 });
                expect(ok.config.multipliers?.duration).toEqual({ '15': 1.2 });
            }
            expect(validateAdPricingConfig({}).ok).toBe(true);
            expect(validateAdPricingConfig({ countryBaseCents: { EG: 10 } }).ok).toBe(false);
            expect(validateAdPricingConfig({ country_base_cents: { E: 10 } }).ok).toBe(false);
            expect(validateAdPricingConfig({ country_base_cents: { EG: 0 } }).ok).toBe(false);
            expect(validateAdPricingConfig({ multipliers: { h7: 0 } }).ok).toBe(false);
            expect(validateAdPricingConfig({ multipliers: { nope: 1 } }).ok).toBe(false);
            expect(validateAdPricingConfig({ multipliers: { media: { audio: 1 } } }).ok).toBe(false);
            expect(validateAdPricingConfig({ multipliers: { duration: { '0': 1 } } }).ok).toBe(false);
            expect(validateAdPricingConfig(null).ok).toBe(false);
            expect(validateAdPricingConfig([]).ok).toBe(false);
        });
    });

    describe('serving matrix: four modes × paid/house/per-ad block', () => {
        let db: SqliteD1;
        beforeEach(async () => {
            db = new SqliteD1();
            await seed(db);
            await ad(db, 11, { cost: 5, targetLanguage: 'ar' });
            await ad(db, 12, { house: true });
        });

        it('auto: current behavior serves paid first, then house', async () => {
            expect(await adIds(db)).toEqual([11, 12]);
        });

        it('allow: explicit blanket permission serves paid without a grant', async () => {
            expect(await adIds(db, { creatorMode: 'allow' })).toEqual([11, 12]);
        });

        it('manual: no grant hides paid; a grant from a manual competitor restores it', async () => {
            expect(await adIds(db, { creatorMode: 'manual' })).toEqual([12]);
            await new UserAdPolicyModel(db as never).grant(2, 11);
            expect(await adIds(db)).toEqual([11, 12]);
        });

        it('manual: every manual competitor must grant the ad', async () => {
            await adIds(db, { creatorMode: 'manual', opponentMode: 'manual' });
            await new UserAdPolicyModel(db as never).grant(2, 11);
            expect(await adIds(db)).toEqual([12]);
            await new UserAdPolicyModel(db as never).grant(3, 11);
            expect(await adIds(db)).toEqual([11, 12]);
        });

        it('block: no third-party ad even with a grant; house still serves', async () => {
            await new UserAdPolicyModel(db as never).grant(2, 11);
            expect(await adIds(db, { creatorMode: 'block' })).toEqual([12]);
        });

        it('a per-ad block by either competitor hides the paid ad, never the house ad', async () => {
            await ad(db, 13, { house: true });
            const houses = (ids: number[]) => ids.sort((a, b) => a - b);
            expect(houses(await adIds(db, { partyBlockAd: 11 }))).toEqual([12, 13]);
            await db.prepare('INSERT INTO ad_blocks (user_id, ad_id) VALUES (3, 12)').run();
            expect(houses(await adIds(db))).toEqual([12, 13]);
        });

        it('a viewer per-ad block hides paid but never house', async () => {
            await db.prepare('INSERT INTO ad_blocks (user_id, ad_id) VALUES (5, 11)').run();
            await db.prepare('INSERT INTO ad_blocks (user_id, ad_id) VALUES (5, 12)').run();
            expect(await adIds(db, { viewerId: 5 })).toEqual([12]);
        });

        it('limit=1 gives a paid ad first, and house as the fallback when paid is blocked', async () => {
            expect(await adIds(db, { limit: 1 })).toEqual([11]);
            expect(await adIds(db, { creatorMode: 'block', limit: 1 })).toEqual([12]);
        });

        it('house inventory is capped at three active rows atomically', async () => {
            const model = new AdvertisementModel(db as never);
            expect(await model.insertHouse({
                title: 'H2', mediaUrl: 'https://example.test/h2.png', linkUrl: 'https://example.test',
                mediaKind: 'gif', createdBy: 4,
            })).not.toBeNull();
            expect(await model.insertHouse({
                title: 'H3', mediaUrl: 'https://example.test/h3.mp4', linkUrl: 'https://example.test',
                mediaKind: 'video', durationSec: 15, createdBy: 4,
            })).not.toBeNull();
            expect(await model.insertHouse({
                title: 'H4', mediaUrl: 'https://example.test/h4.png', linkUrl: 'https://example.test',
                mediaKind: 'image', createdBy: 4,
            })).toBeNull();
            expect(await model.countActiveHouse()).toBe(3);
        });

        it('manual candidates list only paid ads and reflects grants', async () => {
            const model = new UserAdPolicyModel(db as never);
            const before = await model.listCandidates(2);
            expect(before.map((row) => row.id)).toEqual([11]);
            await model.grant(2, 11);
            const after = await model.listCandidates(2);
            expect(after[0]?.granted).toBe(1);
        });

        it('the serving API applies a competitor block and still returns the house fallback', async () => {
            await new UserAdPolicyModel(db as never).setMode(2, 'block');
            const res = await app.request(`/api/advertisements?competition_id=70&limit=1&lang=en`, {
                headers: headers(PLAIN),
            }, env(db));
            expect(res.status).toBe(200);
            const json = await res.json() as { data: Array<{ id: number; is_house: number }> };
            expect(json.data.map((row) => row.id)).toEqual([12]);
            expect(Number(json.data[0]?.is_house)).toBe(1);
        });

        it('serving gates the budget on the EFFECTIVE price, so an unaffordable ad is not shown', async () => {
            // Paid ad costs 5 but the effective price (country base 10) is 10,
            // while the campaign reserve only holds 7 cents.
            await ad(db, 31, { cost: 5, funded: 7 });
            await ad(db, 32, { house: true });
            await app.request('/api/admin/ad-pricing?lang=en', {
                method: 'PUT', headers: headers(ADMIN),
                body: JSON.stringify({ country_base_cents: { EG: 10 } }),
            }, env(db));

            const res = await app.request('/api/advertisements?competition_id=70&limit=5&lang=en', {
                headers: headers(PLAIN),
            }, env(db));
            expect(res.status).toBe(200);
            const json = await res.json() as { data: Array<{ id: number }> };
            const ids = json.data.map((row) => row.id);
            expect(ids).not.toContain(31);
            expect(ids).toContain(32);

            // With enough budget the paid ad is served again.
            await db.prepare(
                `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                 VALUES ('fund-31b', 'reserve:campaign_31', 'debit', 100, 'USD', 'test', 31, 'test')`
            ).run();
            const res2 = await app.request('/api/advertisements?competition_id=70&limit=5&lang=en', {
                headers: headers(PLAIN),
            }, env(db));
            const json2 = await res2.json() as { data: Array<{ id: number }> };
            expect(json2.data.map((row) => row.id)).toContain(31);
        });

        it('the house fallback survives a large pool of unaffordable paid ads', async () => {
            // No paid ad may be affordable here, so the only eligible answer
            // is the house fallback. (The ledger is append-only: the earlier
            // paid ad is drained with a compensating credit leg.)
            await db.prepare(
                `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                 VALUES ('drain-11', 'reserve:campaign_11', 'credit', 100, 'USD', 'test', 11, 'test')`
            ).run();
            for (let n = 0; n < 55; n++) {
                await ad(db, 1000 + n, { cost: 5, funded: 1 });
            }
            await ad(db, 999, { house: true });
            await app.request('/api/admin/ad-pricing?lang=en', {
                method: 'PUT', headers: headers(ADMIN),
                body: JSON.stringify({ country_base_cents: { EG: 10 } }),
            }, env(db));

            const res = await app.request('/api/advertisements?competition_id=70&limit=1&lang=en', {
                headers: headers(PLAIN),
            }, env(db));
            expect(res.status).toBe(200);
            const json = await res.json() as { data: Array<{ id: number; is_house: number }> };
            expect(json.data.length).toBe(1);
            expect(Number(json.data[0]?.is_house)).toBe(1);
            expect([12, 999]).toContain(json.data[0]?.id);
        });
    });

    describe('money: effective charge, ledger, idempotency, 80/20', () => {
        it('charges the effective price into the ledger and payout uses charged_cents', async () => {
            const db = new SqliteD1();
            await seed(db);
            await ad(db, 21, { cost: 5, targetLanguage: 'ar', funded: 100 });
            await ad(db, 22, { cost: 1, revenue: 0.01 });
            await ad(db, 24, { house: true });

            const config = {
                country_base_cents: { EG: 10 },
                multipliers: { h7: 2, targeting: 2, media: { image: 1.5 } },
            };
            const saved = await app.request('/api/admin/ad-pricing?lang=en', {
                method: 'PUT', headers: headers(ADMIN), body: JSON.stringify(config),
            }, env(db));
            expect(saved.status).toBe(200);

            const charge = await new AdCampaignManager(db as never).chargeImpression(21, 70, 5);
            expect(charge.served).toBe(true);
            expect(charge.spentCents).toBe(60);

            const impression = await db.prepare(
                'SELECT charged_cents FROM ad_impressions WHERE ad_id = 21 AND competition_id = 70'
            ).first<{ charged_cents: number }>();
            expect(impression?.charged_cents).toBe(60);

            const reserve = await db.prepare(
                `SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0) AS balance
                 FROM ledger_entries WHERE account = 'reserve:campaign_21'`
            ).first<{ balance: number }>();
            expect(reserve?.balance).toBe(40);
            const revenue = await db.prepare(
                `SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0) AS balance
                 FROM ledger_entries WHERE account = 'platform:ad_revenue'`
            ).first<{ balance: number }>();
            expect(revenue?.balance).toBe(60);

            // House + legacy charged_cents=0 rows add no paid revenue and no charge.
            await db.prepare(
                `INSERT INTO ad_impressions (ad_id, competition_id, user_id, charged_cents) VALUES (24, 70, 5, 0), (22, 70, 5, 0)`
            ).run();
            const model = new AdvertisementModel(db as never);
            expect(await model.getCompetitionRevenueCents(70)).toBe(61);

            const payout = await new LivePayoutEngine(db as never).finalizePayouts(70);
            expect(payout.total_cents).toBe(61);
            expect(payout.platform_share_cents + payout.creator_share_cents + payout.opponent_share_cents).toBe(61);
            expect(payout.platform_share_cents).toBe(13);
            expect(payout.creator_share_cents).toBe(24);
            expect(payout.opponent_share_cents).toBe(24);

            const payoutRows = await db.prepare(
                `SELECT account, direction, amount_cents FROM ledger_entries WHERE tx_id = 'payout:competition:70' ORDER BY id`
            ).all<{ account: string; direction: string; amount_cents: number }>();
            expect(payoutRows.results).toEqual(expect.arrayContaining([
                { account: 'user:2', direction: 'debit', amount_cents: 24 },
                { account: 'user:3', direction: 'debit', amount_cents: 24 },
                { account: 'platform:revenue', direction: 'debit', amount_cents: 13 },
                { account: 'reserve:payouts', direction: 'credit', amount_cents: 61 },
            ]));

            // M4: a replay cannot post a second payout transaction.
            const again = await new LivePayoutEngine(db as never).finalizePayouts(70);
            expect(again.total_cents).toBe(61);
            const payoutCount = await db.prepare(
                `SELECT COUNT(*) AS count FROM ledger_entries WHERE tx_id = 'payout:competition:70'`
            ).first<{ count: number }>();
            expect(payoutCount?.count).toBe(4);
        });

        it('no config preserves the campaign cost in the ledger', async () => {
            const db = new SqliteD1();
            await seed(db);
            await ad(db, 25, { cost: 9, funded: 100 });
            const charge = await new AdCampaignManager(db as never).chargeImpression(25, 70, 5);
            expect(charge.spentCents).toBe(9);
            const row = await db.prepare(
                'SELECT charged_cents FROM ad_impressions WHERE ad_id = 25 AND competition_id = 70'
            ).first<{ charged_cents: number }>();
            expect(row?.charged_cents).toBe(9);
        });

        it('the impression idempotency key replays without a second charge', async () => {
            const db = new SqliteD1();
            await seed(db);
            await ad(db, 23, { cost: 1, funded: 100 });
            await app.request('/api/admin/ad-pricing?lang=en', {
                method: 'PUT', headers: headers(ADMIN),
                body: JSON.stringify({ country_base_cents: { EG: 7 } }),
            }, env(db));

            const first = await app.request('/api/advertisements/23/impression?lang=en', {
                method: 'POST', headers: headers(PLAIN),
                body: JSON.stringify({ competition_id: 70, idempotency_key: 'unit36-key' }),
            }, env(db));
            expect(first.status).toBe(200);
            const firstJson = await first.json() as { data: { spentCents: number; deduped?: boolean } };
            expect(firstJson.data.spentCents).toBe(7);
            expect(firstJson.data.deduped).toBe(false);

            const second = await app.request('/api/advertisements/23/impression?lang=en', {
                method: 'POST', headers: headers(PLAIN),
                body: JSON.stringify({ competition_id: 70, idempotency_key: 'unit36-key' }),
            }, env(db));
            expect(second.status).toBe(200);
            const secondJson = await second.json() as { data: { spentCents: number; deduped: boolean } };
            expect(secondJson.data.spentCents).toBe(7);
            expect(secondJson.data.deduped).toBe(true);

            const impressions = await db.prepare(
                'SELECT COUNT(*) AS count FROM ad_impressions WHERE ad_id = 23 AND competition_id = 70'
            ).first<{ count: number }>();
            expect(impressions?.count).toBe(1);
            const dedup = await db.prepare(
                `SELECT served, spent_cents FROM ad_impression_dedup WHERE key = 'unit36-key' AND ad_id = 23`
            ).first<{ served: number; spent_cents: number }>();
            expect(dedup).toEqual({ served: 1, spent_cents: 7 });
        });

        it('splitPayoutCents conserves every integer cent and keeps 20% platform', () => {
            const split = splitPayoutCents(1001, 20, 3, 1);
            expect(split.platformCents + split.creatorCents + split.opponentCents).toBe(1001);
            expect(split.platformCents).toBe(201);
            expect(split.creatorCents).toBeGreaterThanOrEqual(split.opponentCents);
        });
    });

    describe('authorization, validation, and own-account isolation', () => {
        let db: SqliteD1;
        beforeEach(async () => {
            db = new SqliteD1();
            await seed(db);
        });

        it('policy routes require a session and ignore a smuggled user_id', async () => {
            expect((await app.request('/api/advertisements/policy?lang=en', { headers: headers() }, env(db))).status).toBe(401);
            expect((await app.request('/api/advertisements/policy?lang=en', {
                method: 'PUT', headers: headers(), body: JSON.stringify({ mode: 'block' }),
            }, env(db))).status).toBe(401);

            const put = await app.request('/api/advertisements/policy?lang=en', {
                method: 'PUT', headers: headers(PLAIN), body: JSON.stringify({ mode: 'block', user_id: 2 }),
            }, env(db));
            expect(put.status).toBe(200);
            const model = new UserAdPolicyModel(db as never);
            expect(await model.getMode(5)).toBe('block');
            expect(await model.getMode(2)).toBe('auto');

            const get = await app.request('/api/advertisements/policy?lang=en', { headers: headers(PLAIN) }, env(db));
            expect(get.status).toBe(200);
            const json = await get.json() as { data: { mode: string } };
            expect(json.data.mode).toBe('block');
        });

        it('rejects invalid modes and grant payloads, and returns 404 for missing ads', async () => {
            expect((await app.request('/api/advertisements/policy?lang=en', {
                method: 'PUT', headers: headers(PLAIN), body: JSON.stringify({ mode: 'nope' }),
            }, env(db))).status).toBe(422);
            expect((await app.request('/api/advertisements/grants?lang=en', {
                method: 'POST', headers: headers(), body: JSON.stringify({ ad_id: 1 }),
            }, env(db))).status).toBe(401);
            expect((await app.request('/api/advertisements/grants?lang=en', {
                method: 'POST', headers: headers(PLAIN), body: JSON.stringify({ ad_id: 0 }),
            }, env(db))).status).toBe(422);
            expect((await app.request('/api/advertisements/grants?lang=en', {
                method: 'POST', headers: headers(PLAIN), body: JSON.stringify({ ad_id: 9999 }),
            }, env(db))).status).toBe(404);
        });

        it('grants only paid ads and stores them on the session user only', async () => {
            await ad(db, 11, { cost: 5 });
            await ad(db, 12, { house: true });
            expect((await app.request('/api/advertisements/grants?lang=en', {
                method: 'POST', headers: headers(PLAIN), body: JSON.stringify({ ad_id: 12 }),
            }, env(db))).status).toBe(422);
            expect((await app.request('/api/advertisements/grants?lang=en', {
                method: 'POST', headers: headers(PLAIN), body: JSON.stringify({ ad_id: 11 }),
            }, env(db))).status).toBe(200);

            const model = new UserAdPolicyModel(db as never);
            expect(await model.listGrantIds(5)).toEqual([11]);
            expect(await model.listGrantIds(2)).toEqual([]);

            expect((await app.request('/api/advertisements/grants/11?lang=en', {
                method: 'DELETE', headers: headers(PLAIN),
            }, env(db))).status).toBe(200);
            expect(await model.listGrantIds(5)).toEqual([]);
        });

        it('pricing and house creation reject guests 401 and non-admins 403', async () => {
            expect((await app.request('/api/admin/ad-pricing?lang=en', { headers: headers() }, env(db))).status).toBe(401);
            expect((await app.request('/api/admin/ad-pricing?lang=en', {
                method: 'PUT', headers: headers(), body: JSON.stringify({}),
            }, env(db))).status).toBe(401);
            expect((await app.request('/api/admin/ad-pricing?lang=en', { headers: headers(PLAIN) }, env(db))).status).toBe(403);
            expect((await app.request('/api/admin/ad-pricing?lang=en', {
                method: 'PUT', headers: headers(PLAIN), body: JSON.stringify({}),
            }, env(db))).status).toBe(403);
            expect((await app.request('/api/admin/ads/house?lang=en', {
                method: 'POST', headers: headers(),
                body: JSON.stringify({ title: 'H', media_kind: 'image', media_url: 'https://e.test/a.png', link_url: 'https://e.test' }),
            }, env(db))).status).toBe(401);
            expect((await app.request('/api/admin/ads/house?lang=en', {
                method: 'POST', headers: headers(PLAIN),
                body: JSON.stringify({ title: 'H', media_kind: 'image', media_url: 'https://e.test/a.png', link_url: 'https://e.test' }),
            }, env(db))).status).toBe(403);
        });

        it('admin pricing validates, normalizes, saves, and clears knobs', async () => {
            const initial = await app.request('/api/admin/ad-pricing?lang=en', { headers: headers(ADMIN) }, env(db));
            expect(initial.status).toBe(200);
            expect((await initial.json() as { data: { config: unknown } }).data.config).toEqual({});

            expect((await app.request('/api/admin/ad-pricing?lang=en', {
                method: 'PUT', headers: headers(ADMIN),
                body: JSON.stringify({ unknown_knob: 1 }),
            }, env(db))).status).toBe(422);
            expect((await app.request('/api/admin/ad-pricing?lang=en', {
                method: 'PUT', headers: headers(ADMIN),
                body: JSON.stringify({ country_base_cents: { EG: -1 } }),
            }, env(db))).status).toBe(422);

            const saved = await app.request('/api/admin/ad-pricing?lang=en', {
                method: 'PUT', headers: headers(ADMIN),
                body: JSON.stringify({ country_base_cents: { eg: 10 }, multipliers: { h7: 2 } }),
            }, env(db));
            expect(saved.status).toBe(200);
            const savedJson = await saved.json() as { data: { config: { country_base_cents: Record<string, number> } } };
            expect(savedJson.data.config.country_base_cents).toEqual({ EG: 10 });

            const read = await app.request('/api/admin/ad-pricing?lang=en', { headers: headers(ADMIN) }, env(db));
            const readJson = await read.json() as { data: { config: { country_base_cents: Record<string, number> } } };
            expect(readJson.data.config.country_base_cents).toEqual({ EG: 10 });

            expect((await app.request('/api/admin/ad-pricing?lang=en', {
                method: 'PUT', headers: headers(ADMIN), body: JSON.stringify({}),
            }, env(db))).status).toBe(200);
            expect(await new AdvertisementModel(db as never).countActiveHouse()).toBe(0);
        });

        it('house creation validates media/duration and stops at three active ads', async () => {
            const post = (body: Record<string, unknown>) => app.request('/api/admin/ads/house?lang=en', {
                method: 'POST', headers: headers(ADMIN), body: JSON.stringify(body),
            }, env(db));

            expect((await post({
                title: 'Bad media', media_kind: 'audio', media_url: 'https://e.test/a.png', link_url: 'https://e.test',
            })).status).toBe(422);
            expect((await post({
                title: 'Bad URL', media_kind: 'image', media_url: 'javascript:alert(1)', link_url: 'https://e.test',
            })).status).toBe(422);
            expect((await post({
                title: 'Bad duration', media_kind: 'video', media_url: 'https://e.test/a.mp4',
                link_url: 'https://e.test', duration_sec: MAX_DURATION_SECONDS + 1,
            })).status).toBe(422);
            expect((await post({
                title: 'Duration on image', media_kind: 'image', media_url: 'https://e.test/a.png',
                link_url: 'https://e.test', duration_sec: 15,
            })).status).toBe(422);

            for (let n = 0; n < 3; n++) {
                expect((await post({
                    title: 'House ' + n,
                    media_kind: n === 2 ? 'video' : 'image',
                    media_url: n === 2 ? 'https://e.test/h.mp4' : 'https://e.test/h.png',
                    link_url: 'https://e.test',
                    duration_sec: n === 2 ? 15 : undefined,
                })).status).toBe(201);
            }
            expect((await post({
                title: 'House 4', media_kind: 'gif', media_url: 'https://e.test/h.gif', link_url: 'https://e.test',
            })).status).toBe(422);
            expect(await new AdvertisementModel(db as never).countActiveHouse()).toBe(3);
        });
    });

    describe('media and one fixed slot', () => {
        it('advertiser campaigns persist image/GIF/video kind and video duration', async () => {
            const db = new SqliteD1();
            await seed(db);
            const created = await app.request('/api/advertiser/campaigns?lang=en', {
                method: 'POST', headers: headers(PLAIN),
                body: JSON.stringify({
                    title: 'Video campaign', budget_cents: 100, cost_per_impression_cents: 1,
                    media_kind: 'video', duration_sec: 15, image_url: 'https://e.test/v.mp4',
                }),
            }, env(db));
            expect(created.status).toBe(201);
            const row = await db.prepare(
                `SELECT media_kind, duration_sec FROM advertisements WHERE title = 'Video campaign'`
            ).first<{ media_kind: string; duration_sec: number }>();
            expect(row).toEqual({ media_kind: 'video', duration_sec: 15 });
        });

        it('rejects invalid media kinds and duration on non-video campaigns', async () => {
            const db = new SqliteD1();
            await seed(db);
            const invalidMedia = await app.request('/api/advertiser/campaigns?lang=en', {
                method: 'POST', headers: headers(PLAIN),
                body: JSON.stringify({ title: 'X', budget_cents: 100, cost_per_impression_cents: 1, media_kind: 'audio' }),
            }, env(db));
            expect(invalidMedia.status).toBe(422);
            const invalidDuration = await app.request('/api/advertiser/campaigns?lang=en', {
                method: 'POST', headers: headers(PLAIN),
                body: JSON.stringify({
                    title: 'X', budget_cents: 100, cost_per_impression_cents: 1,
                    media_kind: 'image', duration_sec: 15,
                }),
            }, env(db));
            expect(invalidDuration.status).toBe(422);
        });

        it('the fixed competition slot renders image/GIF in an img and video in a video element', () => {
            const page = readFileSync(resolve(__dirname, '../../src/modules/pages/competition-page.ts'), 'utf8');
            expect(page).toContain("document.createElement('video')");
            expect(page).toContain("document.createElement('img')");
            expect(page).toContain("aspect-video");
            expect(page).toContain("ad.media_kind || 'image'");
            expect(page).toContain("video.src = mediaUrl");
            expect(page).toContain("img.src = mediaUrl");
        });
    });

    it('stored config has the documented setting key and is never seeded', async () => {
        const db = new SqliteD1();
        await seed(db);
        const setting = await db.prepare('SELECT setting_value FROM platform_settings WHERE setting_key = ?')
            .bind(AD_PRICING_SETTING_KEY).first<{ setting_value: string }>();
        expect(setting).toBeNull();
        expect((await app.request('/api/admin/ad-pricing?lang=en', {
            method: 'PUT', headers: headers(ADMIN),
            body: JSON.stringify({ multipliers: { h7: 1 } }),
        }, env(db))).status).toBe(200);
        const stored = await db.prepare('SELECT setting_value FROM platform_settings WHERE setting_key = ?')
            .bind(AD_PRICING_SETTING_KEY).first<{ setting_value: string }>();
        expect(parseAdPricingConfig(stored?.setting_value ?? null)).toEqual({ multipliers: { h7: 1 } });
    });
});
