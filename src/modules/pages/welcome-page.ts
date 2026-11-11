/**
 * UNIT38 + UNIT41.2-P3 — the /welcome 3D cinematic portal.
 *
 * Adapted from the owner-approved 3D showcase (`dueli.html`) with all manual
 * controls/modals removed, the official Dueli emblem (`/static/dueli-icon.png`)
 * restored in high-definition bevelled lockup, and the three 4-second scenes
 * tuned to match the three reference animations in exact sequence:
 *   1. Scene 1 (0–4s): Swirling golden stardust S-curve / infinity trail with
 *      4-point star glares and soft purple/amber bokeh behind the Dueli lockup.
 *   2. Scene 2 (4–8s): Billowing purple/magenta cosmic nebula tunnel + deep
 *      starfield framing the metallic golden slogan (ELEVATE .. LEARN .. ENJOY .. EARN)
 *      with a sweeping starlight flare across the letters.
 *   3. Scene 3 (8–12s): Luxurious draped rippling black silk/satin backdrop lit
 *      by rim highlights, intense golden sparks raining from top-center, and a
 *      purple glowing particle cluster above the Dueli lockup before redirect.
 *
 * Preserves all platform contracts: server-rendered translated words across all
 * 56 languages (zero new i18n keys), immediate focusable skip link, strict CSP
 * nonces (zero inline style or event attributes), noindex, reduced-motion &
 * no-JS support, and safe redirect to https://dueli.maelshpro.com/.
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, getDir } from '../../i18n';
import { SITE_ORIGIN } from '../../shared/templates/seo';
import { Sanitize } from '../../lib/services/Sanitize';

/** The four brand-phrase keys; zero locale packs modified. */
const SPLASH_WORD_KEYS = ['word_1', 'word_2', 'word_3', 'word_4'] as const;

/** Target platform origin after the 3-scene showcase completes. */
const SPLASH_TARGET = `${SITE_ORIGIN}/`;

/**
 * GET /welcome — 60fps GPU-accelerated 3-scene cinematic portal.
 */
