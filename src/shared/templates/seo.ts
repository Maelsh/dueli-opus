/**
 * UNIT38 / R4-GUIDE-1 — Global SEO & Meta (shared head builder).
 *
 * One source of truth for the meta tags every Dueli surface may carry:
 *   - meta description
 *   - OpenGraph (title/description/type/url/site/locale/image)
 *   - Twitter Cards (summary_large_image)
 *   - canonical (absolute, legal domain https://dueli.maelshpro.com)
 *   - hreflang for the languages that actually have a translation pack
 *     (ar + en) plus x-default. Languages added in UNIT42.1 are NOT
 *     invented here (docs/13 §7 + plan 13 §5).
 *   - Schema.org JSON-LD (Organization + WebSite) that identifies Dueli as
 *     a platform for dialogue competitions under Maelsh Pro, WITHOUT any
 *     unverified legal-entity claim (no founding date, no address, no
 *     "nonprofit" status — that copy is UNIT39's approved content).
 *
 * The builder is a pure function: it never reads the request, so a page
 * decides its own path/description and the head stays testable.
 */

import type { Language } from '../../config/types';
import { translations, getUILanguage } from '../../i18n';
import { Sanitize } from '../../lib/services/Sanitize';

/** Legal / canonical domain of the platform (plan 08, owner decision 2026-10-29). */
export const SITE_ORIGIN = 'https://dueli.maelshpro.com';

/** The only languages with a translation pack today (UNIT42.1 adds more). */
export const SEO_LANGUAGES = ['ar', 'en'] as const;

/** Default social image — an asset that already exists in the repository. */
export const DEFAULT_OG_IMAGE = `${SITE_ORIGIN}/static/dueli-icon.png`;

export interface SeoInput {
    /** UI language of the rendered page. */
    lang: Language;
    /** Page title (without the site suffix). */
    title: string;
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
 * Language is part of the URL contract of this platform (?lang=ar|en),
 * so the canonical keeps it; English is the default and stays implicit.
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
    const title = input.title;
    const image = input.ogImage || DEFAULT_OG_IMAGE;
    const ogType = input.ogType || 'website';
    const path = input.path || input.canonicalPath;
    const canonical = path ? canonicalUrl(input.canonicalPath || input.path || '/', input.lang) : '';

    const esc = (v: string) => Sanitize.escapeHtml(v);

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
    parts.push(`<meta property="og:locale" content="${getUILanguage(input.lang) === 'ar' ? 'ar_AR' : 'en_US'}">`);
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
