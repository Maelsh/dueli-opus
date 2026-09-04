/**
 * @file src/i18n/languages.ts
 * @description سجل اللغات المركزي - T3.1 العولمة
 *
 * إضافة لغة جديدة للمنصة:
 *   1. أنشئ ملف ترجمة (مثل src/i18n/fr.ts) مصدّراً بنفس شكل ar.ts/en.ts
 *   2. أضف سطراً واحداً في LANGUAGES أدناه
 *   3. سجّل الحزمة في index.ts عبر registerLanguage('fr', fr)
 * لا حاجة لأي تعديل آخر في المنصة — الاتجاه (RTL/LTR) والاسم يُشتقان من هنا.
 */

export interface LanguageMeta {
    /** ISO 639-1 code */
    code: string;
    /** Language name in its own script */
    nativeName: string;
    /** Text direction */
    dir: 'rtl' | 'ltr';
    /** Available in the language switcher */
    enabled: boolean;
}

/**
 * Central language registry — single source of truth.
 * أضف لغة جديدة هنا فقط (مع ملف الترجمة وتسجيلها).
 */
export const LANGUAGES: LanguageMeta[] = [
    { code: 'ar', nativeName: 'العربية', dir: 'rtl', enabled: true },
    { code: 'en', nativeName: 'English', dir: 'ltr', enabled: true },
];

export function getLanguageMeta(code: string): LanguageMeta | undefined {
    return LANGUAGES.find(l => l.code === code);
}

export function isKnownLanguage(code: string): boolean {
    return LANGUAGES.some(l => l.code === code);
}
