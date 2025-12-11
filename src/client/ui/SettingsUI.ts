/**
 * @file src/client/ui/SettingsUI.ts
 * @description واجهة الإعدادات
 * @module client/ui/SettingsUI
 */

import { State } from '../core/State';
import { SettingsService } from '../services/SettingsService';
import { t, isRTL, TRANSLATED_LANGUAGES } from '../../i18n';
import { getCountriesList } from '../../countries';
import { Toast } from './Toast';

/**
 * Settings UI Class
 * واجهة الإعدادات
 */
export class SettingsUI {
    private static settings: any = null;

    /**
     * Open settings modal
     */
    static async open(): Promise<void> {
        if (!State.currentUser) {
            window.showLoginModal?.();
            return;
        }

        this.settings = await SettingsService.getSettings();
        this.render();
    }

    /**
     * Close settings modal
     */
    static close(): void {
        const modal = document.getElementById('settings-modal');
        if (modal) modal.remove();
    }

    /**
     * Render settings modal
     */
    private static render(): void {
        const rtl = isRTL(State.lang);
        const existingModal = document.getElementById('settings-modal');
        if (existingModal) existingModal.remove();

        const countries = getCountriesList();
        const settings = this.settings || {};

        const modal = document.createElement('div');
        modal.id = 'settings-modal';
        modal.className = 'fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden">
                <div class="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                        <i class="fas fa-cog mr-2"></i>${t('settings_page.title', State.lang)}
                    </h2>
                    <button onclick="SettingsUI.close()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <form id="settings-form" onsubmit="SettingsUI.save(event)" class="p-5 space-y-5">
                    <!-- Language -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            ${t('settings_page.language', State.lang)}
                        </label>
                        <select 
                            id="setting-language" 
                            class="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 border-none text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                        >
                            ${TRANSLATED_LANGUAGES.map(lang => `
                                <option value="${lang}" ${settings.default_language === lang ? 'selected' : ''}>
                                    ${lang === 'ar' ? 'العربية' : 'English'}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Country -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            ${t('settings_page.country', State.lang)}
                        </label>
                        <select 
                            id="setting-country" 
                            class="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 border-none text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                        >
                            ${countries.map(c => `
                                <option value="${c.code}" ${settings.default_country === c.code ? 'selected' : ''}>
                                    ${c.nativeName}
                                </option>
                            `).join('')}
                        </select>
                    </div>

                    <!-- Privacy -->
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            ${t('settings_page.privacy', State.lang)}
                        </label>
                        <select 
                            id="setting-privacy" 
                            class="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 border-none text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                        >
                            <option value="public" ${settings.privacy_level === 'public' ? 'selected' : ''}>${t('settings_page.privacy_public', State.lang)}</option>
                            <option value="followers" ${settings.privacy_level === 'followers' ? 'selected' : ''}>${t('settings_page.privacy_followers', State.lang)}</option>
                            <option value="private" ${settings.privacy_level === 'private' ? 'selected' : ''}>${t('settings_page.privacy_private', State.lang)}</option>
                        </select>
                    </div>

                    <!-- Notifications -->
                    <div class="space-y-3">
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input 
                                type="checkbox" 
                                id="setting-notifications" 
                                ${settings.notifications_enabled ? 'checked' : ''}
                                class="w-5 h-5 rounded text-purple-600 focus:ring-purple-500 bg-gray-100 dark:bg-gray-800 border-gray-300"
                            >
                            <span class="text-gray-700 dark:text-gray-300">${t('settings_page.notifications', State.lang)}</span>
                        </label>
                        <label class="flex items-center gap-3 cursor-pointer">
                            <input 
                                type="checkbox" 
                                id="setting-email-notifications" 
                                ${settings.email_notifications ? 'checked' : ''}
                                class="w-5 h-5 rounded text-purple-600 focus:ring-purple-500 bg-gray-100 dark:bg-gray-800 border-gray-300"
                            >
                            <span class="text-gray-700 dark:text-gray-300">${t('settings_page.email_notifications', State.lang)}</span>
                        </label>
                    </div>

                    <!-- Submit -->
                    <button 
                        type="submit" 
                        class="w-full py-3 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-lg font-medium hover:opacity-90 transition"
                    >
                        ${t('settings_page.save', State.lang)}
                    </button>
                </form>
            </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.close();
        });
    }

    /**
     * Save settings
     */
    static async save(e: Event): Promise<void> {
        e.preventDefault();

        const langEl = document.getElementById('setting-language') as HTMLSelectElement | null;
        const countryEl = document.getElementById('setting-country') as HTMLSelectElement | null;
        const privacyEl = document.getElementById('setting-privacy') as HTMLSelectElement | null;
        const notificationsEl = document.getElementById('setting-notifications') as HTMLInputElement | null;
        const emailNotificationsEl = document.getElementById('setting-email-notifications') as HTMLInputElement | null;

        const data = {
            default_language: langEl?.value,
            default_country: countryEl?.value,
            privacy_level: privacyEl?.value as 'public' | 'followers' | 'private',
            notifications_enabled: notificationsEl?.checked,
            email_notifications: emailNotificationsEl?.checked
        };

        const success = await SettingsService.updateSettings(data);
        if (success) {
            this.close();
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).SettingsUI = SettingsUI;
}

export default SettingsUI;
