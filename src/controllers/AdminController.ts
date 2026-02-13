/**
 * @file src/controllers/AdminController.ts
 * @description متحكم لوحة الأدمن
 * @module controllers/AdminController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { UserModel } from '../models/UserModel';
import { CompetitionModel } from '../models/CompetitionModel';
import { ReportModel } from '../models/ReportModel';
import { AdvertisementModel, EarningsModel } from '../models/AdvertisementModel';

/**
 * Admin Controller Class
 * متحكم لوحة الأدمن
 */
export class AdminController extends BaseController {

    /**
     * Check if user is admin
     */
    private async isAdmin(c: Context<{ Bindings: Bindings; Variables: Variables }>): Promise<boolean> {
        const user = this.getCurrentUser(c);
        return user?.is_admin === 1;
    }

    /**
     * Get dashboard stats
     * GET /api/admin/stats
     */
    async getStats(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) {
                return this.forbidden(c);
            }

            const db = c.env.DB;

            // Get counts
            const [users, competitions, reports, ads] = await Promise.all([
                db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
                db.prepare('SELECT COUNT(*) as count FROM competitions').first<{ count: number }>(),
                db.prepare('SELECT COUNT(*) as count FROM reports WHERE status = ?').bind('pending').first<{ count: number }>(),
                db.prepare('SELECT COUNT(*) as count FROM advertisements WHERE is_active = 1').first<{ count: number }>()
            ]);

            // Competition status breakdown
            const competitionStats = await db.prepare(`
                SELECT status, COUNT(*) as count FROM competitions GROUP BY status
            `).all<{ status: string; count: number }>();

            // Revenue stats
            const revenueStats = await db.prepare(`
                SELECT SUM(amount) as total FROM user_earnings
            `).first<{ total: number | null }>();

