/**
 * @file src/client/services/AuthService.ts
 * @description خدمة المصادقة
 * @module client/services/AuthService
 */

import { State } from '../core/State';
import { CookieUtils } from '../core/CookieUtils';
import {
    clearLegacySessionStorage,
    readLegacySessionToken,
} from '../core/SessionAccess';
import { Toast } from '../ui/Toast';
import { Modal } from '../ui/Modal';
import { NotificationsUI } from '../ui/NotificationsUI';
import { MessagesUI } from '../ui/MessagesUI';
import { SseService } from './SseService';
import { t } from '../../i18n';

/**
 * API Response Types
 */
interface ApiResponse {
    success?: boolean;
    error?: string;
    message?: string;
    user?: any;
    data?: { user?: any; message?: string };
}

/**
 * Authentication Service Class
 * خدمة المصادقة
 */
export class AuthService {
    /**
     * B1: bounded wait for /api/auth/session so a hung request can never leave
     * the page in a permanent "checking" state. Client-side only — it does not
     * change the server contract; a timeout is treated as transient.
     */
    static readonly AUTH_CHECK_TIMEOUT_MS = 10000;

    /**
     * Post-R1 acceptance — canonical auth resolution state for one page.
     * 'unknown'  = no authoritative answer yet (fresh page, or the last check
     *              hit a transient 429/5xx/network/timeout). Page guards must
     *              render a safe "checking/retrying" state here — NEVER a false
     *              "Login Required".
     * 'authenticated' = the server returned a valid user for this session.
     * 'guest'    = ONLY an authoritative unauthenticated answer (normally a
     *              401, or a 200 with user:null) may set this.
     * Server APIs stay the authority for protected actions: 'unknown' grants
     * nothing, it only withholds the false logged-out UI.
     */
    static authStatus: 'unknown' | 'authenticated' | 'guest' = 'unknown';

    /**
     * Post-R1 acceptance — last `retryAfter` (seconds) communicated by a 429
     * response body. Preserved so the UI can back off appropriately. The
     * existing contract carries it in the JSON body (no Retry-After header
     * required); both `retryAfter` and `retry_after` spellings are accepted.
     */
    static lastRetryAfterSec = 0;

    /**
     * Post-R1 acceptance — single-flight for /api/auth/session. App.init and
     * every page guard call checkAuth() during one page initialization;
     * concurrent callers share ONE network request instead of racing
     * duplicates that exhaust the session-check budget.
     */
    private static _pendingAuthCheck: Promise<boolean> | null = null;

