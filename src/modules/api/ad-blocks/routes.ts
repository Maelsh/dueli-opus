/**
 * Ad Block API Routes (FR-016)
 * مسارات حظر الإعلانات
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { PaymentController } from '../../../controllers/PaymentController';

const adBlockRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new PaymentController();

/**
 * Get blocked ads
 * GET /api/ad-blocks
 */
adBlockRoutes.get('/', (c) => controller.getBlockedAds(c));

/**
 * Block an ad
 * POST /api/ad-blocks
 */
adBlockRoutes.post('/', (c) => controller.blockAd(c));

/**
 * Unblock an ad
 * DELETE /api/ad-blocks/:adId
 */
adBlockRoutes.delete('/:adId', (c) => controller.unblockAd(c));

export default adBlockRoutes;
