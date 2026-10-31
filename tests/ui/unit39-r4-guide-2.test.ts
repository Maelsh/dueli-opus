/**
 * UNIT39 / R4-GUIDE-2 — content for the guide sections:
 * the human message, the AI company/model inventory, the two-layer
 * technology page, the 80/20 support model, terms and contact.
 *
 * Contract (plan 13 §5 "R4-GUIDE-2" + plan 14 row 39 + owner decisions
 * 2026-10-29 + plan 15 §7):
 *
 * 1. /guide/message carries the founder's four pillars and the future
 *    bridge to independent AI agents — in Arabic and English — and never
 *    makes a forbidden promise (no war prevention, no absolute justice,
 *    no registered non-profit entity, no present-day AI consciousness).
 * 2. /guide/ai lists the six owner-attested company/model entries with
 *    role, phase/use and the owner-attestation source. Unverified names
 *    (Meta/Muse, Moonshot/Kimi K) and every version stay explicitly
 *    "pending official confirmation"; no invented version is printed.
 * 3. /guide/technology has a plain-language layer and an engineering
 *    layer, names only technologies that exist in the repository, and
 *    never mentions the retired Jitsi stack.
 * 4. /guide/support states the 80/20 revenue split, separates platform
 *    support (/donate + /transparency) from competitor earnings, offers
 *    non-financial ways to help, and adds no payment route or provider.
 * 5. /guide/terms keeps the existing policy links and states the rights
 *    of both sides (competitors may republish and earn; viewers need
 *    permission), with versioned text handled by the H9 document store.
 *    /guide/contact keeps only the verified in-product channels and adds
 *    no unverified email/phone/social channel.
 * 6. Every guide section has an AR/EN description; canonical/hreflang
 *    remain UNIT38's contract; JSON-LD gains no unverified entity claim.
 * 7. All new copy lives in i18n (ar/en parity), the pages stay RTL/LTR,
 *    dark-mode and aria-labelled, and the rendered output is escaped.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import app from '../../src/main';
import { FakeD1 } from '../helpers/fake-d1';
import { ar } from '../../src/i18n/ar';
import { en } from '../../src/i18n/en';

const SRC = (p: string) => readFileSync(resolve(__dirname, '../../src', p), 'utf-8');
const GUIDE_PAGE = SRC('modules/pages/guide-page.ts');
const SEO = SRC('shared/templates/seo.ts');
const INVENTORY = JSON.parse(
    readFileSync(resolve(__dirname, '../../dev-tools/route-inventory.json'), 'utf-8'),
) as { routes: Array<{ method: string; path: string }>; pageRoutes: Array<{ method: string; path: string }> };

type Env = Parameters<typeof app.request>[2];
const env = (): Env => ({ DB: new FakeD1() }) as unknown as Env;

const SECTIONS = ['overview', 'message', 'technology', 'ai', 'help', 'terms', 'contact', 'support'] as const;
const PACKS = [
    ['en', en],
    ['ar', ar],
] as const;

const get = async (path: string) => {
    const res = await app.request(path, {}, env());
    return { status: res.status, headers: res.headers, html: await res.text() };
};

/** Extracts a <meta name|property="key" content="..."> value. */
const meta = (html: string, key: string): string | undefined => {
    const re = new RegExp(`<meta\\s+(?:name|property)="${key}"\\s+content="([^"]*)"`);
    return re.exec(html)?.[1];
};

/** Extracts the href of a <link rel="..."> tag. */
const link = (html: string, rel: string): string | undefined => {
    const re = new RegExp(`<link\\s+rel="${rel}"\\s+href="([^"]*)"`);
    return re.exec(html)?.[1];
};

/** Recurses through objects AND arrays so ar/en shapes must match exactly. */
function shape(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(shape);
    if (value !== null && typeof value === 'object') {
        return Object.keys(value as Record<string, unknown>)
            .sort()
            .reduce<Record<string, unknown>>((out, key) => {
                out[key] = shape((value as Record<string, unknown>)[key]);
                return out;
            }, {});
    }
    return typeof value;
}

