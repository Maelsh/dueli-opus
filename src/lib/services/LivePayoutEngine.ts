import { PlatformSettingsModel } from '../../models/PlatformSettingsModel';
import { CompetitionRevenueLogModel } from '../../models/CompetitionRevenueLogModel';
import { PlatformFinancialLogModel } from '../../models/PlatformFinancialLogModel';
import { AdvertisementModel } from '../../models/AdvertisementModel';
import { EarningsModel } from '../../models/EarningsModel';
import { CompetitionModel } from '../../models/CompetitionModel';

export interface LivePayoutSnapshot {
    competition_id: number;
    total_ad_revenue: number;
    platform_percentage: number;
    platform_share: number;
    competitor_pool: number;
    creator_id: number;
    opponent_id: number;
    creator_rating: number;
    opponent_rating: number;
    total_ratings: number;
    creator_share: number;
    opponent_share: number;
    timestamp: string;
}

export interface FinalizedPayout {
    competition_id: number;
    total_ad_revenue: number;
    platform_share: number;
    creator_share: number;
    opponent_share: number;
    creator_id: number;
    opponent_id: number;
    platform_percentage: number;
    finalized: boolean;
}

export class LivePayoutEngine {
    private db: D1Database;
    private settingsModel: PlatformSettingsModel;
    private revenueLogModel: CompetitionRevenueLogModel;
    private financialModel: PlatformFinancialLogModel;
    private adModel: AdvertisementModel;
    private competitionModel: CompetitionModel;

    constructor(db: D1Database) {
        this.db = db;
        this.settingsModel = new PlatformSettingsModel(db);
        this.revenueLogModel = new CompetitionRevenueLogModel(db);
        this.financialModel = new PlatformFinancialLogModel(db);
        this.adModel = new AdvertisementModel(db);
        this.competitionModel = new CompetitionModel(db);
    }

    async processAdImpression(adId: number, competitionId: number, userId: number | null): Promise<LivePayoutSnapshot> {
        const ad = await this.adModel.findById(adId);
        if (!ad) throw new Error('Advertisement not found');

        const revenuePerView = ad.revenue_per_view || 0.001;

        const competition = await this.competitionModel.findWithDetails(competitionId);
        if (!competition) throw new Error('Competition not found');

        const platformPercentage = await this.settingsModel.getPlatformSharePercentage();
        const platformShare = revenuePerView * (platformPercentage / 100);
        const competitorPool = revenuePerView - platformShare;

        const creatorRating = competition.creator_rating || 0;
        const opponentRating = competition.opponent_rating || 0;
        const totalRatings = creatorRating + opponentRating;

        let creatorShare = 0;
        let opponentShare = 0;

        if (totalRatings === 0) {
            creatorShare = competitorPool / 2;
            opponentShare = competitorPool / 2;
        } else {
            creatorShare = competitorPool * (creatorRating / totalRatings);
            opponentShare = competitorPool * (opponentRating / totalRatings);
        }

        const currentRevenue = await this.adModel.getCompetitionRevenue(competitionId);

        await this.revenueLogModel.upsertByCompetition({
            competition_id: competitionId,
            total_ad_revenue: currentRevenue + revenuePerView,
            platform_share: (currentRevenue + revenuePerView) * (platformPercentage / 100),
            creator_share: creatorShare + (await this.getExistingCreatorShare(competitionId)),
            opponent_share: opponentShare + (await this.getExistingOpponentShare(competitionId)),
            creator_rating_at_time: creatorRating,
            opponent_rating_at_time: opponentRating,
            platform_percentage: platformPercentage
        });

        return {
            competition_id: competitionId,
            total_ad_revenue: currentRevenue + revenuePerView,
            platform_percentage: platformPercentage,
            platform_share: (currentRevenue + revenuePerView) * (platformPercentage / 100),
            competitor_pool: (currentRevenue + revenuePerView) * (1 - platformPercentage / 100),
            creator_id: competition.creator_id,
            opponent_id: competition.opponent_id || 0,
            creator_rating: creatorRating,
            opponent_rating: opponentRating,
            total_ratings: totalRatings,
            creator_share: creatorShare + (await this.getExistingCreatorShare(competitionId)),
            opponent_share: opponentShare + (await this.getExistingOpponentShare(competitionId)),
            timestamp: new Date().toISOString()
        };
    }

