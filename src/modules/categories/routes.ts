/**
 * @file modules/categories/routes.ts
 * @description مسارات التصنيفات
 * @description_en Category routes
 * @module modules/categories
 * @version 1.0.0
 * @author Dueli Team
 */

import { Hono } from 'hono';
import { categoryController } from './CategoryController';
import type { Bindings, Variables } from '../../core/http/types';

/**
 * مسارات التصنيفات
 * Category routes
 */
const categoryRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

categoryRoutes.get('/', (c) => categoryController.list(c));
categoryRoutes.get('/main', (c) => categoryController.listMain(c));
categoryRoutes.get('/search', (c) => categoryController.search(c));
categoryRoutes.get('/:id', (c) => categoryController.get(c));
categoryRoutes.get('/:id/subcategories', (c) => categoryController.getSubcategories(c));

export default categoryRoutes;
