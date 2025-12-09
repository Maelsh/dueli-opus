/**
 * @file src/client/helpers/NumberFormatter.ts
 * @description تنسيق الأرقام
 * @module client/helpers/NumberFormatter
 */

/**
 * Number Formatter Class
 * تنسيق الأرقام
 */
export class NumberFormatter {
    /**
     * Format number with abbreviation (K, M)
     */
    static format(num: number): string {
        if (num >= 1000000) {
            return (num / 1000000).toFixed(1) + 'M';
        }
        if (num >= 1000) {
            return (num / 1000).toFixed(1) + 'K';
        }
        return num.toString();
    }

    /**
     * Format number with locale
     * @param num - Number to format
     * @param locale - Locale code (ar, en, etc.)
     */
    static formatLocale(num: number, locale: string): string {
        const localeMap: Record<string, string> = {
            'ar': 'ar-SA',
            'en': 'en-US',
        };
        return new Intl.NumberFormat(localeMap[locale] || 'en-US').format(num);
    }
}

export default NumberFormatter;
