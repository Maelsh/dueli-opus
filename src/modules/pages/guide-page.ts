/**
 * UNIT38 / R4-GUIDE-1 — the /guide center (about + help in one place).
 *
 * Contract (plan 13 §5 "R4-GUIDE-1"):
 *   - /guide is the center. Its eight sections are INDEPENDENT pages, each
 *     with its own address and its own server-rendered body, so a deep
 *     link, a bookmark, a refresh and a search-engine crawl all work
 *     without an SPA and without shipping every section's content at once.
 *   - The useful content of /about and /help is REUSED here (never
 *     duplicated by hand): the overview section renders the existing about
 *     body, the help section renders the existing help body.
 *   - /about, /help and /faq stay reachable as SAFE ALIASES of the matching
 *     section: the language and every legacy anchor keep working, and the
 *     canonical points at the guide address.
 *   - Managed documents (H9) are reused as they are: the guide LINKS to
 *     /docs and never injects managed content as code.
 *
 * MVC: this file is the VIEW (templates only). Content lives in
 * src/i18n/{ar,en}.ts; no SQL, no business logic here.
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage } from '../../i18n';
import { renderGuideShell } from '../../shared/components/guide-shell';
import {
    GUIDE_SECTION_SLUGS,
    guideSectionHref,
    guideSectionPath,
    guideSectionTitle,
    type GuideSectionSlug,
} from '../../shared/components/guide-nav';
import { generateHTML } from '../../shared/templates/layout';
import { renderAboutMaelsh, renderAboutOverview } from './about-page';
import { renderHelpSections } from './help-page';

export { GUIDE_SECTION_SLUGS, guideSectionPath, type GuideSectionSlug };

/** Legacy paths and the guide section each one maps to. */
export const GUIDE_ALIASES: Record<string, GuideSectionSlug> = {
    '/about': 'overview',
    '/help': 'help',
    '/faq': 'help',
};

function isGuideSection(value: string): value is GuideSectionSlug {
    return (GUIDE_SECTION_SLUGS as readonly string[]).includes(value);
}

/** A card linking to one section of the center (used by the hub). */
function sectionCard(lang: Language, tr: Record<string, any>, section: GuideSectionSlug): string {
    const g = tr.guide;
    return `
        <li>
            <a href="${guideSectionHref(section, lang)}"
               class="block h-full p-6 rounded-3xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 hover:border-purple-400 dark:hover:border-purple-700 transition-colors">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">${g.sections[section].title}</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">${g.sections[section].desc}</p>
            </a>
        </li>`;
}

/**
 * The content of the sections whose real body is published elsewhere
 * (managed documents per H9). Nothing is invented here: the section points
 * at the published surface and says so.
 */
function managedBody(lang: Language, tr: Record<string, any>, section: GuideSectionSlug): string {
    const g = tr.guide;
    return `
        <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed mb-6">${g.sections[section].desc}</p>
        <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-6">${g.managed_note}</p>
        <a href="/docs?lang=${lang}" class="inline-block px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full text-sm font-bold hover:opacity-90 transition-opacity">${g.links.docs}</a>`;
}

/** A section that lists the platform routes which already exist. */
function routesBody(lang: Language, tr: Record<string, any>, section: GuideSectionSlug, links: Array<{ href: string; label: string }>): string {
    const g = tr.guide;
    const items = links
        .map(
            (l) => `
            <li>
                <a href="${l.href}" class="inline-block px-5 py-2.5 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">${l.label}</a>
            </li>`
        )
        .join('');

    return `
        <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed mb-6">${g.sections[section].desc}</p>
        <ul class="flex flex-wrap gap-3">${items}</ul>`;
}

/**
 * The body of one guide section. The overview and help sections reuse the
 * EXISTING /about and /help bodies; the other sections link to the real
 * surfaces that already carry their content.
 */
