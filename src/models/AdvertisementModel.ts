/**
 * @file src/models/AdvertisementModel.ts
 * @description نموذج الإعلانات والأرباح
 * @module models/AdvertisementModel
 */

import { D1Database } from '@cloudflare/workers-types';
import { BaseModel } from './base/BaseModel';

/**
 * Advertisement Interface
 * Lifecycle state (9.A): draft → pending_review → active → paused → ended.
 * Column mapping (migrations 0025+0026 carry-over):
 * - 0025 rebuilds the table with campaign_status carrying the FIVE lifecycle
 *   states (new rows); 0026 backfills legacy rows — both write the SAME column.
 * - 0025 drops the legacy REAL money columns; 0026 preserves them as pure
 *   metadata. budget_cents / cost_per_impression_cents are the integer-cents
 *   config. Runtime money lives ONLY in ledger_entries (LedgerService).
 * - For 0026-carried legacy rows the lifecycle state is read from
 *   campaign_lifecycle_status via statusColumn(); DROP-free and additive only.
 */
export interface Advertisement {
    id: number;
    title: string;
    image_url: string | null;
    link_url: string | null;
    is_active: number;
    views_count: number;
    clicks_count: number;
    revenue_per_view: number;
    created_by: number;
    created_at: string;
    advertiser_id: number | null;
    budget: number;
    budget_remaining: number;
    budget_cents: number;
    cost_per_impression_cents: number;
    target_language: string | null;
    target_country: string | null;
    target_category_id: number | null;
    campaign_lifecycle_status: 'draft' | 'pending_review' | 'active' | 'paused' | 'ended';
    campaign_status: string;
}

/**
 * Ad Impression Interface
 */
export interface AdImpression {
    id: number;
    ad_id: number;
    competition_id: number;
    user_id: number | null;
    created_at: string;
}

/**
 * Ad Click Token Interface (Phase 9.C anti-fraud).
 * Server-issued, single-use, expiring. Opaque random bearer — no secret
 * material ever reaches the client; validity is checked against this table.
 */
export interface AdClickToken {
    id: number;
    ad_id: number;
    user_id: number | null;
    token: string;
    expires_at: string;
    consumed_at: string | null;
    created_at: string;
    /** Rate identity the token was minted for (0028: 'user:<id>' | 'ip:<...>' | 'anon'). */
    mint_key: string | null;
}

/**
 * Counted Ad Click Interface (Phase 9.C).
 * One row per COUNTED click, written atomically with the token consumption.
 */
export interface AdClick {
    id: number;
    ad_id: number;
    user_id: number | null;
    token: string;
    created_at: string;
}

export type ClickRedeemOutcome = 'ok' | 'invalid' | 'expired' | 'reused';

/**
 * User Earnings Interface
 */
export interface UserEarnings {
    id: number;
    user_id: number;
    competition_id: number;
    amount: number;
    status: 'pending' | 'paid';
    created_at: string;
}

/**
 * Advertisement Model Class
 * نموذج الإعلانات
 */
