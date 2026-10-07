/**
 * Help & Guides Page (R3-C1)
 * صفحة المساعدة والأدلة: نظرة عامة + أدلة الأدوار + مواضيع + أسئلة شائعة
 *
 * Static informational surface only: no lifecycle/auth/finance logic,
 * no migrations, no new realtime systems. All links point at routes
 * that exist in main.ts; all strings come from tr.help_guide (ar/en).
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../config/types';
import { translations, getUILanguage, isRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

export function helpPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const lang = c.get('lang');
  const tr = translations[getUILanguage(lang)];
  const rtl = isRTL(lang);
  const hg = tr.help_guide;

  // R3-C1 forensic fix: some help targets already carry a query string
  // (e.g. '/messages?tab=admin'). Appending '?lang=' unconditionally would
  // produce a malformed '?..?..' URL, so pick the separator honestly.
  const withLang = (href: string) =>
    href.includes('?') ? `${href}&lang=${lang}` : `${href}?lang=${lang}`;

  const topic = (
    id: string,
    titleKey: string,
    bodyKey: string,
    links: Array<{ href: string; label: string }>,
  ) => `
    <section id="${id}" aria-labelledby="${id}-t" class="p-6 rounded-3xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800">
      <h3 id="${id}-t" class="text-lg font-bold text-gray-900 dark:text-white mb-2">${hg[titleKey]}</h3>
      <p class="text-gray-600 dark:text-gray-300 text-sm leading-relaxed mb-3">${hg[bodyKey]}</p>
      <div class="flex flex-wrap gap-2">
        ${links.map((l) => `<a href="${withLang(l.href)}" class="text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline">${l.label}</a>`).join('')}
      </div>
    </section>
  `;

  const roleCard = (
    id: string,
    roleKey: string,
    steps: Array<{ t: string; d: string }>,
    cta: { href: string; label: string },
  ) => `
    <section id="${id}" aria-labelledby="${id}-t" class="p-6 rounded-3xl bg-white dark:bg-[#141414] border-2 border-purple-100 dark:border-purple-900/30">
      <h3 id="${id}-t" class="text-xl font-black text-gray-900 dark:text-white mb-4">${hg[roleKey]}</h3>
      <ol class="space-y-4">
        ${steps.map((s, i) => `
          <li class="flex gap-3">
            <span aria-hidden="true" class="shrink-0 w-7 h-7 rounded-full bg-purple-600 text-white text-sm font-bold flex items-center justify-center">${i + 1}</span>
            <div>
              <p class="font-bold text-gray-900 dark:text-white text-sm">${hg[s.t]}</p>
              <p class="text-gray-600 dark:text-gray-300 text-sm leading-relaxed">${hg[s.d]}</p>
            </div>
          </li>
        `).join('')}
      </ol>
      <a href="${withLang(cta.href)}" class="inline-block mt-4 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full text-sm font-bold hover:opacity-90 transition-opacity">${cta.label}</a>
    </section>
  `;

  const faqItem = (n: number) => `
    <details class="group p-4 rounded-2xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800">
      <summary class="cursor-pointer font-bold text-gray-900 dark:text-white text-sm list-none flex items-center justify-between gap-2">
        <span>${hg[`faq_q${n}`]}</span>
        <i aria-hidden="true" class="fas fa-chevron-down text-xs text-gray-400 group-open:rotate-180 transition-transform"></i>
      </summary>
      <p class="mt-2 text-sm text-gray-600 dark:text-gray-300 leading-relaxed">${hg[`faq_a${n}`]}</p>
    </details>
  `;

  const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}

    <div class="min-h-screen bg-white dark:bg-[#0f0f0f] animate-fade-in">
      <main class="container mx-auto px-4 py-12 max-w-4xl">
        <div class="text-center mb-10">
          <div class="inline-flex p-3 rounded-2xl bg-gradient-to-br from-purple-500/10 to-amber-500/10 mb-4">
            <i aria-hidden="true" class="far fa-question-circle text-4xl text-purple-500"></i>
          </div>
          <h1 class="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-amber-500 mb-4 leading-tight">
            ${hg.title}
          </h1>
          <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed">${hg.subtitle}</p>
        </div>

        <nav aria-label="${hg.title}" class="flex flex-wrap justify-center gap-2 mb-12">
          <a href="#overview" class="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900/30">${hg.nav_overview}</a>
          <a href="#roles" class="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900/30">${hg.nav_roles}</a>
          <a href="#topics" class="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900/30">${hg.nav_topics}</a>
          <a href="#faq" class="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900/30">${hg.nav_faq}</a>
          <a href="#access" class="px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 text-sm font-bold text-gray-700 dark:text-gray-200 hover:bg-purple-100 dark:hover:bg-purple-900/30">${hg.nav_access}</a>
        </nav>

        <section id="overview" aria-labelledby="overview-t" class="mb-12 text-center">
          <h2 id="overview-t" class="text-2xl font-black text-gray-900 dark:text-white mb-3">${hg.overview_t}</h2>
          <p class="text-gray-600 dark:text-gray-300 leading-relaxed max-w-2xl mx-auto">${hg.overview_d}</p>
        </section>

        <section id="roles" aria-labelledby="roles-t" class="mb-12">
          <h2 id="roles-t" class="text-2xl font-black text-center text-gray-900 dark:text-white mb-6">${hg.roles_t}</h2>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            ${roleCard('role-creator', 'creator_t', [
              { t: 'creator_s1t', d: 'creator_s1d' },
              { t: 'creator_s2t', d: 'creator_s2d' },
              { t: 'creator_s3t', d: 'creator_s3d' },
            ], { href: '/create', label: tr.create_competition || 'Create' })}
            ${roleCard('role-opponent', 'opponent_t', [
              { t: 'opponent_s1t', d: 'opponent_s1d' },
              { t: 'opponent_s2t', d: 'opponent_s2d' },
              { t: 'opponent_s3t', d: 'opponent_s3d' },
            ], { href: '/explore', label: tr.explore || 'Explore' })}
            ${roleCard('role-viewer', 'viewer_t', [
              { t: 'viewer_s1t', d: 'viewer_s1d' },
              { t: 'viewer_s2t', d: 'viewer_s2d' },
              { t: 'viewer_s3t', d: 'viewer_s3d' },
            ], { href: '/explore', label: tr.explore || 'Explore' })}
          </div>
        </section>

        <section id="topics" aria-labelledby="topics-t" class="mb-12">
          <h2 id="topics-t" class="text-2xl font-black text-center text-gray-900 dark:text-white mb-6">${hg.topics_t}</h2>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            ${topic('topic-create', 'topic_create_t', 'topic_create_d', [
              { href: '/create', label: tr.create_competition || 'Create' },
            ])}
            ${topic('topic-invite', 'topic_invite_t', 'topic_invite_d', [
              { href: '/my-requests', label: tr.my_requests || 'Requests' },
              { href: '/my-competitions', label: tr.my_competitions || 'Competitions' },
            ])}
            ${topic('topic-live', 'topic_live_t', 'topic_live_d', [
              { href: '/explore', label: tr.explore || 'Explore' },
            ])}
            ${topic('topic-recording', 'topic_recording_t', 'topic_recording_d', [
              { href: '/explore', label: tr.explore || 'Explore' },
            ])}
            ${topic('topic-ratings', 'topic_ratings_t', 'topic_ratings_d', [
              { href: '/explore', label: tr.explore || 'Explore' },
            ])}
            ${topic('topic-reactions', 'topic_reactions_t', 'topic_reactions_d', [
              { href: '/explore', label: tr.explore || 'Explore' },
            ])}
            ${topic('topic-comments', 'topic_comments_t', 'topic_comments_d', [
              { href: '/explore', label: tr.explore || 'Explore' },
            ])}
            ${topic('topic-discover', 'topic_discover_t', 'topic_discover_d', [
              { href: '/explore', label: tr.explore || 'Explore' },
              { href: '/settings', label: tr.settings || 'Settings' },
            ])}
            ${topic('topic-payout', 'topic_payout_t', 'topic_payout_d', [
              { href: '/earnings', label: tr.earnings_nav || 'Earnings' },
              { href: '/donate', label: tr.donate || 'Donate' },
              { href: '/transparency', label: tr.transparency || 'Transparency' },
            ])}
            ${topic('topic-support', 'topic_support_t', 'topic_support_d', [
              { href: '/messages?tab=admin', label: tr.contact_admin || 'Contact' },
              { href: '/reports', label: tr.submit_report || 'Report' },
              { href: '/complaints', label: tr.arbitration?.my_complaints || 'Complaints' },
            ])}
          </div>
        </section>

        <section id="faq" aria-labelledby="faq-t" class="mb-12">
          <h2 id="faq-t" class="text-2xl font-black text-center text-gray-900 dark:text-white mb-6">${hg.faq_t}</h2>
          <div class="space-y-3">
            ${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(faqItem).join('')}
          </div>
        </section>

        <section id="access" aria-labelledby="access-t" class="p-6 rounded-3xl bg-purple-50 dark:bg-purple-900/10 border border-purple-100 dark:border-purple-900/30">
          <h2 id="access-t" class="text-xl font-black text-gray-900 dark:text-white mb-2 ${rtl ? 'text-right' : 'text-left'}">${hg.access_t}</h2>
          <p class="text-sm text-gray-600 dark:text-gray-300 leading-relaxed">${hg.access_d}</p>
        </section>
      </main>
      <div>
        ${getFooter(lang)}
      </div>
    </div>
  `;

  return c.html(generateHTML(content, lang, hg.title, (c.get('cspNonce') as string) ?? ''));
}
