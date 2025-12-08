/**
 * @file modules/competitions/CompetitionService.ts
 * @description خدمة المنافسات - المنطق التجاري
 * @description_en Competition Service - Business Logic
 * @module modules/competitions
 * @version 1.0.0
 * @author Dueli Team
 */

import { 
  CompetitionRepository, 
  RatingRepository, 
  CommentRepository,
  CreateCompetitionData,
  CompetitionFilters,
  CompetitionWithDetails
} from './CompetitionRepository';
import type { Competition, PaginationOptions, User, Language } from '../../core/http/types';
import { t } from '../../core/i18n';

/**
 * نتيجة خدمة المنافسات
 * Competition service result
 */
export interface CompetitionResult {
  success: boolean;
  competition?: CompetitionWithDetails;
  error?: string;
}

/**
 * خدمة المنافسات
 * Competition Service
 */
export class CompetitionService {
  private competitionRepo: CompetitionRepository;
  private ratingRepo: RatingRepository;
  private commentRepo: CommentRepository;

  constructor(db: D1Database) {
    this.competitionRepo = new CompetitionRepository(db);
    this.ratingRepo = new RatingRepository(db);
    this.commentRepo = new CommentRepository(db);
  }

  // ============================================
  // Query Methods - دوال الاستعلام
  // ============================================

  /**
   * الحصول على قائمة المنافسات
   * Get competitions list
   */
  async getCompetitions(
    filters: CompetitionFilters,
    pagination: PaginationOptions
  ): Promise<{ data: CompetitionWithDetails[]; total: number; hasMore: boolean }> {
    const result = await this.competitionRepo.findWithDetails(filters, pagination);
    return {
      ...result,
      hasMore: pagination.offset + pagination.limit < result.total
    };
  }

  /**
   * الحصول على منافسة بالمعرف
   * Get competition by ID
   */
  async getCompetition(id: number): Promise<CompetitionWithDetails | null> {
    return this.competitionRepo.findByIdWithDetails(id);
  }

  /**
   * الحصول على المنافسات المباشرة
   * Get live competitions
   */
  async getLiveCompetitions(pagination: PaginationOptions) {
    return this.competitionRepo.findLive(pagination);
  }

  /**
   * الحصول على منافسات المستخدم
   * Get user's competitions
   */
  async getUserCompetitions(userId: number, pagination: PaginationOptions) {
    return this.competitionRepo.findByUserId(userId, pagination);
  }

  // ============================================
  // Mutation Methods - دوال التعديل
  // ============================================

  /**
   * إنشاء منافسة جديدة
   * Create new competition
   */
  async createCompetition(
    data: CreateCompetitionData,
    user: User,
    lang: Language = 'ar'
  ): Promise<CompetitionResult> {
    // التحقق من البيانات
    if (!data.title || data.title.trim().length < 5) {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'عنوان المنافسة يجب أن يكون 5 أحرف على الأقل' 
          : 'Competition title must be at least 5 characters'
      };
    }

    if (!data.category_id) {
      return { 
        success: false, 
        error: t('errors.required_field', lang) 
      };
    }

    // إنشاء المنافسة
    const result = await this.competitionRepo.createCompetition({
      ...data,
      creator_id: user.id
    });

    if (!result.success) {
      return { 
        success: false, 
        error: t('errors.server_error', lang) 
      };
    }

    // جلب المنافسة المنشأة
    const competition = await this.competitionRepo.findByIdWithDetails(result.id);
    
