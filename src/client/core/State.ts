/**
 * @file src/client/core/State.ts
 * @description إدارة الحالة العامة للتطبيق
 * @module client/core/State
 */

export type Language = 'ar' | 'en';

/**
 * State Management Class
 * إدارة الحالة العامة للتطبيق
 */
export class State {
    private static _currentUser: any = null;
    private static _sessionId: string | null = null;
    private static _lang: Language = 'ar';
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
    static get lang(): Language {
        return this._lang;
    }

    static set lang(l: Language) {
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
     * Initialize state from URL and localStorage
     */
    static init(): void {
        // Get language from URL
        const urlParams = new URLSearchParams(window.location.search);
        this._lang = (urlParams.get('lang') as Language) || 'ar';
        (window as any).lang = this._lang;

        // Get dark mode from localStorage
        const savedDarkMode = localStorage.getItem('darkMode');
        this._isDarkMode = savedDarkMode === 'true';
        (window as any).isDarkMode = this._isDarkMode;
    }
}

export default State;
