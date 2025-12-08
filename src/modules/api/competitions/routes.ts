/**
 * Competitions API Routes
 * مسارات API للمنافسات
 */

import { Hono } from 'hono';
import type { Bindings, Variables, ApiResponse, Competition } from '../../../config/types';

const competitionsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Get competitions with filters - جلب المنافسات مع الفلاتر
 * GET /api/competitions
 */
competitionsRoutes.get('/', async (c) => {
  const { DB } = c.env;
  const status = c.req.query('status') || 'all';
  const category = c.req.query('category');
  const country = c.req.query('country');
  const language = c.req.query('language');
  const search = c.req.query('search');
  const limit = parseInt(c.req.query('limit') || '20');
  const offset = parseInt(c.req.query('offset') || '0');

  try {
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

    // Status filter
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

    // Category filter
    if (category) {
      query += ' AND (c.category_id = ? OR c.subcategory_id = ? OR cat.slug = ?)';
      params.push(category, category, category);
    }

    // Country filter
    if (country) {
      query += ' AND c.country = ?';
      params.push(country);
    }

    // Language filter
    if (language) {
      query += ' AND c.language = ?';
      params.push(language);
    }

    // Search filter
    if (search) {
      query += ' AND (c.title LIKE ? OR c.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    // Order and pagination
    query += ' ORDER BY CASE WHEN c.status = "live" THEN 0 WHEN c.status = "pending" THEN 1 ELSE 2 END, c.total_views DESC, c.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const competitions = await DB.prepare(query).bind(...params).all();
    
    return c.json<ApiResponse>({ 
      success: true, 
      data: competitions.results 
    });
  } catch (error) {
    console.error('Competitions fetch error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to fetch competitions' 
    }, 500);
  }
});

/**
 * Get single competition - جلب منافسة واحدة
 * GET /api/competitions/:id
 */
competitionsRoutes.get('/:id', async (c) => {
  const { DB } = c.env;
  const id = c.req.param('id');

  try {
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
      return c.json<ApiResponse>({ 
        success: false, 
        error: 'Competition not found' 
      }, 404);
    }

    // Increment views
    await DB.prepare('UPDATE competitions SET total_views = total_views + 1 WHERE id = ?').bind(id).run();

    // Get comments
    const comments = await DB.prepare(`
      SELECT cm.*, u.display_name, u.avatar_url, u.username
      FROM comments cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.competition_id = ?
      ORDER BY cm.created_at DESC
      LIMIT 100
    `).bind(id).all();

    // Get ratings summary
    const ratings = await DB.prepare(`
      SELECT competitor_id, AVG(rating) as avg_rating, COUNT(*) as count
      FROM ratings
      WHERE competition_id = ?
      GROUP BY competitor_id
    `).bind(id).all();

    // Get join requests
    const requests = await DB.prepare(`
      SELECT cr.*, u.display_name, u.avatar_url, u.username
      FROM competition_requests cr
      JOIN users u ON cr.requester_id = u.id
      WHERE cr.competition_id = ?
      ORDER BY cr.created_at DESC
    `).bind(id).all();

    return c.json<ApiResponse>({
      success: true,
      data: {
        ...competition,
        comments: comments.results,
        ratings: ratings.results,
        requests: requests.results
      }
    });
  } catch (error) {
    console.error('Competition fetch error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to fetch competition' 
    }, 500);
  }
});

/**
 * Create competition - إنشاء منافسة
 * POST /api/competitions
 */
