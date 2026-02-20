/**
 * Analytics & Monitoring API
 * API التحليلات والمراقبة
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';

const analyticsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Public analytics (no auth required)
analyticsRoutes.get('/public', async (c) => {
    try {
        const db = c.env.DB;

        // Get public stats
        const [
            totalCompetitions,
            totalUsers,
            liveCompetitions,
            totalViews
        ] = await Promise.all([
            db.prepare('SELECT COUNT(*) as count FROM competitions').first<{ count: number }>(),
            db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
            db.prepare("SELECT COUNT(*) as count FROM competitions WHERE status = 'live'").first<{ count: number }>(),
            db.prepare('SELECT COALESCE(SUM(total_views), 0) as total FROM competitions').first<{ total: number }>()
        ]);

        // Get competitions by category
        const categoryStats = await db.prepare(`
            SELECT c.name_en, COUNT(comp.id) as count
            FROM competitions comp
            JOIN categories c ON comp.category_id = c.id
            GROUP BY comp.category_id
        `).all();

        // Get daily active users (last 7 days)
        const dailyActiveUsers = await db.prepare(`
            SELECT date(created_at) as date, COUNT(DISTINCT user_id) as count
            FROM sessions
            WHERE created_at > datetime('now', '-7 days')
            GROUP BY date(created_at)
            ORDER BY date
        `).all();

        return c.json({
            success: true,
            stats: {
                total_competitions: totalCompetitions?.count || 0,
                total_users: totalUsers?.count || 0,
                live_competitions: liveCompetitions?.count || 0,
                total_views: totalViews?.total || 0
            },
            categories: categoryStats.results,
            daily_active_users: dailyActiveUsers.results
        });

    } catch (error) {
        console.error('Public analytics error:', error);
        return c.json({ success: false, error: 'Failed to get analytics' }, 500);
    }
});

// Admin-only analytics
analyticsRoutes.use('/admin/*', authMiddleware({ required: true }));

/**
 * GET /api/analytics/admin/dashboard
 * Admin dashboard analytics
 */
