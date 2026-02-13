/**
 * @file src/modules/api/reports/routes.ts
 * @description مسارات البلاغات
 * @module api/reports/routes
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { InteractionController } from '../../../controllers/InteractionController';
import { AdminController } from '../../../controllers/AdminController';

const reportsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new InteractionController();
const adminController = new AdminController();

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

// =====================================
// Report Decision Ratings (FR-012)
// =====================================

/**
 * POST /api/reports/:id/rate-decision
 * Rate an admin's decision (authenticated users)
 */
reportsRoutes.post('/:id/rate-decision', async (c) => {
    return adminController.rateDecision(c);
});

/**
 * GET /api/reports/:id/decision-rating
 * Get decision rating stats (PUBLIC)
 */
reportsRoutes.get('/:id/decision-rating', async (c) => {
    return adminController.getDecisionRating(c);
});

/**
 * POST /api/reports/:id/appeal
 * Submit an appeal for a report decision
 */
reportsRoutes.post('/:id/appeal', async (c) => {
    // Appeal creation - inline because it's user-facing not admin-facing
    try {
        const user = c.get('user');
        if (!user) return c.json({ success: false, error: 'Unauthorized' }, 401);

        const reportId = parseInt(c.req.param('id'));
        const body = await c.req.json<{ reason: string }>();

        if (!body?.reason || body.reason.length < 10) {
            return c.json({ success: false, error: 'Appeal reason must be at least 10 characters' }, 400);
        }

        // Check report exists and user is the target
        const report = await c.env.DB.prepare('SELECT * FROM reports WHERE id = ?').bind(reportId).first();
        if (!report) {
            return c.json({ success: false, error: 'Report not found' }, 404);
        }

        // Check for existing appeal
        const existing = await c.env.DB.prepare(
            'SELECT 1 FROM report_appeals WHERE report_id = ? AND appellant_id = ?'
        ).bind(reportId, user.id).first();
        if (existing) {
            return c.json({ success: false, error: 'You already submitted an appeal for this report' }, 400);
        }

        await c.env.DB.prepare(`
            INSERT INTO report_appeals (report_id, appellant_id, reason, status, created_at)
            VALUES (?, ?, ?, 'pending', datetime('now'))
        `).bind(reportId, user.id, body.reason).run();

        return c.json({ success: true, data: { submitted: true } }, 201);
    } catch (error) {
        console.error('Submit appeal error:', error);
        return c.json({ success: false, error: 'Internal server error' }, 500);
    }
});

export default reportsRoutes;
