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
                receiver_id?: number;
                amount: number;
                currency?: string;
                message?: string;
                is_public?: boolean;
                payment_method?: string;
            }>(c);

            if (!body?.amount) {
                return this.validationError(c, 'Amount is required');
            }

            // Minimum $1
            if (body.amount < 1) {
                return this.validationError(c, 'Minimum donation is $1');
            }

            // Cannot donate to yourself
            if (body.receiver_id && body.receiver_id === user.id) {
                return this.validationError(c, 'Cannot donate to yourself');
            }

            const donationModel = new DonationModel(c.env.DB);
            const donation = await donationModel.create({
                sender_id: user.id,
                receiver_id: body.receiver_id || null,
                amount: body.amount,
                currency: body.currency || 'USD',
                message: body.message,
                is_public: body.is_public !== false ? 1 : 0,
                payment_method: body.payment_method
            });

            return this.success(c, { donation }, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get public donations (transparency)
     * GET /api/donations/public
     */
    async getPublic(c: AppContext) {
        try {
            const limit = this.getQueryInt(c, 'limit') || 50;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const donationModel = new DonationModel(c.env.DB);
            const donations = await donationModel.getPublicDonations(limit, offset);
            const platformTotal = await donationModel.getPlatformDonationsTotal();

            return this.success(c, {
                items: donations,
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
            const offset = this.getQueryInt(c, 'offset') || 0;

            const donationModel = new DonationModel(c.env.DB);
            const donations = await donationModel.getSentDonations(user.id, limit, offset);

            return this.success(c, { items: donations });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get my donations (received)
     * GET /api/donations/received
     */
    async getMyReceived(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const limit = this.getQueryInt(c, 'limit') || 20;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const donationModel = new DonationModel(c.env.DB);
            const donations = await donationModel.getReceivedDonations(user.id, limit, offset);

            return this.success(c, { items: donations });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default DonationController;
