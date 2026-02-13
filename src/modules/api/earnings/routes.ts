/**
 * @file src/modules/api/earnings/routes.ts
 * @description مسارات الأرباح
 * @module api/earnings/routes
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';
import { EarningsModel } from '../../../models/EarningsModel';

const earningsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/earnings
 * Get current user's earnings
 */
earningsRoutes.get('/', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: { message: 'Unauthorized' } }, 401);
        }

        const earningsModel = new EarningsModel(c.env.DB);
        const earnings = await earningsModel.getOrCreateForUser(user.id);

        return c.json({
            success: true,
            data: {
                available: earnings.available || 0,
                pending: earnings.pending || 0,
                on_hold: earnings.on_hold || 0,
                total: earnings.total || 0,
                withdrawn: earnings.withdrawn || 0
            }
        });
    } catch (error) {
        console.error('Get earnings error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to get earnings' }
        }, 500);
    }
});

/**
 * POST /api/earnings/withdrawal
 * Request a withdrawal
 */
earningsRoutes.post('/withdrawal', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: { message: 'Unauthorized' } }, 401);
        }

        const body = await c.req.json();
        const { amount, payment_method, payment_details } = body;

        // Validate amount
        if (!amount || amount < 50) {
            return c.json({
                success: false,
                error: { message: 'Minimum withdrawal amount is $50.00' }
            }, 400);
        }

        // Validate payment method
        if (!payment_method || !['bank_transfer', 'paypal', 'wise'].includes(payment_method)) {
            return c.json({
                success: false,
                error: { message: 'Invalid payment method' }
            }, 400);
        }

        // Validate payment details
        if (!payment_details || payment_details.trim().length < 5) {
            return c.json({
                success: false,
                error: { message: 'Payment details are required' }
            }, 400);
        }

        const earningsModel = new EarningsModel(c.env.DB);

        // Check if user has enough available balance
        const earnings = await earningsModel.getForUser(user.id);
        if (!earnings || earnings.available < amount) {
            return c.json({
                success: false,
                error: { message: 'Insufficient available balance' }
            }, 400);
        }

        // Create withdrawal request
        const request = await earningsModel.createWithdrawalRequest({
            user_id: user.id,
            amount,
            payment_method,
            payment_details
        });

        if (!request) {
            return c.json({
                success: false,
                error: { message: 'Failed to create withdrawal request' }
            }, 500);
        }

        return c.json({
            success: true,
            data: {
                request_id: request.id,
                amount: request.amount,
                status: request.status,
                created_at: request.created_at
            }
        });
    } catch (error) {
        console.error('Withdrawal request error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to process withdrawal request' }
        }, 500);
    }
});

/**
 * GET /api/earnings/withdrawals
 * Get user's withdrawal history
 */
earningsRoutes.get('/withdrawals', authMiddleware, async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: { message: 'Unauthorized' } }, 401);
        }

        const earningsModel = new EarningsModel(c.env.DB);
        const requests = await earningsModel.getWithdrawalRequests(user.id);

        return c.json({
            success: true,
            data: requests
        });
    } catch (error) {
        console.error('Get withdrawals error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to get withdrawal history' }
        }, 500);
    }
});

export default earningsRoutes;
