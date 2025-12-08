/**
 * Notifications API Routes
 * مسارات API للإشعارات
 */

import { Hono } from 'hono';
import type { Bindings, Variables, ApiResponse, Notification } from '../../../config/types';

const notificationsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Get user notifications - جلب إشعارات المستخدم
 * GET /api/notifications
 */
notificationsRoutes.get('/', async (c) => {
  const { DB } = c.env;
  const userId = c.req.query('user_id');

  if (!userId) {
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'User ID required' 
    }, 400);
  }

  try {
    const notifications = await DB.prepare(`
      SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
    `).bind(userId).all();

    return c.json<ApiResponse<Notification[]>>({ 
      success: true, 
      data: notifications.results as unknown as Notification[] 
    });
  } catch (error) {
    console.error('Notifications fetch error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to fetch notifications' 
    }, 500);
  }
});

/**
 * Mark notification as read - تعليم الإشعار كمقروء
 * PUT /api/notifications/:id/read
 */
notificationsRoutes.put('/:id/read', async (c) => {
  const { DB } = c.env;
  const notificationId = c.req.param('id');

  try {
    await DB.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').bind(notificationId).run();

    return c.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error('Mark notification read error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to mark notification as read' 
    }, 500);
  }
});

/**
 * Mark all notifications as read - تعليم كل الإشعارات كمقروءة
 * PUT /api/notifications/read-all
 */
notificationsRoutes.put('/read-all', async (c) => {
  const { DB } = c.env;
  const userId = c.req.query('user_id');

  if (!userId) {
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'User ID required' 
    }, 400);
  }

  try {
    await DB.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').bind(userId).run();

    return c.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to mark all notifications as read' 
    }, 500);
  }
});

/**
 * Delete notification - حذف إشعار
 * DELETE /api/notifications/:id
 */
notificationsRoutes.delete('/:id', async (c) => {
  const { DB } = c.env;
  const notificationId = c.req.param('id');

  try {
    await DB.prepare('DELETE FROM notifications WHERE id = ?').bind(notificationId).run();

    return c.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error('Delete notification error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to delete notification' 
    }, 500);
  }
});

/**
 * Get unread notifications count - جلب عدد الإشعارات غير المقروءة
 * GET /api/notifications/unread-count
 */
notificationsRoutes.get('/unread-count', async (c) => {
  const { DB } = c.env;
  const userId = c.req.query('user_id');

  if (!userId) {
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'User ID required' 
    }, 400);
  }

  try {
    const result = await DB.prepare('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0').bind(userId).first();

    return c.json<ApiResponse>({ 
      success: true, 
      data: { count: (result as any)?.count || 0 } 
    });
  } catch (error) {
    console.error('Unread count fetch error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to fetch unread count' 
    }, 500);
  }
});

export default notificationsRoutes;
