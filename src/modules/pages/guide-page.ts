/**
 * UNIT38 / R4-GUIDE-1 — the /guide center (about + help in one place).
 *
 * Contract (plan 13 §5 "R4-GUIDE-1"):
 *   - /guide is the center. Its nine sections are INDEPENDENT pages, each
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

/** A responsive row of pill links to routes that already exist. */
function linkPills(lang: Language, links: Array<{ href: string; label: string }>): string {
    const items = links
        .map(
            (l) => `
            <li>
                <a href="${l.href}" class="inline-block px-5 py-2.5 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors">${l.label}</a>
            </li>`
        )
        .join('');

    return `<ul class="flex flex-wrap gap-3">${items}</ul>`;
}

/**
 * /guide/message — the founder's human message. The page opens with the
 * official slogan and identity statement, then the four owner-approved
 * pillars, the future AI bridge, and the Maelsh Pro block (the same single
 * source used by the overview section).
 */
function messageBody(lang: Language, tr: Record<string, any>): string {
    const g = tr.guide;
    const m = g.message_content;

    const pillars = m.pillars
        .map(
            (pillar: { title: string; body: string }) => `
            <li class="p-6 rounded-2xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800">
                <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">${pillar.title}</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">${pillar.body}</p>
            </li>`
        )
        .join('');

    return `
        <section aria-labelledby="message-identity" class="p-6 md:p-10 rounded-3xl bg-gradient-to-br from-purple-50 to-amber-50 dark:from-purple-900/20 dark:to-amber-900/10 border border-purple-100 dark:border-purple-900/40">
            <p class="text-sm font-bold text-purple-700 dark:text-purple-400 mb-2">${m.identity_title}</p>
            <h2 id="message-identity" class="text-3xl md:text-4xl font-black text-gray-900 dark:text-white mb-4 leading-tight">${m.slogan}</h2>
            <p class="text-lg text-gray-700 dark:text-gray-200 leading-relaxed">${m.identity}</p>
        </section>

        <h2 class="mt-10 mb-4 text-2xl font-bold text-gray-900 dark:text-white">${m.pillars_title}</h2>
        <ul class="grid grid-cols-1 md:grid-cols-2 gap-4">${pillars}</ul>

        <section aria-labelledby="message-ai-bridge" class="mt-10 p-6 md:p-8 rounded-3xl bg-gradient-to-br from-purple-50 to-amber-50 dark:from-purple-900/20 dark:to-amber-900/10 border border-purple-100 dark:border-purple-900/40">
            <h2 id="message-ai-bridge" class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${m.ai_bridge_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed">${m.ai_bridge_body}</p>
        </section>

        <div class="mt-10">${renderAboutMaelsh(lang)}</div>

        <p class="mt-8 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${g.docs_note}</p>
        <a href="/docs?lang=${lang}" class="mt-4 inline-block px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full text-sm font-bold hover:opacity-90 transition-opacity">${g.links.docs}</a>`;
}

/**
 * /guide/ai — the owner-approved technical appreciation page: the companies
 * and models that helped build Dueli, the access platforms, the hosting and
 * infrastructure, and the approved closing appeal and disclaimer.
 */
