/**
 * Base Controller Abstract Class
 * فئة المتحكم الأساسية المجردة
 * 
 * All controllers should extend this class.
 * جميع المتحكمات يجب أن ترث من هذه الفئة.
 */

import type { Context } from 'hono';
import type { Bindings, Variables, ApiResponse, Language } from '../../config/types';
import { t, DEFAULT_LANGUAGE } from '../../i18n';

/** Hono context type with our bindings */
export type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Abstract Base Controller
 * Provides common utilities for all controllers
 */
export abstract class BaseController {

    /**
     * Get language from context
     */
    protected getLanguage(c: AppContext): Language {
        return c.get('lang') || DEFAULT_LANGUAGE;
    }

    /**
     * Get translation function for current language
     */
    protected t(key: string, c: AppContext): string {
        return t(key, this.getLanguage(c));
    }

    /**
     * Send success response
     */
    protected success<T>(c: AppContext, data: T, status: number = 200) {
        return c.json<ApiResponse<T>>({ success: true, data }, status as any);
    }

    /**
     * Send error response
     */
    protected error(c: AppContext, message: string, status: number = 400) {
        return c.json<ApiResponse>({ success: false, error: message }, status as any);
    }

    /**
     * Send not found response
     */
    protected notFound(c: AppContext, message?: string) {
        return this.error(c, message || this.t('not_found', c), 404);
    }

    /**
     * Send unauthorized response
     */
    protected unauthorized(c: AppContext, message?: string) {
        return this.error(c, message || this.t('unauthorized', c), 401);
    }

    /**
     * Send forbidden response
     */
    protected forbidden(c: AppContext, message?: string) {
        return this.error(c, message || this.t('forbidden', c), 403);
    }

    /**
     * Send validation error
     */
    protected validationError(c: AppContext, message: string) {
        return this.error(c, message, 422);
    }

    /**
     * Send server error
     */
    protected serverError(c: AppContext, error: Error) {
        console.error(`[${this.constructor.name}] Error:`, error);
        return this.error(c, this.t('server_error', c), 500);
    }

    /**
     * Get current user from context (if authenticated)
     */
    protected getCurrentUser(c: AppContext): any | null {
        return c.get('user') || null;
    }

    /**
     * Require authentication
     */
    protected requireAuth(c: AppContext): boolean {
        const user = this.getCurrentUser(c);
        return user !== null;
    }

    /**
     * Parse JSON body safely
     */
    protected async getBody<T = any>(c: AppContext): Promise<T | null> {
        try {
            return await c.req.json() as T;
        } catch {
            return null;
        }
    }

    /**
     * Get query parameter with default
     */
    protected getQuery(c: AppContext, key: string, defaultValue: string = ''): string {
        return c.req.query(key) || defaultValue;
    }

    /**
     * Get numeric query parameter
     */
    protected getQueryInt(c: AppContext, key: string, defaultValue: number = 0): number {
        const value = c.req.query(key);
        return value ? parseInt(value, 10) : defaultValue;
    }

    /**
     * Get route parameter
     */
    protected getParam(c: AppContext, key: string): string {
        return c.req.param(key) || '';
    }

    /**
     * Get numeric route parameter
     */
    protected getParamInt(c: AppContext, key: string): number {
        return parseInt(c.req.param(key) || '0', 10);
    }
}

export default BaseController;