    /**
     * B1: bounded wrapper for the auth check. Aborting only cancels the client
     * wait; the server contract is untouched.
     */
    private static async withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
        if (typeof AbortController === 'undefined' || !Number.isFinite(ms) || ms <= 0) {
            return promise;
        }
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                promise,
                new Promise<never>((_resolve, reject) => {
                    timer = setTimeout(() => reject(new Error('auth_check_timeout')), ms);
                })
            ]);
        } finally {
            if (timer !== undefined) clearTimeout(timer);
        }
    }

    /**
     * B1: central auth-success notification. Login (modal), OAuth and session
     * re-validation all publish the same event so page scripts can refresh
     * their own state without a full reload.
     */
    static emitAuthSuccess(user?: unknown): void {
        const normalized = user === undefined ? undefined : AuthService.normalizeUser(user);
        State.currentUser = (normalized as never) ?? State.currentUser;
        // A published auth success is authoritative: forget any transient
        // 'unknown' so guards render the authenticated state immediately.
        if (State.currentUser) AuthService.authStatus = 'authenticated';
        if (typeof window === 'undefined' || typeof CustomEvent === 'undefined') return;
        window.dispatchEvent(new CustomEvent('dueli:auth-success', {
            detail: { user: State.currentUser }
        }));
    }

    /**
     * Post-R1 acceptance — canonical auth-user normalization (contract B).
     * The server emits the canonical DTO (`display_name`, `avatar_url`,
     * `username`) plus legacy aliases (`name`, `avatar`); older payloads may
     * carry only the aliases. Normalize once here so State.currentUser always
     * exposes the canonical shape and no consumer has to guess field names.
     * NEVER invents an avatar: a missing avatar stays null so the UI falls
     * back to its placeholder instead of a random DiceBear identity.
     */
    static normalizeUser(raw: any): any {
        if (!raw || typeof raw !== 'object') return raw;
        const display_name = raw.display_name ?? raw.name ?? raw.username ?? null;
        const avatar_url = raw.avatar_url ?? raw.avatar ?? null;
        return {
            ...raw,
            display_name,
            avatar_url,
            username: raw.username ?? null,
            // Legacy aliases, kept for compatibility with older consumers.
            name: raw.name ?? display_name,
            avatar: raw.avatar ?? avatar_url,
        };
    }

    /** Read the canonical auth resolution state (for page guards). */
    static getAuthStatus(): 'unknown' | 'authenticated' | 'guest' {
        return AuthService.authStatus;
    }

    /**
     * Check authentication status — canonical single-flight entry point.
     * Concurrent callers (App.init + page guards) share one resolution.
     */
    static checkAuth(): Promise<boolean> {
        if (AuthService._pendingAuthCheck) return AuthService._pendingAuthCheck;
        AuthService._pendingAuthCheck = AuthService.resolveAuth().finally(() => {
            AuthService._pendingAuthCheck = null;
        });
        return AuthService._pendingAuthCheck;
    }

    /**
     * The actual session resolution. The browser sends no credential in JS:
     * the HttpOnly cookie is attached by the browser. A pre-SEC08
     * localStorage token is tried exactly once (bounded migration) when the
     * cookie is authoritatively invalid. Transient 429/5xx/network/timeout
     * never clears state and never falls through to the legacy value.
     */
    private static async resolveAuth(): Promise<boolean> {
        const first = await this.requestSession();
        if (!first.ok) {
            this.updateAuthUI();
            return false;
        }

        const firstUser = await this.readSessionUser(first.response);
        if (firstUser === undefined) {
            this.updateAuthUI();
            return false;
        }
        if (firstUser) {
            this.applyAuthenticatedUser(firstUser);
            return true;
        }

        // The cookie was authoritatively unauthenticated. The only remaining
        // path is the one-time migration of a pre-SEC08 localStorage token.
        // Read it only now, never on the normal cookie-authenticated path.
        const legacyToken = readLegacySessionToken();
        if (legacyToken) {
            const migrated = await this.requestSession(legacyToken);
            if (!migrated.ok) {
                // A transient failure must not clear a token that might be
                // valid; preserve it for the next bounded attempt.
                this.updateAuthUI();
                return false;
            }
            const migratedUser = await this.readSessionUser(migrated.response);
            if (migratedUser === undefined) {
                this.updateAuthUI();
                return false;
            }
            if (migratedUser) {
                this.applyAuthenticatedUser(migratedUser);
                return true;
            }
        }

        // Authoritative invalid answer(s): genuine expiry/logout.
        AuthService.authStatus = 'guest';
        this.clearAuth();
        this.updateAuthUI();
        return false;
    }

    /**
     * One bounded `/api/auth/session` call. `ok` is false only for transient
     * outcomes (429/5xx/network/timeout/unknown status); a 401/200 is a valid
     * response that may authoritatively mean guest.
     */
    private static async requestSession(legacyToken?: string): Promise<{ ok: boolean; response: Response }> {
        try {
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (legacyToken) headers['Authorization'] = 'Bearer ' + legacyToken;
            const response = await this.withTimeout(fetch('/api/auth/session', {
                method: 'GET',
                headers,
                credentials: 'include',
            }), AuthService.AUTH_CHECK_TIMEOUT_MS);

            if (response.status === 429) {
                try {
                    const body = (await response.json()) as any;
                    const hint = Number(body?.retryAfter ?? body?.retry_after ?? 0);
                    if (Number.isFinite(hint) && hint > 0) {
                        AuthService.lastRetryAfterSec = hint;
                    }
                } catch {
                    // Body unreadable — still transient, still not a logout.
                }
                return { ok: false, response };
            }

            if (!response.ok && response.status !== 401) {
                console.error('Auth check returned a transient status:', response.status);
                return { ok: false, response };
            }

            return { ok: true, response };
        } catch (err) {
            // Network/parse failure: transient, NOT proof the session invalid.
            console.error('Auth check failed:', err);
            return { ok: false, response: new Response(null, { status: 503 }) };
        }
    }

    /**
     * `undefined` = transient/unreadable; `null` = authoritative guest;
     * object = authenticated user.
     */
    private static async readSessionUser(response: Response): Promise<any | null | undefined> {
        if (response.status === 401) return null;
        try {
            const data = await response.json() as ApiResponse;
            const raw = data.user || data.data?.user;
            if (!raw) return null;
            const user = AuthService.normalizeUser(raw);
            return user && (user.id || user.user_id || user.email) ? user : null;
        } catch {
            console.error('Auth check returned an unreadable response');
            return undefined;
        }
    }

    private static applyAuthenticatedUser(user: any): void {
        AuthService.authStatus = 'authenticated';
        State.currentUser = user;

        // Apply user's language/country preferences from database. B2: an
        // explicit page/URL/cookie language choice wins over a late user value.
        if (user.language && !State.hasExplicitLanguagePreference()) {
            State.lang = user.language;
            CookieUtils.set('lang', user.language, 365);
        }
        if (user.country) {
            State.country = user.country;
            CookieUtils.set('country', user.country, 365);
        }

        localStorage.setItem('user', JSON.stringify(user));
        // Bounded migration ends here: no JS-readable session remains.
        clearLegacySessionStorage();
        this.updateAuthUI();
    }

    /**
     * Clear authentication data. The HttpOnly cookie is cleared by the server
     * on logout; a genuine 401/expiry only clears UI/migration state.
     */
    static clearAuth(): void {
        localStorage.removeItem('user');
        clearLegacySessionStorage();
        AuthService.authStatus = 'guest';
        State.currentUser = null;
        // T2.2: Close the real-time channel on logout
        SseService.disconnect();
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

            // R3-C1: the Help entry is visible to everyone (guests and members).
            if (helpIcon) helpIcon.classList.remove('auth-hidden');

            // R2-A: admin entry — visible only for admins (server + API
            // guards remain authoritative; this is navigation only).
            const adminItem = document.getElementById('adminMenuItem');
            if (adminItem) {
                const isAdmin = State.currentUser?.is_admin === 1
                    || State.currentUser?.is_admin === true;
                adminItem.classList.toggle('hidden', !isAdmin);
            }

            // Initialize notifications and messages
            NotificationsUI.init();
            MessagesUI.init();
            // T2.2: Open the real-time SSE channel for this user
            SseService.connect();
        } else {
            // User is not logged in
            if (authSection) authSection.classList.remove('hidden');
            if (userSection) userSection.classList.add('hidden');
            if (createCompBtn) createCompBtn.classList.add('hidden');

            // R3-RAILS-1A: guests SEE the Upcoming rail (visibility only —
            // invite/join actions keep their own auth guards, untouched).
            if (upcomingTab) upcomingTab.classList.remove('hidden');

            // Show help icon for non-logged-in users
            if (helpIcon) helpIcon.classList.remove('auth-hidden');

            // R2-A: never leak the admin entry to guests.
            document.getElementById('adminMenuItem')?.classList.add('hidden');
        }
    }

    /**
     * Handle OAuth success. The callback set the HttpOnly cookie; the popup
     * only signals completion. No token crosses the window boundary.
     */
    static async handleOAuthSuccess(): Promise<void> {
        try {
            const ok = await this.checkAuth();
            const user = State.currentUser;

            if ((ok || user) && user && (user.id || user.user_id || user.email)) {
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
                // Server wraps response in data.data. SEC-08: the response
                // contains the user only; the session is Set-Cookie HttpOnly.
                const responseData = data.data || data;
                const user = AuthService.normalizeUser(responseData.user);

                AuthService.authStatus = 'authenticated';
                State.currentUser = user;
                localStorage.setItem('user', JSON.stringify(user));
                clearLegacySessionStorage();

                this.updateAuthUI();
                Modal.hideLogin();
                Toast.success(t('client.toast.welcome', State.lang));
                // B1: let page scripts (My Competitions, …) refresh immediately
                // instead of waiting for a full reload.
                this.emitAuthSuccess(user);
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
                // showEmailSentMessage ONLY when the server confirms a send:
                // any machine-readable warning means nothing was delivered
                // (email_not_configured = not attempted, email_send_failed =
                // attempted but the provider failed). Never match warning text.
                const emailWarning = (data.data as any)?.warning;
                if (!emailWarning) {
                    Modal.showEmailSentMessage(data.data?.message || t('auth_register_success', State.lang));
                } else {
                    Modal.showAuthMessage(data.data?.message || t('auth_register_success', State.lang), 'success');
                }
                const form = document.getElementById('registerForm')?.querySelector('form');
                if (form) form.reset();
                // Email not delivered (either warning): offer the resend path,
                // which is the retry for both cases.
                if (emailWarning === 'email_not_configured' || emailWarning === 'email_send_failed') {
                    const msg = document.getElementById('authMessage');
                    if (msg && !document.getElementById('resendVerificationBtn')) {
                        const btn = document.createElement('button');
                        btn.id = 'resendVerificationBtn';
                        btn.type = 'button';
                        btn.className = 'mt-2 w-full py-2 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-sm font-bold transition-colors';
                        btn.textContent = State.lang === 'ar' ? 'إعادة إرسال رسالة التفعيل' : 'Resend verification email';
                        btn.onclick = async () => {
                            btn.disabled = true;
                            try {
                                const r = await fetch(`/api/auth/resend-verification?lang=${State.lang}`, {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ email })
                                });
                                const d = (await r.json()) as any;
                                // Resend answers generic success on EVERY path
                                // (unknown address, already verified, misconfigured,
                                // provider failure) by anti-enumeration design, so
                                // success:true never confirms a send — keep the
                                // plain server message, never the sent-guidance.
                                Modal.showAuthMessage(d.data?.message || d.error || '', d.success ? 'success' : 'error');
                            } catch {
                                Modal.showAuthMessage(t('auth.connection_failed', State.lang), 'error');
                            } finally {
                                btn.disabled = false;
                            }
                        };
                        msg.insertAdjacentElement('afterend', btn);
                    }
                }
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
                Modal.showEmailSentMessage(data.data?.message || t('auth_reset_code_sent', State.lang));
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
            if (popup && event.source && event.source !== popup) return;

            if (event.data?.type === 'oauth_success') {
                window.removeEventListener('message', handleOAuthCallback);
                try {
                    if (popup) popup.close();
                } catch (_) {}
                await this.handleOAuthSuccess();
            } else if (event.data?.type === 'oauth_error') {
                window.removeEventListener('message', handleOAuthCallback);
                Modal.showOAuthError(event.data.error);
                try {
                    if (popup) popup.close();
                } catch (_) {}
            }
        };

        window.addEventListener('message', handleOAuthCallback);
    }

    /**
     * Logout
     */
    static async logout(): Promise<void> {
        try {
            // SEC-08: the server invalidates the session and clears the
            // HttpOnly cookie. No session value is read or sent from JS.
            const res = await fetch('/api/auth/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
            });

            if (!res.ok && res.status !== 401) {
                // A transient/rate-limited logout must not claim success while
                // the server session (and HttpOnly cookie) still exists.
                Toast.error(t('auth.connection_failed', State.lang));
                return;
            }
        } catch (err) {
            console.error('Logout error:', err);
            Toast.error(t('auth.connection_failed', State.lang));
            return;
        }

        // Clear all local UI data; the browser cookie is already gone.
        this.clearAuth();
        this.updateAuthUI();

        Toast.info(t('auth.logout_success', State.lang));

        setTimeout(() => {
            window.location.href = '/?lang=' + State.lang;
        }, 500);
    }
}

export default AuthService;
