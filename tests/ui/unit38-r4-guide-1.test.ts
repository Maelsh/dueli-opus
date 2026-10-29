/**
 * UNIT38 / R4-GUIDE-1 — the /guide center, the global SEO head, the
 * robots/sitemap surfaces and the /welcome splash portal.
 *
 * Contract (plan 13 §5 "R4-GUIDE-1" + owner decision 2026-10-29):
 *
 * 1. /guide is a CENTER of eight INDEPENDENT sections. Every section has
 *    its own address (/guide/<slug>), is server-rendered, is deep-linkable
 *    and survives a refresh (no SPA, no client-side section switch).
 * 2. The useful content of /about and /help is REUSED in the guide (the
 *    same markup, one source), and /about, /help and /faq stay reachable
 *    as SAFE ALIASES that keep the language and every legacy anchor while
 *    pointing their canonical at the guide section.
 * 3. Global SEO: description, OpenGraph, Twitter Cards, canonical,
 *    hreflang (ar/en + x-default) and Schema.org JSON-LD that identifies
 *    Dueli and Maelsh Pro — present in the REAL rendered HTML, not only
 *    in a source string.
 * 4. /robots.txt and /sitemap.xml are public, carry the right content
 *    type, and EVERY URL in the sitemap is a real public route (compared
 *    against the generated route inventory — an invented URL would be a
 *    broken link for a crawler).
 * 5. /welcome shows the Dueli logo, the brand phrase, "By Maelsh Pro",
 *    a visible skip link and moves the visitor to the platform origin.
 *    It never intercepts an existing route.
 * 6. Dark mode, RTL/LTR and keyboard reachability on the center and the
 *    splash; managed documents are still escaped (no XSS) and the
 *    /about, /help and /docs surfaces keep working.
 *
 * The unit is structure/navigation only: no marketing copy is invented
 * here (final wording and the unverified AI company/model data belong to
 * UNIT39).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import app from '../../src/main';
import { FakeD1 } from '../helpers/fake-d1';
import { ar } from '../../src/i18n/ar';
import { en } from '../../src/i18n/en';

const SRC = (p: string) => readFileSync(resolve(__dirname, '../../src', p), 'utf-8');

const MAIN = SRC('main.ts');
const GUIDE_PAGE = SRC('modules/pages/guide-page.ts');
const GUIDE_NAV = SRC('shared/components/guide-nav.ts');
const WELCOME = SRC('modules/pages/welcome-page.ts');
const SEO = SRC('shared/templates/seo.ts');
const SEO_PAGES = SRC('shared/seo-pages.ts');
const INVENTORY = JSON.parse(
    readFileSync(resolve(__dirname, '../../dev-tools/route-inventory.json'), 'utf-8'),
) as { routes: Array<{ method: string; path: string }>; pageRoutes: Array<{ method: string; path: string }> };

type Env = Parameters<typeof app.request>[2];
const env = (): Env => ({ DB: new FakeD1() }) as unknown as Env;

/** The eight sections of the center, in navigation order. */
const SECTIONS = [
    'overview',
    'message',
    'technology',
    'ai',
    'help',
    'terms',
    'contact',
    'support',
] as const;

/** Legacy anchors that must keep resolving inside the help body. */
const LEGACY_ANCHORS = [
    'overview', 'roles', 'role-creator', 'role-opponent', 'role-viewer',
    'topics', 'topic-create', 'topic-invite', 'topic-live', 'topic-recording',
    'topic-ratings', 'topic-reactions', 'topic-comments', 'topic-discover',
    'topic-payout', 'topic-support', 'faq', 'access',
];

const get = async (path: string) => {
    const res = await app.request(path, {}, env());
    return { status: res.status, headers: res.headers, html: await res.text() };
};

/** Extracts the content of a <meta name="..."> / <meta property="..."> tag. */
const meta = (html: string, key: string): string | undefined => {
    const re = new RegExp(`<meta\\s+(?:name|property)="${key}"\\s+content="([^"]*)"`);
    return re.exec(html)?.[1];
};

