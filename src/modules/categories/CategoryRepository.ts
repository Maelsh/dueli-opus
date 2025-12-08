/**
 * @file modules/categories/CategoryRepository.ts
 * @description مستودع التصنيفات
 * @description_en Category Repository
 * @module modules/categories
 * @version 1.0.0
 * @author Dueli Team
 */

import { BaseRepository } from '../../core/database';
import type { Category } from '../../core/http/types';

/**
 * تصنيف مع الأب
 * Category with parent
 */
export interface CategoryWithParent extends Category {
  parent_name_ar?: string;
  parent_name_en?: string;
}

/**
 * مستودع التصنيفات
 * Category Repository
 */
export class CategoryRepository extends BaseRepository<Category> {
  constructor(db: D1Database) {
    super(db, 'categories');
  }

  /**
   * الحصول على جميع التصنيفات مع الآباء
   * Get all categories with parents
   */
  async findAllWithParents(): Promise<CategoryWithParent[]> {
    const query = `
      SELECT c.*, 
             p.name_ar as parent_name_ar, 
             p.name_en as parent_name_en
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE c.is_active = 1
      ORDER BY c.parent_id NULLS FIRST, c.sort_order
    `;

    return this.rawQuery<CategoryWithParent>(query);
  }

  /**
   * الحصول على التصنيفات الرئيسية
   * Get main categories (no parent)
   */
  async findMainCategories(): Promise<Category[]> {
    return this.rawQuery<Category>(
      `SELECT * FROM categories 
       WHERE parent_id IS NULL AND is_active = 1 
       ORDER BY sort_order`
    );
  }

  /**
   * الحصول على التصنيفات الفرعية
   * Get subcategories
   */
  async findSubcategories(parentId: number): Promise<Category[]> {
    return this.rawQuery<Category>(
      `SELECT * FROM categories 
       WHERE parent_id = ? AND is_active = 1 
       ORDER BY sort_order`,
      [parentId]
    );
  }

  /**
   * الحصول على تصنيف مع التصنيفات الفرعية
   * Get category with subcategories
   */
  async findWithSubcategories(categoryId: number): Promise<{
    category: Category | null;
    subcategories: Category[];
  }> {
    const category = await this.findById(categoryId);
    const subcategories = category 
      ? await this.findSubcategories(categoryId)
      : [];

    return { category, subcategories };
  }

  /**
   * البحث في التصنيفات
   * Search categories
   */
  async search(query: string): Promise<Category[]> {
    const searchTerm = `%${query}%`;
    return this.rawQuery<Category>(
      `SELECT * FROM categories 
       WHERE is_active = 1 
       AND (name_ar LIKE ? OR name_en LIKE ? OR description_ar LIKE ? OR description_en LIKE ?)
       ORDER BY sort_order`,
      [searchTerm, searchTerm, searchTerm, searchTerm]
    );
  }
}

export default CategoryRepository;
