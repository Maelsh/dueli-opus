/**
 * UNIT38 / R4-GUIDE-1 — the guide center navigation.
 *
 * Shared by the /guide hub, by every /guide/:section page, and by the
 * legacy aliases (/about, /help, /faq) so a visitor who lands on an old
 * address immediately sees the whole center and can move to any section.
 *
 * The links are plain server-rendered <a> elements: no client router, no
 * SPA, and every section is its own document (deep link + refresh safe).
 */

import type { Language } from '../../config/types';
import { translations, getUILanguage } from '../../i18n';

/** The eight sections of the guide center, in navigation order. */
export const GUIDE_SECTION_SLUGS = [
    'overview',
    'message',
    'technology',
    'ai',
    'help',
    'terms',
    'contact',
    'support',
] as const;

export type GuideSectionSlug = (typeof GUIDE_SECTION_SLUGS)[number];

/** Path of a guide section. */
export function guideSectionPath(slug: GuideSectionSlug): string {
    return `/guide/${slug}`;
}

/** Link of a guide section in the given language. */
export function guideSectionHref(slug: GuideSectionSlug, lang: Language): string {
    return `${guideSectionPath(slug)}?lang=${lang}`;
}

/** The localized title of a guide section. */
export function guideSectionTitle(slug: GuideSectionSlug, lang: Language): string {
    const tr = translations[getUILanguage(lang)];
    return tr.guide?.sections?.[slug]?.title ?? slug;
}

/** The localized one-line description of a guide section. */
export function guideSectionDesc(slug: GuideSectionSlug, lang: Language): string {
    const tr = translations[getUILanguage(lang)];
    return tr.guide?.sections?.[slug]?.desc ?? '';
}

/**
 * The section navigation. `active` marks the current section with
 * aria-current so assistive technology knows where the visitor is.
 */
export function getGuideNav(lang: Language, active?: GuideSectionSlug): string {
    const tr = translations[getUILanguage(lang)];
    const label = tr.guide?.nav_label ?? 'Guide';

    const items = GUIDE_SECTION_SLUGS.map((slug) => {
        const isActive = slug === active;
        const cls = isActive
            ? 'bg-purple-600 text-white'
            : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900/30';
        return `
            <li>
                <a href="${guideSectionHref(slug, lang)}"
                   ${isActive ? 'aria-current="page" ' : ''}
                   class="inline-block px-4 py-2 rounded-full text-sm font-bold transition-colors ${cls}">${guideSectionTitle(slug, lang)}</a>
            </li>`;
    }).join('');

    return `
        <nav aria-label="${label}" class="mb-10">
            <ul class="flex flex-wrap justify-center gap-2">${items}</ul>
        </nav>`;
}