            return this.success(c, {
                users: users?.count || 0,
                competitions: competitions?.count || 0,
                pendingReports: reports?.count || 0,
                activeAds: ads?.count || 0,
                competitionsByStatus: competitionStats.results || [],
                totalRevenue: revenueStats?.total || 0
            });
        } catch (error) {
            console.error('Admin stats error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get users list
     * GET /api/admin/users
     */
    async getUsers(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const limit = this.getQueryInt(c, 'limit') || 50;
            const offset = this.getQueryInt(c, 'offset') || 0;
            const search = this.getQuery(c, 'search');

            let query = `
                SELECT id, username, display_name, email, avatar_url, is_verified, is_admin,
                       total_competitions, average_rating, created_at
                FROM users
            `;
            const params: any[] = [];

            if (search) {
                query += ` WHERE username LIKE ? OR email LIKE ? OR display_name LIKE ?`;
                params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }

            query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);

            const result = await c.env.DB.prepare(query).bind(...params).all();

            return this.success(c, { users: result.results || [] });
        } catch (error) {
            console.error('Admin get users error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Ban/unban user
     * PUT /api/admin/users/:id/ban
     */
    async toggleUserBan(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const userId = this.getParamInt(c, 'id');
            const body = await this.getBody<{ banned: boolean }>(c);

            if (!userId || body?.banned === undefined) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            // For now, we'll use a simple approach - you might want to add a 'banned' column
            // In production, you'd want a more sophisticated approach with ban reasons, duration, etc.
            await c.env.DB.prepare(`
                UPDATE users SET is_verified = ? WHERE id = ?
            `).bind(body.banned ? 0 : 1, userId).run();

            return this.success(c, { banned: body.banned });
        } catch (error) {
            console.error('Admin toggle ban error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get reports list
     * GET /api/admin/reports
     */
    async getReports(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const status = this.getQuery(c, 'status') as any || undefined;
            const limit = this.getQueryInt(c, 'limit') || 50;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const reportModel = new ReportModel(c.env.DB);
            const reports = await reportModel.getReports({ status, limit, offset });

            return this.success(c, { reports });
        } catch (error) {
            console.error('Admin get reports error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Review report
     * PUT /api/admin/reports/:id
     */
    async reviewReport(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const reportId = this.getParamInt(c, 'id');
            const user = this.getCurrentUser(c);
            const body = await this.getBody<{ status: string; action_taken?: string }>(c);

            if (!reportId || !body?.status) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const reportModel = new ReportModel(c.env.DB);
            await reportModel.reviewReport(reportId, user.id, body.status as any, body.action_taken);

            return this.success(c, { reviewed: true });
        } catch (error) {
            console.error('Admin review report error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Advertisements - الإعلانات
    // =====================================

    /**
     * Get ads list
     * GET /api/admin/ads
     */
    async getAds(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const adModel = new AdvertisementModel(c.env.DB);
            const ads = await adModel.findAll({ limit: 100 });

            return this.success(c, { ads });
        } catch (error) {
            console.error('Admin get ads error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Create ad
     * POST /api/admin/ads
     */
    async createAd(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const user = this.getCurrentUser(c);
            const body = await this.getBody<{
                title: string;
                image_url?: string;
                link_url?: string;
                revenue_per_view?: number;
            }>(c);

            if (!body?.title) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const adModel = new AdvertisementModel(c.env.DB);
            const ad = await adModel.create({
                title: body.title,
                image_url: body.image_url,
                link_url: body.link_url,
                revenue_per_view: body.revenue_per_view,
                created_by: user.id
            });

            return this.success(c, { ad }, 201);
        } catch (error) {
            console.error('Admin create ad error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Update ad
     * PUT /api/admin/ads/:id
     */
    async updateAd(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const adId = this.getParamInt(c, 'id');
            const body = await this.getBody<Partial<{
                title: string;
                image_url: string;
                link_url: string;
                is_active: number;
                revenue_per_view: number;
            }>>(c);

            if (!adId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const adModel = new AdvertisementModel(c.env.DB);
            const ad = await adModel.update(adId, body || {});

            if (!ad) return this.notFound(c);
            return this.success(c, { ad });
        } catch (error) {
            console.error('Admin update ad error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Delete ad
     * DELETE /api/admin/ads/:id
     */
    async deleteAd(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const adId = this.getParamInt(c, 'id');
            if (!adId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const adModel = new AdvertisementModel(c.env.DB);
            await adModel.delete(adId);

            // Log admin action
            await this.logAdminAction(c, 'delete_ad', 'advertisement', adId);

            return this.success(c, { deleted: true });
        } catch (error) {
            console.error('Admin delete ad error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Report Appeals (FR-012)
    // =====================================

    /**
     * Get report appeals
     * GET /api/admin/appeals
     */
    async getAppeals(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const status = this.getQuery(c, 'status') || 'pending';
            const limit = this.getQueryInt(c, 'limit') || 50;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const result = await c.env.DB.prepare(`
                SELECT ra.*, 
                       r.reason as report_reason, r.target_type, r.target_id, r.status as report_status,
                       u.username as appellant_username, u.display_name as appellant_name,
                       rv.username as reviewer_username
                FROM report_appeals ra
                JOIN reports r ON ra.report_id = r.id
                JOIN users u ON ra.appellant_id = u.id
                LEFT JOIN users rv ON ra.reviewed_by = rv.id
                WHERE ra.status = ?
                ORDER BY ra.created_at DESC
                LIMIT ? OFFSET ?
            `).bind(status, limit, offset).all();

            return this.success(c, { appeals: result.results || [] });
        } catch (error) {
            console.error('Admin get appeals error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Review appeal
     * PUT /api/admin/appeals/:id
     */
    async reviewAppeal(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const appealId = this.getParamInt(c, 'id');
            const admin = this.getCurrentUser(c);
            const body = await this.getBody<{
                status: 'accepted' | 'rejected';
                decision_reason?: string;
            }>(c);

            if (!appealId || !body?.status) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            await c.env.DB.prepare(`
                UPDATE report_appeals 
                SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), decision_reason = ?
                WHERE id = ?
            `).bind(body.status, admin.id, body.decision_reason || null, appealId).run();

            // If accepted, reverse the original report action
            if (body.status === 'accepted') {
                const appeal = await c.env.DB.prepare(`
                    SELECT report_id FROM report_appeals WHERE id = ?
                `).bind(appealId).first<{ report_id: number }>();

                if (appeal) {
                    await c.env.DB.prepare(`
                        UPDATE reports SET status = 'dismissed', action_taken = 'Reversed on appeal' WHERE id = ?
                    `).bind(appeal.report_id).run();
                }
            }

            await this.logAdminAction(c, 'review_appeal', 'report_appeal', appealId, body.decision_reason);

            return this.success(c, { reviewed: true });
        } catch (error) {
            console.error('Admin review appeal error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Admin Transparency (Public)
    // =====================================

    /**
     * Get admin team (PUBLIC endpoint - no auth required)
     * GET /api/admin/team
     */
    async getTeam(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const result = await c.env.DB.prepare(`
                SELECT at.*, u.username, u.display_name, u.avatar_url
                FROM admin_team at
                JOIN users u ON at.user_id = u.id
                WHERE at.is_active = 1
                ORDER BY at.role ASC, at.join_date ASC
            `).all();

            return this.success(c, { team: result.results || [] });
        } catch (error) {
            console.error('Admin get team error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get admin action log (PUBLIC endpoint - transparency)
     * GET /api/admin/action-log
     */
    async getActionLog(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const limit = this.getQueryInt(c, 'limit') || 50;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const result = await c.env.DB.prepare(`
                SELECT al.*, u.username as admin_username, u.display_name as admin_name
                FROM admin_action_log al
                JOIN users u ON al.admin_id = u.id
                WHERE al.is_public = 1
                ORDER BY al.created_at DESC
                LIMIT ? OFFSET ?
            `).bind(limit, offset).all();

            return this.success(c, { actions: result.results || [] });
        } catch (error) {
            console.error('Admin get action log error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Report Decision Ratings (FR-012)
    // =====================================

    /**
     * Rate an admin decision on a report (PUBLIC - authenticated users)
     * POST /api/reports/:id/rate-decision
     */
    async rateDecision(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const reportId = this.getParamInt(c, 'id');

            const body = await this.getBody<{ is_satisfied: boolean }>(c);
            if (body?.is_satisfied === undefined) {
                return this.validationError(c, 'is_satisfied is required');
            }

            await c.env.DB.prepare(`
                INSERT OR REPLACE INTO report_decision_ratings (report_id, user_id, is_satisfied, created_at)
                VALUES (?, ?, ?, datetime('now'))
            `).bind(reportId, user.id, body.is_satisfied ? 1 : 0).run();

            // Return updated stats
            const stats = await c.env.DB.prepare(`
                SELECT 
                    COUNT(*) as total_votes,
                    SUM(CASE WHEN is_satisfied = 1 THEN 1 ELSE 0 END) as satisfied,
                    SUM(CASE WHEN is_satisfied = 0 THEN 1 ELSE 0 END) as unsatisfied
                FROM report_decision_ratings
                WHERE report_id = ?
            `).bind(reportId).first();

            return this.success(c, { stats });
        } catch (error) {
            console.error('Rate decision error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get decision rating stats for a report (PUBLIC)
     * GET /api/reports/:id/decision-rating
     */
    async getDecisionRating(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const reportId = this.getParamInt(c, 'id');

            const stats = await c.env.DB.prepare(`
                SELECT 
                    COUNT(*) as total_votes,
                    SUM(CASE WHEN is_satisfied = 1 THEN 1 ELSE 0 END) as satisfied,
                    SUM(CASE WHEN is_satisfied = 0 THEN 1 ELSE 0 END) as unsatisfied
                FROM report_decision_ratings
                WHERE report_id = ?
            `).bind(reportId).first();

            return this.success(c, { stats: stats || { total_votes: 0, satisfied: 0, unsatisfied: 0 } });
        } catch (error) {
            console.error('Get decision rating error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Helper: Admin Action Logger
    // =====================================

    /**
     * Log an admin action for transparency
     */
    private async logAdminAction(
        c: Context<{ Bindings: Bindings; Variables: Variables }>,
        actionType: string,
        targetType?: string,
        targetId?: number,
        reason?: string
    ): Promise<void> {
        try {
            const admin = this.getCurrentUser(c);
            await c.env.DB.prepare(`
                INSERT INTO admin_action_log (admin_id, action_type, target_type, target_id, reason, is_public, created_at)
                VALUES (?, ?, ?, ?, ?, 1, datetime('now'))
            `).bind(admin.id, actionType, targetType || null, targetId || null, reason || null).run();
        } catch (error) {
            console.error('Failed to log admin action:', error);
        }
    }
}

export default AdminController;
