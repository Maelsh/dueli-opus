/**
 * Categories API Routes
 * مسارات API للفئات
 */

import { Hono } from 'hono';
import type { Bindings, Variables, ApiResponse, Category } from '../../../config/types';

const categoriesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Get all categories - جلب كل الفئات
 * GET /api/categories
 */
categoriesRoutes.get('/', async (c) => {
  const { DB } = c.env;
  
  try {
    const categories = await DB.prepare(`
      SELECT c.*, p.name_ar as parent_name_ar, p.name_en as parent_name_en
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE c.is_active = 1
      ORDER BY c.parent_id NULLS FIRST, c.sort_order
    `).all();
    
    return c.json<ApiResponse<Category[]>>({ 
      success: true, 
      data: categories.results as unknown as Category[] 
    });
  } catch (error) {
    console.error('Categories fetch error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to fetch categories' 
    }, 500);
  }
});

/**
 * Get category by ID - جلب فئة بالمعرف
 * GET /api/categories/:id
 */
categoriesRoutes.get('/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');
  
  try {
    const category = await DB.prepare(`
      SELECT c.*, p.name_ar as parent_name_ar, p.name_en as parent_name_en
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE c.id = ?
    `).bind(id).first();
    
    if (!category) {
      return c.json<ApiResponse>({ 
        success: false, 
        error: 'Category not found' 
      }, 404);
    }
    
    return c.json<ApiResponse<Category>>({ 
      success: true, 
      data: category as unknown as Category 
    });
  } catch (error) {
    console.error('Category fetch error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to fetch category' 
    }, 500);
  }
});

/**
 * Get subcategories - جلب الفئات الفرعية
 * GET /api/categories/:id/subcategories
 */
categoriesRoutes.get('/:id/subcategories', async (c) => {
  const { DB } = c.env;
  const parentId = c.req.param('id');
  
  try {
    const subcategories = await DB.prepare(`
      SELECT * FROM categories
      WHERE parent_id = ? AND is_active = 1
      ORDER BY sort_order
    `).bind(parentId).all();
    
    return c.json<ApiResponse<Category[]>>({ 
      success: true, 
      data: subcategories.results as unknown as Category[] 
    });
  } catch (error) {
    console.error('Subcategories fetch error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to fetch subcategories' 
    }, 500);
  }
});

export default categoriesRoutes;
