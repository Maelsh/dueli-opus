/**
 * Dueli Internationalization (i18n) - Modular Design
 * نظام الترجمة والتعريب - التصميم المعياري
 *
 * UNIT 42.1 (R4-GLOBAL-I18N-ALL-LANGS-1) — lazy-loading architecture:
 *   - Only `ar`/`en` are bundled inside the code package (`_worker.js` +
 *     `app.js`). Their size stays constant no matter how many languages
 *     are added later.
 *   - Every further language ships as a NESTED static dictionary under
 *     `/static/locales/<lang>.json` (written by the generator's
 *     `emit-json` command) and is lazily fetched exactly once per Isolate
 *     by `ensureLanguageLoaded()`, then kept in memory via
 *     `registerLanguage()`.
 *   - `getUILanguage()` resolves ONLY languages actually loaded in memory;
 *     anything else — including a language registered without a dictionary
 *     file yet — falls back to English instantly and never throws.
 *   - On the browser side the server injects the already-resolved pack into
 *     the document head as `window.__DUELI_LOCALE_PACK__` (layout.ts); this
 *     module registers it synchronously on load so the client bundle needs
 *     no dictionary of its own and no extra network round trip.
 */

// Bundled language translations (the ONLY dictionaries inside the code bundle)
import { ar } from './ar';
import { en } from './en';
import { LANGUAGES, getLanguageMeta } from './languages';
export { LANGUAGES, getLanguageMeta, isKnownLanguage, type LanguageMeta } from './languages';

/**
 * Languages whose translation pack is embedded in the code bundle itself.
 * UNIT 42.1: exactly `ar` + `en`. All further languages load lazily from
 * `/static/locales/<lang>.json` and must never be imported here as
 * TypeScript — that is what keeps `_worker.js`/`app.js` from growing.
 *
 * NOTE: `TRANSLATED_LANGUAGES` no longer means "languages with a
 * translation" (the runtime registry decides that now); it means exactly
 * "languages compiled into the bundle". The DB content-language boundary
 * (`normalizeContentLanguage`) still uses this list on purpose: the
 * database only backs ar/en columns.
 */
export const TRANSLATED_LANGUAGES = ['ar', 'en'] as const;
export type TranslatedLanguage = typeof TRANSLATED_LANGUAGES[number];

// Language can be ANY language code (all languages supported)
// If translation not available, English is used as fallback
export type Language = string;
export const DEFAULT_LANGUAGE: TranslatedLanguage = 'en'; // English as global fallback

// Combined translations object
// T3.1: typed as Record so new languages can be registered at runtime
export const translations: Record<string, any> = { ar, en };

/** True when `lang` has a pack registered in the current Isolate/page. */
export function isLanguageLoaded(lang: string): boolean {
    if (!lang || typeof lang !== 'string') return false;
    // Own property only: inherited names (`toString`, `constructor`, …) must
    // never count as a translation pack.
    return Object.prototype.hasOwnProperty.call(translations, lang)
        && typeof translations[lang] === 'object'
        && translations[lang] !== null;
}

/**
 * T3.1: Register a translation pack at runtime (used when adding languages).
 * registerLanguage('fr', fr) — then getUILanguage/t/isRTL work immediately.
 */
export function registerLanguage(code: string, pack: Record<string, any>): void {
    translations[code] = pack;
}

/**
 * UNIT 42.1 — Browser: the server rendered this page in a language it had
 * already resolved, and layout.ts embedded that pack in the head. Register
 * it synchronously at bundle-load time (the inline script runs before the
 * deferred `app.js`), so every client render matches the SSR markup.
 */
if (typeof window !== 'undefined' && (window as unknown as { __DUELI_LOCALE_PACK__?: unknown }).__DUELI_LOCALE_PACK__) {
    try {
        const injected = (window as unknown as { __DUELI_LOCALE_PACK__?: { code?: unknown; pack?: unknown } }).__DUELI_LOCALE_PACK__;
        if (
            typeof injected?.code === 'string'
            && injected.code
            && typeof injected.pack === 'object'
            && injected.pack !== null
        ) {
            registerLanguage(injected.code, injected.pack as Record<string, any>);
        }
    } catch {
        // Never break the client over an injected pack; English stays active.
    }
}

/**
 * Languages available in the switcher =
 * enabled in the registry AND having a loaded translation pack.
 */
export function getAvailableLanguages() {
    return LANGUAGES.filter(l => l.enabled && translations[l.code]);
}

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
 * Get the UI language for a given language code.
 *
 * UNIT 42.1: `lang` is returned only when its pack is actually loaded in
 * memory (bundled ar/en, or lazily joined via ensureLanguageLoaded any code).
 * Anything else — unknown code, registered-but-fileless language, junk —
 * falls back instantly and safely to English. This is the internal
 * synchronous resolver; the middleware loads packs BEFORE any consumer
 * calls this for the request language.
 */
