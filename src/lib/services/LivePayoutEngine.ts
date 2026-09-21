import { PlatformSettingsModel } from '../../models/PlatformSettingsModel';
import { CompetitionRevenueLogModel } from '../../models/CompetitionRevenueLogModel';
import { AdvertisementModel } from '../../models/AdvertisementModel';
import { CompetitionModel } from '../../models/CompetitionModel';
import { LedgerService } from './LedgerService';

/**
 * 8.B — سياسة التوزيع الفعلية (canonical هنا + docs/02-DATABASE.md):
 * - 20% منصة (platform_share_percentage من platform_settings، الافتراضي 20).
 * - 80% pool للمتنافسَين يُقسَّم حسب نسبة متوسطات تقييمات المشاهدين.
 * - التعادل/غياب التقييمات (المجموع صفر) ⇒ تقاسم متساوٍ للـpool.
 *
 * قاعدة التقريب (integer cents فقط):
 * - floor لكل حصة، ثم يُوزَّع الباقي سنتاً بسنت بأولوية: المنصة، ثم
 *   صاحب التقييم الأعلى، ثم الآخر — deterministic دائماً.
 * - sum(all shares) === original amount بالضبط: لا سنت يضيع ولا يُخلق.
 */

export interface PayoutSplitCents {
    totalCents: number;
    platformCents: number;
    creatorCents: number;
    opponentCents: number;
    platformPercentage: number;
}

export function splitPayoutCents(
    totalCents: number,
    platformPercentage: number,
    creatorRating: number,
    opponentRating: number
): PayoutSplitCents {
    if (!Number.isInteger(totalCents) || totalCents < 0) {
        throw new Error('totalCents must be a non-negative integer');
    }
    const pct = Number.isFinite(platformPercentage) ? Math.min(100, Math.max(0, platformPercentage)) : 20;
    const platformExact = (totalCents * pct) / 100;
    const pool = totalCents - platformExact;
    const totalRatings = (creatorRating || 0) + (opponentRating || 0);
    let creatorExact: number;
    let opponentExact: number;
    if (totalRatings === 0) {
        creatorExact = pool / 2;
        opponentExact = pool / 2;
    } else {
        creatorExact = (pool * (creatorRating || 0)) / totalRatings;
        opponentExact = (pool * (opponentRating || 0)) / totalRatings;
    }
    const platformFloor = Math.floor(platformExact + 1e-9);
    const creatorFloor = Math.floor(creatorExact + 1e-9);
    const opponentFloor = Math.floor(opponentExact + 1e-9);
    let remainder = totalCents - platformFloor - creatorFloor - opponentFloor;
    let platformCents = platformFloor;
    let creatorCents = creatorFloor;
    let opponentCents = opponentFloor;
    // أولوية deterministic للباقي: المنصة، ثم الأعلى تقييماً، ثم الآخر.
    const creatorFirst = (creatorRating || 0) >= (opponentRating || 0);
    while (remainder > 0) {
        platformCents += 1;
        remainder -= 1;
        if (remainder <= 0) break;
        if (creatorFirst) { creatorCents += 1; } else { opponentCents += 1; }
        remainder -= 1;
        if (remainder <= 0) break;
        if (creatorFirst) { opponentCents += 1; } else { creatorCents += 1; }
        remainder -= 1;
    }
    return { totalCents, platformCents, creatorCents, opponentCents, platformPercentage: pct };
}

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
    total_cents: number;
    platform_share_cents: number;
    creator_share_cents: number;
    opponent_share_cents: number;
    creator_id: number;
    opponent_id: number;
    platform_percentage: number;
    finalized: boolean;
    /** توافق رجعي للقرّاء القدامى (دولار float للعرض فقط — ليست مصدر حقيقة). */
    total_ad_revenue: number;
    platform_share: number;
    creator_share: number;
    opponent_share: number;
}

export class LivePayoutEngine {
    private db: D1Database;
    private settingsModel: PlatformSettingsModel;
    private revenueLogModel: CompetitionRevenueLogModel;
    private ledger: LedgerService;
    private adModel: AdvertisementModel;
    private competitionModel: CompetitionModel;

