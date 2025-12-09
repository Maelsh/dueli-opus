/**
 * @file src/client/helpers/DateFormatter.ts
 * @description تنسيق التواريخ
 * @module client/helpers/DateFormatter
 */

import { State, Language } from '../core/State';
import { t } from '../../i18n/translations';

/**
 * Date Formatter Class
 * تنسيق التواريخ
 */
export class DateFormatter {
    /**
     * Format date
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
        return date.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', options);
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

        if (lang === 'ar') {
            if (minutes < 1) return t('client.time.now', lang);
            if (minutes < 60) return t('client.time.minutes_ago', lang).replace('{n}', String(minutes));
            if (hours < 24) return t('client.time.hours_ago', lang).replace('{n}', String(hours));
            if (days < 7) return t('client.time.days_ago', lang).replace('{n}', String(days));
            return this.format(dateStr, lang);
        } else {
            if (minutes < 1) return t('client.time.now', lang);
            if (minutes < 60) return t('client.time.minutes_ago', lang).replace('{n}', String(minutes));
            if (hours < 24) return t('client.time.hours_ago', lang).replace('{n}', String(hours));
            if (days < 7) return t('client.time.days_ago', lang).replace('{n}', String(days));
            return this.format(dateStr, lang);
        }
    }
}

export default DateFormatter;