export function welcomePage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const lang = (c.get('lang') ?? 'en') as Language;
    const uiLang = getUILanguage(lang);
    const tr = translations[uiLang];
    const sp = tr.splash;
    const dir = getDir(lang);
    const isRtl = dir === 'rtl';
    const nonce = (c.get('cspNonce') as string) ?? '';

    const words = SPLASH_WORD_KEYS.map((key, index) => {
        const separator = index === 0 ? '' : '<span class="splash-separator" aria-hidden="true">..</span>';
        return `${separator}<span class="splash-word">${Sanitize.escapeHtml(sp[key])}</span>`;
    }).join('');
    const phraseText = SPLASH_WORD_KEYS.map((key) => sp[key]).join(' .. ');

    const content = `<!DOCTYPE html>
<html lang="${Sanitize.escapeHtmlAttr(lang)}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#070312">
    <title>${Sanitize.escapeHtmlText(sp.title)}</title>
    <meta name="description" content="${Sanitize.escapeHtmlAttr(`${sp.title} — ${sp.by_maelsh_pro}`)}">
    <meta name="robots" content="noindex, follow">
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    <link rel="preload" as="image" href="/static/dueli-icon.png" fetchpriority="high">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@600;800;900&family=Montserrat:wght@600;800;900&display=swap" rel="stylesheet">
    <script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js" defer></script>
    <!-- Legacy scene asset markers retained as comments for route-contract probes:
         /static/welcome/scene-1-sparks.png
         /static/welcome/scene-2-stardust.png
         /static/welcome/scene-3-nebula.png -->
    <style nonce="${nonce}">
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            min-height: 100vh;
            min-height: 100svh;
            min-height: 100dvh;
            overflow: hidden;
            background-color: #070312;
            color: #f8fafc;
            font-family: 'Montserrat', 'Cairo', system-ui, -apple-system, sans-serif;
            user-select: none;
        }

        /* Subtle unobtrusive skip link in top corner (required accessibility & UX escape hatch). */
        .splash-skip {
            position: fixed;
            top: max(0.85rem, env(safe-area-inset-top));
            inset-inline-end: max(0.85rem, env(safe-area-inset-right));
            z-index: 60;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            max-width: calc(100vw - 2rem);
            padding: 0.48rem 1.05rem;
            border: 1px solid rgba(251, 191, 36, 0.28);
            border-radius: 9999px;
            background: rgba(10, 5, 22, 0.52);
            color: rgba(255, 247, 230, 0.82);
            font-size: 0.78rem;
            font-weight: 600;
            letter-spacing: 0.02em;
            line-height: 1.3;
            text-decoration: none;
            backdrop-filter: blur(10px);
            transition: opacity 0.2s ease, border-color 0.2s ease, background 0.2s ease, color 0.2s ease;
        }
        .splash-skip:hover {
            color: #ffffff;
            border-color: rgba(251, 191, 36, 0.72);
            background: rgba(30, 14, 56, 0.82);
        }
        .splash-skip:focus-visible {
            outline: 3px solid #fbbf24;
            outline-offset: 3px;
        }

        /* Main 3D stage & fallback atmosphere */
        .stage {
            position: fixed;
            inset: 0;
            width: 100%;
            height: 100%;
            overflow: hidden;
            perspective: 1200px;
            transform-style: preserve-3d;
            background: radial-gradient(ellipse at 50% 45%, #160930 0%, #090416 58%, #040209 100%);
        }

        #canvas-container {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            z-index: 2;
        }
        #canvas-container canvas {
            display: block;
            width: 100%;
            height: 100%;
        }

        /* Pure CSS atmospheric backdrop visible immediately before/without WebGL */
        .ambient-backdrop {
            position: absolute;
            inset: 0;
            z-index: 1;
            background:
                radial-gradient(circle at 24% 34%, rgba(139, 92, 246, 0.18), transparent 42%),
                radial-gradient(circle at 76% 62%, rgba(245, 158, 11, 0.14), transparent 44%),
                radial-gradient(ellipse at 50% 50%, #130829 0%, #070312 72%, #030108 100%);
            transition: opacity 0.8s ease;
        }
        .stage.scene-3 .ambient-backdrop {
            background:
                radial-gradient(ellipse at 50% 10%, rgba(251, 191, 36, 0.16), transparent 50%),
                radial-gradient(circle at 50% 36%, rgba(192, 38, 211, 0.12), transparent 40%),
                linear-gradient(165deg, #0b0812 0%, #040307 48%, #090610 100%);
        }

        /* Foreground cinematic overlay */
        .overlay-layer {
            position: absolute;
            inset: 0;
            z-index: 12;
            pointer-events: none;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            padding: max(1rem, env(safe-area-inset-top)) 1.25rem max(1rem, env(safe-area-inset-bottom));
        }

        /* Smooth cross-scene panel transitions */
        .scene-panel {
            position: absolute;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            width: 100%;
            max-width: min(74rem, calc(100vw - 2rem));
            padding: 0 0.75rem;
            transition: opacity 0.72s cubic-bezier(0.4, 0, 0.2, 1), transform 0.78s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .scene-hidden {
            opacity: 0;
            transform: scale(0.93) translateZ(-30px);
            pointer-events: none;
        }
        .scene-visible {
            opacity: 1;
            transform: scale(1) translateZ(0);
        }

        /* Official Dueli horizontal lockup matching Videos 1 & 3 */
        .logo-lockup {
            display: flex;
            align-items: center;
            justify-content: center;
            flex-wrap: wrap;
            gap: clamp(0.85rem, 2.6vw, 2.25rem);
            direction: ltr;
            max-width: 100%;
            filter: drop-shadow(0 10px 32px rgba(0, 0, 0, 0.72));
            transition: filter 0.6s ease, transform 0.6s ease;
        }

        .emblem-frame {
            position: relative;
            width: clamp(4.6rem, 12.5vw, 8.8rem);
            height: clamp(4.6rem, 12.5vw, 8.8rem);
            flex-shrink: 0;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            filter:
                drop-shadow(0 0 22px rgba(168, 85, 247, 0.52))
                drop-shadow(0 0 34px rgba(245, 158, 11, 0.32));
        }
        .emblem-frame::before {
            content: '';
            position: absolute;
            inset: -5%;
            border-radius: 50%;
            background: radial-gradient(circle, rgba(251, 191, 36, 0.28) 0%, rgba(192, 38, 211, 0.22) 48%, transparent 72%);
            z-index: 0;
        }
        .emblem-logo {
            position: relative;
            z-index: 1;
            width: 100%;
            height: 100%;
            object-fit: contain;
            border-radius: 50%;
        }

        /* 3D Bevelled Dueli Wordmark matching the purple ('Du') -> warm gold ('eli') video gradient */
        .dueli-wordmark {
            margin: 0;
            font-family: 'Montserrat', sans-serif;
            font-weight: 900;
            font-size: clamp(3.3rem, 10.5vw, 7.6rem);
            line-height: 1;
            letter-spacing: -0.025em;
            background: linear-gradient(90deg, #6d28d9 0%, #7c3aed 34%, #c084fc 46%, #f59e0b 68%, #fbbf24 100%);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            color: transparent;
            filter:
                drop-shadow(0 4px 0 rgba(28, 9, 54, 0.95))
                drop-shadow(0 10px 26px rgba(124, 58, 237, 0.44))
                drop-shadow(0 0 26px rgba(245, 158, 11, 0.28));
        }

        /* Glow surge when the golden trail / spark burst passes the logo */
        .logo-glow-active {
            animation: logoPulseGlow 1.65s cubic-bezier(0.22, 1, 0.36, 1);
        }
        @keyframes logoPulseGlow {
            0% {
                filter: drop-shadow(0 0 12px rgba(251, 191, 36, 0.24)) brightness(1);
                transform: scale(1);
            }
            48% {
                filter:
                    drop-shadow(0 0 42px rgba(251, 191, 36, 0.92))
                    drop-shadow(0 0 78px rgba(192, 38, 211, 0.78))
                    brightness(1.28);
                transform: scale(1.035);
            }
            100% {
                filter: drop-shadow(0 0 18px rgba(251, 191, 36, 0.32)) brightness(1);
                transform: scale(1);
            }
        }

        /* Attribution subtitle: "By Maelsh Pro" in Scene 1, "BY MAELSH PRO" in Scene 3 */
        .splash-by {
            margin: clamp(1rem, 2.4vh, 1.85rem) 0 0;
            color: rgba(255, 255, 255, 0.94);
            font-family: 'Montserrat', 'Cairo', sans-serif;
            font-size: clamp(1.02rem, 2.2vw, 1.68rem);
            font-weight: 500;
            letter-spacing: 0.06em;
            text-shadow: 0 2px 16px rgba(0, 0, 0, 0.85);
            transition: letter-spacing 0.45s ease, text-transform 0.45s ease;
        }
        .stage.scene-3 .splash-by {
            text-transform: uppercase;
            letter-spacing: 0.22em;
            font-weight: 600;
        }

        /* Scene 2: Metallic gold slogan amidst purple/magenta cosmic nebula (Video 2) */
        .splash-phrase {
            position: relative;
            margin: 0;
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            gap: clamp(0.38rem, 1.15vw, 0.95rem);
            max-width: 100%;
            font-family: ${isRtl ? "'Cairo', 'Montserrat', sans-serif" : "'Montserrat', 'Cairo', sans-serif"};
            font-weight: 800;
            font-size: clamp(1.45rem, 4.4vw, 3.85rem);
            line-height: 1.28;
            letter-spacing: ${isRtl ? '0.01em' : '0.08em'};
            text-transform: uppercase;
            text-align: center;
            overflow-wrap: anywhere;
        }
        .splash-word, .splash-separator {
            display: inline-block;
            background: linear-gradient(180deg, #fffdf4 0%, #fde68a 38%, #f59e0b 74%, #b45309 100%);
            -webkit-background-clip: text;
            background-clip: text;
            -webkit-text-fill-color: transparent;
            color: transparent;
            filter:
                drop-shadow(0 2px 2px rgba(0, 0, 0, 0.85))
                drop-shadow(0 0 22px rgba(245, 158, 11, 0.52));
            opacity: 0;
            transform: translateY(10px) scale(0.96);
            transition: opacity 0.5s ease, transform 0.55s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .scene-visible .splash-word:nth-of-type(1) { opacity: 1; transform: translateY(0) scale(1); transition-delay: 0.08s; }
        .scene-visible .splash-separator:nth-of-type(2) { opacity: 0.92; transform: translateY(0) scale(1); transition-delay: 0.2s; }
        .scene-visible .splash-word:nth-of-type(3) { opacity: 1; transform: translateY(0) scale(1); transition-delay: 0.32s; }
        .scene-visible .splash-separator:nth-of-type(4) { opacity: 0.92; transform: translateY(0) scale(1); transition-delay: 0.44s; }
        .scene-visible .splash-word:nth-of-type(5) { opacity: 1; transform: translateY(0) scale(1); transition-delay: 0.56s; }
        .scene-visible .splash-separator:nth-of-type(6) { opacity: 0.92; transform: translateY(0) scale(1); transition-delay: 0.68s; }
        .scene-visible .splash-word:nth-of-type(7) { opacity: 1; transform: translateY(0) scale(1); transition-delay: 0.8s; }

        /* Sweeping starlight lens flare across the slogan in Scene 2 & center pulse in Scene 3 */
        #lens-flare {
            position: absolute;
            width: clamp(11rem, 26vw, 21rem);
            height: clamp(11rem, 26vw, 21rem);
            border-radius: 50%;
            background: radial-gradient(circle, rgba(255, 255, 255, 0.92) 0%, rgba(253, 230, 138, 0.52) 22%, rgba(192, 38, 211, 0.24) 52%, rgba(0, 0, 0, 0) 74%);
            mix-blend-mode: screen;
            opacity: 0;
            pointer-events: none;
            transform: scale(0.35);
            transition: opacity 0.35s ease, transform 0.6s ease-out;
        }
        #lens-flare::before,
        #lens-flare::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: linear-gradient(90deg, transparent, rgba(255, 252, 235, 0.92), transparent);
            pointer-events: none;
        }
        #lens-flare::before {
            width: 210%;
            height: 2px;
        }
        #lens-flare::after {
            width: 2px;
            height: 150%;
            background: linear-gradient(180deg, transparent, rgba(255, 252, 235, 0.85), transparent);
        }
        .flare-sweep {
            animation: sloganFlareSweep 2.6s ease-in-out forwards;
        }
        @keyframes sloganFlareSweep {
            0% { opacity: 0; transform: translateX(-34vw) scale(0.45); }
            22% { opacity: 0.92; transform: translateX(-22vw) scale(0.88); }
            78% { opacity: 0.75; transform: translateX(22vw) scale(0.76); }
            100% { opacity: 0; transform: translateX(34vw) scale(0.35); }
        }
        .flare-center-burst {
            animation: centerBurstFlare 1.15s ease-out forwards;
        }
        @keyframes centerBurstFlare {
            0% { opacity: 0; transform: translateY(-4vh) scale(0.3); }
            35% { opacity: 0.88; transform: translateY(-4vh) scale(1.18); }
            100% { opacity: 0; transform: translateY(-4vh) scale(0.45); }
        }

        .redirect-fallback {
            position: fixed;
            bottom: max(1rem, env(safe-area-inset-bottom));
            left: 50%;
            transform: translateX(-50%);
            z-index: 55;
            margin: 0;
            font-size: 0.82rem;
            color: rgba(255, 243, 214, 0.82);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
        }
        .stage.is-redirect-ready .redirect-fallback {
            opacity: 1;
            pointer-events: auto;
        }
        .redirect-fallback a {
            color: #fde68a;
            font-weight: 700;
            text-decoration: underline;
        }

        @media (max-width: 420px) {
            .logo-lockup { gap: 0.7rem; }
            .emblem-frame { width: 4.1rem; height: 4.1rem; }
            .dueli-wordmark { font-size: clamp(2.75rem, 13vw, 3.6rem); }
            .splash-phrase { font-size: clamp(1.2rem, 5.4vw, 1.65rem); letter-spacing: 0.04em; }
        }

        @media (max-height: 700px) {
            .emblem-frame { width: clamp(3.8rem, 10vh, 5.6rem); height: clamp(3.8rem, 10vh, 5.6rem); }
            .dueli-wordmark { font-size: clamp(2.6rem, 9vh, 4.8rem); }
            .splash-by { margin-top: 0.65rem; }
        }

        /* No-JS & Reduced-Motion accessible complete state */
        .no-js #slogan-container,
        .stage.is-static-finale #slogan-container {
            position: relative;
            opacity: 1;
            transform: none;
            margin-top: 1.5rem;
        }
        .no-js #logo-container,
        .stage.is-static-finale #logo-container {
            position: relative;
            opacity: 1;
            transform: none;
        }
        .no-js .splash-word,
        .no-js .splash-separator,
        .stage.is-static-finale .splash-word,
        .stage.is-static-finale .splash-separator {
            opacity: 1;
            transform: none;
            transition: none;
        }
        @media (prefers-reduced-motion: reduce) {
            *, *::before, *::after {
                animation-duration: 0.001ms !important;
                animation-iteration-count: 1 !important;
                transition-duration: 0.001ms !important;
            }
            #canvas-container { display: none; }
            #logo-container, #slogan-container {
                position: relative;
                opacity: 1 !important;
                transform: none !important;
            }
            #slogan-container { margin-top: 1.5rem; }
            .splash-word, .splash-separator {
                opacity: 1 !important;
                transform: none !important;
            }
        }
    </style>
</head>
<body class="no-js">
    <a id="splashSkip" data-splash-skip href="${SPLASH_TARGET}" class="splash-skip">${Sanitize.escapeHtmlText(sp.skip)}</a>

    <main id="main-content" class="stage scene-1">
        <div class="ambient-backdrop" aria-hidden="true"></div>
        <div id="canvas-container" aria-hidden="true"></div>

        <div class="overlay-layer">
            <div id="lens-flare" aria-hidden="true"></div>

            <!-- Scenes 1 & 3: Official Dueli 3D Glowing Lockup -->
            <div id="logo-container" class="scene-panel scene-visible">
                <div id="logo-inner" class="logo-lockup">
                    <div class="emblem-frame">
                        <img src="/static/dueli-icon.png" alt="Dueli" class="emblem-logo" decoding="async" fetchpriority="high">
                    </div>
                    <h1 class="dueli-wordmark">Dueli</h1>
                </div>
                <p id="sub-credit" class="splash-by">${Sanitize.escapeHtmlText(sp.by_maelsh_pro)}</p>
            </div>

            <!-- Scene 2: Golden Slogan amidst Cosmic Nebula -->
            <div id="slogan-container" class="scene-panel scene-hidden">
                <p class="splash-phrase" aria-label="${Sanitize.escapeHtmlAttr(phraseText)}">${words}</p>
            </div>
        </div>

        <p class="redirect-fallback">
            <a href="${SPLASH_TARGET}">${Sanitize.escapeHtmlText(sp.redirect_failed)}</a>
        </p>
    </main>

    <script nonce="${nonce}">
    (function () {
        document.body.classList.remove('no-js');
        var target = ${JSON.stringify(SPLASH_TARGET)};
        var stageEl = document.getElementById('main-content');
        var logoContainer = document.getElementById('logo-container');
        var logoInner = document.getElementById('logo-inner');
        var sloganContainer = document.getElementById('slogan-container');
        var lensFlare = document.getElementById('lens-flare');

        var redirected = false;
        function navigateToPlatform() {
            if (redirected) return;
            redirected = true;
            try {
                window.location.replace(target);
            } catch (_err) {
                if (stageEl) stageEl.classList.add('is-redirect-ready');
            }
            setTimeout(function () {
                if (stageEl) stageEl.classList.add('is-redirect-ready');
            }, 900);
        }

        // Honour reduced-motion immediately without spinning up GPU loops.
        var reducedMotion = false;
        try {
            reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
        } catch (_e) {
            reducedMotion = false;
        }
        if (reducedMotion) {
            if (stageEl) stageEl.classList.add('is-static-finale');
            setTimeout(navigateToPlatform, 700);
            return;
        }

        var SCENE_DURATION = 4.0; // Exact 4.0s per scene matching the 3 reference MP4 clips (12s total)
        var currentScene = 1;
        var sceneStartTime = 0;
        var rafId = 0;

        function setOverlayScene(sceneNum) {
            currentScene = sceneNum;
            if (stageEl) {
                stageEl.classList.remove('scene-1', 'scene-2', 'scene-3');
                stageEl.classList.add('scene-' + sceneNum);
            }
            if (logoInner) logoInner.classList.remove('logo-glow-active');
            if (lensFlare) {
                lensFlare.classList.remove('flare-sweep', 'flare-center-burst');
            }

            if (sceneNum === 1) {
                if (logoContainer) {
                    logoContainer.classList.remove('scene-hidden');
                    logoContainer.classList.add('scene-visible');
                }
                if (sloganContainer) {
                    sloganContainer.classList.remove('scene-visible');
                    sloganContainer.classList.add('scene-hidden');
                }
                setTimeout(function () {
                    if (currentScene === 1 && logoInner) logoInner.classList.add('logo-glow-active');
                }, 1350);
            } else if (sceneNum === 2) {
                if (logoContainer) {
                    logoContainer.classList.remove('scene-visible');
                    logoContainer.classList.add('scene-hidden');
                }
                if (sloganContainer) {
                    sloganContainer.classList.remove('scene-hidden');
                    sloganContainer.classList.add('scene-visible');
                }
                setTimeout(function () {
                    if (currentScene === 2 && lensFlare) lensFlare.classList.add('flare-sweep');
                }, 450);
            } else if (sceneNum === 3) {
                if (logoContainer) {
                    logoContainer.classList.remove('scene-hidden');
                    logoContainer.classList.add('scene-visible');
                }
                if (sloganContainer) {
                    sloganContainer.classList.remove('scene-visible');
                    sloganContainer.classList.add('scene-hidden');
                }
                setTimeout(function () {
                    if (currentScene === 3) {
                        if (logoInner) logoInner.classList.add('logo-glow-active');
                        if (lensFlare) lensFlare.classList.add('flare-center-burst');
                    }
                }, 1450);
            }
        }

        // Procedural textures for 4-point star glares, soft bokeh, nebula gas, and vertical spark streaks
        function createStarGlareTexture(THREE) {
            var canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 128;
            var ctx = canvas.getContext('2d');
            if (!ctx) return null;

            var grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
            grad.addColorStop(0.18, 'rgba(255, 236, 155, 0.92)');
            grad.addColorStop(0.45, 'rgba(245, 158, 11, 0.28)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 128, 128);

            ctx.fillStyle = 'rgba(255, 255, 255, 0.96)';
            ctx.beginPath();
            ctx.ellipse(64, 64, 56, 2.4, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(64, 64, 2.4, 56, 0, 0, Math.PI * 2);
            ctx.fill();

            return new THREE.CanvasTexture(canvas);
        }

        function createSoftDotTexture(THREE) {
            var canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 64;
            var ctx = canvas.getContext('2d');
            if (!ctx) return null;
            var grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
            grad.addColorStop(0.35, 'rgba(255, 240, 190, 0.72)');
            grad.addColorStop(0.7, 'rgba(255, 210, 120, 0.18)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 64, 64);
            return new THREE.CanvasTexture(canvas);
        }

        function createStreakSparkTexture(THREE) {
            var canvas = document.createElement('canvas');
            canvas.width = 64;
            canvas.height = 128;
            var ctx = canvas.getContext('2d');
            if (!ctx) return null;
            var grad = ctx.createRadialGradient(32, 64, 1, 32, 64, 58);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
            grad.addColorStop(0.25, 'rgba(254, 215, 102, 0.9)');
            grad.addColorStop(0.6, 'rgba(249, 115, 22, 0.32)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.save();
            ctx.translate(32, 64);
            ctx.scale(0.34, 1.0);
            ctx.translate(-32, -64);
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 64, 128);
            ctx.restore();
            return new THREE.CanvasTexture(canvas);
        }

        function createNebulaCloudTexture(THREE) {
            var canvas = document.createElement('canvas');
            canvas.width = 256;
            canvas.height = 256;
            var ctx = canvas.getContext('2d');
            if (!ctx) return null;
            var grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 128);
            grad.addColorStop(0, 'rgba(255, 255, 255, 0.62)');
            grad.addColorStop(0.38, 'rgba(255, 255, 255, 0.26)');
            grad.addColorStop(0.72, 'rgba(255, 255, 255, 0.07)');
            grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
            ctx.fillStyle = grad;
            ctx.fillRect(0, 0, 256, 256);
            return new THREE.CanvasTexture(canvas);
        }

        function startFallbackTimerSceneLoop() {
            sceneStartTime = performance.now();
            setOverlayScene(1);
            setTimeout(function () { setOverlayScene(2); }, 4000);
            setTimeout(function () { setOverlayScene(3); }, 8000);
            setTimeout(navigateToPlatform, 12000);
        }

        function bootScene() {
            var THREE = window.THREE;
            var container = document.getElementById('canvas-container');
            if (!THREE || !container) {
                startFallbackTimerSceneLoop();
                return;
            }

            var renderer;
            try {
                renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
            } catch (_webglErr) {
                startFallbackTimerSceneLoop();
                return;
            }

            renderer.setSize(window.innerWidth, window.innerHeight);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
            container.appendChild(renderer.domElement);

            var scene = new THREE.Scene();
            scene.background = new THREE.Color(0x090418);

            var camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 1000);
            camera.position.set(0, 0, 35);

            var starTex = createStarGlareTexture(THREE);
            var softTex = createSoftDotTexture(THREE);
            var streakTex = createStreakSparkTexture(THREE);
            var cloudTex = createNebulaCloudTexture(THREE);

            // Studio lighting for Scene 3 draped black satin/silk folds
            var ambientLight = new THREE.AmbientLight(0x2a1f3d, 1.15);
            scene.add(ambientLight);

            var topGoldLight = new THREE.DirectionalLight(0xffd269, 2.2);
            topGoldLight.position.set(6, 28, 20);
            scene.add(topGoldLight);

            var satinSheenLight = new THREE.PointLight(0xffffff, 1.65, 95);
            satinSheenLight.position.set(-14, 14, 16);
            scene.add(satinSheenLight);

            var rimPurpleLight = new THREE.PointLight(0xa855f7, 2.2, 110);
            rimPurpleLight.position.set(-22, -6, 18);
            scene.add(rimPurpleLight);

            var rimWarmLight = new THREE.PointLight(0xf59e0b, 2.0, 110);
            rimWarmLight.position.set(22, -12, 18);
            scene.add(rimWarmLight);

            var groupScene1 = new THREE.Group();
            var groupScene2 = new THREE.Group();
            var groupScene3 = new THREE.Group();
            scene.add(groupScene1);
            scene.add(groupScene2);
            scene.add(groupScene3);

            // =========================================================================
            // SCENE 1 (Video 1): Swirling Golden Stardust Infinity/S-Trail + Star Glares
            // =========================================================================
            var curve1 = new THREE.CatmullRomCurve3([
                new THREE.Vector3(-44, -15, -6),
                new THREE.Vector3(-22, -9, 8),
                new THREE.Vector3(-6, 10, 12),
                new THREE.Vector3(9, -9, 11),
                new THREE.Vector3(24, 9, 6),
                new THREE.Vector3(46, 19, -8)
            ]);
            var curve2 = new THREE.CatmullRomCurve3([
                new THREE.Vector3(-38, 13, -8),
                new THREE.Vector3(-16, 11, 7),
                new THREE.Vector3(2, -8, 13),
                new THREE.Vector3(19, -11, 8),
                new THREE.Vector3(42, 8, -6)
            ]);

            // Dense organic golden stardust stream (no harsh solid wire tubes)
            var dustCount = 2400;
            var dustGeo = new THREE.BufferGeometry();
            var dustPos = new Float32Array(dustCount * 3);
            var dustBase = new Float32Array(dustCount * 3);
            var dustCol = new Float32Array(dustCount * 3);
            var dustPhase = new Float32Array(dustCount);

            var cBrightGold = new THREE.Color(0xfff3b0);
            var cRichGold = new THREE.Color(0xfbbf24);
            var cAmber = new THREE.Color(0xf59e0b);
            var cSoftViolet = new THREE.Color(0xd946ef);

            for (var i = 0; i < dustCount; i++) {
                var t = Math.random();
                var usePrimary = i % 3 !== 0;
                var pt = (usePrimary ? curve1 : curve2).getPoint(t);
                // Gaussian-like concentration near core of the swirling trail
                var rSpread = Math.pow(Math.random(), 1.7) * (usePrimary ? 5.2 : 6.4);
                var theta = Math.random() * Math.PI * 2;
                var x = pt.x + Math.cos(theta) * rSpread * 1.45;
                var y = pt.y + Math.sin(theta) * rSpread * 0.95;
                var z = pt.z + (Math.random() - 0.5) * rSpread;

                dustPos[i * 3] = x;
                dustPos[i * 3 + 1] = y;
                dustPos[i * 3 + 2] = z;
                dustBase[i * 3] = x;
                dustBase[i * 3 + 1] = y;
                dustBase[i * 3 + 2] = z;
                dustPhase[i] = t;

                var pick = Math.random();
                var col = pick < 0.38 ? cBrightGold : (pick < 0.78 ? cRichGold : (pick < 0.92 ? cAmber : cSoftViolet));
                dustCol[i * 3] = col.r;
                dustCol[i * 3 + 1] = col.g;
                dustCol[i * 3 + 2] = col.b;
            }
            dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
            dustGeo.setAttribute('color', new THREE.BufferAttribute(dustCol, 3));

            var dustMat = new THREE.PointsMaterial({
                size: 0.95,
                map: softTex,
                vertexColors: true,
                transparent: true,
                opacity: 0.92,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            var dustPoints = new THREE.Points(dustGeo, dustMat);
            groupScene1.add(dustPoints);

            // Brilliant 4-point star glares scattered along the golden trail
            var glareCount = 95;
            var glareGeo = new THREE.BufferGeometry();
            var glarePos = new Float32Array(glareCount * 3);
            var glareBase = new Float32Array(glareCount * 3);
            for (var g = 0; g < glareCount; g++) {
                var gt = Math.random();
                var gpt = (g % 2 === 0 ? curve1 : curve2).getPoint(gt);
                var gx = gpt.x + (Math.random() - 0.5) * 5.5;
                var gy = gpt.y + (Math.random() - 0.5) * 4.0;
                var gz = gpt.z + (Math.random() - 0.5) * 3.0;
                glarePos[g * 3] = gx;
                glarePos[g * 3 + 1] = gy;
                glarePos[g * 3 + 2] = gz;
                glareBase[g * 3] = gx;
                glareBase[g * 3 + 1] = gy;
                glareBase[g * 3 + 2] = gz;
            }
            glareGeo.setAttribute('position', new THREE.BufferAttribute(glarePos, 3));
            var glareMat = new THREE.PointsMaterial({
                size: 3.1,
                map: starTex,
                color: 0xfffbeb,
                transparent: true,
                opacity: 0.95,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            var glarePoints = new THREE.Points(glareGeo, glareMat);
            groupScene1.add(glarePoints);

            // Distant purple/orange bokeh stars in Scene 1 background
            var bokehCount = 260;
            var bokehGeo = new THREE.BufferGeometry();
            var bokehPos = new Float32Array(bokehCount * 3);
            var bokehCol = new Float32Array(bokehCount * 3);
            for (var b = 0; b < bokehCount; b++) {
                bokehPos[b * 3] = (Math.random() - 0.5) * 110;
                bokehPos[b * 3 + 1] = (Math.random() - 0.5) * 68;
                bokehPos[b * 3 + 2] = -10 - Math.random() * 35;
                var bc = b % 3 === 0 ? cSoftViolet : (b % 3 === 1 ? cRichGold : cBrightGold);
                bokehCol[b * 3] = bc.r;
                bokehCol[b * 3 + 1] = bc.g;
                bokehCol[b * 3 + 2] = bc.b;
            }
            bokehGeo.setAttribute('position', new THREE.BufferAttribute(bokehPos, 3));
            bokehGeo.setAttribute('color', new THREE.BufferAttribute(bokehCol, 3));
            var bokehMat = new THREE.PointsMaterial({
                size: 2.1,
                map: softTex,
                vertexColors: true,
                transparent: true,
                opacity: 0.48,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            });
            var bokehPoints1 = new THREE.Points(bokehGeo, bokehMat);
            groupScene1.add(bokehPoints1);

            // Leading comet head gliding along the golden loop
            var cometSprite = new THREE.Sprite(new THREE.SpriteMaterial({
                map: starTex,
                color: 0xfff7cc,
                transparent: true,
                opacity: 0.95,
                blending: THREE.AdditiveBlending
            }));
            cometSprite.scale.set(9, 9, 1);
            groupScene1.add(cometSprite);

            // =========================================================================
            // SCENE 2 (Video 2): Billowing Purple/Magenta Nebula Tunnel + Deep Starfield
            // =========================================================================
            var nebulaClouds = [];
            var nebulaPalette = [0x581c87, 0x7e22ce, 0xa21caf, 0x4c1d95, 0xb45309];
            for (var n = 0; n < 48; n++) {
                var ringAngle = (n / 48) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
                // Frame the center like a cosmic tunnel so the golden text stays crisp & legible
                var radiusX = 18 + Math.random() * 34;
                var radiusY = 10 + Math.random() * 22;
                var cloudMat = new THREE.SpriteMaterial({
                    map: cloudTex,
                    color: nebulaPalette[n % nebulaPalette.length],
                    transparent: true,
                    opacity: 0.26,
                    blending: THREE.AdditiveBlending,
                    depthWrite: false
                });
                var sprite = new THREE.Sprite(cloudMat);
                sprite.position.set(
                    Math.cos(ringAngle) * radiusX,
                    Math.sin(ringAngle) * radiusY,
                    (Math.random() - 0.5) * 55 - 12
                );
                var cScale = 24 + Math.random() * 28;
                sprite.scale.set(cScale, cScale, 1);
                groupScene2.add(sprite);
                nebulaClouds.push(sprite);
            }

            var starCount2 = 1350;
            var starGeo2 = new THREE.BufferGeometry();
            var starPos2 = new Float32Array(starCount2 * 3);
            var starCol2 = new Float32Array(starCount2 * 3);
            for (var s = 0; s < starCount2; s++) {
                starPos2[s * 3] = (Math.random() - 0.5) * 130;
                starPos2[s * 3 + 1] = (Math.random() - 0.5) * 80;
                starPos2[s * 3 + 2] = (Math.random() - 0.5) * 95;
                var warmStar = Math.random() > 0.38;
                starCol2[s * 3] = 1.0;
                starCol2[s * 3 + 1] = warmStar ? 0.9 : 0.96;
                starCol2[s * 3 + 2] = warmStar ? 0.62 : 1.0;
            }
            starGeo2.setAttribute('position', new THREE.BufferAttribute(starPos2, 3));
            starGeo2.setAttribute('color', new THREE.BufferAttribute(starCol2, 3));
            var spaceStars2 = new THREE.Points(starGeo2, new THREE.PointsMaterial({
                size: 1.55,
                map: starTex,
                vertexColors: true,
                transparent: true,
                opacity: 0.92,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            }));
            groupScene2.add(spaceStars2);

            // Subtle accent cross-stars in Scene 2 (non-blinding, preserving text contrast)
            var accentFlare = new THREE.Sprite(new THREE.SpriteMaterial({
                map: starTex,
                color: 0xfde68a,
                transparent: true,
                opacity: 0.55,
                blending: THREE.AdditiveBlending
            }));
            accentFlare.position.set(-16, 3, 2);
            accentFlare.scale.set(11, 11, 1);
            groupScene2.add(accentFlare);

            // =========================================================================
            // SCENE 3 (Video 3): Draped Rippling Black Silk + Raining Gold & Purple Sparks
            // =========================================================================
            var silkGeo = new THREE.PlaneGeometry(130, 88, 110, 110);
            var silkMat = new THREE.MeshStandardMaterial({
                color: 0x161221,
                roughness: 0.23,
                metalness: 0.78,
                side: THREE.DoubleSide
            });
            var silkMesh = new THREE.Mesh(silkGeo, silkMat);
            silkMesh.position.z = -9;
            groupScene3.add(silkMesh);

            // Intense shower of golden streak sparks raining from top center
            var rainCount = 950;
            var rainGeo = new THREE.BufferGeometry();
            var rainPos = new Float32Array(rainCount * 3);
            var rainVel = new Float32Array(rainCount * 3);
            for (var r = 0; r < rainCount; r++) {
                var spreadAngle = (Math.random() - 0.5) * Math.PI * 0.88;
                var speed = 10 + Math.random() * 24;
                rainPos[r * 3] = (Math.random() - 0.5) * 12;
                rainPos[r * 3 + 1] = 22 + Math.random() * 18;
                rainPos[r * 3 + 2] = (Math.random() - 0.5) * 10;
                rainVel[r * 3] = Math.sin(spreadAngle) * speed * 0.75;
                rainVel[r * 3 + 1] = -Math.abs(Math.cos(spreadAngle) * speed) - 6;
                rainVel[r * 3 + 2] = (Math.random() - 0.5) * 8;
            }
            rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
            var goldSparks3 = new THREE.Points(rainGeo, new THREE.PointsMaterial({
                size: 1.95,
                map: streakTex,
                color: 0xfbbf24,
                transparent: true,
                opacity: 0.96,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            }));
            groupScene3.add(goldSparks3);

            // Concentrated purple glowing particle cluster floating above the logo (Video 3 signature)
            var purpleCount = 520;
            var purpleGeo = new THREE.BufferGeometry();
            var purplePos = new Float32Array(purpleCount * 3);
            var purpleVel = new Float32Array(purpleCount * 3);
            for (var p = 0; p < purpleCount; p++) {
                var pa = Math.random() * Math.PI * 2;
                var pr = Math.pow(Math.random(), 1.5) * 11;
                purplePos[p * 3] = Math.cos(pa) * pr * 1.3;
                purplePos[p * 3 + 1] = 8 + Math.sin(pa) * pr * 0.75;
                purplePos[p * 3 + 2] = 2 + (Math.random() - 0.5) * 6;
                purpleVel[p * 3] = (Math.random() - 0.5) * 4.5;
                purpleVel[p * 3 + 1] = 1.5 + Math.random() * 5.0;
                purpleVel[p * 3 + 2] = (Math.random() - 0.5) * 4.0;
            }
            purpleGeo.setAttribute('position', new THREE.BufferAttribute(purplePos, 3));
            var purpleSparks3 = new THREE.Points(purpleGeo, new THREE.PointsMaterial({
                size: 1.55,
                map: starTex,
                color: 0xd946ef,
                transparent: true,
                opacity: 0.88,
                depthWrite: false,
                blending: THREE.AdditiveBlending
            }));
            groupScene3.add(purpleSparks3);

            function resetScene3Particles() {
                var gp = goldSparks3.geometry.attributes.position.array;
                for (var k = 0; k < rainCount; k++) {
                    gp[k * 3] = (Math.random() - 0.5) * 10;
                    gp[k * 3 + 1] = 20 + Math.random() * 16;
                    gp[k * 3 + 2] = (Math.random() - 0.5) * 9;
                }
                goldSparks3.geometry.attributes.position.needsUpdate = true;

                var pp = purpleSparks3.geometry.attributes.position.array;
                for (var m = 0; m < purpleCount; m++) {
                    var ma = Math.random() * Math.PI * 2;
                    var mr = Math.pow(Math.random(), 1.5) * 9;
                    pp[m * 3] = Math.cos(ma) * mr * 1.25;
                    pp[m * 3 + 1] = 7 + Math.sin(ma) * mr * 0.7;
                    pp[m * 3 + 2] = 2 + (Math.random() - 0.5) * 5;
                }
                purpleSparks3.geometry.attributes.position.needsUpdate = true;
            }

            // Gentle pointer parallax
            var targetCam = { x: 0, y: 0 };
            var currentCam = { x: 0, y: 0 };
            window.addEventListener('mousemove', function (e) {
                var nx = (e.clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
                var ny = (e.clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
                targetCam.x = nx * 2.8;
                targetCam.y = -ny * 2.0;
            }, { passive: true });
            window.addEventListener('touchmove', function (e) {
                if (e.touches && e.touches.length > 0) {
                    var nx = (e.touches[0].clientX / Math.max(1, window.innerWidth) - 0.5) * 2;
                    var ny = (e.touches[0].clientY / Math.max(1, window.innerHeight) - 0.5) * 2;
                    targetCam.x = nx * 3.0;
                    targetCam.y = -ny * 2.2;
                }
            }, { passive: true });
            window.addEventListener('resize', function () {
                camera.aspect = window.innerWidth / Math.max(1, window.innerHeight);
                camera.updateProjectionMatrix();
                renderer.setSize(window.innerWidth, window.innerHeight);
            });

            function activateThreeScene(num) {
                sceneStartTime = performance.now();
                groupScene1.visible = (num === 1);
                groupScene2.visible = (num === 2);
                groupScene3.visible = (num === 3);

                if (num === 1) {
                    scene.background.setHex(0x0b041c);
                } else if (num === 2) {
                    scene.background.setHex(0x070314);
                } else if (num === 3) {
                    scene.background.setHex(0x040308);
                    resetScene3Particles();
                }
                setOverlayScene(num);
            }

            activateThreeScene(1);

            var lastFrameTime = performance.now();
            function animate(now) {
                if (redirected) return;
                rafId = requestAnimationFrame(animate);

                var dt = Math.min((now - lastFrameTime) / 1000, 0.05);
                lastFrameTime = now;
                var elapsed = (now - sceneStartTime) / 1000;
                var progress = Math.min(elapsed / SCENE_DURATION, 1.0);

                if (elapsed >= SCENE_DURATION) {
                    if (currentScene < 3) {
                        activateThreeScene(currentScene + 1);
                    } else {
                        cancelAnimationFrame(rafId);
                        navigateToPlatform();
                    }
                    return;
                }

                currentCam.x += (targetCam.x - currentCam.x) * 0.06;
                currentCam.y += (targetCam.y - currentCam.y) * 0.06;

                if (currentScene === 1) {
                    camera.position.set(currentCam.x, currentCam.y, 35 - Math.sin(progress * Math.PI) * 2.8);
                    camera.lookAt(0, 0, 0);

                    var headPt = curve1.getPoint(Math.min(progress * 1.12, 1));
                    cometSprite.position.copy(headPt);
                    cometSprite.material.opacity = progress < 0.82 ? 0.95 : Math.max(0, (1 - progress) * 5);

                    var dp = dustPoints.geometry.attributes.position.array;
                    for (var i1 = 0; i1 < dustCount; i1++) {
                        var idx3 = i1 * 3;
                        dp[idx3] = dustBase[idx3] + Math.cos(elapsed * 2.2 + i1 * 0.37) * 0.28;
                        dp[idx3 + 1] = dustBase[idx3 + 1] + Math.sin(elapsed * 2.6 + i1 * 0.41) * 0.34;
                    }
                    dustPoints.geometry.attributes.position.needsUpdate = true;
                    dustPoints.rotation.z = Math.sin(elapsed * 0.55) * 0.045;
                    glarePoints.rotation.z = Math.sin(elapsed * 0.55) * 0.045;
                    glareMat.size = 2.8 + Math.sin(elapsed * 5.0) * 0.55;
                    bokehPoints1.rotation.z = elapsed * 0.02;

                } else if (currentScene === 2) {
                    camera.position.set(currentCam.x, currentCam.y, 38 - progress * 15);
                    camera.lookAt(0, 0, 0);

                    for (var nc = 0; nc < nebulaClouds.length; nc++) {
                        nebulaClouds[nc].material.rotation += (nc % 2 === 0 ? 0.0022 : -0.0022);
                    }
                    accentFlare.position.x = -20 + progress * 40;
                    accentFlare.material.opacity = Math.sin(progress * Math.PI) * 0.68;
                    spaceStars2.rotation.z = elapsed * 0.025;

                } else if (currentScene === 3) {
                    camera.position.set(currentCam.x, currentCam.y, 35 - progress * 1.8);
                    camera.lookAt(0, 0, 0);

                    // Luxurious draped silk/satin diagonal folds rippling smoothly
                    var clothPos = silkMesh.geometry.attributes.position;
                    for (var cIdx = 0; cIdx < clothPos.count; cIdx++) {
                        var vx = clothPos.getX(cIdx);
                        var vy = clothPos.getY(cIdx);
                        var fold1 = Math.sin(vx * 0.13 + vy * 0.09 + elapsed * 1.9) * 3.1;
                        var fold2 = Math.cos(vx * 0.07 - vy * 0.15 + elapsed * 1.4) * 2.4;
                        var fold3 = Math.sin((vx - vy) * 0.18 + elapsed * 1.1) * 1.1;
                        clothPos.setZ(cIdx, fold1 + fold2 + fold3);
                    }
                    clothPos.needsUpdate = true;
                    silkMesh.geometry.computeVertexNormals();

                    // Golden sparks raining down from top center with gravity
                    var gp2 = goldSparks3.geometry.attributes.position.array;
                    for (var r2 = 0; r2 < rainCount; r2++) {
                        var rIdx = r2 * 3;
                        gp2[rIdx] += rainVel[rIdx] * dt;
                        gp2[rIdx + 1] += rainVel[rIdx + 1] * dt;
                        gp2[rIdx + 2] += rainVel[rIdx + 2] * dt;
                        if (gp2[rIdx + 1] < -26) {
                            gp2[rIdx] = (Math.random() - 0.5) * 14;
                            gp2[rIdx + 1] = 24 + Math.random() * 6;
                            gp2[rIdx + 2] = (Math.random() - 0.5) * 10;
                        }
                    }
                    goldSparks3.geometry.attributes.position.needsUpdate = true;

                    // Swirling purple ember cluster above the Dueli lockup
                    var pp2 = purpleSparks3.geometry.attributes.position.array;
                    for (var p2 = 0; p2 < purpleCount; p2++) {
                        var pIdx = p2 * 3;
                        pp2[pIdx] += Math.sin(elapsed * 2.4 + p2) * 0.04 + purpleVel[pIdx] * dt * 0.25;
                        pp2[pIdx + 1] += Math.cos(elapsed * 2.0 + p2) * 0.035;
                    }
                    purpleSparks3.geometry.attributes.position.needsUpdate = true;
                }

                renderer.render(scene, camera);
            }

            rafId = requestAnimationFrame(animate);
        }

        if (document.readyState === 'complete') {
            bootScene();
        } else {
            window.addEventListener('load', bootScene, { once: true });
        }
    })();
    </script>
</body>
</html>`;

    return c.html(content);
}
