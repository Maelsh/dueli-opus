import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { AdCampaignManager } from '../lib/services/AdCampaignManager';
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

    async createCampaign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const body = await this.getBody<{
                title: string;
                image_url?: string;
                link_url?: string;
                budget: number;
                revenue_per_view?: number;
                target_language?: string;
                target_country?: string;
            }>(c);

            if (!body?.title || !body?.budget) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const campaignManager = new AdCampaignManager(c.env.DB);
            const ad = await campaignManager.createCampaign({
                title: body.title,
                image_url: body.image_url,
                link_url: body.link_url,
                budget: body.budget,
                revenue_per_view: body.revenue_per_view,
                target_language: body.target_language,
                target_country: body.target_country,
                advertiser_id: user.id
            });

            return this.success(c, { ad }, 201);
        } catch (error) {
            console.error('Advertiser create campaign error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async pauseCampaign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const adId = this.getParamInt(c, 'id');
            if (!adId) return this.validationError(c, this.t('errors.missing_fields', c));

            const campaignManager = new AdCampaignManager(c.env.DB);
            const ad = await campaignManager.pauseCampaign(adId);

            if (!ad) return this.notFound(c);
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

            const campaignManager = new AdCampaignManager(c.env.DB);
            const ad = await campaignManager.resumeCampaign(adId);

            if (!ad) return this.notFound(c);
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

            const campaignManager = new AdCampaignManager(c.env.DB);
            const analytics = await campaignManager.getCampaignAnalytics(adId);

            if (!analytics) return this.notFound(c);
            return this.success(c, { analytics });
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
