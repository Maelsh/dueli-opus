/**
 * @file src/modules/api/watch/routes.ts
 * @description UNIT32.1 / R4-PROFILE-COLLECTIONS-1 — owner-only Watch Later
 * and Viewing History API.
 *
 * Every route is AUTHENTICATED: the collection owner is the session user, and
 * there is no `user_id` parameter anywhere in the contract.
 */
import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';
import { WatchCollectionsController } from '../../../controllers/WatchCollectionsController';

const watchRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new WatchCollectionsController();

watchRoutes.use('*', authMiddleware({ required: true }));

/**
 * GET /api/watch/later
 * Owner's Watch Later page (keyset cursor).
 */
watchRoutes.get('/later', (c) => controller.listWatchLater(c));

/**
 * GET /api/watch/later/status?ids=1,2,3
 * Batched saved-state hydration for cards and the competition page.
 */
watchRoutes.get('/later/status', (c) => controller.status(c));

/**
 * POST /api/watch/later/:competitionId
 * Explicit, idempotent save.
 */
watchRoutes.post('/later/:competitionId', (c) => controller.add(c));

/**
 * DELETE /api/watch/later/:competitionId
 * Explicit, idempotent removal.
 */
watchRoutes.delete('/later/:competitionId', (c) => controller.remove(c));

/**
 * GET /api/watch/history
 * Owner's Viewing History page (keyset cursor).
 */
watchRoutes.get('/history', (c) => controller.listHistory(c));

/**
 * POST /api/watch/history/:competitionId
 * Real VOD playback signal; only moves watched_at (never H1 seconds).
 */
watchRoutes.post('/history/:competitionId', (c) => controller.recordHistory(c));

/**
 * DELETE /api/watch/history/:competitionId
 * UNIT41.2-P1 (G6): owner-only single-entry removal.
 */
watchRoutes.delete('/history/:competitionId', (c) => controller.removeHistory(c));

/**
 * DELETE /api/watch/history
 * UNIT41.2-P1 (G6): owner-only full clear.
 */
watchRoutes.delete('/history', (c) => controller.clearHistory(c));

export default watchRoutes;