function sectionBody(lang: Language, tr: Record<string, any>, section: GuideSectionSlug): string {
    const g = tr.guide;

    switch (section) {
        case 'overview':
            return renderAboutOverview(lang);
        case 'help':
            return renderHelpSections(lang);
        case 'message':
            // The Maelsh block comes from the SAME function the overview
            // section uses (renderAboutOverview calls renderAboutMaelsh),
            // so the two sections can never show different wording. It is
            // defined once, in about-page.ts.
            return `
                ${renderAboutMaelsh(lang)}
                <p class="mt-8 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${g.docs_note}</p>
                <a href="/docs?lang=${lang}" class="mt-4 inline-block px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full text-sm font-bold hover:opacity-90 transition-opacity">${g.links.docs}</a>`;
        case 'technology':
            return managedBody(lang, tr, 'technology');
        case 'ai':
            return managedBody(lang, tr, 'ai');
        case 'terms':
            return routesBody(lang, tr, 'terms', [
                { href: '/privacy-policy', label: g.links.privacy },
                { href: '/data-deletion', label: g.links.deletion },
                { href: `/reports?lang=${lang}`, label: g.links.reports },
                { href: `/complaints?lang=${lang}`, label: g.links.complaints },
                { href: `/transparency?lang=${lang}`, label: g.links.transparency },
                { href: `/docs?lang=${lang}`, label: g.links.docs },
            ]);
        case 'contact':
            return routesBody(lang, tr, 'contact', [
                { href: `/messages?tab=admin&lang=${lang}`, label: g.links.messages },
                { href: `/reports?lang=${lang}`, label: g.links.reports },
                { href: `/complaints?lang=${lang}`, label: g.links.complaints },
            ]);
        case 'support':
            return routesBody(lang, tr, 'support', [
                { href: `/donate?lang=${lang}`, label: g.links.donate },
                { href: `/transparency?lang=${lang}`, label: g.links.transparency },
                { href: `/docs?lang=${lang}`, label: g.links.docs },
            ]);
        default:
            return '';
    }
}

/** The <main> of a guide section page. */
function sectionMain(lang: Language, tr: Record<string, any>, section: GuideSectionSlug): string {
    const g = tr.guide;
    return `
        <main class="container mx-auto px-4 py-12 max-w-4xl">
            <div class="text-center mb-10">
                <p class="text-sm font-bold text-purple-600 dark:text-purple-400 mb-2">${g.section_label}</p>
                <h1 class="text-3xl md:text-5xl font-black text-gray-900 dark:text-white mb-4 leading-tight">${g.sections[section].title}</h1>
                <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed max-w-2xl mx-auto">${g.sections[section].desc}</p>
            </div>

            ${sectionBody(lang, tr, section)}

            <p class="mt-12 text-center">
                <a href="/guide?lang=${lang}" class="inline-block px-5 py-2.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 rounded-full text-sm font-bold hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">${g.back_to_center}</a>
            </p>
        </main>`;
}

/** GET /guide — the center hub: every section is one independent page. */
export function guideHubPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const lang = (c.get('lang') ?? 'en') as Language;
    const tr = translations[getUILanguage(lang)];
    const g = tr.guide;

    const cards = GUIDE_SECTION_SLUGS.map((section) => sectionCard(lang, tr, section)).join('');

    const body = `
        <main class="container mx-auto px-4 py-12 max-w-4xl">
            <div class="text-center mb-10">
                <div class="inline-flex p-3 rounded-2xl bg-gradient-to-br from-purple-500/10 to-amber-500/10 mb-4">
                    <img src="/static/dueli-icon.png" alt="${g.title}" class="w-16 h-16 object-contain drop-shadow-xl">
                </div>
                <h1 class="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-amber-500 mb-4 leading-tight">
                    ${g.title}
                </h1>
                <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed max-w-2xl mx-auto">${g.subtitle}</p>
                <p class="mt-4 text-sm text-gray-500 dark:text-gray-400 max-w-2xl mx-auto">${g.hub_intro}</p>
            </div>

            <ul class="grid grid-cols-1 md:grid-cols-2 gap-6">
                ${cards}
            </ul>
        </main>`;

    const html = renderGuideShell(lang, { body });
    return c.html(
        generateHTML(html, lang, g.title, (c.get('cspNonce') as string) ?? '', {
            path: '/guide',
            description: tr.seo?.default_description,
        })
    );
}

/** GET /guide/:section — one section of the center, on its own address. */
export function guideSectionPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const lang = (c.get('lang') ?? 'en') as Language;
    const tr = translations[getUILanguage(lang)];
    const raw = (c.req.param('section') || '').toLowerCase();

    if (!isGuideSection(raw)) {
        return c.notFound();
    }

    const section = raw;
    const body = sectionMain(lang, tr, section);
    const html = renderGuideShell(lang, { active: section, body });

    return c.html(
        generateHTML(html, lang, guideSectionTitle(section, lang), (c.get('cspNonce') as string) ?? '', {
            path: guideSectionPath(section),
            description: tr.guide?.sections?.[section]?.desc,
        })
    );
}
