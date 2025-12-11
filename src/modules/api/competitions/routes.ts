/**
 * Competitions API Routes
 * مسارات API للمنافسات
 * 
 * MVC-compliant: Routes delegate to CompetitionController
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { CompetitionController } from '../../../controllers';

const competitionsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new CompetitionController();

// ============================================
// Read Operations
// ============================================

/**
 * Get competitions with filters
 * GET /api/competitions
 */
competitionsRoutes.get('/', (c) => controller.list(c));

/**
 * Get single competition with details
 * GET /api/competitions/:id
 */
competitionsRoutes.get('/:id', (c) => controller.show(c));

/**
 * Get competition requests
 * GET /api/competitions/:id/requests
 */
competitionsRoutes.get('/:id/requests', (c) => controller.getRequests(c));

// ============================================
// Create Operations
// ============================================

/**
 * Create competition
 * POST /api/competitions
 */
competitionsRoutes.post('/', (c) => controller.create(c));

/**
 * Request to join competition
 * POST /api/competitions/:id/request
 */
competitionsRoutes.post('/:id/request', (c) => controller.requestJoin(c));

/**
 * Accept join request
 * POST /api/competitions/:id/accept-request
 */
competitionsRoutes.post('/:id/accept-request', (c) => controller.acceptRequest(c));

/**
 * Decline join request
 * POST /api/competitions/:id/decline-request
 */
competitionsRoutes.post('/:id/decline-request', (c) => controller.declineRequest(c));

/**
 * Start competition (go live)
 * POST /api/competitions/:id/start
 */
competitionsRoutes.post('/:id/start', (c) => controller.start(c));

/**
 * End competition
 * POST /api/competitions/:id/end
 */
competitionsRoutes.post('/:id/end', (c) => controller.end(c));

/**
 * Add comment
 * POST /api/competitions/:id/comments
 */
competitionsRoutes.post('/:id/comments', (c) => controller.addComment(c));

/**
 * Rate competitor
 * POST /api/competitions/:id/rate
 */
competitionsRoutes.post('/:id/rate', (c) => controller.rate(c));

// ============================================
// Update Operations
// ============================================

/**
 * Update competition
 * PUT /api/competitions/:id
 */
competitionsRoutes.put('/:id', (c) => controller.update(c));

// ============================================
// Delete Operations
// ============================================

/**
 * Delete competition
 * DELETE /api/competitions/:id
 */
competitionsRoutes.delete('/:id', (c) => controller.delete(c));

/**
 * Cancel join request
 * DELETE /api/competitions/:id/request
 */
competitionsRoutes.delete('/:id/request', (c) => controller.cancelRequest(c));

/**
 * Delete comment
 * DELETE /api/competitions/:competitionId/comments/:commentId
 */
competitionsRoutes.delete('/:competitionId/comments/:commentId', (c) => controller.deleteComment(c));

export default competitionsRoutes;