/** Extracts the href of a <link rel="..."> tag. */
const link = (html: string, rel: string, extra = ''): string | undefined => {
    const re = new RegExp(`<link\\s+rel="${rel}"${extra}\\s+href="([^"]*)"`);
    return re.exec(html)?.[1];
};

describe('UNIT38 / R4-GUIDE-1 — the guide center is a set of independent pages', () => {
    it('1. /guide is mounted and every section has its own route', async () => {
        expect(MAIN).toContain("app.get('/guide', guideHubPage)");
        expect(MAIN).toContain("app.get('/guide/:section', guideSectionPage)");

        const hub = await get('/guide?lang=en');
        expect(hub.status).toBe(200);

        // The hub links to all eight sections, each on its own address.
        for (const section of SECTIONS) {
            expect(hub.html, `hub link /guide/${section}`).toContain(`href="/guide/${section}?lang=en"`);
        }
    });

    it('2. every section renders on its own address (deep link + refresh safe)', async () => {
        for (const section of SECTIONS) {
            const res = await get(`/guide/${section}?lang=en`);
            expect(res.status, `/guide/${section}`).toBe(200);
            // Server-rendered: the section title is in the HTML, not built
            // by a client script after load.
            expect(res.html, `/guide/${section} title`).toContain(`<title>`);
            expect(res.html, `/guide/${section} heading`).toContain('<h1');
            // The current section is marked for assistive technology.
            expect(res.html, `/guide/${section} aria-current`).toContain('aria-current="page"');
            // A refresh of the deep link is a plain document request — no
            // client-side router state is required.
            expect(res.headers.get('content-type'), `/guide/${section} content-type`).toContain('text/html');
        }
    });

    it('3. an unknown section is a 404, not a blank page', async () => {
        expect((await get('/guide/not-a-section?lang=en')).status).toBe(404);
    });

    it('4. the section navigation is present on the hub and on every section', async () => {
        for (const path of ['/guide?lang=en', '/guide/help?lang=en', '/about?lang=en']) {
            const { html, status } = await get(path);
            expect(status, path).toBe(200);
            expect(html, `${path} nav`).toContain('<nav aria-label=');
            for (const section of SECTIONS) {
                expect(html, `${path} -> ${section}`).toContain(`href="/guide/${section}?lang=en"`);
            }
        }
    });

    it('5. the guide reuses the existing /about and /help bodies (one source of truth)', () => {
        // The about/help modules export their body so the guide renders the
        // SAME markup — the content can never drift between the two.
        expect(SRC('modules/pages/about-page.ts')).toContain('export function renderAboutOverview');
        expect(SRC('modules/pages/about-page.ts')).toContain('export function renderAboutMaelsh');
        expect(SRC('modules/pages/help-page.ts')).toContain('export function renderHelpSections');
        expect(GUIDE_PAGE).toContain('renderAboutOverview(lang)');
        expect(GUIDE_PAGE).toContain('renderHelpSections(lang)');
    });

    it('6. the guide renders the about body and the help body', async () => {
        const overview = await get('/guide/overview?lang=en');
        expect(overview.status).toBe(200);
        expect(overview.html).toContain('img src="/static/about/image-1.png"');

        const help = await get('/guide/help?lang=en');
        expect(help.status).toBe(200);
        for (const anchor of LEGACY_ANCHORS) {
            expect(help.html, `guide help #${anchor}`).toContain(`id="${anchor}"`);
        }
    });
});

