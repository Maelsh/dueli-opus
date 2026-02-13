/**
 * Enhanced Search API
 * API البحث المتقدم
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';

const enhancedSearchRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply optional auth for search history
enhancedSearchRoutes.use('*', authMiddleware({ required: false }));

/**
 * Search History Model
 */
class SearchHistoryModel {
    constructor(private db: D1Database) {}

    async add(userId: number | null, query: string, filters: any, resultsCount: number): Promise<void> {
        if (!userId || query.length < 2) return;

        // Don't save duplicate recent searches
        const existing = await this.db.prepare(`
            SELECT id FROM search_history 
            WHERE user_id = ? AND query = ? AND created_at > datetime('now', '-1 hour')
        `).bind(userId, query).first();

        if (existing) return;

        await this.db.prepare(`
            INSERT INTO search_history (user_id, query, filters, results_count, created_at)
            VALUES (?, ?, ?, ?, datetime('now'))
        `).bind(userId, query, JSON.stringify(filters), resultsCount).run();

        // Keep only last 50 searches per user
        await this.db.prepare(`
            DELETE FROM search_history WHERE id IN (
                SELECT id FROM search_history 
                WHERE user_id = ? 
                ORDER BY created_at DESC 
                LIMIT -1 OFFSET 50
            )
        `).bind(userId).run();
    }

    async getUserHistory(userId: number, limit: number = 10): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT DISTINCT query, filters, created_at
            FROM search_history 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `).bind(userId, limit).all();
        return result.results;
    }

    async getTrending(limit: number = 10): Promise<string[]> {
        const result = await this.db.prepare(`
            SELECT query, COUNT(*) as count
            FROM search_history 
            WHERE created_at > datetime('now', '-7 days')
            GROUP BY query
            ORDER BY count DESC
            LIMIT ?
        `).bind(limit).all();
        
        return (result.results as any[]).map(r => r.query);
    }

    async clearUserHistory(userId: number): Promise<void> {
        await this.db.prepare('DELETE FROM search_history WHERE user_id = ?').bind(userId).run();
    }
}

/**
 * GET /api/search/suggestions
 * Get search suggestions as user types
 */
enhancedSearchRoutes.get('/suggestions', async (c) => {
    try {
        const query = c.req.query('q') || '';
        const user = c.get('user');
        
        if (query.length < 1) {
            return c.json({ success: true, suggestions: [] });
        }

        const db = c.env.DB;

        // Search in competitions, users, and categories
        const [competitions, users, categories] = await Promise.all([
            // Competition suggestions
            db.prepare(`
                SELECT DISTINCT title as text, 'competition' as type, id
                FROM competitions 
                WHERE title LIKE ? AND status IN ('live', 'pending', 'accepted')
                LIMIT 5
            `).bind(`%${query}%`).all(),
            
            // User suggestions
            db.prepare(`
                SELECT DISTINCT display_name as text, 'user' as type, username as id
                FROM users 
                WHERE display_name LIKE ? OR username LIKE ?
                LIMIT 5
            `).bind(`%${query}%`, `%${query}%`).all(),
            
            // Category suggestions
            db.prepare(`
                SELECT DISTINCT name_en as text, 'category' as type, slug as id
                FROM categories 
                WHERE name_en LIKE ? OR name_ar LIKE ?
                LIMIT 5
            `).bind(`%${query}%`, `%${query}%`).all()
        ]);

        // Combine and format suggestions
        const suggestions = [
            ...(competitions.results as any[]).map(r => ({ ...r, icon: 'fa-trophy' })),
            ...(users.results as any[]).map(r => ({ ...r, icon: 'fa-user' })),
            ...(categories.results as any[]).map(r => ({ ...r, icon: 'fa-folder' }))
        ];

        // Add user's recent searches if logged in
        if (user) {
            const historyModel = new SearchHistoryModel(db);
            const history = await historyModel.getUserHistory(user.id, 3);
            
            const historySuggestions = history
                .filter(h => h.query.toLowerCase().includes(query.toLowerCase()))
                .map(h => ({
                    text: h.query,
                    type: 'history',
                    icon: 'fa-history',
                    filters: JSON.parse(h.filters || '{}')
                }));
            
            suggestions.unshift(...historySuggestions);
        }

        return c.json({
            success: true,
            query,
            suggestions: suggestions.slice(0, 10)
        });

    } catch (error) {
        console.error('Search suggestions error:', error);
        return c.json({ success: false, error: 'Failed to get suggestions' }, 500);
    }
});

/**
 * GET /api/search/history
 * Get user's search history
 */
enhancedSearchRoutes.get('/history', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const db = c.env.DB;
        const historyModel = new SearchHistoryModel(db);
        
        const history = await historyModel.getUserHistory(user.id, 20);

        return c.json({
            success: true,
            history: history.map(h => ({
                query: h.query,
                filters: JSON.parse(h.filters || '{}'),
                date: h.created_at
            }))
        });

    } catch (error) {
        console.error('Search history error:', error);
        return c.json({ success: false, error: 'Failed to get history' }, 500);
    }
});

/**
 * DELETE /api/search/history
 * Clear user's search history
 */
enhancedSearchRoutes.delete('/history', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const db = c.env.DB;
        const historyModel = new SearchHistoryModel(db);
        
        await historyModel.clearUserHistory(user.id);

        return c.json({
            success: true,
            message: 'Search history cleared'
        });

    } catch (error) {
        console.error('Clear search history error:', error);
        return c.json({ success: false, error: 'Failed to clear history' }, 500);
    }
});

/**
 * GET /api/search/trending
 * Get trending searches
 */
enhancedSearchRoutes.get('/trending', async (c) => {
    try {
        const db = c.env.DB;
        const historyModel = new SearchHistoryModel(db);
        
        const trending = await historyModel.getTrending(10);

        return c.json({
            success: true,
            trending
        });

    } catch (error) {
        console.error('Trending searches error:', error);
        return c.json({ success: false, error: 'Failed to get trending' }, 500);
    }
});

/**
 * POST /api/search/track
 * Track search for analytics
 */
enhancedSearchRoutes.post('/track', async (c) => {
    try {
        const user = c.get('user');
        const body = await c.req.json<{
            query: string;
            filters?: any;
            results_count: number;
        }>();

        if (!body?.query) {
            return c.json({ success: false, error: 'Query required' }, 400);
        }

        const db = c.env.DB;
        const historyModel = new SearchHistoryModel(db);
        
        await historyModel.add(user?.id || null, body.query, body.filters || {}, body.results_count);

        return c.json({ success: true });

    } catch (error) {
        console.error('Track search error:', error);
        return c.json({ success: false, error: 'Failed to track' }, 500);
    }
});

export default enhancedSearchRoutes;
