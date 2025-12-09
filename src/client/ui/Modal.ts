/**
 * @file src/client/ui/Modal.ts
 * @description إدارة النوافذ المنبثقة
 * @module client/ui/Modal
 */

import { State } from '../core/State';
import { t } from '../../i18n/translations';

/**
 * Modal Management Class
 * إدارة النوافذ المنبثقة
 */
export class Modal {
    /**
     * Show modal by ID
     */
    static show(id: string): void {
        const modal = document.getElementById(id);
        if (modal) {
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';

            setTimeout(() => {
                const backdrop = modal.querySelector('.modal-backdrop');
                const content = modal.querySelector('.modal-content');
                if (backdrop) backdrop.classList.add('show');
                if (content) content.classList.add('show');
            }, 10);
        }
    }

    /**
     * Hide modal by ID
     */
    static hide(id: string): void {
        const modal = document.getElementById(id);
        if (modal) {
            const backdrop = modal.querySelector('.modal-backdrop');
            const content = modal.querySelector('.modal-content');

            if (backdrop) backdrop.classList.remove('show');
            if (content) content.classList.remove('show');

            setTimeout(() => {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
            }, 200);
        }
    }

    /**
     * Show login modal
     */
    static showLogin(): void {
        this.show('loginModal');
    }

    /**
     * Hide login modal
     */
    static hideLogin(): void {
        const modal = document.getElementById('loginModal');
        if (modal) {
            const backdrop = modal.querySelector('.modal-backdrop');
            const content = modal.querySelector('.modal-content');

            if (backdrop) backdrop.classList.remove('show');
            if (content) content.classList.remove('show');

            setTimeout(() => {
                modal.classList.add('hidden');
                document.body.style.overflow = '';
                // Reset forms
                const loginForm = document.getElementById('loginForm')?.querySelector('form');
                const registerForm = document.getElementById('registerForm')?.querySelector('form');
                if (loginForm) loginForm.reset();
                if (registerForm) registerForm.reset();
                this.hideAuthMessage();
            }, 200);
        }
    }

    /**
     * Show custom modal
     */
    static showCustom(title: string, message: string, btnText: string, iconName: string = 'info-circle'): void {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in';
        modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center transform transition-all scale-95 animate-scale-in border border-gray-100 dark:border-gray-700">
        <div class="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-${iconName} text-2xl text-purple-600 dark:text-purple-400"></i>
        </div>
        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">${title}</h3>
        <p class="text-gray-600 dark:text-gray-300 mb-6">${message}</p>
        <button onclick="this.closest('div.fixed').remove()" class="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-purple-500/25">
          ${btnText}
        </button>
      </div>
    `;
        document.body.appendChild(modal);
    }

    /**
     * Show auth message
     */
    static showAuthMessage(message: string, type: 'error' | 'success' | 'info' = 'error'): void {
        const msg = document.getElementById('authMessage');
        if (msg) {
            msg.textContent = message;
            msg.classList.remove('hidden', 'bg-red-100', 'bg-green-100', 'bg-blue-100', 'text-red-700', 'text-green-700', 'text-blue-700');
            if (type === 'success') {
                msg.classList.add('bg-green-100', 'text-green-700');
            } else if (type === 'info') {
                msg.classList.add('bg-blue-100', 'text-blue-700');
            } else {
                msg.classList.add('bg-red-100', 'text-red-700');
            }
        }
    }

    /**
     * Hide auth message
     */
    static hideAuthMessage(): void {
        const msg = document.getElementById('authMessage');
        if (msg) msg.classList.add('hidden');
    }

    /**
     * Switch auth tabs (login/register)
     */
    static switchAuthTab(tab: 'login' | 'register'): void {
        const loginTab = document.getElementById('loginTab');
        const registerTab = document.getElementById('registerTab');
        const loginForm = document.getElementById('loginForm');
        const registerForm = document.getElementById('registerForm');

        this.hideAuthMessage();

        if (tab === 'login') {
            loginTab?.classList.add('bg-white', 'dark:bg-gray-700', 'text-purple-600', 'dark:text-purple-400', 'shadow-sm');
            loginTab?.classList.remove('text-gray-600', 'dark:text-gray-400');
            registerTab?.classList.remove('bg-white', 'dark:bg-gray-700', 'text-purple-600', 'dark:text-purple-400', 'shadow-sm');
            registerTab?.classList.add('text-gray-600', 'dark:text-gray-400');
            loginForm?.classList.remove('hidden');
            registerForm?.classList.add('hidden');
        } else {
            registerTab?.classList.add('bg-white', 'dark:bg-gray-700', 'text-purple-600', 'dark:text-purple-400', 'shadow-sm');
            registerTab?.classList.remove('text-gray-600', 'dark:text-gray-400');
            loginTab?.classList.remove('bg-white', 'dark:bg-gray-700', 'text-purple-600', 'dark:text-purple-400', 'shadow-sm');
            loginTab?.classList.add('text-gray-600', 'dark:text-gray-400');
            registerForm?.classList.remove('hidden');
            loginForm?.classList.add('hidden');
        }
    }

    /**
     * Show forgot password form
     */
    static showForgotPassword(): void {
        document.getElementById('loginForm')?.classList.add('hidden');
        document.getElementById('forgotPasswordForm')?.classList.remove('hidden');
        document.getElementById('resetStep1')?.classList.remove('hidden');
        document.getElementById('resetStep2')?.classList.add('hidden');
        document.getElementById('resetStep3')?.classList.add('hidden');
        this.hideAuthMessage();
    }

    /**
     * Show login form (back from forgot password)
     */
    static showLoginForm(): void {
        document.getElementById('forgotPasswordForm')?.classList.add('hidden');
        document.getElementById('loginForm')?.classList.remove('hidden');
        this.hideAuthMessage();
    }

    /**
     * Show coming soon modal
     */
    static showComingSoon(providerName: string): void {
        const title = t('modals.coming_soon_title', State.lang);
        const message = t('client.modal.coming_soon_provider', State.lang).replace('{provider}', providerName);
        const btnText = t('general.ok', State.lang);
        this.showCustom(title, message, btnText, 'rocket');
    }

    /**
     * Show OAuth error modal
     */
    static showOAuthError(errorCode: string): void {
        let title = t('general.warning', State.lang);
        let message = t('client.modal.oauth_error', State.lang);
        const icon = 'exclamation-circle';

        if (errorCode === 'INVALID_EMAIL_DOMAIN') {
            title = t('auth.invalid_email_domain', State.lang);
            message = t('client.modal.unsupported_email_desc', State.lang);
        } else if (errorCode === 'PROVIDER_ERROR') {
            message = t('client.modal.provider_connection_error', State.lang);
        }

        this.showCustom(title, message, t('general.close', State.lang), icon);
    }

    /**
     * Show help modal
     */
    static showHelp(): void {
        const title = t('general.app_title', State.lang);
        const content = t('client.help.content', State.lang);
        alert(`${title}\n\n${content}`);
    }
}

export default Modal;
