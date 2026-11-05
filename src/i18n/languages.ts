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
 * UNIT 42.1: 56 registered languages total.
 *   - 15 ENABLED global languages (3 RTL: ar/fa/ur + 12 LTR): every one
 *     carries a full dictionary pack (ar/en bundled, the other 13 as
 *     runtime-loaded static JSON under /static/locales/<code>.json).
 *   - 41 additional languages registered from src/countries.ts
 *     (nativeName + direction only, enabled: false until their
 *     dictionary ships). Any ?lang=<code> for them loads nothing and
 *     falls back to English gracefully — no file, no error.
 */
export const LANGUAGES: LanguageMeta[] = [
    // ── UNIT 42.1 — the 15 active global languages ──────────────────────────
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
    // ── Registered-but-not-active languages (from src/countries.ts) ─────────
    { code: 'he', nativeName: 'עברית', dir: 'rtl', enabled: false },
    { code: 'it', nativeName: 'Italiano', dir: 'ltr', enabled: false },
    { code: 'nl', nativeName: 'Nederlands', dir: 'ltr', enabled: false },
    { code: 'sv', nativeName: 'Svenska', dir: 'ltr', enabled: false },
    { code: 'no', nativeName: 'Norsk', dir: 'ltr', enabled: false },
    { code: 'da', nativeName: 'Dansk', dir: 'ltr', enabled: false },
    { code: 'fi', nativeName: 'Suomi', dir: 'ltr', enabled: false },
    { code: 'pl', nativeName: 'Polski', dir: 'ltr', enabled: false },
    { code: 'cs', nativeName: 'Čeština', dir: 'ltr', enabled: false },
    { code: 'el', nativeName: 'Ελληνικά', dir: 'ltr', enabled: false },
    { code: 'ro', nativeName: 'Română', dir: 'ltr', enabled: false },
    { code: 'hu', nativeName: 'Magyar', dir: 'ltr', enabled: false },
    { code: 'bg', nativeName: 'Български', dir: 'ltr', enabled: false },
    { code: 'hr', nativeName: 'Hrvatski', dir: 'ltr', enabled: false },
    { code: 'sr', nativeName: 'Српски', dir: 'ltr', enabled: false },
    { code: 'uk', nativeName: 'Українська', dir: 'ltr', enabled: false },
    { code: 'th', nativeName: 'ไทย', dir: 'ltr', enabled: false },
    { code: 'vi', nativeName: 'Tiếng Việt', dir: 'ltr', enabled: false },
    { code: 'ms', nativeName: 'Bahasa Melayu', dir: 'ltr', enabled: false },
    { code: 'bn', nativeName: 'বাংলা', dir: 'ltr', enabled: false },
    { code: 'my', nativeName: 'မြန်မာ', dir: 'ltr', enabled: false },
    { code: 'km', nativeName: 'ខ្មែរ', dir: 'ltr', enabled: false },
    { code: 'lo', nativeName: 'ລາວ', dir: 'ltr', enabled: false },
    { code: 'ne', nativeName: 'नेपाली', dir: 'ltr', enabled: false },
    { code: 'si', nativeName: 'සිංහල', dir: 'ltr', enabled: false },
    { code: 'az', nativeName: 'Azərbaycan', dir: 'ltr', enabled: false },
    { code: 'ka', nativeName: 'ქართული', dir: 'ltr', enabled: false },
    { code: 'hy', nativeName: 'Հայերեն', dir: 'ltr', enabled: false },
    { code: 'kk', nativeName: 'Қазақ', dir: 'ltr', enabled: false },
    { code: 'uz', nativeName: 'Oʻzbek', dir: 'ltr', enabled: false },
    { code: 'tk', nativeName: 'Türkmen', dir: 'ltr', enabled: false },
    { code: 'ky', nativeName: 'Кыргызча', dir: 'ltr', enabled: false },
    { code: 'tg', nativeName: 'Тоҷикӣ', dir: 'ltr', enabled: false },
    { code: 'mn', nativeName: 'Монгол', dir: 'ltr', enabled: false },
    { code: 'am', nativeName: 'አማርኛ', dir: 'ltr', enabled: false },
    { code: 'sw', nativeName: 'Kiswahili', dir: 'ltr', enabled: false },
    { code: 'rw', nativeName: 'Kinyarwanda', dir: 'ltr', enabled: false },
    { code: 'be', nativeName: 'Беларуская', dir: 'ltr', enabled: false },
    { code: 'is', nativeName: 'Íslenska', dir: 'ltr', enabled: false },
    { code: 'mt', nativeName: 'Malti', dir: 'ltr', enabled: false },
    { code: 'ca', nativeName: 'Català', dir: 'ltr', enabled: false },
];

export function getLanguageMeta(code: string): LanguageMeta | undefined {
    return LANGUAGES.find(l => l.code === code);
}

export function isKnownLanguage(code: string): boolean {
    return LANGUAGES.some(l => l.code === code);
}
