import { Context, Next } from 'hono';
import { RateLimitError } from '../lib/errors/AppError';

interface RateLimitOptions {
    windowMs: number;      // Time window in milliseconds
    maxRequests: number;   // Maximum requests per window
    keyGenerator?: (c: Context) => string;  // Custom key generator
}

/**
 * In-memory rate limit store (simple implementation)
 * For production, consider using KV store or Redis
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

/**
 * Rate Limiter Middleware
 * محدد معدل الطلبات
 */
export const rateLimit = (options: RateLimitOptions) => {
    const { windowMs, maxRequests, keyGenerator } = options;

    return async (c: Context, next: Next) => {
        // Generate key (IP or user ID)
        const key = keyGenerator 
            ? keyGenerator(c) 
            : c.req.header('cf-connecting-ip') || c.req.header('x-forwarded-for') || 'unknown';

        const now = Date.now();
        const record = rateLimitStore.get(key);

        // Clean old records
        if (record && record.resetAt < now) {
            rateLimitStore.delete(key);
        }

        // Get or create record
        const current = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };

        // Check if limit exceeded
        if (current.count >= maxRequests) {
            const retryAfter = Math.ceil((current.resetAt - now) / 1000);
            c.header('Retry-After', retryAfter.toString());
            throw new RateLimitError(`تجاوزت الحد المسموح. حاول مرة أخرى بعد ${retryAfter} ثانية`);
        }

        // Increment counter
        current.count++;
        rateLimitStore.set(key, current);

        // Add headers
        c.header('X-RateLimit-Limit', maxRequests.toString());
        c.header('X-RateLimit-Remaining', (maxRequests - current.count).toString());
        c.header('X-RateLimit-Reset', current.resetAt.toString());

        await next();
    };
};

/**
 * Cleanup old rate limit records periodically
 * تنظيف السجلات القديمة
 */
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
        if (record.resetAt < now) {
            rateLimitStore.delete(key);
        }
    }
}, 60000); // Clean every minute
