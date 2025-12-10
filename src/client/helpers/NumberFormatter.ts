/**
 * @file src/client/helpers/NumberFormatter.ts
 * @description تنسيق الأرقام والعملات - يدعم جميع اللغات
 * @module client/helpers/NumberFormatter
 */

import { State } from '../core/State';

/**
 * Locale data for number formatting
 * بيانات اللغات للتنسيق
 */
const LOCALE_DATA: Record<string, { locale: string; numberSystem?: string }> = {
    // Arabic variants
    'ar': { locale: 'ar-SA', numberSystem: 'arab' },
    'ar-SA': { locale: 'ar-SA', numberSystem: 'arab' },
    'ar-EG': { locale: 'ar-EG', numberSystem: 'arab' },
    'ar-AE': { locale: 'ar-AE', numberSystem: 'arab' },

    // European languages
    'en': { locale: 'en-US' },
    'en-GB': { locale: 'en-GB' },
    'en-US': { locale: 'en-US' },
    'fr': { locale: 'fr-FR' },
    'de': { locale: 'de-DE' },
    'es': { locale: 'es-ES' },
    'pt': { locale: 'pt-BR' },
    'it': { locale: 'it-IT' },
    'nl': { locale: 'nl-NL' },
    'pl': { locale: 'pl-PL' },
    'ro': { locale: 'ro-RO' },
    'el': { locale: 'el-GR' },
    'sv': { locale: 'sv-SE' },
    'no': { locale: 'no-NO' },
    'da': { locale: 'da-DK' },
    'fi': { locale: 'fi-FI' },
    'cs': { locale: 'cs-CZ' },
    'hu': { locale: 'hu-HU' },
    'uk': { locale: 'uk-UA' },
    'ru': { locale: 'ru-RU' },
    'bg': { locale: 'bg-BG' },
    'hr': { locale: 'hr-HR' },
    'sr': { locale: 'sr-RS' },

    // Asian languages
    'zh': { locale: 'zh-CN' },
    'ja': { locale: 'ja-JP' },
    'ko': { locale: 'ko-KR' },
    'th': { locale: 'th-TH' },
    'vi': { locale: 'vi-VN' },
    'id': { locale: 'id-ID' },
    'ms': { locale: 'ms-MY' },
    'bn': { locale: 'bn-BD' },
    'hi': { locale: 'hi-IN' },
    'ta': { locale: 'ta-IN' },
    'te': { locale: 'te-IN' },

    // RTL languages
    'fa': { locale: 'fa-IR', numberSystem: 'arabext' },
    'he': { locale: 'he-IL' },
    'ur': { locale: 'ur-PK', numberSystem: 'arabext' },

    // Turkish and other
    'tr': { locale: 'tr-TR' },
    'az': { locale: 'az-AZ' },
    'ka': { locale: 'ka-GE' },
    'hy': { locale: 'hy-AM' },
    'kk': { locale: 'kk-KZ' },
    'uz': { locale: 'uz-UZ' },
    'mn': { locale: 'mn-MN' },

    // African languages
    'am': { locale: 'am-ET' },
    'sw': { locale: 'sw-TZ' },
};

/**
 * Number Formatter Class
 * تنسيق الأرقام - يدعم جميع اللغات
 */
export class NumberFormatter {
    /**
     * Get current language from State or browser
     */
    private static getCurrentLocale(): string {
        // Priority: State.lang > browser language > default
        const lang = State.lang ||
            (typeof navigator !== 'undefined' ? navigator.language.split('-')[0] : 'en');
        return lang;
    }

    /**
     * Get Intl locale for a language code
     */
    private static getIntlLocale(lang?: string): string {
        const langCode = lang || this.getCurrentLocale();
        const data = LOCALE_DATA[langCode];
        return data?.locale || langCode;
    }

    /**
     * Format number with abbreviation (K, M, B)
     */
    static format(num: number, lang?: string): string {
        const locale = this.getIntlLocale(lang);

        if (num >= 1_000_000_000) {
            return new Intl.NumberFormat(locale, {
                notation: 'compact',
                compactDisplay: 'short',
                maximumFractionDigits: 1
            }).format(num);
        }
        if (num >= 1_000_000) {
            return new Intl.NumberFormat(locale, {
                notation: 'compact',
                compactDisplay: 'short',
                maximumFractionDigits: 1
            }).format(num);
        }
        if (num >= 1000) {
            return new Intl.NumberFormat(locale, {
                notation: 'compact',
                compactDisplay: 'short',
                maximumFractionDigits: 1
            }).format(num);
        }
        return new Intl.NumberFormat(locale).format(num);
    }

    /**
     * Format number with full locale formatting
     * @param num - Number to format
     * @param lang - Language code (optional, uses current language if not provided)
     */
    static formatLocale(num: number, lang?: string): string {
        const locale = this.getIntlLocale(lang);
        try {
            return new Intl.NumberFormat(locale).format(num);
        } catch {
            return new Intl.NumberFormat('en-US').format(num);
        }
    }

    /**
     * Format number as currency
     * @param num - Number to format
     * @param currency - Currency code (e.g., 'USD', 'SAR', 'EUR')
     * @param lang - Language code (optional)
     */
    static formatCurrency(num: number, currency: string = 'USD', lang?: string): string {
        const locale = this.getIntlLocale(lang);
        try {
            return new Intl.NumberFormat(locale, {
                style: 'currency',
                currency: currency,
            }).format(num);
        } catch {
            return new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: currency,
            }).format(num);
        }
    }

    /**
     * Format number as percentage
     * @param num - Number to format (0.5 = 50%)
     * @param lang - Language code (optional)
     */
    static formatPercent(num: number, lang?: string): string {
        const locale = this.getIntlLocale(lang);
        try {
            return new Intl.NumberFormat(locale, {
                style: 'percent',
                maximumFractionDigits: 1,
            }).format(num);
        } catch {
            return new Intl.NumberFormat('en-US', {
                style: 'percent',
                maximumFractionDigits: 1,
            }).format(num);
        }
    }
}

export default NumberFormatter;
