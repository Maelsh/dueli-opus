/**
 * @file api/competitions.ts
 * @description نقاط نهاية API للمنافسات
 * @description_en API endpoints for competitions
 * @module api/competitions
 * @version 1.0.0
 * @author Dueli Team
 */

import { Hono } from 'hono';
import type { Bindings, Variables, Competition, CompetitionWithDetails, ApiResponse } from '../types';
import { t } from '../i18n';

/**
 * تطبيق Hono للمنافسات
 */
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ============================================
// الحصول على المنافسات - Get Competitions
// ============================================

/**
 * @api {get} /api/competitions الحصول على قائمة المنافسات
 * @apiName GetCompetitions
 * @apiGroup Competitions
 * @apiDescription يجلب قائمة المنافسات مع فلاتر متعددة
 * 
 * @apiQuery {String} [status=all] حالة المنافسة (all, live, recorded, pending)
 * @apiQuery {String} [category] معرف أو slug القسم
 * @apiQuery {String} [country] كود البلد
 * @apiQuery {String} [language] كود اللغة
 * @apiQuery {String} [search] نص البحث
 * @apiQuery {Number} [limit=20] عدد النتائج
 * @apiQuery {Number} [offset=0] بداية النتائج
 */
app.get('/', async (c) => {
  const { DB } = c.env;
  
  // استخراج المعاملات من الطلب
  const status = c.req.query('status') || 'all';
  const category = c.req.query('category');
  const country = c.req.query('country');
  const language = c.req.query('language');
  const search = c.req.query('search');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
    // بناء الاستعلام الأساسي
    let query = `
      SELECT c.*, 
             cat.name_ar as category_name_ar,
             cat.name_en as category_name_en,
             cat.icon as category_icon,
             cat.color as category_color,
             cat.slug as category_slug,
             subcat.name_ar as subcategory_name_ar,
             subcat.name_en as subcategory_name_en,
             subcat.color as subcategory_color,
             u1.display_name as creator_name,
             u1.avatar_url as creator_avatar,
             u1.username as creator_username,
             u2.display_name as opponent_name,
             u2.avatar_url as opponent_avatar,
             u2.username as opponent_username
      FROM competitions c
      JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
      JOIN users u1 ON c.creator_id = u1.id
      LEFT JOIN users u2 ON c.opponent_id = u2.id
      WHERE 1=1
    `;
    const params: any[] = [];

    // تطبيق فلتر الحالة
    if (status !== 'all') {
      if (status === 'live') {
        query += ' AND c.status = ?';
        params.push('live');
      } else if (status === 'recorded') {
        query += ' AND c.status = ?';
        params.push('completed');
      } else if (status === 'pending') {
        query += ' AND c.status = ?';
        params.push('pending');
      }
    }

    // تطبيق فلتر القسم
    if (category) {
      query += ' AND (c.category_id = ? OR c.subcategory_id = ? OR cat.slug = ?)';
      params.push(category, category, category);
    }

    // تطبيق فلتر البلد
    if (country) {
      query += ' AND c.country = ?';
      params.push(country);
    }

    // تطبيق فلتر اللغة
    if (language) {
      query += ' AND c.language = ?';
      params.push(language);
    }

    // تطبيق فلتر البحث
    if (search) {
      query += ' AND (c.title LIKE ? OR c.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // الترتيب: المباشر أولاً، ثم المعلق، ثم حسب المشاهدات والتاريخ
    query += ` ORDER BY 
      CASE WHEN c.status = "live" THEN 0 
           WHEN c.status = "pending" THEN 1 
           ELSE 2 END, 
      c.total_views DESC, 
      c.created_at DESC 
      LIMIT ? OFFSET ?`;
    params.push(limit, offset);

    const competitions = await DB.prepare(query).bind(...params).all();

    return c.json({
      success: true,
      data: competitions.results,
    });
  } catch (error) {
    console.error('[Competitions API] Error:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch competitions',
    }, 500);
  }
});

// ============================================
// الحصول على منافسة واحدة - Get Single Competition
// ============================================

