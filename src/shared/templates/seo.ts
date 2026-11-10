/**
 * UNIT38 / R4-GUIDE-1 — Global SEO & Meta (shared head builder).
 *
 * One source of truth for the meta tags every Dueli surface may carry:
 *   - meta description
 *   - OpenGraph (title/description/type/url/site/locale/image)
 *   - Twitter Cards (summary_large_image)
 *   - canonical (absolute, legal domain https://dueli.maelshpro.com)
 *   - hreflang for every enabled language of the central registry
 *     (UNIT 42.1+43: all 56 global languages — ar+en bundled, the other 54
 *     shipped as runtime locale JSON)
 *     plus x-default. The set is DERIVED from LANGUAGES — a language added
 *     there with a translation pack is automatically part of SEO.
 *   - Schema.org JSON-LD (Organization + WebSite) that identifies Dueli as
 *     a platform for dialogue competitions under Maelsh Pro, WITHOUT any
 *     unverified legal-entity claim (no founding date, no address, no
 *     "nonprofit" status — that copy is UNIT39's approved content).
 *
 * The builder is a pure function: it never reads the request, so a page
 * decides its own path/description and the head stays testable.
 */

import type { Language } from '../../config/types';
import { translations, getUILanguage, LANGUAGES } from '../../i18n';
import { Sanitize } from '../../lib/services/Sanitize';

/** Legal / canonical domain of the platform (plan 08, owner decision 2026-10-29). */
export const SITE_ORIGIN = 'https://dueli.maelshpro.com';

/**
 * Languages that carry a translation pack today (UNIT 42.1+43: all 56).
 * Derived from the central registry's ENABLED languages — `enabled: true`
 * means exactly "this language has a shipped dictionary" (bundled ar/en or
 * a static /static/locales/<lang>.json pack). The set is intentionally
 * static: hreflang must stay deterministic on every request, including a
 * request in English whose Isolate has lazily joined none of the packs yet.
 */
export const SEO_LANGUAGES: readonly string[] = LANGUAGES
    .filter((l) => l.enabled)
    .map((l) => l.code);

/** Default social image — an asset that already exists in the repository. */
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/static/dueli-icon.png`;

/**
 * OpenGraph locale per language (facebook locale format ll_CC).
 * UNIT 42.1+43 — one entry per enabled language (all 56), en_US as fallback.
 */
const OG_LOCALE: Record<string, string> = {
    ar: 'ar_AR',
    en: 'en_US',
    es: 'es_ES',
    fr: 'fr_FR',
    de: 'de_DE',
    pt: 'pt_BR',
    ru: 'ru_RU',
    zh: 'zh_CN',
    ja: 'ja_JP',
    ko: 'ko_KR',
    tr: 'tr_TR',
    hi: 'hi_IN',
    id: 'id_ID',
    fa: 'fa_IR',
    ur: 'ur_PK',
    he: 'he_IL',
    it: 'it_IT',
    nl: 'nl_NL',
    sv: 'sv_SE',
    no: 'nb_NO',
    da: 'da_DK',
    fi: 'fi_FI',
    pl: 'pl_PL',
    cs: 'cs_CZ',
    el: 'el_GR',
    ro: 'ro_RO',
    hu: 'hu_HU',
    bg: 'bg_BG',
    hr: 'hr_HR',
    sr: 'sr_RS',
    uk: 'uk_UA',
    th: 'th_TH',
    vi: 'vi_VN',
    ms: 'ms_MY',
    bn: 'bn_BD',
    my: 'my_MM',
    km: 'km_KH',
    lo: 'lo_LA',
    ne: 'ne_NP',
    si: 'si_LK',
    az: 'az_AZ',
    ka: 'ka_GE',
    hy: 'hy_AM',
    kk: 'kk_KZ',
    uz: 'uz_UZ',
    tk: 'tk_TM',
    ky: 'ky_KG',
    tg: 'tg_TJ',
    mn: 'mn_MN',
    am: 'am_ET',
    sw: 'sw_KE',
    rw: 'rw_RW',
    be: 'be_BY',
    is: 'is_IS',
    mt: 'mt_MT',
    ca: 'ca_ES',
};

export function ogLocaleFor(lang: Language): string {
    return OG_LOCALE[getUILanguage(lang)] ?? 'en_US';
}

export interface SeoInput {
    /** UI language of the rendered page. */
    lang: Language;
    /** Page title (without the site suffix). */
    title: string;
    /**
     * Complete localized document title. When provided it is used verbatim
     * for <title>, og:title and twitter:title, so the owner-approved meta
     * title can come from i18n instead of a hardcoded string.
     */
    metaTitle?: string;
    /** Meta description. Falls back to the site default for the language. */
    description?: string;
    /** Path of the current page (e.g. '/guide/help'). Used for canonical + hreflang. */
    path?: string;
    /** Overrides the canonical path (aliases point at their guide section). */
    canonicalPath?: string;
    /** OpenGraph type. Defaults to 'website'. */
    ogType?: string;
    /** Absolute social image URL. */
    ogImage?: string;
    /** Adds <meta name="robots" content="noindex,follow">. */
    noindex?: boolean;
}

/** Absolute URL for a path on the legal domain. */
export function absoluteUrl(path: string): string {
    const clean = path.startsWith('/') ? path : `/${path}`;
    return `${SITE_ORIGIN}${clean}`;
}

/** Strips the query/fragment of a path. */
function basePath(path: string): string {
    const clean = path.startsWith('/') ? path : `/${path}`;
    return clean.split('?')[0].split('#')[0];
}

/**
 * Canonical URL of a page.
 * Language is part of the URL contract of this platform (?lang=<code> for
 * every non-default language), so the canonical keeps it; English is the
 * default and stays implicit.
 */
export function canonicalUrl(path: string, lang: Language): string {
    const base = basePath(path);
    const uiLang = getUILanguage(lang);
    const suffix = uiLang === 'en' ? '' : `?lang=${uiLang}`;
    return `${SITE_ORIGIN}${base}${suffix}`;
}

/** hreflang set: one link per translated language + x-default. */
export function hreflangLinks(path: string): Array<{ hreflang: string; href: string }> {
    const base = basePath(path);
    const links: Array<{ hreflang: string; href: string }> = SEO_LANGUAGES.map((code) => ({
        hreflang: code,
        href: `${SITE_ORIGIN}${base}${code === 'en' ? '' : `?lang=${code}`}`,
    }));
    links.push({ hreflang: 'x-default', href: `${SITE_ORIGIN}${base}` });
    return links;
}

/**
 * Schema.org JSON-LD for the platform identity.
 * Parses as plain JSON (no trailing commas, no HTML entities) so crawlers
 * and tests can read it.
 */
export function buildJsonLd(lang: Language): string {
    const tr = translations[getUILanguage(lang)];
    const seo = (tr as Record<string, any>).seo ?? {};
    const description: string = seo.default_description ?? 'Dueli';

    const graph = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Organization',
                '@id': `${SITE_ORIGIN}/#organization`,
                name: 'Dueli',
                url: `${SITE_ORIGIN}/`,
                logo: {
                    '@type': 'ImageObject',
                    url: DEFAULT_OG_IMAGE,
                },
                description,
            },
            {
                '@type': 'Organization',
                '@id': `${SITE_ORIGIN}/#maelsh-pro`,
                name: 'Maelsh Pro',
            },
            {
                '@type': 'WebSite',
                '@id': `${SITE_ORIGIN}/#website`,
                url: `${SITE_ORIGIN}/`,
                name: 'Dueli',
                description,
                inLanguage: [...SEO_LANGUAGES],
                publisher: { '@id': `${SITE_ORIGIN}/#maelsh-pro` },
            },
        ],
    };

    // '<' is escaped so the payload can never terminate the <script> block.
    return JSON.stringify(graph).replace(/</g, '\\u003c');
}

