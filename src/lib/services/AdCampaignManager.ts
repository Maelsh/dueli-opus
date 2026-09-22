import { AdvertisementModel, Advertisement } from '../../models/AdvertisementModel';
import { PlatformFinancialLogModel } from '../../models/PlatformFinancialLogModel';
import { PlatformSettingsModel } from '../../models/PlatformSettingsModel';
import { LedgerService } from './LedgerService';

/**
 * Phase 9.A — guarded campaign lifecycle:
 *   draft → pending_review → active → paused → ended
 * Transitions are enforced in SQL (UPDATE ... WHERE campaign_status IN (...)),
 * not by JS checks — the safety layer itself rejects invalid transitions.
 */
export type CampaignStatus = 'draft' | 'pending_review' | 'active' | 'paused' | 'ended';

export const CAMPAIGN_TRANSITIONS: Record<CampaignStatus, CampaignStatus[]> = {
    draft: ['pending_review'],
    pending_review: ['active'],
    active: ['paused', 'ended'],
    paused: ['active', 'ended'],
    ended: []
};

/** Ledger account holding a campaign's budget (LedgerService = money SSOT). */
export const campaignAccount = (adId: number): string => `reserve:campaign_${adId}`;
/** Liability account the advertiser's declared budget is committed against. */
const BUDGET_COMMITMENT_ACCOUNT = 'platform:ad_budget_commitments';
/** Platform revenue account each impression cost is credited to. */
const AD_REVENUE_ACCOUNT = 'platform:ad_revenue';

export interface CampaignAnalytics {
    ad_id: number;
    title: string;
    budget: number;
    budget_remaining: number;
    total_impressions: number;
    total_clicks: number;
    total_spend: number;
    ctr: number;
    campaign_status: string;
    target_language: string | null;
    target_country: string | null;
}

export interface AdvertiserDashboard {
    total_campaigns: number;
    active_campaigns: number;
    total_budget: number;
    total_remaining: number;
    total_impressions: number;
    total_clicks: number;
    campaigns: CampaignAnalytics[];
}

export interface ImpressionChargeResult {
    served: boolean;
    budgetExhausted: boolean;
    spentCents: number;
}

export class AdCampaignManager {
    private adModel: AdvertisementModel;
    private settingsModel: PlatformSettingsModel;
    private financialModel: PlatformFinancialLogModel;
    private ledger: LedgerService;
    private readonly database: D1Database;

    constructor(db: D1Database) {
        this.adModel = new AdvertisementModel(db);
        this.settingsModel = new PlatformSettingsModel(db);
        this.financialModel = new PlatformFinancialLogModel(db);
        this.ledger = new LedgerService(db);
        this.database = db;
    }

    private db(): D1Database {
        return this.database;
    }

    /** Available campaign budget in integer cents — read from the ledger only. */
    async budgetBalanceCents(adId: number): Promise<number> {
        return this.ledger.balance(campaignAccount(adId));
    }

    /**
     * Create a campaign in `draft` with a ledger-funded budget.
     * The declared budget is booked as one balanced ledger transaction:
     * debit reserve:campaign_<id> (+budget available) /
     * credit platform:ad_budget_commitments (liability).
     * No parallel money column is written; the ledger is the only source.
     */
    async createCampaign(data: {
        title: string;
        image_url?: string;
        link_url?: string;
        budget_cents: number;
        cost_per_impression_cents?: number;
        target_language?: string;
        target_country?: string;
        target_category_id?: number;
        advertiser_id: number;
    }): Promise<Advertisement> {
        if (!Number.isInteger(data.budget_cents) || data.budget_cents <= 0) {
            throw new Error('budget_cents must be a positive integer');
        }
        const cost = data.cost_per_impression_cents ?? 1;
        if (!Number.isInteger(cost) || cost <= 0) {
            throw new Error('cost_per_impression_cents must be a positive integer');
        }

        const ad = await this.adModel.create({
            title: data.title,
            image_url: data.image_url || null,
            link_url: data.link_url || null,
            is_active: 0, // draft: never selectable until approved
            revenue_per_view: cost / 100,
            created_by: data.advertiser_id
        });

        await this.db().prepare(`
            UPDATE advertisements SET
                advertiser_id = ?,
                budget_cents = ?,
                cost_per_impression_cents = ?,
                target_language = ?,
                target_country = ?,
                target_category_id = ?,
                                campaign_lifecycle_status = 'draft'
            WHERE id = ?
        `).bind(
            data.advertiser_id,
            data.budget_cents,
            cost,
            data.target_language || null,
            data.target_country || null,
            data.target_category_id ?? null,
            ad.id
        ).run();

        // Fund the campaign budget through the LedgerService (M2 atomic batch,
        // M4 idempotent tx key). Balanced (M1) and debit-positive: the campaign
        // reserve is debited (+budget available) and the commitment liability
        // is credited. Balance semantics follow LedgerService.withdraw().
        await this.ledger.post({
            txId: `ad_campaign_fund_${ad.id}`,
            createdBy: `user:${data.advertiser_id}`,
            ref: { ref_type: 'ad_campaign', ref_id: ad.id },
            entries: [
                { account: campaignAccount(ad.id), direction: 'debit', amountCents: data.budget_cents },
                { account: BUDGET_COMMITMENT_ACCOUNT, direction: 'credit', amountCents: data.budget_cents }
            ]
        });

                const created = (await this.adModel.findById(ad.id))!;
        return { ...created, campaign_status: lifecycleStatus(created) };
    }

