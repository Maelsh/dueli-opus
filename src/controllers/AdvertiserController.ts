import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { AdCampaignManager } from '../lib/services/AdCampaignManager';
import { AdvertisementModel } from '../models/AdvertisementModel';
import { CategoryModel } from '../models/CategoryModel';
import { ArbitrationService } from '../lib/services/ArbitrationService';
import { AdminAuditLogModel } from '../models/AdminAuditLogModel';

export class AdvertiserController extends BaseController {

    async getDashboard(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const campaignManager = new AdCampaignManager(c.env.DB);
            const dashboard = await campaignManager.getAdvertiserDashboard(user.id);

            return this.success(c, dashboard);
        } catch (error) {
            console.error('Advertiser dashboard error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * 9.D ownership gate — server-side, per sensitive operation.
     * The session identity is the ONLY identity: client-supplied ownership is
     * never read. Returns the owned row, or sends the contract status:
     * missing row → 404, row owned by another advertiser (or by nobody, e.g.
     * an admin-created legacy row with advertiser_id NULL) → 403 — never an
     * empty list or an ambiguous 409 that hides the resource.
     */
    private async requireOwnedCampaign(
        c: Context<{ Bindings: Bindings; Variables: Variables }>,
        adId: number,
        ownerId: number
    ) {
        const adModel = new AdvertisementModel(c.env.DB);
        const existing = await adModel.findById(adId);
        if (!existing) {
            return { response: this.notFound(c) };
        }
        if (existing.advertiser_id !== ownerId) {
            return { response: this.forbidden(c, this.t('advertiser.not_your_campaign', c)) };
        }
        return { response: null };
    }

    async createCampaign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const body = await this.getBody<{
                title: string;
                image_url?: string;
                link_url?: string;
                budget_cents: number;
                cost_per_impression_cents?: number;
                target_language?: string;
                target_country?: string;
                target_category_id?: number;
            }>(c);

            if (!body?.title || !body?.budget_cents) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }
            if (!Number.isInteger(body.budget_cents) || body.budget_cents <= 0) {
                return this.validationError(c, this.t('ads.invalid_budget', c));
            }
            if (body.target_category_id !== undefined && body.target_category_id !== null) {
                if (!Number.isInteger(body.target_category_id) || body.target_category_id <= 0) {
                    return this.validationError(c, this.t('errors.missing_fields', c));
                }
                const categoryModel = new CategoryModel(c.env.DB);
                if (!(await categoryModel.findById(body.target_category_id))) {
                    return this.validationError(c, this.t('errors.missing_fields', c));
                }
            }

            const campaignManager = new AdCampaignManager(c.env.DB);
            const ad = await campaignManager.createCampaign({
                title: body.title,
                image_url: body.image_url,
                link_url: body.link_url,
                budget_cents: body.budget_cents,
                cost_per_impression_cents: body.cost_per_impression_cents,
                target_language: body.target_language,
                target_country: body.target_country,
                target_category_id: body.target_category_id ?? undefined,
                advertiser_id: user.id
            });

            return this.success(c, { ad }, 201);
        } catch (error) {
            console.error('Advertiser create campaign error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async submitCampaign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const adId = this.getParamInt(c, 'id');
            if (!adId) return this.validationError(c, this.t('errors.missing_fields', c));

            const ownership = await this.requireOwnedCampaign(c, adId, user.id);
            if (ownership.response) return ownership.response;

            const campaignManager = new AdCampaignManager(c.env.DB);
            const ad = await campaignManager.submitForReview(adId, user.id);

            if (!ad) return this.error(c, this.t('ads.campaign_not_draft', c), 409);
            return this.success(c, { ad });
        } catch (error) {
            console.error('Advertiser submit campaign error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async endCampaign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const adId = this.getParamInt(c, 'id');
            if (!adId) return this.validationError(c, this.t('errors.missing_fields', c));

            const ownership = await this.requireOwnedCampaign(c, adId, user.id);
            if (ownership.response) return ownership.response;

            const campaignManager = new AdCampaignManager(c.env.DB);
            const ad = await campaignManager.endCampaign(adId, user.id);

                                     if (!ad) return this.error(c, this.t('ads.campaign_not_active', c), 409);
            return this.success(c, { ad });
        } catch (error) {
            console.error('Advertiser end campaign error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async pauseCampaign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const adId = this.getParamInt(c, 'id');
            if (!adId) return this.validationError(c, this.t('errors.missing_fields', c));

            const ownership = await this.requireOwnedCampaign(c, adId, user.id);
            if (ownership.response) return ownership.response;

            const campaignManager = new AdCampaignManager(c.env.DB);
            const ad = await campaignManager.pauseCampaign(adId, user.id);

                                     if (!ad) return this.error(c, this.t('ads.campaign_not_active', c), 409);
            return this.success(c, { ad });
        } catch (error) {
            console.error('Advertiser pause campaign error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async resumeCampaign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const adId = this.getParamInt(c, 'id');
            if (!adId) return this.validationError(c, this.t('errors.missing_fields', c));

            const ownership = await this.requireOwnedCampaign(c, adId, user.id);
            if (ownership.response) return ownership.response;

            const campaignManager = new AdCampaignManager(c.env.DB);
            const ad = await campaignManager.resumeCampaign(adId, user.id);

            if (!ad) return this.error(c, this.t('ads.campaign_not_paused', c), 409);
            return this.success(c, { ad });
        } catch (error) {
            console.error('Advertiser resume campaign error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async getCampaignAnalytics(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const adId = this.getParamInt(c, 'id');
            if (!adId) return this.validationError(c, this.t('errors.missing_fields', c));

            const ownership = await this.requireOwnedCampaign(c, adId, user.id);
            if (ownership.response) return ownership.response;

            const campaignManager = new AdCampaignManager(c.env.DB);
            const analytics = await campaignManager.getCampaignAnalytics(adId);

            if (!analytics) return this.notFound(c);
            // 9.C: display labels travel with the numbers — translated at
            // render time via t('ads.*'), never hard-coded in code or client.
            const labels = {
                impressions: this.t('ads.impressions', c),
                clicks: this.t('ads.clicks', c),
                ctr: this.t('ads.ctr', c),
                spend: this.t('ads.spend', c)
            };
            return this.success(c, { analytics, labels });
        } catch (error) {
            console.error('Advertiser analytics error:', error);
            return this.serverError(c, error as Error);
        }
    }
}

export class ComplaintController extends BaseController {

    async submitComplaint(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const body = await this.getBody<{
                target_type: 'user' | 'competition' | 'comment';
                target_id: number;
                reason: string;
                description?: string;
            }>(c);

            if (!body?.target_type || !body?.target_id || !body?.reason) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const arbitrationService = new ArbitrationService(c.env.DB);
            const report = await arbitrationService.submitComplaint({
                reporter_id: user.id,
                target_type: body.target_type,
                target_id: body.target_id,
                reason: body.reason,
                description: body.description
            });

            return this.success(c, { report }, 201);
        } catch (error) {
            console.error('Complaint submit error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async trackComplaint(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const reportId = this.getParamInt(c, 'id');
            if (!reportId) return this.validationError(c, this.t('errors.missing_fields', c));

            const arbitrationService = new ArbitrationService(c.env.DB);
            const tracker = await arbitrationService.getComplaintTracker(reportId);

            if (!tracker) return this.notFound(c);
            return this.success(c, { tracker });
        } catch (error) {
            console.error('Complaint track error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async getUserComplaints(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const arbitrationService = new ArbitrationService(c.env.DB);
            const trackers = await arbitrationService.getUserComplaints(user.id);

            return this.success(c, { complaints: trackers });
        } catch (error) {
            console.error('Complaint list error:', error);
            return this.serverError(c, error as Error);
        }
    }
}

export default AdvertiserController;
