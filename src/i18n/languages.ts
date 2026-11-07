/**
 * @file src/i18n/languages.ts
 * @description سجل اللغات المركزي - T3.1 العولمة + UNIT 42.1 (R4-GLOBAL-I18N-ALL-LANGS-1)
 *
 * إضافة لغة جديدة للمنصة (الطريق المعتمد، بلا أي استيراد داخل حزمة الكود):
 *   1. ولّد القاموس عبر dev-tools/i18n-global-generator.mjs
 *      (translate/merge/validate ثم emit-json) فيُكتب القاموس المتداخل
 *      إلى public/static/locales/<lang>.json — يُستجلاب وقت الطلب عبر
 *      ensureLanguageLoaded() ويُسجَّل في الذاكرة عبر registerLanguage().
 *      لا يُستورد القاموس أبداً كملف TypeScript في الباندل (حجم worker
 *      ومتصفح ثابت مهما زادت اللغات).
 *   2. أضف سطراً واحداً في LANGUAGES أدناه واجعل enabled: true.
 *   3. أدخل مثقال og:locale في OG_LOCALE داخل src/shared/templates/seo.ts
 *      وخطه (للكتابات غير اللاتينية) في fontMap داخل layout.ts.
 * لا حاجة لأي تعديل آخر في المنصة — الاتجاه (RTL/LTR) والاسم يُشتقان من هنا.
 */

export interface LanguageMeta {
    /** ISO 639-1 code */
    code: string;
    /** Language name in its own script */
    nativeName: string;
    /** Text direction */
    dir: 'rtl' | 'ltr';
    /** Available in the language switcher (has a shipped dictionary). */
    enabled: boolean;
}

/**
 * Central language registry — single source of truth.
 *
 * UNIT 42.1+43: 56 registered languages, ALL ENABLED. Every language carries
 * a complete dictionary pack: ar/en bundled in the code, the other 54 as
 * runtime-loaded static JSON under /static/locales/<code>.json via
 * ensureLanguageLoaded(). RTL: ar/fa/ur/he; everything else is LTR.
 * `enabled` means "has a usable dictionary pack" — the switcher shows exactly
 * the languages whose pack is loaded in memory (getAvailableLanguages()).
 */
