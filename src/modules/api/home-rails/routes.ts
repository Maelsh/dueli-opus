/**
 * Home Rails API Routes — R3-RAILS-1A
 * مسارات صفوف الرئيسية
 *
 * Frozen per-rail result sessions for every Home rail (Suggested Guest/User,
 * Dialogue/Science/Talents and each subcategory × Live/Recorded/Upcoming).
 * Auth-optional: guests browse Upcoming/Live/Recorded rails, but browsing
 * never grants invite/join actions (those endpoints keep their own guards).
 *
 * MVC-compliant: Routes delegate to HomeRailsController.
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { HomeRailsController } from '../../../controllers/HomeRailsController';
import { authMiddleware } from '../../../middleware/auth';

const homeRailsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new HomeRailsController();

homeRailsRoutes.use('*', authMiddleware({ required: false }));

/**
 * R3-RAILS-1A: freeze one Home rail session (stable order at T0).
 * POST /api/home-rails/sessions
 */
homeRailsRoutes.post('/sessions', (c) => controller.createRailSession(c));

/**
 * R3-RAILS-1A: read one page of a frozen Home rail session.
 * GET /api/home-rails/sessions/:id/page
 */
homeRailsRoutes.get('/sessions/:id/page', (c) => controller.readRailSessionPage(c));

export default homeRailsRoutes;
