/**
 * @file src/controllers/WatchCollectionsController.ts
 * @description UNIT32.1 / R4-PROFILE-COLLECTIONS-1 — owner-only Watch Later
 * and Viewing History collections.
 *
 * Controllers own authentication, validation and the response shape; all SQL
 * stays in WatchLaterModel / WatchHistoryModel. Identity is ALWAYS the
 * authenticated session user (`c.get('user')`); no query/body `user_id` is ever
 * read. Guests fail closed with 401 at the router and inside each handler.
 */
import type { Context } from 'hono';
import type { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { WatchLaterModel } from '../models/WatchLaterModel';
import { WatchHistoryModel } from '../models/WatchHistoryModel';
import type { CollectionCursor } from '../models/competition-card-columns';

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const MAX_STATUS_IDS = 100;

type AppContext = Context<{ Bindings: Bindings; Variables: Variables }>;

export class WatchCollectionsController extends BaseController {
    /**
     * GET /api/watch/later
     * Owner-only Watch Later page.
     */
    async listWatchLater(c: AppContext) {
        return this.list(c, 'later');
    }

    /**
     * GET /api/watch/history
     * Owner-only Viewing History page.
     */
    async listHistory(c: AppContext) {
        return this.list(c, 'history');
    }

    /**
     * GET /api/watch/later/status?ids=1,2,3
     * Batched membership for card/competition-page hydration.
     */
    async status(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const raw = c.req.query('ids') || '';
            if (raw === '') return this.success(c, { saved: [] });

            const parts = raw.split(',');
            if (parts.length > MAX_STATUS_IDS) {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }
            const ids: number[] = [];
            for (const part of parts) {
                const trimmed = part.trim();
                if (!/^[1-9]\d*$/.test(trimmed)) {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                const id = Number(trimmed);
                if (!Number.isSafeInteger(id)) {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
                if (!ids.includes(id)) ids.push(id);
            }

            const saved = await new WatchLaterModel(c.env.DB).filterSavedIds(user.id, ids);
            return this.success(c, { saved });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * POST /api/watch/later/:competitionId
     * Idempotent explicit save.
     */
    async add(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.competitionId(c);
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const model = new WatchLaterModel(c.env.DB);
            const status = await model.findCompetitionStatus(competitionId);
            // Cancelled/missing content cannot be newly saved. Unavailable
            // rows already saved stay readable in the list (no data erasure).
            if (!status || status === 'cancelled') {
                return this.notFound(c);
            }

            const added = await model.add(user.id, competitionId);
            return this.success(c, {
                competition_id: competitionId,
                saved: true,
                added,
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * DELETE /api/watch/later/:competitionId
     * Idempotent explicit removal.
     */
    async remove(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.competitionId(c);
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }
            const removed = await new WatchLaterModel(c.env.DB).remove(user.id, competitionId);
            return this.success(c, {
                competition_id: competitionId,
                saved: false,
                removed,
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * POST /api/watch/history/:competitionId
     *
     * Client signal for a REAL VOD playback event (the competition page calls
     * it once, after ~5s of actual non-paused playback). It never accepts
     * seconds/completion and never creates a view; the model only moves
     * `watched_at` for completed/archived competitions.
     */
    async recordHistory(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);
            const competitionId = this.competitionId(c);
            if (!competitionId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }
            const recorded = await new WatchHistoryModel(c.env.DB).touchVodWatch(user.id, competitionId);
            if (!recorded) return this.notFound(c);
            return this.success(c, { competition_id: competitionId, recorded: true });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    // ---------------------------------------------------------------- helpers

    private async list(c: AppContext, kind: 'later' | 'history') {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const user = this.getCurrentUser(c);

            const limit = this.parseLimit(c);
            if (limit === null) {
                return this.validationError(c, this.t('errors.invalid_request', c));
            }

            const rawCursor = c.req.query('cursor');
            let cursor: CollectionCursor | null = null;
            if (rawCursor !== undefined && rawCursor !== '') {
                cursor = this.decodeCursor(rawCursor);
                if (!cursor) {
                    return this.validationError(c, this.t('errors.invalid_request', c));
                }
            }

            const page = kind === 'later'
                ? await new WatchLaterModel(c.env.DB).findPage(user.id, limit, cursor)
                : await new WatchHistoryModel(c.env.DB).findPage(user.id, limit, cursor);

            const nextCursor = page.next
                ? this.encodeCursor(page.next.at, page.next.id)
                : null;

            return this.success(c, {
                items: page.items,
                nextCursor,
                hasMore: nextCursor !== null,
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    private parseLimit(c: AppContext): number | null {
        const raw = c.req.query('limit');
        if (raw === undefined || raw === '') return DEFAULT_LIMIT;
        if (!/^\d+$/.test(raw)) return null;
        const parsed = Number(raw);
        if (!Number.isSafeInteger(parsed) || parsed < 1) return null;
        return Math.min(parsed, MAX_LIMIT);
    }

    private competitionId(c: AppContext): number | null {
        const raw = this.getParam(c, 'competitionId');
        if (!/^[1-9]\d*$/.test(raw)) return null;
        const id = Number(raw);
        return Number.isSafeInteger(id) ? id : null;
    }

    /**
     * Opaque, URL-safe-enough cursor. Base64 of a tiny JSON object avoids
     * delimiter ambiguity in the stored timestamp while remaining inspectable
     * for logs. Forged/malformed values are rejected (422), never coerced.
     */
    private encodeCursor(at: string, id: number): string {
        return btoa(JSON.stringify({ t: at, i: id }));
    }

    private decodeCursor(raw: string): CollectionCursor | null {
        try {
            const parsed = JSON.parse(atob(raw)) as { t?: unknown; i?: unknown };
            if (!parsed || typeof parsed.t !== 'string' || typeof parsed.i !== 'number') {
                return null;
            }
            if (!/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}$/.test(parsed.t)) return null;
            if (!Number.isSafeInteger(parsed.i) || parsed.i <= 0) return null;
            return { at: parsed.t, id: parsed.i };
        } catch {
            return null;
        }
    }
}

export default WatchCollectionsController;
