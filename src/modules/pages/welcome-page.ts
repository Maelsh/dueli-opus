/**
 * UNIT38 / R4-GUIDE-1 + UNIT41.1 / R4-UI-UX-BROWSER-POLISH-1 — the /welcome
 * splash portal, upgraded to the owner-mandated cinematic 3D gate.
 *
 * What this page is: a full-screen cinematic intro rendered with the three
 * owner-approved scenes (public/static/welcome/scene-*.png, copied verbatim
 * from the plan repository), a Canvas particle layer (no 3D library), a
 * depth-parallax camera driven by the pointer, and a slow camera dolly with
 * crossfades between the scenes. The brand phrase reveals word by word, then
 * the visitor is moved smoothly to https://dueli.maelshpro.com.
 *
 * Rules this page honours (UNIT38 contract, unchanged):
 *   - It does NOT intercept the main domain or any existing route: it is
 *     its own path, plus the root `/` ONLY when the Host header is
 *     dueli.win or www.dueli.win (server-side check in the entry point).
 *   - It never traps the visitor: an immediate "skip" link is the first
 *     focusable element, the redirect is a plain client-side navigation,
 *     prefers-reduced-motion visitors skip the whole show (static nebula,
 *     instant words, quick redirect), and the page stays fully readable
 *     and usable with JavaScript disabled (all scenes visible, skip link
 *     works).
 *   - It stays light: the first scene loads with fetchpriority="high",
 *     scenes 2 and 3 are deferred with loading="lazy" + fetchpriority="low",
 *     no external 3D/animation library is shipped, particles are capped and
 *     pause when the tab is hidden, and the script honours prefers-reduced-motion.
 *   - noindex. The logo and phrase come from i18n; nothing is hard-coded in
 *     one language.
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

/** The three approved scenes, in narrative order. */
const SCENES = [
    { src: '/static/welcome/scene-1-sparks.png', role: 'sparks' },
    { src: '/static/welcome/scene-2-stardust.png', role: 'stardust' },
    { src: '/static/welcome/scene-3-nebula.png', role: 'nebula' },
] as const;

