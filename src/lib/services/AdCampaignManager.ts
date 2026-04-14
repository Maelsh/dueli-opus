import { AdvertisementModel, Advertisement } from '../../models/AdvertisementModel';
import { PlatformFinancialLogModel } from '../../models/PlatformFinancialLogModel';
import { PlatformSettingsModel } from '../../models/PlatformSettingsModel';

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

export class AdCampaignManager {
    private adModel: AdvertisementModel;
    private settingsModel: PlatformSettingsModel;
    private financialModel: PlatformFinancialLogModel;

    constructor(db: D1Database) {
        this.adModel = new AdvertisementModel(db);
        this.settingsModel = new PlatformSettingsModel(db);
        this.financialModel = new PlatformFinancialLogModel(db);
    }

    async createCampaign(data: {
        title: string;
        image_url?: string;
        link_url?: string;
        budget: number;
        revenue_per_view?: number;
        target_language?: string;
        target_country?: string;
        advertiser_id: number;
    }): Promise<Advertisement> {
        const ad = await this.adModel.create({
            title: data.title,
            image_url: data.image_url || null,
            link_url: data.link_url || null,
            is_active: 1,
            revenue_per_view: data.revenue_per_view || 0.001,
            created_by: data.advertiser_id
        });

        await this.db().prepare(`
            UPDATE advertisements SET
                advertiser_id = ?,
                budget = ?,
                budget_remaining = ?,
                target_language = ?,
                target_country = ?,
                campaign_status = 'active'
            WHERE id = ?
        `).bind(
            data.advertiser_id,
            data.budget,
            data.budget,
            data.target_language || null,
            data.target_country || null,
            ad.id
        ).run();

        return (await this.adModel.findById(ad.id))!;
    }

    async recordImpressionWithBudgetDepletion(adId: number, competitionId: number, userId: number | null): Promise<{ depleted: boolean; budgetExhausted: boolean }> {
        const ad = await this.adModel.findById(adId);
        if (!ad) return { depleted: false, budgetExhausted: false };

        const revenuePerView = ad.revenue_per_view || 0.001;
        const budgetRemaining = (ad as any).budget_remaining ?? 0;

        if ((ad as any).campaign_status === 'depleted' || budgetRemaining <= 0) {
            return { depleted: false, budgetExhausted: true };
        }

        await this.adModel.recordImpression(adId, competitionId, userId);

        const newRemaining = Math.max(0, budgetRemaining - revenuePerView);

        const budgetExhausted = newRemaining <= 0;
        const newStatus = budgetExhausted ? 'depleted' : ((ad as any).campaign_status || 'active');

        await this.db().prepare(`
            UPDATE advertisements SET budget_remaining = ?, campaign_status = ? WHERE id = ?
        `).bind(newRemaining, newStatus, adId).run();

        if (budgetExhausted) {
            await this.db().prepare(`
                UPDATE advertisements SET is_active = 0 WHERE id = ?
            `).bind(adId).run();
        }

        await this.financialModel.record({
            entry_type: 'ad_revenue',
            amount: revenuePerView,
            competition_id: competitionId,
            ad_id: adId,
            public_description: `Ad impression for campaign #${adId}`
        });

        return { depleted: true, budgetExhausted };
    }

    async pauseCampaign(adId: number): Promise<Advertisement | null> {
        await this.db().prepare(`
            UPDATE advertisements SET campaign_status = 'paused', is_active = 0 WHERE id = ?
        `).bind(adId).run();
        return this.adModel.findById(adId);
    }

    async resumeCampaign(adId: number): Promise<Advertisement | null> {
        const ad = await this.adModel.findById(adId);
        if (!ad) return null;

        const budgetRemaining = (ad as any).budget_remaining ?? 0;
        if (budgetRemaining <= 0) return null;

        await this.db().prepare(`
            UPDATE advertisements SET campaign_status = 'active', is_active = 1 WHERE id = ?
        `).bind(adId).run();
        return this.adModel.findById(adId);
    }

    async getAdvertiserDashboard(advertiserId: number): Promise<AdvertiserDashboard> {
        const result = await this.db().prepare(`
            SELECT * FROM advertisements WHERE advertiser_id = ? ORDER BY created_at DESC
        `).bind(advertiserId).all<Advertisement & { budget: number; budget_remaining: number; campaign_status: string; target_language: string | null; target_country: string | null }>();

        const campaigns: CampaignAnalytics[] = (result.results || []).map(ad => ({
            ad_id: ad.id,
            title: ad.title,
            budget: (ad as any).budget ?? 0,
            budget_remaining: (ad as any).budget_remaining ?? 0,
            total_impressions: ad.views_count,
            total_clicks: ad.clicks_count,
            total_spend: ((ad as any).budget ?? 0) - ((ad as any).budget_remaining ?? 0),
            ctr: ad.views_count > 0 ? ad.clicks_count / ad.views_count : 0,
            campaign_status: (ad as any).campaign_status ?? 'active',
            target_language: (ad as any).target_language ?? null,
            target_country: (ad as any).target_country ?? null
        }));

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

        return {
            ad_id: ad.id,
            title: ad.title,
            budget: (ad as any).budget ?? 0,
            budget_remaining: (ad as any).budget_remaining ?? 0,
            total_impressions: ad.views_count,
            total_clicks: ad.clicks_count,
            total_spend: ((ad as any).budget ?? 0) - ((ad as any).budget_remaining ?? 0),
            ctr: ad.views_count > 0 ? ad.clicks_count / ad.views_count : 0,
            campaign_status: (ad as any).campaign_status ?? 'active',
            target_language: (ad as any).target_language ?? null,
            target_country: (ad as any).target_country ?? null
        };
    }

    async getActiveAdsForCompetition(competitionId: number, language?: string, country?: string): Promise<Advertisement[]> {
        let query = `
            SELECT * FROM advertisements
            WHERE is_active = 1 AND campaign_status = 'active' AND budget_remaining > 0
        `;
        const params: any[] = [];

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

    private db(): D1Database {
        return (this.adModel as any).db;
    }
}

export default AdCampaignManager;
