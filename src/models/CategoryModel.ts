/**
 * Category Model
 * نموذج الفئة
 * 
 * Handles all database operations for categories.
 */

import { BaseModel } from './base/BaseModel';
import type { Category } from '../config/types';

/**
 * Category with subcategories
 */
export interface CategoryWithSubcategories extends Category {
    subcategories?: Category[];
}

/**
 * Category Model Class
 */
export class CategoryModel extends BaseModel<Category> {
    protected readonly tableName = 'categories';

    /**
     * Find all parent categories (no parent_id)
     */
    async findParentCategories(): Promise<Category[]> {
        return this.query<Category>(
            'SELECT * FROM categories WHERE parent_id IS NULL AND is_active = 1 ORDER BY sort_order ASC'
        );
    }

    /**
     * Find subcategories of a parent
     */
    async findSubcategories(parentId: number): Promise<Category[]> {
        return this.query<Category>(
            'SELECT * FROM categories WHERE parent_id = ? AND is_active = 1 ORDER BY sort_order ASC',
            parentId
        );
    }

    /**
     * Find category by slug
     */
    async findBySlug(slug: string): Promise<Category | null> {
        return this.findOne('slug', slug);
    }

    /**
     * Find all categories with subcategories
     */
    async findAllWithSubcategories(): Promise<CategoryWithSubcategories[]> {
        const parents = await this.findParentCategories();

        const result: CategoryWithSubcategories[] = [];
        for (const parent of parents) {
            const subcategories = await this.findSubcategories(parent.id);
            result.push({ ...parent, subcategories });
        }

        return result;
    }

    /**
     * Create category
     */
    async create(data: Partial<Category>): Promise<Category> {
        const result = await this.db.prepare(`
            INSERT INTO categories (name_ar, name_en, slug, icon, color, parent_id, sort_order, is_active)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
        `).bind(
            data.name_ar || null,
            data.name_en || null,
            data.slug || null,
            data.icon || null,
            data.color || null,
            data.parent_id || null,
            data.sort_order || 0
        ).run();

        return (await this.findById(result.meta.last_row_id as number))!;
    }

    /**
     * Update category
     */
    async update(id: number, data: Partial<Category>): Promise<Category | null> {
        const updates: string[] = [];
        const values: any[] = [];

        if (data.name_ar !== undefined) { updates.push('name_ar = ?'); values.push(data.name_ar); }
        if (data.name_en !== undefined) { updates.push('name_en = ?'); values.push(data.name_en); }
        if (data.slug !== undefined) { updates.push('slug = ?'); values.push(data.slug); }
        if (data.icon !== undefined) { updates.push('icon = ?'); values.push(data.icon); }
        if (data.color !== undefined) { updates.push('color = ?'); values.push(data.color); }
        if (data.is_active !== undefined) { updates.push('is_active = ?'); values.push(data.is_active ? 1 : 0); }

        if (updates.length === 0) return this.findById(id);

        values.push(id);
        await this.db.prepare(
            `UPDATE categories SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }
}

export default CategoryModel;
