/**
 * Ad Reporting API
 * API الإبلاغ عن الإعلانات
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';

const adReportRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
adReportRoutes.use('*', authMiddleware({ required: true }));

/**
 * Ad Report Model (inline)
 */
class AdReportModel {
    constructor(private db: D1Database) {}

    async create(userId: number, adId: number, reason: string, description?: string): Promise<{ id: number }> {
        const result = await this.db.prepare(`
            INSERT INTO ad_reports (user_id, ad_id, reason, description, status, created_at)
            VALUES (?, ?, ?, ?, 'pending', datetime('now'))
        `).bind(userId, adId, reason, description || null).run();
        return { id: result.meta.last_row_id as number };
    }

    async findByUser(userId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT ar.*, a.title as ad_title, a.image_url as ad_image
            FROM ad_reports ar
            JOIN advertisements a ON ar.ad_id = a.id
            WHERE ar.user_id = ?
            ORDER BY ar.created_at DESC
        `).bind(userId).all();
        return result.results;
    }

    async findById(id: number): Promise<any> {
        return await this.db.prepare('SELECT * FROM ad_reports WHERE id = ?').bind(id).first();
    }

    async getPendingForAdmin(limit: number = 50): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT ar.*, a.title as ad_title, a.image_url as ad_image,
                   u.username, u.display_name, u.email
            FROM ad_reports ar
            JOIN advertisements a ON ar.ad_id = a.id
            JOIN users u ON ar.user_id = u.id
            WHERE ar.status = 'pending'
            ORDER BY ar.created_at ASC
            LIMIT ?
        `).bind(limit).all();
        return result.results;
    }

    async getAllForAdmin(status?: string, limit: number = 50): Promise<any[]> {
        let query = `
            SELECT ar.*, a.title as ad_title, a.image_url as ad_image,
                   u.username, u.display_name
            FROM ad_reports ar
            JOIN advertisements a ON ar.ad_id = a.id
            JOIN users u ON ar.user_id = u.id
        `;
        const params: any[] = [];

        if (status) {
            query += ` WHERE ar.status = ?`;
            params.push(status);
        }

        query += ` ORDER BY ar.created_at DESC LIMIT ?`;
        params.push(limit);

        const result = await this.db.prepare(query).bind(...params).all();
        return result.results;
    }

    async updateStatus(id: number, status: string, adminId: number, action?: string, notes?: string): Promise<boolean> {
        const result = await this.db.prepare(`
            UPDATE ad_reports 
            SET status = ?, reviewed_by = ?, reviewed_at = datetime('now'), action_taken = ?, notes = ?
            WHERE id = ?
        `).bind(status, adminId, action || null, notes || null, id).run();
        return result.meta.changes > 0;
    }

    async hasReported(userId: number, adId: number): Promise<boolean> {
        const result = await this.db.prepare(`
            SELECT COUNT(*) as count FROM ad_reports WHERE user_id = ? AND ad_id = ?
        `).bind(userId, adId).first<{ count: number }>();
        return (result?.count || 0) > 0;
    }
}

// Report reasons
export const AD_REPORT_REASONS = [
    { value: 'inappropriate', label_ar: 'محتوى غير لائق', label_en: 'Inappropriate content' },
    { value: 'misleading', label_ar: 'إعلان مضلل', label_en: 'Misleading advertisement' },
    { value: 'spam', label_ar: 'رسائل مزعجة', label_en: 'Spam' },
    { value: 'scam', label_ar: 'احتيال', label_en: 'Scam/Fraud' },
    { value: 'offensive', label_ar: 'محتوى مسيء', label_en: 'Offensive content' },
    { value: 'other', label_ar: 'أخرى', label_en: 'Other' }
];

/**
 * POST /api/ad-reports
 * Create ad report
 */