function aiBody(lang: Language, tr: Record<string, any>): string {
    const g = tr.guide;
    const a = g.ai_content;

    const rows = a.entries
        .map(
            (entry: { company: string; model: string; role: string }) => `
            <tr class="border-b border-gray-100 dark:border-gray-800 align-top">
                <th scope="row" class="py-4 pe-4 text-start font-bold text-gray-900 dark:text-white">${entry.company}</th>
                <td class="py-4 pe-4 font-semibold text-gray-700 dark:text-gray-200">${entry.model}</td>
                <td class="py-4 text-gray-600 dark:text-gray-300">${entry.role}</td>
            </tr>`
        )
        .join('');

    const additional = a.additional
        .map(
            (entry: { company: string; model: string }) => `
            <li class="p-4 rounded-xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800">
                <span class="block font-bold text-gray-900 dark:text-white">${entry.company}</span>
                <span class="mt-1 block text-sm text-gray-600 dark:text-gray-300">${entry.model}</span>
            </li>`
        )
        .join('');

    const platforms = a.platforms
        .map(
            (platform: string) => `
            <li class="px-4 py-2.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-sm font-bold text-purple-800 dark:text-purple-200">${platform}</li>`
        )
        .join('');

    return `
        <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed mb-8">${a.intro}</p>

        <section aria-labelledby="ai-companies" class="mb-10">
            <h2 id="ai-companies" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${a.table_caption}</h2>
            <div class="overflow-x-auto rounded-2xl border border-gray-100 dark:border-gray-800" tabindex="0" role="region" aria-label="${a.table_caption}">
                <table class="w-full text-sm">
                    <caption class="sr-only">${a.table_caption}</caption>
                    <thead class="bg-gray-50 dark:bg-[#1a1a1a]">
                        <tr>
                            <th scope="col" class="py-3 pe-4 text-start font-bold text-gray-700 dark:text-gray-200">${a.company_label}</th>
                            <th scope="col" class="py-3 pe-4 text-start font-bold text-gray-700 dark:text-gray-200">${a.model_label}</th>
                            <th scope="col" class="py-3 text-start font-bold text-gray-700 dark:text-gray-200">${a.role_label}</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>
        </section>

        <section aria-labelledby="ai-additional" class="mb-10">
            <h2 id="ai-additional" class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${a.additional_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">${a.additional_intro}</p>
            <ul class="grid grid-cols-1 md:grid-cols-2 gap-3">${additional}</ul>
        </section>

        <section aria-labelledby="ai-platforms" class="mb-10">
            <h2 id="ai-platforms" class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${a.platforms_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">${a.platforms_intro}</p>
            <ul class="flex flex-wrap gap-3">${platforms}</ul>
        </section>

        <section aria-labelledby="ai-infrastructure" class="mb-10 p-6 rounded-2xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800">
            <h2 id="ai-infrastructure" class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${a.infrastructure_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed">${a.infrastructure_body}</p>
        </section>

        <section aria-labelledby="ai-appeal" class="mb-10 p-6 md:p-8 rounded-3xl bg-gradient-to-br from-purple-50 to-amber-50 dark:from-purple-900/20 dark:to-amber-900/10 border border-purple-100 dark:border-purple-900/40">
            <h2 id="ai-appeal" class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${a.appeal_title}</h2>
            <p class="text-gray-700 dark:text-gray-200 leading-relaxed">${a.appeal}</p>
        </section>

        <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-8">${a.disclaimer}</p>

        <section class="mt-8">
            <h2 class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${a.updates_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">${a.updates_body}</p>
            <a href="/docs?lang=${lang}" class="inline-block px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full text-sm font-bold hover:opacity-90 transition-opacity">${a.docs_link}</a>
        </section>`;
}

/** /guide/technology — the plain-language layer and the engineering layer. */
function technologyBody(tr: Record<string, any>): string {
    const t = tr.guide.technology_content;

    const simple = t.simple_paragraphs
        .map((p: string) => `<p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">${p}</p>`)
        .join('');
    const engineering = t.engineering_paragraphs
        .map((p: string) => `<p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">${p}</p>`)
        .join('');
    const stack = t.stack
        .map(
            (item: { name: string; role: string }) => `
            <li class="p-4 rounded-xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800">
                <span class="block font-bold text-gray-900 dark:text-white">${item.name}</span>
                <span class="mt-1 block text-sm text-gray-500 dark:text-gray-400">${item.role}</span>
            </li>`
        )
        .join('');

    return `
        <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed mb-8">${t.intro}</p>

        <section aria-labelledby="technology-simple" class="mb-10">
            <h2 id="technology-simple" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${t.simple_title}</h2>
            ${simple}
        </section>

        <section aria-labelledby="technology-engineering" class="mb-10">
            <h2 id="technology-engineering" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${t.engineering_title}</h2>
            ${engineering}
        </section>

        <section aria-labelledby="technology-stack">
            <h2 id="technology-stack" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${t.stack_title}</h2>
            <ul class="grid grid-cols-1 md:grid-cols-2 gap-3">${stack}</ul>
        </section>

        <p class="mt-8 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${t.note}</p>`;
}

