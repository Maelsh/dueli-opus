/**
 * Public documents read (R2-A H9, R3-C2 index).
 * Only published + public docs are visible; everything else is 404.
 * GET /api/documents (index) + GET /api/documents/:slug
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { DocumentController } from '../../../controllers/DocumentController';
import { authMiddleware } from '../../../middleware/auth';

const documentsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
documentsRoutes.use('*', authMiddleware({ required: false }));
const controller = new DocumentController();

documentsRoutes.get('/', (c) => controller.listPublished(c));
documentsRoutes.get('/:slug', (c) => controller.getPublished(c));

export default documentsRoutes;
