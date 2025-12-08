/**
 * @file modules/competitions/CompetitionController.ts
 * @description متحكم المنافسات - معالجة طلبات HTTP
 * @description_en Competition Controller - HTTP request handling
 * @module modules/competitions
 * @version 1.0.0
 * @author Dueli Team
 */

import { BaseController, ControllerContext, Validator, ValidationSchema } from '../../core';
import { CompetitionService } from './CompetitionService';
import { CreateCompetitionData, CompetitionFilters } from './CompetitionRepository';
import { AuthService } from '../auth/AuthService';

/**
 * مخطط إنشاء منافسة
 * Create competition schema
 */
const createCompetitionSchema: ValidationSchema<CreateCompetitionData> = {
  title: ['required', 'string', { minLength: 5 }, { maxLength: 200 }],
  description: ['string', { maxLength: 2000 }],
  category_id: ['required', 'number'],
  rules: ['string', { maxLength: 5000 }],
  scheduled_at: ['string'],
  is_public: ['boolean']
};

/**
 * متحكم المنافسات
 * Competition Controller
 */
export class CompetitionController extends BaseController {
  constructor() {
    super('CompetitionController');
  }

  /**
   * الحصول على خدمة المنافسات
   */
  private getService(c: ControllerContext): CompetitionService {
    return new CompetitionService(this.getDB(c));
  }

  /**
   * الحصول على المستخدم الحالي
   */
  private async getCurrentUser(c: ControllerContext) {
    const token = this.getCookie(c, 'session_token');
    if (!token) return null;

    const authService = new AuthService(this.getDB(c), '');
    return authService.validateSession(token);
  }

  // ============================================
  // Query Endpoints - نقاط الاستعلام
  // ============================================

  /**
   * الحصول على قائمة المنافسات
   * GET /api/competitions
   */
  async list(c: ControllerContext) {
    const filters: CompetitionFilters = {
      status: this.getQuery(c, 'status'),
      category_id: this.getQuery(c, 'category') 
        ? Validator.toInt(this.getQuery(c, 'category')) 
        : undefined,
      country_code: this.getQuery(c, 'country'),
      language: this.getQuery(c, 'language'),
      search: this.getQuery(c, 'search')
    };

    const pagination = this.getPagination(c);
    const service = this.getService(c);
    
    const result = await service.getCompetitions(filters, pagination);
    
    return this.ok(c, result);
  }

  /**
   * الحصول على منافسة محددة
   * GET /api/competitions/:id
   */
  async get(c: ControllerContext) {
    const id = this.getParamInt(c, 'id');
    
    if (!id) {
      return this.badRequest(c, 'Competition ID is required');
    }

    const service = this.getService(c);
    const competition = await service.getCompetition(id);

    if (!competition) {
      return this.notFound(c, 'Competition not found');
    }

    return this.ok(c, competition);
  }

  /**
   * الحصول على المنافسات المباشرة
   * GET /api/competitions/live
   */
  async getLive(c: ControllerContext) {
    const pagination = this.getPagination(c);
    const service = this.getService(c);
    
    const result = await service.getLiveCompetitions(pagination);
    
    return this.ok(c, result);
  }

  // ============================================
  // Mutation Endpoints - نقاط التعديل
  // ============================================

