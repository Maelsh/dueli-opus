/**
 * Authentication Middleware
 * وسيط المصادقة
 * 
 * Reusable middleware for protected routes.
 * وسيط قابل لإعادة الاستخدام للمسارات المحمية.
 */

import { Context, Next } from 'hono';
import type { Bindings, Variables, Language } from '../config/types';
import { SessionModel, AdminRoleModel, AdminRoleType } from '../models';
import { t } from '../i18n';
import { readSessionCandidates } from '../lib/services/SessionCookieService';

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
        // C4 (SEC-11): Bearer header OR sessionId cookie ONLY. Raw `?token=`
        // was removed — it leaked sessions into logs/history/Referer (GOV-11).
        // SEC-08: browser requests use the HttpOnly cookie; Bearer remains the
        // non-browser API contract. EventSource clients use single-use tickets:
        // POST /api/realtime/ticket then GET /api/sse?channel=…&ticket=….
        const sessionIds = readSessionCandidates(c);

        if (sessionIds.length === 0) {
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
            let result: Awaited<ReturnType<SessionModel['findValidSession']>> = null;
            for (const sessionId of sessionIds) {
                result = await sessionModel.findValidSession(sessionId);
                if (result) break;
            }

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
        // First check auth (SEC-08: Bearer non-browser contract OR HttpOnly
        // session cookie for the browser).
        const sessionIds = readSessionCandidates(c);

        if (sessionIds.length === 0) {
            const lang = (c.get('lang') || 'en') as Language;
            return c.json({ success: false, error: t('login_required', lang) }, 401);
        }

        try {
            const sessionModel = new SessionModel(c.env.DB);
            let result: Awaited<ReturnType<SessionModel['findValidSession']>> = null;
            for (const sessionId of sessionIds) {
                result = await sessionModel.findValidSession(sessionId);
                if (result) break;
            }

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

export function adminRoleGuard(allowedRoles: AdminRoleType[]) {
    return async (c: AppContext, next: Next) => {
        const user = c.get('user');

        if (!user) {
            const lang = (c.get('lang') || 'en') as Language;
            return c.json({ success: false, error: t('login_required', lang) }, 401);
        }

        if (!user.is_admin) {
            const lang = (c.get('lang') || 'en') as Language;
            return c.json({ success: false, error: t('forbidden', lang) }, 403);
        }

        try {
            const adminRoleModel = new AdminRoleModel(c.env.DB);
            const role = await adminRoleModel.findByUserId(user.id);

            if (!role || !allowedRoles.includes(role.role)) {
                const lang = (c.get('lang') || 'en') as Language;
                return c.json({ success: false, error: t('forbidden', lang) }, 403);
            }

            return next();
        } catch (error) {
            console.error('[AdminRoleGuard] Error:', error);
            return c.json({ success: false, error: 'Authorization error' }, 500);
        }
    };
}
