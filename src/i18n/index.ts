/**
 * Dueli Internationalization (i18n) - Modular Design
 * نظام الترجمة والتعريب - التصميم المعياري
 */

// Import language translations
import { ar } from './ar';
import { en } from './en';

// Languages with available translations (can be extended)
export const TRANSLATED_LANGUAGES = ['ar', 'en'] as const;
export type TranslatedLanguage = typeof TRANSLATED_LANGUAGES[number];

// Language can be ANY language code (all languages supported)
// If translation not available, English is used as fallback
export type Language = string;
export const DEFAULT_LANGUAGE: TranslatedLanguage = 'en'; // English as global fallback

// Combined translations object
export const translations = { ar, en };

// Re-export countries from countries.ts
export { countries, getCountriesList, getCountry, getCountriesByLanguage, getLocale, DEFAULT_COUNTRY, type Country } from '../countries';

// Get language code from country code
import { getCountry as getCountryFn } from '../countries';
export function getLanguageFromCountry(countryCode: string): Language {
    const country = getCountryFn(countryCode);
    if (!country) return 'en'; // Default to English (global fallback)

    // Return the country's primary language directly
    return country.primaryLang || 'en';
}

/**
 * Get the UI language for a given language code
 * Falls back to English (global fallback) if no translation available
 */
export function getUILanguage(lang: Language): TranslatedLanguage {
    if (TRANSLATED_LANGUAGES.includes(lang as TranslatedLanguage)) {
        return lang as TranslatedLanguage;
    }
    return DEFAULT_LANGUAGE; // English fallback
}

export function t(key: string, lang: Language): string {
    const keys = key.split('.');
    const uiLang = getUILanguage(lang);
    let value: any = translations[uiLang];

    for (const k of keys) {
        if (value && typeof value === 'object' && k in value) {
            value = value[k];
        } else {
            // Fallback to English (global default)
            value = translations[DEFAULT_LANGUAGE];
            for (const k2 of keys) {
                if (value && typeof value === 'object' && k2 in value) {
                    value = value[k2];
                } else {
                    return key;
                }
            }
            break;
        }
    }

    return typeof value === 'string' ? value : key;
}

// RTL languages list - includes all RTL languages from countries
const RTL_LANGUAGES: string[] = ['ar', 'fa', 'he', 'ur'];

export function isRTL(lang: Language): boolean {
    return RTL_LANGUAGES.includes(lang);
}

export function getDir(lang: Language): 'rtl' | 'ltr' {
    return RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr';
}

/**
 * Get localized name for category/item based on language
 * Priority: name_key (i18n) → slug as key → name_${lang} → name_en → any available
 */
export function getLocalizedName(item: Record<string, any>, lang: Language): string {
    const uiLang = getUILanguage(lang);

    // 1. Try name_key first (i18n translation lookup)
    if (item.name_key) {
        const translated = t(item.name_key, uiLang);
        // If translation found (not returning the key itself)
        if (translated !== item.name_key) return translated;
    }

    // 2. Try slug as translation key (convert 'current-affairs' to 'current_affairs')
    if (item.slug) {
        const slugKey = item.slug.replace(/-/g, '_');
        const translated = t(slugKey, uiLang);
        // If translation found (not returning the key itself)
        if (translated !== slugKey) return translated;
    }

    // 3. Try requested language (e.g., name_ar, name_fr, name_de)
    const langKey = `name_${uiLang}`;
    if (item[langKey]) return item[langKey];

    // 4. Fallback to English
    if (item.name_en) return item.name_en;

    // 5. Fallback to any available language name
    const nameKeys = Object.keys(item).filter(k => k.startsWith('name_'));
    for (const key of nameKeys) {
        if (item[key]) return item[key];
    }

    return '';
}

/**
 * Get localized category name
 * Priority: name_key (i18n) → slug as key → category_name_${lang}/name_${lang} → English → any available
 */
export function getCategoryName(category: Record<string, any>, lang: Language): string {
    const uiLang = getUILanguage(lang);

    // 1. Try name_key first (i18n translation lookup)
    if (category.name_key) {
        const translated = t(category.name_key, uiLang);
        // If translation found (not returning the key itself)
        if (translated !== category.name_key) return translated;
    }

    // 2. Try slug as translation key (convert 'current-affairs' to 'current_affairs')
    // Check both 'slug' and 'category_slug' (API uses category_slug)
    const slug = category.slug || category.category_slug;
    if (slug) {
        const slugKey = slug.replace(/-/g, '_');
        const translated = t(slugKey, uiLang);
        // If translation found (not returning the key itself)
        if (translated !== slugKey) return translated;
    }

    // 3. Try category_name_${lang} first
    const catLangKey = `category_name_${uiLang}`;
    if (category[catLangKey]) return category[catLangKey];

    // 4. Try name_${lang}
    const nameLangKey = `name_${uiLang}`;
    if (category[nameLangKey]) return category[nameLangKey];

    // 5. Fallback to English
    if (category.category_name_en) return category.category_name_en;
    if (category.name_en) return category.name_en;

    // 6. Fallback to any available
    const catKeys = Object.keys(category).filter(k => k.startsWith('category_name_') || k.startsWith('name_'));
    for (const key of catKeys) {
        if (category[key]) return category[key];
    }

    return '';
}

