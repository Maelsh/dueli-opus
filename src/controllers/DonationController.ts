/**
 * @file src/controllers/DonationController.ts
 * @description متحكم المنح والتبرعات (FR-020)
 * @module controllers/DonationController
 */

import { BaseController, AppContext } from './base/BaseController';
import { DonationModel } from '../models/DonationModel';

/**
 * Donation Controller Class
 * متحكم التبرعات
 */
export class DonationController extends BaseController {

    /**
     * Create a donation
     * POST /api/donations
     */
    async create(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const body = await this.getBody<{
                amount: number;
                currency?: string;
                message?: string;
                is_anonymous?: boolean;
                payment_method?: string;
                donor_name?: string;
                donor_email?: string;
            }>(c);

            if (!body?.amount) {
                return this.validationError(c, 'Amount is required');
            }

            // Minimum $1
            if (body.amount < 1) {
                return this.validationError(c, 'Minimum donation is $1');
            }

            const donationModel = new DonationModel(c.env.DB);
            const donation = await donationModel.createDonation({
                user_id: user.id,
                amount: body.amount,
                currency: body.currency || 'USD',
                message: body.message,
                is_anonymous: body.is_anonymous,
                payment_method: body.payment_method || 'card',
                donor_name: body.donor_name,
                donor_email: body.donor_email
            });

            return this.success(c, { donation }, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get public donations / top supporters
     * GET /api/donations/public
     */
    async getPublic(c: AppContext) {
        try {
            const limit = this.getQueryInt(c, 'limit') || 50;

            const donationModel = new DonationModel(c.env.DB);
            const topSupporters = await donationModel.getTopSupporters(limit);
            const platformTotal = await donationModel.getTotalDonations();

            return this.success(c, {
                items: topSupporters,
                platform_total: platformTotal
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get my donations (sent)
     * GET /api/donations/sent
     */
    async getMySent(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const limit = this.getQueryInt(c, 'limit') || 20;

            const donationModel = new DonationModel(c.env.DB);
            const donations = await donationModel.getDonationsByUser(user.id, limit);

            return this.success(c, { items: donations });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get my donations (received) - same as sent since model uses user_id
     * GET /api/donations/received
     */
    async getMyReceived(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const limit = this.getQueryInt(c, 'limit') || 20;

            const donationModel = new DonationModel(c.env.DB);
            const donations = await donationModel.getDonationsByUser(user.id, limit);

            return this.success(c, { items: donations });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default DonationController;