    constructor(db: D1Database) {
        this.db = db;
        this.settingsModel = new PlatformSettingsModel(db);
        this.revenueLogModel = new CompetitionRevenueLogModel(db);
        this.ledger = new LedgerService(db);
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

        // إجمالي السنتات = تقريب الإيراد الدولاري (float للقراءة فقط) إلى سنتات.
        const totalCents = Math.round(snapshot.total_ad_revenue * 100);
        const split = splitPayoutCents(
            totalCents,
            snapshot.platform_percentage,
            snapshot.creator_rating,
            snapshot.opponent_rating
        );
        // sum === total بالضبط (قاعدة التقريب أعلاه) — دفاع برمجي.
        if (split.platformCents + split.creatorCents + split.opponentCents !== totalCents) {
            throw new Error('payout split does not conserve total cents');
        }

        // 8.B — مطالبة idempotent داخل SQL أولاً: الفائز الوحيد يكمل،
        // والبقية يقرأون النتيجة المحفوظة بلا قيود مالية جديدة.
        const claimed = await this.revenueLogModel.claimFinalized(competitionId);

        const buildResult = (): FinalizedPayout => ({
            competition_id: competitionId,
            total_cents: totalCents,
            platform_share_cents: split.platformCents,
            creator_share_cents: split.creatorCents,
            opponent_share_cents: split.opponentCents,
            creator_id: competition.creator_id,
            opponent_id: competition.opponent_id || 0,
            platform_percentage: split.platformPercentage,
            finalized: true,
            total_ad_revenue: totalCents / 100,
            platform_share: split.platformCents / 100,
            creator_share: split.creatorCents / 100,
            opponent_share: split.opponentCents / 100,
        });

        if (!claimed) {
            // توزيع سابق مطبَّق: لا قيود جديدة (idempotent حتى تحت التزامن).
            // ملاحظة: قراءة النتيجة من ledger ممكنة عبر entriesForTx أدناه.
            return buildResult();
        }

        // 8.B — التوزيع الفعلي الوحيد عبر LedgerService (لا earnings ولا financial_log).
        // حركة واحدة متوازنة: مدينون (المتنافسان + المنصة) = دائنون (احتياطي التسوية).
        if (totalCents > 0) {
            const entries: { account: string; direction: 'debit' | 'credit'; amountCents: number }[] = [];
            if (competition.creator_id && split.creatorCents > 0) {
                entries.push({ account: `user:${competition.creator_id}`, direction: 'debit', amountCents: split.creatorCents });
            }
            if (competition.opponent_id && split.opponentCents > 0) {
                entries.push({ account: `user:${competition.opponent_id}`, direction: 'debit', amountCents: split.opponentCents });
            }
            if (split.platformCents > 0) {
                entries.push({ account: 'platform:revenue', direction: 'debit', amountCents: split.platformCents });
            }
            if (entries.length > 0) {
                entries.push({ account: 'reserve:payouts', direction: 'credit', amountCents: totalCents });
                // تجاهل تعارض التزامن: إن سبقنا منافس بنفس tx فالقيود موجودة (no-op).
                try {
                    await this.ledger.post({
                        txId: `payout:competition:${competitionId}`,
                        createdBy: 'system:payouts',
                        ref: { ref_type: 'competition', ref_id: competitionId },
                        entries,
                    });
                } catch (e) {
                    const msg = e instanceof Error ? e.message : String(e);
                    if (!/UNIQUE constraint failed|constraint failed/i.test(msg)) throw e;
                }
            }
        }

        // لقطة audit فقط (ليست مصدر حقيقة مالية): تُحفظ بالدولار للعرض.
        await this.revenueLogModel.upsertByCompetition({
            competition_id: competitionId,
            total_ad_revenue: totalCents / 100,
            platform_share: split.platformCents / 100,
            creator_share: split.creatorCents / 100,
            opponent_share: split.opponentCents / 100,
            creator_rating_at_time: snapshot.creator_rating,
            opponent_rating_at_time: snapshot.opponent_rating,
            platform_percentage: split.platformPercentage,
        });

        return buildResult();
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