export class AdvertisementModel extends BaseModel<Advertisement> {
    protected readonly tableName = 'advertisements';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<Advertisement>): Promise<Advertisement> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} 
            (title, image_url, link_url, is_active, revenue_per_view, created_by, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `).bind(
            data.title,
            data.image_url || null,
            data.link_url || null,
            data.is_active ?? 1,
            data.revenue_per_view || 0.001,
            data.created_by,
            now
        ).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create advertisement');
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<Advertisement>): Promise<Advertisement | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.title !== undefined) {
            updates.push('title = ?');
            values.push(data.title);
        }
        if (data.image_url !== undefined) {
            updates.push('image_url = ?');
            values.push(data.image_url);
        }
        if (data.link_url !== undefined) {
            updates.push('link_url = ?');
            values.push(data.link_url);
        }
        if (data.is_active !== undefined) {
            updates.push('is_active = ?');
            values.push(data.is_active);
        }
        if (data.revenue_per_view !== undefined) {
            updates.push('revenue_per_view = ?');
            values.push(data.revenue_per_view);
        }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        await this.db.prepare(
            `UPDATE ${this.tableName} SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }

    /**
     * Get active ads — serving-safe selection.
     * Budget exhaustion is enforced by a SQL condition on the ledger balance
     * (LedgerService = source of truth): a depleted campaign stops being
     * selected ATOMICALLY, with no later JS check.
          * Lifecycle state is read from campaign_lifecycle_status (new rows) with
     * fallback to campaign_status (legacy rows) — see docs/02-DATABASE.md §9.A remediation.
     */
    async getActiveAds(limit: number = 5): Promise<Advertisement[]> {
        const result = await this.db.prepare(`
            SELECT * FROM ${this.tableName}
            WHERE is_active = 1
                            AND (CASE WHEN campaign_lifecycle_status IN ('draft', 'pending_review', 'active', 'paused', 'ended')
                    THEN campaign_lifecycle_status ELSE campaign_status END) = 'active'
              AND (
                SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0)
                FROM ledger_entries
                WHERE account = 'reserve:campaign_' || ${this.tableName}.id
              ) >= cost_per_impression_cents
            ORDER BY RANDOM()
            LIMIT ?
        `).bind(limit).all<Advertisement>();
        return result.results || [];
    }

    /**
     * Targeted serving selection (Phase 9.B).
     *
     * One SQL statement enforcing, server-side:
     * - 9.A lifecycle state = 'active' AND ledger budget covers one impression
     *   (same atomic guard as getActiveAds — LedgerService stays the money SSOT)
     * - targeting: NULL target = no restriction (same semantics as 0003
     *   target_language / target_country); otherwise exact match on the
     *   competition-derived language / country / category
     * - AdBlockModel exclusion: the viewer's blocked ads never match
     * - frequency cap: ads the viewer already saw `frequencyCap` times in the
     *   trailing 24h (existing ad_impressions rows only — no new tracking)
     */
    async getTargetedAds(opts: {
        language?: string | null;
        country?: string | null;
        categoryId?: number | null;
        blockedForUserId?: number | null;
        frequencyCap?: number | null;
        cappedForUserId?: number | null;
        limit?: number;
    }): Promise<Advertisement[]> {
        const limit = Math.max(1, Math.min(opts.limit ?? 5, 50));
        const params: unknown[] = [];
        let sql = `
            SELECT * FROM ${this.tableName}
            WHERE is_active = 1
              AND (CASE WHEN campaign_lifecycle_status IN ('draft', 'pending_review', 'active', 'paused', 'ended')
                    THEN campaign_lifecycle_status ELSE campaign_status END) = 'active'
              AND (
                SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0)
                FROM ledger_entries
                WHERE account = 'reserve:campaign_' || ${this.tableName}.id
              ) >= cost_per_impression_cents
        `;

        if (opts.language !== undefined && opts.language !== null) {
            sql += ` AND (target_language IS NULL OR target_language = ?)`;
            params.push(opts.language);
        }
        if (opts.country !== undefined && opts.country !== null) {
            sql += ` AND (target_country IS NULL OR target_country = ?)`;
            params.push(opts.country);
        }
        if (opts.categoryId !== undefined && opts.categoryId !== null) {
            sql += ` AND (target_category_id IS NULL OR target_category_id = ?)`;
            params.push(opts.categoryId);
        }
        if (opts.blockedForUserId !== undefined && opts.blockedForUserId !== null) {
            sql += ` AND id NOT IN (SELECT ad_id FROM ad_blocks WHERE user_id = ?)`;
            params.push(opts.blockedForUserId);
        }
        if (
            opts.frequencyCap !== undefined && opts.frequencyCap !== null &&
            opts.cappedForUserId !== undefined && opts.cappedForUserId !== null
        ) {
            sql += ` AND (
                SELECT COUNT(*) FROM ad_impressions
                WHERE ad_impressions.ad_id = ${this.tableName}.id
                  AND ad_impressions.user_id = ?
                  AND ad_impressions.created_at >= datetime('now', '-1 day')
            ) < ?`;
            params.push(opts.cappedForUserId, opts.frequencyCap);
        }

        sql += ` ORDER BY RANDOM() LIMIT ?`;
        params.push(limit);

        const result = await this.db.prepare(sql).bind(...params).all<Advertisement>();
        return result.results || [];
    }

    /**
     * Impressions of one ad seen by one user in the trailing 24h.
     * Backs the server-side frequency-cap guard on the impression route, so a
     * tampered client cannot exceed the cap by calling the API directly.
     */
    async countRecentImpressions(adId: number, userId: number): Promise<number> {
        const row = await this.db.prepare(`
            SELECT COUNT(*) as count FROM ad_impressions
            WHERE ad_id = ? AND user_id = ?
              AND created_at >= datetime('now', '-1 day')
        `).bind(adId, userId).first<{ count: number }>();
        return row?.count ?? 0;
    }

    /**
     * Record ad impression
     */
    async recordImpression(adId: number, competitionId: number, userId: number | null): Promise<void> {
        const now = new Date().toISOString();
        await this.db.prepare(`
            INSERT INTO ad_impressions (ad_id, competition_id, user_id, created_at)
            VALUES (?, ?, ?, ?)
        `).bind(adId, competitionId, userId, now).run();

        // Increment views count
        await this.db.prepare(`
            UPDATE ${this.tableName} SET views_count = views_count + 1 WHERE id = ?
        `).bind(adId).run();
    }

    /**
     * Record ad click (legacy counter bump — kept for backward compatibility).
     * 9.C counting happens in redeemClickToken(); analytics NEVER reads this
     * counter (see countClicks/adSpendCents below).
     */
    async recordClick(adId: number): Promise<void> {
        await this.db.prepare(`
            UPDATE ${this.tableName} SET clicks_count = clicks_count + 1 WHERE id = ?
        `).bind(adId).run();
    }

    /**
     * 9.C — counted impressions: rows paired 1:1 with ledger charges inside
     * chargeImpression's atomic batch. Survives counter tampering by design.
     */
    async countImpressions(adId: number): Promise<number> {
        const row = await this.db.prepare(`
            SELECT COUNT(*) as count FROM ad_impressions WHERE ad_id = ?
        `).bind(adId).first<{ count: number }>();
        return row?.count ?? 0;
    }

    /**
     * 9.C — counted clicks: rows written atomically with token consumption.
     * The legacy clicks_count column is NOT consulted.
     */
    async countClicks(adId: number): Promise<number> {
        const row = await this.db.prepare(`
            SELECT COUNT(*) as count FROM ad_clicks WHERE ad_id = ?
        `).bind(adId).first<{ count: number }>();
        return row?.count ?? 0;
    }

    /**
     * 9.C — spend in integer cents, summed DIRECTLY from the ledger deductions
     * (LedgerService stays the money SSOT): every chargeImpression writes one
     * 'credit' leg on reserve:campaign_<id> with ref_type='ad_impression'.
     * No floating point anywhere in the money path.
     */
    async adSpendCents(adId: number): Promise<number> {
        const row = await this.db.prepare(`
            SELECT COALESCE(SUM(amount_cents), 0) as total FROM ledger_entries
            WHERE account = ? AND ref_type = 'ad_impression' AND direction = 'credit'
        `).bind(`reserve:campaign_${adId}`).first<{ total: number }>();
        return row?.total ?? 0;
    }

    /**
     * 9.C remediation — mint a single-use click token bound to (ad,
     * server-side identity), with an ATOMIC live-token cap per mint identity.
     * The INSERT fires only while fewer than maxLiveTokens live (unconsumed,
     * unexpired) tokens exist for (ad_id, mint_key) — count and write in ONE
     * statement, so concurrent minters cannot overshoot and no 500 arises.
     * Returns null when the cap is hit (caller maps to 429). Expiry is stamped
     * in SQL clock time so comparisons never mix formats.
     */
    async createClickToken(
        adId: number,
        userId: number | null,
        mintKey: string,
        token: string,
        maxLiveTokens: number
    ): Promise<AdClickToken | null> {
        const inserted = await this.db.prepare(`
            INSERT INTO ad_click_tokens (ad_id, user_id, mint_key, token, expires_at, consumed_at)
            SELECT ?, ?, ?, ?, datetime('now', '+10 minutes'), NULL
            WHERE (SELECT COUNT(*) FROM ad_click_tokens
                   WHERE ad_id = ? AND mint_key = ?
                     AND consumed_at IS NULL AND expires_at > datetime('now')) < ?
        `).bind(adId, userId, mintKey, token, adId, mintKey, maxLiveTokens).run();
        const changes = (inserted.meta as { changes?: number } | undefined)?.changes ?? 0;
        if (changes !== 1) return null;
        const row = await this.db.prepare(`
            SELECT * FROM ad_click_tokens WHERE token = ?
        `).bind(token).first<AdClickToken>();
        if (!row) throw new Error('Failed to create click token');
        return row;
    }

    /**
     * 9.C — atomically consume a click token and record the counted click.
     * Enforcement lives in the guarded UPDATE (consumed_at IS NULL AND not
     * expired): concurrent redemptions of the same token serialize and only
     * one wins; the click row + legacy counter bump fire only for the winner.
     * The recorded user_id is the token's bound identity — never caller input.
     */
    async redeemClickToken(adId: number, token: string, callerUserId: number | null): Promise<ClickRedeemOutcome> {
        const row = await this.db.prepare(`
            SELECT * FROM ad_click_tokens WHERE token = ? AND ad_id = ?
        `).bind(token, adId).first<AdClickToken>();
        if (!row) return 'invalid';
        // Token bound to a session identity cannot be spent by another identity.
        if (row.user_id !== null && row.user_id !== callerUserId) return 'invalid';
        if (row.consumed_at !== null) return 'reused';
        const fresh = await this.db.prepare(`
            SELECT 1 as ok FROM ad_click_tokens
            WHERE token = ? AND expires_at > datetime('now')
        `).bind(token).first<{ ok: number }>();
        if (!fresh) return 'expired';

        // Race design: every contender passes the SELECT pre-checks above, then
        // these serialized batches decide the single winner. The INSERT carries
        // NOT EXISTS(ad_clicks.token) so losers insert ZERO rows instead of
        // throwing a UNIQUE violation (which would surface as a 500); the
        // UNIQUE(token) constraint stays as a backstop. Winner = consume
        // statement changed exactly one row.
        const results = await this.db.batch([
            this.db.prepare(`
                UPDATE ad_click_tokens SET consumed_at = datetime('now')
                WHERE token = ? AND consumed_at IS NULL AND expires_at > datetime('now')
            `).bind(token),
            this.db.prepare(`
                INSERT INTO ad_clicks (ad_id, user_id, token)
                SELECT ?, ?, ?
                WHERE EXISTS (SELECT 1 FROM ad_click_tokens WHERE token = ? AND consumed_at IS NOT NULL)
                  AND NOT EXISTS (SELECT 1 FROM ad_clicks WHERE token = ?)
            `).bind(adId, row.user_id, token, token, token)
        ]);
        const consumed = (results[0].meta as { changes?: number } | undefined)?.changes ?? 0;
        if (consumed !== 1) return 'reused';
        // Legacy display counter only (analytics never reads it) — bumped
        // after the atomic decision so losers can never inflate it.
        await this.db.prepare(`
            UPDATE ${this.tableName} SET clicks_count = clicks_count + 1 WHERE id = ?
        `).bind(adId).run();
        return 'ok';
    }

    /**
     * 9.C — impression idempotency lookup. A key only deduplicates within the
     * approved 24h repeat window (same window family as the 9.B cap day) for
     * the same ad + same server-side identity. Legacy callers that send no
     * key keep exact 9.A/9.B behavior.
     */
    async findImpressionKey(key: string, adId: number, userId: number | null): Promise<{ served: number; spent_cents: number } | null> {
        const row = await this.db.prepare(`
            SELECT served, spent_cents FROM ad_impression_dedup
            WHERE key = ? AND ad_id = ? AND user_id IS ? AND created_at >= datetime('now', '-1 day')
        `).bind(key, adId, userId).first<{ served: number; spent_cents: number }>();
        return row ?? null;
    }

    /**
     * 9.C remediation — claim an impression idempotency key for the composite
     * identity (key, ad, user) enforced by 0028's UNIQUE index. Returns false
     * ONLY when the same identity already claimed it inside the window (caller
     * must replay instead of charging again); the same key for another ad or
     * identity inserts cleanly. Stale claims (>24h, same identity) are released
     * so keys stay bounded and the approved window is honored.
     */
    async claimImpressionKey(key: string, adId: number, userId: number | null): Promise<boolean> {
        await this.db.prepare(`
            DELETE FROM ad_impression_dedup
            WHERE key = ? AND ad_id = ? AND user_id IS ? AND created_at < datetime('now', '-1 day')
        `).bind(key, adId, userId).run();
        try {
            await this.db.prepare(`
                INSERT INTO ad_impression_dedup (key, ad_id, user_id, served, spent_cents)
                VALUES (?, ?, ?, 0, 0)
            `).bind(key, adId, userId).run();
            return true;
        } catch {
            return false;
        }
    }

    /** 9.C — store the charge outcome on a claimed key for duplicate replays. */
    async settleImpressionKey(key: string, served: boolean, spentCents: number): Promise<void> {
        await this.db.prepare(`
            UPDATE ad_impression_dedup SET served = ?, spent_cents = ? WHERE key = ?
        `).bind(served ? 1 : 0, spentCents, key).run();
    }

    /**
     * Get total revenue for a competition
     */
    async getCompetitionRevenue(competitionId: number): Promise<number> {
        const result = await this.db.prepare(`
            SELECT SUM(a.revenue_per_view) as total
            FROM ad_impressions i
            JOIN ${this.tableName} a ON i.ad_id = a.id
            WHERE i.competition_id = ?
        `).bind(competitionId).first<{ total: number | null }>();
        return result?.total || 0;
    }
}

