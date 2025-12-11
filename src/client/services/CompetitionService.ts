/**
 * @file src/client/services/CompetitionService.ts
 * @description خدمة المنافسات
 * @module client/services/CompetitionService
 */

import { State } from '../core/State';
import { ApiClient } from '../core/ApiClient';
import { Toast } from '../ui/Toast';
import { t } from '../../i18n';

/**
 * Competition Service Class
 * خدمة المنافسات
 */
export class CompetitionService {
    /**
     * Create a new competition
     */
    static async create(data: {
        title: string;
        description?: string;
        rules: string;
        category_id: number;
        subcategory_id?: number;
        language?: string;
        country?: string;
        scheduled_at?: string;
    }): Promise<{ success: boolean; id?: number; error?: string }> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return { success: false, error: 'Not authenticated' };
        }

        try {
            const response = await ApiClient.post('/api/competitions', {
                ...data,
                creator_id: State.currentUser.id,
                language: data.language || State.lang
            });

            if (response.success) {
                Toast.success(t('competition.created', State.lang));
                return { success: true, id: response.data?.id };
            } else {
                Toast.error(response.error || t('errors.something_wrong', State.lang));
                return { success: false, error: response.error };
            }
        } catch (error) {
            console.error('Create competition error:', error);
            Toast.error(t('errors.connection_failed', State.lang));
            return { success: false, error: 'Connection failed' };
        }
    }

    /**
     * Edit competition
     */
    static async edit(competitionId: number, data: {
        title?: string;
        description?: string;
        rules?: string;
        category_id?: number;
        subcategory_id?: number;
    }): Promise<boolean> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return false;
        }

        try {
            const response = await ApiClient.put(`/api/competitions/${competitionId}`, {
                ...data,
                user_id: State.currentUser.id
            });

            if (response.success) {
                Toast.success(t('competition.updated', State.lang));
                return true;
            } else {
                Toast.error(response.error || t('errors.something_wrong', State.lang));
                return false;
            }
        } catch (error) {
            console.error('Edit competition error:', error);
            Toast.error(t('errors.connection_failed', State.lang));
            return false;
        }
    }

    /**
     * Delete competition
     */
    static async delete(competitionId: number): Promise<boolean> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return false;
        }

        try {
            const response = await ApiClient.delete(`/api/competitions/${competitionId}`, {
                user_id: State.currentUser.id
            });

            if (response.success) {
                Toast.success(t('competition.deleted', State.lang));
                return true;
            } else {
                Toast.error(response.error || t('errors.something_wrong', State.lang));
                return false;
            }
        } catch (error) {
            console.error('Delete competition error:', error);
            Toast.error(t('errors.connection_failed', State.lang));
            return false;
        }
    }

    /**
     * Request to join competition
     */
    static async requestJoin(competitionId: number, message?: string): Promise<boolean> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return false;
        }

        try {
            const response = await ApiClient.post(`/api/competitions/${competitionId}/request`, {
                requester_id: State.currentUser.id,
                message
            });

            if (response.success) {
                Toast.success(t('competition.request_sent', State.lang));
                return true;
            } else {
                Toast.error(response.error || t('errors.something_wrong', State.lang));
                return false;
            }
        } catch (error) {
            console.error('Request join error:', error);
            Toast.error(t('errors.connection_failed', State.lang));
            return false;
        }
    }

    /**
     * Cancel join request
     */
    static async cancelRequest(competitionId: number): Promise<boolean> {
        if (!State.currentUser) return false;

        try {
            const response = await ApiClient.delete(`/api/competitions/${competitionId}/request`, {
                requester_id: State.currentUser.id
            });

            if (response.success) {
                Toast.info(t('competition.request_cancelled', State.lang));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Cancel request error:', error);
            return false;
        }
    }

    /**
     * Accept join request (for competition owner)
     */
    static async acceptRequest(competitionId: number, requestId: number, requesterId: number): Promise<boolean> {
        if (!State.currentUser) return false;

        try {
            const response = await ApiClient.post(`/api/competitions/${competitionId}/accept-request`, {
                request_id: requestId,
                requester_id: requesterId
            });

            if (response.success) {
                Toast.success(t('competition.request_accepted', State.lang));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Accept request error:', error);
            Toast.error(t('errors.connection_failed', State.lang));
            return false;
        }
    }

    /**
     * Decline join request (for competition owner)
     */
    static async declineRequest(competitionId: number, requestId: number, requesterId: number): Promise<boolean> {
        if (!State.currentUser) return false;

        try {
            const response = await ApiClient.post(`/api/competitions/${competitionId}/decline-request`, {
                request_id: requestId,
                requester_id: requesterId
            });

            if (response.success) {
                Toast.info(t('competition.request_declined', State.lang));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Decline request error:', error);
            return false;
        }
    }

    /**
     * Start live competition
     */
    static async startLive(competitionId: number, youtubeLiveId?: string): Promise<boolean> {
        if (!State.currentUser) return false;

        try {
            const response = await ApiClient.post(`/api/competitions/${competitionId}/start`, {
                youtube_live_id: youtubeLiveId
            });

            if (response.success) {
                Toast.success(t('competition.started', State.lang));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Start live error:', error);
            Toast.error(t('errors.connection_failed', State.lang));
            return false;
        }
    }

    /**
     * End competition
     */
    static async endCompetition(competitionId: number, youtubeVideoUrl?: string): Promise<boolean> {
        if (!State.currentUser) return false;

        try {
            const response = await ApiClient.post(`/api/competitions/${competitionId}/end`, {
                youtube_video_url: youtubeVideoUrl
            });

            if (response.success) {
                Toast.success(t('competition.ended', State.lang));
                return true;
            }
            return false;
        } catch (error) {
            console.error('End competition error:', error);
            return false;
        }
    }

    /**
     * Add comment
     */
    static async addComment(competitionId: number, content: string, isLive: boolean = false): Promise<{ success: boolean; id?: number }> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return { success: false };
        }

        try {
            const response = await ApiClient.post(`/api/competitions/${competitionId}/comments`, {
                user_id: State.currentUser.id,
                content,
                is_live: isLive
            });

            if (response.success) {
                return { success: true, id: response.data?.id };
            }
            Toast.error(response.error || t('errors.something_wrong', State.lang));
            return { success: false };
        } catch (error) {
            console.error('Add comment error:', error);
            Toast.error(t('errors.connection_failed', State.lang));
            return { success: false };
        }
    }

    /**
     * Delete comment
     */
    static async deleteComment(competitionId: number, commentId: number): Promise<boolean> {
        if (!State.currentUser) return false;

        try {
            const response = await ApiClient.delete(`/api/competitions/${competitionId}/comments/${commentId}`, {
                user_id: State.currentUser.id
            });

            if (response.success) {
                Toast.info(t('comment.deleted', State.lang));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Delete comment error:', error);
            return false;
        }
    }

    /**
     * Rate competitor
     */
    static async rate(competitionId: number, competitorId: number, rating: number): Promise<boolean> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return false;
        }

        if (rating < 1 || rating > 5) {
            Toast.error(t('rating.invalid', State.lang));
            return false;
        }

        try {
            const response = await ApiClient.post(`/api/competitions/${competitionId}/rate`, {
                user_id: State.currentUser.id,
                competitor_id: competitorId,
                rating
            });

            if (response.success) {
                Toast.success(t('rating.submitted', State.lang));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Rate error:', error);
            Toast.error(t('errors.connection_failed', State.lang));
            return false;
        }
    }
}

export default CompetitionService;
