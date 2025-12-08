/**
 * @file api/countries.ts
 * @description نقاط نهاية API للدول
 * @description_en API endpoints for countries
 * @module api/countries
 * @version 1.0.0
 * @author Dueli Team
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';

/**
 * تطبيق Hono للدول
 */
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ============================================
// الحصول على الدول - Get Countries
// ============================================

/**
 * @api {get} /api/countries الحصول على قائمة الدول
 * @apiName GetCountries
 * @apiGroup Countries
 * @apiDescription يجلب قائمة الدول من قاعدة البيانات
 * 
 * @apiSuccess {Boolean} success حالة نجاح الطلب
 * @apiSuccess {Country[]} data قائمة الدول
 */
app.get('/', async (c) => {
  const { DB } = c.env;

  try {
    const result = await DB.prepare(
      'SELECT * FROM countries ORDER BY name_en'
    ).all();

    return c.json({
      success: true,
      data: result.results,
    });
  } catch (error) {
    console.error('[Countries API] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch countries',
    }, 500);
  }
});

export default app;
