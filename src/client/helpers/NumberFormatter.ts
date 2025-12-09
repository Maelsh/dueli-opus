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
     */
    static formatLocale(num: number, locale: string = 'ar'): string {
        return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(num);
    }
}

export default NumberFormatter;
