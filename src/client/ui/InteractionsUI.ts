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
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', t('report.title', State.lang));
        modal.innerHTML = `
            <div class="bg-white dark:bg-gray-900 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                <div class="p-5 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white">
                        <i class="fas fa-flag mr-2 text-red-500"></i>${t('report.title', State.lang)}
                    </h2>
                    <button data-csp-on="click" data-csp-fn="__byIdRemove" data-csp-args='["report-modal"]' aria-label="${t('close', State.lang)}" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                        <i class="fas fa-times" aria-hidden="true"></i>
                    </button>
                </div>
                
                <form id="report-form" class="p-5 space-y-4">
                    <input type="hidden" id="report-target-type" value="${targetType}">
                    <input type="hidden" id="report-target-id" value="${targetId}">
                    
                    <div>
                        <label for="report-reason" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                        <label for="report-description" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                        data-csp-on="click" data-csp-fn="InteractionsUI.submitReport" data-csp-args='["@event"]'
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
        // R3-C1: Escape dismisses; focus starts on the dialog itself.
        modal.setAttribute('tabindex', '-1');
        modal.addEventListener('keydown', (e) => {
            if ((e as KeyboardEvent).key === 'Escape') modal.remove();
        });
        modal.focus?.();
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
     * R2-L2: single-active reaction toggle (like/dislike/neutral) for
     * thumbs buttons. Counts repaint from the server response only.
     */
    static async toggleReaction(competitionId: number, type: 'like' | 'dislike', button: HTMLElement): Promise<void> {
        if (!State.currentUser) {
            window.showLoginModal?.();
            return;
        }
        const bar = button.closest('#reactionBar, [data-reaction-bar]') || button.parentElement;
        const pressed = button.getAttribute('aria-pressed') === 'true';
        const result = await InteractionService.setReaction(competitionId, type, pressed);
        if (result.success && result.status && bar) {
            const likeBtn = bar.querySelector('#likeBtn, [data-reaction="like"]');
            const dislikeBtn = bar.querySelector('#dislikeBtn, [data-reaction="dislike"]');
            const likeCount = bar.querySelector('#likeCount, [data-reaction-count="like"]');
            const dislikeCount = bar.querySelector('#dislikeCount, [data-reaction-count="dislike"]');
            likeBtn?.setAttribute('aria-pressed', String(result.status.liked));
            dislikeBtn?.setAttribute('aria-pressed', String(result.status.disliked));
            if (likeCount) likeCount.textContent = String(result.status.likes_count);
            if (dislikeCount) dislikeCount.textContent = String(result.status.dislikes_count);
        }
    }

    /**
     * R2-L2: Like + Dislike button pair (thumbs, single-active). This is the
     * forward path — renderLikeButton (heart) stays as a legacy alias only.
     */
    static renderReactionButtons(
        competitionId: number,
        status: { liked: boolean; disliked: boolean },
        counts: { likes_count: number; dislikes_count: number }
    ): string {
        return `
            <button
                data-csp-on="click" data-csp-fn="InteractionsUI.toggleReaction" data-csp-args='[${competitionId},"like","@this"]'
                data-reaction="like" aria-pressed="${status.liked}"
                class="flex items-center gap-2 px-3 py-1.5 rounded-full transition ${status.liked ? 'bg-green-100 dark:bg-green-900/30 text-green-600' : 'bg-gray-100 dark:bg-gray-800 hover:bg-green-50 hover:text-green-600'}"
                aria-label="${t('like.title', State.lang)}"
            >
                <i class="fas fa-thumbs-up"></i>
                <span data-reaction-count="like">${counts.likes_count}</span>
            </button>
            <button
                data-csp-on="click" data-csp-fn="InteractionsUI.toggleReaction" data-csp-args='[${competitionId},"dislike","@this"]'
                data-reaction="dislike" aria-pressed="${status.disliked}"
                class="flex items-center gap-2 px-3 py-1.5 rounded-full transition ${status.disliked ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-gray-100 dark:bg-gray-800 hover:bg-red-50 hover:text-red-500'}"
                aria-label="${t('interactions.dislike', State.lang)}"
            >
                <i class="fas fa-thumbs-down"></i>
                <span data-reaction-count="dislike">${counts.dislikes_count}</span>
            </button>
        `;
    }

    /**
     * Render like button HTML (legacy heart alias — prefer renderReactionButtons).
     */
    static renderLikeButton(competitionId: number, liked: boolean, likeCount: number): string {
        return `
            <button 
                data-csp-on="click" data-csp-fn="InteractionsUI.toggleLike" data-csp-args='[${competitionId},"@this"]'
                class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition"
                aria-pressed="${liked}"
                aria-label="${t('like.title', State.lang)}"
            >
                <i class="${liked ? 'fas text-red-500' : 'far'} fa-heart" aria-hidden="true"></i>
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
                data-csp-on="click" data-csp-fn="InteractionsUI.showReportModal" data-csp-args='[${JSON.stringify((targetType))},${targetId}]'
                class="text-gray-400 hover:text-red-500 transition"
                aria-label="${t('report.title', State.lang)}"
                title="${t('report.title', State.lang)}"
            >
                <i class="fas fa-flag" aria-hidden="true"></i>
            </button>
        `;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).InteractionsUI = InteractionsUI;
}

export default InteractionsUI;
