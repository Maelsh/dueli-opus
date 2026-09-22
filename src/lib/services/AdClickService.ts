import { AdvertisementModel, ClickRedeemOutcome } from '../../models/AdvertisementModel';

/**
 * Phase 9.C — ad metrics & click anti-fraud.
 *
 * Two guarantees, both enforced server-side:
 * 1. No countable click without a server-issued token. Tokens are opaque
 *    256-bit random bearers minted here (crypto.randomUUID × 2), bound to the
 *    (ad, session identity), expiring after AD_CLICK_TOKEN_TTL_SECONDS, and
 *    single-use (consumed_at + UNIQUE(token) on ad_clicks). A forged, expired,
 *    foreign-ad, or replayed token is rejected and counts nothing.
 *    No secret ever reaches client code — there is no shared secret at all.
 * 2. Metrics derive from the operational/financial source, never from bare
 *    client numbers or the legacy display counters: impressions = counted
 *    ad_impressions rows (paired 1:1 with ledger charges in 9.A's batch),
 *    clicks = counted ad_clicks rows, spend = SUM of the ad_impression ledger
 *    credits (LedgerService stays the money SSOT, integer cents, no floats).
 *
 * This service never touches targeting, serving selection, or LedgerService
 * internals (9.A/9.B stay as they are).
 */

/** Click-token time to live, in seconds (10 minutes). */
export const AD_CLICK_TOKEN_TTL_SECONDS = 600;

export interface ClickTokenMint {
    token: string;
    expiresInSeconds: number;
}

export interface AdMetrics {
    impressions: number;
    clicks: number;
    spendCents: number;
    ctr: number;
}

export class AdClickService {
    private readonly database: D1Database;

    constructor(db: D1Database) {
        this.database = db;
    }

    /**
     * Mint a single-use click token for an ad, bound to the server-side
     * caller identity (session user id, or null for anonymous). Returns null
     * when the ad does not exist — no token for unknown ads.
     */
    async mint(adId: number, userId: number | null): Promise<ClickTokenMint | null> {
        const adModel = new AdvertisementModel(this.database);
        const ad = await adModel.findById(adId);
        if (!ad) return null;
        const token = `${crypto.randomUUID()}-${crypto.randomUUID()}`.replace(/-/g, '');
        await adModel.createClickToken(adId, userId, token);
        return { token, expiresInSeconds: AD_CLICK_TOKEN_TTL_SECONDS };
    }

    /** Redeem a token: exactly one countable click per token, ever. */
    async redeem(adId: number, token: string, callerUserId: number | null): Promise<ClickRedeemOutcome> {
        const adModel = new AdvertisementModel(this.database);
        return adModel.redeemClickToken(adId, token, callerUserId);
    }

    /**
     * Metrics from the single source of truth: operational rows + ledger.
     * views_count / clicks_count are deliberately never read here, so forged
     * counters cannot move the advertiser-visible numbers.
     */
    async metrics(adId: number): Promise<AdMetrics> {
        const adModel = new AdvertisementModel(this.database);
        const [impressions, clicks, spendCents] = await Promise.all([
            adModel.countImpressions(adId),
            adModel.countClicks(adId),
            adModel.adSpendCents(adId),
        ]);
        return {
            impressions,
            clicks,
            spendCents,
            ctr: impressions > 0 ? clicks / impressions : 0,
        };
    }
}

export default AdClickService;
