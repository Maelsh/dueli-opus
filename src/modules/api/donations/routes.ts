/**
 * Donation API Routes (FR-020)
 * مسارات التبرعات
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { DonationController } from '../../../controllers/DonationController';

const donationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new DonationController();

/**
 * Create donation
 * POST /api/donations
 */
donationRoutes.post('/', (c) => controller.create(c));

/**
 * Get public donations (transparency)
 * GET /api/donations/public
 */
donationRoutes.get('/public', (c) => controller.getPublic(c));

/**
 * Get my sent donations
 * GET /api/donations/sent
 */
donationRoutes.get('/sent', (c) => controller.getMySent(c));

/**
 * Get my received donations
 * GET /api/donations/received
 */
donationRoutes.get('/received', (c) => controller.getMyReceived(c));

export default donationRoutes;
