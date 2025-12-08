/**
 * @file api/categories.ts
 * @description نقاط نهاية API للأقسام
 * @description_en API endpoints for categories
 * @module api/categories
 * @version 1.0.0
 * @author Dueli Team
 */

import { Hono } from 'hono';
import type { Bindings, Variables, Category, ApiResponse } from '../types';

/**
 * تطبيق Hono للأقسام
 */
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * @api {get} /api/categories الحصول على جميع الأقسام
 * @apiName GetCategories
 * @apiGroup Categories
 * @apiDescription يجلب جميع الأقسام المفعلة مع الأقسام الفرعية
 * 
 * @apiSuccess {Boolean} success حالة نجاح الطلب
 * @apiSuccess {Category[]} data قائمة الأقسام
 * 
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *       "success": true,
 *       "data": [
 *         {
 *           "id": 1,
 *           "name_ar": "الحوار",
 *           "name_en": "Dialogue",
 *           "slug": "dialogue",
 *           "icon": "fas fa-comments",
 *           "color": "#8b5cf6"
 *         }
 *       ]
 *     }
 * 
 * @apiError {Boolean} success false
 * @apiError {String} error رسالة الخطأ
 */
app.get('/', async (c) => {
  const { DB } = c.env;

  try {
    // جلب الأقسام مع معلومات القسم الأب
    const categories = await DB.prepare(`
      SELECT c.*, 
             p.name_ar as parent_name_ar, 
             p.name_en as parent_name_en
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE c.is_active = 1
      ORDER BY c.parent_id NULLS FIRST, c.sort_order
    `).all();

    const response: ApiResponse<Category[]> = {
      success: true,
      data: categories.results as Category[],
    };

    return c.json(response);
  } catch (error) {
    console.error('[Categories API] Error fetching categories:', error);
    
    const response: ApiResponse = {
      success: false,
      error: 'Failed to fetch categories',
    };
    
    return c.json(response, 500);
  }
});

/**
 * @api {get} /api/categories/:id الحصول على قسم محدد
 * @apiName GetCategory
 * @apiGroup Categories
 * @apiDescription يجلب قسم محدد بمعرفه
 * 
 * @apiParam {Number} id معرف القسم
 * 
 * @apiSuccess {Boolean} success حالة نجاح الطلب
 * @apiSuccess {Category} data بيانات القسم
 */
app.get('/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');

  try {
    const category = await DB.prepare(`
      SELECT c.*, 
             p.name_ar as parent_name_ar, 
             p.name_en as parent_name_en
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE c.id = ? AND c.is_active = 1
    `).bind(id).first();

    if (!category) {
      return c.json({
        success: false,
        error: 'Category not found',
      }, 404);
    }

    // جلب الأقسام الفرعية إن كان قسماً رئيسياً
    const subcategories = await DB.prepare(`
      SELECT * FROM categories 
      WHERE parent_id = ? AND is_active = 1 
      ORDER BY sort_order
    `).bind(id).all();

    return c.json({
      success: true,
      data: {
        ...category,
        subcategories: subcategories.results,
      },
    });
  } catch (error) {
    console.error('[Categories API] Error fetching category:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch category',
    }, 500);
  }
});

/**
 * @api {get} /api/categories/main الحصول على الأقسام الرئيسية فقط
 * @apiName GetMainCategories
 * @apiGroup Categories
 * @apiDescription يجلب الأقسام الرئيسية بدون الفرعية
 */
app.get('/main', async (c) => {
  const { DB } = c.env;

  try {
    const categories = await DB.prepare(`
      SELECT * FROM categories 
      WHERE parent_id IS NULL AND is_active = 1 
      ORDER BY sort_order
    `).all();

    return c.json({
      success: true,
      data: categories.results,
    });
  } catch (error) {
    console.error('[Categories API] Error fetching main categories:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch main categories',
    }, 500);
  }
});

export default app;