/** /guide/support — 80/20 model, donor roadmap and non-financial help. */
function supportBody(lang: Language, tr: Record<string, any>): string {
    const g = tr.guide;
    const s = g.support_content;

    const stages = s.donors
        .map(
            (stage: { title: string; body: string }, index: number) => `
            <li class="p-5 rounded-2xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800">
                <span class="block text-xs font-bold text-purple-700 dark:text-purple-400 mb-1">${index + 1}</span>
                <h3 class="font-bold text-gray-900 dark:text-white mb-2">${stage.title}</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">${stage.body}</p>
            </li>`
        )
        .join('');
    const nonfinancial = s.nonfinancial
        .map((item: string) => `<li class="flex gap-3 text-gray-600 dark:text-gray-300"><span aria-hidden="true" class="text-purple-600 dark:text-purple-400">•</span><span>${item}</span></li>`)
        .join('');

    return `
        <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed mb-8">${s.intro}</p>

        <section aria-labelledby="support-split" class="mb-10">
            <h2 id="support-split" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${s.split_title}</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="p-6 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/40">
                    <p aria-hidden="true" class="text-4xl font-black text-purple-700 dark:text-purple-300 mb-2">80%</p>
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">${s.split_80_title}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">${s.split_80_body}</p>
                </div>
                <div class="p-6 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40">
                    <p aria-hidden="true" class="text-4xl font-black text-amber-700 dark:text-amber-300 mb-2">20%</p>
                    <h3 class="text-lg font-bold text-gray-900 dark:text-white mb-2">${s.split_20_title}</h3>
                    <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">${s.split_20_body}</p>
                </div>
            </div>
            <p class="mt-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${s.split_note}</p>
        </section>

        <section aria-labelledby="support-donors" class="mb-10">
            <h2 id="support-donors" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${s.donors_title}</h2>
            <ol class="grid grid-cols-1 md:grid-cols-3 gap-4">${stages}</ol>
            <p class="mt-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${s.donors_note}</p>
        </section>

        <section aria-labelledby="support-future" class="mb-10 p-6 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/40">
            <h2 id="support-future" class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${s.future_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed">${s.future_body}</p>
        </section>

        <section aria-labelledby="support-nonfinancial" class="mb-10">
            <h2 id="support-nonfinancial" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${s.nonfinancial_title}</h2>
            <ul class="space-y-3">${nonfinancial}</ul>
        </section>

        <section aria-labelledby="support-separation">
            <h2 id="support-separation" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${s.separation_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-6">${s.separation_body}</p>
            ${linkPills(lang, [
                { href: `/donate?lang=${lang}`, label: g.links.donate },
                { href: `/transparency?lang=${lang}`, label: g.links.transparency },
                { href: `/docs?lang=${lang}`, label: g.links.docs },
            ])}
        </section>`;
}

