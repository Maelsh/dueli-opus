/**
 * @file src/controllers/PaymentController.ts
 * @description متحكم طرق الدفع (FR-018)
 * @module controllers/PaymentController
 */

import { BaseController, AppContext } from './base/BaseController';
import { PaymentMethodModel } from '../models/PaymentMethodModel';
import { AdBlockModel } from '../models/AdBlockModel';

/**
 * Payment Controller Class
 * متحكم طرق الدفع وحظر الإعلانات
 */
export class PaymentController extends BaseController {

    // =====================================
    // Payment Methods (FR-018)
    // =====================================

    /**
     * Get user's payment methods
     * GET /api/payment-methods
     */
    async getMethods(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const model = new PaymentMethodModel(c.env.DB);
            const methods = await model.getUserMethods(user.id);

            return this.success(c, { methods });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Add payment method
     * POST /api/payment-methods
     */
    async addMethod(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const body = await this.getBody<{
                type: 'bank' | 'paypal' | 'wise';
                bank_name?: string;
                iban?: string;
                swift_code?: string;
                account_holder?: string;
                email?: string;
                is_default?: boolean;
            }>(c);

            if (!body?.type || !['bank', 'paypal', 'wise'].includes(body.type)) {
                return this.validationError(c, 'Valid type required: bank, paypal, or wise');
            }

            // Validate based on type
            if (body.type === 'bank') {
                if (!body.iban || !body.bank_name) {
                    return this.validationError(c, 'IBAN and bank name are required for bank accounts');
                }
            } else {
                if (!body.email) {
                    return this.validationError(c, 'Email is required for PayPal/Wise');
                }
            }

            const model = new PaymentMethodModel(c.env.DB);
            const method = await model.create({
                user_id: user.id,
                type: body.type,
                bank_name: body.bank_name,
                iban: body.iban,
                swift_code: body.swift_code,
                account_holder: body.account_holder,
                email: body.email,
                is_default: body.is_default ? 1 : 0
            });

            return this.success(c, { method }, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Update payment method
     * PUT /api/payment-methods/:id
     */
    async updateMethod(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const methodId = this.getParamInt(c, 'id');

            if (!methodId) {
                return this.validationError(c, 'Invalid ID');
            }

            const model = new PaymentMethodModel(c.env.DB);
            const existing = await model.findById(methodId);
            if (!existing || existing.user_id !== user.id) {
                return this.notFound(c);
            }

            const body = await this.getBody<Partial<{
                bank_name: string;
                iban: string;
                swift_code: string;
                account_holder: string;
                email: string;
            }>>(c);

            const updated = await model.update(methodId, body || {});
            return this.success(c, { method: updated });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Delete payment method
     * DELETE /api/payment-methods/:id
     */
    async deleteMethod(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const methodId = this.getParamInt(c, 'id');

            if (!methodId) {
                return this.validationError(c, 'Invalid ID');
            }

            const model = new PaymentMethodModel(c.env.DB);
            const deleted = await model.deleteMethod(user.id, methodId);

            if (!deleted) {
                return this.notFound(c);
            }

            return this.success(c, { deleted: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Set default payment method
     * POST /api/payment-methods/:id/default
     */
    async setDefault(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const methodId = this.getParamInt(c, 'id');

            if (!methodId) {
                return this.validationError(c, 'Invalid ID');
            }

            const model = new PaymentMethodModel(c.env.DB);
            const success = await model.setDefault(user.id, methodId);

            if (!success) {
                return this.notFound(c);
            }

            return this.success(c, { success: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Ad Blocking (FR-016)
    // =====================================

    /**
     * Get blocked ads for current user
     * GET /api/ad-blocks
     */
    async getBlockedAds(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const model = new AdBlockModel(c.env.DB);
            const blockedAds = await model.getBlockedAdsWithDetails(user.id);

            return this.success(c, { items: blockedAds });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Block an ad
     * POST /api/ad-blocks
     */
    async blockAd(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const body = await this.getBody<{ ad_id: number }>(c);
            if (!body?.ad_id) {
                return this.validationError(c, 'ad_id is required');
            }

            const model = new AdBlockModel(c.env.DB);
            await model.blockAd(user.id, body.ad_id);

            return this.success(c, { blocked: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Unblock an ad
     * DELETE /api/ad-blocks/:adId
     */
    async unblockAd(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const adId = this.getParamInt(c, 'adId');
            if (!adId) {
                return this.validationError(c, 'Invalid ad ID');
            }

            const model = new AdBlockModel(c.env.DB);
            const unblocked = await model.unblockAd(user.id, adId);

            return this.success(c, { unblocked });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default PaymentController;
