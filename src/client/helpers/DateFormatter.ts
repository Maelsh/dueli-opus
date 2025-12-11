/**
 * @file src/client/helpers/DateFormatter.ts
 * @description تنسيق التواريخ
 * @module client/helpers/DateFormatter
 */

import { State } from '../core/State';
import type { Language } from '../../config/types';
import { t, getLocale } from '../../i18n';

/**
 * Date Formatter Class
 * تنسيق التواريخ
 */
export class DateFormatter {
    /**
     * Format date using locale from country settings
     */
    static format(dateStr: string, lang: Language = State.lang): string {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const options: Intl.DateTimeFormatOptions = {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        };
        // Use getLocale with country from State, fallback to lang-based locale
        const locale = getLocale(State.country, lang);
        return date.toLocaleDateString(locale, options);
    }

    /**
     * Format relative time (time ago)
     */
    static timeAgo(dateStr: string, lang: Language = State.lang): string {
        if (!dateStr) return '';
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();

        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        // Use translations - works for any language
        if (minutes < 1) return t('client.time.now', lang);
        if (minutes < 60) return t('client.time.minutes_ago', lang).replace('{n}', String(minutes));
        if (hours < 24) return t('client.time.hours_ago', lang).replace('{n}', String(hours));
        if (days < 7) return t('client.time.days_ago', lang).replace('{n}', String(days));
        return this.format(dateStr, lang);
    }
}

export default DateFormatter;

