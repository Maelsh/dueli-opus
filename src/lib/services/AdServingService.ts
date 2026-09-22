import { AdvertisementModel, Advertisement } from '../../models/AdvertisementModel';
import { CompetitionModel } from '../../models/CompetitionModel';

/**
 * Phase 9.B — ad serving and targeting.
 *
 * Single orchestration point for "which ad may this viewer see here":
 * targeting (language + country + category only — no behavioral tracking),
 * AdBlockModel exclusion, per-user frequency cap, and the sensitive-context
 * ban (private messages) are all enforced HERE, server-side. A tampered
 * client cannot bypass them: the impression route re-checks the cap before
 * calling AdCampaignManager.chargeImpression (9.A stays the money SSOT and
 * is never rewritten here).
 *
 * Targeting values come from EXISTING rows only:
 * - language / country / category: the competition row (competitions table
 *   already carries all three), falling back to the caller's explicit hints
 * - blocks: ad_blocks (AdBlockModel semantics — unrelated to UserBlockModel)
 * - frequency: ad_impressions rows from the trailing 24h (no new telemetry)
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

    constructor(db: D1Database) {
        this.adModel = new AdvertisementModel(db);
        this.competitionModel = new CompetitionModel(db);
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

        if (opts.competitionId) {
            const competition = await this.competitionModel.findById(opts.competitionId);
            if (competition) {
                language = competition.language ?? language;
                country = competition.country ?? country;
                categoryId = competition.category_id ?? null;
            }
        }

        return this.adModel.getTargetedAds({
            language,
            country,
            categoryId,
            blockedForUserId: opts.viewerUserId ?? null,
            frequencyCap: AD_FREQUENCY_CAP_PER_USER_PER_AD_PER_DAY,
            cappedForUserId: opts.viewerUserId ?? null,
            limit: opts.limit ?? 5,
        });
    }

    /** True when the viewer already hit the cap for this ad (trailing 24h). */
    async hasReachedFrequencyCap(adId: number, userId: number): Promise<boolean> {
        const count = await this.adModel.countRecentImpressions(adId, userId);
        return count >= AD_FREQUENCY_CAP_PER_USER_PER_AD_PER_DAY;
    }
}

export default AdServingService;
