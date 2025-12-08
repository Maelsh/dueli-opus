/**
 * @file index.ts
 * @description نقطة الدخول الرئيسية لنظام الترجمة (i18n)
 * @description_en Main entry point for the i18n system
 * @module i18n
 * @version 2.0.0
 * @author Dueli Team
 */

// تصدير الأنواع
export type { 
  Language, 
  Direction, 
  TranslationSchema,
  GeneralTranslations,
  NavTranslations,
  AuthTranslations,
  UserTranslations,
  CategoriesTranslations,
  SectionsTranslations,
  CompetitionTranslations,
  InteractionTranslations,
  StatsTranslations,
  SearchTranslations,
  SettingsTranslations,
  ErrorsTranslations,
  ModalsTranslations,
  AboutTranslations,
  VerificationTranslations,
  EmailsTranslations,
  NotificationsTranslations,
  DefaultsTranslations,
} from './types';

// تصدير الترجمات والدوال
export { translations, t, getTranslations } from './translations';

// تصدير البلدان
export { 
  countries, 
  getCountriesList, 
  getCountry, 
  getCountriesByLanguage,
  type Country 
} from '../countries';

// ===============================
// دوال مساعدة للغة
// ===============================

import type { Language, Direction } from './types';

/**
 * قائمة اللغات المدعومة
 */
export const SUPPORTED_LANGUAGES: Language[] = ['ar', 'en'];

/**
 * اللغة الافتراضية
 */
export const DEFAULT_LANGUAGE: Language = 'ar';

/**
 * اللغات من اليمين إلى اليسار
 */
export const RTL_LANGUAGES: Language[] = ['ar'];

/**
 * التحقق من صحة اللغة
 * @param lang - اللغة المراد التحقق منها
 * @returns هل اللغة مدعومة
 */
export function isValidLanguage(lang: string): lang is Language {
  return SUPPORTED_LANGUAGES.includes(lang as Language);
}

/**
 * الحصول على اللغة الآمنة (مع fallback)
 * @param lang - اللغة المطلوبة
 * @returns اللغة أو الافتراضية
 */
export function getSafeLanguage(lang: string | undefined | null): Language {
  if (lang && isValidLanguage(lang)) {
    return lang;
  }
  return DEFAULT_LANGUAGE;
}

/**
 * التحقق مما إذا كانت اللغة RTL
 * @param lang - اللغة
 * @returns هل هي RTL
 */
export function isRTL(lang: Language): boolean {
  return RTL_LANGUAGES.includes(lang);
}

/**
 * الحصول على اتجاه الصفحة
 * @param lang - اللغة
 * @returns اتجاه الصفحة
 */
export function getDir(lang: Language): Direction {
  return isRTL(lang) ? 'rtl' : 'ltr';
}

/**
 * الحصول على خط الكتابة المناسب للغة
 * @param lang - اللغة
 * @returns اسم خط الكتابة
 */
export function getFontFamily(lang: Language): string {
  return lang === 'ar' ? "'Cairo', system-ui, sans-serif" : "'Inter', system-ui, sans-serif";
}

/**
 * الحصول على لغة المتصفح المناسبة للتنسيق
 * @param lang - اللغة
 * @returns كود اللغة للمتصفح
 */
export function getLocale(lang: Language): string {
  return lang === 'ar' ? 'ar-SA' : 'en-US';
}

/**
 * تحويل اللغة من كود البلد
 * @param countryCode - كود البلد
 * @returns اللغة المناسبة
 */
export function getLanguageFromCountry(countryCode: string): Language {
  const { getCountry } = require('../countries');
  const country = getCountry(countryCode);
  if (!country) return DEFAULT_LANGUAGE;
  
  // الخريطة من اللغة الأساسية للبلد إلى اللغة المدعومة
  const langMap: Record<string, Language> = {
    'ar': 'ar',
    'en': 'en',
  };
  
  return langMap[country.primaryLang] || 'en';
}