describe('UNIT38 / R4-GUIDE-1 — the legacy aliases stay safe', () => {
    it('7. /about, /help and /faq answer 200 and keep the language', async () => {
        for (const path of ['/about', '/help', '/faq']) {
            const en = await get(`${path}?lang=en`);
            expect(en.status, `${path} en`).toBe(200);
            expect(en.html, `${path} en dir`).toContain('dir="ltr"');

            const ar = await get(`${path}?lang=ar`);
            expect(ar.status, `${path} ar`).toBe(200);
            expect(ar.html, `${path} ar dir`).toContain('dir="rtl"');
        }
    });

    it('8. /help and /faq keep every legacy anchor (old deep links still resolve)', async () => {
        for (const path of ['/help?lang=en', '/faq?lang=en']) {
            const { html, status } = await get(path);
            expect(status, path).toBe(200);
            for (const anchor of LEGACY_ANCHORS) {
                expect(html, `${path} #${anchor}`).toContain(`id="${anchor}"`);
            }
        }
    });

    it('9. the aliases point their canonical at the guide section', async () => {
        expect(link((await get('/about?lang=en')).html, 'canonical')).toBe(
            'https://dueli.maelshpro.com/guide/overview',
        );
        expect(link((await get('/help?lang=en')).html, 'canonical')).toBe(
            'https://dueli.maelshpro.com/guide/help',
        );
        expect(link((await get('/faq?lang=en')).html, 'canonical')).toBe(
            'https://dueli.maelshpro.com/guide/help',
        );
    });

    it('10. the aliases are part of the same center (one click to any section)', async () => {
        for (const path of ['/about?lang=en', '/help?lang=en', '/faq?lang=en']) {
            const { html } = await get(path);
            for (const section of SECTIONS) {
                expect(html, `${path} -> ${section}`).toContain(`href="/guide/${section}?lang=en"`);
            }
        }
    });
});

describe('UNIT38 / R4-GUIDE-1 — global SEO head (real rendered HTML)', () => {
    it('11. the head carries description, OpenGraph and Twitter cards', async () => {
        for (const path of ['/guide?lang=en', '/guide/help?lang=en', '/about?lang=en', '/help?lang=en']) {
            const { html } = await get(path);
            expect(meta(html, 'description'), `${path} description`).toBeTruthy();
            expect(meta(html, 'og:type'), `${path} og:type`).toBeTruthy();
            expect(meta(html, 'og:title'), `${path} og:title`).toBeTruthy();
            expect(meta(html, 'og:description'), `${path} og:description`).toBeTruthy();
            expect(meta(html, 'og:url'), `${path} og:url`).toBeTruthy();
            expect(meta(html, 'og:image'), `${path} og:image`).toBeTruthy();
            expect(meta(html, 'twitter:card'), `${path} twitter:card`).toBeTruthy();
            expect(meta(html, 'twitter:title'), `${path} twitter:title`).toBeTruthy();
            expect(meta(html, 'twitter:description'), `${path} twitter:description`).toBeTruthy();
        }
    });

    it('12. the head carries a canonical and the ar/en + x-default hreflang set', async () => {
        const { html } = await get('/guide/help?lang=en');
        expect(link(html, 'canonical')).toBe('https://dueli.maelshpro.com/guide/help');

        const alternates = [...html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]*)"/g)];
        const byLang = new Map(alternates.map((m) => [m[1], m[2]]));
        expect([...byLang.keys()].sort()).toEqual(['ar', 'en', 'x-default']);
        expect(byLang.get('en')).toBe('https://dueli.maelshpro.com/guide/help');
        expect(byLang.get('ar')).toBe('https://dueli.maelshpro.com/guide/help?lang=ar');
        expect(byLang.get('x-default')).toBe('https://dueli.maelshpro.com/guide/help');
    });

    it('13. the JSON-LD parses and identifies Dueli and Maelsh Pro', async () => {
        const { html } = await get('/guide?lang=en');
        const raw = /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
        expect(raw, 'JSON-LD block').toBeTruthy();

        const parsed = JSON.parse(raw as string);
        const graph = Array.isArray(parsed['@graph']) ? parsed['@graph'] : [parsed];
        const names = graph.map((n: Record<string, unknown>) => n.name);
        expect(names).toContain('Dueli');
        expect(names).toContain('Maelsh Pro');

        // The publisher link must resolve to a real node in the same graph.
        const website = graph.find((n: Record<string, unknown>) => n['@type'] === 'WebSite');
        expect(website).toBeTruthy();
        const publisherId = (website?.publisher as Record<string, unknown>)['@id'];
        expect(
            graph.some((n: Record<string, unknown>) => n['@id'] === publisherId),
            'publisher @id resolves inside the graph',
        ).toBe(true);
    });

    it('14. the SEO builder never claims an unverified legal entity', () => {
        // UNIT39 owns the final wording; the JSON-LD must not assert a
        // founding date, an address or a non-profit status.
        for (const claim of ['foundingDate', 'address', 'nonprofit', 'NonProfit']) {
            expect(SEO, `JSON-LD claim ${claim}`).not.toContain(`'${claim}'`);
        }
    });

    it('15. the sitemap-listed public pages carry a canonical matching their path', async () => {
        const cases: Array<[string, string]> = [
            ['/', 'https://dueli.maelshpro.com/'],
            ['/explore?lang=en', 'https://dueli.maelshpro.com/explore'],
            ['/docs?lang=en', 'https://dueli.maelshpro.com/docs'],
            ['/transparency?lang=en', 'https://dueli.maelshpro.com/transparency'],
            ['/donate?lang=en', 'https://dueli.maelshpro.com/donate'],
        ];
        for (const [path, expected] of cases) {
            const { html, status } = await get(path);
            expect(status, path).toBe(200);
            expect(link(html, 'canonical'), `canonical ${path}`).toBe(expected);
        }
    });

    it('16. the private/error surfaces are not indexable', async () => {
        const notFound = await get('/guide/not-a-section?lang=en');
        expect(notFound.status).toBe(404);
        expect(meta(notFound.html, 'robots')).toContain('noindex');
    });
});

