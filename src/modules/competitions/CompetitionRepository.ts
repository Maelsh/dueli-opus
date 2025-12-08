/**
 * @file modules/competitions/CompetitionRepository.ts
 * @description مستودع المنافسات للتعامل مع قاعدة البيانات
 * @description_en Competition Repository for database operations
 * @module modules/competitions
 * @version 1.0.0
 * @author Dueli Team
 */

import { BaseRepository } from '../../core/database';
import type { Competition, Rating, Comment, PaginationOptions } from '../../core/http/types';

/**
 * بيانات إنشاء منافسة
 * Competition creation data
 */
export interface CreateCompetitionData {
  title: string;
  description?: string;
  category_id: number;
  creator_id: number;
  rules?: string;
  scheduled_at?: string;
  is_public?: boolean;
}

/**
 * فلاتر المنافسات
 * Competition filters
 */
export interface CompetitionFilters {
  status?: string;
  category_id?: number;
  country_code?: string;
  language?: string;
  creator_id?: number;
  search?: string;
}

/**
 * منافسة مع بيانات إضافية
 * Competition with extra data
 */
export interface CompetitionWithDetails extends Competition {
  category_name_ar?: string;
  category_name_en?: string;
  category_icon?: string;
  creator_name?: string;
  creator_avatar?: string;
  creator_country?: string;
  opponent_name?: string;
  opponent_avatar?: string;
  opponent_country?: string;
  comments_count?: number;
  ratings_count?: number;
  avg_rating?: number;
}

/**
 * مستودع المنافسات
 * Competition Repository
 */
export class CompetitionRepository extends BaseRepository<Competition> {
  constructor(db: D1Database) {
    super(db, 'competitions');
  }

