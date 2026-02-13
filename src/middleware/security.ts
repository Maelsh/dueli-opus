/**
 * @file src/middleware/security.ts
 * @description Security middleware (CSRF, rate limiting basics, headers)
 * @module middleware/security
 * 
 * وسيطة الأمان - حماية CSRF وترويسات الأمان
 */

import { Context, Next } from 'hono';
import type { Bindings, Variables } from '../config/types';

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * Security Headers Middleware
 * Adds standard security headers to all responses
 */
export async function securityHeaders(c: AppContext, next: Next) {
    await next();

    // Prevent clickjacking
    c.res.headers.set('X-Frame-Options', 'DENY');

    // Prevent MIME type sniffing
    c.res.headers.set('X-Content-Type-Options', 'nosniff');

    // XSS Protection (legacy browsers)
    c.res.headers.set('X-XSS-Protection', '1; mode=block');

    // Referrer policy
    c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

    // Content Security Policy
    c.res.headers.set('Content-Security-Policy', [
        "default-src 'self'",
        "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com",
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com",
        "img-src 'self' data: https: blob:",
        "connect-src 'self' wss: ws: https:",
        "media-src 'self' blob: https:",
        "frame-src 'self' https://www.youtube.com https://meet.jit.si",
    ].join('; '));
}

/**
 * CSRF Protection Middleware
 * 
 * Uses the Double-Submit Cookie pattern:
 * 1. Server sets a CSRF token cookie
 * 2. Client must send the same token in X-CSRF-Token header
 * 3. Only applies to state-changing methods (POST, PUT, DELETE, PATCH)
 */
export async function csrfProtection(c: AppContext, next: Next) {
    const method = c.req.method.toUpperCase();

    // Only check CSRF for state-changing methods
    if (['GET', 'HEAD', 'OPTIONS'].includes(method)) {
        await next();
        return;
    }

    // Skip CSRF for API auth routes (login, register, OAuth callbacks)
    const path = new URL(c.req.url).pathname;
    if (
        path.startsWith('/api/auth/login') ||
        path.startsWith('/api/auth/register') ||
        path.startsWith('/api/auth/oauth') ||
        path.startsWith('/api/auth/verify') ||
        path.startsWith('/api/auth/forgot')
    ) {
        await next();
        return;
    }

    // Get CSRF token from cookie and header
    const cookieHeader = c.req.header('Cookie') || '';
    const csrfCookie = cookieHeader.match(/csrf_token=([^;]+)/)?.[1];
    const csrfHeader = c.req.header('X-CSRF-Token');

    // If no CSRF cookie set yet, generate one and allow the request
    // (First request bootstrap)
    if (!csrfCookie) {
        const token = generateCSRFToken();
        c.res.headers.set('Set-Cookie', `csrf_token=${token}; Path=/; HttpOnly=false; SameSite=Strict; Secure`);
        await next();
        return;
    }

    // Validate: header must match cookie
    if (!csrfHeader || csrfHeader !== csrfCookie) {
        return c.json({
            success: false,
            error: 'Invalid CSRF token'
        }, 403);
    }

    await next();
}

/**
 * Generate a random CSRF token
 */
function generateCSRFToken(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Rate Limiting Middleware (basic in-memory per worker)
 * Note: In production with multiple workers, use Durable Objects or external store
 */
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(c: AppContext, next: Next) {
    const ip = c.req.header('CF-Connecting-IP') || c.req.header('X-Forwarded-For') || 'unknown';
    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = 120; // 120 requests per minute

    let entry = rateLimitMap.get(ip);

    if (!entry || now > entry.resetAt) {
        entry = { count: 0, resetAt: now + windowMs };
        rateLimitMap.set(ip, entry);
    }

    entry.count++;

    if (entry.count > maxRequests) {
        return c.json({
            success: false,
            error: 'Too many requests. Please try again later.'
        }, 429);
    }

    // Clean up old entries periodically
    if (rateLimitMap.size > 10000) {
        for (const [key, val] of rateLimitMap) {
            if (now > val.resetAt) rateLimitMap.delete(key);
        }
    }

    await next();
}

/**
 * Input Sanitization Helper
 * Strips potential XSS vectors from string inputs
 */
export function sanitizeInput(input: string): string {
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;');
}

export default {
    securityHeaders,
    csrfProtection,
    rateLimit,
    sanitizeInput
};