competitionsRoutes.post('/', async (c) => {
  const { DB } = c.env;

  try {
    const body = await c.req.json();
    const { title, description, rules, category_id, subcategory_id, creator_id, language, country, scheduled_at } = body;

    if (!title || !rules || !category_id || !creator_id) {
      return c.json<ApiResponse>({ 
        success: false, 
        error: 'Missing required fields' 
      }, 400);
    }

    const result = await DB.prepare(`
      INSERT INTO competitions (title, description, rules, category_id, subcategory_id, creator_id, language, country, scheduled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(title, description, rules, category_id, subcategory_id || null, creator_id, language || 'ar', country, scheduled_at || null).run();

    return c.json<ApiResponse>({ 
      success: true, 
      data: { id: result.meta.last_row_id } 
    });
  } catch (error) {
    console.error('Competition create error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to create competition' 
    }, 500);
  }
});

/**
 * Request to join competition - طلب الانضمام للمنافسة
 * POST /api/competitions/:id/request
 */
competitionsRoutes.post('/:id/request', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { requester_id, message } = body;

    if (!requester_id) {
      return c.json<ApiResponse>({ 
        success: false, 
        error: 'Requester ID required' 
      }, 400);
    }

    // Check if already requested
    const existing = await DB.prepare(`
      SELECT id FROM competition_requests 
      WHERE competition_id = ? AND requester_id = ? AND status = 'pending'
    `).bind(competitionId, requester_id).first();

    if (existing) {
      return c.json<ApiResponse>({ 
        success: false, 
        error: 'Already requested' 
      }, 400);
    }

    const result = await DB.prepare(`
      INSERT INTO competition_requests (competition_id, requester_id, message)
      VALUES (?, ?, ?)
    `).bind(competitionId, requester_id, message || null).run();

    // Create notification for competition creator
    const comp = await DB.prepare('SELECT creator_id, title FROM competitions WHERE id = ?').bind(competitionId).first() as any;
    if (comp) {
      await DB.prepare(`
        INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
        VALUES (?, 'request', 'طلب انضمام جديد', ?, 'competition', ?)
      `).bind(comp.creator_id, `طلب انضمام للمنافسة: ${comp.title}`, competitionId).run();
    }

    return c.json<ApiResponse>({ 
      success: true, 
      data: { id: result.meta.last_row_id } 
    });
  } catch (error) {
    console.error('Request join error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to send request' 
    }, 500);
  }
});

/**
 * Cancel join request - إلغاء طلب الانضمام
 * DELETE /api/competitions/:id/request
 */
competitionsRoutes.delete('/:id/request', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { requester_id } = body;

    await DB.prepare(`
      DELETE FROM competition_requests 
      WHERE competition_id = ? AND requester_id = ? AND status = 'pending'
    `).bind(competitionId, requester_id).run();

    return c.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error('Cancel request error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to cancel request' 
    }, 500);
  }
});

/**
 * Accept join request - قبول طلب الانضمام
 * POST /api/competitions/:id/accept-request
 */
competitionsRoutes.post('/:id/accept-request', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { request_id, requester_id } = body;

    // Update request status
    await DB.prepare(`
      UPDATE competition_requests SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(request_id).run();

    // Set opponent
    await DB.prepare(`
      UPDATE competitions SET opponent_id = ?, status = 'accepted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(requester_id, competitionId).run();

    // Decline other requests
    await DB.prepare(`
      UPDATE competition_requests SET status = 'declined', responded_at = CURRENT_TIMESTAMP
      WHERE competition_id = ? AND id != ? AND status = 'pending'
    `).bind(competitionId, request_id).run();

    // Notify accepted user
    await DB.prepare(`
      INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
      VALUES (?, 'accepted', 'تم قبول طلبك', 'تم قبول طلبك للانضمام للمنافسة', 'competition', ?)
    `).bind(requester_id, competitionId).run();

    return c.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error('Accept request error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to accept request' 
    }, 500);
  }
});

/**
 * Start live competition - بدء المنافسة المباشرة
 * POST /api/competitions/:id/start
 */
competitionsRoutes.post('/:id/start', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { youtube_live_id } = body;

    await DB.prepare(`
      UPDATE competitions 
      SET status = 'live', started_at = CURRENT_TIMESTAMP, youtube_live_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(youtube_live_id || null, competitionId).run();

    return c.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error('Start competition error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to start competition' 
    }, 500);
  }
});

/**
 * End competition - إنهاء المنافسة
 * POST /api/competitions/:id/end
 */
competitionsRoutes.post('/:id/end', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { youtube_video_url } = body;

    await DB.prepare(`
      UPDATE competitions 
      SET status = 'completed', ended_at = CURRENT_TIMESTAMP, youtube_video_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(youtube_video_url, competitionId).run();

    return c.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error('End competition error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to end competition' 
    }, 500);
  }
});

/**
 * Add comment - إضافة تعليق
 * POST /api/competitions/:id/comments
 */
competitionsRoutes.post('/:id/comments', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { user_id, content, is_live } = body;

    if (!user_id || !content) {
      return c.json<ApiResponse>({ 
        success: false, 
        error: 'Missing required fields' 
      }, 400);
    }

    const result = await DB.prepare(`
      INSERT INTO comments (competition_id, user_id, content, is_live)
      VALUES (?, ?, ?, ?)
    `).bind(competitionId, user_id, content, is_live ? 1 : 0).run();

    await DB.prepare('UPDATE competitions SET total_comments = total_comments + 1 WHERE id = ?').bind(competitionId).run();

    return c.json<ApiResponse>({ 
      success: true, 
      data: { id: result.meta.last_row_id } 
    });
  } catch (error) {
    console.error('Add comment error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to add comment' 
    }, 500);
  }
});

/**
 * Add rating - إضافة تقييم
 * POST /api/competitions/:id/rate
 */
competitionsRoutes.post('/:id/rate', async (c) => {
  const { DB } = c.env;
  const competitionId = c.req.param('id');

  try {
    const body = await c.req.json();
    const { user_id, competitor_id, rating } = body;

    if (!user_id || !competitor_id || !rating || rating < 1 || rating > 5) {
      return c.json<ApiResponse>({ 
        success: false, 
        error: 'Invalid rating data' 
      }, 400);
    }

    await DB.prepare(`
      INSERT OR REPLACE INTO ratings (competition_id, user_id, competitor_id, rating)
      VALUES (?, ?, ?, ?)
    `).bind(competitionId, user_id, competitor_id, rating).run();

    return c.json<ApiResponse>({ success: true });
  } catch (error) {
    console.error('Add rating error:', error);
    return c.json<ApiResponse>({ 
      success: false, 
      error: 'Failed to add rating' 
    }, 500);
  }
});

export default competitionsRoutes;