export function getUILanguage(lang: Language): Language {
    if (isLanguageLoaded(lang)) return lang;
    return DEFAULT_LANGUAGE; // English fallback
}

export function t(key: string, lang: Language): string {
    // 7.A compat: the task contract names the keys `live.*`, but `live` must
    // stay a plain string (all existing `tr.live` usages). Canonical storage
    // is `live_signaling.*`; accept the `live.*` alias for these keys.
    const LIVE_ALIAS: Record<string, string> = {
        'live.connecting': 'live_signaling.connecting',
        'live.connected': 'live_signaling.connected',
        'live.connection_failed': 'live_signaling.connection_failed',
        'live.permission_denied': 'live_signaling.permission_denied',
        'live.network_restricted': 'live_signaling.network_restricted',
        'live.turn_unavailable': 'live_signaling.turn_unavailable',
    };
    const resolvedKey = LIVE_ALIAS[key] ?? key;
    const keys = resolvedKey.split('.');
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

// RTL detection — T3.1: derived from the central registry (dir field),
// with a static fallback list for languages not yet in the registry.
// UNIT 42.1: ar/fa/ur (+he) are registered as rtl, so the registry decides.
const RTL_FALLBACK: string[] = ['fa', 'he', 'ur', 'ps', 'sd', 'ug', 'yi'];

export function isRTL(lang: Language): boolean {
    if (!lang || typeof lang !== 'string') return false;
    const meta = getLanguageMeta(lang);
    if (meta) return meta.dir === 'rtl';
    return RTL_FALLBACK.includes(lang);
}

export function getDir(lang: Language): 'rtl' | 'ltr' {
    return isRTL(lang) ? 'rtl' : 'ltr';
}

// ────────────────────────────────────────────────────────────────────────────
// UNIT 42.1 — lazy dictionary loading engine (static locale packs)
// ────────────────────────────────────────────────────────────────────────────

/** Locale-declared languages whose /static/locales/<lang>.json request failed. */
const localeMisses = new Set<string>();

/** `/static/locales/<lang>.json` — the canonical asset URL of a pack. */
export function localeAssetUrl(lang: string): string {
    return `/static/locales/${encodeURIComponent(lang)}.json`;
}

/**
 * Read a locale pack asset. Order:
 *   1. Cloudflare Pages/Workers — the provided `assetsFetcher` (built in
 *      main.ts from `c.env.ASSETS`, the platform's asset store).
 *   2. Node/Vitest (or when ASSETS is unavailable) — the repository copy
 *      `public/static/locales/<lang>.json` on disk via a guarded dynamic
 *      import. The computed specifier keeps `node:fs` out of both bundles
 *      (esbuild/rollup never statically resolve it), and the code path is
 *      unreachable in the browser/Workers runtimes (misses → English).
 * Missing/invalid data returns `null` — never throws.
 */
async function readLocaleAsset(
    lang: string,
    assetsFetcher?: (url: string) => Promise<Response | null>
): Promise<string | null> {
    if (assetsFetcher) {
        try {
            const res = await assetsFetcher(localeAssetUrl(lang));
            if (res && res.ok) return await res.text();
        } catch {
            // fall through to the filesystem fallback
        }
    }
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        try {
            const fsId = 'node' + ':fs';
            const fs = (await import(/* @vite-ignore */ fsId)) as { default: { readFileSync: (p: string, e: string) => string } };
            const cwd = process.cwd().replace(/\\/g, '/');
            return fs.default.readFileSync(`${cwd}/public/static/locales/${lang}.json`, 'utf8');
        } catch {
            // not found / not Node — caller falls back to English
        }
    }
    return null;
}

/** Parse + structural sanity-check a raw locale file body. */
function parseLocalePack(raw: string): Record<string, any> | null {
    try {
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
        const keys = Object.keys(parsed);
        if (keys.length === 0) return null;
        // The canonical pack must be a nested dictionary of strings/objects
        // starting with the brand key — one cheap discriminator against any
        // garbled/foreign file on the asset route.
        if (typeof parsed.app_title !== 'string') return null;
        return parsed as Record<string, any>;
    } catch {
        return null;
    }
}

/**
 * UNIT 42.1 — lazy-load engine. Loads `/static/locales/<lang>.json` exactly
 * once per Isolate/page and registers it in memory so the synchronous
 * `getUILanguage()`/`t()` resolvers work for this request and every later
 * one — with NO code-bundle growth, no build-time dictionary imports.
 *
 * Semantics:
 *   - `ar`/`en` are bundled from code → instant no-op.
 *   - Unknown/unregistered codes (everything outside the 56-language
 *     registry) are refused silently — the allow-list also keeps cache
 *     polluters and arbitrary junk paths off the asset store.
 *   - A known language whose pack file is not shipped yet → single negative
 *     cache entry (`localeMisses`), no error, no retry storm: every consumer
 *     simply continues in English (graceful degradation by design).
 *   - Invalid/garbled JSON is treated like a missing file.
 */
