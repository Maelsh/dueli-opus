/**
 * UNIT38 / R4-GUIDE-1 — the public, indexable page registry.
 *
 * ONE source of truth for:
 *   - /sitemap.xml (the URLs a crawler may index)
 *   - the canonical + hreflang set of the pages that opt in
 *
 * Rules this file enforces by construction:
 *   - every entry is a PUBLIC surface (no /admin, no account pages, no
 *     private routes, no API paths),
 *   - every entry is a route that really exists (the regression suite
 *     compares this list against the generated route inventory),
 *   - no dynamic/parameterised URL is listed (an invented id is a broken
 *     link, so /competition/:id and /docs/:slug stay out).
 */

import { SITE_ORIGIN } from './templates/seo';

export interface PublicPageEntry {
    /** Path on the platform (no query string). */
    path: string;
    /** Crawl hint. */
    changefreq: 'daily' | 'weekly' | 'monthly' | 'yearly';
    /** Crawl priority (0.0 - 1.0). */
    priority: string;
}

/**
 * The public pages a search engine may index. Everything else on the
 * platform is either private (session-gated) or an alias of one of these.
 */
export const PUBLIC_INDEXABLE_PAGES: PublicPageEntry[] = [
    { path: '/', changefreq: 'daily', priority: '1.0' },
    { path: '/guide', changefreq: 'weekly', priority: '0.9' },
    { path: '/guide/overview', changefreq: 'monthly', priority: '0.8' },
    { path: '/guide/message', changefreq: 'monthly', priority: '0.7' },
    { path: '/guide/technology', changefreq: 'monthly', priority: '0.7' },
    { path: '/guide/ai', changefreq: 'monthly', priority: '0.7' },
    { path: '/guide/help', changefreq: 'weekly', priority: '0.8' },
    { path: '/guide/terms', changefreq: 'yearly', priority: '0.5' },
    { path: '/guide/contact', changefreq: 'yearly', priority: '0.5' },
    { path: '/guide/support', changefreq: 'monthly', priority: '0.6' },
    { path: '/explore', changefreq: 'daily', priority: '0.8' },
    { path: '/docs', changefreq: 'weekly', priority: '0.6' },
    { path: '/transparency', changefreq: 'weekly', priority: '0.6' },
    { path: '/donate', changefreq: 'monthly', priority: '0.5' },
];

/** Paths that must never appear in the sitemap. */
export const NON_INDEXABLE_PATH_PREFIXES = [
    '/api',
    '/admin',
    '/advertiser',
    '/complaints',
    '/earnings',
    '/messages',
    '/my-competitions',
    '/my-requests',
    '/notifications',
    '/profile',
    '/reports',
    '/settings',
    '/verify',
    '/welcome',
];

/** Absolute URL of a platform path. */
export function publicUrl(path: string): string {
    return `${SITE_ORIGIN}${path.startsWith('/') ? path : `/${path}`}`;
}

/** Escapes the five XML entities. */
function xmlEscape(value: string): string {
    return value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

/**
 * The sitemap body. The language alternates mirror the hreflang set of
 * the pages themselves (ar/en + x-default).
 */
export function buildSitemapXml(): string {
    const entries = PUBLIC_INDEXABLE_PAGES.map((page) => {
        const loc = xmlEscape(publicUrl(page.path));
        const alternates = [
            `<xhtml:link rel="alternate" hreflang="ar" href="${xmlEscape(`${SITE_ORIGIN}${page.path}?lang=ar`)}"/>`,
            `<xhtml:link rel="alternate" hreflang="en" href="${xmlEscape(`${SITE_ORIGIN}${page.path}?lang=en`)}"/>`,
            `<xhtml:link rel="alternate" hreflang="x-default" href="${xmlEscape(`${SITE_ORIGIN}${page.path}`)}"/>`,
        ].join('\n    ');
        return `  <url>\n    <loc>${loc}</loc>\n    ${alternates}\n    <changefreq>${page.changefreq}</changefreq>\n    <priority>${page.priority}</priority>\n  </url>`;
    }).join('\n');

    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${entries}\n</urlset>\n`;
}

/** The robots.txt body. */
export function buildRobotsTxt(): string {
    const disallow = NON_INDEXABLE_PATH_PREFIXES.map((p) => `Disallow: ${p}`).join('\n');
    return `# Dueli — https://dueli.maelshpro.com\nUser-agent: *\nAllow: /\n${disallow}\n\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`;
}