/**
 * The complete meta head block (everything except <title>, which the
 * layout owns).
 */
export function buildSeoHead(input: SeoInput, nonce = ''): string {
    const tr = translations[getUILanguage(input.lang)];
    const seo = (tr as Record<string, any>).seo ?? {};
    const description: string = input.description || seo.default_description || 'Dueli';
    const title = input.metaTitle || input.title;
    const image = input.ogImage || DEFAULT_OG_IMAGE;
    const ogType = input.ogType || 'website';
    const path = input.path || input.canonicalPath;
    const canonical = path ? canonicalUrl(input.canonicalPath || input.path || '/', input.lang) : '';

    // UNIT41.2-P1 (G8): every meta value below is a DOUBLE-QUOTED attribute
    // (`content="..."`). Escape the four breakout characters but keep `'`
    // literal so `World's` is not shown as `World&#39;s`.
    const esc = (v: string) => Sanitize.escapeHtmlAttr(v);

    const parts: string[] = [];

    parts.push(`<meta name="description" content="${esc(description)}">`);
    if (input.noindex) {
        parts.push('<meta name="robots" content="noindex,follow">');
    }

    parts.push(`<meta property="og:type" content="${esc(ogType)}">`);
    parts.push('<meta property="og:site_name" content="Dueli">');
    parts.push(`<meta property="og:title" content="${esc(title)}">`);
    parts.push(`<meta property="og:description" content="${esc(description)}">`);
    parts.push(`<meta property="og:image" content="${esc(image)}">`);
    parts.push(`<meta property="og:locale" content="${esc(ogLocaleFor(input.lang))}">`);
    if (canonical) {
        parts.push(`<meta property="og:url" content="${esc(canonical)}">`);
    }

    parts.push('<meta name="twitter:card" content="summary_large_image">');
    parts.push(`<meta name="twitter:title" content="${esc(title)}">`);
    parts.push(`<meta name="twitter:description" content="${esc(description)}">`);
    parts.push(`<meta name="twitter:image" content="${esc(image)}">`);

    if (canonical) {
        parts.push(`<link rel="canonical" href="${esc(canonical)}">`);
        for (const alt of hreflangLinks(input.canonicalPath || input.path || '/')) {
            parts.push(`<link rel="alternate" hreflang="${alt.hreflang}" href="${esc(alt.href)}">`);
        }
    }

    parts.push(
        `<script type="application/ld+json"${nonce ? ` nonce="${nonce}"` : ''}>${buildJsonLd(input.lang)}</script>`
    );

    return parts.join('\n    ');
}
