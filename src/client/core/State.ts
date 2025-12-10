/**
 * @file src/client/core/State.ts
 * @description إدارة الحالة العامة للتطبيق
 * @module client/core/State
 */

import { CookieUtils } from './CookieUtils';

// Default language constant - can be configured
const DEFAULT_LANGUAGE = 'ar';

/**
 * State Management Class
 * إدارة الحالة العامة للتطبيق
 */
export class State {
    private static _currentUser: any = null;
    private static _sessionId: string | null = null;
    private static _lang: string = DEFAULT_LANGUAGE;
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
     * Initialize state from URL, cookies, and localStorage
     */
    static init(): void {
        // Priority: URL param > Cookie > Default
        const urlParams = new URLSearchParams(window.location.search);
        const urlLang = urlParams.get('lang');
        const cookieLang = CookieUtils.get('lang');

        this._lang = urlLang || cookieLang || DEFAULT_LANGUAGE;
        (window as any).lang = this._lang;

        // Get dark mode from localStorage
        const savedDarkMode = localStorage.getItem('darkMode');
        this._isDarkMode = savedDarkMode === 'true';
        (window as any).isDarkMode = this._isDarkMode;
    }
}

export default State;
