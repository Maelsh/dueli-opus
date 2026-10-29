import { AdvertisementModel, Advertisement } from '../../models/AdvertisementModel';
import { CompetitionModel } from '../../models/CompetitionModel';
import { PlatformSettingsModel } from '../../models/PlatformSettingsModel';
import {
    AD_PRICING_SETTING_KEY,
    effectiveImpressionCents,
    parseAdPricingConfig,
} from './AdPricing';

/**
 * Phase 9.B — ad serving and targeting.
 *
 * Single orchestration point for "which ad may this viewer see here":
 * targeting (language + country + category only — no behavioral tracking),
 * AdBlockModel exclusion, per-user frequency cap, and the sensitive-context
 * ban (private messages) are all enforced HERE, server-side. A tampered
 * client cannot bypass them: the cap is enforced atomically inside
 * AdCampaignManager.chargeImpression (9.A stays the money SSOT and its
 * lifecycle is never rewritten here).
 *
 * Targeting values come from EXISTING rows only:
 * - language / country / category: the competition row (competitions table
 *   already carries all three), falling back to the caller's explicit hints
 * - blocks: ad_blocks (AdBlockModel semantics — unrelated to UserBlockModel)
 * - frequency: ad_impressions rows from the trailing 24h (no new telemetry)
 *
 * The impression route enforces the same cap atomically INSIDE
 * AdCampaignManager.chargeImpression (cap count + reserve + write in one
 * batch, F-2) using the session identity (F-1) — this service owns selection,
 * the charge owns enforcement.
 */
export const AD_FREQUENCY_CAP_PER_USER_PER_AD_PER_DAY = 5;

/** Contexts where serving is banned server-side (9.B: private messages). */
export const SENSITIVE_AD_CONTEXTS: readonly string[] = ['private_messages'];

export interface ServeAdsOptions {
    competitionId?: number | null;
    language?: string | null;
    country?: string | null;
    viewerUserId?: number | null;
    context?: string | null;
    limit?: number;
}

export class AdServingService {
    private adModel: AdvertisementModel;
    private competitionModel: CompetitionModel;
    private settingsModel: PlatformSettingsModel;

    constructor(db: D1Database) {
        this.adModel = new AdvertisementModel(db);
        this.competitionModel = new CompetitionModel(db);
        this.settingsModel = new PlatformSettingsModel(db);
    }

    /** Sensitive contexts never receive ads — enforced before any selection. */
    isSensitiveContext(context: string | null | undefined): boolean {
        return !!context && (SENSITIVE_AD_CONTEXTS as readonly string[]).includes(context);
    }

    /**
     * Targeted serving selection. Resolution order for each dimension:
     * competition row first (trusted server-side data), caller hint second.
     * Returns ads eligible for this viewer in this context.
     */
    async serve(opts: ServeAdsOptions): Promise<Advertisement[]> {
        if (this.isSensitiveContext(opts.context)) {
            return [];
        }

        let language = opts.language ?? null;
        let country = opts.country ?? null;
        let categoryId: number | null = null;

        let creatorId: number | null = null;
        let opponentId: number | null = null;
        // Pricing country is the COMPETITION country only — the same source the
        // charge path (AdCampaignManager.chargeImpression) uses. A caller hint
        // must never change the price that will be deducted.
        let pricingCountry: string | null = null;
        if (opts.competitionId) {
            const competition = await this.competitionModel.findById(opts.competitionId);
            if (competition) {
                language = competition.language ?? language;
                country = competition.country ?? country;
                categoryId = competition.category_id ?? null;
                creatorId = competition.creator_id ?? null;
                opponentId = competition.opponent_id ?? null;
                pricingCountry = competition.country ?? null;
            }
        }

        const limit = Math.max(1, Math.min(opts.limit ?? 5, 50));

        // UNIT36.1: the ad's chargeable price is the EFFECTIVE price. When an
        // admin pricing configuration exists, serving must gate the campaign
        // budget on that price (not on `cost_per_impression_cents`), otherwise
        // an ad could be shown while its charge is refused (a free impression)
        // or an affordable ad could be hidden.
        const pricing = parseAdPricingConfig(
            await this.settingsModel.getByKey(AD_PRICING_SETTING_KEY)
        );

        const candidates = await this.adModel.getTargetedAds({
            language,
            country,
            categoryId,
            blockedForUserId: opts.viewerUserId ?? null,
            frequencyCap: AD_FREQUENCY_CAP_PER_USER_PER_AD_PER_DAY,
            cappedForUserId: opts.viewerUserId ?? null,
            creatorId,
            opponentId,
            skipBudgetGate: pricing !== null,
            limit: pricing !== null ? 50 : limit,
        });

        if (!pricing) return candidates.slice(0, limit);

        const paidIds = candidates
            .filter((ad) => Number(ad.is_house) !== 1)
            .map((ad) => ad.id);
        const balances = await this.adModel.budgetBalancesCents(paidIds);

        const affordable = candidates.filter((ad) => {
            // House ads never consume a budget and are never blocked.
            if (Number(ad.is_house) === 1) return true;
            const price = effectiveImpressionCents(
                ad.cost_per_impression_cents,
                pricing,
                {
                    country: pricingCountry,
                    mediaKind: ad.media_kind || 'image',
                    durationSec: ad.duration_sec ?? null,
                    hasTargeting: !!(
                        ad.target_language ||
                        ad.target_country ||
                        (ad.target_category_id !== null && ad.target_category_id !== undefined)
                    ),
                }
            );
            return (balances.get(ad.id) ?? 0) >= price;
        });

        // The house fallback must survive a large pool of unaffordable paid
        // ads, so it is fetched on its own and appended after the paid ads.
        const houses = await this.adModel.getTargetedAds({
            language,
            country,
            categoryId,
            blockedForUserId: opts.viewerUserId ?? null,
            frequencyCap: AD_FREQUENCY_CAP_PER_USER_PER_AD_PER_DAY,
            cappedForUserId: opts.viewerUserId ?? null,
            creatorId,
            opponentId,
            skipBudgetGate: true,
            houseOnly: true,
            limit: 3,
        });
        const merged = [...affordable];
        const seen = new Set(merged.map((ad) => ad.id));
        for (const house of houses) {
            if (seen.has(house.id)) continue;
            seen.add(house.id);
            merged.push(house);
        }

        return merged.slice(0, limit);
    }
}

export default AdServingService;
