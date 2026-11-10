/**
 * @file src/lib/services/LifecycleSweep.ts
 * @description UNIT41.2-P1 (G5): opportunistic, non-blocking lifecycle sweep.
 *
 * Cloudflare Pages has no native cron: the minute maintenance only runs when
 * an external scheduler hits POST /api/cron/run. This sweep lets any public
 * competition read/create trigger the same maintenance lazily, guarded by a
 * short in-memory interval per isolate, so the 1-hour pending-expiry law is
 * enforced in production even if the external scheduler is late or missing.
 *
 * The work is handed to `executionCtx.waitUntil` when available so it
 * survives the response; otherwise the returned promise still runs and the
 * caller may await it (tests do).
 */

import type { D1Database } from '@cloudflare/workers-types';
import type { AppContext } from '../../controllers/base/BaseController';
import { ScheduledTaskService } from './ScheduledTaskService';
import { handleLifecycleTimers } from './CronHandler';

export class LifecycleSweep {
    static readonly INTERVAL_MS = 60_000;
    private static lastRunAt = 0;
    private static running = false;

    /**
     * Trigger the sweep when the per-isolate interval has elapsed.
     * `options.force`/`options.now` exist for deterministic tests only; the
     * request path calls this with no options.
     */
    static trigger(
        db: D1Database,
        c: AppContext,
        options: { now?: number; force?: boolean } = {}
    ): Promise<void> {
        const now = options.now ?? Date.now();
        if (!options.force && (LifecycleSweep.running || now - LifecycleSweep.lastRunAt < LifecycleSweep.INTERVAL_MS)) {
            return Promise.resolve();
        }
        LifecycleSweep.lastRunAt = now;

        const task = (async (): Promise<void> => {
            LifecycleSweep.running = true;
            try {
                await new ScheduledTaskService(db).processPendingTasks();
                await handleLifecycleTimers({ DB: db });
            } catch (error) {
                console.error('[LifecycleSweep] maintenance failed:', error);
            } finally {
                LifecycleSweep.running = false;
            }
        })();

        try {
            const executionCtx = c.executionCtx as unknown as { waitUntil?: (promise: Promise<unknown>) => void };
            if (executionCtx && typeof executionCtx.waitUntil === 'function') {
                executionCtx.waitUntil(task);
            }
        } catch {
            // No execution context (Node/Vitest): the returned promise still
            // runs; callers that care may await it.
        }

        return task;
    }
}

export default LifecycleSweep;
