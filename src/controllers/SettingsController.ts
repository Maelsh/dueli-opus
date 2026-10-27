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
import type { UserSettings } from '../models/UserSettingsModel';
import { UserPostModel } from '../models/UserSettingsModel';
import { UserModel } from '../models/UserModel';
import { H7SignalsModel } from '../models/H7SignalsModel';
import { CATEGORY_SUBCATEGORIES } from '../shared/constants';

/**
 * R4-PROFILE-SAVE-1 (P-01) — profile field contract.
 *
 * The bounds are the ones the project already documents for a user update
 * (src/middleware/validation.ts → `userUpdateSchema`): display_name 2..100
 * characters, bio at most 500 characters. No new limits are invented here.
 */
const PROFILE_DISPLAY_NAME_MIN = 2;
const PROFILE_DISPLAY_NAME_MAX = 100;
const PROFILE_BIO_MAX = 500;

const PRIVACY_LEVELS = ['public', 'followers', 'private'] as const;

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
            const userModel = new UserModel(c.env.DB);
            const hasPassword = await userModel.hasLocalPassword(user.id);

            return this.success(c, {
                settings,
                account: {
                    has_password: hasPassword,
                },
            });
        } catch (error) {
            console.error('Get settings error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Update user settings
     * PUT /api/settings
     *
     * R4-PROFILE-SAVE-1 (P-01): the settings page has always sent
     * `display_name` and `bio` together with the preference fields, but this
     * handler only forwarded the preferences to `user_settings`. The profile
     * fields were silently dropped, so the endpoint answered 200 while the
     * `users` row was never touched — a save that reported success and saved
     * nothing.
     *
     * The profile fields are now written to the AUTHENTICATED user's own row
     * through UserModel (SQL stays in the model, never in the controller),
     * while the preferences keep their existing meaning and column.
     *
     * Both groups are PARTIAL updates: a field that is not sent is never
     * written. A profile-only call cannot erase a preference, and a
     * preference-only call cannot erase the display name or the bio. An
     * empty `bio` is a legitimate value (clearing it) and is stored as such.
     */
    async updateSettings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const body = await this.getBody<Record<string, unknown>>(c);
            if (!body || typeof body !== 'object' || Array.isArray(body)) {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }

            // ---------- Profile fields (users table) ----------
            // The identity always comes from the session (requireAuth +
            // getCurrentUser). A client-supplied `user_id` is never read.
            const profileUpdate: { display_name?: string; bio?: string } = {};

            if (body.display_name !== undefined) {
                const raw = body.display_name;
                if (typeof raw !== 'string') {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                const trimmed = raw.trim();
                if (
                    trimmed.length < PROFILE_DISPLAY_NAME_MIN
                    || trimmed.length > PROFILE_DISPLAY_NAME_MAX
                ) {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                // Store-escaped (project convention, src/lib/services/Sanitize.ts):
                // the profile surfaces render these values as raw HTML.
                profileUpdate.display_name = Sanitize.cleanText(trimmed);
            }

            if (body.bio !== undefined) {
                const raw = body.bio;
                if (typeof raw !== 'string') {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                if (raw.trim().length > PROFILE_BIO_MAX) {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                // An empty string is a valid value: it clears the bio.
                profileUpdate.bio = Sanitize.cleanText(raw);
            }

            // ---------- Preference fields (user_settings table) ----------
            const settingsUpdate: Partial<UserSettings> = {};

            if (body.default_language !== undefined) {
                if (typeof body.default_language !== 'string' || body.default_language.trim() === '') {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                settingsUpdate.default_language = body.default_language.trim();
            }

            if (body.default_country !== undefined) {
                if (typeof body.default_country !== 'string' || body.default_country.trim() === '') {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                settingsUpdate.default_country = body.default_country.trim();
            }

            if (body.notifications_enabled !== undefined) {
                if (typeof body.notifications_enabled !== 'boolean') {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                settingsUpdate.notifications_enabled = body.notifications_enabled ? 1 : 0;
            }

            if (body.email_notifications !== undefined) {
                if (typeof body.email_notifications !== 'boolean') {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                settingsUpdate.email_notifications = body.email_notifications ? 1 : 0;
            }

            if (body.privacy_level !== undefined) {
                if (
                    typeof body.privacy_level !== 'string'
                    || !PRIVACY_LEVELS.includes(body.privacy_level as typeof PRIVACY_LEVELS[number])
                ) {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                settingsUpdate.privacy_level = body.privacy_level as UserSettings['privacy_level'];
            }

            // ---------- Write ----------
            // The profile row is written first and read back, so the response
            // carries the values that are actually persisted (never the ones
            // the client merely sent).
            let profile: { display_name: string | null; bio: string | null } | null = null;
            if (Object.keys(profileUpdate).length > 0) {
                const updated = await new UserModel(c.env.DB).update(user.id, profileUpdate);
                if (!updated) {
                    return this.serverError(c, new Error('Profile update returned no user row'));
                }
                profile = {
                    display_name: updated.display_name ?? null,
                    bio: updated.bio ?? null
                };
            }

            const settingsModel = new UserSettingsModel(c.env.DB);
            const settings = await settingsModel.updateByUserId(user.id, settingsUpdate);

            return this.success(c, { settings, profile });
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
