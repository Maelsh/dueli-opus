/**
 * @file src/client/services/CountryService.ts
 * @description خدمة إدارة الدول واللغات
 * @module client/services/CountryService
 */

import { State } from '../core/State';
import { CookieUtils } from '../core/CookieUtils';
import { ApiClient } from '../core/ApiClient';
import { t } from '../../i18n/translations';

export interface Country {
    code: string;
    name: string;
    lang: string;
    flag: string;
    rtl?: boolean;
}

/**
 * Country Service Class
 * خدمة الدول واللغات
 */
export class CountryService {
    private static countries: Country[] = [];

    /**
     * Initialize countries list
     */
    static init(): void {
        // Complete list of 130+ countries with native names
        this.countries = [
            // Arabic Countries
            { code: 'SA', name: 'السعودية', lang: 'ar', flag: '🇸🇦', rtl: true },
            { code: 'EG', name: 'مصر', lang: 'ar', flag: '🇪🇬', rtl: true },
            { code: 'AE', name: 'الإمارات', lang: 'ar', flag: '🇦🇪', rtl: true },
            { code: 'KW', name: 'الكويت', lang: 'ar', flag: '🇰🇼', rtl: true },
            { code: 'QA', name: 'قطر', lang: 'ar', flag: '🇶🇦', rtl: true },
            { code: 'BH', name: 'البحرين', lang: 'ar', flag: '🇧🇭', rtl: true },
            { code: 'OM', name: 'عمان', lang: 'ar', flag: '🇴🇲', rtl: true },
            { code: 'JO', name: 'الأردن', lang: 'ar', flag: '🇯🇴', rtl: true },
            { code: 'LB', name: 'لبنان', lang: 'ar', flag: '🇱🇧', rtl: true },
            { code: 'SY', name: 'سوريا', lang: 'ar', flag: '🇸🇾', rtl: true },
            { code: 'IQ', name: 'العراق', lang: 'ar', flag: '🇮🇶', rtl: true },
            { code: 'YE', name: 'اليمن', lang: 'ar', flag: '🇾🇪', rtl: true },
            { code: 'PS', name: 'فلسطين', lang: 'ar', flag: '🇵🇸', rtl: true },
            { code: 'MA', name: 'المغرب', lang: 'ar', flag: '🇲🇦', rtl: true },
            { code: 'DZ', name: 'الجزائر', lang: 'ar', flag: '🇩🇿', rtl: true },
            { code: 'TN', name: 'تونس', lang: 'ar', flag: '🇹🇳', rtl: true },
            { code: 'LY', name: 'ليبيا', lang: 'ar', flag: '🇱🇾', rtl: true },
            { code: 'SD', name: 'السودان', lang: 'ar', flag: '🇸🇩', rtl: true },
            { code: 'SO', name: 'الصومال', lang: 'ar', flag: '🇸🇴', rtl: true },
            { code: 'DJ', name: 'جيبوتي', lang: 'ar', flag: '🇩🇯', rtl: true },
            { code: 'KM', name: 'جزر القمر', lang: 'ar', flag: '🇰🇲', rtl: true },
            { code: 'MR', name: 'موريتانيا', lang: 'ar', flag: '🇲🇷', rtl: true },

            // English-speaking Countries
            { code: 'US', name: 'United States', lang: 'en', flag: '🇺🇸' },
            { code: 'GB', name: 'United Kingdom', lang: 'en', flag: '🇬🇧' },
            { code: 'CA', name: 'Canada', lang: 'en', flag: '🇨🇦' },
            { code: 'AU', name: 'Australia', lang: 'en', flag: '🇦🇺' },
            { code: 'NZ', name: 'New Zealand', lang: 'en', flag: '🇳🇿' },
            { code: 'IE', name: 'Ireland', lang: 'en', flag: '🇮🇪' },
            { code: 'ZA', name: 'South Africa', lang: 'en', flag: '🇿🇦' },
            { code: 'IN', name: 'India', lang: 'en', flag: '🇮🇳' },
            { code: 'PK', name: 'Pakistan', lang: 'en', flag: '🇵🇰' },
            { code: 'NG', name: 'Nigeria', lang: 'en', flag: '🇳🇬' },
            { code: 'KE', name: 'Kenya', lang: 'en', flag: '🇰🇪' },
            { code: 'GH', name: 'Ghana', lang: 'en', flag: '🇬🇭' },
            { code: 'SG', name: 'Singapore', lang: 'en', flag: '🇸🇬' },
            { code: 'PH', name: 'Philippines', lang: 'en', flag: '🇵🇭' },
            { code: 'UG', name: 'Uganda', lang: 'en', flag: '🇺🇬' },
            { code: 'ZW', name: 'Zimbabwe', lang: 'en', flag: '🇿🇼' },
            { code: 'ZM', name: 'Zambia', lang: 'en', flag: '🇿🇲' },
            { code: 'MW', name: 'Malawi', lang: 'en', flag: '🇲🇼' },
            { code: 'BW', name: 'Botswana', lang: 'en', flag: '🇧🇼' },
            { code: 'NA', name: 'Namibia', lang: 'en', flag: '🇳🇦' },

            // European Countries
            { code: 'FR', name: 'France', lang: 'fr', flag: '🇫🇷' },
            { code: 'DE', name: 'Deutschland', lang: 'de', flag: '🇩🇪' },
            { code: 'ES', name: 'España', lang: 'es', flag: '🇪🇸' },
            { code: 'IT', name: 'Italia', lang: 'it', flag: '🇮🇹' },
            { code: 'PT', name: 'Portugal', lang: 'pt', flag: '🇵🇹' },
            { code: 'NL', name: 'Nederland', lang: 'nl', flag: '🇳🇱' },
            { code: 'BE', name: 'België', lang: 'nl', flag: '🇧🇪' },
            { code: 'CH', name: 'Schweiz', lang: 'de', flag: '🇨🇭' },
            { code: 'AT', name: 'Österreich', lang: 'de', flag: '🇦🇹' },
            { code: 'SE', name: 'Sverige', lang: 'sv', flag: '🇸🇪' },
            { code: 'NO', name: 'Norge', lang: 'no', flag: '🇳🇴' },
            { code: 'DK', name: 'Danmark', lang: 'da', flag: '🇩🇰' },
            { code: 'FI', name: 'Suomi', lang: 'fi', flag: '🇫🇮' },
            { code: 'PL', name: 'Polska', lang: 'pl', flag: '🇵🇱' },
            { code: 'CZ', name: 'Česko', lang: 'cs', flag: '🇨🇿' },
            { code: 'GR', name: 'Ελλάδα', lang: 'el', flag: '🇬🇷' },
            { code: 'RO', name: 'România', lang: 'ro', flag: '🇷🇴' },
            { code: 'HU', name: 'Magyarország', lang: 'hu', flag: '🇭🇺' },
            { code: 'BG', name: 'България', lang: 'bg', flag: '🇧🇬' },
            { code: 'HR', name: 'Hrvatska', lang: 'hr', flag: '🇭🇷' },
            { code: 'RS', name: 'Србија', lang: 'sr', flag: '🇷🇸' },
            { code: 'UA', name: 'Україна', lang: 'uk', flag: '🇺🇦' },
            { code: 'IS', name: 'Ísland', lang: 'is', flag: '🇮🇸' },
            { code: 'MT', name: 'Malta', lang: 'mt', flag: '🇲🇹' },
            { code: 'CY', name: 'Κύπρος', lang: 'el', flag: '🇨🇾' },
            { code: 'LU', name: 'Luxembourg', lang: 'fr', flag: '🇱🇺' },
            { code: 'MC', name: 'Monaco', lang: 'fr', flag: '🇲🇨' },
            { code: 'AD', name: 'Andorra', lang: 'ca', flag: '🇦🇩' },
            { code: 'SM', name: 'San Marino', lang: 'it', flag: '🇸🇲' },
            { code: 'VA', name: 'Vaticano', lang: 'it', flag: '🇻🇦' },
            { code: 'LI', name: 'Liechtenstein', lang: 'de', flag: '🇱🇮' },

            // Asian Countries
            { code: 'CN', name: '中国', lang: 'zh', flag: '🇨🇳' },
            { code: 'JP', name: '日本', lang: 'ja', flag: '🇯🇵' },
            { code: 'KR', name: '대한민국', lang: 'ko', flag: '🇰🇷' },
            { code: 'TH', name: 'ประเทศไทย', lang: 'th', flag: '🇹🇭' },
            { code: 'VN', name: 'Việt Nam', lang: 'vi', flag: '🇻🇳' },
            { code: 'ID', name: 'Indonesia', lang: 'id', flag: '🇮🇩' },
            { code: 'MY', name: 'Malaysia', lang: 'ms', flag: '🇲🇾' },
            { code: 'BD', name: 'বাংলাদেশ', lang: 'bn', flag: '🇧🇩' },
            { code: 'MM', name: 'မြန်မာ', lang: 'my', flag: '🇲🇲' },
            { code: 'KH', name: 'កម្ពុជា', lang: 'km', flag: '🇰🇭' },
            { code: 'LA', name: 'ລາວ', lang: 'lo', flag: '🇱🇦' },
            { code: 'NP', name: 'नेपाल', lang: 'ne', flag: '🇳🇵' },
            { code: 'LK', name: 'ශ්‍රී ලංකා', lang: 'si', flag: '🇱🇰' },
            { code: 'AF', name: 'افغانستان', lang: 'fa', flag: '🇦🇫', rtl: true },
            { code: 'IR', name: 'ایران', lang: 'fa', flag: '🇮🇷', rtl: true },
            { code: 'TR', name: 'Türkiye', lang: 'tr', flag: '🇹🇷' },
            { code: 'IL', name: 'ישראל', lang: 'he', flag: '🇮🇱', rtl: true },
            { code: 'AZ', name: 'Azərbaycan', lang: 'az', flag: '🇦🇿' },
            { code: 'GE', name: 'საქართველო', lang: 'ka', flag: '🇬🇪' },
            { code: 'AM', name: 'Հdelays', lang: 'hy', flag: '🇦🇲' },
            { code: 'KZ', name: 'Қазақстан', lang: 'kk', flag: '🇰🇿' },
            { code: 'UZ', name: 'Oʻzbekiston', lang: 'uz', flag: '🇺🇿' },
            { code: 'TM', name: 'Türkmenistan', lang: 'tk', flag: '🇹🇲' },
            { code: 'KG', name: 'Кыргызстан', lang: 'ky', flag: '🇰🇬' },
            { code: 'TJ', name: 'Тоҷикистон', lang: 'tg', flag: '🇹🇯' },
            { code: 'MN', name: 'Монгол', lang: 'mn', flag: '🇲🇳' },

            // Latin American Countries
            { code: 'MX', name: 'México', lang: 'es', flag: '🇲🇽' },
            { code: 'BR', name: 'Brasil', lang: 'pt', flag: '🇧🇷' },
            { code: 'AR', name: 'Argentina', lang: 'es', flag: '🇦🇷' },
            { code: 'CO', name: 'Colombia', lang: 'es', flag: '🇨🇴' },
            { code: 'CL', name: 'Chile', lang: 'es', flag: '🇨🇱' },
            { code: 'PE', name: 'Perú', lang: 'es', flag: '🇵🇪' },
            { code: 'VE', name: 'Venezuela', lang: 'es', flag: '🇻🇪' },
            { code: 'EC', name: 'Ecuador', lang: 'es', flag: '🇪🇨' },
            { code: 'GT', name: 'Guatemala', lang: 'es', flag: '🇬🇹' },
            { code: 'CU', name: 'Cuba', lang: 'es', flag: '🇨🇺' },
            { code: 'BO', name: 'Bolivia', lang: 'es', flag: '🇧🇴' },
            { code: 'DO', name: 'República Dominicana', lang: 'es', flag: '🇩🇴' },
            { code: 'HN', name: 'Honduras', lang: 'es', flag: '🇭🇳' },
            { code: 'PY', name: 'Paraguay', lang: 'es', flag: '🇵🇾' },
            { code: 'SV', name: 'El Salvador', lang: 'es', flag: '🇸🇻' },
            { code: 'NI', name: 'Nicaragua', lang: 'es', flag: '🇳🇮' },
            { code: 'CR', name: 'Costa Rica', lang: 'es', flag: '🇨🇷' },
            { code: 'PA', name: 'Panamá', lang: 'es', flag: '🇵🇦' },
            { code: 'UY', name: 'Uruguay', lang: 'es', flag: '🇺🇾' },

            // African Countries
            { code: 'ET', name: 'ኢትዮጵያ', lang: 'am', flag: '🇪🇹' },
            { code: 'TZ', name: 'Tanzania', lang: 'sw', flag: '🇹🇿' },
            { code: 'RW', name: 'Rwanda', lang: 'rw', flag: '🇷🇼' },
            { code: 'SN', name: 'Sénégal', lang: 'fr', flag: '🇸🇳' },
            { code: 'CI', name: "Côte d'Ivoire", lang: 'fr', flag: '🇨🇮' },
            { code: 'CM', name: 'Cameroun', lang: 'fr', flag: '🇨🇲' },
            { code: 'MZ', name: 'Moçambique', lang: 'pt', flag: '🇲🇿' },
            { code: 'AO', name: 'Angola', lang: 'pt', flag: '🇦🇴' },

            // Russia and neighbors
            { code: 'RU', name: 'Россия', lang: 'ru', flag: '🇷🇺' },
            { code: 'BY', name: 'Беларусь', lang: 'be', flag: '🇧🇾' },
            { code: 'MD', name: 'Moldova', lang: 'ro', flag: '🇲🇩' },
        ];
    }