adReportRoutes.post('/', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json<{
            ad_id: number;
            reason: string;
            description?: string;
        }>();

        if (!body?.ad_id || !body?.reason) {
            return c.json({ success: false, error: 'Ad ID and reason are required' }, 400);
        }

        // Validate reason
        const validReasons = AD_REPORT_REASONS.map(r => r.value);
        if (!validReasons.includes(body.reason)) {
            return c.json({ success: false, error: 'Invalid report reason' }, 400);
        }

        const db = c.env.DB;
        const adReportModel = new AdReportModel(db);

        // Check if user already reported this ad
        const hasReported = await adReportModel.hasReported(user.id, body.ad_id);
        if (hasReported) {
            return c.json({ success: false, error: 'You have already reported this ad' }, 400);
        }

        // Create report
        const report = await adReportModel.create(user.id, body.ad_id, body.reason, body.description);

        // Notify admins
        const adminUsers = await db.prepare('SELECT id FROM users WHERE is_admin = 1').all();
        for (const admin of adminUsers.results as any[]) {
            await db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', ?, ?, 'ad_report', ?, datetime('now'))
            `).bind(
                admin.id,
                'New Ad Report',
                `A new ad report has been submitted and requires review.`
            , report.id).run();
        }

        return c.json({
            success: true,
            message: 'Report submitted successfully',
            report_id: report.id
        });

    } catch (error) {
        console.error('Create ad report error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to submit report' 
        }, 500);
    }
});

/**
 * GET /api/ad-reports/my-reports
 * Get user's ad reports
 */
adReportRoutes.get('/my-reports', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const db = c.env.DB;
        const adReportModel = new AdReportModel(db);

        const reports = await adReportModel.findByUser(user.id);

        return c.json({
            success: true,
            reports: reports
        });

    } catch (error) {
        console.error('Get my ad reports error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to fetch reports' 
        }, 500);
    }
});

/**
 * GET /api/ad-reports/reasons
 * Get report reasons
 */
adReportRoutes.get('/reasons', async (c) => {
    return c.json({
        success: true,
        reasons: AD_REPORT_REASONS
    });
});

/**
 * GET /api/ad-reports/admin/pending
 * Get pending reports (admin only)
 */
adReportRoutes.get('/admin/pending', async (c) => {
    try {
        const user = c.get('user');
        if (!user || !user.is_admin) {
            return c.json({ success: false, error: 'Forbidden' }, 403);
        }

        const db = c.env.DB;
        const adReportModel = new AdReportModel(db);

        const reports = await adReportModel.getPendingForAdmin();

        return c.json({
            success: true,
            pending_reports: reports,
            count: reports.length
        });

    } catch (error) {
        console.error('Admin get pending ad reports error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to fetch reports' 
        }, 500);
    }
});

/**
 * GET /api/ad-reports/admin/all
 * Get all reports with filters (admin only)
 */
adReportRoutes.get('/admin/all', async (c) => {
    try {
        const user = c.get('user');
        if (!user || !user.is_admin) {
            return c.json({ success: false, error: 'Forbidden' }, 403);
        }

        const db = c.env.DB;
        const adReportModel = new AdReportModel(db);

        const status = c.req.query('status');
        const limit = parseInt(c.req.query('limit') || '50');

        const reports = await adReportModel.getAllForAdmin(status, limit);

        // Get stats
        const stats = await db.prepare(`
            SELECT 
                COUNT(*) as total,
                SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) as reviewed,
                SUM(CASE WHEN status = 'dismissed' THEN 1 ELSE 0 END) as dismissed
            FROM ad_reports
        `).first();

        return c.json({
            success: true,
            reports: reports,
            stats: stats
        });

    } catch (error) {
        console.error('Admin get all ad reports error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to fetch reports' 
        }, 500);
    }
});

/**
 * POST /api/ad-reports/admin/:id/review
 * Review ad report (admin only)
 */
adReportRoutes.post('/admin/:id/review', async (c) => {
    try {
        const user = c.get('user');
        if (!user || !user.is_admin) {
            return c.json({ success: false, error: 'Forbidden' }, 403);
        }

        const reportId = parseInt(c.req.param('id'));
        const body = await c.req.json<{
            action: 'reviewed' | 'dismissed';
            action_taken?: 'ad_removed' | 'ad_warned' | 'no_action' | 'other';
            notes?: string;
        }>();

        if (!reportId || !body?.action) {
            return c.json({ success: false, error: 'Report ID and action are required' }, 400);
        }

        const db = c.env.DB;
        const adReportModel = new AdReportModel(db);

        // Get report details
        const report = await adReportModel.findById(reportId);
        if (!report) {
            return c.json({ success: false, error: 'Report not found' }, 404);
        }

        if (report.status !== 'pending') {
            return c.json({ success: false, error: 'Report already reviewed' }, 400);
        }

        // Update report status
        await adReportModel.updateStatus(reportId, body.action, user.id, body.action_taken, body.notes);

        // Take action on ad if needed
        if (body.action === 'reviewed' && body.action_taken === 'ad_removed') {
            await db.prepare('UPDATE advertisements SET is_active = 0 WHERE id = ?').bind(report.ad_id).run();
        }

        // Notify reporter
        const statusMessage = body.action === 'reviewed' 
            ? 'Your ad report has been reviewed. Thank you for helping keep our platform safe.'
            : 'Your ad report has been dismissed.';

        await db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
            VALUES (?, 'system', ?, ?, 'ad_report', ?, datetime('now'))
        `).bind(
            report.user_id,
            `Ad Report ${body.action === 'reviewed' ? 'Reviewed' : 'Dismissed'}`,
            statusMessage
        , reportId).run();

        return c.json({
            success: true,
            message: `Report ${body.action} successfully`,
            report_id: reportId
        });

    } catch (error) {
        console.error('Admin review ad report error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to review report' 
        }, 500);
    }
});

export default adReportRoutes;
