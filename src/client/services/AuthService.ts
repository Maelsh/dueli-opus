/**
 * @file src/client/services/AuthService.ts
 * @description خدمة المصادقة
 * @module client/services/AuthService
 */

import { State } from '../core/State';
import { CookieUtils } from '../core/CookieUtils';
import { Toast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { NotificationsUI } from '../ui/NotificationsUI';
import { MessagesUI } from '../ui/MessagesUI';
import { t } from '../../i18n';

/**
 * API Response Types
 */
interface ApiResponse {
    success?: boolean;
    error?: string;
    message?: string;
    user?: any;
    data?: { user?: any; message?: string; sessionId?: string };
    sessionId?: string;
}

/**
 * Authentication Service Class
 * خدمة المصادقة
 */
export class AuthService {
    /**
     * Check authentication status
     */
    static async checkAuth(): Promise<boolean> {
        const cookieSession = CookieUtils.get('sessionId');
        const savedSession = cookieSession || localStorage.getItem('sessionId');

        if (savedSession) {
            try {
                const res = await fetch('/api/auth/session', {
                    method: 'GET',
                    headers: {
                        'Authorization': 'Bearer ' + savedSession,
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                });

                const data = await res.json() as ApiResponse;
                const user = data.user || data.data?.user || data;

                if (user && (user.id || user.user_id || user.email)) {
                    State.currentUser = user;
                    State.sessionId = savedSession;

                    // Apply user's language/country preferences from database
                    if (user.language) {
                        State.lang = user.language;
                        CookieUtils.set('lang', user.language, 365);
                    }
                    if (user.country) {
                        State.country = user.country;
                        CookieUtils.set('country', user.country, 365);
                    }

                    // Update storage
                    localStorage.setItem('user', JSON.stringify(user));
                    localStorage.setItem('sessionId', savedSession);
                    CookieUtils.set('sessionId', savedSession, 7);

                    this.updateAuthUI();
                    return true;
                } else {
                    this.clearAuth();
                }
            } catch (err) {
                console.error('Auth check failed:', err);
                this.clearAuth();
            }
        }

        this.updateAuthUI();
        return false;
    }

    /**
     * Clear authentication data
     */
    static clearAuth(): void {
        localStorage.removeItem('user');
        localStorage.removeItem('sessionId');
        CookieUtils.delete('sessionId');
        State.currentUser = null;
        State.sessionId = null;
    }

    /**
     * Update authentication UI
     */
    static updateAuthUI(): void {
        const authSection = document.getElementById('authSection');
        const userSection = document.getElementById('userSection');
        const createCompBtn = document.getElementById('createCompBtn');
        const upcomingTab = document.getElementById('tab-upcoming');
        const helpIcon = document.getElementById('helpIcon');

        if (State.currentUser) {
            // User is logged in
            if (authSection) authSection.classList.add('hidden');
            if (userSection) {
                userSection.classList.remove('hidden');

                const userAvatar = document.getElementById('userAvatar') as HTMLImageElement;
                const userName = document.getElementById('userName');
                const userEmail = document.getElementById('userEmail');

                if (userAvatar) {
                    const avatarSeed = State.currentUser.display_name || State.currentUser.username || 'user';
                    userAvatar.src = State.currentUser.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(avatarSeed);
                }
                if (userName) userName.textContent = State.currentUser.display_name || State.currentUser.username;
                if (userEmail) userEmail.textContent = State.currentUser.email;
            }
            if (createCompBtn) createCompBtn.classList.remove('hidden');

            // Show upcoming tab for logged-in users
            if (upcomingTab) upcomingTab.classList.remove('hidden');

            // Hide help icon for logged-in users (use auth-hidden to override nav-icon)
            if (helpIcon) helpIcon.classList.add('auth-hidden');

            // Initialize notifications and messages
            NotificationsUI.init();
            MessagesUI.init();
        } else {
            // User is not logged in
            if (authSection) authSection.classList.remove('hidden');
            if (userSection) userSection.classList.add('hidden');
            if (createCompBtn) createCompBtn.classList.add('hidden');

            // Hide upcoming tab for non-logged-in users
            if (upcomingTab) upcomingTab.classList.add('hidden');

            // Show help icon for non-logged-in users
            if (helpIcon) helpIcon.classList.remove('auth-hidden');
        }
    }

    /**
     * Handle OAuth success
     */
    static async handleOAuthSuccess(session: string, fromUrl: boolean = false): Promise<void> {
        try {
            // Save to cookies
            CookieUtils.set('sessionId', session, 7);
            localStorage.setItem('sessionId', session);

            // Remove session from URL if needed
            if (fromUrl) {
                window.history.replaceState({}, document.title,
                    window.location.pathname + window.location.search.replace(/[\?&]session=[^&]+/, '').replace(/^&/, '?')
                );
            }

            // Fetch user info
            const response = await fetch('/api/auth/session', {
                method: 'GET',
                headers: {
                    'Authorization': 'Bearer ' + session,
                    'Content-Type': 'application/json'
                },
                credentials: 'include'
            });

            const data = await response.json() as ApiResponse;
            const user = data.user || data.data?.user || data;

            if (user && (user.id || user.user_id || user.email)) {
                localStorage.setItem('user', JSON.stringify(user));
                State.currentUser = user;
                State.sessionId = session;

                this.updateAuthUI();
                Modal.hideLogin();

                Toast.success(t('auth.login_success', State.lang));

                setTimeout(() => {
                    window.location.reload();
                }, 1000);
            } else {
                throw new Error('Invalid user data');
            }
        } catch (error) {
            console.error('OAuth success handler error:', error);
            Toast.error(t('auth.connection_failed', State.lang));
        }
    }

    /**
     * Handle login form submission
     */
    static async handleLogin(e: Event): Promise<void> {
        e.preventDefault();
        Modal.hideAuthMessage();

        const emailInput = document.getElementById('loginEmail') as HTMLInputElement;
        const passwordInput = document.getElementById('loginPassword') as HTMLInputElement;

        const email = emailInput?.value;
        const password = passwordInput?.value;

        try {
            const res = await fetch(`/api/auth/login?lang=${State.lang}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });

            const data = await res.json() as ApiResponse;



            if (data.success) {
                // Server wraps response in data.data
                const responseData = data.data || data;
                const user = responseData.user;
                const sessionId = responseData.sessionId;



                State.currentUser = user;
                State.sessionId = sessionId || null;
                localStorage.setItem('user', JSON.stringify(user));
                localStorage.setItem('sessionId', sessionId || '');
                CookieUtils.set('sessionId', sessionId || '', 7);



                this.updateAuthUI();
                Modal.hideLogin();
                Toast.success(t('client.toast.welcome', State.lang));
            } else {

                Modal.showAuthMessage(data.error || t('auth_invalid_credentials', State.lang), 'error');
            }
        } catch (error) {
            console.error('Login error:', error);
            Modal.showAuthMessage(t('auth.connection_failed', State.lang), 'error');
        }
    }

    /**
     * Handle registration form submission
     */
    static async handleRegister(e: Event): Promise<void> {
        e.preventDefault();
        Modal.hideAuthMessage();

        const nameInput = document.getElementById('registerName') as HTMLInputElement;
        const emailInput = document.getElementById('registerEmail') as HTMLInputElement;
        const passwordInput = document.getElementById('registerPassword') as HTMLInputElement;

        const name = nameInput?.value;
        const email = emailInput?.value;
        const password = passwordInput?.value;

        // Get country and language using centralized State methods
        // Priority: User DB > Cookie > Browser/Device > Default (US/en)
        const country = State.getCountry();
        const language = State.getLanguage();

        try {
            const res = await fetch(`/api/auth/register?lang=${State.lang}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, country, language })
            });

            const data = await res.json() as ApiResponse;

            if (data.success) {
                Modal.showAuthMessage(data.data?.message || t('auth_register_success', State.lang), 'success');
                const form = document.getElementById('registerForm')?.querySelector('form');
                if (form) form.reset();
                // Switch to login tab after 2 seconds
                setTimeout(() => Modal.switchAuthTab('login'), 2000);
            } else {
                Modal.showAuthMessage(data.error || t('auth_email_exists', State.lang), 'error');
            }
        } catch (error) {
            console.error('Registration error:', error);
            Modal.showAuthMessage(t('auth.connection_failed', State.lang), 'error');
        }
    }

    /**
     * Handle forgot password - Step 1
     */
    static async handleForgotPassword(e: Event): Promise<void> {
        e.preventDefault();
        Modal.hideAuthMessage();

        const emailInput = document.getElementById('resetEmail') as HTMLInputElement;
        const email = emailInput?.value;

        try {
            const res = await fetch(`/api/auth/forgot-password?lang=${State.lang}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const data = await res.json() as ApiResponse;

            if (data.success) {
                Modal.showAuthMessage(data.data?.message || t('auth_reset_code_sent', State.lang), 'success');
                document.getElementById('resetStep1')?.classList.add('hidden');
                document.getElementById('resetStep2')?.classList.remove('hidden');
            } else {
                Modal.showAuthMessage(data.error || t('errors.something_wrong', State.lang), 'error');
            }
        } catch (error) {
            console.error('Forgot password error:', error);
            Modal.showAuthMessage(t('auth.connection_failed', State.lang), 'error');
        }
    }

    /**
     * Handle verify reset code - Step 2
     */
    static async handleVerifyResetCode(e: Event): Promise<void> {
        e.preventDefault();
        Modal.hideAuthMessage();

        const emailInput = document.getElementById('resetEmail') as HTMLInputElement;
        const codeInput = document.getElementById('resetCode') as HTMLInputElement;

        const email = emailInput?.value;
        const code = codeInput?.value;

        try {
            const res = await fetch(`/api/auth/verify-reset-code?lang=${State.lang}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code })
            });

            const data = await res.json() as ApiResponse;

            if (data.success) {
                Modal.showAuthMessage(data.data?.message || t('auth_code_verified', State.lang), 'success');
                document.getElementById('resetStep2')?.classList.add('hidden');
                document.getElementById('resetStep3')?.classList.remove('hidden');
            } else {
                Modal.showAuthMessage(data.error || t('auth_invalid_code', State.lang), 'error');
            }
        } catch (error) {
            console.error('Verify code error:', error);
            Modal.showAuthMessage(t('auth.connection_failed', State.lang), 'error');
        }
    }

    /**
     * Handle reset password - Step 3
     */
    static async handleResetPassword(e: Event): Promise<void> {
        e.preventDefault();
        Modal.hideAuthMessage();

        const emailInput = document.getElementById('resetEmail') as HTMLInputElement;
        const codeInput = document.getElementById('resetCode') as HTMLInputElement;
        const newPasswordInput = document.getElementById('newPassword') as HTMLInputElement;

        const email = emailInput?.value;
        const code = codeInput?.value;
        const newPassword = newPasswordInput?.value;

        try {
            const res = await fetch(`/api/auth/reset-password?lang=${State.lang}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, code, newPassword })
            });

            const data = await res.json() as ApiResponse;

            if (data.success) {
                Modal.showAuthMessage(data.data?.message || t('auth_password_changed', State.lang), 'success');
                setTimeout(() => {
                    Modal.showLoginForm();
                    const form = document.getElementById('forgotPasswordForm')?.querySelector('form');
                    if (form) form.reset();
                }, 2000);
            } else {
                Modal.showAuthMessage(data.error || t('errors.something_wrong', State.lang), 'error');
            }
        } catch (error) {
            console.error('Reset password error:', error);
            Modal.showAuthMessage(t('auth.connection_failed', State.lang), 'error');
        }
    }

    /**
     * Login with OAuth provider
     */
    static loginWith(provider: string): void {
        const providerNames: Record<string, string> = {
            google: 'Google',
            facebook: 'Facebook',
            microsoft: 'Microsoft',
            tiktok: 'TikTok',
            twitter: 'X (Twitter)',
            snapchat: 'Snapchat'
        };

        if (provider === 'twitter' || provider === 'snapchat') {
            Modal.showComingSoon(providerNames[provider]);
            return;
        }

        const width = 600;
        const height = 700;
        const left = (window.screen.width - width) / 2;
        const top = (window.screen.height - height) / 2;

        const popup = window.open(
            `/api/auth/oauth/${provider}?lang=${State.lang}`,
            'oauth_popup',
            `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
        );

        if (!popup) {
            Toast.warning(t('client.toast.allow_popups', State.lang));
            return;
        }

        // Listen for OAuth callback
        const handleOAuthCallback = async (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;

            if (event.data.type === 'oauth_success' && event.data.session) {
                window.removeEventListener('message', handleOAuthCallback);
                if (popup && !popup.closed) popup.close();
                await this.handleOAuthSuccess(event.data.session, false);
            } else if (event.data.type === 'oauth_error') {
                window.removeEventListener('message', handleOAuthCallback);
                Modal.showOAuthError(event.data.error);
                if (popup && !popup.closed) popup.close();
            }
        };

        window.addEventListener('message', handleOAuthCallback);
    }

    /**
     * Logout
     */
    static async logout(): Promise<void> {
        try {
            const session = State.sessionId || CookieUtils.get('sessionId') || localStorage.getItem('sessionId');

            if (session) {
                await fetch('/api/auth/logout', {
                    method: 'POST',
                    headers: {
                        'Authorization': 'Bearer ' + session,
                        'Content-Type': 'application/json'
                    },
                    credentials: 'include'
                });
            }
        } catch (err) {
            console.error('Logout error:', err);
        }

        // Clear all auth data
        this.clearAuth();
        this.updateAuthUI();

        Toast.info(t('auth.logout_success', State.lang));

        setTimeout(() => {
            window.location.href = '/?lang=' + State.lang;
        }, 500);
    }
}

export default AuthService;