/** /guide/charter — the Founding Global Alliance & Continuity Charter (80/20 + Escrow). */
function charterBody(lang: Language, tr: Record<string, any>): string {
    const g = tr.guide;
    const c = g.charter_content;

    const continuityItems = c.continuity_items
        .map((item: string) => `<li class="flex gap-3 text-gray-600 dark:text-gray-300"><span aria-hidden="true" class="text-purple-600 dark:text-purple-400">•</span><span>${item}</span></li>`)
        .join('');
    const tracks = c.tracks
        .map(
            (track: { name: string; body: string }) => `
            <li class="p-5 rounded-2xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800">
                <h3 class="font-bold text-gray-900 dark:text-white mb-2">${track.name}</h3>
                <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">${track.body}</p>
            </li>`
        )
        .join('');
    const benefits = c.benefits
        .map((item: string) => `<li class="flex gap-3 text-gray-600 dark:text-gray-300"><span aria-hidden="true" class="text-amber-600 dark:text-amber-400">•</span><span>${item}</span></li>`)
        .join('');
    const clarityItems = c.clarity_items
        .map((item: string) => `<li class="flex gap-3 text-gray-600 dark:text-gray-300"><span aria-hidden="true" class="text-amber-600 dark:text-amber-400">•</span><span>${item}</span></li>`)
        .join('');

    return `
        <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed mb-8">${c.intro}</p>

        <section aria-labelledby="charter-license" class="mb-10 p-6 rounded-2xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800">
            <h2 id="charter-license" class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${c.license_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed">${c.license_body}</p>
        </section>

        <section aria-labelledby="charter-continuity" class="mb-10">
            <h2 id="charter-continuity" class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${c.continuity_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-4">${c.continuity_body}</p>
            <ul class="space-y-3">${continuityItems}</ul>
        </section>

        <section aria-labelledby="charter-economy" class="mb-10 p-6 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/40">
            <p aria-hidden="true" class="text-5xl font-black text-purple-700 dark:text-purple-300 mb-2">80<span class="text-3xl align-top">/</span>20</p>
            <h2 id="charter-economy" class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${c.economy_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed">${c.economy_body}</p>
        </section>

        <section aria-labelledby="charter-alliance" class="mb-10">
            <h2 id="charter-alliance" class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${c.alliance_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-6">${c.alliance_body}</p>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">${c.tracks_title}</h3>
            <ul class="grid grid-cols-1 md:grid-cols-2 gap-4">${tracks}</ul>
        </section>

        <section aria-labelledby="charter-custodian" class="mb-10 p-6 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40">
            <h2 id="charter-custodian" class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${c.custodian_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed">${c.custodian_body}</p>
        </section>

        <section aria-labelledby="charter-benefits" class="mb-10">
            <h2 id="charter-benefits" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${c.benefits_title}</h2>
            <ul class="space-y-3">${benefits}</ul>
        </section>

        <section aria-labelledby="charter-clarity" class="mb-10 p-6 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-900/10">
            <h2 id="charter-clarity" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${c.clarity_title}</h2>
            <ul class="space-y-3">${clarityItems}</ul>
            <p class="mt-4 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${c.clarity_note}</p>
        </section>

        <section aria-labelledby="charter-contact">
            <h2 id="charter-contact" class="text-2xl font-bold text-gray-900 dark:text-white mb-3">${c.cta_title}</h2>
            <p class="text-gray-600 dark:text-gray-300 leading-relaxed mb-6">${c.cta_body}</p>
            ${linkPills(lang, [
                { href: `/guide/contact?lang=${lang}`, label: g.sections.contact.title },
                { href: `/guide/support?lang=${lang}`, label: g.sections.support.title },
                { href: `/docs?lang=${lang}`, label: g.links.docs },
            ])}
        </section>`;
}

/**
 * /guide/terms — the seven owner-approved clauses and the policy links.
 */
function termsBody(lang: Language, tr: Record<string, any>): string {
    const g = tr.guide;
    const t = g.terms_content;

    const clauses = t.clauses
        .map(
            (clause: { title: string; body: string; items?: string[] }) => {
                const items = (clause.items ?? [])
                    .map(
                        (item: string) => `
                        <li class="flex gap-3 text-gray-600 dark:text-gray-300">
                            <span aria-hidden="true" class="text-purple-600 dark:text-purple-400">•</span>
                            <span>${item}</span>
                        </li>`
                    )
                    .join('');
                return `
                <section class="mb-8">
                    <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">${clause.title}</h3>
                    <p class="text-gray-600 dark:text-gray-300 leading-relaxed">${clause.body}</p>
                    ${items ? `<ul class="mt-3 space-y-3">${items}</ul>` : ''}
                </section>`;
            }
        )
        .join('');

    return `
        <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed mb-8">${t.intro}</p>

        <section aria-labelledby="terms-clauses" class="mb-10">
            <h2 id="terms-clauses" class="text-2xl font-bold text-gray-900 dark:text-white mb-6">${t.clauses_title}</h2>
            ${clauses}
        </section>

        <section aria-labelledby="terms-policies">
            <h2 id="terms-policies" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${t.policies_title}</h2>
            ${linkPills(lang, [
                { href: '/privacy-policy', label: g.links.privacy },
                { href: '/data-deletion', label: g.links.deletion },
                { href: `/reports?lang=${lang}`, label: g.links.reports },
                { href: `/complaints?lang=${lang}`, label: g.links.complaints },
                { href: `/transparency?lang=${lang}`, label: g.links.transparency },
                { href: `/docs?lang=${lang}`, label: g.links.docs },
            ])}
        </section>

        <p class="mt-8 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${t.note}</p>`;
}