    /**
     * Guarded status transition — the guard lives in SQL:
     * the UPDATE only fires when the current status is one of the allowed
     * `from` states (and, optionally, owned by the given advertiser).
          * Writes ONLY campaign_lifecycle_status (the unconstrained lifecycle
     * column added by 0025): the legacy campaign_status column retains the
     * 0003 CHECK ('active'/'paused'/'depleted'/'archived') and is NEVER
     * written with draft/pending_review/ended. The guard reads the effective
     * lifecycle state via the CASE over both columns.
     * Returns the fresh row, or null when the guard rejected the transition.
     */
    private async guardedTransition(
        adId: number,
        from: CampaignStatus[],
        to: CampaignStatus,
        opts: { advertiserId?: number; isActive?: number } = {}
    ): Promise<Advertisement | null> {
        const fromList = from.map(() => '?').join(', ');
        // Lifecycle-priority guard: when campaign_lifecycle_status is set it is
        // authoritative (0026-carried legacy rows); otherwise campaign_status.
        const guard = `(CASE WHEN campaign_lifecycle_status IN ('draft', 'pending_review', 'active', 'paused', 'ended')
            THEN campaign_lifecycle_status ELSE campaign_status END) IN (${fromList})`;
                let sql = `UPDATE advertisements SET campaign_lifecycle_status = ?`;
        const params: unknown[] = [to];
        if (opts.isActive !== undefined) {
            sql += `, is_active = ?`;
            params.push(opts.isActive);
        }
        sql += ` WHERE id = ? AND ${guard}`;
        params.push(adId, ...from);
        if (opts.advertiserId !== undefined) {
            sql += ` AND advertiser_id = ?`;
            params.push(opts.advertiserId);
        }
        const result = await this.db().prepare(sql).bind(...params).run();
        if (!result.success || (result.meta.changes ?? 0) === 0) {
                        return null; // guard rejected: invalid transition or not the owner
        }
                const ad = await this.adModel.findById(adId);
        if (!ad) return null;
        return { ...ad, campaign_status: lifecycleStatus(ad) };
    }

    /**
     * Advertiser: draft → pending_review. No ownership guard — any authenticated
     * advertisers may submit their draft for review; the transition guard still
     * enforces the correct source state.
     */
    async submitForReview(adId: number, advertiserId?: number): Promise<Advertisement | null> {
        return this.guardedTransition(adId, ['draft'], 'pending_review');
    }

    /**
     * Adopt a row the lifecycle did not create (admin `POST /api/admin/ads`
     * or a 0026-carried legacy row): bring it onto the 9.A contract with the
     * lifecycle column only (additive, no DROP), own it, and fund
     * it through the ledger when a budget is declared. No new transition is
     * added — the row still walks draft → pending_review → active.
     */
    async registerExternalRow(
        adId: number,
        opts: { advertiserId: number; budgetCents: number; costPerImpressionCents: number; initialStatus?: CampaignStatus }
    ): Promise<Advertisement | null> {
        const status = opts.initialStatus ?? 'draft';
        await this.db().prepare(`
            UPDATE advertisements SET
                advertiser_id = ?,
                budget_cents = ?,
                cost_per_impression_cents = ?,
                                campaign_lifecycle_status = ?
            WHERE id = ?
        `).bind(
            opts.advertiserId,
            opts.budgetCents,
                        Math.max(1, opts.costPerImpressionCents),
            status,
            adId
        ).run();
        if (opts.budgetCents > 0) {
            await this.ledger.post({
                txId: `ad_campaign_fund_${adId}`,
                createdBy: `user:${opts.advertiserId}`,
                ref: { ref_type: 'ad_campaign', ref_id: adId },
                entries: [
                    { account: campaignAccount(adId), direction: 'debit', amountCents: opts.budgetCents },
                    { account: BUDGET_COMMITMENT_ACCOUNT, direction: 'credit', amountCents: opts.budgetCents }
                ]
            });
                }
        const ad = await this.adModel.findById(adId);
        if (!ad) return null;
        return { ...ad, campaign_status: lifecycleStatus(ad) };
    }