/**
 * Earnings Model Class
 * نموذج الأرباح
 */
export class EarningsModel extends BaseModel<UserEarnings> {
    protected readonly tableName = 'user_earnings';

    constructor(db: D1Database) {
        super(db);
    }

    /**
     * Create - required by BaseModel
     */
    async create(data: Partial<UserEarnings>): Promise<UserEarnings> {
        const now = new Date().toISOString();
        const result = await this.db.prepare(`
            INSERT INTO ${this.tableName} (user_id, competition_id, amount, status, created_at)
            VALUES (?, ?, ?, 'pending', ?)
        `).bind(data.user_id, data.competition_id, data.amount, now).run();

        if (result.success && result.meta.last_row_id) {
            return (await this.findById(result.meta.last_row_id))!;
        }
        throw new Error('Failed to create earnings');
    }

    /**
     * Update - required by BaseModel
     */
    async update(id: number, data: Partial<UserEarnings>): Promise<UserEarnings | null> {
        if (data.status !== undefined) {
            await this.db.prepare(`
                UPDATE ${this.tableName} SET status = ? WHERE id = ?
            `).bind(data.status, id).run();
        }
        return this.findById(id);
    }

    /**
     * Get user's total earnings
     */
    async getUserTotalEarnings(userId: number): Promise<{ pending: number; paid: number; total: number }> {
        const result = await this.db.prepare(`
            SELECT 
                SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as paid,
                SUM(amount) as total
            FROM ${this.tableName}
            WHERE user_id = ?
        `).bind(userId).first<{ pending: number; paid: number; total: number }>();
        return result || { pending: 0, paid: 0, total: 0 };
    }

