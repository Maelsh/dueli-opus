/**
 * Countries API Routes
 * مسارات API للدول
 */

import { Hono } from 'hono';
import type { Bindings, Variables, ApiResponse } from '../../../config/types';

const countriesRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Get all countries - جلب كل الدول
 * GET /api/countries
 */
countriesRoutes.get('/', async (c) => {
  const { DB } = c.env;
  
  try {
    const result = await DB.prepare('SELECT * FROM countries ORDER BY name_en').all();
    return c.json<ApiResponse>({ 
      success: true, 
      data: result.results 
    });
  } catch (error) {
    console.error('Countries fetch error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to fetch countries' 
    }, 500);
  }
});

/**
 * Get country by code - جلب دولة بالرمز
 * GET /api/countries/:code
 */
countriesRoutes.get('/:code', async (c) => {
  const { DB } = c.env;
  const code = c.req.param('code').toUpperCase();
  
  try {
    const country = await DB.prepare('SELECT * FROM countries WHERE code = ?').bind(code).first();
    
    if (!country) {
      return c.json<ApiResponse>({ 
        success: false, 
        error: 'Country not found' 
      }, 404);
    }
    
    return c.json<ApiResponse>({ 
      success: true, 
      data: country 
    });
  } catch (error) {
    console.error('Country fetch error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to fetch country' 
    }, 500);
  }
});

export default countriesRoutes;