const guideContent = (pack: typeof ar | typeof en) => (pack as Record<string, any>).guide;

describe('UNIT39 / R4-GUIDE-2 — the human message', () => {
    it('1. AR and EN carry the four pillars and the future AI bridge', async () => {
        for (const [lang, pack] of PACKS) {
            const message = guideContent(pack).message_content;
            expect(message, `${lang}.guide.message_content`).toBeTruthy();
            expect(message.pillars, `${lang} pillars`).toHaveLength(4);

            const { status, html } = await get(`/guide/message?lang=${lang}`);
            expect(status, `/guide/message ${lang}`).toBe(200);

            for (const pillar of message.pillars) {
                expect(html, `${lang} pillar title`).toContain(pillar.title);
                expect(html, `${lang} pillar body`).toContain(pillar.body);
            }
            expect(html, `${lang} AI bridge title`).toContain(message.ai_bridge_title);
            expect(html, `${lang} AI bridge body`).toContain(message.ai_bridge_body);
        }
    });

    it('2. the forbidden claims are absent from the packs and the rendered message', async () => {
        const forbidden = [
            // No promise to stop wars.
            'prevent wars',
            'end wars',
            'منع الحروب',
            'نمنع الحروب',
            // No promise of absolute justice.
            'absolute justice',
            'perfect justice',
            'العدالة المطلقة',
            'ضمان العدالة',
            // No registered non-profit entity claim.
            'registered nonprofit',
            'registered non-profit',
            'nonprofit organization',
            'غير ربحية مسجلة',
            'كيان قانوني غير ربحي مسجل',
            // No claim of present-day AI consciousness.
            'AI is conscious',
            'conscious AI',
            'AI has consciousness',
            'الذكاء الاصطناعي واعٍ',
            'وعي حالي',
        ];

        for (const [lang, pack] of PACKS) {
            const serialized = JSON.stringify(guideContent(pack)).toLowerCase();
            for (const phrase of forbidden) {
                expect(serialized, `${lang} pack must not contain "${phrase}"`).not.toContain(phrase.toLowerCase());
            }
            const { html } = await get(`/guide/message?lang=${lang}`);
            const rendered = html.toLowerCase();
            for (const phrase of forbidden) {
                expect(rendered, `${lang} page must not contain "${phrase}"`).not.toContain(phrase.toLowerCase());
            }
        }

        // The allowed sustainability wording is present and explicit about
        // the founder's intent (not a registration status).
        expect(guideContent(ar).message_content.pillars[3].body).toContain('غير هادفة للربح بحسب قصد المؤسس');
        expect(guideContent(en).message_content.pillars[3].body).toContain(
            'not-for-profit by the founder’s intent',
        );
    });

    it('3. the Maelsh Pro block keeps its single source and is not duplicated', async () => {
        expect(GUIDE_PAGE).toContain('renderAboutMaelsh(lang)');
        expect(SRC('modules/pages/about-page.ts')).toContain('export function renderAboutMaelsh');
        const message = await get('/guide/message?lang=en');
        expect(message.html.split('bg-gradient-to-br from-gray-900 to-black').length - 1).toBe(1);
        const overview = await get('/guide/overview?lang=en');
        expect(overview.html.split('bg-gradient-to-br from-gray-900 to-black').length - 1).toBe(1);
    });
});

