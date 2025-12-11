/**
 * Authentication Middleware
 * وسيط المصادقة
 * 
 * Reusable middleware for protected routes.
 * وسيط قابل لإعادة الاستخدام للمسارات المحمية.
 */

import { Context, Next } from 'hono';
import type { Bindings, Variables, Language } from '../config/types';
import { SessionModel } from '../models';
import { t } from '../i18n';

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Auth middleware factory
 * Creates middleware that validates session and sets user in context
 * 
 * @param options Configuration options
 * @returns Hono middleware
 */
export function authMiddleware(options: { required?: boolean } = {}) {
    const { required = true } = options;

    return async (c: AppContext, next: Next) => {
        const authHeader = c.req.header('Authorization');
        const sessionId = authHeader?.replace('Bearer ', '');

        if (!sessionId) {
            if (required) {
                const lang = (c.get('lang') || 'en') as Language;
                return c.json({
                    success: false,
                    error: t('login_required', lang)
                }, 401);
            }
            c.set('user', null);
            return next();
        }

        try {
            const sessionModel = new SessionModel(c.env.DB);
            const result = await sessionModel.findValidSession(sessionId);

            if (!result) {
                if (required) {
                    const lang = (c.get('lang') || 'en') as Language;
                    return c.json({
                        success: false,
                        error: t('login_required', lang)
                    }, 401);
                }
                c.set('user', null);
                return next();
            }

            // Set user in context
            c.set('user', result.user);

            return next();
        } catch (error) {
            console.error('[AuthMiddleware] Error:', error);
            if (required) {
                return c.json({
                    success: false,
                    error: 'Authentication error'
                }, 500);
            }
            c.set('user', null);
            return next();
        }
    };
}

/**
 * Admin-only middleware
 * Must be used AFTER authMiddleware
 */
export function adminMiddleware() {
    return async (c: AppContext, next: Next) => {
        const user = c.get('user');

        if (!user || !user.is_admin) {
            const lang = (c.get('lang') || 'en') as Language;
            return c.json({
                success: false,
                error: t('forbidden', lang)
            }, 403);
        }

        return next();
    };
}

/**
 * Combine auth + admin for protected admin routes
 */
export function adminAuthMiddleware() {
    return async (c: AppContext, next: Next) => {
        // First check auth
        const authHeader = c.req.header('Authorization');
        const sessionId = authHeader?.replace('Bearer ', '');

        if (!sessionId) {
            const lang = (c.get('lang') || 'en') as Language;
            return c.json({ success: false, error: t('login_required', lang) }, 401);
        }

        try {
            const sessionModel = new SessionModel(c.env.DB);
            const result = await sessionModel.findValidSession(sessionId);

            if (!result) {
                const lang = (c.get('lang') || 'en') as Language;
                return c.json({ success: false, error: t('login_required', lang) }, 401);
            }

            if (!result.user.is_admin) {
                const lang = (c.get('lang') || 'en') as Language;
                return c.json({ success: false, error: t('forbidden', lang) }, 403);
            }

            c.set('user', result.user);
            return next();
        } catch (error) {
            console.error('[AdminAuthMiddleware] Error:', error);
            return c.json({ success: false, error: 'Authentication error' }, 500);
        }
    };
}

export default authMiddleware;
