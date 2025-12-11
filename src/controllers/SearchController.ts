/**
 * @file src/controllers/SearchController.ts
 * @description متحكم البحث
 * @module controllers/SearchController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { SearchModel, SearchFilters } from '../models/SearchModel';

/**
 * Search Controller Class
 * متحكم البحث والاكتشاف
 */
export class SearchController extends BaseController {

    /**
     * Search competitions
     * GET /api/search/competitions
     */
    async searchCompetitions(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const searchModel = new SearchModel(c.env.DB);

            const filters: SearchFilters = {
                query: this.getQuery(c, 'q'),
                category_id: this.getQueryInt(c, 'category') || undefined,
                subcategory_id: this.getQueryInt(c, 'subcategory') || undefined,
                status: this.getQuery(c, 'status') || undefined,
                language: this.getQuery(c, 'language') || undefined,
                country: this.getQuery(c, 'country') || undefined,
                limit: this.getQueryInt(c, 'limit') || 20,
                offset: this.getQueryInt(c, 'offset') || 0
            };

            const result = await searchModel.searchCompetitions(filters);

            return this.success(c, result);
        } catch (error) {
            console.error('Search competitions error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Search users
     * GET /api/search/users
     */
    async searchUsers(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const query = this.getQuery(c, 'q');
            if (!query || query.length < 2) {
                return this.validationError(c, this.t('search.query_too_short', c));
            }

            const limit = this.getQueryInt(c, 'limit') || 20;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const searchModel = new SearchModel(c.env.DB);
            const result = await searchModel.searchUsers(query, limit, offset);

            return this.success(c, result);
        } catch (error) {
            console.error('Search users error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get suggestions (competitions and users)
     * GET /api/search/suggestions
     */
    async getSuggestions(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const user = this.getCurrentUser(c);
            const lang = this.getLanguage(c);
            const country = this.getQuery(c, 'country') || 'US';

            const searchModel = new SearchModel(c.env.DB);

            const [competitions, users] = await Promise.all([
                searchModel.getSuggestedCompetitions(user?.id || null, lang, country, 6),
                user ? searchModel.getSuggestedUsers(user.id, lang, country, 6) : Promise.resolve([])
            ]);

            return this.success(c, {
                competitions,
                users: user ? users : []
            });
        } catch (error) {
            console.error('Get suggestions error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get trending competitions
     * GET /api/search/trending
     */
    async getTrending(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const limit = this.getQueryInt(c, 'limit') || 10;
            const searchModel = new SearchModel(c.env.DB);
            const competitions = await searchModel.getTrendingCompetitions(limit);

            return this.success(c, { competitions });
        } catch (error) {
            console.error('Get trending error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get live competitions
     * GET /api/search/live
     */
    async getLive(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const limit = this.getQueryInt(c, 'limit') || 20;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const searchModel = new SearchModel(c.env.DB);
            const result = await searchModel.getLiveCompetitions(limit, offset);

            return this.success(c, result);
        } catch (error) {
            console.error('Get live error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get pending competitions (waiting for opponent)
     * GET /api/search/pending
     */
    async getPending(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const limit = this.getQueryInt(c, 'limit') || 20;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const searchModel = new SearchModel(c.env.DB);
            const result = await searchModel.getPendingCompetitions(limit, offset);

            return this.success(c, result);
        } catch (error) {
            console.error('Get pending error:', error);
            return this.serverError(c, error as Error);
        }
    }
}

export default SearchController;
