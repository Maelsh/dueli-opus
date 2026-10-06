/**
 * @file src/controllers/SettingsController.ts
 * @description متحكم الإعدادات والمنشورات
 * @module controllers/SettingsController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { Sanitize } from '../lib/services/Sanitize';
import { UserSettingsModel } from '../models/UserSettingsModel';
import { UserPostModel } from '../models/UserSettingsModel';
import { H7SignalsModel } from '../models/H7SignalsModel';
import { CATEGORY_SUBCATEGORIES } from '../shared/constants';

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
                content: Sanitize.cleanText(body.content),
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
     * R3-D1 (h7-v1): explicit interest favorites (Settings choice on the
     * taxonomy). Slugs only, saved + restored ar/en (slugs are
     * language-independent). Optional — never a signup requirement.
     * GET /api/settings/favorites
     */
    async getFavorites(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const favs = await new H7SignalsModel(c.env.DB).getFavoriteSlugs(user.id);
            return this.success(c, { favorites: favs });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * R3-D1 (h7-v1): replace explicit favorites.
     * PUT /api/settings/favorites { favorites: string[] }
     * Unknown slugs => 422 (never widened to All).
     */
    async setFavorites(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const body = await this.getBody<{ favorites?: unknown }>(c);
            const raw = body?.favorites;
            if (!Array.isArray(raw)) {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }
            const known = new Set<string>();
            for (const parent of Object.keys(CATEGORY_SUBCATEGORIES)) {
                known.add(parent.toLowerCase());
                for (const child of CATEGORY_SUBCATEGORIES[parent] ?? []) known.add(child.toLowerCase());
            }
            const clean: string[] = [];
            for (const item of raw) {
                if (typeof item !== 'string') {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                const slug = item.trim().toLowerCase().slice(0, 64);
                if (slug === '') continue;
                if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(slug) || !known.has(slug)) {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                if (!clean.includes(slug)) clean.push(slug);
                if (clean.length >= 60) break;
            }
            const saved = await new H7SignalsModel(c.env.DB).setFavoriteSlugs(user.id, clean);
            return this.success(c, { favorites: saved });
        } catch (error) {
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