analyticsRoutes.get('/admin/dashboard', async (c) => {
    try {
        const user = c.get('user');
        if (!user?.is_admin) {
            return c.json({ success: false, error: 'Forbidden' }, 403);
        }

        const db = c.env.DB;

        // Time ranges
        const now = new Date();
        const today = now.toISOString().split('T')[0];
        const last7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

        // Get comprehensive stats
        const [
            userStats,
            competitionStats,
            engagementStats,
            revenueStats
        ] = await Promise.all([
            // User statistics
            (async () => {
                const total = await db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>();
                const newToday = await db.prepare(`
                    SELECT COUNT(*) as count FROM users WHERE date(created_at) = ?
                `).bind(today).first<{ count: number }>();
                const newThisWeek = await db.prepare(`
                    SELECT COUNT(*) as count FROM users WHERE created_at > ?
                `).bind(last7Days).first<{ count: number }>();
                const activeToday = await db.prepare(`
                    SELECT COUNT(DISTINCT user_id) as count FROM sessions WHERE created_at > datetime('now', '-1 day')
                `).first<{ count: number }>();
                
                return {
                    total: total?.count || 0,
                    new_today: newToday?.count || 0,
                    new_this_week: newThisWeek?.count || 0,
                    active_today: activeToday?.count || 0
                };
            })(),

            // Competition statistics
            (async () => {
                const total = await db.prepare('SELECT COUNT(*) as count FROM competitions').first<{ count: number }>();
                const byStatus = await db.prepare(`
                    SELECT status, COUNT(*) as count FROM competitions GROUP BY status
                `).all();
                const createdThisWeek = await db.prepare(`
                    SELECT COUNT(*) as count FROM competitions WHERE created_at > ?
                `).bind(last7Days).first<{ count: number }>();
                
                return {
                    total: total?.count || 0,
                    by_status: byStatus.results,
                    created_this_week: createdThisWeek?.count || 0
                };
            })(),

            // Engagement statistics
            (async () => {
                const totalViews = await db.prepare(`
                    SELECT COALESCE(SUM(total_views), 0) as total FROM competitions
                `).first<{ total: number }>();
                const totalLikes = await db.prepare(`
                    SELECT COUNT(*) as count FROM likes
                `).first<{ count: number }>();
                const totalComments = await db.prepare(`
                    SELECT COUNT(*) as count FROM comments
                `).first<{ count: number }>();
                const avgWatchTime = await db.prepare(`
                    SELECT AVG(watch_time) as avg FROM competition_views WHERE created_at > ?
                `).bind(last30Days).first<{ avg: number }>();
                
                return {
                    total_views: totalViews?.total || 0,
                    total_likes: totalLikes?.count || 0,
                    total_comments: totalComments?.count || 0,
                    avg_watch_time: Math.round(avgWatchTime?.avg || 0)
                };
            })(),

            // Revenue statistics
            (async () => {
                const totalDonations = await db.prepare(`
                    SELECT COALESCE(SUM(amount), 0) as total FROM donations WHERE status = 'completed'
                `).first<{ total: number }>();
                const totalWithdrawals = await db.prepare(`
                    SELECT COALESCE(SUM(amount), 0) as total FROM withdrawal_requests WHERE status = 'approved'
                `).first<{ total: number }>();
                const pendingWithdrawals = await db.prepare(`
                    SELECT COALESCE(SUM(amount), 0) as total FROM withdrawal_requests WHERE status = 'pending'
                `).first<{ total: number }>();
                
                return {
                    total_donations: totalDonations?.total || 0,
                    total_withdrawals: totalWithdrawals?.total || 0,
                    pending_withdrawals: pendingWithdrawals?.total || 0,
                    net_revenue: (totalDonations?.total || 0) - (totalWithdrawals?.total || 0)
                };
            })()
        ]);

        // Get time series data (last 30 days)
        const timeSeriesData = await db.prepare(`
            SELECT 
                date(created_at) as date,
                COUNT(DISTINCT user_id) as active_users,
                COUNT(*) as sessions
            FROM sessions
            WHERE created_at > ?
            GROUP BY date(created_at)
            ORDER BY date
        `).bind(last30Days).all();

        return c.json({
            success: true,
            dashboard: {
                users: userStats,
                competitions: competitionStats,
                engagement: engagementStats,
                revenue: revenueStats,
                time_series: timeSeriesData.results
            }
        });

    } catch (error) {
        console.error('Admin dashboard analytics error:', error);
        return c.json({ success: false, error: 'Failed to get analytics' }, 500);
    }
});

/**
 * POST /api/analytics/track
 * Track user event
 */
analyticsRoutes.post('/track', async (c) => {
    try {
        const user = c.get('user');
        const body = await c.req.json<{
            event: string;
            data?: any;
        }>();

        if (!body?.event) {
            return c.json({ success: false, error: 'Event name required' }, 400);
        }

        const db = c.env.DB;

        // Store event
        await db.prepare(`
            INSERT INTO analytics_events (user_id, event, data, created_at)
            VALUES (?, ?, ?, datetime('now'))
        `).bind(user?.id || null, body.event, JSON.stringify(body.data || {})).run();

        return c.json({ success: true });

    } catch (error) {
        console.error('Track event error:', error);
        return c.json({ success: false, error: 'Failed to track' }, 500);
    }
});

/**
 * POST /api/analytics/view
 * Track competition view
 */
analyticsRoutes.post('/view', async (c) => {
    try {
        const user = c.get('user');
        const body = await c.req.json<{
            competition_id: number;
            watch_time?: number;
        }>();

        if (!body?.competition_id) {
            return c.json({ success: false, error: 'Competition ID required' }, 400);
        }

        const db = c.env.DB;

        // Record view
        await db.prepare(`
            INSERT INTO competition_views (competition_id, user_id, watch_time, created_at)
            VALUES (?, ?, ?, datetime('now'))
        `).bind(body.competition_id, user?.id || null, body.watch_time || 0).run();

        // Update competition view count
        await db.prepare(`
            UPDATE competitions SET total_views = total_views + 1 WHERE id = ?
        `).bind(body.competition_id).run();

        return c.json({ success: true });

    } catch (error) {
        console.error('Track view error:', error);
        return c.json({ success: false, error: 'Failed to track view' }, 500);
    }
});

export default analyticsRoutes;
