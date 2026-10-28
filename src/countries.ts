// Countries data with native names and primary languages
// البلدان مع أسمائها بلغاتها الأصلية

export interface Country {
    code: string;           // ISO 3166-1 alpha-2 code
    nativeName: string;     // Name in country's primary language
    primaryLang: string;    // Primary language code (ISO 639-1)
    flag: string;           // Emoji flag
    rtl?: boolean;          // Right-to-left language
}

export const countries: Record<string, Country> = {
    // Arabic Countries
    'SA': { code: 'SA', nativeName: 'السعودية', primaryLang: 'ar', flag: '🇸🇦', rtl: true },
    'EG': { code: 'EG', nativeName: 'مصر', primaryLang: 'ar', flag: '🇪🇬', rtl: true },
    'AE': { code: 'AE', nativeName: 'الإمارات', primaryLang: 'ar', flag: '🇦🇪', rtl: true },
    'KW': { code: 'KW', nativeName: 'الكويت', primaryLang: 'ar', flag: '🇰🇼', rtl: true },
    'QA': { code: 'QA', nativeName: 'قطر', primaryLang: 'ar', flag: '🇶🇦', rtl: true },
    'BH': { code: 'BH', nativeName: 'البحرين', primaryLang: 'ar', flag: '🇧🇭', rtl: true },
    'OM': { code: 'OM', nativeName: 'عمان', primaryLang: 'ar', flag: '🇴🇲', rtl: true },
    'JO': { code: 'JO', nativeName: 'الأردن', primaryLang: 'ar', flag: '🇯🇴', rtl: true },
    'LB': { code: 'LB', nativeName: 'لبنان', primaryLang: 'ar', flag: '🇱🇧', rtl: true },
    'SY': { code: 'SY', nativeName: 'سوريا', primaryLang: 'ar', flag: '🇸🇾', rtl: true },
    'IQ': { code: 'IQ', nativeName: 'العراق', primaryLang: 'ar', flag: '🇮🇶', rtl: true },
    'YE': { code: 'YE', nativeName: 'اليمن', primaryLang: 'ar', flag: '🇾🇪', rtl: true },
    'PS': { code: 'PS', nativeName: 'فلسطين', primaryLang: 'ar', flag: '🇵🇸', rtl: true },
    'MA': { code: 'MA', nativeName: 'المغرب', primaryLang: 'ar', flag: '🇲🇦', rtl: true },
    'DZ': { code: 'DZ', nativeName: 'الجزائر', primaryLang: 'ar', flag: '🇩🇿', rtl: true },
    'TN': { code: 'TN', nativeName: 'تونس', primaryLang: 'ar', flag: '🇹🇳', rtl: true },
    'LY': { code: 'LY', nativeName: 'ليبيا', primaryLang: 'ar', flag: '🇱🇾', rtl: true },
    'SD': { code: 'SD', nativeName: 'السودان', primaryLang: 'ar', flag: '🇸🇩', rtl: true },
    'SO': { code: 'SO', nativeName: 'الصومال', primaryLang: 'ar', flag: '🇸🇴', rtl: true },
    'DJ': { code: 'DJ', nativeName: 'جيبوتي', primaryLang: 'ar', flag: '🇩🇯', rtl: true },
    'KM': { code: 'KM', nativeName: 'جزر القمر', primaryLang: 'ar', flag: '🇰🇲', rtl: true },
    'MR': { code: 'MR', nativeName: 'موريتانيا', primaryLang: 'ar', flag: '🇲🇷', rtl: true },

    // English-speaking Countries
    'US': { code: 'US', nativeName: 'United States', primaryLang: 'en', flag: '🇺🇸' },
    'GB': { code: 'GB', nativeName: 'United Kingdom', primaryLang: 'en', flag: '🇬🇧' },
    'CA': { code: 'CA', nativeName: 'Canada', primaryLang: 'en', flag: '🇨🇦' },
    'AU': { code: 'AU', nativeName: 'Australia', primaryLang: 'en', flag: '🇦🇺' },
    'NZ': { code: 'NZ', nativeName: 'New Zealand', primaryLang: 'en', flag: '🇳🇿' },
    'IE': { code: 'IE', nativeName: 'Ireland', primaryLang: 'en', flag: '🇮🇪' },
    'ZA': { code: 'ZA', nativeName: 'South Africa', primaryLang: 'en', flag: '🇿🇦' },
    'IN': { code: 'IN', nativeName: 'India', primaryLang: 'en', flag: '🇮🇳' },
    'PK': { code: 'PK', nativeName: 'Pakistan', primaryLang: 'en', flag: '🇵🇰' },
    'NG': { code: 'NG', nativeName: 'Nigeria', primaryLang: 'en', flag: '🇳🇬' },
    'KE': { code: 'KE', nativeName: 'Kenya', primaryLang: 'en', flag: '🇰🇪' },
    'GH': { code: 'GH', nativeName: 'Ghana', primaryLang: 'en', flag: '🇬🇭' },

    // European Countries
    'FR': { code: 'FR', nativeName: 'France', primaryLang: 'fr', flag: '🇫🇷' },
    'DE': { code: 'DE', nativeName: 'Deutschland', primaryLang: 'de', flag: '🇩🇪' },
    'ES': { code: 'ES', nativeName: 'España', primaryLang: 'es', flag: '🇪🇸' },
    'IT': { code: 'IT', nativeName: 'Italia', primaryLang: 'it', flag: '🇮🇹' },
    'PT': { code: 'PT', nativeName: 'Portugal', primaryLang: 'pt', flag: '🇵🇹' },
    'NL': { code: 'NL', nativeName: 'Nederland', primaryLang: 'nl', flag: '🇳🇱' },
    'BE': { code: 'BE', nativeName: 'België', primaryLang: 'nl', flag: '🇧🇪' },
    'CH': { code: 'CH', nativeName: 'Schweiz', primaryLang: 'de', flag: '🇨🇭' },
    'AT': { code: 'AT', nativeName: 'Österreich', primaryLang: 'de', flag: '🇦🇹' },
    'SE': { code: 'SE', nativeName: 'Sverige', primaryLang: 'sv', flag: '🇸🇪' },
    'NO': { code: 'NO', nativeName: 'Norge', primaryLang: 'no', flag: '🇳🇴' },
    'DK': { code: 'DK', nativeName: 'Danmark', primaryLang: 'da', flag: '🇩🇰' },
    'FI': { code: 'FI', nativeName: 'Suomi', primaryLang: 'fi', flag: '🇫🇮' },
    'PL': { code: 'PL', nativeName: 'Polska', primaryLang: 'pl', flag: '🇵🇱' },
    'CZ': { code: 'CZ', nativeName: 'Česko', primaryLang: 'cs', flag: '🇨🇿' },
    'GR': { code: 'GR', nativeName: 'Ελλάδα', primaryLang: 'el', flag: '🇬🇷' },
    'RO': { code: 'RO', nativeName: 'România', primaryLang: 'ro', flag: '🇷🇴' },
    'HU': { code: 'HU', nativeName: 'Magyarország', primaryLang: 'hu', flag: '🇭🇺' },
    'BG': { code: 'BG', nativeName: 'България', primaryLang: 'bg', flag: '🇧🇬' },
    'HR': { code: 'HR', nativeName: 'Hrvatska', primaryLang: 'hr', flag: '🇭🇷' },
    'RS': { code: 'RS', nativeName: 'Србија', primaryLang: 'sr', flag: '🇷🇸' },
    'UA': { code: 'UA', nativeName: 'Україна', primaryLang: 'uk', flag: '🇺🇦' },

    // Asian Countries
    'CN': { code: 'CN', nativeName: '中国', primaryLang: 'zh', flag: '🇨🇳' },
    'JP': { code: 'JP', nativeName: '日本', primaryLang: 'ja', flag: '🇯🇵' },
    'KR': { code: 'KR', nativeName: '대한민국', primaryLang: 'ko', flag: '🇰🇷' },
    'TH': { code: 'TH', nativeName: 'ประเทศไทย', primaryLang: 'th', flag: '🇹🇭' },
    'VN': { code: 'VN', nativeName: 'Việt Nam', primaryLang: 'vi', flag: '🇻🇳' },
    'ID': { code: 'ID', nativeName: 'Indonesia', primaryLang: 'id', flag: '🇮🇩' },
    'MY': { code: 'MY', nativeName: 'Malaysia', primaryLang: 'ms', flag: '🇲🇾' },
    'SG': { code: 'SG', nativeName: 'Singapore', primaryLang: 'en', flag: '🇸🇬' },
    'PH': { code: 'PH', nativeName: 'Philippines', primaryLang: 'en', flag: '🇵🇭' },
    'BD': { code: 'BD', nativeName: 'বাংলাদেশ', primaryLang: 'bn', flag: '🇧🇩' },
    'MM': { code: 'MM', nativeName: 'မြန်မာ', primaryLang: 'my', flag: '🇲🇲' },
    'KH': { code: 'KH', nativeName: 'កម្ពុជា', primaryLang: 'km', flag: '🇰🇭' },
    'LA': { code: 'LA', nativeName: 'ລາວ', primaryLang: 'lo', flag: '🇱🇦' },
    'NP': { code: 'NP', nativeName: 'नेपाल', primaryLang: 'ne', flag: '🇳🇵' },
    'LK': { code: 'LK', nativeName: 'ශ්‍රී ලංකා', primaryLang: 'si', flag: '🇱🇰' },
    'AF': { code: 'AF', nativeName: 'افغانستان', primaryLang: 'fa', flag: '🇦🇫', rtl: true },
    'IR': { code: 'IR', nativeName: 'ایران', primaryLang: 'fa', flag: '🇮🇷', rtl: true },
    'TR': { code: 'TR', nativeName: 'Türkiye', primaryLang: 'tr', flag: '🇹🇷' },
    'IL': { code: 'IL', nativeName: 'ישראל', primaryLang: 'he', flag: '🇮🇱', rtl: true },
    'AZ': { code: 'AZ', nativeName: 'Azərbaycan', primaryLang: 'az', flag: '🇦🇿' },
    'GE': { code: 'GE', nativeName: 'საქართველო', primaryLang: 'ka', flag: '🇬🇪' },
    'AM': { code: 'AM', nativeName: 'Հայաստան', primaryLang: 'hy', flag: '🇦🇲' },
    'KZ': { code: 'KZ', nativeName: 'Қазақстан', primaryLang: 'kk', flag: '🇰🇿' },
    'UZ': { code: 'UZ', nativeName: 'Oʻzbekiston', primaryLang: 'uz', flag: '🇺🇿' },
    'TM': { code: 'TM', nativeName: 'Türkmenistan', primaryLang: 'tk', flag: '🇹🇲' },
    'KG': { code: 'KG', nativeName: 'Кыргызстан', primaryLang: 'ky', flag: '🇰🇬' },
    'TJ': { code: 'TJ', nativeName: 'Тоҷикистон', primaryLang: 'tg', flag: '🇹🇯' },
    'MN': { code: 'MN', nativeName: 'Монгол', primaryLang: 'mn', flag: '🇲🇳' },

    // Latin American Countries
    'MX': { code: 'MX', nativeName: 'México', primaryLang: 'es', flag: '🇲🇽' },
    'BR': { code: 'BR', nativeName: 'Brasil', primaryLang: 'pt', flag: '🇧🇷' },
    'AR': { code: 'AR', nativeName: 'Argentina', primaryLang: 'es', flag: '🇦🇷' },
    'CO': { code: 'CO', nativeName: 'Colombia', primaryLang: 'es', flag: '🇨🇴' },
    'CL': { code: 'CL', nativeName: 'Chile', primaryLang: 'es', flag: '🇨🇱' },
    'PE': { code: 'PE', nativeName: 'Perú', primaryLang: 'es', flag: '🇵🇪' },
    'VE': { code: 'VE', nativeName: 'Venezuela', primaryLang: 'es', flag: '🇻🇪' },
    'EC': { code: 'EC', nativeName: 'Ecuador', primaryLang: 'es', flag: '🇪🇨' },
    'GT': { code: 'GT', nativeName: 'Guatemala', primaryLang: 'es', flag: '🇬🇹' },
    'CU': { code: 'CU', nativeName: 'Cuba', primaryLang: 'es', flag: '🇨🇺' },
    'BO': { code: 'BO', nativeName: 'Bolivia', primaryLang: 'es', flag: '🇧🇴' },
    'DO': { code: 'DO', nativeName: 'República Dominicana', primaryLang: 'es', flag: '🇩🇴' },
    'HN': { code: 'HN', nativeName: 'Honduras', primaryLang: 'es', flag: '🇭🇳' },
    'PY': { code: 'PY', nativeName: 'Paraguay', primaryLang: 'es', flag: '🇵🇾' },
    'SV': { code: 'SV', nativeName: 'El Salvador', primaryLang: 'es', flag: '🇸🇻' },
    'NI': { code: 'NI', nativeName: 'Nicaragua', primaryLang: 'es', flag: '🇳🇮' },
    'CR': { code: 'CR', nativeName: 'Costa Rica', primaryLang: 'es', flag: '🇨🇷' },
    'PA': { code: 'PA', nativeName: 'Panamá', primaryLang: 'es', flag: '🇵🇦' },
    'UY': { code: 'UY', nativeName: 'Uruguay', primaryLang: 'es', flag: '🇺🇾' },

    // African Countries
    'ET': { code: 'ET', nativeName: 'ኢትዮጵያ', primaryLang: 'am', flag: '🇪🇹' },
    'TZ': { code: 'TZ', nativeName: 'Tanzania', primaryLang: 'sw', flag: '🇹🇿' },
    'UG': { code: 'UG', nativeName: 'Uganda', primaryLang: 'en', flag: '🇺🇬' },
    'RW': { code: 'RW', nativeName: 'Rwanda', primaryLang: 'rw', flag: '🇷🇼' },
    'SN': { code: 'SN', nativeName: 'Sénégal', primaryLang: 'fr', flag: '🇸🇳' },
    'CI': { code: 'CI', nativeName: "Côte d'Ivoire", primaryLang: 'fr', flag: '🇨🇮' },
    'CM': { code: 'CM', nativeName: 'Cameroun', primaryLang: 'fr', flag: '🇨🇲' },
    'ZW': { code: 'ZW', nativeName: 'Zimbabwe', primaryLang: 'en', flag: '🇿🇼' },
    'ZM': { code: 'ZM', nativeName: 'Zambia', primaryLang: 'en', flag: '🇿🇲' },
    'MW': { code: 'MW', nativeName: 'Malawi', primaryLang: 'en', flag: '🇲🇼' },
    'MZ': { code: 'MZ', nativeName: 'Moçambique', primaryLang: 'pt', flag: '🇲🇿' },
    'AO': { code: 'AO', nativeName: 'Angola', primaryLang: 'pt', flag: '🇦🇴' },
    'BW': { code: 'BW', nativeName: 'Botswana', primaryLang: 'en', flag: '🇧🇼' },
    'NA': { code: 'NA', nativeName: 'Namibia', primaryLang: 'en', flag: '🇳🇦' },

    // Russia and neighbors
    'RU': { code: 'RU', nativeName: 'Россия', primaryLang: 'ru', flag: '🇷🇺' },
    'BY': { code: 'BY', nativeName: 'Беларусь', primaryLang: 'be', flag: '🇧🇾' },
    'MD': { code: 'MD', nativeName: 'Moldova', primaryLang: 'ro', flag: '🇲🇩' },

    // Other notable countries
    'IS': { code: 'IS', nativeName: 'Ísland', primaryLang: 'is', flag: '🇮🇸' },
    'MT': { code: 'MT', nativeName: 'Malta', primaryLang: 'mt', flag: '🇲🇹' },
    'CY': { code: 'CY', nativeName: 'Κύπρος', primaryLang: 'el', flag: '🇨🇾' },
    'LU': { code: 'LU', nativeName: 'Luxembourg', primaryLang: 'fr', flag: '🇱🇺' },
    'MC': { code: 'MC', nativeName: 'Monaco', primaryLang: 'fr', flag: '🇲🇨' },
    'AD': { code: 'AD', nativeName: 'Andorra', primaryLang: 'ca', flag: '🇦🇩' },
    'SM': { code: 'SM', nativeName: 'San Marino', primaryLang: 'it', flag: '🇸🇲' },
    'VA': { code: 'VA', nativeName: 'Vaticano', primaryLang: 'it', flag: '🇻🇦' },
    'LI': { code: 'LI', nativeName: 'Liechtenstein', primaryLang: 'de', flag: '🇱🇮' },
}

// Get sorted list of countries for display
export const getCountriesList = (lang?: string): Country[] => {
    const locale = lang === 'ar' ? 'ar' : 'en';
    return Object.values(countries).sort((a, b) =>
        a.nativeName.localeCompare(b.nativeName, locale)
    )
}

// Get country by code
export const getCountry = (code: string): Country | undefined => {
    return countries[code.toUpperCase()]
}

// Get countries by language
export const getCountriesByLanguage = (lang: string): Country[] => {
    return Object.values(countries).filter(c => c.primaryLang === lang)
}

// Default country - used as global fallback
export const DEFAULT_COUNTRY = 'US';

/**
 * Get locale string for Intl APIs (e.g., 'ar-SA', 'en-US', 'fr-FR')
 * Uses country's primary language and country code
 */
export function getLocale(countryCode: string, fallbackLang?: string): string {
    const country = getCountry(countryCode);
    if (country) {
        return `${country.primaryLang}-${country.code}`;
    }
    // Fallback: use provided language with US, or default to en-US
    return fallbackLang ? `${fallbackLang}-US` : 'en-US';
}

