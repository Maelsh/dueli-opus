/**
 * Users API Routes
 * مسارات API للمستخدمين
 */

import { Hono } from 'hono';
import type { Bindings, Variables, ApiResponse } from '../../../config/types';

const usersRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Get user profile - جلب ملف المستخدم
 * GET /api/users/:username
 */
usersRoutes.get('/:username', async (c) => {
  const { DB } = c.env;
  const username = c.req.param('username');

  try {
    const user = await DB.prepare(`
      SELECT id, username, display_name, avatar_url, bio, country, language,
             total_competitions, total_wins, total_views, average_rating, total_earnings,
             is_verified, created_at
      FROM users WHERE username = ?
    `).bind(username).first();

    if (!user) {
      return c.json<ApiResponse>({
        success: false,
        error: 'User not found'
      }, 404);
    }

    const followers = await DB.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').bind((user as any).id).first();
    const following = await DB.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').bind((user as any).id).first();

    const competitions = await DB.prepare(`
      SELECT c.*, 
             cat.name_ar as category_name_ar, 
             cat.name_en as category_name_en, 
             cat.icon as category_icon, 
             cat.color as category_color,
             cat.slug as category_slug
      FROM competitions c
      JOIN categories cat ON c.category_id = cat.id
      WHERE c.creator_id = ? OR c.opponent_id = ?
      ORDER BY c.created_at DESC
      LIMIT 10
    `).bind((user as any).id, (user as any).id).all();

    return c.json<ApiResponse>({
      success: true,
      data: {
        ...user,
        followers_count: (followers as any)?.count || 0,
        following_count: (following as any)?.count || 0,
        competitions: competitions.results
      }
    });
  } catch (error) {
    console.error('User fetch error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch user'
    }, 500);
  }
});

/**
 * Update user preferences - تحديث تفضيلات المستخدم
 * PUT /api/users/preferences
 */
usersRoutes.put('/preferences', async (c) => {
  const { DB } = c.env;
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '');

  if (!sessionId) {
    return c.json<ApiResponse>({
      success: false,
      error: 'Unauthorized'
    }, 401);
  }

  try {
    // Verify session
    const session = await DB.prepare('SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime("now")').bind(sessionId).first();

    if (!session) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Unauthorized'
      }, 401);
    }

    const body = await c.req.json();
    const { country, language } = body;

    if (!country || !language) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Missing required fields'
      }, 400);
    }

    // Update user
    await DB.prepare('UPDATE users SET country = ?, language = ? WHERE id = ?')
      .bind(country, language, (session as any).user_id)
      .run();

    return c.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error('Update preferences error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to update preferences'
    }, 500);
  }
});

/**
 * Get user's pending requests - جلب طلبات المستخدم المعلقة
 * GET /api/users/:id/requests
 */
usersRoutes.get('/:id/requests', async (c) => {
  const { DB } = c.env;
  const userId = c.req.param('id');

  try {
    const requests = await DB.prepare(`
      SELECT cr.*, c.title as competition_title, c.status as competition_status
      FROM competition_requests cr
      JOIN competitions c ON cr.competition_id = c.id
      WHERE cr.requester_id = ?
      ORDER BY cr.created_at DESC
    `).bind(userId).all();

    return c.json<ApiResponse>({
      success: true,
      data: requests.results
    });
  } catch (error) {
    console.error('User requests fetch error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to fetch requests'
    }, 500);
  }
});

/**
 * Follow user - متابعة مستخدم
 * POST /api/users/:id/follow
 */
usersRoutes.post('/:id/follow', async (c) => {
  const { DB } = c.env;
  const followingId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { follower_id } = body;

    await DB.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').bind(follower_id, followingId).run();

    return c.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error('Follow user error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to follow'
    }, 500);
  }
});

/**
 * Unfollow user - إلغاء متابعة مستخدم
 * DELETE /api/users/:id/follow
 */
usersRoutes.delete('/:id/follow', async (c) => {
  const { DB } = c.env;
  const followingId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { follower_id } = body;

    await DB.prepare('DELETE FROM follows WHERE follower_id = ? AND following_id = ?').bind(follower_id, followingId).run();

    return c.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error('Unfollow user error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to unfollow'
    }, 500);
  }
});

export default usersRoutes;
