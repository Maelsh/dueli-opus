/**
 * @file core/i18n/index.ts
 * @description تصدير خدمة الترجمة
 * @description_en Export i18n service
 * @module core/i18n
 * @version 1.0.0
 */

export * from './I18nService';
export { I18nService, i18n, t, getDir, isRTL, default as I18nServiceClass } from './I18nService';

// Re-export Language type from core/http/types for convenience
export type { Language } from '../http/types';