describe('UNIT39 / R4-GUIDE-2 — AI companies and models', () => {
    it('4. the six owner-attested entries render with role, phase and source', async () => {
        for (const [lang, pack] of PACKS) {
            const ai = guideContent(pack).ai_content;
            expect(ai.entries, `${lang} entries`).toHaveLength(6);

            const { status, html } = await get(`/guide/ai?lang=${lang}`);
            expect(status, `/guide/ai ${lang}`).toBe(200);
            expect(html).toContain(ai.source_label);
            expect(html).toContain(ai.thanks);

            for (const entry of ai.entries) {
                for (const field of ['company', 'model', 'role', 'phase', 'source']) {
                    expect(entry[field], `${lang} ${entry.company} ${field}`).toBeTruthy();
                    expect(html, `${lang} rendered ${entry.company} ${field}`).toContain(entry[field]);
                }
            }

            // The six companies from the owner attestation.
            for (const company of ['OpenAI', 'Anthropic', 'Alphabet', 'Meta', 'Z.ai', 'Moonshot']) {
                expect(html, `${lang} company ${company}`).toContain(company);
            }
        }
    });

    it('5. unverified names and every version are explicitly marked as pending', async () => {
        for (const [lang, pack] of PACKS) {
            const ai = guideContent(pack).ai_content;
            const pending = ai.entries.filter((e: { name_pending?: boolean }) => e.name_pending);
            expect(pending.map((e: { model: string }) => e.model).sort()).toEqual(['Kimi K', 'Muse']);

            const { html } = await get(`/guide/ai?lang=${lang}`);
            // Each row carries the version caveat; the two owner names carry
            // the official-confirmation caveat as well.
            expect(html.split(ai.version_label).length - 1, `${lang} version caveat per row`).toBe(6);
            expect(html.split(ai.pending_name_label).length - 1, `${lang} pending name tag`).toBe(2);
            expect(html).toContain(ai.updates_body);
        }
    });

    it('6. no invented model version or sponsorship claim is printed', async () => {
        const versionTokens = [
            'GPT-4', 'GPT-5', 'GPT 4', 'GPT 5',
            'Claude 3', 'Claude 4', 'Claude 3.5',
            'Gemini 1', 'Gemini 2', 'GLM-4', 'Kimi K2',
            'Muse 1', 'Llama',
        ];
        for (const [lang, pack] of PACKS) {
            const serialized = JSON.stringify(guideContent(pack).ai_content);
            for (const token of versionTokens) {
                expect(serialized, `${lang} invents ${token}`).not.toContain(token);
            }
            const { html } = await get(`/guide/ai?lang=${lang}`);
            expect(html).not.toContain('sponsored by');
            expect(html).not.toContain('رعاية رسمية');
        }
    });

    it('7. updates reuse the existing H9 managed-document surface (no second CMS)', async () => {
        const { html } = await get('/guide/ai?lang=en');
        expect(html).toContain('href="/docs?lang=en"');
        expect(GUIDE_PAGE).toContain('H9');
        // The guide page is a view: it may LINK to /docs, never query the
        // managed-documents store or render its SQL directly.
        expect(GUIDE_PAGE).not.toMatch(/managed_documents|SELECT\s|FROM\s+managed/i);
    });
});

describe('UNIT39 / R4-GUIDE-2 — technology, only what the code uses', () => {
    it('8. both layers are present and rendered in AR and EN', async () => {
        for (const [lang, pack] of PACKS) {
            const tech = guideContent(pack).technology_content;
            expect(tech.simple_paragraphs.length, `${lang} simple layer`).toBeGreaterThanOrEqual(2);
            expect(tech.engineering_paragraphs.length, `${lang} engineering layer`).toBeGreaterThanOrEqual(3);

            const { status, html } = await get(`/guide/technology?lang=${lang}`);
            expect(status).toBe(200);
            expect(html).toContain(tech.simple_title);
            expect(html).toContain(tech.engineering_title);
            for (const paragraph of [...tech.simple_paragraphs, ...tech.engineering_paragraphs]) {
                expect(html, `${lang} technology paragraph`).toContain(paragraph);
            }
        }
    });

    it('9. the real stack is named and the retired stack is never mentioned', async () => {
        const { html } = await get('/guide/technology?lang=en');
        for (const name of ['Cloudflare', 'Hono', 'D1', 'WebRTC', 'TURN', 'STUN', 'MediaRecorder', '5-second', 'VOD']) {
            expect(html, `technology ${name}`).toContain(name);
        }
        expect(html).not.toContain('Jitsi');
        expect(JSON.stringify(guideContent(en).technology_content)).not.toContain('Jitsi');
        expect(JSON.stringify(guideContent(ar).technology_content)).not.toContain('Jitsi');
    });

    it('10. the engineering copy matches the repository facts (no invented service)', () => {
        expect(SRC('shared/templates/seo.ts')).toContain('SITE_ORIGIN');
        expect(readFileSync(resolve(__dirname, '../../wrangler.jsonc'), 'utf-8')).toContain('d1_databases');
        expect(readFileSync(resolve(__dirname, '../../package.json'), 'utf-8')).toContain('"hono"');
        // The chunk path named in the copy exists in the code.
        expect(SRC('modules/api/chunks/routes.ts')).toContain("'/register'");
    });
});

