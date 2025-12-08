/**
 * @file api/index.ts
 * @description نقطة الدخول الرئيسية لجميع API Routes
 * @description_en Main entry point for all API routes
 * @module api
 * @version 1.0.0
 * @author Dueli Team
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../types';

// استيراد الـ routes
import categoriesRoutes from './categories';
import competitionsRoutes from './competitions';
import authRoutes from './auth';
import usersRoutes from './users';
import notificationsRoutes from './notifications';
import countriesRoutes from './countries';
import jitsiRoutes from '../routes/jitsi';

/**
 * تطبيق Hono الرئيسي للـ API
 */
const api = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ============================================
// تركيب الـ Routes - Mount Routes
// ============================================

/**
 * @route /api/categories
 * @description نقاط نهاية الأقسام
 */
api.route('/categories', categoriesRoutes);

/**
 * @route /api/competitions
 * @description نقاط نهاية المنافسات
 */
api.route('/competitions', competitionsRoutes);

/**
 * @route /api/auth
 * @description نقاط نهاية المصادقة
 */
api.route('/auth', authRoutes);

/**
 * @route /api/users
 * @description نقاط نهاية المستخدمين
 */
api.route('/users', usersRoutes);

/**
 * @route /api/notifications
 * @description نقاط نهاية الإشعارات
 */
api.route('/notifications', notificationsRoutes);

/**
 * @route /api/countries
 * @description نقاط نهاية الدول
 */
api.route('/countries', countriesRoutes);

/**
 * @route /api/jitsi
 * @description نقاط نهاية Jitsi للبث المباشر
 */
api.route('/jitsi', jitsiRoutes);

// ============================================
// نقاط نهاية إضافية - Additional Endpoints
// ============================================

/**
 * @api {get} /api/health فحص صحة الـ API
 * @apiName HealthCheck
 * @apiGroup System
 */
api.get('/health', (c) => {
  return c.json({
    success: true,
    status: 'healthy',
    timestamp: new Date().toISOString(),
  });
});

/**
 * @api {get} /api/version إصدار الـ API
 * @apiName GetVersion
 * @apiGroup System
 */
api.get('/version', (c) => {
  return c.json({
    success: true,
    version: '1.0.0',
    name: 'Dueli API',
  });
});

export default api;