    /**
     * Get user's earnings history
     */
    async getUserEarnings(userId: number, limit: number = 20, offset: number = 0): Promise<UserEarnings[]> {
        const result = await this.db.prepare(`
            SELECT e.*, c.title as competition_title
            FROM ${this.tableName} e
            LEFT JOIN competitions c ON e.competition_id = c.id
            WHERE e.user_id = ?
            ORDER BY e.created_at DESC
            LIMIT ? OFFSET ?
        `).bind(userId, limit, offset).all<UserEarnings>();
        return result.results || [];
    }

    /**
     * Calculate and distribute earnings for a competition
     * 80% to competitors (based on rating ratio), 20% to platform
     */
    async calculateAndDistribute(
        competitionId: number,
        creatorId: number,
        opponentId: number,
        creatorRating: number,
        opponentRating: number,
        totalRevenue: number
    ): Promise<void> {
        const competitorShare = totalRevenue * 0.8; // 80% to competitors
        const totalRating = creatorRating + opponentRating;

        if (totalRating === 0) {
            // Equal split if no ratings
            const half = competitorShare / 2;
            await this.create({ user_id: creatorId, competition_id: competitionId, amount: half });
            await this.create({ user_id: opponentId, competition_id: competitionId, amount: half });
        } else {
            // Split based on rating ratio
            const creatorShare = competitorShare * (creatorRating / totalRating);
            const opponentShare = competitorShare * (opponentRating / totalRating);
            await this.create({ user_id: creatorId, competition_id: competitionId, amount: creatorShare });
            await this.create({ user_id: opponentId, competition_id: competitionId, amount: opponentShare });
        }
    }
}

export default AdvertisementModel;
