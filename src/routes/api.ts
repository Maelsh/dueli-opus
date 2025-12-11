/**
 * API Routes Factory
 * مصنع مسارات API
 * 
 * Creates API routes with dependency injection
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../config/types';
import { AuthController, CompetitionController, UserController, CategoryController } from '../controllers';

/**
 * Create API routes with controllers
 */
export function createApiRoutes() {
    const api = new Hono<{ Bindings: Bindings; Variables: Variables }>();

    // Initialize controllers with database from binding
    api.use('*', async (c, next) => {
        // Controllers will be initialized per-request with the DB binding
        await next();
    });

    // ============================================
    // Auth Routes
    // ============================================
    api.post('/auth/register', async (c) => {
        const controller = new AuthController(c.env.DB, c.env.RESEND_API_KEY);
        return controller.register(c);
    });

    api.get('/auth/verify', async (c) => {
        const controller = new AuthController(c.env.DB, c.env.RESEND_API_KEY);
        return controller.verifyEmail(c);
    });

    api.post('/auth/login', async (c) => {
        const controller = new AuthController(c.env.DB, c.env.RESEND_API_KEY);
        return controller.login(c);
    });

    api.post('/auth/logout', async (c) => {
        const controller = new AuthController(c.env.DB, c.env.RESEND_API_KEY);
        return controller.logout(c);
    });

    api.post('/auth/forgot-password', async (c) => {
        const controller = new AuthController(c.env.DB, c.env.RESEND_API_KEY);
        return controller.forgotPassword(c);
    });

    api.post('/auth/reset-password', async (c) => {
        const controller = new AuthController(c.env.DB, c.env.RESEND_API_KEY);
        return controller.resetPassword(c);
    });

    api.get('/auth/me', async (c) => {
        const controller = new AuthController(c.env.DB, c.env.RESEND_API_KEY);
        return controller.me(c);
    });

    // ============================================
    // Competition Routes
    // ============================================
    api.get('/competitions', async (c) => {
        const controller = new CompetitionController(c.env.DB);
        return controller.list(c);
    });

    api.get('/competitions/:id', async (c) => {
        const controller = new CompetitionController(c.env.DB);
        return controller.show(c);
    });

    api.post('/competitions', async (c) => {
        const controller = new CompetitionController(c.env.DB);
        return controller.create(c);
    });

    api.post('/competitions/:id/comments', async (c) => {
        const controller = new CompetitionController(c.env.DB);
        return controller.addComment(c);
    });

    api.post('/competitions/:id/request', async (c) => {
        const controller = new CompetitionController(c.env.DB);
        return controller.requestJoin(c);
    });

    // ============================================
    // User Routes
    // ============================================
    api.get('/users/:username', async (c) => {
        const controller = new UserController(c.env.DB);
        return controller.show(c);
    });

    api.put('/users/me', async (c) => {
        const controller = new UserController(c.env.DB);
        return controller.updateProfile(c);
    });

    api.get('/users/me/notifications', async (c) => {
        const controller = new UserController(c.env.DB);
        return controller.getNotifications(c);
    });

    api.post('/users/me/notifications/:id/read', async (c) => {
        const controller = new UserController(c.env.DB);
        return controller.markNotificationRead(c);
    });

    api.post('/users/me/notifications/read-all', async (c) => {
        const controller = new UserController(c.env.DB);
        return controller.markAllNotificationsRead(c);
    });

    // ============================================
    // Category Routes
    // ============================================
    api.get('/categories', async (c) => {
        const controller = new CategoryController(c.env.DB);
        return controller.list(c);
    });

    api.get('/categories/:id', async (c) => {
        const controller = new CategoryController(c.env.DB);
        return controller.show(c);
    });

    api.get('/categories/:id/subcategories', async (c) => {
        const controller = new CategoryController(c.env.DB);
        return controller.getSubcategories(c);
    });

    return api;
}

export default createApiRoutes;
