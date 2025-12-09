/**
 * @file src/client/index.ts
 * @description نقطة الدخول الرئيسية لعميل الواجهة
 * @module client
 * @version 1.0.0
 * @author Dueli Team
 */

// Core
import { State } from './core/State';
import { ApiClient } from './core/ApiClient';
import { CookieUtils } from './core/CookieUtils';

// Services
import { AuthService } from './services/AuthService';
import { ThemeService } from './services/ThemeService';
import { CountryService } from './services/CountryService';

// UI
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { Menu } from './ui/Menu';

// Helpers
import { DateFormatter } from './helpers/DateFormatter';
import { NumberFormatter } from './helpers/NumberFormatter';
import { YouTubeHelpers } from './helpers/YouTubeHelpers';
import { Utils } from './helpers/Utils';

/**
 * Main Application Class
 * التطبيق الرئيسي
 */
export class App {
    /**
     * Initialize the application
     */
    static init(): void {
        // Initialize state from URL params
        State.init();

        // Initialize countries list
        CountryService.init();

        // Initialize theme
        ThemeService.init();

        // Check authentication
        AuthService.checkAuth();

        // Setup menu click outside handlers
        Menu.setupClickOutside();

        // Handle OAuth callback from URL
        this.handleOAuthCallback();

        console.log('🔥 Dueli Client loaded successfully!');
    }

    /**
     * Handle OAuth callback from URL
     */
    private static handleOAuthCallback(): void {
        const urlParams = new URLSearchParams(window.location.search);
        const session = urlParams.get('session');
        const error = urlParams.get('error');

        if (session) {
            AuthService.handleOAuthSuccess(session, true);
        }

        if (error) {
            Modal.showOAuthError(error);
            // Remove error from URL
            window.history.replaceState({}, document.title,
                window.location.pathname + window.location.search.replace(/[\?&]error=[^&]+/, '').replace(/^&/, '?')
            );
        }
    }
}

// ============================================
// Global Exports for backward compatibility
// ============================================

declare global {
    interface Window {
        dueli: typeof dueliAPI;
        currentUser: any;
        sessionId: string | null;
        lang: string;
        isDarkMode: boolean;
        // Global functions for onclick handlers
        showLoginModal: typeof Modal.showLogin;
        hideLoginModal: typeof Modal.hideLogin;
        switchAuthTab: typeof Modal.switchAuthTab;
        showForgotPassword: typeof Modal.showForgotPassword;
        showLogin: typeof Modal.showLoginForm;
        handleLogin: typeof AuthService.handleLogin;
        handleRegister: typeof AuthService.handleRegister;
        handleForgotPassword: typeof AuthService.handleForgotPassword;
        handleVerifyResetCode: typeof AuthService.handleVerifyResetCode;
        handleResetPassword: typeof AuthService.handleResetPassword;
        loginWith: typeof AuthService.loginWith;
        logout: typeof AuthService.logout;
        toggleDarkMode: typeof ThemeService.toggle;
        toggleUserMenu: typeof Menu.toggleUser;
        toggleCountryMenu: typeof Menu.toggleCountry;
        filterCountries: (query: string) => void;
        selectCountry: typeof CountryService.select;
        showHelp: typeof Modal.showHelp;
        checkAuth: typeof AuthService.checkAuth;
    }
}

/**
 * Dueli API
 * واجهة برمجة التطبيق العامة
 */
const dueliAPI = {
    // Auth
    checkAuth: () => AuthService.checkAuth(),
    updateAuthUI: () => AuthService.updateAuthUI(),
    loginWith: (provider: string) => AuthService.loginWith(provider),
    logout: () => AuthService.logout(),

    // Modal
    showLoginModal: () => Modal.showLogin(),
    hideLoginModal: () => Modal.hideLogin(),
    showHelp: () => Modal.showHelp(),

    // Theme
    toggleDarkMode: () => ThemeService.toggle(),

    // Menu
    toggleUserMenu: () => Menu.toggleUser(),
    toggleCountryMenu: () => Menu.toggleCountry(),

    // Toast
    showToast: (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => Toast.show(message, type),

    // Formatters
    formatDate: (date: string, lang?: 'ar' | 'en') => DateFormatter.format(date, lang),
    formatNumber: (num: number) => NumberFormatter.format(num),
    formatTimeAgo: (date: string, lang?: 'ar' | 'en') => DateFormatter.timeAgo(date, lang),

    // Utils
    debounce: Utils.debounce,

    // API
    api: ApiClient.request,

    // YouTube
    youtubeHelpers: YouTubeHelpers,
};

// Set global window.dueli
if (typeof window !== 'undefined') {
    window.dueli = dueliAPI;

    // Global function bindings for onclick handlers in HTML
    window.showLoginModal = () => Modal.showLogin();
    window.hideLoginModal = () => Modal.hideLogin();
    window.switchAuthTab = (tab: 'login' | 'register') => Modal.switchAuthTab(tab);
    window.showForgotPassword = () => Modal.showForgotPassword();
    window.showLogin = () => Modal.showLoginForm();
    window.handleLogin = (e: Event) => AuthService.handleLogin(e);
    window.handleRegister = (e: Event) => AuthService.handleRegister(e);
    window.handleForgotPassword = (e: Event) => AuthService.handleForgotPassword(e);
    window.handleVerifyResetCode = (e: Event) => AuthService.handleVerifyResetCode(e);
    window.handleResetPassword = (e: Event) => AuthService.handleResetPassword(e);
    window.loginWith = (provider: string) => AuthService.loginWith(provider);
    window.logout = () => AuthService.logout();
    window.toggleDarkMode = () => ThemeService.toggle();
    window.toggleUserMenu = () => Menu.toggleUser();
    window.toggleCountryMenu = () => Menu.toggleCountry();
    window.filterCountries = (query: string) => CountryService.renderList(query);
    window.selectCountry = (code: string) => CountryService.select(code);
    window.showHelp = () => Modal.showHelp();
    window.checkAuth = () => AuthService.checkAuth();
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        App.init();
    });
}

// Export all modules
export { State, ApiClient, CookieUtils } from './core';
export { AuthService, ThemeService, CountryService } from './services';
export { Toast, Modal, Menu } from './ui';
export { DateFormatter, NumberFormatter, YouTubeHelpers, Utils } from './helpers';
