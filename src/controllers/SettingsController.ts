/**
 * @file src/controllers/SettingsController.ts
 * @description متحكم الإعدادات والمنشورات
 * @module controllers/SettingsController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { UserSettingsModel } from '../models/UserSettingsModel';
import { UserPostModel } from '../models/UserSettingsModel';

/**
 * Settings Controller Class
 * متحكم الإعدادات والمنشورات
 */
export class SettingsController extends BaseController {

    // =====================================
    // Settings - الإعدادات
    // =====================================

    /**
     * Get user settings
     * GET /api/settings
     */
    async getSettings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const settingsModel = new UserSettingsModel(c.env.DB);
            const settings = await settingsModel.getOrCreate(user.id);

            return this.success(c, { settings });
        } catch (error) {
            console.error('Get settings error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Update user settings
     * PUT /api/settings
     */
    async updateSettings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const body = await this.getBody<Partial<{
                default_language: string;
                default_country: string;
                notifications_enabled: boolean;
                email_notifications: boolean;
                privacy_level: 'public' | 'followers' | 'private';
            }>>(c);

            const settingsModel = new UserSettingsModel(c.env.DB);
            const settings = await settingsModel.updateByUserId(user.id, {
                default_language: body?.default_language,
                default_country: body?.default_country,
                notifications_enabled: body?.notifications_enabled ? 1 : 0,
                email_notifications: body?.email_notifications ? 1 : 0,
                privacy_level: body?.privacy_level
            } as any);

            return this.success(c, { settings });
        } catch (error) {
            console.error('Update settings error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Posts - المنشورات
    // =====================================

    /**
     * Create post
     * POST /api/posts
     */
    async createPost(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const body = await this.getBody<{ content: string; image_url?: string }>(c);
            if (!body || !body.content || body.content.trim().length === 0) {
                return this.validationError(c, this.t('post.content_required', c));
            }

            const postModel = new UserPostModel(c.env.DB);
            const post = await postModel.create({
                user_id: user.id,
                content: body.content.trim(),
                image_url: body.image_url
            });

            return this.success(c, { post });
        } catch (error) {
            console.error('Create post error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get user's posts
     * GET /api/users/:id/posts
     */
    async getUserPosts(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const userId = this.getParamInt(c, 'id');
            if (!userId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const limit = this.getQueryInt(c, 'limit') || 20;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const postModel = new UserPostModel(c.env.DB);
            const posts = await postModel.getUserPosts(userId, limit, offset);

            return this.success(c, { posts });
        } catch (error) {
            console.error('Get user posts error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get feed
     * GET /api/feed
     */
    async getFeed(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const limit = this.getQueryInt(c, 'limit') || 20;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const postModel = new UserPostModel(c.env.DB);
            const posts = await postModel.getFeed(user.id, limit, offset);

            return this.success(c, { posts });
        } catch (error) {
            console.error('Get feed error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Delete post
     * DELETE /api/posts/:id
     */
    async deletePost(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const postId = this.getParamInt(c, 'id');
            if (!postId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const postModel = new UserPostModel(c.env.DB);

            // Check ownership
            const isOwner = await postModel.isOwner(postId, user.id);
            if (!isOwner) {
                return this.forbidden(c);
            }

            await postModel.delete(postId);
            return this.success(c, { deleted: true });
        } catch (error) {
            console.error('Delete post error:', error);
            return this.serverError(c, error as Error);
        }
    }
}

export default SettingsController;