export async function ensureLanguageLoaded(
    lang: Language,
    assetsFetcher?: (url: string) => Promise<Response | null>
): Promise<void> {
    if (!lang || typeof lang !== 'string') return;
    if (lang === 'ar' || lang === 'en') return;         // bundled — nothing to load
    if (isLanguageLoaded(lang)) return;                 // already registered in memory
    if (localeMisses.has(lang)) return;                 // known miss — keep silent
    if (!getLanguageMeta(lang)) {
        localeMisses.add(lang);                         // not in the registry → allow-list miss
        return;
    }

    const raw = await readLocaleAsset(lang, assetsFetcher);
    const pack = raw ? parseLocalePack(raw) : null;
    if (pack) {
        registerLanguage(lang, pack);
        return;
    }
    // No valid pack on the asset route → every later request reuses this
    // miss and the platform stays on the English fallback, error-free.
    localeMisses.add(lang);
}

/**
 * Post-R1 acceptance (E) — canonical content-language normalization.
 *
 * UNIT 42.1 keeps this boundary STRICTLY ar/en on purpose: the database only
 * has backing data for those two content languages (e.g.
 * `categories.name_ar/name_en`). The 13 new UI languages do NOT change the
 * SQL-facing content language — any other value (fr, zh, xx, malformed, …)
 * MUST fall back to the application default instead of ever reaching SQL as
 * a column identifier. This is the single boundary every dynamic column
 * selection must use.
 */
export const CONTENT_LANGUAGES = ['ar', 'en'] as const;
export type ContentLanguage = typeof CONTENT_LANGUAGES[number];

export function normalizeContentLanguage(lang: unknown): ContentLanguage {
    if (typeof lang === 'string') {
        const code = lang.trim().toLowerCase().split(/[^a-z]/)[0];
        if (CONTENT_LANGUAGES.includes(code as ContentLanguage)) {
            return code as ContentLanguage;
        }
    }
    return DEFAULT_LANGUAGE as ContentLanguage; // always 'en'
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
 * Priority: category_name_${lang}/name_${lang} (explicit DB fields) →
 * name_key (i18n) → slug as namespaced key (categories.<slug>/bare slug) →
 * English → any available.
 *
 * NOTE: explicit DB fields win over slug-key lookup on purpose. A bare slug
 * key (e.g. `physics`) may resolve to a DIFFERENT i18n pack (the legacy flat
 * block) than the caller's language, which previously returned English
 * "Physics" in an Arabic context despite name_ar being present. Slug lookup
 * is namespaced (categories.<slug> first, bare slug only as back-compat) so
 * flat-pack mismatches can never shadow the requested language again.
 */
export function getCategoryName(category: Record<string, any>, lang: Language): string {
    const uiLang = getUILanguage(lang);
    const requestedLang = TRANSLATED_LANGUAGES.includes(lang as TranslatedLanguage)
        ? (lang as TranslatedLanguage)
        : uiLang;

    // 1. Explicit DB fields in the REQUESTED language first (never English-first).
    const catReqKey = `category_name_${requestedLang}`;
    if (category[catReqKey]) return category[catReqKey];
    const nameReqKey = `name_${requestedLang}`;
    if (category[nameReqKey]) return category[nameReqKey];

    // 2. Try name_key first (i18n translation lookup)
    if (category.name_key) {
        const translated = t(category.name_key, uiLang);
        // If translation found (not returning the key itself)
        if (translated !== category.name_key) return translated;
    }

    // 3. Try slug as a NAMESPACED translation key (convert 'current-affairs' to 'current_affairs').
    // Check both 'slug' and 'category_slug' (API uses category_slug).
    // 'categories.<slug>' is authoritative; the bare slug is back-compat only
    // (it can hit legacy flat packs in the wrong language, so it comes last).
    const slug = category.slug || category.category_slug;
    if (slug) {
        const slugKey = slug.replace(/-/g, '_');
        const namespaced = t(`categories.${slugKey}`, uiLang);
        if (namespaced !== `categories.${slugKey}`) return namespaced;
        const translated = t(slugKey, uiLang);
        if (translated !== slugKey) return translated;
    }

    // 4. Explicit DB fields in the resolved UI language (uiLang may differ
    // from requestedLang only for untranslated languages → English anyway).
    const catLangKey = `category_name_${uiLang}`;
    if (category[catLangKey]) return category[catLangKey];
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