    async recalculatePayouts(competitionId: number): Promise<LivePayoutSnapshot> {
        const competition = await this.competitionModel.findWithDetails(competitionId);
        if (!competition) throw new Error('Competition not found');

        const totalRevenue = await this.adModel.getCompetitionRevenue(competitionId);
        const platformPercentage = await this.settingsModel.getPlatformSharePercentage();
        const platformShare = totalRevenue * (platformPercentage / 100);
        const competitorPool = totalRevenue - platformShare;

        const creatorRating = competition.creator_rating || 0;
        const opponentRating = competition.opponent_rating || 0;
        const totalRatings = creatorRating + opponentRating;

        let creatorShare = 0;
        let opponentShare = 0;

        if (totalRatings === 0) {
            creatorShare = competitorPool / 2;
            opponentShare = competitorPool / 2;
        } else {
            creatorShare = competitorPool * (creatorRating / totalRatings);
            opponentShare = competitorPool * (opponentRating / totalRatings);
        }

        await this.revenueLogModel.upsertByCompetition({
            competition_id: competitionId,
            total_ad_revenue: totalRevenue,
            platform_share: platformShare,
            creator_share: creatorShare,
            opponent_share: opponentShare,
            creator_rating_at_time: creatorRating,
            opponent_rating_at_time: opponentRating,
            platform_percentage: platformPercentage
        });

        return {
            competition_id: competitionId,
            total_ad_revenue: totalRevenue,
            platform_percentage: platformPercentage,
            platform_share: platformShare,
            competitor_pool: competitorPool,
            creator_id: competition.creator_id,
            opponent_id: competition.opponent_id || 0,
            creator_rating: creatorRating,
            opponent_rating: opponentRating,
            total_ratings: totalRatings,
            creator_share: creatorShare,
            opponent_share: opponentShare,
            timestamp: new Date().toISOString()
        };
    }

    async finalizePayouts(competitionId: number): Promise<FinalizedPayout> {
        const competition = await this.competitionModel.findWithDetails(competitionId);
        if (!competition) throw new Error('Competition not found');

        const snapshot = await this.recalculatePayouts(competitionId);

        await this.revenueLogModel.finalize(competitionId);

        const earningsModel = new EarningsModel(this.db);

        if (competition.creator_id && snapshot.creator_share > 0) {
            await earningsModel.addEarnings(competition.creator_id, snapshot.creator_share, 'pending');
        }

        if (competition.opponent_id && snapshot.opponent_share > 0) {
            await earningsModel.addEarnings(competition.opponent_id, snapshot.opponent_share, 'pending');
        }

        await this.financialModel.record({
            entry_type: 'platform_share',
            amount: snapshot.platform_share,
            competition_id: competitionId,
            public_description: `Platform share from competition #${competitionId}`
        });

        if (competition.creator_id && snapshot.creator_share > 0) {
            await this.financialModel.record({
                entry_type: 'competitor_payout',
                amount: snapshot.creator_share,
                competition_id: competitionId,
                public_description: `Creator payout for competition #${competitionId}`
            });
        }

        if (competition.opponent_id && snapshot.opponent_share > 0) {
            await this.financialModel.record({
                entry_type: 'competitor_payout',
                amount: snapshot.opponent_share,
                competition_id: competitionId,
                public_description: `Opponent payout for competition #${competitionId}`
            });
        }

        const integrityCheck = Math.abs(
            (snapshot.platform_share + snapshot.creator_share + snapshot.opponent_share) - snapshot.total_ad_revenue
        ) < 0.001;

        if (!integrityCheck) {
            console.error(`INTEGRITY CHECK FAILED for competition ${competitionId}: platform_share(${snapshot.platform_share}) + creator_share(${snapshot.creator_share}) + opponent_share(${snapshot.opponent_share}) != total_ad_revenue(${snapshot.total_ad_revenue})`);
        }

        return {
            competition_id: competitionId,
            total_ad_revenue: snapshot.total_ad_revenue,
            platform_share: snapshot.platform_share,
            creator_share: snapshot.creator_share,
            opponent_share: snapshot.opponent_share,
            creator_id: competition.creator_id,
            opponent_id: competition.opponent_id || 0,
            platform_percentage: snapshot.platform_percentage,
            finalized: true
        };
    }

    async getLiveSnapshot(competitionId: number): Promise<LivePayoutSnapshot | null> {
        const revenueLog = await this.revenueLogModel.findByCompetitionId(competitionId);
        if (!revenueLog) return null;

        const competition = await this.competitionModel.findWithDetails(competitionId);
        if (!competition) return null;

        const competitorPool = revenueLog.total_ad_revenue - revenueLog.platform_share;

        return {
            competition_id: competitionId,
            total_ad_revenue: revenueLog.total_ad_revenue,
            platform_percentage: revenueLog.platform_percentage,
            platform_share: revenueLog.platform_share,
            competitor_pool: competitorPool,
            creator_id: competition.creator_id,
            opponent_id: competition.opponent_id || 0,
            creator_rating: revenueLog.creator_rating_at_time,
            opponent_rating: revenueLog.opponent_rating_at_time,
            total_ratings: revenueLog.creator_rating_at_time + revenueLog.opponent_rating_at_time,
            creator_share: revenueLog.creator_share,
            opponent_share: revenueLog.opponent_share,
            timestamp: revenueLog.updated_at
        };
    }

    private async getExistingCreatorShare(competitionId: number): Promise<number> {
        const existing = await this.revenueLogModel.findByCompetitionId(competitionId);
        return existing?.creator_share || 0;
    }

    private async getExistingOpponentShare(competitionId: number): Promise<number> {
        const existing = await this.revenueLogModel.findByCompetitionId(competitionId);
        return existing?.opponent_share || 0;
    }
}

export default LivePayoutEngine;
