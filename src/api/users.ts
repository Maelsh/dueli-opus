/**
 * @file api/users.ts
 * @description نقاط نهاية API للمستخدمين
 * @description_en API endpoints for users
 * @module api/users
 * @version 1.0.0
 * @author Dueli Team
 */

import { Hono } from 'hono';
import type { Bindings, Variables, User, UserPublic, ApiResponse } from '../types';

/**
 * تطبيق Hono للمستخدمين
 */
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ============================================
// الحصول على الملف الشخصي - Get Profile
// ============================================

/**
 * @api {get} /api/users/:username الحصول على ملف المستخدم
 * @apiName GetUserProfile
 * @apiGroup Users
 * @apiDescription يجلب الملف الشخصي العام للمستخدم
 * 
 * @apiParam {String} username اسم المستخدم
 * 
 * @apiSuccess {Boolean} success حالة نجاح الطلب
 * @apiSuccess {Object} data بيانات المستخدم
 */
app.get('/:username', async (c) => {
  const { DB } = c.env;
  const username = c.req.param('username');

  try {
    // جلب بيانات المستخدم الأساسية
    const user = await DB.prepare(`
      SELECT id, username, display_name, avatar_url, bio, country, language,
             total_competitions, total_wins, total_views, average_rating, total_earnings,
             is_verified, created_at
      FROM users WHERE username = ?
    `).bind(username).first() as UserPublic | null;

    if (!user) {
      return c.json({
        success: false,
        error: 'User not found',
      }, 404);
    }

    // جلب عدد المتابعين
    const followers = await DB.prepare(
      'SELECT COUNT(*) as count FROM follows WHERE following_id = ?'
    ).bind(user.id).first() as { count: number };

    // جلب عدد المتابَعين
    const following = await DB.prepare(
      'SELECT COUNT(*) as count FROM follows WHERE follower_id = ?'
    ).bind(user.id).first() as { count: number };

    // جلب آخر المنافسات
    const competitions = await DB.prepare(`
      SELECT c.*, cat.name_ar, cat.name_en, cat.icon, cat.color
      FROM competitions c
      JOIN categories cat ON c.category_id = cat.id
      WHERE c.creator_id = ? OR c.opponent_id = ?
      ORDER BY c.created_at DESC
      LIMIT 10
    `).bind(user.id, user.id).all();

    return c.json({
      success: true,
      data: {
        ...user,
        followers_count: followers?.count || 0,
        following_count: following?.count || 0,
        competitions: competitions.results,
      },
    });
  } catch (error) {
    console.error('[Users API] Error fetching profile:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch user',
    }, 500);
  }
});

// ============================================
// تحديث التفضيلات - Update Preferences
// ============================================

/**
 * @api {put} /api/users/preferences تحديث تفضيلات المستخدم
 * @apiName UpdatePreferences
 * @apiGroup Users
 * @apiDescription يحدث تفضيلات المستخدم (البلد واللغة)
 * 
 * @apiHeader {String} Authorization رمز الجلسة (Bearer token)
 * 
 * @apiBody {String} country كود البلد
 * @apiBody {String} language كود اللغة
 */
app.put('/preferences', async (c) => {
  const { DB } = c.env;
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '');

  if (!sessionId) {
    return c.json({
      success: false,
      error: 'Unauthorized',
    }, 401);
  }

  try {
    // التحقق من الجلسة
    const session = await DB.prepare(
      'SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime("now")'
    ).bind(sessionId).first() as { user_id: number } | null;

    if (!session) {
      return c.json({
        success: false,
        error: 'Unauthorized',
      }, 401);
    }

    const body = await c.req.json();
    const { country, language } = body;

    if (!country || !language) {
      return c.json({
        success: false,
        error: 'Missing required fields',
      }, 400);
    }

    // تحديث تفضيلات المستخدم
    await DB.prepare(
      'UPDATE users SET country = ?, language = ? WHERE id = ?'
    ).bind(country, language, session.user_id).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('[Users API] Error updating preferences:', error);
    return c.json({
      success: false,
      error: 'Failed to update preferences',
    }, 500);
  }
});

// ============================================
// الحصول على طلبات المستخدم - Get User Requests
// ============================================

/**
 * @api {get} /api/users/:id/requests الحصول على طلبات المستخدم
 * @apiName GetUserRequests
 * @apiGroup Users
 * @apiDescription يجلب طلبات الانضمام للمنافسات الخاصة بالمستخدم
 * 
 * @apiParam {Number} id معرف المستخدم
 */
app.get('/:id/requests', async (c) => {
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

    return c.json({
      success: true,
      data: requests.results,
    });
  } catch (error) {
    console.error('[Users API] Error fetching requests:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch requests',
    }, 500);
  }
});

// ============================================
// متابعة مستخدم - Follow User
// ============================================

/**
 * @api {post} /api/users/:id/follow متابعة مستخدم
 * @apiName FollowUser
 * @apiGroup Users
 * 
 * @apiParam {Number} id معرف المستخدم المراد متابعته
 * @apiBody {Number} follower_id معرف المستخدم المتابِع
 */
app.post('/:id/follow', async (c) => {
  const { DB } = c.env;
  const followingId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { follower_id } = body;

    if (!follower_id) {
      return c.json({
        success: false,
        error: 'Follower ID required',
      }, 400);
    }

    // إدراج المتابعة (تجاهل إذا موجودة)
    await DB.prepare(
      'INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)'
    ).bind(follower_id, followingId).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('[Users API] Error following user:', error);
    return c.json({
      success: false,
      error: 'Failed to follow',
    }, 500);
  }
});

// ============================================
// إلغاء متابعة مستخدم - Unfollow User
// ============================================

/**
 * @api {delete} /api/users/:id/follow إلغاء متابعة مستخدم
 * @apiName UnfollowUser
 * @apiGroup Users
 * 
 * @apiParam {Number} id معرف المستخدم
 * @apiBody {Number} follower_id معرف المستخدم المتابِع
 */
app.delete('/:id/follow', async (c) => {
  const { DB } = c.env;
  const followingId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { follower_id } = body;

    await DB.prepare(
      'DELETE FROM follows WHERE follower_id = ? AND following_id = ?'
    ).bind(follower_id, followingId).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('[Users API] Error unfollowing user:', error);
    return c.json({
      success: false,
      error: 'Failed to unfollow',
    }, 500);
  }
});

// ============================================
// التحقق من المتابعة - Check Following
// ============================================

/**
 * @api {get} /api/users/:id/following/:targetId التحقق من المتابعة
 * @apiName CheckFollowing
 * @apiGroup Users
 */
app.get('/:id/following/:targetId', async (c) => {
  const { DB } = c.env;
  const followerId = c.req.param('id');
  const followingId = c.req.param('targetId');

  try {
    const follow = await DB.prepare(
      'SELECT id FROM follows WHERE follower_id = ? AND following_id = ?'
    ).bind(followerId, followingId).first();

    return c.json({
      success: true,
      data: { isFollowing: !!follow },
    });
  } catch (error) {
    return c.json({
      success: false,
      error: 'Failed to check following status',
    }, 500);
  }
});

export default app;