    /** Admin review: pending_review → active. Mandatory before any serving. */
    async approveCampaign(adId: number): Promise<Advertisement | null> {
        return this.guardedTransition(adId, ['pending_review'], 'active', { isActive: 1 });
    }

    /** Advertiser: active → paused (owner-guarded). */
    async pauseCampaign(adId: number, advertiserId?: number): Promise<Advertisement | null> {
        return this.guardedTransition(adId, ['active'], 'paused', {
            advertiserId,
            isActive: 0
        });
    }

    /** Advertiser: paused → active, only when the ledger budget still covers one impression. */
    async resumeCampaign(adId: number, advertiserId?: number): Promise<Advertisement | null> {
        const ad = await this.adModel.findById(adId);
        if (!ad) return null;
        const balance = await this.budgetBalanceCents(adId);
        if (balance < ad.cost_per_impression_cents) return null;
        return this.guardedTransition(adId, ['paused'], 'active', {
            advertiserId,
            isActive: 1
        });
    }

    /** active|paused → ended (terminal). */
    async endCampaign(adId: number, advertiserId?: number): Promise<Advertisement | null> {
        return this.guardedTransition(adId, ['active', 'paused'], 'ended', { advertiserId });
    }

    /**
     * Atomic impression charge (9.A core).
     *
     * ONE db.batch() that:
     *  1. conditionally INSERTs the debit into ledger_entries — the WHERE clause
     *     checks BOTH the campaign serving state AND the aggregated ledger
     *     balance in the SAME statement as the write (no TOCTOU, no
     *     check-then-debit gap), exactly like LedgerService.withdraw();
     *  2. credits platform:ad_revenue (balanced pair, M1);
          *  3. flips campaign_lifecycle_status to 'ended' atomically when the remaining
     *     balance can no longer cover the next impression.
     *
     * The impression row itself is recorded only after a successful charge.
     */
    async chargeImpression(adId: number, competitionId: number, userId: number | null): Promise<ImpressionChargeResult> {
        const ad = await this.adModel.findById(adId);
        if (!ad) return { served: false, budgetExhausted: false, spentCents: 0 };

        const cost = ad.cost_per_impression_cents;
        const account = campaignAccount(adId);
        const txId = `ad_imp_${adId}_${competitionId}_${crypto.randomUUID()}`;

        const results = await this.db().batch([
            // 1. conditional spend: credit the campaign reserve (balance is
            // debit-positive, so a credit reduces it) — serving state + balance
            // + write in one statement.
            // Serving state is the lifecycle state (CASE over the 0025/0026
            // carry-over columns) — no JS pre-check, no TOCTOU.
            this.db().prepare(`
                INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                SELECT ?, ?, 'credit', ?, 'USD', 'ad_impression', ?, 'system:ad_lifecycle'
                WHERE EXISTS (
                    SELECT 1 FROM advertisements
                    WHERE id = ? AND is_active = 1
                      AND (CASE WHEN campaign_lifecycle_status IN ('draft', 'pending_review', 'active', 'paused', 'ended')
                        THEN campaign_lifecycle_status ELSE campaign_status END) = 'active'
                )
                AND (
                    SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0)
                    FROM ledger_entries
                    WHERE account = ?
                ) >= ?
            `).bind(txId, account, cost, adId, adId, account, cost),
            // 2. balanced debit side (M1) — platform revenue, only if the credit landed
            this.db().prepare(`
                INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                SELECT ?, ?, 'debit', ?, 'USD', 'ad_impression', ?, 'system:ad_lifecycle'
                WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE tx_id = ?)
            `).bind(txId, AD_REVENUE_ACCOUNT, cost, adId, txId),
            // 3. atomic exhaustion flip: cannot afford the next impression.
            // Guarded on BOTH columns — the flipped row is readable under
            // either layout immediately within the same batch.
            this.db().prepare(`
                                UPDATE advertisements SET campaign_lifecycle_status = 'ended'
                WHERE id = ? AND (CASE WHEN campaign_lifecycle_status IN ('draft', 'pending_review', 'active', 'paused', 'ended')
                  THEN campaign_lifecycle_status ELSE campaign_status END) = 'active'
                AND (
                    SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0)
                    FROM ledger_entries
                    WHERE account = ?
                ) < ?
            `).bind(adId, account, cost)
        ]);

        const debitChanges = (results[0].meta as { changes?: number } | undefined)?.changes ?? 0;
        if (debitChanges === 0) {
            // Rejected: not active, or balance < cost. Distinguish for the caller.
            const balance = await this.budgetBalanceCents(adId);
            return { served: false, budgetExhausted: balance < cost, spentCents: 0 };
        }

        await this.adModel.recordImpression(adId, competitionId, userId);

        // Audit log entry (log only — the ledger remains the money SSOT).
        await this.financialModel.record({
            entry_type: 'ad_revenue',
            amount: cost / 100,
            competition_id: competitionId,
            ad_id: adId,
            public_description: `Ad impression for campaign #${adId}`
        });

        return { served: true, budgetExhausted: false, spentCents: cost };
    }

