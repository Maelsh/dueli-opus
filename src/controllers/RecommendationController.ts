/**
 * @file src/controllers/RecommendationController.ts
 * @description متحكم التوصيات المخصصة
 * @module controllers/RecommendationController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { CompetitionModel } from '../models/CompetitionModel';
import { WatchHistoryModel } from '../models/WatchHistoryModel';

/**
 * Recommendation Controller Class
 * متحكم التوصيات - نظام توصيات بـ 11 معيار
 */
export class RecommendationController extends BaseController {
    
    /**
     * Get personalized recommendations
     * GET /api/recommendations
     */
    async getRecommendations(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            const limit = this.getQueryInt(c, 'limit') || 20;
            const lang = c.get('lang') || 'ar';
            
            if (!user) {
                // For visitors: show newest + most viewed
                return await this.getGuestRecommendations(c, limit, lang);
            }
            
            return await this.getUserRecommendations(c, user.id, limit, lang);
        } catch (error) {
            console.error('Recommendations error:', error);
            return this.serverError(c, error as Error);
        }
    }
    
    /**
     * Guest recommendations (no login)
     */
    private async getGuestRecommendations(
        c: Context<{ Bindings: Bindings; Variables: Variables }>,
        limit: number,
        lang: string
    ) {
        const db = c.env.DB;
        
        const competitions = await db.prepare(`
            SELECT c.*, 
                   cat.name_${lang} as category_name,
                   cat.slug as category_slug,
                   cat.icon as category_icon,
                   cat.color as category_color,
                   u.username as creator_username,
                   u.display_name as creator_name,
                   u.avatar_url as creator_avatar
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            JOIN users u ON c.creator_id = u.id
            WHERE c.status = 'completed'
            AND c.vod_url IS NOT NULL
            ORDER BY 
                CASE WHEN c.language = ? THEN 1 ELSE 0 END DESC,
                c.created_at DESC,
                c.total_views DESC
            LIMIT ?
        `).bind(lang, limit).all();
        
        return this.success(c, { competitions: competitions.results });
    }
    
    /**
     * Personalized user recommendations (11 criteria)
     */
    private async getUserRecommendations(
        c: Context<{ Bindings: Bindings; Variables: Variables }>,
        userId: number,
        limit: number,
        lang: string
    ) {
        const db = c.env.DB;
        const competitionModel = new CompetitionModel(db);
        const watchHistoryModel = new WatchHistoryModel(db);
        
        // Get user preferences
        const user = await db.prepare(`
            SELECT language, country_code FROM users WHERE id = ?
        `).bind(userId).first<any>();
        
        // Get watched competitions IDs (exclude from recommendations)
        const watchedIds = await watchHistoryModel.getUserWatchedIds(userId);
        const excludeClause = watchedIds.length > 0 
            ? `AND c.id NOT IN (${watchedIds.join(',')})` 
            : '';
        
        // Get hidden competitions
        const hiddenIds = await db.prepare(`
            SELECT competition_id FROM user_hidden_competitions WHERE user_id = ?
        `).bind(userId).all();
        const hiddenClause = (hiddenIds.results || []).length > 0
            ? `AND c.id NOT IN (${(hiddenIds.results || []).map((h: any) => h.competition_id).join(',')})`
            : '';
        
        // Get followed users
        const followedUsers = await db.prepare(`
            SELECT following_id FROM follows WHERE follower_id = ?
        `).bind(userId).all();
        const followedIds = (followedUsers.results || []).map((f: any) => f.following_id);
        
        // Get liked categories
        const likedCategories = await db.prepare(`
            SELECT DISTINCT c.category_id, COUNT(*) as count
            FROM likes l
            JOIN competitions c ON l.competition_id = c.id
            WHERE l.user_id = ?
            GROUP BY c.category_id
            ORDER BY count DESC
            LIMIT 3
        `).bind(userId).all();
        const likedCatIds = (likedCategories.results || []).map((lc: any) => lc.category_id);
        
        // Get user keywords (from watched titles)
        const keywords = await db.prepare(`
            SELECT keyword FROM user_keywords WHERE user_id = ? ORDER BY weight DESC LIMIT 10
        `).bind(userId).all();
        const kws = (keywords.results || []).map((k: any) => k.keyword);
        
        // Build scoring query
        let query = `
            SELECT c.*, 
                   cat.name_${lang} as category_name,
                   cat.slug as category_slug,
                   cat.icon as category_icon,
                   cat.color as category_color,
                   u.username as creator_username,
                   u.display_name as creator_name,
                   u.avatar_url as creator_avatar,
                   (
                       CASE WHEN c.language = ? THEN 25 ELSE 0 END +
                       CASE WHEN c.country = ? THEN 20 ELSE 0 END +
                       CASE WHEN c.creator_id IN (${followedIds.join(',') || '0'}) THEN 15 ELSE 0 END +
                       CASE WHEN c.category_id IN (${likedCatIds.join(',') || '0'}) THEN 10 ELSE 0 END +
                       (c.total_views * 0.01) +
                       (COALESCE(c.average_rating, 0) * 0.1)
                   ) as score
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            JOIN users u ON c.creator_id = u.id
            WHERE c.status = 'completed'
            AND c.vod_url IS NOT NULL
            ${excludeClause}
            ${hiddenClause}
        `;
        
        const params: any[] = [user?.language || lang, user?.country_code || 'SA'];
        
        // Add keyword filtering (parameterized to prevent SQL injection)
        if (kws.length > 0) {
            query += ` AND (`;
            const keywordConditions = kws.map(() => `c.title LIKE ? OR c.description LIKE ?`).join(' OR ');
            query += keywordConditions;
            query += `)`;
            params.push(...kws.flatMap(k => [`%${k}%`, `%${k}%`]));
        }
        
        query += ` ORDER BY score DESC, RANDOM() LIMIT ?`;
        params.push(limit);
        
        const competitions = await db.prepare(query).bind(...params).all();
        
        return this.success(c, { competitions: competitions.results });
    }
}

export default RecommendationController;