    return { 
      success: true, 
      competition: competition || undefined 
    };
  }

  /**
   * الانضمام للمنافسة
   * Join competition
   */
  async joinCompetition(
    competitionId: number,
    user: User,
    lang: Language = 'ar'
  ): Promise<CompetitionResult> {
    const competition = await this.competitionRepo.findById(competitionId);

    if (!competition) {
      return { 
        success: false, 
        error: t('errors.not_found', lang) 
      };
    }

    // التحقق من الحالة
    if (competition.status !== 'pending') {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'هذه المنافسة غير متاحة للانضمام' 
          : 'This competition is not available for joining'
      };
    }

    // التحقق من أن المستخدم ليس المنشئ
    if (competition.creator_id === user.id) {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'لا يمكنك الانضمام لمنافستك الخاصة' 
          : 'You cannot join your own competition'
      };
    }

    // التحقق من عدم وجود خصم
    if (competition.opponent_id) {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'هذه المنافسة لديها خصم بالفعل' 
          : 'This competition already has an opponent'
      };
    }

    // الانضمام
    const joined = await this.competitionRepo.joinAsOpponent(competitionId, user.id);

    if (!joined) {
      return { 
        success: false, 
        error: t('errors.server_error', lang) 
      };
    }

    const updated = await this.competitionRepo.findByIdWithDetails(competitionId);
    return { 
      success: true, 
      competition: updated || undefined 
    };
  }

  /**
   * بدء المنافسة
   * Start competition
   */
  async startCompetition(
    competitionId: number,
    user: User,
    lang: Language = 'ar'
  ): Promise<CompetitionResult> {
    const competition = await this.competitionRepo.findById(competitionId);

    if (!competition) {
      return { success: false, error: t('errors.not_found', lang) };
    }

    // التحقق من الصلاحية
    if (competition.creator_id !== user.id) {
      return { success: false, error: t('errors.unauthorized', lang) };
    }

    // التحقق من وجود خصم
    if (!competition.opponent_id) {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'يجب وجود خصم لبدء المنافسة' 
          : 'An opponent is required to start the competition'
      };
    }

    // التحقق من الحالة
    if (competition.status !== 'waiting' && competition.status !== 'pending') {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'لا يمكن بدء هذه المنافسة' 
          : 'Cannot start this competition'
      };
    }

    const started = await this.competitionRepo.startCompetition(competitionId);

    if (!started) {
      return { success: false, error: t('errors.server_error', lang) };
    }

    const updated = await this.competitionRepo.findByIdWithDetails(competitionId);
    return { success: true, competition: updated || undefined };
  }

  /**
   * إنهاء المنافسة
   * End competition
   */
  async endCompetition(
    competitionId: number,
    user: User,
    lang: Language = 'ar'
  ): Promise<CompetitionResult> {
    const competition = await this.competitionRepo.findById(competitionId);

    if (!competition) {
      return { success: false, error: t('errors.not_found', lang) };
    }

    // التحقق من الصلاحية
    if (competition.creator_id !== user.id) {
      return { success: false, error: t('errors.unauthorized', lang) };
    }

    // التحقق من الحالة
    if (competition.status !== 'live') {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'يمكن إنهاء المنافسات المباشرة فقط' 
          : 'Only live competitions can be ended'
      };
    }

    const ended = await this.competitionRepo.endCompetition(competitionId);

    if (!ended) {
      return { success: false, error: t('errors.server_error', lang) };
    }

    const updated = await this.competitionRepo.findByIdWithDetails(competitionId);
    return { success: true, competition: updated || undefined };
  }

  /**
   * إلغاء المنافسة
   * Cancel competition
   */
  async cancelCompetition(
    competitionId: number,
    user: User,
    lang: Language = 'ar'
  ): Promise<CompetitionResult> {
    const competition = await this.competitionRepo.findById(competitionId);

    if (!competition) {
      return { success: false, error: t('errors.not_found', lang) };
    }

    // التحقق من الصلاحية
    if (competition.creator_id !== user.id) {
      return { success: false, error: t('errors.unauthorized', lang) };
    }

    // التحقق من الحالة
    if (competition.status === 'completed' || competition.status === 'cancelled') {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'لا يمكن إلغاء هذه المنافسة' 
          : 'Cannot cancel this competition'
      };
    }

    const cancelled = await this.competitionRepo.cancelCompetition(competitionId);

    if (!cancelled) {
      return { success: false, error: t('errors.server_error', lang) };
    }

    const updated = await this.competitionRepo.findByIdWithDetails(competitionId);
    return { success: true, competition: updated || undefined };
  }

  // ============================================
  // Ratings - التقييمات
  // ============================================

  /**
   * إضافة تقييم
   * Add rating
   */
  async addRating(
    competitionId: number,
    competitorId: number,
    score: number,
    user: User,
    lang: Language = 'ar'
  ): Promise<{ success: boolean; error?: string }> {
    // التحقق من النتيجة
    if (score < 1 || score > 10) {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'التقييم يجب أن يكون بين 1 و 10' 
          : 'Rating must be between 1 and 10'
      };
    }

    const competition = await this.competitionRepo.findById(competitionId);

    if (!competition) {
      return { success: false, error: t('errors.not_found', lang) };
    }

    // التحقق من أن المستخدم ليس أحد المتنافسين
    if (competition.creator_id === user.id || competition.opponent_id === user.id) {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'لا يمكنك تقييم نفسك' 
          : 'You cannot rate yourself'
      };
    }

    // التحقق من أن المتنافس موجود في المنافسة
    if (competitorId !== competition.creator_id && competitorId !== competition.opponent_id) {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'المتنافس غير موجود في هذه المنافسة' 
          : 'Competitor is not in this competition'
      };
    }

    const result = await this.ratingRepo.addRating(competitionId, user.id, competitorId, score);
    
    return { success: result.success };
  }

  /**
   * الحصول على تقييمات المنافسة
   * Get competition ratings
   */
  async getCompetitionRatings(competitionId: number) {
    return this.ratingRepo.getCompetitionRatings(competitionId);
  }

  // ============================================
  // Comments - التعليقات
  // ============================================

  /**
   * إضافة تعليق
   * Add comment
   */
  async addComment(
    competitionId: number,
    content: string,
    user: User,
    lang: Language = 'ar'
  ): Promise<{ success: boolean; comment?: any; error?: string }> {
    // التحقق من المحتوى
    if (!content || content.trim().length < 1) {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'التعليق لا يمكن أن يكون فارغاً' 
          : 'Comment cannot be empty'
      };
    }

    if (content.length > 1000) {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'التعليق طويل جداً' 
          : 'Comment is too long'
      };
    }

    const competition = await this.competitionRepo.findById(competitionId);

    if (!competition) {
      return { success: false, error: t('errors.not_found', lang) };
    }

    const result = await this.commentRepo.addComment(competitionId, user.id, content.trim());
    
    if (!result.success) {
      return { success: false, error: t('errors.server_error', lang) };
    }

    return { 
      success: true, 
      comment: {
        id: result.id,
        content: content.trim(),
        user_id: user.id,
        user_name: user.display_name || user.username,
        user_avatar: user.avatar_url,
        created_at: new Date().toISOString()
      }
    };
  }

  /**
   * الحصول على تعليقات المنافسة
   * Get competition comments
   */
  async getComments(competitionId: number, pagination: PaginationOptions) {
    return this.commentRepo.getCompetitionComments(competitionId, pagination);
  }

  /**
   * حذف تعليق
   * Delete comment
   */
  async deleteComment(
    commentId: number,
    user: User,
    lang: Language = 'ar'
  ): Promise<{ success: boolean; error?: string }> {
    const deleted = await this.commentRepo.deleteByOwner(commentId, user.id);

    if (!deleted) {
      return { 
        success: false, 
        error: lang === 'ar' 
          ? 'لا يمكن حذف هذا التعليق' 
          : 'Cannot delete this comment'
      };
    }

    return { success: true };
  }
}

export default CompetitionService;