  /**
   * إنشاء منافسة جديدة
   * POST /api/competitions
   */
  async create(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c, 'Login required to create a competition');
    }

    const result = await this.parseAndValidate<CreateCompetitionData>(c, createCompetitionSchema);
    
    if (!result.success) {
      return this.validationError(c, result.errors);
    }

    const service = this.getService(c);
    const lang = this.getLang(c);
    
    const competitionResult = await service.createCompetition(result.data!, user, lang);
    
    if (!competitionResult.success) {
      return this.badRequest(c, competitionResult.error || 'Failed to create competition');
    }

    return this.created(c, competitionResult.competition);
  }

  /**
   * الانضمام للمنافسة
   * POST /api/competitions/:id/join
   */
  async join(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c, 'Login required to join a competition');
    }

    const id = this.getParamInt(c, 'id');
    
    if (!id) {
      return this.badRequest(c, 'Competition ID is required');
    }

    const service = this.getService(c);
    const lang = this.getLang(c);
    
    const result = await service.joinCompetition(id, user, lang);
    
    if (!result.success) {
      return this.badRequest(c, result.error || 'Failed to join competition');
    }

    return this.ok(c, result.competition);
  }

  /**
   * بدء المنافسة
   * POST /api/competitions/:id/start
   */
  async start(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const id = this.getParamInt(c, 'id');
    
    if (!id) {
      return this.badRequest(c, 'Competition ID is required');
    }

    const service = this.getService(c);
    const lang = this.getLang(c);
    
    const result = await service.startCompetition(id, user, lang);
    
    if (!result.success) {
      return this.badRequest(c, result.error || 'Failed to start competition');
    }

    return this.ok(c, result.competition);
  }

  /**
   * إنهاء المنافسة
   * POST /api/competitions/:id/end
   */
  async end(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const id = this.getParamInt(c, 'id');
    
    if (!id) {
      return this.badRequest(c, 'Competition ID is required');
    }

    const service = this.getService(c);
    const lang = this.getLang(c);
    
    const result = await service.endCompetition(id, user, lang);
    
    if (!result.success) {
      return this.badRequest(c, result.error || 'Failed to end competition');
    }

    return this.ok(c, result.competition);
  }

  /**
   * إلغاء المنافسة
   * POST /api/competitions/:id/cancel
   */
  async cancel(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const id = this.getParamInt(c, 'id');
    
    if (!id) {
      return this.badRequest(c, 'Competition ID is required');
    }

    const service = this.getService(c);
    const lang = this.getLang(c);
    
    const result = await service.cancelCompetition(id, user, lang);
    
    if (!result.success) {
      return this.badRequest(c, result.error || 'Failed to cancel competition');
    }

    return this.ok(c, result.competition);
  }

  // ============================================
  // Rating Endpoints - نقاط التقييم
  // ============================================

  /**
   * إضافة تقييم
   * POST /api/competitions/:id/ratings
   */
  async addRating(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const id = this.getParamInt(c, 'id');
    const body = await this.parseBody<{ competitor_id: number; score: number }>(c);
    
    if (!id || !body?.competitor_id || !body?.score) {
      return this.badRequest(c, 'Competition ID, competitor ID, and score are required');
    }

    const service = this.getService(c);
    const lang = this.getLang(c);
    
    const result = await service.addRating(id, body.competitor_id, body.score, user, lang);
    
    if (!result.success) {
      return this.badRequest(c, result.error || 'Failed to add rating');
    }

    return this.ok(c, { message: 'Rating added successfully' });
  }

  /**
   * الحصول على تقييمات المنافسة
   * GET /api/competitions/:id/ratings
   */
  async getRatings(c: ControllerContext) {
    const id = this.getParamInt(c, 'id');
    
    if (!id) {
      return this.badRequest(c, 'Competition ID is required');
    }

    const service = this.getService(c);
    const ratings = await service.getCompetitionRatings(id);
    
    return this.ok(c, ratings);
  }

  // ============================================
  // Comment Endpoints - نقاط التعليقات
  // ============================================

  /**
   * إضافة تعليق
   * POST /api/competitions/:id/comments
   */
  async addComment(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const id = this.getParamInt(c, 'id');
    const body = await this.parseBody<{ content: string }>(c);
    
    if (!id || !body?.content) {
      return this.badRequest(c, 'Competition ID and comment content are required');
    }

    const service = this.getService(c);
    const lang = this.getLang(c);
    
    const result = await service.addComment(id, body.content, user, lang);
    
    if (!result.success) {
      return this.badRequest(c, result.error || 'Failed to add comment');
    }

    return this.created(c, result.comment);
  }

  /**
   * الحصول على تعليقات المنافسة
   * GET /api/competitions/:id/comments
   */
  async getComments(c: ControllerContext) {
    const id = this.getParamInt(c, 'id');
    
    if (!id) {
      return this.badRequest(c, 'Competition ID is required');
    }

    const pagination = this.getPagination(c);
    const service = this.getService(c);
    
    const result = await service.getComments(id, pagination);
    
    return this.ok(c, result);
  }

  /**
   * حذف تعليق
   * DELETE /api/competitions/:id/comments/:commentId
   */
  async deleteComment(c: ControllerContext) {
    const user = await this.getCurrentUser(c);
    
    if (!user) {
      return this.unauthorized(c);
    }

    const commentId = this.getParamInt(c, 'commentId');
    
    if (!commentId) {
      return this.badRequest(c, 'Comment ID is required');
    }

    const service = this.getService(c);
    const lang = this.getLang(c);
    
    const result = await service.deleteComment(commentId, user, lang);
    
    if (!result.success) {
      return this.badRequest(c, result.error || 'Failed to delete comment');
    }

    return this.ok(c, { message: 'Comment deleted successfully' });
  }
}

// تصدير نسخة واحدة
export const competitionController = new CompetitionController();
export default CompetitionController;