  /**
   * الحصول على منافسات مع تفاصيل
   * Get competitions with details
   */
  async findWithDetails(
    filters: CompetitionFilters,
    pagination: PaginationOptions
  ): Promise<{ data: CompetitionWithDetails[]; total: number }> {
    const conditions: string[] = [];
    const values: any[] = [];

    // بناء الشروط
    if (filters.status && filters.status !== 'all') {
      conditions.push('c.status = ?');
      values.push(filters.status);
    }

    if (filters.category_id) {
      conditions.push('c.category_id = ?');
      values.push(filters.category_id);
    }

    if (filters.creator_id) {
      conditions.push('c.creator_id = ?');
      values.push(filters.creator_id);
    }

    if (filters.country_code) {
      conditions.push('(creator.country_code = ? OR opponent.country_code = ?)');
      values.push(filters.country_code, filters.country_code);
    }

    if (filters.search) {
      conditions.push('(c.title LIKE ? OR c.description LIKE ?)');
      const searchTerm = `%${filters.search}%`;
      values.push(searchTerm, searchTerm);
    }

    const whereClause = conditions.length > 0 
      ? `WHERE ${conditions.join(' AND ')}` 
      : '';

    // استعلام العد
    const countQuery = `
      SELECT COUNT(*) as total 
      FROM competitions c
      LEFT JOIN users creator ON c.creator_id = creator.id
      LEFT JOIN users opponent ON c.opponent_id = opponent.id
      ${whereClause}
    `;
    const countResult = await this.rawQueryFirst<{ total: number }>(countQuery, values);
    const total = countResult?.total || 0;

    // استعلام البيانات
    const dataQuery = `
      SELECT 
        c.*,
        cat.name_ar as category_name_ar,
        cat.name_en as category_name_en,
        cat.icon as category_icon,
        creator.display_name as creator_name,
        creator.avatar_url as creator_avatar,
        creator.country_code as creator_country,
        opponent.display_name as opponent_name,
        opponent.avatar_url as opponent_avatar,
        opponent.country_code as opponent_country,
        (SELECT COUNT(*) FROM comments WHERE competition_id = c.id) as comments_count,
        (SELECT COUNT(*) FROM ratings WHERE competition_id = c.id) as ratings_count,
        (SELECT AVG(score) FROM ratings WHERE competition_id = c.id) as avg_rating
      FROM competitions c
      LEFT JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN users creator ON c.creator_id = creator.id
      LEFT JOIN users opponent ON c.opponent_id = opponent.id
      ${whereClause}
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const data = await this.rawQuery<CompetitionWithDetails>(
      dataQuery, 
      [...values, pagination.limit, pagination.offset]
    );

    return { data, total };
  }

  /**
   * الحصول على منافسة مع تفاصيل
   * Get competition with details
   */
  async findByIdWithDetails(id: number): Promise<CompetitionWithDetails | null> {
    const query = `
      SELECT 
        c.*,
        cat.name_ar as category_name_ar,
        cat.name_en as category_name_en,
        cat.icon as category_icon,
        creator.display_name as creator_name,
        creator.avatar_url as creator_avatar,
        creator.country_code as creator_country,
        opponent.display_name as opponent_name,
        opponent.avatar_url as opponent_avatar,
        opponent.country_code as opponent_country,
        (SELECT COUNT(*) FROM comments WHERE competition_id = c.id) as comments_count,
        (SELECT COUNT(*) FROM ratings WHERE competition_id = c.id) as ratings_count,
        (SELECT AVG(score) FROM ratings WHERE competition_id = c.id) as avg_rating
      FROM competitions c
      LEFT JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN users creator ON c.creator_id = creator.id
      LEFT JOIN users opponent ON c.opponent_id = opponent.id
      WHERE c.id = ?
    `;

    return this.rawQueryFirst<CompetitionWithDetails>(query, [id]);
  }

  /**
   * إنشاء منافسة جديدة
   * Create new competition
   */
  async createCompetition(data: CreateCompetitionData): Promise<{ id: number; success: boolean }> {
    const now = new Date().toISOString();
    return this.create({
      ...data,
      status: 'pending',
      is_public: data.is_public ?? true,
      created_at: now,
      updated_at: now
    } as any);
  }

  /**
   * انضمام خصم للمنافسة
   * Join competition as opponent
   */
  async joinAsOpponent(competitionId: number, opponentId: number): Promise<boolean> {
    const result = await this.update(competitionId, {
      opponent_id: opponentId,
      status: 'waiting',
      updated_at: new Date().toISOString()
    } as any);
    return result.success;
  }

  /**
   * بدء المنافسة
   * Start competition
   */
  async startCompetition(competitionId: number): Promise<boolean> {
    const result = await this.update(competitionId, {
      status: 'live',
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as any);
    return result.success;
  }

  /**
   * إنهاء المنافسة
   * End competition
   */
  async endCompetition(competitionId: number): Promise<boolean> {
    const result = await this.update(competitionId, {
      status: 'completed',
      ended_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    } as any);
    return result.success;
  }

  /**
   * إلغاء المنافسة
   * Cancel competition
   */
  async cancelCompetition(competitionId: number): Promise<boolean> {
    const result = await this.update(competitionId, {
      status: 'cancelled',
      updated_at: new Date().toISOString()
    } as any);
    return result.success;
  }

  /**
   * تحديث روابط الفيديو
   * Update video URLs
   */
  async updateVideoUrl(
    competitionId: number, 
    userId: number, 
    videoUrl: string,
    isCreator: boolean
  ): Promise<boolean> {
    const field = isCreator ? 'creator_video_url' : 'opponent_video_url';
    const result = await this.rawExecute(
      `UPDATE competitions SET ${field} = ?, updated_at = ? WHERE id = ?`,
      [videoUrl, new Date().toISOString(), competitionId]
    );
    return result.success;
  }

  /**
   * الحصول على منافسات المستخدم
   * Get user competitions
   */
  async findByUserId(
    userId: number, 
    pagination: PaginationOptions
  ): Promise<{ data: CompetitionWithDetails[]; total: number }> {
    return this.findWithDetails({ creator_id: userId }, pagination);
  }

  /**
   * الحصول على المنافسات المباشرة
   * Get live competitions
   */
  async findLive(pagination: PaginationOptions): Promise<{ data: CompetitionWithDetails[]; total: number }> {
    return this.findWithDetails({ status: 'live' }, pagination);
  }
}

/**
 * مستودع التقييمات
 * Rating Repository
 */
export class RatingRepository extends BaseRepository<Rating> {
  constructor(db: D1Database) {
    super(db, 'ratings');
  }

  /**
   * إضافة تقييم
   * Add rating
   */
  async addRating(
    competitionId: number,
    userId: number,
    competitorId: number,
    score: number
  ): Promise<{ id: number; success: boolean }> {
    // التحقق من عدم وجود تقييم سابق
    const existing = await this.findOneBy({
      competition_id: competitionId,
      user_id: userId,
      competitor_id: competitorId
    } as any);

    if (existing) {
      // تحديث التقييم الموجود
      await this.update(existing.id, { score } as any);
      return { id: existing.id, success: true };
    }

    return this.create({
      competition_id: competitionId,
      user_id: userId,
      competitor_id: competitorId,
      score,
      created_at: new Date().toISOString()
    } as any);
  }

  /**
   * الحصول على تقييمات المنافسة
   * Get competition ratings
   */
  async getCompetitionRatings(competitionId: number): Promise<{
    creator: { total: number; average: number };
    opponent: { total: number; average: number };
  }> {
    const query = `
      SELECT 
        competitor_id,
        COUNT(*) as total,
        AVG(score) as average
      FROM ratings
      WHERE competition_id = ?
      GROUP BY competitor_id
    `;

    const results = await this.rawQuery<{
      competitor_id: number;
      total: number;
      average: number;
    }>(query, [competitionId]);

    const ratings = {
      creator: { total: 0, average: 0 },
      opponent: { total: 0, average: 0 }
    };

    // يمكن تحسين هذا لاحقاً
    for (const r of results) {
      // نحتاج معرفة من هو المنشئ ومن هو الخصم
    }

    return ratings;
  }

  /**
   * الحصول على تقييم المستخدم
   * Get user's rating for competition
   */
  async getUserRating(
    competitionId: number,
    userId: number
  ): Promise<Rating[]> {
    return this.findBy({ 
      competition_id: competitionId, 
      user_id: userId 
    } as any);
  }
}

/**
 * مستودع التعليقات
 * Comment Repository
 */
export class CommentRepository extends BaseRepository<Comment> {
  constructor(db: D1Database) {
    super(db, 'comments');
  }

  /**
   * إضافة تعليق
   * Add comment
   */
  async addComment(
    competitionId: number,
    userId: number,
    content: string
  ): Promise<{ id: number; success: boolean }> {
    return this.create({
      competition_id: competitionId,
      user_id: userId,
      content,
      created_at: new Date().toISOString()
    } as any);
  }

  /**
   * الحصول على تعليقات المنافسة
   * Get competition comments with user info
   */
  async getCompetitionComments(
    competitionId: number,
    pagination: PaginationOptions
  ): Promise<{ data: (Comment & { user_name: string; user_avatar?: string })[]; total: number }> {
    const countResult = await this.rawQueryFirst<{ total: number }>(
      'SELECT COUNT(*) as total FROM comments WHERE competition_id = ?',
      [competitionId]
    );
    const total = countResult?.total || 0;

    const query = `
      SELECT 
        c.*,
        u.display_name as user_name,
        u.avatar_url as user_avatar
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.competition_id = ?
      ORDER BY c.created_at DESC
      LIMIT ? OFFSET ?
    `;

    const data = await this.rawQuery<Comment & { user_name: string; user_avatar?: string }>(
      query,
      [competitionId, pagination.limit, pagination.offset]
    );

    return { data, total };
  }

  /**
   * حذف تعليق (للمالك فقط)
   * Delete comment (owner only)
   */
  async deleteByOwner(commentId: number, userId: number): Promise<boolean> {
    const result = await this.rawExecute(
      'DELETE FROM comments WHERE id = ? AND user_id = ?',
      [commentId, userId]
    );
    return (result.meta.changes as number) > 0;
  }
}

export default { CompetitionRepository, RatingRepository, CommentRepository };
