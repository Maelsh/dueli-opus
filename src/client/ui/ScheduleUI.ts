/**
 * @file src/client/ui/ScheduleUI.ts
 * @description واجهة الجدولة والتذكيرات
 * @module client/ui/ScheduleUI
 */

import { State } from '../core/State';
import { SettingsService } from '../services/SettingsService';
import { t, isRTL } from '../../i18n';
import { DateFormatter } from '../helpers/DateFormatter';

/**
 * Schedule UI Class
 * واجهة الجدولة والتذكيرات
 */
export class ScheduleUI {

    /**
     * Open schedule modal
     */
    static async open(): Promise<void> {
        if (!State.currentUser) {
            window.showLoginModal?.();
            return;
        }

        this.render();
        await this.loadSchedule();
    }

    /**
     * Close schedule modal
     */
    static close(): void {
        const modal = document.getElementById('schedule-modal');
        if (modal) modal.remove();
    }

    /**
     * Render schedule modal
     */
    private static render(): void {
        const rtl = isRTL(State.lang);
        const existingModal = document.getElementById('schedule-modal');
        if (existingModal) existingModal.remove();

        const modal = document.createElement('div');
        modal.id = 'schedule-modal';
        modal.className = 'fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-900 w-full max-w-2xl max-h-[80vh] rounded-2xl shadow-2xl overflow-hidden flex flex-col">
                <div class="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                        <i class="fas fa-calendar-alt mr-2 text-purple-500"></i>${t('schedule.title', State.lang)}
                    </h2>
                    <button onclick="ScheduleUI.close()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xl">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <div id="schedule-content" class="flex-1 overflow-y-auto p-5">
                    <div class="text-center text-gray-400">
                        <i class="fas fa-spinner fa-spin text-2xl"></i>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) this.close();
        });
    }

    /**
     * Load schedule data
     */
    private static async loadSchedule(): Promise<void> {
        const container = document.getElementById('schedule-content');
        if (!container) return;

        const [schedule, reminders] = await Promise.all([
            SettingsService.getSchedule(),
            SettingsService.getReminders()
        ]);

        if (schedule.length === 0 && reminders.length === 0) {
            container.innerHTML = `
                <div class="text-center text-gray-400 py-10">
                    <i class="fas fa-calendar-times text-5xl mb-4"></i>
                    <p>${t('schedule.empty', State.lang)}</p>
                </div>
            `;
            return;
        }

        let html = '';

        // Reminders section
        if (reminders.length > 0) {
            html += `
                <div class="mb-6">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                        <i class="fas fa-bell mr-2 text-yellow-500"></i>${t('schedule.reminders', State.lang)}
                    </h3>
                    <div class="space-y-2">
                        ${reminders.map(r => `
                            <div class="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg flex items-center gap-3">
                                <i class="fas fa-bell text-yellow-500"></i>
                                <div class="flex-1">
                                    <div class="font-medium text-gray-900 dark:text-white">${r.competition_title}</div>
                                    <div class="text-sm text-gray-500">${DateFormatter.format(r.remind_at, State.lang)}</div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        // Upcoming competitions
        if (schedule.length > 0) {
            html += `
                <div>
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-3">
                        <i class="fas fa-trophy mr-2 text-purple-500"></i>${t('schedule.upcoming', State.lang)}
                    </h3>
                    <div class="space-y-3">
                        ${schedule.map(comp => `
                            <a href="/competition/${comp.id}" class="block p-4 bg-gray-50 dark:bg-gray-800 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                <div class="flex items-center justify-between mb-2">
                                    <span class="font-medium text-gray-900 dark:text-white">${comp.title}</span>
                                    ${comp.is_creator ? `<span class="px-2 py-0.5 bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-300 text-xs rounded-full">${t('schedule.creator', State.lang)}</span>` : ''}
                                </div>
                                <div class="flex items-center gap-4 text-sm text-gray-500">
                                    <span><i class="fas fa-folder mr-1"></i>${comp.category_name_ar || comp.category_name_en}</span>
                                    <span><i class="fas fa-clock mr-1"></i>${DateFormatter.format(comp.scheduled_at, State.lang)}</span>
                                </div>
                            </a>
                        `).join('')}
                    </div>
                </div>
            `;
        }

        container.innerHTML = html;
    }

    /**
     * Toggle reminder for competition
     */
    static async toggleReminder(competitionId: number, hasReminder: boolean): Promise<boolean> {
        if (!State.currentUser) {
            window.showLoginModal?.();
            return false;
        }

        if (hasReminder) {
            return await SettingsService.removeReminder(competitionId);
        } else {
            return await SettingsService.addReminder(competitionId);
        }
    }

    /**
     * Render reminder button HTML
     */
    static renderReminderButton(competitionId: number, hasReminder: boolean): string {
        return `
            <button 
                onclick="ScheduleUI.toggleReminder(${competitionId}, ${hasReminder})"
                class="flex items-center gap-2 px-3 py-1.5 rounded-full ${hasReminder ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600' : 'bg-gray-100 dark:bg-gray-800'} hover:opacity-80 transition"
                title="${t(hasReminder ? 'schedule.remove_reminder' : 'schedule.add_reminder', State.lang)}"
            >
                <i class="fas fa-bell${hasReminder ? '' : '-slash'}"></i>
            </button>
        `;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).ScheduleUI = ScheduleUI;
}

export default ScheduleUI;
