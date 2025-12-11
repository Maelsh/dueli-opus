/**
 * @file src/client/services/InteractionService.ts
 * @description خدمة التفاعلات على جانب العميل
 * @module client/services/InteractionService
 */

import { ApiClient } from '../core/ApiClient';
import { State } from '../core/State';
import { Toast } from '../ui/Toast';
import { t } from '../../i18n';

/**
 * Report data interface
 */
export interface ReportData {
    target_type: 'user' | 'competition' | 'comment';
    target_id: number;
    reason: string;
    description?: string;
}

/**
 * Interaction Service Class
 * خدمة التفاعلات (الإعجابات والبلاغات)
 */
export class InteractionService {

    // =====================================
    // Likes - الإعجابات
    // =====================================

    /**
     * Like a competition
     */
    static async like(competitionId: number): Promise<{ success: boolean; likeCount?: number }> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return { success: false };
        }

        try {
            const response = await ApiClient.post(`/api/competitions/${competitionId}/like`);
            if (response.success) {
                return { success: true, likeCount: response.data?.likeCount };
            }
            Toast.error(response.error || t('errors.something_wrong', State.lang));
            return { success: false };
        } catch (error) {
            console.error('Like error:', error);
            return { success: false };
        }
    }

    /**
     * Unlike a competition
     */
    static async unlike(competitionId: number): Promise<{ success: boolean; likeCount?: number }> {
        if (!State.currentUser) return { success: false };

        try {
            const response = await ApiClient.delete(`/api/competitions/${competitionId}/like`);
            if (response.success) {
                return { success: true, likeCount: response.data?.likeCount };
            }
            return { success: false };
        } catch (error) {
            console.error('Unlike error:', error);
            return { success: false };
        }
    }

    /**
     * Toggle like (like if not liked, unlike if liked)
     */
    static async toggleLike(competitionId: number, currentlyLiked: boolean): Promise<{ success: boolean; liked?: boolean; likeCount?: number }> {
        if (currentlyLiked) {
            const result = await this.unlike(competitionId);
            return { ...result, liked: false };
        } else {
            const result = await this.like(competitionId);
            return { ...result, liked: true };
        }
    }

    /**
     * Get like status for a competition
     */
    static async getLikeStatus(competitionId: number): Promise<{ liked: boolean; likeCount: number }> {
        try {
            const response = await ApiClient.get(`/api/competitions/${competitionId}/like`);
            if (response.success) {
                return {
                    liked: response.data?.liked || false,
                    likeCount: response.data?.likeCount || 0
                };
            }
            return { liked: false, likeCount: 0 };
        } catch (error) {
            console.error('Get like status error:', error);
            return { liked: false, likeCount: 0 };
        }
    }

    /**
     * Get users who liked a competition
     */
    static async getLikers(competitionId: number, limit: number = 20, offset: number = 0): Promise<any> {
        try {
            const response = await ApiClient.get(
                `/api/competitions/${competitionId}/likes?limit=${limit}&offset=${offset}`
            );
            return response.success ? response.data : { items: [], total: 0, hasMore: false };
        } catch (error) {
            console.error('Get likers error:', error);
            return { items: [], total: 0, hasMore: false };
        }
    }

    // =====================================
    // Reports - البلاغات
    // =====================================

    /**
     * Submit a report
     */
    static async report(data: ReportData): Promise<boolean> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return false;
        }

        try {
            const response = await ApiClient.post('/api/reports', data);
            if (response.success) {
                Toast.success(t('report.submitted', State.lang));
                return true;
            }
            Toast.error(response.error || t('errors.something_wrong', State.lang));
            return false;
        } catch (error) {
            console.error('Report error:', error);
            Toast.error(t('errors.connection_failed', State.lang));
            return false;
        }
    }

    /**
     * Report a user
     */
    static async reportUser(userId: number, reason: string, description?: string): Promise<boolean> {
        return this.report({
            target_type: 'user',
            target_id: userId,
            reason,
            description
        });
    }

    /**
     * Report a competition
     */
    static async reportCompetition(competitionId: number, reason: string, description?: string): Promise<boolean> {
        return this.report({
            target_type: 'competition',
            target_id: competitionId,
            reason,
            description
        });
    }

    /**
     * Report a comment
     */
    static async reportComment(commentId: number, reason: string, description?: string): Promise<boolean> {
        return this.report({
            target_type: 'comment',
            target_id: commentId,
            reason,
            description
        });
    }

    /**
     * Get report reasons (for UI dropdowns)
     */
    static async getReportReasons(): Promise<Record<string, string[]>> {
        try {
            const response = await ApiClient.get('/api/reports/reasons');
            return response.success ? response.data?.reasons || {} : {};
        } catch (error) {
            console.error('Get report reasons error:', error);
            return {};
        }
    }
}

export default InteractionService;
