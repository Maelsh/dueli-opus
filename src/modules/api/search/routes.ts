/**
 * @file src/modules/api/search/routes.ts
 * @description مسارات البحث
 * @module api/search/routes
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { SearchController } from '../../../controllers/SearchController';

const searchRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new SearchController();

/**
 * GET /api/search/competitions
 * Search competitions with filters
 * Query params: q, category, subcategory, status, language, country, limit, offset
 */
searchRoutes.get('/competitions', async (c) => {
    return controller.searchCompetitions(c);
});

/**
 * GET /api/search/users
 * Search users by username or display name
 * Query params: q (required, min 2 chars), limit, offset
 */
searchRoutes.get('/users', async (c) => {
    return controller.searchUsers(c);
});

/**
 * GET /api/search/suggestions
 * Get suggested competitions and users for the current user
 * Query params: country
 */
searchRoutes.get('/suggestions', async (c) => {
    return controller.getSuggestions(c);
});

/**
 * GET /api/search/trending
 * Get trending competitions (most views in last 7 days)
 * Query params: limit
 */
searchRoutes.get('/trending', async (c) => {
    return controller.getTrending(c);
});

/**
 * GET /api/search/live
 * Get live competitions (currently streaming)
 * Query params: limit, offset
 */
searchRoutes.get('/live', async (c) => {
    return controller.getLive(c);
});

/**
 * GET /api/search/pending
 * Get pending competitions waiting for opponent
 * Query params: limit, offset
 */
searchRoutes.get('/pending', async (c) => {
    return controller.getPending(c);
});

export default searchRoutes;
