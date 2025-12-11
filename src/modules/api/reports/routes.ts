/**
 * @file src/modules/api/reports/routes.ts
 * @description مسارات البلاغات
 * @module api/reports/routes
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { InteractionController } from '../../../controllers/InteractionController';

const reportsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new InteractionController();

/**
 * POST /api/reports
 * Submit a new report
 */
reportsRoutes.post('/', async (c) => {
    return controller.submitReport(c);
});

/**
 * GET /api/reports/reasons
 * Get available report reasons
 */
reportsRoutes.get('/reasons', async (c) => {
    return controller.getReportReasons(c);
});

export default reportsRoutes;
