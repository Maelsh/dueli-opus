/**
 * @file src/client/core/State.ts
 * @description إدارة الحالة العامة للتطبيق - State Management
 * @module client/core/State
 */

import { CookieUtils } from './CookieUtils';

// Default fallbacks - used only when all other sources fail
const DEFAULT_LANGUAGE = 'en';
const DEFAULT_COUNTRY = 'US';

/**
 * Get browser/device language preference
 * يحصل على تفضيل اللغة من المتصفح/الجهاز
 */
function getBrowserLanguage(): string {
    if (typeof navigator === 'undefined') return DEFAULT_LANGUAGE;

    // Try navigator.language first (e.g., "en-US", "ar-SA")
    const browserLang = navigator.language || (navigator as any).userLanguage;
    if (browserLang) {
        // Extract language code (e.g., "en" from "en-US")
        return browserLang.split('-')[0].toLowerCase();
    }

    // Try navigator.languages array
    if (navigator.languages && navigator.languages.length > 0) {
        return navigator.languages[0].split('-')[0].toLowerCase();
    }

    return DEFAULT_LANGUAGE;
}

/**
 * Get browser/device country preference
 * يحصل على تفضيل البلد من المتصفح/الجهاز
 */
function getBrowserCountry(): string {
    if (typeof navigator === 'undefined') return DEFAULT_COUNTRY;

    // Try navigator.language (e.g., "en-US" → "US", "ar-SA" → "SA")
    const browserLang = navigator.language || (navigator as any).userLanguage;
    if (browserLang && browserLang.includes('-')) {
        return browserLang.split('-')[1].toUpperCase();
    }

    // Try navigator.languages array
    if (navigator.languages && navigator.languages.length > 0) {
        const lang = navigator.languages[0];
        if (lang.includes('-')) {
            return lang.split('-')[1].toUpperCase();
        }
    }

    return DEFAULT_COUNTRY;
}

/**
 * State Management Class
 * إدارة الحالة العامة للتطبيق
 * 
 * Language/Country Priority:
 * 1. User database settings (if logged in)
 * 2. URL parameter
 * 3. Cookie
 * 4. Browser/Device settings
 * 5. Default fallback (en/US)
 */
export class State {
    private static _currentUser: any = null;
    private static _sessionId: string | null = null;
    private static _lang: string = DEFAULT_LANGUAGE;
    private static _country: string = DEFAULT_COUNTRY;
    private static _isDarkMode: boolean = false;

    // Current User
    static get currentUser(): any {
        return this._currentUser;
    }

    static set currentUser(user: any) {
        this._currentUser = user;
        if (typeof window !== 'undefined') {
            (window as any).currentUser = user;
        }
        // Update language/country from user preferences if available.
        // B2: a user.language arriving late (checkAuth/login) must NOT silently
        // flip a page that the server already rendered in the URL/cookie
        // language — that produced RTL/LTR contradictions between the initial
        // render and client rerenders.
        if (user) {
            if (user.language && !this.hasExplicitLanguagePreference()) {
                this.lang = user.language;
            }
            if (user.country) {
                this._country = user.country;
                (window as any).country = user.country;
            }
        }
    }

    // Session ID
    static get sessionId(): string | null {
        return this._sessionId;
    }

    static set sessionId(id: string | null) {
        this._sessionId = id;
        if (typeof window !== 'undefined') {
            (window as any).sessionId = id;
        }
    }

    // Language
    static get lang(): string {
        return this._lang;
    }

    static set lang(l: string) {
        this._lang = l;
        if (typeof window !== 'undefined') {
            (window as any).lang = l;
        }
        // B2: keep the document (which the server rendered) and State in sync
        this.applyDocumentLanguage(l);
    }

    /**
     * B2: true when the current page has an explicit language selection
     * (`?lang=` in the URL or the persisted `lang` cookie). Such a choice is a
     * user/page contract and outranks a late-arriving user.language.
     */
    static hasExplicitLanguagePreference(): boolean {
        if (typeof window === 'undefined') return false;
        const urlLang = new URLSearchParams(window.location.search).get('lang');
        if (urlLang) return true;
        return !!CookieUtils.get('lang');
    }

    /**
     * B2: single place that keeps document.documentElement.dir/lang aligned
     * with State.lang so client rerenders can never contradict the SSR markup.
     */
    static applyDocumentLanguage(lang: string): void {
        if (typeof document === 'undefined' || !document.documentElement) return;
        const normalized = (lang || DEFAULT_LANGUAGE).toLowerCase().startsWith('ar') ? 'ar' : 'en';
        document.documentElement.lang = normalized;
        document.documentElement.dir = normalized === 'ar' ? 'rtl' : 'ltr';
    }

    // Country
    static get country(): string {
        return this._country;
    }

    static set country(c: string) {
        this._country = c;
        if (typeof window !== 'undefined') {
            (window as any).country = c;
        }
    }

    // Dark Mode
    static get isDarkMode(): boolean {
        return this._isDarkMode;
    }

    static set isDarkMode(v: boolean) {
        this._isDarkMode = v;
        if (typeof window !== 'undefined') {
            (window as any).isDarkMode = v;
        }
    }

    /**
     * Get language with priority chain:
     * 1. Logged in user's DB preference
     * 2. URL parameter
     * 3. Cookie
     * 4. Browser/Device
     * 5. Default (en)
     */
    static getLanguage(): string {
        // B2: an explicit page-level choice (?lang= / persisted lang cookie) is
        // the same source of truth the server used for this render, so it wins.
        // Without this, a user.language arriving after checkAuth would flip the
        // language of an already-rendered page (RTL/LTR contradiction).
        if (typeof window !== 'undefined') {
            const urlLang = new URLSearchParams(window.location.search).get('lang');
            if (urlLang) return urlLang;
        }
        const cookieLang = CookieUtils.get('lang');
        if (cookieLang) return cookieLang;

        // User database preference (only when the page has no explicit choice)
        if (this._currentUser?.language) {
            return this._currentUser.language;
        }

        // 4. Browser/Device preference
        const browserLang = getBrowserLanguage();
        if (browserLang) return browserLang;

        // 5. Default fallback
        return DEFAULT_LANGUAGE;
    }

    /**
     * Get country with priority chain:
     * 1. Logged in user's DB preference
     * 2. Cookie
     * 3. Browser/Device
     * 4. Default (US)
     */
    static getCountry(): string {
        // 1. User database preference (highest priority when logged in)
        if (this._currentUser?.country) {
            return this._currentUser.country;
        }

        // 2. Cookie
        const cookieCountry = CookieUtils.get('country');
        if (cookieCountry) return cookieCountry;

        // 3. Browser/Device preference
        const browserCountry = getBrowserCountry();
        if (browserCountry) return browserCountry;

        // 4. Default fallback
        return DEFAULT_COUNTRY;
    }

    /**
     * Initialize state from URL, cookies, user data, and browser settings
     */
    static init(): void {
        // Use the setters so the document direction stays aligned (B2).
        this.lang = this.getLanguage();

        // Initialize country with priority chain
        this._country = this.getCountry();
        (window as any).country = this._country;

        // Get dark mode from localStorage
        const savedDarkMode = localStorage.getItem('darkMode');
        this._isDarkMode = savedDarkMode === 'true';
        (window as any).isDarkMode = this._isDarkMode;
    }
}

export default State;

