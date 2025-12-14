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

// Countries (shared data)
import { getCountriesList, getCountry } from '../countries';
import { t, isRTL } from '../i18n';

// UI
import { Toast } from './ui/Toast';
import { Modal } from './ui/Modal';
import { Menu } from './ui/Menu';
import { NotificationsUI } from './ui/NotificationsUI';
import { MessagesUI } from './ui/MessagesUI';

// Pages
import { HomePage } from './pages/HomePage';

// Helpers
import { DateFormatter } from './helpers/DateFormatter';
import { NumberFormatter } from './helpers/NumberFormatter';
import { YouTubeHelpers } from './helpers/YouTubeHelpers';
import { Utils } from './helpers/Utils';

/**
 * Country selection functions (moved from CountryService)
 */
const CountryFunctions = {
    getCurrentCode(): string {
        return State.getCountry();
    },

    select(countryCode: string): void {
        const country = getCountry(countryCode);
        if (!country) return;

        CookieUtils.set('country', countryCode, 365);
        CookieUtils.set('lang', country.primaryLang, 365);

        if (State.currentUser && State.sessionId) {
            ApiClient.put('/api/users/preferences', {
                country: countryCode,
                language: country.primaryLang
            }).catch(err => console.error('Failed to update preferences:', err));
        }

        window.location.href = `?lang=${country.primaryLang}`;
    },

    renderList(filter: string = ''): void {
        const container = document.getElementById('countriesList');
        if (!container) return;

        const currentCountry = this.getCurrentCode();
        const countries = getCountriesList();
        const filtered = filter
            ? countries.filter(c =>
                c.nativeName.toLowerCase().includes(filter.toLowerCase()) ||
                c.code.toLowerCase().includes(filter.toLowerCase())
            )
            : countries;

        if (filtered.length === 0) {
            container.innerHTML = `
                <div class="p-4 text-center text-gray-400 text-sm">
                    ${t('search.no_results', State.lang)}
                </div>
            `;
            return;
        }

        container.innerHTML = filtered.map(country => `
            <button 
                onclick="selectCountry('${country.code}')" 
                class="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${country.code === currentCountry ? 'bg-purple-50 dark:bg-purple-900/30' : ''}"
            >
                <img src="https://flagcdn.com/w40/${country.code.toLowerCase()}.png" class="w-6 h-4 object-cover rounded-sm shadow-sm" alt="${country.code}">
                <span class="flex-1 ${country.rtl ? 'text-right' : 'text-left'} text-sm font-medium text-gray-900 dark:text-white">${country.nativeName}</span>
                ${country.code === currentCountry ? '<i class="fas fa-check text-purple-600 text-sm"></i>' : ''}
            </button>
        `).join('');
    }
};

/**
 * Main Application Class
 * التطبيق الرئيسي
 */
export class App {
    /**
     * Initialize the application
     */
    static async init(): Promise<void> {
        // Initialize state from URL params
        State.init();

        // Initialize theme
        ThemeService.init();

        // Check authentication (await to ensure State.currentUser is set before HomePage.init)
        await AuthService.checkAuth();

        // Setup menu click outside handlers
        Menu.setupClickOutside();

        // Handle OAuth callback from URL
        this.handleOAuthCallback();

        // Initialize Pages (safe to call as they check for DOM presence)
        HomePage.init();

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
            window.history.replaceState({}, document.title,
                window.location.pathname + window.location.search.replace(/[\?\&]error=[^\&]+/, '').replace(/^\&/, '?')
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
        selectCountry: (code: string) => void;
        showHelp: typeof Modal.showHelp;
        checkAuth: typeof AuthService.checkAuth;
        toggleNotifications: typeof NotificationsUI.toggle;
        markAllNotificationsRead: typeof NotificationsUI.markAllAsRead;
        toggleMessages: typeof MessagesUI.toggle;
        markAllMessagesRead: typeof MessagesUI.markAllRead;

        // Home Page Methods
        setMainTab: typeof HomePage.setMainTab;
        setSubTab: typeof HomePage.setSubTab;
        loadMoreCompetitions: typeof HomePage.loadMoreCompetitions;
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
    formatDate: (date: string, lang?: string) => DateFormatter.format(date, lang),
    formatNumber: (num: number, lang?: string) => NumberFormatter.format(num, lang),
    formatTimeAgo: (date: string, lang?: string) => DateFormatter.timeAgo(date, lang),

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
    window.filterCountries = (query: string) => CountryFunctions.renderList(query);
    window.selectCountry = (code: string) => CountryFunctions.select(code);
    window.showHelp = () => Modal.showHelp();
    window.checkAuth = () => AuthService.checkAuth();
    window.toggleNotifications = () => NotificationsUI.toggle();
    window.markAllNotificationsRead = () => NotificationsUI.markAllAsRead();
    window.toggleMessages = () => MessagesUI.toggle();
    window.markAllMessagesRead = () => MessagesUI.markAllRead();

    // Bind Home Page Methods
    window.setMainTab = (tab: any) => HomePage.setMainTab(tab);
    window.setSubTab = (tab: string) => HomePage.setSubTab(tab);
    window.loadMoreCompetitions = () => HomePage.loadMoreCompetitions();
}

// Auto-initialize when DOM is ready
if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        App.init();
    });
}

// Export all modules
export { State, ApiClient, CookieUtils } from './core';
export { AuthService, ThemeService } from './services';
export { Toast, Modal, Menu } from './ui';
export { DateFormatter, NumberFormatter, YouTubeHelpers, Utils } from './helpers';
export { HomePage } from './pages/HomePage';