    /**
     * Get all countries
     */
    static getAll(): Country[] {
        return this.countries;
    }

    /**
     * Filter countries by query
     */
    static filter(query: string): Country[] {
        const filterLower = query.toLowerCase();
        return this.countries.filter(c =>
            c.name.toLowerCase().includes(filterLower) ||
            c.code.toLowerCase().includes(filterLower)
        );
    }

    /**
     * Get current country code
     */
    static getCurrentCode(): string {
        return CookieUtils.get('country') || 'SA';
    }

    /**
     * Get current country
     */
    static getCurrent(): Country | undefined {
        const code = this.getCurrentCode();
        return this.countries.find(c => c.code === code);
    }

    /**
     * Select country and update language
     */
    static select(countryCode: string): void {
        const country = this.countries.find(c => c.code === countryCode);
        if (!country) return;

        // Save to cookies
        CookieUtils.set('country', countryCode, 365);
        CookieUtils.set('lang', country.lang, 365);

        // Update user preferences if logged in
        if (State.currentUser && State.sessionId) {
            this.updateUserPreferences(countryCode, country.lang);
        }

        // Reload page with new language
        window.location.href = `?lang=${country.lang}`;
    }

    /**
     * Update user preferences on server
     */
    private static async updateUserPreferences(country: string, lang: string): Promise<void> {
        try {
            await ApiClient.put('/api/users/preferences', { country, language: lang });
        } catch (err) {
            console.error('Failed to update preferences:', err);
        }
    }

    /**
     * Render countries list in container
     */
    static renderList(filter: string = ''): void {
        const container = document.getElementById('countriesList');
        if (!container) return;

        const currentCountry = this.getCurrentCode();
        const filtered = filter ? this.filter(filter) : this.countries;

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
        onclick="CountryService.select('${country.code}')" 
        class="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${country.code === currentCountry ? 'bg-purple-50 dark:bg-purple-900/30' : ''}"
      >
        <img src="https://flagcdn.com/w40/${country.code.toLowerCase()}.png" class="w-6 h-4 object-cover rounded-sm shadow-sm" alt="${country.code}">
        <span class="flex-1 ${country.rtl ? 'text-right' : 'text-left'} text-sm font-medium text-gray-900 dark:text-white">${country.name}</span>
        ${country.code === currentCountry ? '<i class="fas fa-check text-purple-600 text-sm"></i>' : ''}
      </button>
    `).join('');
    }
}

export default CountryService;