/**
 * GET /welcome — the cinematic splash portal.
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

    // The phrase is shown word by word, in sequence. The sequence is a CSS
    // animation (nth-child rules — never inline styles, which the strict CSP
    // would block) and prefers-reduced-motion shows every word at once.
    const words = SPLASH_WORD_KEYS.map(
        (key) => `<span class="splash-word">${Sanitize.escapeHtml(sp[key])}</span>`
    ).join('');
    const phraseText = SPLASH_WORD_KEYS.map((key) => sp[key]).join(' .. ');

    const sceneLayer = (scene: (typeof SCENES)[number], index: number) => `
            <div class="scene-layer${index === 0 ? ' is-live ken-burns' : ''}" data-scene="${index}">
                <img src="${scene.src}" alt="" width="1920" height="1080" ${index === 0 ? 'fetchpriority="high"' : 'loading="lazy" fetchpriority="low"'} decoding="async">
            </div>`;

    const content = `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#0f0f0f">
    <title>${Sanitize.escapeHtml(sp.title)}</title>
    <meta name="description" content="${Sanitize.escapeHtml(sp.title)} — ${Sanitize.escapeHtml(sp.by_maelsh_pro)}">
    <meta name="robots" content="noindex, follow">
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    <link rel="preload" as="image" href="${SCENES[0].src}" fetchpriority="high">
    <style nonce="${nonce}">
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        body {
            margin: 0;
            min-height: 100vh;
            min-height: 100svh;
            background: #050308;
            color: #f9fafb;
            font-family: 'Cairo', system-ui, -apple-system, sans-serif;
            text-align: center;
            overflow: hidden;
        }
        /* ---------- Skip link: first focusable element, always visible ---------- */
        .splash-skip {
            position: fixed;
            top: 1rem;
            inset-inline-end: 1rem;
            z-index: 60;
            display: inline-flex;
            align-items: center;
            gap: 0.5rem;
            padding: 0.65rem 1.35rem;
            border-radius: 9999px;
            background: rgba(10, 10, 16, 0.72);
            border: 1px solid rgba(245, 197, 110, 0.45);
            color: #fde9c8;
            font-size: 0.875rem;
            font-weight: 700;
            text-decoration: none;
            backdrop-filter: blur(6px);
            transition: border-color 160ms ease, color 160ms ease, background 160ms ease;
        }
        .splash-skip:hover { border-color: #f5c86e; color: #fff7e0; }
        .splash-skip:focus-visible { outline: 3px solid #fbbf24; outline-offset: 3px; }

        /* ---------- Scene stack (depth layers) ---------- */
        .stage { position: fixed; inset: 0; overflow: hidden; }
        .scene-stack, .scene-layer { position: absolute; inset: 0; }
        .scene-layer {
            overflow: hidden;
            opacity: 0;
            will-change: opacity, transform;
        }
        .scene-layer img {
            width: 100%;
            height: 100%;
            object-fit: cover;
            object-position: center;
            transform-origin: 50% 50%;
            user-select: none;
            -webkit-user-drag: none;
        }
        .scene-layer.is-live { opacity: 1; }
        .scene-layer.ken-burns img { animation: ken-burns 7s ease-out forwards; }
        @keyframes ken-burns {
            from { transform: scale(1.22) translate3d(1.5%, 2.5%, 0); }
            to   { transform: scale(1.04) translate3d(0, 0, 0); }
        }
        /* Soft crossfade between scenes */
        .scene-layer { transition: opacity 1800ms ease; }
        /* Depth vignette + readability scrim */
        .vignette {
            position: absolute; inset: 0;
            background:
                radial-gradient(120% 90% at 50% 12%, transparent 42%, rgba(5, 3, 8, 0.55) 100%),
                radial-gradient(90% 90% at 50% 115%, rgba(5, 3, 8, 0.88) 0%, transparent 62%);
            pointer-events: none;
        }
        #fxCanvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }

        /* ---------- Foreground content ---------- */
        .content {
            position: absolute;
            inset: 0;
            z-index: 20;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-end;
            padding: 0 1rem 7.5vh;
            gap: 0.2rem;
        }
        .splash-logo {
            width: 5.25rem; height: 5.25rem; object-fit: contain;
            filter: drop-shadow(0 0 2.2rem rgba(245, 158, 11, 0.45));
            margin-bottom: 0.75rem;
        }
        .splash-title {
            font-size: clamp(2.6rem, 8vw, 4rem);
            line-height: 1.05;
            font-weight: 900;
            margin: 0;
            letter-spacing: 0.02em;
            background: linear-gradient(92deg, #fef3c7 0%, #f5c86e 28%, #c084fc 62%, #f0abfc 100%);
            -webkit-background-clip: text; background-clip: text; color: transparent;
            text-shadow: 0 0 3rem rgba(192, 132, 252, 0.35);
        }
        .splash-phrase {
            font-size: clamp(1.05rem, 3.4vw, 1.45rem);
            font-weight: 800;
            letter-spacing: 0.06em;
            margin: 0.65rem 0 0.4rem;
            color: #fde9c8;
            text-shadow: 0 2px 22px rgba(0, 0, 0, 0.75);
        }
        .splash-word { display: inline-block; opacity: 0; transform: translateY(1.1rem) scale(0.94); filter: blur(6px); }
        .stage.is-finale .splash-word { animation: word-in 900ms cubic-bezier(0.2, 0.9, 0.25, 1.15) forwards; }
        .stage.is-finale .splash-word:nth-child(1) { animation-delay: 0.10s; }
        .stage.is-finale .splash-word:nth-child(2) { animation-delay: 0.46s; }
        .stage.is-finale .splash-word:nth-child(3) { animation-delay: 0.82s; }
        .stage.is-finale .splash-word:nth-child(4) { animation-delay: 1.18s; }
        .splash-word + .splash-word::before { content: " .."; color: rgba(253, 233, 200, 0.55); }
        @keyframes word-in {
            from { opacity: 0; transform: translateY(1.1rem) scale(0.94); filter: blur(6px); }
            to   { opacity: 1; transform: translateY(0) scale(1); filter: blur(0); }
        }
        .splash-by { color: rgba(253, 233, 200, 0.82); font-size: 0.95rem; font-weight: 600; letter-spacing: 0.18em; text-transform: uppercase; margin: 0.15rem 0 0; text-shadow: 0 2px 12px rgba(0,0,0,.7); }
        .splash-noscript { margin-top: 0.75rem; font-size: 0.9rem; color: #e7d8b4; }

        /* ---------- Reduced motion: a still, complete, instant page ---------- */
        @media (prefers-reduced-motion: reduce) {
            .scene-layer { transition: none; }
            .scene-layer.ken-burns img { animation: none; }
            .splash-word { opacity: 1; transform: none; filter: none; }
            /* Same specificity as the reveal rule above: the words must be
               there from the first paint, never animated in. */
            .stage.is-finale .splash-word { animation: none; opacity: 1; transform: none; filter: none; }
            #fxCanvas { display: none; }
        }
        /* ---------- No JavaScript: the finale composition, statically ---------- */
        .no-js .scene-layer { opacity: 1; }
        .no-js .splash-word { opacity: 1; transform: none; filter: none; }

        @media (max-width: 640px) {
            .content { padding-bottom: 9vh; }
            .splash-skip { top: 0.65rem; inset-inline-end: 0.65rem; padding: 0.55rem 1.05rem; font-size: 0.8rem; }
        }
    </style>
</head>
<body class="no-js">
    <a class="splash-skip" id="splashSkip" href="${Sanitize.escapeHtml(SPLASH_TARGET)}">${Sanitize.escapeHtml(sp.skip)} <span aria-hidden="true">→</span></a>
    <main class="stage" id="main-content" aria-label="${Sanitize.escapeHtml(sp.title)}">
        <div class="scene-stack" aria-hidden="true">
${SCENES.map(sceneLayer).join('\n')}
        </div>
        <canvas id="fxCanvas" aria-hidden="true"></canvas>
        <div class="vignette" aria-hidden="true"></div>
        <div class="content">
            <img src="/static/dueli-icon.png" alt="" class="splash-logo" width="112" height="112" decoding="async">
            <h1 class="splash-title">${Sanitize.escapeHtml(sp.title)}</h1>
            <p class="splash-phrase" aria-label="${Sanitize.escapeHtml(phraseText)}">${words}</p>
            <p class="splash-by">${Sanitize.escapeHtml(sp.by_maelsh_pro)}</p>
            <noscript><p class="splash-noscript">${Sanitize.escapeHtml(sp.redirect_failed)}</p></noscript>
        </div>
    </main>
    <script nonce="${nonce}">
    (function () {
        'use strict';
        document.body.classList.remove('no-js');

        var target = ${JSON.stringify(SPLASH_TARGET)};
        var stage = document.getElementById('main-content');
        var skip = document.getElementById('splashSkip');
        var canvas = document.getElementById('fxCanvas');
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        var layers = stage.querySelectorAll('.scene-layer');
        var timers = [];
        function after(ms, fn) { timers.push(window.setTimeout(fn, ms)); }
        function clearAll() { for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i]); timers.length = 0; }

        /* ---------- Reduced motion: still, complete, quick ---------- */
        if (reduced) {
            stage.classList.add('is-finale');
            layers[0].classList.remove('ken-burns');
            layers[2].classList.add('is-live');
            var tRed = window.setTimeout(function () { window.location.replace(target); }, 700);
            if (skip) skip.addEventListener('click', function () { window.clearTimeout(tRed); });
            return;
        }

        /* ---------- Camera dolly: crossfade + Ken Burns push-in ---------- */
        function dollyTo(index) {
            for (var i = 0; i < layers.length; i++) {
                layers[i].classList.toggle('is-live', i <= index);
            }
            var layer = layers[index];
            if (layer) {
                layer.classList.remove('ken-burns');
                // force reflow so the animation restarts on re-entry
                void layer.offsetWidth;
                layer.classList.add('ken-burns');
            }
        }
        after(2800, function () { dollyTo(1); });
        after(5600, function () {
            dollyTo(2);
            stage.classList.add('is-finale');   // words emerge, in sequence
        });

        /* ---------- Depth parallax (pointer), lerped ---------- */
        var pointer = { x: 0, y: 0 };
        var eased = { x: 0, y: 0 };
        var canHover = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (canHover) {
            window.addEventListener('pointermove', function (event) {
                pointer.x = (event.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
                pointer.y = (event.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
            }, { passive: true });
        }

        /* ---------- Canvas particles: sparks → stardust → nebula ---------- */
        var ctx = canvas && canvas.getContext('2d');
        var particles = [];
        var W = 0, H = 0, dpr = 1;
        var mode = 0; // 0 sparks, 1 stardust, 2 nebula
        function resize() {
            dpr = Math.min(2, window.devicePixelRatio || 1);
            W = canvas.clientWidth; H = canvas.clientHeight;
            canvas.width = Math.max(1, Math.round(W * dpr));
            canvas.height = Math.max(1, Math.round(H * dpr));
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        }
        function rand(a, b) { return a + Math.random() * (b - a); }
        function spawn(initial) {
            return {
                x: rand(0, W),
                y: initial ? rand(0, H) : rand(H * 0.55, H + 40),
                r: rand(0.6, mode === 2 ? 1.9 : 2.6),
                vy: rand(0.25, mode === 0 ? 1.15 : 0.7),
                vx: rand(-0.25, 0.25),
                phase: rand(0, Math.PI * 2),
                speed: rand(0.008, 0.02),
                hue: mode === 2 ? rand(255, 285) : rand(38, 48)
            };
        }
        function seed() {
            particles = [];
            var count = Math.round(Math.min(110, Math.max(55, (W * H) / 26000)));
            for (var i = 0; i < count; i++) particles.push(spawn(true));
        }
        function tick(now) {
            if (document.visibilityState === 'hidden') { frame = window.requestAnimationFrame(tick); return; }
            // depth parallax, eased
            eased.x += (pointer.x - eased.x) * 0.06;
            eased.y += (pointer.y - eased.y) * 0.06;
            for (var i = 0; i < layers.length; i++) {
                var depth = (i + 1) * 6; // nearer layers move less? farther layers lag
                layers[i].style.transform = 'translate3d(' + (-eased.x * depth) + 'px,' + (-eased.y * depth) + 'px,0)';
            }
            ctx.clearRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'lighter';
            for (var j = 0; j < particles.length; j++) {
                var p = particles[j];
                p.phase += p.speed * 16;
                p.y -= p.vy;
                p.x += p.vx + Math.sin(p.phase) * 0.15;
                if (p.y < -12 || p.x < -12 || p.x > W + 12) { particles[j] = spawn(false); continue; }
                var tw = 0.55 + 0.45 * Math.sin(p.phase * 2.2);
                var alpha = (mode === 2 ? 0.5 : 0.75) * tw;
                ctx.beginPath();
                ctx.fillStyle = 'hsla(' + p.hue + ', 92%, ' + (mode === 2 ? 78 : 68) + '%, ' + alpha + ')';
                ctx.shadowBlur = mode === 0 ? 12 : 7;
                ctx.shadowColor = mode === 2 ? 'rgba(216, 180, 254, 0.9)' : 'rgba(253, 224, 71, 0.9)';
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
            ctx.globalCompositeOperation = 'source-over';
            frame = window.requestAnimationFrame(tick);
        }
        var frame = 0;
        if (ctx && canvas) {
            resize();
            seed();
            window.addEventListener('resize', function () { resize(); seed(); }, { passive: true });
            frame = window.requestAnimationFrame(tick);
            after(2800, function () { mode = 1; seed(); });
            after(5600, function () { mode = 2; seed(); });
        }

        /* ---------- Timeline end: smooth exit to the platform ---------- */
        var REDIRECT_AT = 9400;
        var redirectTimer = window.setTimeout(function () { window.location.replace(target); }, REDIRECT_AT);
        if (skip) {
            skip.addEventListener('click', function () {
                window.clearTimeout(redirectTimer);
                clearAll();
                if (frame) window.cancelAnimationFrame(frame);
            });
        }
        document.addEventListener('visibilitychange', function () {
            if (document.visibilityState === 'hidden') { window.clearTimeout(redirectTimer); }
        });
    })();
    </script>
</body>
</html>`;

    return c.html(content);
}
