/**
 * @file src/client/services/ThemeService.ts
 * @description خدمة إدارة الوضع الليلي/النهاري
 * @module client/services/ThemeService
 */

import { State } from '../core/State';

/**
 * Theme Service Class
 * خدمة الوضع الليلي/النهاري
 */
export class ThemeService {
    /**
     * Initialize theme from saved preference
     */
    static init(): void {
        const savedDarkMode = localStorage.getItem('darkMode');
        State.isDarkMode = savedDarkMode === 'true';
        this.apply();
    }

    /**
     * Toggle dark mode
     */
    static toggle(): void {
        State.isDarkMode = !State.isDarkMode;
        localStorage.setItem('darkMode', String(State.isDarkMode));
        this.apply();
    }

    /**
     * Apply current theme to DOM
     */
    static apply(): void {
        const moonIcon = document.getElementById('moonIcon');
        const sunIcon = document.getElementById('sunIcon');

        if (State.isDarkMode) {
            document.documentElement.classList.add('dark');
            document.body.classList.add('dark');

            // Show sun icon in dark mode, hide moon
            if (moonIcon) moonIcon.classList.add('theme-icon-hidden');
            if (sunIcon) sunIcon.classList.remove('theme-icon-hidden');
        } else {
            document.documentElement.classList.remove('dark');
            document.body.classList.remove('dark');

            // Show moon icon in light mode, hide sun
            if (moonIcon) moonIcon.classList.remove('theme-icon-hidden');
            if (sunIcon) sunIcon.classList.add('theme-icon-hidden');
        }
    }

    /**
     * Get current dark mode state
     */
    static get isDarkMode(): boolean {
        return State.isDarkMode;
    }
}

export default ThemeService;
