/**
 * Category Controller
 * متحكم الفئات
 */

import { BaseController, AppContext } from './base/BaseController';
import { CategoryModel } from '../models';

/**
 * Category Controller Class
 */
export class CategoryController extends BaseController {
    private categoryModel: CategoryModel;

    constructor(db: D1Database) {
        super();
        this.categoryModel = new CategoryModel(db);
    }

    /**
     * List all categories with subcategories
     * GET /api/categories
     */
    async list(c: AppContext) {
        try {
            const categories = await this.categoryModel.findAllWithSubcategories();
            return this.success(c, categories);

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get category by ID
     * GET /api/categories/:id
     */
    async show(c: AppContext) {
        try {
            const id = this.getParamInt(c, 'id');
            const category = await this.categoryModel.findById(id);

            if (!category) {
                return this.notFound(c, 'Category not found');
            }

            // Get subcategories
            const subcategories = await this.categoryModel.findSubcategories(id);

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
            const id = this.getParamInt(c, 'id');
            const subcategories = await this.categoryModel.findSubcategories(id);

            return this.success(c, subcategories);

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default CategoryController;
