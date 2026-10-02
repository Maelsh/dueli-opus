/**
 * @file src/client/ui/Modal.ts
 * @description إدارة النوافذ المنبثقة
 * @module client/ui/Modal
 */

import { State } from '../core/State';
import { t } from '../../i18n';
import { DUELI_MODAL_GRADIENT, DUELI_MODAL_GRADIENT_HOVER } from '../../shared/constants';

/**
 * Focusable selectors for the modal focus trap (no positive tabindex trapping).
 */
const FOCUSABLE_SELECTOR =
    'a[href], button:not([disabled]), textarea:not([disabled]), ' +
    'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Modal Management Class
 * إدارة النوافذ المنبثقة
 */
export class Modal {
    private static lastFocused: Element | null = null;
    private static trapHandler: ((e: KeyboardEvent) => void) | null = null;
    private static trapRoot: HTMLElement | null = null;

    /**
     * Whether a control is actually reachable by Tab right now.
     *
     * `offsetParent` cannot be used: it is null for every descendant of a
     * `position: fixed` container (the modal root itself), and it is also null
     * for everything under jsdom, so neither signal is reliable on its own.
     * Instead walk the ancestor chain for `display:none` / `visibility:hidden`
     * (the auth modal keeps its register / forgot-password forms hidden), which
     * behaves identically in a browser and under jsdom.
     */
    private static isVisible(el: HTMLElement): boolean {
        if (el.hasAttribute('disabled')) return false;
        if ((el as HTMLInputElement).disabled) return false;
        if (el.getAttribute('aria-hidden') === 'true') return false;
        if (typeof getComputedStyle !== 'function') return true;
        for (let cur: HTMLElement | null = el; cur; cur = cur.parentElement) {
            const cs = getComputedStyle(cur);
            if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        }
        return true;
    }

    /**
     * Show modal by ID
     */
    static show(id: string): void {
        const modal = document.getElementById(id);
        if (modal) {
            // Always re-capture: only one modal is open at a time, and a stale
            // reference would otherwise be restored on close.
            Modal.lastFocused = document.activeElement instanceof Element ? document.activeElement : null;
            modal.setAttribute('role', 'dialog');
            modal.setAttribute('aria-modal', 'true');
            modal.classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            Modal.attachTrap(modal as HTMLElement, () => Modal.hide(id));

            setTimeout(() => {
                const backdrop = modal.querySelector('.modal-backdrop');
                const content = modal.querySelector('.modal-content');
                if (backdrop) backdrop.classList.add('show');
                if (content) content.classList.add('show');
                Modal.focusFirst(modal as HTMLElement);
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
                Modal.detachTrap();
                Modal.restoreFocus();
            }, 200);
        }
    }

    /**
     * Focus the first focusable element inside a modal root.
     */
    private static focusFirst(root: HTMLElement): void {
        const first = root.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        if (first) first.focus();
        else {
            if (!root.hasAttribute('tabindex')) root.setAttribute('tabindex', '-1');
            root.focus();
        }
    }

    /**
     * Restore focus to the element that opened the modal.
     */
    private static restoreFocus(): void {
        if (Modal.lastFocused instanceof HTMLElement && document.contains(Modal.lastFocused)) {
            Modal.lastFocused.focus();
        }
        Modal.lastFocused = null;
    }

    /**
     * Attach a CSP-safe focus trap (Tab / Shift+Tab cycling) plus Escape dismissal.
     * Uses an external listener only — no inline handlers.
     */
    private static attachTrap(root: HTMLElement, onEscape: () => void): void {
        Modal.detachTrap();
        Modal.trapRoot = root;
        Modal.trapHandler = (e: KeyboardEvent) => {
            const current = Modal.trapRoot;
            if (!current || current.classList.contains('hidden')) return;
            if (e.key === 'Escape') {
                e.preventDefault();
                onEscape();
                return;
            }
            if (e.key !== 'Tab') return;
            const focusables = Array.from(current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
                .filter((el) => Modal.isVisible(el));
            if (focusables.length === 0) {
                e.preventDefault();
                current.focus();
                return;
            }
            const first = focusables[0];
            const last = focusables[focusables.length - 1];
            const active = document.activeElement as HTMLElement | null;
            if (e.shiftKey && (active === first || !current.contains(active))) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && active === last) {
                e.preventDefault();
                first.focus();
            }
        };
        document.addEventListener('keydown', Modal.trapHandler, true);
    }

    private static detachTrap(): void {
        if (Modal.trapHandler) {
            document.removeEventListener('keydown', Modal.trapHandler, true);
            Modal.trapHandler = null;
        }
        Modal.trapRoot = null;
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
                Modal.detachTrap();
                Modal.restoreFocus();
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
        // Always re-capture: only one modal is open at a time, and a stale
        // reference would otherwise be restored on close.
        Modal.lastFocused = document.activeElement instanceof Element ? document.activeElement : null;
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-label', title);
        modal.innerHTML = `
      <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center transform transition-all scale-95 animate-scale-in border border-gray-100 dark:border-gray-700">
        <div class="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
          <i class="fas fa-${iconName} text-2xl text-purple-600 dark:text-purple-400"></i>
        </div>
        <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">${title}</h3>
        <p class="text-gray-600 dark:text-gray-300 mb-6">${message}</p>
        <button data-csp-on="click" data-csp-fn="__closestRemove" data-csp-args='["@this","div.fixed"]' class="w-full py-3 px-4 ${DUELI_MODAL_GRADIENT} ${DUELI_MODAL_GRADIENT_HOVER} text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-purple-500/25">
          ${btnText}
        </button>
      </div>
    `;
        document.body.appendChild(modal);
        document.body.style.overflow = 'hidden';
        Modal.attachTrap(modal, () => {
            modal.remove();
            document.body.style.overflow = '';
            Modal.detachTrap();
            Modal.restoreFocus();
        });
        // CSP-safe close: the delegated __closestRemove only removes the node,
        // so observe removal to also restore the scroll lock and focus.
        const observer = new MutationObserver(() => {
            if (!document.contains(modal)) {
                observer.disconnect();
                document.body.style.overflow = '';
                Modal.detachTrap();
                Modal.restoreFocus();
            }
        });
        observer.observe(document.body, { childList: true });
        Modal.focusFirst(modal);
    }

    /**
     * Show auth message
     */
    static showAuthMessage(message: string, type: 'error' | 'success' | 'info' = 'error'): void {        const msg = document.getElementById('authMessage');
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
     * Show an email-sent success message with the shared Spam/Junk guidance
     * beside it (i18n key `auth_check_spam_folder` — never hardcoded).
     * Use ONLY on paths where an email was actually accepted for sending;
     * failures keep plain showAuthMessage so no success guidance appears.
     */
    static showEmailSentMessage(message: string): void {
        this.showAuthMessage(`${message}\n${t('auth_check_spam_folder', State.lang)}`, 'success');
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