describe('UNIT39 / R4-GUIDE-2 — support, donors and the 80/20 split', () => {
    it('11. the 80/20 model and the separation of money are rendered', async () => {
        for (const [lang, pack] of PACKS) {
            const support = guideContent(pack).support_content;
            const { status, html } = await get(`/guide/support?lang=${lang}`);
            expect(status).toBe(200);
            expect(html).toContain('80%');
            expect(html).toContain('20%');
            expect(html).toContain(support.split_80_title);
            expect(html).toContain(support.split_20_title);
            expect(html).toContain(support.separation_title);
            expect(html).toContain(support.separation_body);
            expect(html).toContain(support.nonfinancial_title);
            for (const item of support.nonfinancial) {
                expect(html, `${lang} non-financial option`).toContain(item);
            }
        }
    });

    it('12. platform support links to the existing surfaces, and no payment route is added', async () => {
        const { html } = await get('/guide/support?lang=en');
        expect(html).toContain('href="/donate?lang=en"');
        expect(html).toContain('href="/transparency?lang=en"');
        expect(html).toContain('href="/docs?lang=en"');

        // No new payment provider or API route is introduced by this unit.
        for (const forbidden of ['/api/payments', '/api/donations', 'stripe.com', 'paypal.com', 'checkout.']) {
            expect(GUIDE_PAGE, `guide page must not add ${forbidden}`).not.toContain(forbidden);
        }
        const guideRoutes = [...INVENTORY.routes, ...INVENTORY.pageRoutes].filter((r) =>
            r.path.startsWith('/guide') || r.path.startsWith('/api/guide'),
        );
        for (const route of guideRoutes) {
            expect(route.path).not.toMatch(/pay|donat|checkout/i);
        }
    });
});

describe('UNIT39 / R4-GUIDE-2 — terms and contact', () => {
    it('13. terms keep the policy links and state the rights of both sides', async () => {
        for (const [lang, pack] of PACKS) {
            const terms = guideContent(pack).terms_content;
            const { status, html } = await get(`/guide/terms?lang=${lang}`);
            expect(status).toBe(200);
            expect(html).toContain(terms.rights_competitors);
            expect(html).toContain(terms.rights_viewers);
            expect(html).toContain(terms.version_body);

            for (const href of [
                '/privacy-policy',
                '/data-deletion',
                `/reports?lang=${lang}`,
                `/complaints?lang=${lang}`,
                `/transparency?lang=${lang}`,
                `/docs?lang=${lang}`,
            ]) {
                expect(html, `${lang} terms link ${href}`).toContain(`href="${href}"`);
            }
        }
    });

    it('14. contact lists only the verified in-product channels, with no external channel', async () => {
        for (const [lang, pack] of PACKS) {
            const contact = guideContent(pack).contact_content;
            const { status, html } = await get(`/guide/contact?lang=${lang}`);
            expect(status).toBe(200);
            for (const href of [
                `/messages?tab=admin&lang=${lang}`,
                `/reports?lang=${lang}`,
                `/complaints?lang=${lang}`,
            ]) {
                expect(html, `${lang} contact link ${href}`).toContain(`href="${href}"`);
            }
            expect(html).toContain(contact.no_external);
            for (const external of ['mailto:', 'tel:', 'twitter.com', 'x.com/', 'facebook.com', 'instagram.com', 'linkedin.com', 'wa.me', 't.me/']) {
                expect(html.toLowerCase(), `${lang} external channel ${external}`).not.toContain(external);
            }
        }
    });
});

