/**
 * @file modules/categories/CategoryController.ts
 * @description متحكم التصنيفات
 * @description_en Category Controller
 * @module modules/categories
 * @version 1.0.0
 * @author Dueli Team
 */

import { BaseController, ControllerContext } from '../../core';
import { CategoryRepository } from './CategoryRepository';

/**
 * متحكم التصنيفات
 * Category Controller
 */
export class CategoryController extends BaseController {
  constructor() {
    super('CategoryController');
  }

  /**
   * الحصول على المستودع
   */
  private getRepo(c: ControllerContext): CategoryRepository {
    return new CategoryRepository(this.getDB(c));
  }

  /**
   * الحصول على جميع التصنيفات
   * GET /api/categories
   */
  async list(c: ControllerContext) {
    const repo = this.getRepo(c);
    const categories = await repo.findAllWithParents();
    return this.ok(c, categories);
  }

  /**
   * الحصول على التصنيفات الرئيسية فقط
   * GET /api/categories/main
   */
  async listMain(c: ControllerContext) {
    const repo = this.getRepo(c);
    const categories = await repo.findMainCategories();
    return this.ok(c, categories);
  }

  /**
   * الحصول على تصنيف محدد
   * GET /api/categories/:id
   */
  async get(c: ControllerContext) {
    const id = this.getParamInt(c, 'id');
    
    if (!id) {
      return this.badRequest(c, 'Category ID is required');
    }

    const repo = this.getRepo(c);
    const result = await repo.findWithSubcategories(id);

    if (!result.category) {
      return this.notFound(c, 'Category not found');
    }

    return this.ok(c, result);
  }

  /**
   * الحصول على التصنيفات الفرعية
   * GET /api/categories/:id/subcategories
   */
  async getSubcategories(c: ControllerContext) {
    const id = this.getParamInt(c, 'id');
    
    if (!id) {
      return this.badRequest(c, 'Category ID is required');
    }

    const repo = this.getRepo(c);
    const subcategories = await repo.findSubcategories(id);
    
    return this.ok(c, subcategories);
  }

  /**
   * البحث في التصنيفات
   * GET /api/categories/search?q=xxx
   */
  async search(c: ControllerContext) {
    const query = this.getQuery(c, 'q', '');
    
    if (!query || query.length < 2) {
      return this.badRequest(c, 'Search query must be at least 2 characters');
    }

    const repo = this.getRepo(c);
    const categories = await repo.search(query);
    
    return this.ok(c, categories);
  }
}

// تصدير نسخة واحدة
export const categoryController = new CategoryController();
export default CategoryController;
