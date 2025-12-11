/**
 * @file src/client/ui/InteractionsUI.ts
 * @description واجهة التفاعلات (الإعجابات والبلاغات)
 * @module client/ui/InteractionsUI
 */

import { State } from '../core/State';
import { InteractionService } from '../services/InteractionService';
import { t, isRTL } from '../../i18n';
import { Toast } from './Toast';

/**
 * Interactions UI Class
 * واجهة التفاعلات
 */
export class InteractionsUI {

    /**
     * Handle like button click
     */
    static async toggleLike(competitionId: number, button: HTMLElement): Promise<void> {
        if (!State.currentUser) {
            window.showLoginModal?.();
            return;
        }

        const icon = button.querySelector('i');
        const countSpan = button.querySelector('span');
        const isLiked = icon?.classList.contains('fas');

        // Optimistic update
        if (isLiked) {
            icon?.classList.remove('fas', 'text-red-500');
            icon?.classList.add('far');
        } else {
            icon?.classList.remove('far');
            icon?.classList.add('fas', 'text-red-500');
        }

        const result = await InteractionService.toggleLike(competitionId, isLiked || false);

        if (result.success && countSpan) {
            countSpan.textContent = String(result.likeCount || 0);
        } else if (!result.success) {
            // Revert on failure
            if (isLiked) {
                icon?.classList.remove('far');
                icon?.classList.add('fas', 'text-red-500');
            } else {
                icon?.classList.remove('fas', 'text-red-500');
                icon?.classList.add('far');
            }
        }
    }

    /**
     * Show report modal
     */
    static showReportModal(targetType: 'user' | 'competition' | 'comment', targetId: number): void {
        if (!State.currentUser) {
            window.showLoginModal?.();
            return;
        }

        const rtl = isRTL(State.lang);
        const existingModal = document.getElementById('report-modal');
        if (existingModal) existingModal.remove();

        const reasons: Record<string, string[]> = {
            user: ['spam', 'harassment', 'fake_account', 'inappropriate_content', 'other'],
            competition: ['spam', 'misleading', 'inappropriate_content', 'copyright', 'other'],
            comment: ['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'other']
        };

        const modal = document.createElement('div');
        modal.id = 'report-modal';
        modal.className = 'fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4';
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                <div class="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                        <i class="fas fa-flag mr-2 text-red-500"></i>${t('report.title', State.lang)}
                    </h2>
                    <button onclick="document.getElementById('report-modal').remove()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                
                <form id="report-form" class="p-5 space-y-4">
                    <input type="hidden" id="report-target-type" value="${targetType}">
                    <input type="hidden" id="report-target-id" value="${targetId}">
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            ${t('report.reason', State.lang)}
                        </label>
                        <select 
                            id="report-reason" 
                            required
                            class="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 border-none text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500"
                        >
                            <option value="">${t('report.select_reason', State.lang)}</option>
                            ${reasons[targetType].map(r => `
                                <option value="${r}">${t(`report.reason_${r}`, State.lang)}</option>
                            `).join('')}
                        </select>
                    </div>

                    <div>
                        <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            ${t('report.description', State.lang)}
                        </label>
                        <textarea 
                            id="report-description" 
                            rows="3"
                            placeholder="${t('report.description_placeholder', State.lang)}"
                            class="w-full px-4 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 border-none text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 resize-none"
                        ></textarea>
                    </div>

                    <button 
                        type="submit" 
                        onclick="InteractionsUI.submitReport(event)"
                        class="w-full py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition"
                    >
                        ${t('report.submit', State.lang)}
                    </button>
                </form>
            </div>
        `;

        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });
    }

    /**
     * Submit report
     */
    static async submitReport(e: Event): Promise<void> {
        e.preventDefault();

        const targetTypeEl = document.getElementById('report-target-type') as HTMLInputElement | null;
        const targetIdEl = document.getElementById('report-target-id') as HTMLInputElement | null;
        const reasonEl = document.getElementById('report-reason') as HTMLSelectElement | null;
        const descriptionEl = document.getElementById('report-description') as HTMLTextAreaElement | null;

        const targetType = targetTypeEl?.value as 'user' | 'competition' | 'comment';
        const targetId = parseInt(targetIdEl?.value || '0');
        const reason = reasonEl?.value;
        const description = descriptionEl?.value;

        if (!reason) {
            Toast.error(t('report.select_reason', State.lang));
            return;
        }

        const success = await InteractionService.report({
            target_type: targetType,
            target_id: targetId,
            reason,
            description: description || undefined
        });

        if (success) {
            document.getElementById('report-modal')?.remove();
        }
    }

    /**
     * Render like button HTML
     */
    static renderLikeButton(competitionId: number, liked: boolean, likeCount: number): string {
        return `
            <button 
                onclick="InteractionsUI.toggleLike(${competitionId}, this)"
                class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
            >
                <i class="${liked ? 'fas text-red-500' : 'far'} fa-heart"></i>
                <span>${likeCount}</span>
            </button>
        `;
    }

    /**
     * Render report button HTML
     */
    static renderReportButton(targetType: string, targetId: number): string {
        return `
            <button 
                onclick="InteractionsUI.showReportModal('${targetType}', ${targetId})"
                class="text-gray-400 hover:text-red-500 transition"
                title="${t('report.title', State.lang)}"
            >
                <i class="fas fa-flag"></i>
            </button>
        `;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).InteractionsUI = InteractionsUI;
}

export default InteractionsUI;
