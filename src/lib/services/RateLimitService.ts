/**
 * Rate Limit Service (B7)
 * خدمة الحد من الطلبات
 *
 * Central per-user, per-action rate limiting backed by the durable D1 table
 * `rate_limits` (migrations/0012_rate_limits.sql) — SEC-12: an in-memory Map
 * does not survive Workers isolate/edge rotation, so counters must live in D1.
 *
 * Controllers never implement counting logic themselves — they call consume()
 * and translate the result into a 429 + Retry-After response.
 *
 * Constants (B7 — no magic numbers scattered in controllers):
 *   comment: 10 / minute
 *   message: 20 / minute
 *
 * Note: financial/ads routes are intentionally NOT covered here (frozen scope).
 */

import { D1Database, D1Result } from '@cloudflare/workers-types';

/** B7 limits: action → { limit, windowSeconds } */
export const RATE_LIMITS = {
    comment: { limit: 10, windowSeconds: 60 },
    message: { limit: 20, windowSeconds: 60 },
} as const;

export type RateLimitAction = keyof typeof RATE_LIMITS;

export interface RateLimitResult {
    allowed: boolean;
    /** Seconds until the current window resets (0 when allowed) */
    retryAfter: number;
}

export class RateLimitService {
    constructor(private db: D1Database) {}

    /**
     * Consume one unit of the quota for (userId, action).
     *
     * Atomicity: a single UPSERT statement increments the counter
     * (INSERT ... ON CONFLICT DO UPDATE — no read-then-write race),
     * followed by a SELECT to read back the new count. Both statements
     * are sent as one batch (single round trip).
     *
     * Fallback: if D1 is unavailable we fail OPEN (allow the request),
     * same policy as src/middleware/security.ts — availability wins
     * during a DB outage; the error is logged for visibility.
     */
    async consume(
        userId: number,
        action: RateLimitAction,
        limit?: number,
        windowSeconds?: number
    ): Promise<RateLimitResult> {
        const preset = RATE_LIMITS[action];
        const max = limit ?? preset.limit;
        const windowMs = (windowSeconds ?? preset.windowSeconds) * 1000;

        const now = Date.now();
        const windowStart = Math.floor(now / windowMs) * windowMs;
        // Namespace by action+user so comment quota never collides with message quota.
        const key = `rl:${action}:user:${userId}`;

        let count = 1;
        try {
            const results = await this.db.batch([
                this.db.prepare(
                    `INSERT INTO rate_limits (key, window_start, count) VALUES (?, ?, 1)
                     ON CONFLICT(key, window_start) DO UPDATE SET count = count + 1`
                ).bind(key, windowStart),
                this.db.prepare(
                    `SELECT count FROM rate_limits WHERE key = ? AND window_start = ?`
                ).bind(key, windowStart),
            ]);
            const readBack = results[1] as D1Result<{ count: number }>;
            const row = readBack?.results?.[0];
            count = row?.count ?? 1;
        } catch (err) {
            console.error('[RateLimitService] D1 unavailable, failing open:', err);
            return { allowed: true, retryAfter: 0 };
        }

        if (count > max) {
            return {
                allowed: false,
                retryAfter: Math.max(1, Math.ceil((windowStart + windowMs - now) / 1000)),
            };
        }

        return { allowed: true, retryAfter: 0 };
    }
}

export default RateLimitService;
