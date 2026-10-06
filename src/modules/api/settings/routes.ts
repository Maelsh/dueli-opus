/**
 * @file src/modules/api/settings/routes.ts
 * @description مسارات الإعدادات والمنشورات
 * @module api/settings/routes
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { SettingsController } from '../../../controllers/SettingsController';
import { authMiddleware } from '../../../middleware/auth';
const settingsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new SettingsController();
// T3.4 FIX: controllers read c.get('user') — mount optional auth so requireAuth works
settingsRoutes.use('*', authMiddleware({ required: false }));

// =====================================
// Settings - الإعدادات
// =====================================

/**
 * GET /api/settings
 * Get current user settings
 */
settingsRoutes.get('/', async (c) => {
    return controller.getSettings(c);
});

/**
 * PUT /api/settings
 * Update user settings
 */
settingsRoutes.put('/', async (c) => {
    return controller.updateSettings(c);
});

// =====================================
// Posts - المنشورات
// =====================================

/**
 * POST /api/posts
 * Create a new post
 */
settingsRoutes.post('/posts', async (c) => {
    return controller.createPost(c);
});

/**
 * GET /api/feed
 * Get user's feed
 */
settingsRoutes.get('/feed', async (c) => {
    return controller.getFeed(c);
});

/**
 * DELETE /api/posts/:id
 * Delete a post
 */
settingsRoutes.delete('/posts/:id', async (c) => {
    return controller.deletePost(c);
});

/**
 * GET /api/settings/users/:id/posts
 * Get user's posts
 */
settingsRoutes.get('/users/:id/posts', async (c) => {
    return controller.getUserPosts(c);
});

/**
 * R3-D1 (h7-v1): explicit interest favorites (taxonomy slugs).
 * GET /api/settings/favorites
 * PUT /api/settings/favorites
 */
settingsRoutes.get('/favorites', async (c) => {
    return controller.getFavorites(c);
});

settingsRoutes.put('/favorites', async (c) => {
    return controller.setFavorites(c);
});

export default settingsRoutes;
