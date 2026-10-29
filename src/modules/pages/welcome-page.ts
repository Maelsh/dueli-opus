/**
 * UNIT38 / R4-GUIDE-1 — the /welcome splash portal.
 *
 * The owner decision (plan 08, 2026-10-29) asks for a splash page that
 * shows the Dueli logo, the phrase "ارتقِ .. تثقف .. استمتع .. اربح" in
 * sequence, a "By Maelsh Pro" signal, and then moves the visitor smoothly
 * to https://dueli.maelshpro.com.
 *
 * Rules this page honours:
 *   - It does NOT intercept the main domain or any existing route: it is
 *     its own path and the redirect target is a separate origin.
 *   - It never traps the visitor: an immediate "skip" link is rendered
 *     server-side, the redirect is a plain client-side navigation that
 *     prefers-reduced-motion users get instantly, and the page stays
 *     fully readable without JavaScript.
 *   - It adds no heavy asset: the logo is the existing /static/dueli-icon.png
 *     and the styling is inline.
 *
 * The splash talks about the phrase in both languages, so the two
 * language variants of the portal both carry the full phrase.
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, getDir } from '../../i18n';
import { SITE_ORIGIN } from '../../shared/templates/seo';
import { Sanitize } from '../../lib/services/Sanitize';

/**
 * The phrase of the portal, in the four words it is shown in.
 *
 * The wording itself lives in the translation pack (splash.word_1..4) so
 * the portal is never hardcoded in one language: the Arabic variant carries
 * the brand phrase "ارتقِ .. تثقف .. استمتع .. اربح" and the English variant
 * carries its published translation.
 */
const SPLASH_WORD_KEYS = ['word_1', 'word_2', 'word_3', 'word_4'] as const;

/** The platform the visitor is sent to. */
const SPLASH_TARGET = `${SITE_ORIGIN}/`;

/**
 * GET /welcome — the splash portal.
 *
 * The redirect is a client-side navigation to the platform origin with a
 * visible skip link as the always-available fallback.
 */
export function welcomePage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const lang = (c.get('lang') ?? 'en') as Language;
    const tr = translations[getUILanguage(lang)];
    const sp = tr.splash;
    const dir = getDir(lang);
    const nonce = (c.get('cspNonce') as string) ?? '';

    // The phrase is shown word by word, in sequence. Both language variants
    // carry the same brand phrase; the sequence is a CSS animation with
    // per-word delays (nth-child — never an inline style attribute, which
    // the strict CSP would block), and prefers-reduced-motion shows every
    // word at once.
    const words = SPLASH_WORD_KEYS.map(
        (key) => `<span class="splash-word">${Sanitize.escapeHtml(sp[key])}</span>`
    ).join('');
    const phraseText = SPLASH_WORD_KEYS.map((key) => sp[key]).join(' .. ');

    const content = `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#0f0f0f">
    <title>${Sanitize.escapeHtml(sp.title)}</title>
    <meta name="description" content="${Sanitize.escapeHtml(sp.title)} — ${Sanitize.escapeHtml(sp.by_maelsh_pro)}">
    <meta name="robots" content="noindex, follow">
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    <link rel="preload" as="image" href="/static/dueli-icon.png" fetchpriority="high">
    <style nonce="${nonce}">
        body {
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: radial-gradient(circle at 50% 20%, #2a1b4a 0%, #0f0f0f 60%, #000000 100%);
            color: #f9fafb;
            font-family: 'Cairo', system-ui, -apple-system, sans-serif;
            text-align: center;
        }
        .splash-wrap { padding: 2rem; max-width: 44rem; }
        .splash-logo { width: 8rem; height: 8rem; object-fit: contain; filter: drop-shadow(0 0 2rem rgba(168,85,247,0.45)); }
        .splash-title { font-size: 2.5rem; font-weight: 900; margin: 1.5rem 0 0.25rem; background: linear-gradient(90deg, #a855f7, #f59e0b); -webkit-background-clip: text; background-clip: text; color: transparent; }
        .splash-phrase { font-size: 1.25rem; line-height: 2.2; color: #d1d5db; margin: 1rem 0 0.5rem; }
        .splash-word { display: inline-block; opacity: 0; animation: splash-rise 0.9s ease forwards; }
        .splash-word:nth-child(1) { animation-delay: 0s; }
        .splash-word:nth-child(2) { animation-delay: 0.45s; }
        .splash-word:nth-child(3) { animation-delay: 0.9s; }
        .splash-word:nth-child(4) { animation-delay: 1.35s; }
        .splash-word + .splash-word::before { content: " .."; color: #9ca3af; }
        .splash-by { color: #9ca3af; font-size: 1rem; margin-top: 1rem; }
        .splash-noscript { margin-top: 1rem; }
        .splash-skip { display: inline-block; margin-top: 2rem; padding: 0.75rem 1.5rem; border-radius: 9999px; background: linear-gradient(90deg, #7c3aed, #4f46e5); color: #fff; font-weight: 700; text-decoration: none; }
        .splash-skip:focus-visible { outline: 3px solid #fbbf24; outline-offset: 3px; }
        @keyframes splash-rise { from { opacity: 0; transform: translateY(0.75rem); } to { opacity: 1; transform: translateY(0); } }
        @media (prefers-reduced-motion: reduce) {
            .splash-word { opacity: 1; animation: none; }
        }
    </style>
</head>
<body>
    <main class="splash-wrap" id="main-content" tabindex="-1">
        <img src="/static/dueli-icon.png" alt="${Sanitize.escapeHtml(sp.title)}" class="splash-logo" width="128" height="128">
        <h1 class="splash-title">${Sanitize.escapeHtml(sp.title)}</h1>
        <p class="splash-phrase" aria-label="${Sanitize.escapeHtml(phraseText)}">${words}</p>
        <p class="splash-by">${Sanitize.escapeHtml(sp.by_maelsh_pro)}</p>
        <a class="splash-skip" id="splashSkip" href="${Sanitize.escapeHtml(SPLASH_TARGET)}">${Sanitize.escapeHtml(sp.skip)}</a>
        <noscript>
            <p class="splash-by splash-noscript">${Sanitize.escapeHtml(sp.redirect_failed)}</p>
        </noscript>
    </main>
    <script nonce="${nonce}">
        (function () {
            var target = ${JSON.stringify(SPLASH_TARGET)};
            var skip = document.getElementById('splashSkip');
            // The skip link is always available; the timed navigation only
            // runs when the visitor has not taken over.
            var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            var delay = reduced ? 600 : 2600;
            var timer = window.setTimeout(function () { window.location.replace(target); }, delay);
            if (skip) {
                skip.addEventListener('click', function () { window.clearTimeout(timer); });
            }
            document.addEventListener('visibilitychange', function () {
                if (document.visibilityState === 'hidden') { window.clearTimeout(timer); }
            });
        })();
    </script>
</body>
</html>`;

    return c.html(content);
}
