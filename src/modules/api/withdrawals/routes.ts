/**
 * @file src/modules/api/withdrawals/routes.ts
 * @description Routes for withdrawal requests (Task 6, rewritten with MVC)
 *              مسارات طلبات السحب – المستخدم
 * @module api/withdrawals
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';
import { WithdrawalController } from '../../../controllers/WithdrawalController';

const withdrawalsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new WithdrawalController();

// All withdrawal routes require authentication
withdrawalsRoutes.use('*', authMiddleware({ required: true }));

/**
 * GET /api/withdrawals
 * User's wallet balance + withdrawal history (paginated)
 */
withdrawalsRoutes.get('/', async (c) => controller.getMyWithdrawals(c));

/**
 * POST /api/withdrawals
 * Submit a new withdrawal request
 * Body: { amount, payment_method, payment_details }
 */
withdrawalsRoutes.post('/', async (c) => controller.createWithdrawal(c));

/**
 * GET /api/withdrawals/:id
 * Get single withdrawal request by ID (must belong to authenticated user)
 */
withdrawalsRoutes.get('/:id', async (c) => controller.getMyWithdrawal(c));

/**
 * DELETE /api/withdrawals/:id
 * Cancel a pending withdrawal request (refunds balance)
 */
withdrawalsRoutes.delete('/:id', async (c) => controller.cancelWithdrawal(c));

export default withdrawalsRoutes;
