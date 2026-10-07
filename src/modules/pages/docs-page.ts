/**
 * Public documents pages (R3-C2 on the R2-A H9 managed-documents store).
 *
 * - GET /docs — index of published+public documents (titles only).
 * - GET /docs/:slug — reader for one published+public document.
 * Anything else (draft/private/missing) renders the app 404 — the same
 * no-oracle rule as the JSON API. Bodies are admin-authored text and are
 * HTML-escaped at render (stored XSS); no client script ships on these
 * pages, so no new CSP surface is introduced.
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../config/types';
import { translations, getUILanguage, isRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';
import { ManagedDocumentModel } from '../../models/ManagedDocumentModel';
import { Sanitize } from '../../lib/services/Sanitize';

function docTitle(tr: Record<string, string>): string {
    return tr.docs ?? 'Documents';
}

export async function docsIndexPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const lang = c.get('lang');
    const tr = translations[getUILanguage(lang)];
    const rtl = isRTL(lang);
    const docs = await new ManagedDocumentModel(c.env.DB).listPublishedPublic(50, 0);

    const items = docs
        .map(
            (d) => `
        <a href="/docs/${d.slug}?lang=${lang}" class="block p-5 rounded-2xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 hover:border-purple-500/40 transition-all">
          <h2 class="text-lg font-bold text-gray-900 dark:text-white">${Sanitize.escapeHtml(rtl ? d.title_ar : d.title_en)}</h2>
          <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">${Sanitize.escapeHtml(d.updated_at ?? '')}</p>
        </a>`
        )
        .join('');

    const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}

    <div class="min-h-screen bg-white dark:bg-[#0f0f0f] animate-fade-in">
      <main class="container mx-auto px-4 py-12 max-w-4xl">
        <div class="text-center mb-10">
          <h1 class="text-4xl md:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-amber-500 mb-4 leading-tight">
            ${Sanitize.escapeHtml(docTitle(tr))}
          </h1>
          <p class="text-lg text-gray-600 dark:text-gray-300 leading-relaxed">${Sanitize.escapeHtml(tr.docs_tagline ?? '')}</p>
        </div>
        ${
            docs.length === 0
                ? `<p class="text-center text-gray-500 dark:text-gray-400">${Sanitize.escapeHtml(tr.docs_empty ?? '')}</p>`
                : `<div class="grid grid-cols-1 md:grid-cols-2 gap-4">${items}</div>`
        }
      </main>
      <div>
        ${getFooter(lang)}
      </div>
    </div>
  `;

    return c.html(generateHTML(content, lang, docTitle(tr), (c.get('cspNonce') as string) ?? ''));
}

export async function docReaderPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const lang = c.get('lang');
    const tr = translations[getUILanguage(lang)];
    const rtl = isRTL(lang);
    const slug = (c.req.param('slug') || '').trim().toLowerCase();
    const doc = slug ? await new ManagedDocumentModel(c.env.DB).findPublishedPublic(slug) : null;
    if (!doc) return c.notFound();

    const title = rtl ? doc.title_ar : doc.title_en;
    const body = rtl ? doc.body_ar : doc.body_en;
    const paragraphs = Sanitize.escapeHtml(body || '')
        .split(/\r?\n\r?\n/)
        .map((p) => p.trim())
        .filter((p) => p !== '')
        .map((p) => `<p class="mb-4 leading-relaxed">${p.replace(/\r?\n/g, '<br>')}</p>`)
        .join('');

    const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}

    <div class="min-h-screen bg-white dark:bg-[#0f0f0f] animate-fade-in">
      <main class="container mx-auto px-4 py-12 max-w-3xl">
        <a href="/docs?lang=${lang}" class="inline-block mb-6 text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline">${Sanitize.escapeHtml(tr.docs_back ?? 'Back')}</a>
        <h1 class="text-4xl font-black text-gray-900 dark:text-white mb-2 leading-tight">${Sanitize.escapeHtml(title)}</h1>
        <p class="text-xs text-gray-500 dark:text-gray-400 mb-8">${Sanitize.escapeHtml(doc.updated_at ?? '')} · v${doc.version}</p>
        <article class="text-gray-700 dark:text-gray-200">${paragraphs}</article>
      </main>
      <div>
        ${getFooter(lang)}
      </div>
    </div>
  `;

    return c.html(generateHTML(content, lang, title, (c.get('cspNonce') as string) ?? ''));
}