/**
 * @api {get} /api/competitions/:id الحصول على منافسة محددة
 * @apiName GetCompetition
 * @apiGroup Competitions
 * @apiDescription يجلب تفاصيل منافسة محددة مع التعليقات والتقييمات والطلبات
 * 
 * @apiParam {Number} id معرف المنافسة
 */
app.get('/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');

  try {
    // جلب بيانات المنافسة الأساسية
    const competition = await DB.prepare(`
      SELECT c.*, 
             cat.name_ar as category_name_ar,
             cat.name_en as category_name_en,
             cat.icon as category_icon,
             cat.color as category_color,
             subcat.name_ar as subcategory_name_ar,
             subcat.name_en as subcategory_name_en,
             u1.display_name as creator_name,
             u1.avatar_url as creator_avatar,
             u1.username as creator_username,
             u1.bio as creator_bio,
             u2.display_name as opponent_name,
             u2.avatar_url as opponent_avatar,
             u2.username as opponent_username,
             u2.bio as opponent_bio
      FROM competitions c
      JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
      JOIN users u1 ON c.creator_id = u1.id
      LEFT JOIN users u2 ON c.opponent_id = u2.id
      WHERE c.id = ?
    `).bind(id).first();

    if (!competition) {
      return c.json({
        success: false,
        error: 'Competition not found',
      }, 404);
    }

    // زيادة عداد المشاهدات
    await DB.prepare(
      'UPDATE competitions SET total_views = total_views + 1 WHERE id = ?'
    ).bind(id).run();

    // جلب التعليقات
    const comments = await DB.prepare(`
      SELECT cm.*, u.display_name, u.avatar_url, u.username
      FROM comments cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.competition_id = ?
      ORDER BY cm.created_at DESC
      LIMIT 100
    `).bind(id).all();

    // جلب ملخص التقييمات
    const ratings = await DB.prepare(`
      SELECT competitor_id, AVG(rating) as avg_rating, COUNT(*) as count
      FROM ratings
      WHERE competition_id = ?
      GROUP BY competitor_id
    `).bind(id).all();

    // جلب طلبات الانضمام
    const requests = await DB.prepare(`
      SELECT cr.*, u.display_name, u.avatar_url, u.username
      FROM competition_requests cr
      JOIN users u ON cr.requester_id = u.id
      WHERE cr.competition_id = ?
      ORDER BY cr.created_at DESC
    `).bind(id).all();

    return c.json({
      success: true,
      data: {
        ...competition,
        comments: comments.results,
        ratings: ratings.results,
        requests: requests.results,
      } as CompetitionWithDetails,
    });
  } catch (error) {
    console.error('[Competitions API] Error fetching competition:', error);
    return c.json({
      success: false,
      error: 'Failed to fetch competition',
    }, 500);
  }
});

// ============================================
// إنشاء منافسة - Create Competition
// ============================================

/**
 * @api {post} /api/competitions إنشاء منافسة جديدة
 * @apiName CreateCompetition
 * @apiGroup Competitions
 * @apiDescription ينشئ منافسة جديدة
 * 
 * @apiBody {String} title عنوان المنافسة (مطلوب)
 * @apiBody {String} [description] وصف المنافسة
 * @apiBody {String} rules قوانين المنافسة (مطلوب)
 * @apiBody {Number} category_id معرف القسم (مطلوب)
 * @apiBody {Number} [subcategory_id] معرف القسم الفرعي
 * @apiBody {Number} creator_id معرف المنشئ (مطلوب)
 * @apiBody {String} [language=ar] لغة المنافسة
 * @apiBody {String} [country] بلد المنافسة
 * @apiBody {String} [scheduled_at] موعد البدء المجدول
 */
