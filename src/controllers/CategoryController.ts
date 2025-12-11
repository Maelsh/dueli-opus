/**
 * Category Controller
 * متحكم الفئات
 * 
 * MVC-compliant controller for category operations.
 * Gets dependencies from Hono context.
 */

import { BaseController, AppContext } from './base/BaseController';
import { CategoryModel } from '../models';

/**
 * Category Controller Class
 * متحكم الفئات
 */
export class CategoryController extends BaseController {

    /**
     * List all categories with parent info
     * GET /api/categories
     */
    async list(c: AppContext) {
        try {
            const { DB } = c.env;
            const categoryModel = new CategoryModel(DB);
            const categories = await categoryModel.findAllWithParent();
            return this.success(c, categories);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get category by ID or slug
     * GET /api/categories/:id
     */
    async show(c: AppContext) {
        try {
            const { DB } = c.env;
            const idOrSlug = this.getParam(c, 'id');
            const categoryModel = new CategoryModel(DB);

            // Check if it's a number or slug
            const id = parseInt(idOrSlug);
            const category = isNaN(id)
                ? await categoryModel.findBySlug(idOrSlug)
                : await categoryModel.findById(id);

            if (!category) {
                return this.notFound(c, this.t('category.not_found', c));
            }

            // Get subcategories
            const subcategories = await categoryModel.findSubcategories(category.id);

            return this.success(c, { ...category, subcategories });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get subcategories
     * GET /api/categories/:id/subcategories
     */
    async getSubcategories(c: AppContext) {
        try {
            const { DB } = c.env;
            const id = this.getParamInt(c, 'id');

            const categoryModel = new CategoryModel(DB);
            const subcategories = await categoryModel.findSubcategories(id);

            return this.success(c, subcategories);
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default CategoryController;
