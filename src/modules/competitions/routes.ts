/**
 * @file modules/competitions/routes.ts
 * @description مسارات المنافسات
 * @description_en Competition routes
 * @module modules/competitions
 * @version 1.0.0
 * @author Dueli Team
 */

import { Hono } from 'hono';
import { competitionController } from './CompetitionController';
import type { Bindings, Variables } from '../../core/http/types';

/**
 * مسارات المنافسات
 * Competition routes
 */
const competitionRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// القراءة
competitionRoutes.get('/', (c) => competitionController.list(c));
competitionRoutes.get('/live', (c) => competitionController.getLive(c));
competitionRoutes.get('/:id', (c) => competitionController.get(c));

// الإنشاء والتعديل
competitionRoutes.post('/', (c) => competitionController.create(c));
competitionRoutes.post('/:id/join', (c) => competitionController.join(c));
competitionRoutes.post('/:id/start', (c) => competitionController.start(c));
competitionRoutes.post('/:id/end', (c) => competitionController.end(c));
competitionRoutes.post('/:id/cancel', (c) => competitionController.cancel(c));

// التقييمات
competitionRoutes.get('/:id/ratings', (c) => competitionController.getRatings(c));
competitionRoutes.post('/:id/ratings', (c) => competitionController.addRating(c));

// التعليقات
competitionRoutes.get('/:id/comments', (c) => competitionController.getComments(c));
competitionRoutes.post('/:id/comments', (c) => competitionController.addComment(c));
competitionRoutes.delete('/:id/comments/:commentId', (c) => competitionController.deleteComment(c));

export default competitionRoutes;