app.post('/', async (c) => {
  const { DB } = c.env;

  try {
    const body = await c.req.json();
    const { 
      title, 
      description, 
      rules, 
      category_id, 
      subcategory_id, 
      creator_id, 
      language, 
      country, 
      scheduled_at 
    } = body;

    // التحقق من الحقول المطلوبة
    if (!title || !rules || !category_id || !creator_id) {
      return c.json({
        success: false,
        error: 'Missing required fields',
      }, 400);
    }

    // إدراج المنافسة
    const result = await DB.prepare(`
      INSERT INTO competitions (
        title, description, rules, category_id, subcategory_id, 
        creator_id, language, country, scheduled_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      title,
      description || null,
      rules,
      category_id,
      subcategory_id || null,
      creator_id,
      language || 'ar',
      country || null,
      scheduled_at || null
    ).run();

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
    });
  } catch (error) {
    console.error('[Competitions API] Error creating competition:', error);
    return c.json({
      success: false,
      error: 'Failed to create competition',
    }, 500);
  }
});

// ============================================
// طلب الانضمام - Request to Join
// ============================================

/**
 * @api {post} /api/competitions/:id/request إرسال طلب انضمام
 * @apiName RequestJoin
 * @apiGroup Competitions
 */
app.post('/:id/request', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');
  const lang = c.get('lang') || 'ar';

  try {
    const body = await c.req.json();
    const { requester_id, message } = body;

    if (!requester_id) {
      return c.json({
        success: false,
        error: 'Requester ID required',
      }, 400);
    }

    // التحقق من عدم وجود طلب سابق
    const existing = await DB.prepare(`
      SELECT id FROM competition_requests 
      WHERE competition_id = ? AND requester_id = ? AND status = 'pending'
    `).bind(competitionId, requester_id).first();

    if (existing) {
      return c.json({
        success: false,
        error: 'Already requested',
      }, 400);
    }

    // إدراج الطلب
    const result = await DB.prepare(`
      INSERT INTO competition_requests (competition_id, requester_id, message)
      VALUES (?, ?, ?)
    `).bind(competitionId, requester_id, message || null).run();

    // إنشاء إشعار لمنشئ المنافسة
    const comp = await DB.prepare(
      'SELECT creator_id, title FROM competitions WHERE id = ?'
    ).bind(competitionId).first() as any;

    if (comp) {
      await DB.prepare(`
        INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
        VALUES (?, 'request', ?, ?, 'competition', ?)
      `).bind(
        comp.creator_id,
        t('notifications.new_join_request', lang),
        `${t('notifications.join_request_message', lang)} ${comp.title}`,
        competitionId
      ).run();
    }

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
    });
  } catch (error) {
    console.error('[Competitions API] Error sending request:', error);
    return c.json({
      success: false,
      error: 'Failed to send request',
    }, 500);
  }
});

// ============================================
// إلغاء طلب الانضمام - Cancel Join Request
// ============================================

/**
 * @api {delete} /api/competitions/:id/request إلغاء طلب الانضمام
 * @apiName CancelRequest
 * @apiGroup Competitions
 */
app.delete('/:id/request', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { requester_id } = body;

    await DB.prepare(`
      DELETE FROM competition_requests 
      WHERE competition_id = ? AND requester_id = ? AND status = 'pending'
    `).bind(competitionId, requester_id).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('[Competitions API] Error cancelling request:', error);
    return c.json({
      success: false,
      error: 'Failed to cancel request',
    }, 500);
  }
});

// ============================================
// قبول طلب الانضمام - Accept Join Request
// ============================================

/**
 * @api {post} /api/competitions/:id/accept-request قبول طلب الانضمام
 * @apiName AcceptRequest
 * @apiGroup Competitions
 */
app.post('/:id/accept-request', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');
  const lang = c.get('lang') || 'ar';

  try {
    const body = await c.req.json();
    const { request_id, requester_id } = body;

    // تحديث حالة الطلب
    await DB.prepare(`
      UPDATE competition_requests 
      SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(request_id).run();

    // تعيين المنافس وتحديث حالة المنافسة
    await DB.prepare(`
      UPDATE competitions 
      SET opponent_id = ?, status = 'accepted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(requester_id, competitionId).run();

    // رفض الطلبات الأخرى المعلقة
    await DB.prepare(`
      UPDATE competition_requests 
      SET status = 'declined', responded_at = CURRENT_TIMESTAMP
      WHERE competition_id = ? AND id != ? AND status = 'pending'
    `).bind(competitionId, request_id).run();

    // إشعار المستخدم المقبول
    await DB.prepare(`
      INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
      VALUES (?, 'accepted', ?, ?, 'competition', ?)
    `).bind(
      requester_id,
      t('notifications.request_accepted', lang),
      t('notifications.request_accepted_message', lang),
      competitionId
    ).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('[Competitions API] Error accepting request:', error);
    return c.json({
      success: false,
      error: 'Failed to accept request',
    }, 500);
  }
});

// ============================================
// بدء المنافسة - Start Competition
// ============================================

/**
 * @api {post} /api/competitions/:id/start بدء البث المباشر
 * @apiName StartCompetition
 * @apiGroup Competitions
 */
app.post('/:id/start', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { youtube_live_id } = body;

    await DB.prepare(`
      UPDATE competitions 
      SET status = 'live', 
          started_at = CURRENT_TIMESTAMP, 
          youtube_live_id = ?, 
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(youtube_live_id || null, competitionId).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('[Competitions API] Error starting competition:', error);
    return c.json({
      success: false,
      error: 'Failed to start competition',
    }, 500);
  }
});

// ============================================
// إنهاء المنافسة - End Competition
// ============================================

/**
 * @api {post} /api/competitions/:id/end إنهاء المنافسة
 * @apiName EndCompetition
 * @apiGroup Competitions
 */
app.post('/:id/end', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { youtube_video_url } = body;

    await DB.prepare(`
      UPDATE competitions 
      SET status = 'completed', 
          ended_at = CURRENT_TIMESTAMP, 
          youtube_video_url = ?, 
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(youtube_video_url, competitionId).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('[Competitions API] Error ending competition:', error);
    return c.json({
      success: false,
      error: 'Failed to end competition',
    }, 500);
  }
});

// ============================================
// إضافة تعليق - Add Comment
// ============================================

/**
 * @api {post} /api/competitions/:id/comments إضافة تعليق
 * @apiName AddComment
 * @apiGroup Competitions
 */
app.post('/:id/comments', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { user_id, content, is_live } = body;

    if (!user_id || !content) {
      return c.json({
        success: false,
        error: 'Missing required fields',
      }, 400);
    }

    // إدراج التعليق
    const result = await DB.prepare(`
      INSERT INTO comments (competition_id, user_id, content, is_live)
      VALUES (?, ?, ?, ?)
    `).bind(competitionId, user_id, content, is_live ? 1 : 0).run();

    // تحديث عداد التعليقات
    await DB.prepare(
      'UPDATE competitions SET total_comments = total_comments + 1 WHERE id = ?'
    ).bind(competitionId).run();

    return c.json({
      success: true,
      data: { id: result.meta.last_row_id },
    });
  } catch (error) {
    console.error('[Competitions API] Error adding comment:', error);
    return c.json({
      success: false,
      error: 'Failed to add comment',
    }, 500);
  }
});

// ============================================
// إضافة تقييم - Add Rating
// ============================================

/**
 * @api {post} /api/competitions/:id/rate إضافة تقييم
 * @apiName AddRating
 * @apiGroup Competitions
 */
app.post('/:id/rate', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { user_id, competitor_id, rating } = body;

    if (!user_id || !competitor_id || !rating || rating < 1 || rating > 5) {
      return c.json({
        success: false,
        error: 'Invalid rating data',
      }, 400);
    }

    // إدراج أو تحديث التقييم
    await DB.prepare(`
      INSERT OR REPLACE INTO ratings (competition_id, user_id, competitor_id, rating)
      VALUES (?, ?, ?, ?)
    `).bind(competitionId, user_id, competitor_id, rating).run();

    return c.json({ success: true });
  } catch (error) {
    console.error('[Competitions API] Error adding rating:', error);
    return c.json({
      success: false,
      error: 'Failed to add rating',
    }, 500);
  }
});

export default app;