/** /guide/contact — the official domains, in-product routes and external channels. */
function contactBody(lang: Language, tr: Record<string, any>): string {
    const c = tr.guide.contact_content;

    const domains = c.domains
        .map(
            (domain: { label: string; href: string; desc: string }) => `
            <li class="p-5 rounded-2xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800">
                <a href="${domain.href}" rel="noopener" class="font-bold text-purple-700 dark:text-purple-400 hover:underline">${domain.label}</a>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">${domain.desc}</p>
            </li>`
        )
        .join('');

    const channels = [
        { href: `/messages?tab=admin&lang=${lang}`, label: c.channels[0].label, desc: c.channels[0].desc },
        { href: `/reports?lang=${lang}`, label: c.channels[1].label, desc: c.channels[1].desc },
        { href: `/complaints?lang=${lang}`, label: c.channels[2].label, desc: c.channels[2].desc },
    ];
    const channelItems = channels
        .map(
            (channel) => `
            <li class="p-5 rounded-2xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800">
                <a href="${channel.href}" class="font-bold text-purple-700 dark:text-purple-400 hover:underline">${channel.label}</a>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">${channel.desc}</p>
            </li>`
        )
        .join('');

    const external = c.external
        .map(
            (channel: { label: string; href: string; desc: string }) => `
            <li class="p-5 rounded-2xl bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40">
                <a href="${channel.href}" rel="noopener" class="font-bold text-amber-800 dark:text-amber-300 hover:underline break-all">${channel.label}</a>
                <p class="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">${channel.desc}</p>
            </li>`
        )
        .join('');

    return `
        <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed mb-8">${c.intro}</p>

        <section aria-labelledby="contact-domains" class="mb-10">
            <h2 id="contact-domains" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${c.domains_title}</h2>
            <ul class="grid grid-cols-1 md:grid-cols-2 gap-4">${domains}</ul>
        </section>

        <section aria-labelledby="contact-channels" class="mb-10">
            <h2 id="contact-channels" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${c.channels_title}</h2>
            <ul class="grid grid-cols-1 md:grid-cols-3 gap-4">${channelItems}</ul>
        </section>

        <section aria-labelledby="contact-external" class="mb-10">
            <h2 id="contact-external" class="text-2xl font-bold text-gray-900 dark:text-white mb-4">${c.external_title}</h2>
            <ul class="grid grid-cols-1 md:grid-cols-3 gap-4">${external}</ul>
        </section>

        <section aria-labelledby="contact-security" class="p-6 rounded-2xl bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-900/40 mb-4">
            <h2 id="contact-security" class="text-xl font-bold text-gray-900 dark:text-white mb-3">${c.security_title}</h2>
            <p class="text-sm text-gray-700 dark:text-gray-200 leading-relaxed">${c.security_notice}</p>
        </section>
        <p class="text-sm text-gray-500 dark:text-gray-400 leading-relaxed">${c.response_note}</p>`;
}

/**
 * The body of one guide section. The overview and help sections reuse the
 * EXISTING /about and /help bodies; the remaining sections carry the UNIT39
 * content from i18n and link to the real surfaces that already exist.
 */
function sectionBody(lang: Language, tr: Record<string, any>, section: GuideSectionSlug): string {
    switch (section) {
        case 'overview':
            return renderAboutOverview(lang);
        case 'help':
            return renderHelpSections(lang);
        case 'message':
            return messageBody(lang, tr);
        case 'technology':
            return technologyBody(tr);
        case 'ai':
            return aiBody(lang, tr);
        case 'terms':
            return termsBody(lang, tr);
        case 'contact':
            return contactBody(lang, tr);
        case 'support':
            return supportBody(lang, tr);
        case 'charter':
            return charterBody(lang, tr);
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
            metaTitle: g.title,
            description: g.subtitle,
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