describe('UNIT39 / R4-GUIDE-2 — meta, SEO contract and i18n parity', () => {
    it('15. every guide section has an AR/EN description and a rendered meta description', async () => {
        for (const [lang, pack] of PACKS) {
            for (const section of SECTIONS) {
                const desc = guideContent(pack).sections[section]?.desc;
                expect(desc, `${lang}.${section}.desc`).toBeTruthy();
                const { html } = await get(`/guide/${section}?lang=${lang}`);
                expect(meta(html, 'description'), `${lang} rendered ${section} description`).toBeTruthy();
                expect(html, `${lang} rendered ${section} description text`).toContain(desc);
            }
        }

        // The owner-approved identity wording is the default description.
        expect((ar as Record<string, any>).seo.default_description).toContain('أول منصة منافسات عالمية');
        expect((en as Record<string, any>).seo.default_description).toContain(
            'first global competition platform',
        );
    });

    it('16. canonical, hreflang and JSON-LD keep UNIT38’s contract', async () => {
        for (const section of SECTIONS) {
            const { html } = await get(`/guide/${section}?lang=en`);
            expect(link(html, 'canonical')).toBe(`https://dueli.maelshpro.com/guide/${section}`);
            const alternates = [...html.matchAll(/<link\s+rel="alternate"\s+hreflang="([^"]+)"\s+href="([^"]*)"/g)];
            expect(alternates.map((m) => m[1]).sort()).toEqual(['ar', 'en', 'x-default']);
        }

        const { html } = await get('/guide/message?lang=en');
        const raw = /<script\s+type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/.exec(html)?.[1];
        expect(raw).toBeTruthy();
        const parsed = JSON.parse(raw as string);
        const graph = parsed['@graph'] as Array<Record<string, unknown>>;
        expect(graph.map((n) => n.name)).toEqual(expect.arrayContaining(['Dueli', 'Maelsh Pro']));
        for (const node of graph) {
            for (const key of ['foundingDate', 'address', 'legalName', 'nonprofitStatus', 'taxID', 'vatID']) {
                expect(node, `JSON-LD must not claim ${key}`).not.toHaveProperty(key);
            }
        }
        // The builder itself is not modified into an entity claim.
        for (const claim of ['foundingDate', 'address', 'nonprofit', 'NonProfit']) {
            expect(SEO, `seo.ts claim ${claim}`).not.toContain(`'${claim}'`);
        }
    });

    it('17. ar and en have exactly the same guide/seo shape, including arrays', () => {
        expect(shape((en as Record<string, any>).seo)).toEqual(shape((ar as Record<string, any>).seo));
        expect(shape(guideContent(en))).toEqual(shape(guideContent(ar)));
    });

    it('18. the new sections keep RTL/LTR, dark classes and accessible structure', async () => {
        for (const [lang] of PACKS) {
            for (const section of ['message', 'technology', 'ai', 'terms', 'contact', 'support'] as const) {
                const { html } = await get(`/guide/${section}?lang=${lang}`);
                expect(html, `${lang} ${section} dir`).toContain(lang === 'ar' ? 'dir="rtl"' : 'dir="ltr"');
                expect(html, `${lang} ${section} dark mode`).toContain('dark:');
                expect(html, `${lang} ${section} heading`).toContain('<h1');
                expect(html, `${lang} ${section} nav landmark`).toContain('<nav aria-label=');
            }
        }

        const ai = await get('/guide/ai?lang=en');
        expect(ai.html).toContain('<caption');
        expect(ai.html).toContain('scope="col"');
    });

    it('19. all new copy comes from i18n and the guide page stays a view', () => {
        for (const key of [
            'message_content',
            'ai_content',
            'technology_content',
            'terms_content',
            'contact_content',
            'support_content',
        ]) {
            expect(guideContent(en)[key], `en.guide.${key}`).toBeTruthy();
            expect(guideContent(ar)[key], `ar.guide.${key}`).toBeTruthy();
            expect(GUIDE_PAGE, `guide-page reads ${key}`).toContain(key);
        }
        expect(GUIDE_PAGE).not.toMatch(/\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b/);
    });
});
