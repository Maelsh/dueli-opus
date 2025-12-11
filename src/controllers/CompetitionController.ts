/**
 * Competition Controller
 * متحكم المنافسات
 */

import { BaseController, AppContext } from './base/BaseController';
import { CompetitionModel, CompetitionFilters, CommentModel, NotificationModel } from '../models';

/**
 * Competition Controller Class
 */
export class CompetitionController extends BaseController {
    private competitionModel: CompetitionModel;
    private commentModel: CommentModel;
    private notificationModel: NotificationModel;

    constructor(db: D1Database) {
        super();
        this.competitionModel = new CompetitionModel(db);
        this.commentModel = new CommentModel(db);
        this.notificationModel = new NotificationModel(db);
    }

    /**
     * List competitions with filters
     * GET /api/competitions
     */
    async list(c: AppContext) {
        try {
            const filters: CompetitionFilters = {
                status: this.getQuery(c, 'status') as any,
                category: this.getQuery(c, 'category'),
                country: this.getQuery(c, 'country'),
                language: this.getQuery(c, 'language'),
                search: this.getQuery(c, 'search'),
                limit: this.getQueryInt(c, 'limit', 20),
                offset: this.getQueryInt(c, 'offset', 0)
            };

            const competitions = await this.competitionModel.findByFilters(filters);

            return this.success(c, competitions);

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Get single competition with details
     * GET /api/competitions/:id
     */
    async show(c: AppContext) {
        try {
            const id = this.getParamInt(c, 'id');
            const competition = await this.competitionModel.findWithDetails(id);

            if (!competition) {
                return this.notFound(c, 'Competition not found');
            }

            // Increment views
            await this.competitionModel.incrementViews(id);

            // Get comments
            const comments = await this.commentModel.findByCompetition(id);

            return this.success(c, {
                ...competition,
                comments
            });

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Create competition
     * POST /api/competitions
     */
    async create(c: AppContext) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) {
                return this.unauthorized(c);
            }

            const body = await this.getBody<{
                title: string;
                description?: string;
                rules: string;
                category_id: number;
                subcategory_id?: number;
                language: string;
                country?: string;
            }>(c);

            if (!body?.title || !body?.rules || !body?.category_id) {
                return this.validationError(c, this.t('error_required_fields', c));
            }

            const competition = await this.competitionModel.create({
                ...body,
                creator_id: user.id,
                language: body.language || this.getLanguage(c)
            });

            return this.success(c, competition, 201);

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Add comment to competition
     * POST /api/competitions/:id/comments
     */
    async addComment(c: AppContext) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) {
                return this.unauthorized(c);
            }

            const competitionId = this.getParamInt(c, 'id');
            const body = await this.getBody<{ content: string; is_live?: boolean }>(c);

            if (!body?.content) {
                return this.validationError(c, this.t('error_content_required', c));
            }

            // Check competition exists
            const competition = await this.competitionModel.findById(competitionId);
            if (!competition) {
                return this.notFound(c);
            }

            const comment = await this.commentModel.create({
                competition_id: competitionId,
                user_id: user.id,
                content: body.content,
                is_live: body.is_live || false
            });

            return this.success(c, comment, 201);

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Request to join competition
     * POST /api/competitions/:id/request
     */
    async requestJoin(c: AppContext) {
        try {
            const user = this.getCurrentUser(c);
            if (!user) {
                return this.unauthorized(c);
            }

            const competitionId = this.getParamInt(c, 'id');
            const body = await this.getBody<{ message?: string }>(c);

            const competition = await this.competitionModel.findById(competitionId);
            if (!competition) {
                return this.notFound(c);
            }

            if (competition.creator_id === user.id) {
                return this.error(c, 'Cannot join your own competition');
            }

            // Create notification for creator
            await this.notificationModel.create({
                user_id: competition.creator_id,
                type: 'request',
                title: 'notification.new_join_request',
                message: `notification.join_request_for:${competition.title}`
            });

            return this.success(c, { message: 'Request sent' });

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default CompetitionController;