    /** Backwards-compatible alias over the atomic charge. */
    async recordImpressionWithBudgetDepletion(adId: number, competitionId: number, userId: number | null): Promise<{ depleted: boolean; budgetExhausted: boolean }> {
        const result = await this.chargeImpression(adId, competitionId, userId);
        return { depleted: result.served, budgetExhausted: result.budgetExhausted };
    }

    /** Analytics rows with budget fields DERIVED from the ledger (dollars for display). */
    private toAnalytics(ad: Advertisement, balanceCents: number): CampaignAnalytics {
        const budgetCents = ad.budget_cents ?? 0;
        return {
            ad_id: ad.id,
            title: ad.title,
            budget: budgetCents / 100,
            budget_remaining: balanceCents / 100,
            total_impressions: ad.views_count,
            total_clicks: ad.clicks_count,
            total_spend: (budgetCents - balanceCents) / 100,
            ctr: ad.views_count > 0 ? ad.clicks_count / ad.views_count : 0,
            campaign_status: lifecycleStatus(ad),
            target_language: ad.target_language ?? null,
            target_country: ad.target_country ?? null
        };
    }

    async getAdvertiserDashboard(advertiserId: number): Promise<AdvertiserDashboard> {
        const result = await this.db().prepare(`
            SELECT * FROM advertisements WHERE advertiser_id = ? ORDER BY created_at DESC
        `).bind(advertiserId).all<Advertisement>();

        const campaigns: CampaignAnalytics[] = [];
        for (const ad of result.results || []) {
            campaigns.push(this.toAnalytics(ad, await this.budgetBalanceCents(ad.id)));
        }

        return {
            total_campaigns: campaigns.length,
            active_campaigns: campaigns.filter(c => c.campaign_status === 'active').length,
            total_budget: campaigns.reduce((sum, c) => sum + c.budget, 0),
            total_remaining: campaigns.reduce((sum, c) => sum + c.budget_remaining, 0),
            total_impressions: campaigns.reduce((sum, c) => sum + c.total_impressions, 0),
            total_clicks: campaigns.reduce((sum, c) => sum + c.total_clicks, 0),
            campaigns
        };
    }

    async getCampaignAnalytics(adId: number): Promise<CampaignAnalytics | null> {
        const ad = await this.adModel.findById(adId);
        if (!ad) return null;
        return this.toAnalytics(ad, await this.budgetBalanceCents(adId));
    }

    /**
     * Serving-safe selection with the budget condition IN THE SQL QUERY —
     * a depleted campaign stops being served immediately and atomically,
     * with no later JS check. Lifecycle state is lifecycle-priority (CASE
     * over the 0025/0026 carry-over columns).
     */
    async getActiveAdsForCompetition(competitionId: number, language?: string, country?: string): Promise<Advertisement[]> {
        let query = `
            SELECT * FROM advertisements
            WHERE is_active = 1
            AND (CASE WHEN campaign_lifecycle_status IN ('draft', 'pending_review', 'active', 'paused', 'ended')
                THEN campaign_lifecycle_status ELSE campaign_status END) = 'active'
            AND (
                SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0)
                FROM ledger_entries
                WHERE account = 'reserve:campaign_' || advertisements.id
            ) >= cost_per_impression_cents
        `;
        const params: unknown[] = [];

        if (language) {
            query += ` AND (target_language IS NULL OR target_language = ?)`;
            params.push(language);
        }
        if (country) {
            query += ` AND (target_country IS NULL OR target_country = ?)`;
            params.push(country);
        }

        query += ` ORDER BY RANDOM() LIMIT 1`;

        const result = await this.db().prepare(query).bind(...params).all<Advertisement>();
        return result.results || [];
    }
}

/**
 * Effective lifecycle state of an advertisement row under the 0025/0026
 * carry-over column mapping: campaign_lifecycle_status wins when set
 * (0026-carried legacy rows); otherwise campaign_status (0025 rows).
 * Imported by callers that must NOT treat legacy 'depleted'/'archived' as
 * servable, without a second money column.
 */
export function lifecycleStatus(ad: Advertisement): 'draft' | 'pending_review' | 'active' | 'paused' | 'ended' {
    const ls = ad.campaign_lifecycle_status;
    if (ls === 'draft' || ls === 'pending_review' || ls === 'active' || ls === 'paused' || ls === 'ended') {
        return ls;
    }
    const cs = ad.campaign_status;
    if (cs === 'pending_review' || cs === 'active' || cs === 'paused' || cs === 'ended') {
        return cs;
    }
    return 'draft';
}

export default AdCampaignManager;
