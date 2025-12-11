/**
 * @file src/client/services/SettingsService.ts
 * @description خدمة الإعدادات والمنشورات على جانب العميل
 * @module client/services/SettingsService
 */

import { ApiClient } from '../core/ApiClient';
import { State } from '../core/State';
import { Toast } from '../ui/Toast';
import { t } from '../../i18n';

/**
 * Settings data interface
 */
export interface UserSettingsData {
    default_language?: string;
    default_country?: string;
    notifications_enabled?: boolean;
    email_notifications?: boolean;
    privacy_level?: 'public' | 'followers' | 'private';
}

/**
 * Settings Service Class
 * خدمة الإعدادات والمنشورات
 */
export class SettingsService {

    // =====================================
    // Settings - الإعدادات
    // =====================================

    /**
     * Get user settings
     */
    static async getSettings(): Promise<any> {
        if (!State.currentUser) return null;

        try {
            const response = await ApiClient.get('/api/settings');
            return response.success ? response.data?.settings : null;
        } catch (error) {
            console.error('Get settings error:', error);
            return null;
        }
    }

    /**
     * Update user settings
     */
    static async updateSettings(data: UserSettingsData): Promise<boolean> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return false;
        }

        try {
            const response = await ApiClient.put('/api/settings', data);
            if (response.success) {
                Toast.success(t('settings.saved', State.lang));
                return true;
            }
            Toast.error(response.error || t('errors.something_wrong', State.lang));
            return false;
        } catch (error) {
            console.error('Update settings error:', error);
            Toast.error(t('errors.connection_failed', State.lang));
            return false;
        }
    }

    // =====================================
    // Posts - المنشورات
    // =====================================

    /**
     * Create a new post
     */
    static async createPost(content: string, imageUrl?: string): Promise<{ success: boolean; post?: any }> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return { success: false };
        }

        if (!content.trim()) {
            return { success: false };
        }

        try {
            const response = await ApiClient.post('/api/settings/posts', {
                content: content.trim(),
                image_url: imageUrl
            });

            if (response.success) {
                Toast.success(t('post.created', State.lang));
                return { success: true, post: response.data?.post };
            }
            return { success: false };
        } catch (error) {
            console.error('Create post error:', error);
            return { success: false };
        }
    }

    /**
     * Get user's posts
     */
    static async getUserPosts(userId: number, limit: number = 20, offset: number = 0): Promise<any[]> {
        try {
            const response = await ApiClient.get(
                `/api/settings/users/${userId}/posts?limit=${limit}&offset=${offset}`
            );
            return response.success ? response.data?.posts || [] : [];
        } catch (error) {
            console.error('Get user posts error:', error);
            return [];
        }
    }

    /**
     * Get feed
     */
    static async getFeed(limit: number = 20, offset: number = 0): Promise<any[]> {
        if (!State.currentUser) return [];

        try {
            const response = await ApiClient.get(`/api/settings/feed?limit=${limit}&offset=${offset}`);
            return response.success ? response.data?.posts || [] : [];
        } catch (error) {
            console.error('Get feed error:', error);
            return [];
        }
    }

    /**
     * Delete post
     */
    static async deletePost(postId: number): Promise<boolean> {
        if (!State.currentUser) return false;

        try {
            const response = await ApiClient.delete(`/api/settings/posts/${postId}`);
            if (response.success) {
                Toast.info(t('post.deleted', State.lang));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Delete post error:', error);
            return false;
        }
    }

    // =====================================
    // Schedule - الجدولة
    // =====================================

    /**
     * Get user's schedule
     */
    static async getSchedule(): Promise<any[]> {
        if (!State.currentUser) return [];

        try {
            const response = await ApiClient.get('/api/schedule');
            return response.success ? response.data?.schedule || [] : [];
        } catch (error) {
            console.error('Get schedule error:', error);
            return [];
        }
    }

    /**
     * Get reminders
     */
    static async getReminders(): Promise<any[]> {
        if (!State.currentUser) return [];

        try {
            const response = await ApiClient.get('/api/schedule/reminders');
            return response.success ? response.data?.reminders || [] : [];
        } catch (error) {
            console.error('Get reminders error:', error);
            return [];
        }
    }

    /**
     * Add reminder for competition
     */
    static async addReminder(competitionId: number, beforeMinutes: number = 30): Promise<boolean> {
        if (!State.currentUser) {
            Toast.warning(t('auth.login_required', State.lang));
            return false;
        }

        try {
            const response = await ApiClient.post(`/api/schedule/competitions/${competitionId}/remind`, {
                remind_before_minutes: beforeMinutes
            });

            if (response.success) {
                Toast.success(t('schedule.reminder_set', State.lang));
                return true;
            }
            Toast.error(response.error || t('errors.something_wrong', State.lang));
            return false;
        } catch (error) {
            console.error('Add reminder error:', error);
            return false;
        }
    }

    /**
     * Remove reminder
     */
    static async removeReminder(competitionId: number): Promise<boolean> {
        if (!State.currentUser) return false;

        try {
            const response = await ApiClient.delete(`/api/schedule/competitions/${competitionId}/remind`);
            if (response.success) {
                Toast.info(t('schedule.reminder_removed', State.lang));
                return true;
            }
            return false;
        } catch (error) {
            console.error('Remove reminder error:', error);
            return false;
        }
    }

    /**
     * Check if has reminder
     */
    static async hasReminder(competitionId: number): Promise<boolean> {
        try {
            const response = await ApiClient.get(`/api/schedule/competitions/${competitionId}/remind`);
            return response.success ? response.data?.hasReminder || false : false;
        } catch (error) {
            console.error('Check reminder error:', error);
            return false;
        }
    }
}

export default SettingsService;