export const LANGUAGES: LanguageMeta[] = [
    // ── UNIT 42.1 — the base + first-wave global languages ───────────────────
    { code: 'ar', nativeName: 'العربية', dir: 'rtl', enabled: true },
    { code: 'en', nativeName: 'English', dir: 'ltr', enabled: true },
    { code: 'es', nativeName: 'Español', dir: 'ltr', enabled: true },
    { code: 'fr', nativeName: 'Français', dir: 'ltr', enabled: true },
    { code: 'de', nativeName: 'Deutsch', dir: 'ltr', enabled: true },
    { code: 'pt', nativeName: 'Português', dir: 'ltr', enabled: true },
    { code: 'ru', nativeName: 'Русский', dir: 'ltr', enabled: true },
    { code: 'zh', nativeName: '中文', dir: 'ltr', enabled: true },
    { code: 'ja', nativeName: '日本語', dir: 'ltr', enabled: true },
    { code: 'ko', nativeName: '한국어', dir: 'ltr', enabled: true },
    { code: 'tr', nativeName: 'Türkçe', dir: 'ltr', enabled: true },
    { code: 'hi', nativeName: 'हिन्दी', dir: 'ltr', enabled: true },
    { code: 'id', nativeName: 'Bahasa Indonesia', dir: 'ltr', enabled: true },
    { code: 'fa', nativeName: 'فارسی', dir: 'rtl', enabled: true },
    { code: 'ur', nativeName: 'اردو', dir: 'rtl', enabled: true },
    // ── UNIT 42.1 completion — the remaining 41 global languages ────────────
    { code: 'he', nativeName: 'עברית', dir: 'rtl', enabled: true },
    { code: 'it', nativeName: 'Italiano', dir: 'ltr', enabled: true },
    { code: 'nl', nativeName: 'Nederlands', dir: 'ltr', enabled: true },
    { code: 'sv', nativeName: 'Svenska', dir: 'ltr', enabled: true },
    { code: 'no', nativeName: 'Norsk', dir: 'ltr', enabled: true },
    { code: 'da', nativeName: 'Dansk', dir: 'ltr', enabled: true },
    { code: 'fi', nativeName: 'Suomi', dir: 'ltr', enabled: true },
    { code: 'pl', nativeName: 'Polski', dir: 'ltr', enabled: true },
    { code: 'cs', nativeName: 'Čeština', dir: 'ltr', enabled: true },
    { code: 'el', nativeName: 'Ελληνικά', dir: 'ltr', enabled: true },
    { code: 'ro', nativeName: 'Română', dir: 'ltr', enabled: true },
    { code: 'hu', nativeName: 'Magyar', dir: 'ltr', enabled: true },
    { code: 'bg', nativeName: 'Български', dir: 'ltr', enabled: true },
    { code: 'hr', nativeName: 'Hrvatski', dir: 'ltr', enabled: true },
    { code: 'sr', nativeName: 'Српски', dir: 'ltr', enabled: true },
    { code: 'uk', nativeName: 'Українська', dir: 'ltr', enabled: true },
    { code: 'th', nativeName: 'ไทย', dir: 'ltr', enabled: true },
    { code: 'vi', nativeName: 'Tiếng Việt', dir: 'ltr', enabled: true },
    { code: 'ms', nativeName: 'Bahasa Melayu', dir: 'ltr', enabled: true },
    { code: 'bn', nativeName: 'বাংলা', dir: 'ltr', enabled: true },
    { code: 'my', nativeName: 'မြန်မာ', dir: 'ltr', enabled: true },
    { code: 'km', nativeName: 'ខ្មែរ', dir: 'ltr', enabled: true },
    { code: 'lo', nativeName: 'ລາວ', dir: 'ltr', enabled: true },
    { code: 'ne', nativeName: 'नेपाली', dir: 'ltr', enabled: true },
    { code: 'si', nativeName: 'සිංහල', dir: 'ltr', enabled: true },
    { code: 'az', nativeName: 'Azərbaycan', dir: 'ltr', enabled: true },
    { code: 'ka', nativeName: 'ქართული', dir: 'ltr', enabled: true },
    { code: 'hy', nativeName: 'Հայերեն', dir: 'ltr', enabled: true },
    { code: 'kk', nativeName: 'Қазақ', dir: 'ltr', enabled: true },
    { code: 'uz', nativeName: 'Oʻzbek', dir: 'ltr', enabled: true },
    { code: 'tk', nativeName: 'Türkmen', dir: 'ltr', enabled: true },
    { code: 'ky', nativeName: 'Кыргызча', dir: 'ltr', enabled: true },
    { code: 'tg', nativeName: 'Тоҷикӣ', dir: 'ltr', enabled: true },
    { code: 'mn', nativeName: 'Монгол', dir: 'ltr', enabled: true },
    { code: 'am', nativeName: 'አማርኛ', dir: 'ltr', enabled: true },
    { code: 'sw', nativeName: 'Kiswahili', dir: 'ltr', enabled: true },
    { code: 'rw', nativeName: 'Kinyarwanda', dir: 'ltr', enabled: true },
    { code: 'be', nativeName: 'Беларуская', dir: 'ltr', enabled: true },
    { code: 'is', nativeName: 'Íslenska', dir: 'ltr', enabled: true },
    { code: 'mt', nativeName: 'Malti', dir: 'ltr', enabled: true },
    { code: 'ca', nativeName: 'Català', dir: 'ltr', enabled: true },
];

export function getLanguageMeta(code: string): LanguageMeta | undefined {
    return LANGUAGES.find(l => l.code === code);
}

export function isKnownLanguage(code: string): boolean {
    return LANGUAGES.some(l => l.code === code);
}
