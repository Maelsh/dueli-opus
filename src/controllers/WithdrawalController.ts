/**
 * @file src/controllers/WithdrawalController.ts
 * @description MVC Controller for withdrawal requests — documented lifecycle (8.D)
 *              requested → approved → paid | rejected
 *              متحكم طلبات السحب - للمستخدم والإداري
 * @module controllers/WithdrawalController
 *
 * 8.D rules:
 * - كل الأثر المالي عبر LedgerService فقط (الحجز لحظة الطلب، والتحرير العكسي
 *   عند الرفض/الإلغاء). لا كتابة مباشرة في user_earnings.
 * - الانتقالات محروسة في SQL داخل النموذج (UPDATE مشروط + changes).
 * - الموافقة والدفع والرفض بأدمن فقط (M6) ومسجلة في admin_audit_log —
 *   وكل انتقال في الدورة (بما فيه الطلب والإلغاء) مسجل مع صاحبه.
 */

import { Context } from 'hono';
import { D1Database } from '@cloudflare/workers-types';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { WithdrawalRequestModel, WithdrawalRequestError } from '../models/WithdrawalRequestModel';
import { AdminAuditLogModel } from '../models/AdminAuditLogModel';
import { LedgerService } from '../lib/services/LedgerService';
import { EventPusher } from '../lib/services/EventPusher';

export class WithdrawalController extends BaseController {

    /** ترجمة رمز خطأ النموذج إلى رسالة i18n (withdrawals.*). */
    private withdrawalErrorMessage(code: WithdrawalRequestError, c: Context<{ Bindings: Bindings; Variables: Variables }>): string {
        switch (code) {
            case 'min_amount':           return this.t('withdrawals.min_amount', c);
            case 'insufficient_balance': return this.t('withdrawals.insufficient_balance', c);
            default:                     return this.t('errors.invalid_request', c);
        }
    }

    private async audit(
        db: D1Database,
        actorId: number,
        action: string,
        requestId: number,
        details: string | null
    ): Promise<void> {
        const auditModel = new AdminAuditLogModel(db);
        await auditModel.log(actorId, action, 'withdrawal_request', requestId, details);
    }

    // =============================================
    // USER: own wallet
    // =============================================

    /**
     * GET /api/withdrawals
     * Returns the authenticated user's withdrawal history + wallet balance.
     * الرصيد المتاح من دفتر الأستاذ (مصدر الحقيقة بعد الحجز) — 8.D.
     */
    async getMyWithdrawals(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const limit  = this.getQueryInt(c, 'limit', 20);
            const offset = this.getQueryInt(c, 'offset', 0);

            const model = new WithdrawalRequestModel(c.env.DB);
            const ledger = new LedgerService(c.env.DB);

            const [requests, earnings, available] = await Promise.all([
                model.getForUser(user.id, limit, offset),
                c.env.DB.prepare(
                    `SELECT available, pending, on_hold, withdrawn, total FROM user_earnings WHERE user_id = ?`
                ).bind(user.id).first<{ available: number; pending: number; on_hold: number; withdrawn: number; total: number }>(),
                ledger.balance(`user:${user.id}`)
            ]);

            return this.success(c, {
                wallet: {
                    available:  available,
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
     * User submits a new withdrawal request (requested + ledger hold).
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
                return this.validationError(c, this.t('errors.invalid_request', c));
            }

            const model  = new WithdrawalRequestModel(c.env.DB);
            const result = await model.requestWithdrawal({
                user_id:         user.id,
                amount:          body.amount,
                payment_method:  body.payment_method,
                payment_details: body.payment_details
            });

            if ('error' in result) {
                return this.validationError(c, this.withdrawalErrorMessage(result.error, c));
            }

            // تدقيق الانتقال requested (الفاعل = صاحب الطلب).
            await this.audit(
                c.env.DB, user.id, 'request_withdrawal', result.request.id,
                `Withdrawal requested: $${result.request.amount} via ${result.request.payment_method}`
            );

            // Real-time notification to the user
            const pusher = new EventPusher(c.env.DB, c.env);
            await pusher.publishWithdrawalStatus(result.request.user_id, result.request.id, 'requested');

            return this.success(c, { request: result.request }, 201);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * DELETE /api/withdrawals/:id
     * User cancels a requested withdrawal (releases the hold via ledger).
     */
    async cancelWithdrawal(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) return this.unauthorized(c);

            const id    = this.getParamInt(c, 'id');
            const model = new WithdrawalRequestModel(c.env.DB);
            const ok    = await model.cancelByUser(id, user.id);

            if (!ok) {
                return this.error(c, this.t('errors.invalid_request', c), 400);
            }

            await this.audit(
                c.env.DB, user.id, 'cancel_withdrawal', id,
                'Cancelled by user — hold released'
            );

            const pusher = new EventPusher(c.env.DB, c.env);
            await pusher.publishWithdrawalStatus(user.id, id, 'rejected', 'Cancelled by user');

            return this.success(c, { cancelled: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    // =============================================
    // ADMIN: review queue (M6 — admin only)
    // =============================================

    private async isAdmin(c: Context<{ Bindings: Bindings; Variables: Variables }>): Promise<boolean> {
        const user = this.getCurrentUser(c);
        return user?.is_admin === 1;
    }

    /**
     * GET /api/admin/withdrawals
     * Admin: list all withdrawal requests (filterable by lifecycle status).
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
     * Admin: approve a requested withdrawal AND record the payout
     * (requested → approved → paid, both SQL-guarded in one batch).
     * Approving twice ⇒ 409 with a single payment only.
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

            if (!result) {
                const existing = await model.findById(id);
                if (!existing) return this.notFound(c);
                // الحارس رفض الانتقال — الطلب عولج سلفاً (موافقة مكررة ⇒ لا دفع ثانٍ).
                return this.error(c, this.t('errors.invalid_request', c), 409);
            }

            // تدقيق كل انتقال في الدورة.
            await this.audit(
                c.env.DB, admin.id, 'approve_withdrawal', id,
                `Approved withdrawal of $${result.amount}`
            );
            await this.audit(
                c.env.DB, admin.id, 'pay_withdrawal', id,
                `Paid withdrawal of $${result.amount} | txn=${body.transaction_id}`
            );

            // Real-time notification to the user
            const pusher = new EventPusher(c.env.DB, c.env);
            await pusher.publishWithdrawalStatus(result.user_id, id, 'paid', body.note);

            return this.success(c, { request: result });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * PUT /api/admin/withdrawals/:id/reject
     * Admin: reject a requested/approved withdrawal (releases the hold
     * via reverse ledger entries).
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

            if (!result) {
                const existing = await model.findById(id);
                if (!existing) return this.notFound(c);
                return this.error(c, this.t('errors.invalid_request', c), 409);
            }

            // Audit log
            await this.audit(
                c.env.DB, admin.id, 'reject_withdrawal', id,
                `Rejected withdrawal of $${result.amount} | reason="${body.reason}"`
            );

            // Real-time notification to the user
            const pusher = new EventPusher(c.env.DB, c.env);
            await pusher.publishWithdrawalStatus(result.user_id, id, 'rejected', body.reason);

            return this.success(c, { request: result });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default WithdrawalController;
