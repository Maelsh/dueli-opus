/**
 * UNIT38 / R4-GUIDE-1 — the shared shell of the guide center.
 *
 * One shell for the hub (/guide), for every section page (/guide/:slug) and
 * for the legacy aliases (/about, /help, /faq) so an old address shows the
 * SAME center: the section navigation is always present, and the visitor can
 * reach any other section with one click.
 *
 * The body renderers return INNER content only; the <main> element is owned
 * by the caller (this keeps a single <main> per document).
 */

import type { Language } from '../../config/types';
import { getNavigation } from './navigation';
import { getLoginModal } from './login-modal';
import { getFooter } from './footer';
import { getGuideNav, type GuideSectionSlug } from './guide-nav';

export interface GuideShellOptions {
    /** Section to mark as current in the navigation. */
    active?: GuideSectionSlug;
    /** Inner content of the page (already wrapped by the caller). */
    body: string;
}

/**
 * Navigation + login modal + section navigation + body + footer.
 * The body is expected to carry its own <main>.
 */
export function renderGuideShell(lang: Language, options: GuideShellOptions): string {
    return `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}

        <div class="flex-1 bg-white dark:bg-[#0f0f0f]">
            ${getGuideNav(lang, options.active)}
            ${options.body}
        </div>

        ${getFooter(lang)}`;
}
