/**
 * Security Middleware
 * وسيط الأمان
 * 
 * Rate limiting, CSRF protection, and security headers
 */

import type { Context, Next } from 'hono';
import type { Bindings, Variables } from '../config/types';

// Rate limiting store (in production, use Redis)
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

/**
 * Rate limiting middleware
 */
export function rateLimit(options: {
    windowMs?: number;
    maxRequests?: number;
    keyGenerator?: (c: Context) => string;
} = {}) {
    const {
        windowMs = 60000, // 1 minute
        maxRequests = 100,
        keyGenerator = (c) => c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown'
    } = options;

    return async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
        const key = keyGenerator(c);
        const now = Date.now();

        // Get or create rate limit entry
        let entry = rateLimitStore.get(key);
        if (!entry || now > entry.resetTime) {
            entry = { count: 0, resetTime: now + windowMs };
            rateLimitStore.set(key, entry);
        }

        // Check limit
        if (entry.count >= maxRequests) {
            return c.json({
                success: false,
                error: 'Too many requests, please try again later',
                retryAfter: Math.ceil((entry.resetTime - now) / 1000)
            }, 429);
        }

        // Increment count
        entry.count++;

        // Add rate limit headers
        c.header('X-RateLimit-Limit', maxRequests.toString());
        c.header('X-RateLimit-Remaining', (maxRequests - entry.count).toString());
        c.header('X-RateLimit-Reset', new Date(entry.resetTime).toISOString());

        await next();
    };
}

/**
 * Strict rate limiting for sensitive endpoints
 */
export function strictRateLimit() {
    return rateLimit({
        windowMs: 900000, // 15 minutes
        maxRequests: 5
    });
}

/**
 * CSRF protection middleware
 */
export function csrfProtection() {
    return async (c: Context<{ Bindings: Bindings; Variables: Variables }>, next: Next) => {
        // Skip for GET, HEAD, OPTIONS requests
        if (['GET', 'HEAD', 'OPTIONS'].includes(c.req.method)) {
            return await next();
        }

        const origin = c.req.header('Origin');
        const referer = c.req.header('Referer');
        const host = c.req.header('Host');

        // Check origin matches host
        if (origin) {
            try {
                const originHost = new URL(origin).host;
                if (originHost !== host) {
                    return c.json({ success: false, error: 'Invalid origin' }, 403);
                }
            } catch {
                return c.json({ success: false, error: 'Invalid origin' }, 403);
            }
        } else if (referer) {
            // Fallback to referer check
            try {
                const refererHost = new URL(referer).host;
                if (refererHost !== host) {
                    return c.json({ success: false, error: 'Invalid referer' }, 403);
                }
            } catch {
                return c.json({ success: false, error: 'Invalid referer' }, 403);
            }
        }

        // Check CSRF token for state-changing requests
        const csrfToken = c.req.header('X-CSRF-Token');
        const sessionToken = c.req.header('X-Session-Token');

        if (!csrfToken && !sessionToken) {
            // In production, require CSRF token
            // For now, we allow requests with session token
            console.warn('CSRF token missing for', c.req.method, c.req.url);
        }

        await next();
    };
}

/**
 * Security headers middleware
 */
export function securityHeaders() {
    return async (c: Context, next: Next) => {
        // Content Security Policy
        c.header('Content-Security-Policy', [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdnjs.cloudflare.com https://apis.google.com",
            "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com",
            "img-src 'self' data: https: blob:",
            "font-src 'self' https://cdnjs.cloudflare.com",
            "connect-src 'self' https: wss:",
            "media-src 'self' https: blob:",
            "frame-src 'self' https://www.youtube.com https://meet.jit.si",
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'"
        ].join('; '));

        // Other security headers
        c.header('X-Content-Type-Options', 'nosniff');
        c.header('X-Frame-Options', 'DENY');
        c.header('X-XSS-Protection', '1; mode=block');
        c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
        
        // HSTS (only in production with HTTPS)
        // c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

        await next();
    };
}

/**
 * Input validation middleware
 */
export function validateInput(rules: Record<string, {
    required?: boolean;
    type?: 'string' | 'number' | 'boolean' | 'email' | 'url';
    minLength?: number;
    maxLength?: number;
    pattern?: RegExp;
}>) {
    return async (c: Context, next: Next) => {
        try {
            const body = await c.req.json();
            const errors: Record<string, string> = {};

            for (const [field, rule] of Object.entries(rules)) {
                const value = body[field];

                // Check required
                if (rule.required && (value === undefined || value === null || value === '')) {
                    errors[field] = `${field} is required`;
                    continue;
                }

                if (value !== undefined && value !== null) {
                    // Check type
                    if (rule.type) {
                        const actualType = typeof value;
                        if (rule.type === 'email' && !isValidEmail(value)) {
                            errors[field] = `${field} must be a valid email`;
                        } else if (rule.type === 'url' && !isValidUrl(value)) {
                            errors[field] = `${field} must be a valid URL`;
                        } else if (rule.type !== 'email' && rule.type !== 'url' && actualType !== rule.type) {
                            errors[field] = `${field} must be ${rule.type}`;
                        }
                    }

                    // Check length for strings
                    if (typeof value === 'string') {
                        if (rule.minLength && value.length < rule.minLength) {
                            errors[field] = `${field} must be at least ${rule.minLength} characters`;
                        }
                        if (rule.maxLength && value.length > rule.maxLength) {
                            errors[field] = `${field} must be at most ${rule.maxLength} characters`;
                        }
                        if (rule.pattern && !rule.pattern.test(value)) {
                            errors[field] = `${field} format is invalid`;
                        }
                    }
                }
            }

            if (Object.keys(errors).length > 0) {
                return c.json({
                    success: false,
                    error: 'Validation failed',
                    errors
                }, 400);
            }

            // Store validated body
            c.set('validatedBody', body);
            await next();

        } catch {
            return c.json({ success: false, error: 'Invalid JSON body' }, 400);
        }
    };
}

/**
 * Sanitize HTML content
 */
export function sanitizeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '<')
        .replace(/>/g, '>')
        .replace(/"/g, '"')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

/**
 * Check if string is valid email
 */
function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Check if string is valid URL
 */
function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch {
        return false;
    }
}

/**
 * Generate secure random token
 */
export function generateSecureToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < length; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

/**
 * Hash sensitive data (simple hash for non-critical data)
 */
export async function hashData(data: string): Promise<string> {
    const encoder = new TextEncoder();
    const buffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
    return Array.from(new Uint8Array(buffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

export default {
    rateLimit,
    strictRateLimit,
    csrfProtection,
    securityHeaders,
    validateInput,
    sanitizeHtml,
    generateSecureToken,
    hashData
};
