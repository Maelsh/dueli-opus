/**
 * Categories API Routes
 * مسارات API للفئات
 * 
 * MVC-compliant: Routes delegate to CategoryController
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { CategoryController } from '../../../controllers';

const categoriesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new CategoryController();

/**
 * Get all categories
 * GET /api/categories
 */
categoriesRoutes.get('/', (c) => controller.list(c));

/**
 * Get category by ID or slug
 * GET /api/categories/:id
 */
categoriesRoutes.get('/:id', (c) => controller.show(c));

/**
 * Get subcategories
 * GET /api/categories/:id/subcategories
 */
categoriesRoutes.get('/:id/subcategories', (c) => controller.getSubcategories(c));

export default categoriesRoutes;
