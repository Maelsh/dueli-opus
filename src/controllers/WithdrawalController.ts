/**
 * @file src/controllers/WithdrawalController.ts
 * @description MVC Controller for withdrawal requests (Task 6)
 *              متحكم طلبات السحب - للمستخدم والإداري
 * @module controllers/WithdrawalController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { WithdrawalRequestModel } from '../models/WithdrawalRequestModel';
import { AdminAuditLogModel } from '../models/AdminAuditLogModel';
import { EventPusher } from '../lib/services/EventPusher';

export class WithdrawalController extends BaseController {

    // =============================================
    // USER: own wallet
    // =============================================

    /**
     * GET /api/withdrawals
     * Returns the authenticated user's withdrawal history + available balance.
     */
    async getMyWithdrawals(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const limit  = this.getQueryInt(c, 'limit', 20);
            const offset = this.getQueryInt(c, 'offset', 0);

            const model = new WithdrawalRequestModel(c.env.DB);

            const [requests, earnings] = await Promise.all([
                model.getForUser(user.id, limit, offset),
                c.env.DB.prepare(
                    `SELECT available, pending, on_hold, withdrawn, total FROM user_earnings WHERE user_id = ?`
                ).bind(user.id).first<{ available: number; pending: number; on_hold: number; withdrawn: number; total: number }>()
            ]);

            return this.success(c, {
                wallet: {
                    available:  earnings?.available  ?? 0,
                    pending:    earnings?.pending    ?? 0,
                    on_hold:    earnings?.on_hold    ?? 0,
                    withdrawn:  earnings?.withdrawn  ?? 0,
                    total:      earnings?.total      ?? 0
                },
                requests,
                meta: { limit, offset }
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * GET /api/withdrawals/:id
     * Returns a single withdrawal request belonging to the authenticated user.
     */
    async getMyWithdrawal(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const id = this.getParamInt(c, 'id');
            const model = new WithdrawalRequestModel(c.env.DB);
            const req = await model.findById(id);

            if (!req || req.user_id !== user.id) return this.notFound(c);

            return this.success(c, { request: req });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * POST /api/withdrawals
     * User submits a new withdrawal request.
     *
     * Body: { amount, payment_method, payment_details }
     */
    async createWithdrawal(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const body = await this.getBody<{
                amount: number;
                payment_method: string;
                payment_details: string;
            }>(c);

            if (!body?.amount || !body?.payment_method || !body?.payment_details) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }
            if (typeof body.amount !== 'number' || body.amount <= 0) {
                return this.validationError(c, this.t('errors.invalid_amount', c));
            }

            const model  = new WithdrawalRequestModel(c.env.DB);
            const result = await model.requestWithdrawal({
                user_id:         user.id,
                amount:          body.amount,
                payment_method:  body.payment_method,
                payment_details: body.payment_details
            });

            if ('error' in result) {
                return this.validationError(c, result.error);
            }

            return this.success(c, { request: result.request }, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * DELETE /api/withdrawals/:id
     * User cancels a pending withdrawal request (refund).
     */
    async cancelWithdrawal(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const id    = this.getParamInt(c, 'id');
            const model = new WithdrawalRequestModel(c.env.DB);
            const ok    = await model.cancelByUser(id, user.id);

            if (!ok) {
                return this.error(c, this.t('errors.cannot_cancel', c), 400);
            }

            return this.success(c, { cancelled: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    // =============================================
    // ADMIN: review queue
    // =============================================

    private async isAdmin(c: Context<{ Bindings: Bindings; Variables: Variables }>): Promise<boolean> {
        const user = this.getCurrentUser(c);
        return user?.is_admin === 1;
    }

    /**
     * GET /api/admin/withdrawals
     * Admin: list all withdrawal requests (filterable by status).
     */
    async adminListWithdrawals(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const status = this.getQuery(c, 'status') as any || undefined;
            const limit  = this.getQueryInt(c, 'limit', 50);
            const offset = this.getQueryInt(c, 'offset', 0);

            const model = new WithdrawalRequestModel(c.env.DB);
            const [requests, pendingCount] = await Promise.all([
                model.getAdminQueue({ status, limit, offset }),
                model.countPending()
            ]);

            return this.success(c, { requests, pendingCount, meta: { limit, offset } });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * PUT /api/admin/withdrawals/:id/approve
     * Admin: approve a pending withdrawal request.
     *
     * Body: { transaction_id, note? }
     */
    async adminApproveWithdrawal(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const admin = this.getCurrentUser(c);
            const id    = this.getParamInt(c, 'id');
            const body  = await this.getBody<{ transaction_id: string; note?: string }>(c);

            if (!body?.transaction_id) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const model  = new WithdrawalRequestModel(c.env.DB);
            const result = await model.approve(id, admin.id, body.transaction_id, body.note);

            if (!result) return this.notFound(c);

            // Audit log
            const auditModel = new AdminAuditLogModel(c.env.DB);
            await auditModel.log(
                admin.id, 'approve_withdrawal', 'withdrawal_request', id,
                `Approved withdrawal of $${result.amount} | txn=${body.transaction_id}`
            );

            // Real-time notification to the user
            const pusher = new EventPusher(c.env.DB);
            await pusher.publishWithdrawalStatus(result.user_id, id, 'completed', body.note);

            return this.success(c, { request: result });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * PUT /api/admin/withdrawals/:id/reject
     * Admin: reject a pending withdrawal request (refund to user).
     *
     * Body: { reason }
     */
    async adminRejectWithdrawal(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const admin = this.getCurrentUser(c);
            const id    = this.getParamInt(c, 'id');
            const body  = await this.getBody<{ reason: string }>(c);

            if (!body?.reason) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const model  = new WithdrawalRequestModel(c.env.DB);
            const result = await model.reject(id, admin.id, body.reason);

            if (!result) return this.notFound(c);

            // Audit log
            const auditModel = new AdminAuditLogModel(c.env.DB);
            await auditModel.log(
                admin.id, 'reject_withdrawal', 'withdrawal_request', id,
                `Rejected withdrawal of $${result.amount} | reason="${body.reason}"`
            );

            // Real-time notification to the user
            const pusher = new EventPusher(c.env.DB);
            await pusher.publishWithdrawalStatus(result.user_id, id, 'rejected', body.reason);

            return this.success(c, { request: result });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default WithdrawalController;
