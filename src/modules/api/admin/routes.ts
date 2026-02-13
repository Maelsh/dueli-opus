/**
 * @file src/modules/api/admin/routes.ts
 * @description مسارات لوحة الأدمن
 * @module api/admin/routes
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { AdminController } from '../../../controllers/AdminController';

const adminRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new AdminController();

// =====================================
// Dashboard - لوحة القيادة
// =====================================

/**
 * GET /api/admin/stats
 * Get dashboard statistics
 */
adminRoutes.get('/stats', async (c) => {
    return controller.getStats(c);
});

// =====================================
// Users - المستخدمين
// =====================================

/**
 * GET /api/admin/users
 * Get users list
 */
adminRoutes.get('/users', async (c) => {
    return controller.getUsers(c);
});

/**
 * PUT /api/admin/users/:id/ban
 * Ban/unban user
 */
adminRoutes.put('/users/:id/ban', async (c) => {
    return controller.toggleUserBan(c);
});

// =====================================
// Reports - البلاغات
// =====================================

/**
 * GET /api/admin/reports
 * Get reports list
 */
adminRoutes.get('/reports', async (c) => {
    return controller.getReports(c);
});

/**
 * PUT /api/admin/reports/:id
 * Review report
 */
adminRoutes.put('/reports/:id', async (c) => {
    return controller.reviewReport(c);
});

// =====================================
// Advertisements - الإعلانات
// =====================================

/**
 * GET /api/admin/ads
 * Get all ads
 */
adminRoutes.get('/ads', async (c) => {
    return controller.getAds(c);
});

/**
 * POST /api/admin/ads
 * Create ad
 */
adminRoutes.post('/ads', async (c) => {
    return controller.createAd(c);
});

/**
 * PUT /api/admin/ads/:id
 * Update ad
 */
adminRoutes.put('/ads/:id', async (c) => {
    return controller.updateAd(c);
});

/**
 * DELETE /api/admin/ads/:id
 * Delete ad
 */
adminRoutes.delete('/ads/:id', async (c) => {
    return controller.deleteAd(c);
});

// =====================================
// Report Appeals (FR-012)
// =====================================

/**
 * GET /api/admin/appeals
 * Get report appeals list
 */
adminRoutes.get('/appeals', async (c) => {
    return controller.getAppeals(c);
});

/**
 * PUT /api/admin/appeals/:id
 * Review an appeal
 */
adminRoutes.put('/appeals/:id', async (c) => {
    return controller.reviewAppeal(c);
});

// =====================================
// Admin Transparency (PUBLIC endpoints)
// =====================================

/**
 * GET /api/admin/team
 * Get admin team list (PUBLIC)
 */
adminRoutes.get('/team', async (c) => {
    return controller.getTeam(c);
});

/**
 * GET /api/admin/action-log
 * Get admin action log (PUBLIC)
 */
adminRoutes.get('/action-log', async (c) => {
    return controller.getActionLog(c);
});

export default adminRoutes;
