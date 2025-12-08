/**
 * @file api/notifications.ts
 * @description نقاط نهاية API للإشعارات
 * @description_en API endpoints for notifications
 * @module api/notifications
 * @version 1.0.0
 * @author Dueli Team
 */

import { Hono } from 'hono';
import type { Bindings, Variables, Notification, ApiResponse } from '../types';

/**
 * تطبيق Hono للإشعارات
 */
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ============================================
// الحصول على الإشعارات - Get Notifications
// ============================================

/**
 * @api {get} /api/notifications الحصول على إشعارات المستخدم
 * @apiName GetNotifications
 * @apiGroup Notifications
 * @apiDescription يجلب إشعارات المستخدم
 * 
 * @apiQuery {Number} user_id معرف المستخدم (مطلوب)
 * @apiQuery {Number} [limit=50] عدد النتائج
 * @apiQuery {Boolean} [unread_only=false] الإشعارات غير المقروءة فقط
 * 
 * @apiSuccess {Boolean} success حالة نجاح الطلب
 * @apiSuccess {Notification[]} data قائمة الإشعارات
 */
app.get('/', async (c) => {
  const { DB } = c.env;
  const userId = c.req.query('user_id');
  const limit = parseInt(c.req.query('limit') || '50');
  const unreadOnly = c.req.query('unread_only') === 'true';

  if (!userId) {
    return c.json({
      success: false,
      error: 'User ID required',
    }, 400);
  }

  try {
    let query = `
      SELECT * FROM notifications 
      WHERE user_id = ?
    `;
    const params: any[] = [userId];

    if (unreadOnly) {
      query += ' AND is_read = 0';
    }

    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    const notifications = await DB.prepare(query).bind(...params).all();

    return c.json({
      success: true,
      data: notifications.results as Notification[],
    });
  } catch (error) {
    console.error('[Notifications API] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch notifications',
    }, 500);
  }
});

// ============================================
// عدد الإشعارات غير المقروءة - Unread Count
// ============================================

/**
 * @api {get} /api/notifications/unread-count عدد الإشعارات غير المقروءة
 * @apiName GetUnreadCount
 * @apiGroup Notifications
 */
app.get('/unread-count', async (c) => {
  const { DB } = c.env;
  const userId = c.req.query('user_id');

  if (!userId) {
    return c.json({
      success: false,
      error: 'User ID required',
    }, 400);
  }

  try {
    const result = await DB.prepare(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0'
    ).bind(userId).first() as { count: number };

    return c.json({
      success: true,
      data: { count: result?.count || 0 },
    });
  } catch (error) {
    console.error('[Notifications API] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to get unread count',
    }, 500);
  }
});

// ============================================
// تحديد الإشعار كمقروء - Mark as Read
// ============================================

/**
 * @api {put} /api/notifications/:id/read تحديد الإشعار كمقروء
 * @apiName MarkAsRead
 * @apiGroup Notifications
 */
app.put('/:id/read', async (c) => {
  const { DB } = c.env;
  const notificationId = c.req.param('id');

  try {
    await DB.prepare(
      'UPDATE notifications SET is_read = 1 WHERE id = ?'
    ).bind(notificationId).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('[Notifications API] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to mark as read',
    }, 500);
  }
});

// ============================================
// تحديد جميع الإشعارات كمقروءة - Mark All as Read
// ============================================

/**
 * @api {put} /api/notifications/read-all تحديد جميع الإشعارات كمقروءة
 * @apiName MarkAllAsRead
 * @apiGroup Notifications
 */
app.put('/read-all', async (c) => {
  const { DB } = c.env;
  const userId = c.req.query('user_id');

  if (!userId) {
    return c.json({
      success: false,
      error: 'User ID required',
    }, 400);
  }

  try {
    await DB.prepare(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ?'
    ).bind(userId).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('[Notifications API] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to mark all as read',
    }, 500);
  }
});

// ============================================
// حذف إشعار - Delete Notification
// ============================================

/**
 * @api {delete} /api/notifications/:id حذف إشعار
 * @apiName DeleteNotification
 * @apiGroup Notifications
 */
app.delete('/:id', async (c) => {
  const { DB } = c.env;
  const notificationId = c.req.param('id');

  try {
    await DB.prepare(
      'DELETE FROM notifications WHERE id = ?'
    ).bind(notificationId).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('[Notifications API] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to delete notification',
    }, 500);
  }
});

export default app;