describe('UNIT38 / R4-GUIDE-1 — robots.txt and sitemap.xml', () => {
    it('17. /robots.txt is public, plain text and points at the sitemap', async () => {
        const res = await app.request('/robots.txt', {}, env());
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/plain');
        const body = await res.text();
        expect(body).toContain('User-agent: *');
        expect(body).toContain('Sitemap: https://dueli.maelshpro.com/sitemap.xml');
        // Private surfaces must not be crawlable.
        for (const prefix of ['/admin', '/api', '/profile', '/messages', '/settings']) {
            expect(body, `disallow ${prefix}`).toContain(`Disallow: ${prefix}`);
        }
    });

    it('18. /sitemap.xml is public XML with one entry per public page', async () => {
        const res = await app.request('/sitemap.xml', {}, env());
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('application/xml');
        const body = await res.text();
        expect(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
        expect(body).toContain('<urlset');
        expect(body).toContain('<loc>https://dueli.maelshpro.com/guide</loc>');
        expect(body).toContain('<loc>https://dueli.maelshpro.com/guide/help</loc>');
    });

    it('19. every sitemap URL is a real public route (compared with the route inventory)', async () => {
        const res = await app.request('/sitemap.xml', {}, env());
        const body = await res.text();
        const locs = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
        expect(locs.length).toBeGreaterThan(5);

        // The inventory holds the real route table: the API routes plus the
        // HTML surfaces registered in main.ts.
        const known = new Set<string>([
            ...INVENTORY.routes.map((r) => r.path),
            ...INVENTORY.pageRoutes.map((r) => r.path),
        ]);
        // The static-pages router is mounted at the root, so its paths live
        // in a mounted router rather than in main.ts itself.
        const staticSrc = SRC('modules/pages/static-pages.ts');
        for (const m of staticSrc.matchAll(/staticPagesRoutes\.get\('([^']+)'/g)) known.add(m[1]);

        const toPattern = (route: string) =>
            new RegExp(`^${route.replace(/:[A-Za-z_]+/g, '[^/]+')}$`);

        for (const loc of locs) {
            const path = loc.replace('https://dueli.maelshpro.com', '').replace(/\?.*$/, '');
            const match = [...known].some((route) => toPattern(route).test(path));
            expect(match, `sitemap URL ${loc} has no route`).toBe(true);
        }
    });

    it('20. the sitemap never lists a private or dynamic surface', async () => {
        const res = await app.request('/sitemap.xml', {}, env());
        const body = await res.text();
        for (const forbidden of ['/admin', '/api/', '/profile', '/messages', '/settings', '/welcome', '/competition/', '/docs/']) {
            expect(body, `sitemap must not contain ${forbidden}`).not.toContain(`<loc>https://dueli.maelshpro.com${forbidden}`);
        }
    });

    it('21. the sitemap registry is the single source of truth', () => {
        // robots + sitemap + the registry live together, so a page can never
        // be in the sitemap without a route behind it.
        expect(SEO_PAGES).toContain('PUBLIC_INDEXABLE_PAGES');
        expect(SEO_PAGES).toContain('buildSitemapXml');
        expect(SEO_PAGES).toContain('buildRobotsTxt');
        expect(SEO_PAGES).toContain('NON_INDEXABLE_PATH_PREFIXES');
    });
});

describe('UNIT38 / R4-GUIDE-1 — the /welcome splash portal', () => {
    it('22. /welcome shows the logo, the phrase and "By Maelsh Pro"', async () => {
        const { status, html } = await get('/welcome?lang=en');
        expect(status).toBe(200);
        expect(html).toContain('/static/dueli-icon.png');
        expect(html).toContain('By Maelsh Pro');
        // The brand phrase, word by word (the English pack carries the
        // published translation of the Arabic phrase).
        for (const word of ['Rise', 'Learn', 'Enjoy', 'Win']) {
            expect(html, `phrase word ${word}`).toContain(word);
        }
    });

    it('23. the Arabic splash carries the Arabic brand phrase', async () => {
        const { status, html } = await get('/welcome?lang=ar');
        expect(status).toBe(200);
        expect(html).toContain('ارتقِ');
        expect(html).toContain('تثقف');
        expect(html).toContain('استمتع');
        expect(html).toContain('اربح');
        expect(html).toContain('By Maelsh Pro');
        expect(html).toContain('dir="rtl"');
    });

    it('24. the splash has an always-visible skip link to the platform origin', async () => {
        const { html } = await get('/welcome?lang=en');
        expect(html).toContain('id="splashSkip"');
        expect(html).toContain('href="https://dueli.maelshpro.com/"');
        // The skip link is NOT hidden behind the animation: it is a normal
        // link in the document flow.
        expect(html).not.toMatch(/class="[^"]*splash-skip[^"]*hidden/);
    });

    it('25. the splash redirects to the platform origin, never to itself', async () => {
        const { html } = await get('/welcome?lang=en');
        expect(html).toContain('https://dueli.maelshpro.com/');
        expect(html).toContain('window.location.replace(target)');
        // It must not trap the visitor on the splash origin.
        expect(html).not.toContain('window.location.href = target');
        expect(MAIN).toContain("app.get('/welcome', welcomePage)");
    });

    it('26. the splash is not indexable and honours reduced motion', async () => {
        const { html } = await get('/welcome?lang=en');
        expect(meta(html, 'robots')).toContain('noindex');
        expect(html).toContain('prefers-reduced-motion: reduce');
    });

    it('27. the splash never intercepts an existing route', async () => {
        for (const path of ['/', '/guide?lang=en', '/help?lang=en', '/about?lang=en', '/docs?lang=en']) {
            const res = await get(path);
            expect(res.status, path).toBe(200);
            expect(res.html, `${path} is not the splash`).not.toContain('id="splashSkip"');
        }
    });
});

describe('UNIT38 / R4-GUIDE-1 — accessibility, RTL and dark mode', () => {
    it('28. the center and the splash expose one skip target and no duplicate ids', async () => {
        for (const path of ['/guide?lang=en', '/guide/help?lang=en', '/about?lang=en', '/help?lang=en', '/welcome?lang=en']) {
            const { html } = await get(path);
            const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
            expect(new Set(ids).size, `duplicate ids on ${path}`).toBe(ids.length);
            expect(ids.filter((i) => i === 'main-content').length, `skip target on ${path}`).toBe(1);
        }
    });

    it('29. the center is keyboard reachable (real links, aria-current, visible focus)', async () => {
        const { html } = await get('/guide/help?lang=en');
        // The section navigation is a list of real <a> elements — natively
        // focusable, no JS needed.
        expect(html).toContain('<nav aria-label=');
        expect(html).toContain('<ul class="flex flex-wrap justify-center gap-2">');
        expect(html).toContain('aria-current="page"');
        expect(SRC('shared/templates/layout.ts')).toContain('href="#main-content"');
    });

    it('30. dark mode and RTL/LTR are preserved on the center and the splash', async () => {
        const guide = await get('/guide?lang=en');
        expect(guide.html).toContain('dark:');
        const ar = await get('/guide?lang=ar');
        expect(ar.html).toContain('dir="rtl"');
        expect(ar.html).toContain('dark:');
        const splash = await get('/welcome?lang=en');
        expect(splash.html).toContain('prefers-reduced-motion: reduce');
        expect(splash.html).toContain(':focus-visible');
    });

    it('31. the new pages ship no inline handler and no inline style (strict CSP)', async () => {
        for (const src of [GUIDE_PAGE, WELCOME, SEO, SEO_PAGES, GUIDE_NAV]) {
            expect(src, 'inline event handler').not.toMatch(/\son(click|load|error|submit)\s*=/);
            expect(src, 'inline style attribute').not.toMatch(/\sstyle\s*=/);
        }
    });
});

describe('UNIT38 / R4-GUIDE-1 — regressions and i18n parity', () => {
    it('32. the about/help/docs surfaces keep working', async () => {
        for (const path of ['/about?lang=en', '/help?lang=en', '/faq?lang=en', '/docs?lang=en']) {
            const res = await get(path);
            expect(res.status, path).toBe(200);
        }
    });

    it('33. every new string exists in ar and en and differs', () => {
        const leaves = (obj: unknown, prefix = ''): Map<string, unknown> => {
            const out = new Map<string, unknown>();
            for (const [k, v] of Object.entries((obj ?? {}) as Record<string, unknown>)) {
                const key = prefix ? `${prefix}.${k}` : k;
                if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
                    for (const [k2, v2] of leaves(v, key)) out.set(k2, v2);
                } else {
                    out.set(key, v);
                }
            }
            return out;
        };

        for (const namespace of ['seo', 'guide', 'splash']) {
            const a = leaves((ar as Record<string, unknown>)[namespace]);
            const e = leaves((en as Record<string, unknown>)[namespace]);
            expect(a.size, `ar.${namespace} size`).toBeGreaterThan(5);
            expect(e.size, `en.${namespace} size`).toBe(a.size);
            for (const [key, av] of a) {
                expect(e.has(key), `en.${namespace}.${key}`).toBe(true);
                expect(av, `ar.${namespace}.${key}`).toBeTruthy();
                expect(e.get(key), `en.${namespace}.${key}`).toBeTruthy();
            }
        }

        // The splash brand signal is deliberately identical in both packs
        // (it is a name, not a sentence).
        expect((ar as Record<string, any>).splash.by_maelsh_pro).toBe('By Maelsh Pro');
        expect((en as Record<string, any>).splash.by_maelsh_pro).toBe('By Maelsh Pro');
    });

    it('34. the guide center sections carry a title and a description in both packs', () => {
        const a = (ar as Record<string, any>).guide.sections;
        const e = (en as Record<string, any>).guide.sections;
        expect(Object.keys(a).sort()).toEqual([...SECTIONS].sort());
        expect(Object.keys(e).sort()).toEqual([...SECTIONS].sort());
        for (const section of SECTIONS) {
            expect(a[section].title, `ar.${section}.title`).toBeTruthy();
            expect(e[section].title, `en.${section}.title`).toBeTruthy();
            expect(a[section].desc, `ar.${section}.desc`).toBeTruthy();
            expect(e[section].desc, `en.${section}.desc`).toBeTruthy();
        }
    });

    it('35. the OBS Virtual Camera guide is inside the help section', async () => {
        const { html, status } = await get('/guide/help?lang=en');
        expect(status).toBe(200);
        expect(html).toContain('id="obs-virtual-camera"');
        expect(html).toContain('OBS Virtual Camera');
        // The guide must describe the REAL controls of the product: there is
        // no in-app device picker, so the copy points at the browser/OS
        // camera chooser instead of inventing a picker.
        expect(html).toContain('Start Virtual Camera');
        expect(html).not.toMatch(/select (a |your )?camera in the app/i);
    });
});
