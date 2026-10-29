/**
 * UNIT38 / R4-GUIDE-1 — the /robots.txt and /sitemap.xml public routes.
 *
 * Both are PUBLIC (no session, no auth) and are served from the SAME
 * registry that the head canonical/hreflang set uses
 * (src/shared/seo-pages.ts), so a URL can never appear in the sitemap
 * without a real route behind it.
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { buildRobotsTxt, buildSitemapXml } from '../../../shared/seo-pages';

const seoRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// PUBLIC: robots.txt — crawlers need it before anything else.
seoRoutes.get('/robots.txt', (c) =>
    c.body(buildRobotsTxt(), 200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
    })
);

// PUBLIC: sitemap.xml — only the public, indexable pages.
seoRoutes.get('/sitemap.xml', (c) =>
    c.body(buildSitemapXml(), 200, {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600',
    })
);

export default seoRoutes;
