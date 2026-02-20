/**
 * Payment & Ad Block API Routes (FR-016, FR-018)
 * مسارات طرق الدفع وحظر الإعلانات
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { PaymentController } from '../../../controllers/PaymentController';

const paymentRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new PaymentController();

// ============================================
// Payment Methods (FR-018)
// ============================================

/**
 * Get payment methods
 * GET /api/payment-methods
 */
paymentRoutes.get('/', (c) => controller.getMethods(c));

/**
 * Add payment method
 * POST /api/payment-methods
 */
paymentRoutes.post('/', (c) => controller.addMethod(c));

/**
 * Update payment method
 * PUT /api/payment-methods/:id
 */
paymentRoutes.put('/:id', (c) => controller.updateMethod(c));

/**
 * Delete payment method
 * DELETE /api/payment-methods/:id
 */
paymentRoutes.delete('/:id', (c) => controller.deleteMethod(c));

/**
 * Set default payment method
 * POST /api/payment-methods/:id/default
 */
paymentRoutes.post('/:id/default', (c) => controller.setDefault(c));

export default paymentRoutes;
