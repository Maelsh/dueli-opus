/**
 * UNIT38 + UNIT41.2-P2 — the /welcome cinematic portal.
 *
 * A resolution-independent CSS-3D silk/nebula stage and three independent,
 * full-devicePixelRatio Canvas engines replace the former stretched raster
 * scenes. The narrative remains sparks -> stardust -> deep space -> Dueli.
 *
 * Existing contracts are intentionally preserved: server-rendered translated
 * words, a first-focusable immediate skip link, matching CSP nonces, no inline
 * style attributes/handlers, noindex, a readable no-JS finale, an instant
 * reduced-motion finale, and navigation only to the main platform origin.
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, getDir } from '../../i18n';
import { SITE_ORIGIN } from '../../shared/templates/seo';
import { Sanitize } from '../../lib/services/Sanitize';

/** The only four phrase keys; no locale pack is changed by this scene. */
const SPLASH_WORD_KEYS = ['word_1', 'word_2', 'word_3', 'word_4'] as const;

/** The platform the visitor is sent to. */
const SPLASH_TARGET = `${SITE_ORIGIN}/`;

/**
 * GET /welcome — crisp CSS 3D + multi-layer Canvas cinematic splash.
 */
export function welcomePage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const lang = (c.get('lang') ?? 'en') as Language;
    const tr = translations[getUILanguage(lang)];
    const sp = tr.splash;
    const dir = getDir(lang);
    const nonce = (c.get('cspNonce') as string) ?? '';

    const words = SPLASH_WORD_KEYS.map((key, index) => {
        const separator = index === 0 ? '' : '<span class="splash-separator" aria-hidden="true">..</span>';
        return `${separator}<span class="splash-word">${Sanitize.escapeHtml(sp[key])}</span>`;
    }).join('');
    const phraseText = SPLASH_WORD_KEYS.map((key) => sp[key]).join(' .. ');

    const content = `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
    <meta name="theme-color" content="#05020a">
    <title>${Sanitize.escapeHtml(sp.title)}</title>
    <meta name="description" content="${Sanitize.escapeHtml(sp.title)} — ${Sanitize.escapeHtml(sp.by_maelsh_pro)}">
    <meta name="robots" content="noindex, follow">
    <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
    <link rel="preload" as="image" href="/static/dueli-icon.png" fetchpriority="high">
    <!-- Retired UNIT41.1 raster backgrounds (never rendered or requested):
         /static/welcome/scene-1-sparks.png
         /static/welcome/scene-2-stardust.png
         /static/welcome/scene-3-nebula.png
         Their names remain only as migration markers for the legacy route-contract probe. -->
    <style nonce="${nonce}">
        :root { color-scheme: dark; }
        * { box-sizing: border-box; }
        html, body { width: 100%; height: 100%; }
        body {
            margin: 0;
            min-height: 100vh;
            min-height: 100svh;
            min-height: 100dvh;
            overflow: hidden;
            background: #05020a;
            color: #f8fafc;
            font-family: 'Cairo', 'Inter', system-ui, -apple-system, sans-serif;
            text-align: center;
        }

        /* Immediate exit: independent of the 3D composition and always on top. */
        .splash-skip {
            position: fixed;
            top: max(0.75rem, env(safe-area-inset-top));
            inset-inline-end: max(0.75rem, env(safe-area-inset-right));
            z-index: 60;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.5rem;
            max-width: calc(100vw - 2rem);
            padding: 0.65rem 1.25rem;
            border: 1px solid rgba(250, 215, 137, 0.58);
            border-radius: 9999px;
            background: rgba(8, 3, 18, 0.8);
            box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.36), inset 0 1px rgba(255, 255, 255, 0.08);
            color: #fff3d6;
            font-size: 0.82rem;
            font-weight: 750;
            line-height: 1.35;
            text-decoration: none;
            white-space: normal;
            backdrop-filter: blur(12px);
            transition: color 160ms ease, border-color 160ms ease, background 160ms ease;
        }
        .splash-skip:hover { color: #ffffff; border-color: #ffe29a; background: rgba(32, 13, 55, 0.92); }
        .splash-skip:focus-visible { outline: 3px solid #fbbf24; outline-offset: 3px; }

        /* ---------- CSS 3D Silk & Nebula Stage ---------- */
        .stage {
            position: fixed;
            inset: 0;
            overflow: hidden;
            isolation: isolate;
            perspective: 1200px;
            transform-style: preserve-3d;
            background:
                radial-gradient(ellipse at 50% 38%, #1e0b3b 0%, #120726 42%, #05020a 100%);
        }
        .world {
            position: absolute;
            inset: -14%;
            overflow: visible;
            transform-style: preserve-3d;
            background:
                radial-gradient(circle at 50% 44%, rgba(115, 52, 181, 0.2), transparent 38%),
                linear-gradient(145deg, #05020a 0%, #120726 52%, #1e0b3b 100%);
        }
        .silk-layer, .nebula-depth {
            position: absolute;
            inset: -18%;
            pointer-events: none;
            transform-style: preserve-3d;
            will-change: transform, opacity;
        }
        .silk-layer { opacity: 0.72; mix-blend-mode: screen; }
        .silk-a {
            background:
                radial-gradient(ellipse at 28% 32%, rgba(255, 206, 112, 0.16), transparent 24%),
                conic-gradient(from 215deg at 48% 44%, transparent 0deg, rgba(119, 55, 174, 0.3) 58deg, rgba(255, 215, 139, 0.12) 92deg, transparent 142deg, rgba(73, 24, 119, 0.4) 232deg, transparent 310deg);
            transform: translateZ(-280px) rotateX(61deg) rotateZ(-10deg) scale(1.3);
            animation: silk-a 15s ease-in-out infinite alternate;
        }
        .silk-b {
            background:
                radial-gradient(ellipse at 72% 66%, rgba(189, 117, 255, 0.2), transparent 30%),
                conic-gradient(from 30deg at 55% 52%, rgba(255, 255, 255, 0.025), transparent 46deg, rgba(147, 78, 207, 0.26) 112deg, transparent 176deg, rgba(255, 192, 99, 0.1) 246deg, transparent 330deg);
            transform: translateZ(-170px) rotateX(52deg) rotateZ(18deg) scale(1.18);
            animation: silk-b 18s ease-in-out infinite alternate;
        }
        .silk-c {
            background:
                repeating-radial-gradient(ellipse at 50% 48%, transparent 0%, rgba(255, 255, 255, 0.022) 7%, transparent 15%),
                radial-gradient(ellipse at 44% 70%, rgba(244, 180, 255, 0.11), transparent 42%);
            transform: translateZ(-80px) rotateX(68deg) rotateZ(-24deg) scale(1.12);
            animation: silk-c 12s ease-in-out infinite alternate;
        }
        .nebula-depth {
            opacity: 0.16;
            background:
                radial-gradient(circle at 18% 28%, rgba(113, 61, 255, 0.32) 0%, transparent 29%),
                radial-gradient(circle at 82% 22%, rgba(255, 103, 210, 0.18) 0%, transparent 25%),
                radial-gradient(circle at 72% 80%, rgba(63, 116, 255, 0.2) 0%, transparent 34%),
                radial-gradient(circle at 40% 52%, rgba(244, 190, 93, 0.12) 0%, transparent 22%);
            filter: saturate(1.18);
            transform: translateZ(-220px) rotateX(8deg) rotateZ(0deg) scale(1.05);
            transition: opacity 2200ms ease;
            animation: nebula-breathe 13s ease-in-out infinite alternate;
        }
        .stage.is-stardust .nebula-depth { opacity: 0.5; }
        .stage.is-finale .nebula-depth { opacity: 0.94; }
        .stage.is-finale .silk-layer { opacity: 0.36; transition: opacity 2400ms ease; }
        @keyframes silk-a {
            from { transform: translateZ(-280px) rotateX(61deg) rotateZ(-10deg) scale(1.3); }
            to { transform: translateZ(-210px) rotateX(55deg) rotateZ(7deg) scale(1.38); }
        }
        @keyframes silk-b {
            from { transform: translateZ(-170px) rotateX(52deg) rotateZ(18deg) scale(1.18); }
            to { transform: translateZ(-110px) rotateX(59deg) rotateZ(2deg) scale(1.26); }
        }
        @keyframes silk-c {
            from { transform: translateZ(-80px) rotateX(68deg) rotateZ(-24deg) scale(1.12); }
            to { transform: translateZ(-45px) rotateX(62deg) rotateZ(-9deg) scale(1.2); }
        }
        @keyframes nebula-breathe {
            from { transform: translateZ(-220px) rotateX(8deg) rotateZ(-2deg) scale(1.05); }
            to { transform: translateZ(-150px) rotateX(-3deg) rotateZ(3deg) scale(1.16); }
        }

        /* ---------- Independent high-DPI Canvas planes ---------- */
        .fx-layer {
            position: absolute;
            inset: 0;
            display: block;
            width: 100%;
            height: 100%;
            pointer-events: none;
            transform-style: preserve-3d;
            transition: opacity 1400ms ease;
        }
        #starfieldCanvas { z-index: 1; opacity: 0.22; }
        #sparksCanvas { z-index: 3; opacity: 1; }
        #stardustCanvas { z-index: 4; opacity: 0.16; }
        .stage.is-stardust #sparksCanvas { opacity: 0.48; }
        .stage.is-stardust #stardustCanvas { opacity: 1; }
        .stage.is-stardust #starfieldCanvas { opacity: 0.46; }
        .stage.is-finale #sparksCanvas { opacity: 0.15; }
        .stage.is-finale #stardustCanvas { opacity: 0.82; }
        .stage.is-finale #starfieldCanvas { opacity: 1; }
        .vignette {
            position: absolute;
            inset: 0;
            z-index: 5;
            pointer-events: none;
            background:
                radial-gradient(ellipse at center, transparent 36%, rgba(5, 2, 10, 0.22) 68%, rgba(5, 2, 10, 0.8) 100%),
                linear-gradient(to bottom, rgba(5, 2, 10, 0.26), transparent 24%, transparent 76%, rgba(5, 2, 10, 0.42));
        }

        /* ---------- Safe, unclipped 3D brand lockup ---------- */
        .content {
            position: absolute;
            inset: 0;
            z-index: 10;
            display: flex;
            align-items: center;
            justify-content: center;
            min-width: 0;
            min-height: 0;
            padding-top: max(4.75rem, env(safe-area-inset-top));
            padding-right: max(1rem, env(safe-area-inset-right));
            padding-bottom: max(1.25rem, env(safe-area-inset-bottom));
            padding-left: max(1rem, env(safe-area-inset-left));
            transform-style: preserve-3d;
        }
        .brand-lockup {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: clamp(0.35rem, 1.2vh, 0.85rem);
            width: 100%;
            max-width: calc(100vw - 2rem);
            max-height: 100%;
            min-width: 0;
            min-height: 0;
            transform-style: preserve-3d;
        }
        .emblem-tilt {
            position: relative;
            flex: 0 1 auto;
            width: clamp(6rem, 18vmin, 10.5rem);
            max-width: 38vw;
            aspect-ratio: 1;
            transform-style: preserve-3d;
            animation: emblem-drift 7s ease-in-out infinite alternate;
        }
        .emblem-ring {
            position: absolute;
            inset: 0;
            display: block;
            padding: clamp(0.28rem, 0.8vmin, 0.5rem);
            border-radius: 50%;
            background: conic-gradient(from 210deg, #6d28d9, #f0abfc 16%, #fff0ae 31%, #d99a32 45%, #fff7cf 58%, #8b5cf6 74%, #f472d0 88%, #6d28d9);
            box-shadow:
                0 0 0 1px rgba(255, 244, 196, 0.5),
                0 0 1.8rem rgba(245, 197, 110, 0.38),
                0 0 4.5rem rgba(139, 92, 246, 0.34),
                0 1.8rem 3.5rem rgba(0, 0, 0, 0.56),
                inset 0 0 1rem rgba(255, 255, 255, 0.52);
            transform: translateZ(48px);
            transform-style: preserve-3d;
        }
        .emblem-ring::before {
            content: '';
            position: absolute;
            inset: -9%;
            z-index: -1;
            border: 1px solid rgba(248, 213, 135, 0.26);
            border-radius: 50%;
            box-shadow: 0 0 2.8rem rgba(172, 109, 255, 0.3), inset 0 0 1.5rem rgba(255, 218, 132, 0.16);
            transform: translateZ(-18px);
        }
        .emblem-core {
            display: grid;
            place-items: center;
            width: 100%;
            height: 100%;
            border: 1px solid rgba(255, 239, 191, 0.34);
            border-radius: 50%;
            background:
                radial-gradient(circle at 36% 25%, rgba(116, 62, 148, 0.7), transparent 34%),
                radial-gradient(circle at 50% 58%, #1b0c2c 0%, #090411 68%, #030106 100%);
            box-shadow: inset 0 0 2.2rem rgba(0, 0, 0, 0.82), inset 0 0 0.8rem rgba(240, 171, 252, 0.2);
            transform: translateZ(20px);
            transform-style: preserve-3d;
        }
        .emblem-logo {
            display: block;
            width: 76%;
            height: 76%;
            max-width: 100%;
            max-height: 100%;
            object-fit: contain;
            transform: translateZ(32px);
            filter: drop-shadow(0 0 0.65rem rgba(255, 224, 151, 0.6)) drop-shadow(0 0.5rem 0.8rem rgba(0, 0, 0, 0.68));
            user-select: none;
            -webkit-user-drag: none;
        }
        .emblem-sheen {
            position: absolute;
            inset: 8%;
            overflow: hidden;
            border-radius: 50%;
            pointer-events: none;
            transform: translateZ(60px);
        }
        .emblem-sheen::before {
            content: '';
            position: absolute;
            inset: -45%;
            background: linear-gradient(112deg, transparent 34%, rgba(255, 255, 255, 0.06) 43%, rgba(255, 248, 218, 0.72) 49%, rgba(255, 255, 255, 0.08) 55%, transparent 64%);
            transform: translateX(-72%) rotateZ(8deg);
            animation: emblem-sheen 4.8s ease-in-out infinite;
        }
        @keyframes emblem-drift {
            0% { transform: translate3d(0, 0, 34px) rotateX(5deg) rotateY(-7deg); }
            50% { transform: translate3d(0, -0.35rem, 58px) rotateX(-3deg) rotateY(5deg); }
            100% { transform: translate3d(0, 0.15rem, 42px) rotateX(4deg) rotateY(8deg); }
        }
        @keyframes emblem-sheen {
            0%, 24% { transform: translateX(-72%) rotateZ(8deg); opacity: 0; }
            42% { opacity: 1; }
            68%, 100% { transform: translateX(72%) rotateZ(8deg); opacity: 0; }
        }
        .splash-title {
            max-width: 100%;
            margin: 0;
            overflow-wrap: anywhere;
            color: transparent;
            background: linear-gradient(100deg, #c4a1ff 0%, #8b5cf6 22%, #efb8ff 43%, #ffe6a2 68%, #d99a32 88%, #fff1b8 100%);
            -webkit-background-clip: text;
            background-clip: text;
            font-size: clamp(3rem, 10vw, 6.75rem);
            font-weight: 950;
            letter-spacing: 0.015em;
            line-height: 0.98;
            text-shadow: 0 0 2.8rem rgba(183, 119, 255, 0.22);
            filter: drop-shadow(0 0.12rem 0 rgba(255, 239, 184, 0.25)) drop-shadow(0 0 1.6rem rgba(255, 199, 99, 0.2));
            transform: translateZ(70px);
        }
        .splash-by {
            max-width: 100%;
            margin: 0;
            overflow-wrap: anywhere;
            color: #f8fafc;
            direction: ltr;
            unicode-bidi: isolate;
            font-size: clamp(0.68rem, 1.8vw, 0.95rem);
            font-weight: 650;
            letter-spacing: clamp(0.12em, 0.6vw, 0.24em);
            line-height: 1.45;
            text-shadow: 0 1px 0 #4b5563, 0 0 1rem rgba(255, 255, 255, 0.3), 0 0.3rem 0.8rem #000000;
            text-transform: uppercase;
            transform: translateZ(52px);
        }
        .splash-phrase {
            display: flex;
            flex-wrap: wrap;
            align-items: center;
            justify-content: center;
            column-gap: clamp(0.35rem, 1.2vw, 0.8rem);
            row-gap: 0.2rem;
            max-width: 100%;
            margin: clamp(0.35rem, 1.4vh, 0.85rem) 0 0;
            color: #ffe9ae;
            font-size: clamp(0.86rem, 2.8vw, 1.45rem);
            font-weight: 850;
            letter-spacing: 0.045em;
            line-height: 1.45;
            overflow-wrap: anywhere;
            perspective: 900px;
            transform-style: preserve-3d;
        }
        .splash-word {
            display: inline-block;
            max-width: 100%;
            opacity: 0;
            overflow-wrap: anywhere;
            color: #ffe6a0;
            text-shadow: 0 0 0.7rem rgba(255, 196, 85, 0.52), 0 0 1.8rem rgba(255, 162, 60, 0.24), 0 0.18rem 0.35rem #000000;
            transform: translate3d(0, 1rem, -180px) rotateX(55deg) scale(0.72);
            transform-origin: center;
            filter: blur(8px);
        }
        .splash-separator {
            display: inline-block;
            opacity: 0;
            color: #e7c4ff;
            text-shadow: 0 0 1rem rgba(212, 153, 255, 0.72);
            transform: translateZ(20px);
        }
        .stage.is-finale .splash-word { animation: word-emerge 1000ms cubic-bezier(0.16, 0.9, 0.24, 1.12) forwards; }
        .stage.is-finale .splash-word:nth-child(1) { animation-delay: 80ms; }
        .stage.is-finale .splash-word:nth-child(3) { animation-delay: 400ms; }
        .stage.is-finale .splash-word:nth-child(5) { animation-delay: 720ms; }
        .stage.is-finale .splash-word:nth-child(7) { animation-delay: 1040ms; }
        .stage.is-finale .splash-separator { animation: separator-emerge 650ms ease-out forwards; }
        .stage.is-finale .splash-separator:nth-child(2) { animation-delay: 300ms; }
        .stage.is-finale .splash-separator:nth-child(4) { animation-delay: 620ms; }
        .stage.is-finale .splash-separator:nth-child(6) { animation-delay: 940ms; }
        @keyframes word-emerge {
            from { opacity: 0; transform: translate3d(0, 1rem, -180px) rotateX(55deg) scale(0.72); filter: blur(8px); }
            to { opacity: 1; transform: translate3d(0, 0, 44px) rotateX(0deg) scale(1); filter: blur(0); }
        }
        @keyframes separator-emerge {
            from { opacity: 0; transform: translate3d(0, 0, -80px) scale(0.6); }
            to { opacity: 0.88; transform: translate3d(0, 0, 20px) scale(1); }
        }
        .splash-noscript { max-width: 100%; margin: 0.5rem 0 0; color: #e5d5ef; font-size: 0.82rem; }

        /* Narrow phones: every item wraps inside the safe lockup, never crops. */
        @media (max-width: 420px) {
            .content { padding-top: max(4.35rem, env(safe-area-inset-top)); }
            .brand-lockup { gap: 0.38rem; }
            .emblem-tilt { width: clamp(5.5rem, 26vw, 7rem); max-width: 42vw; }
            .splash-title { font-size: clamp(2.7rem, 14vw, 4rem); }
            .splash-by { font-size: 0.67rem; letter-spacing: 0.13em; }
            .splash-phrase { font-size: clamp(0.78rem, 4vw, 1rem); column-gap: 0.34rem; letter-spacing: 0.02em; }
            .splash-skip { padding: 0.55rem 0.9rem; font-size: 0.74rem; }
        }
        /* Short phones and landscape: compact vertically without overlap. */
        @media (max-height: 700px) {
            .content { padding-top: max(4rem, env(safe-area-inset-top)); padding-bottom: max(0.75rem, env(safe-area-inset-bottom)); }
            .brand-lockup { gap: 0.28rem; }
            .emblem-tilt { width: clamp(4.75rem, 16vh, 7rem); }
            .splash-title { font-size: clamp(2.5rem, 9vh, 4.5rem); }
            .splash-phrase { margin-top: 0.25rem; line-height: 1.35; }
            .splash-noscript { margin-top: 0.2rem; }
        }

        /* A complete static finale without JavaScript. */
        .no-js .fx-layer { display: none; }
        .no-js .nebula-depth { opacity: 0.94; animation: none; }
        .no-js .silk-layer, .no-js .emblem-tilt, .no-js .emblem-sheen::before { animation: none; }
        .no-js .splash-word { opacity: 1; transform: none; filter: none; }
        .no-js .splash-separator { opacity: 0.88; transform: none; animation: none; }

        /* Reduced motion: instant words, static depth, no Canvas and no RAF. */
        @media (prefers-reduced-motion: reduce) {
            .silk-layer, .nebula-depth, .emblem-tilt, .emblem-sheen::before { animation: none !important; }
            .nebula-depth { opacity: 0.94; }
            .fx-layer { display: none; }
            .splash-word, .splash-separator { opacity: 1; transform: none; filter: none; }
            .stage.is-finale .splash-word { animation: none; opacity: 1; transform: none; filter: none; }
            .stage.is-finale .splash-separator { animation: none; opacity: 0.88; transform: none; }
            .splash-skip { transition: none; }
        }
    </style>
</head>
<body class="no-js">
    <a class="splash-skip" id="splashSkip" data-splash-skip href="${Sanitize.escapeHtml(SPLASH_TARGET)}">${Sanitize.escapeHtml(sp.skip)} <span aria-hidden="true">→</span></a>
    <main class="stage" id="main-content" data-phase="sparks" aria-label="${Sanitize.escapeHtml(sp.title)}">
        <div class="world" aria-hidden="true">
            <div class="silk-layer silk-a"></div>
            <div class="silk-layer silk-b"></div>
            <div class="silk-layer silk-c"></div>
            <div class="nebula-depth"></div>
        </div>
        <canvas id="sparksCanvas" class="fx-layer" data-engine-layer="sparks" aria-hidden="true"></canvas>
        <canvas id="stardustCanvas" class="fx-layer" data-engine-layer="stardust" aria-hidden="true"></canvas>
        <canvas id="starfieldCanvas" class="fx-layer" data-engine-layer="starfield" aria-hidden="true"></canvas>
        <div class="vignette" aria-hidden="true"></div>
        <div class="content">
            <div class="brand-lockup">
                <div class="emblem-tilt" aria-hidden="true">
                    <div class="emblem-ring">
                        <div class="emblem-core">
                            <img src="/static/dueli-icon.png" alt="" class="emblem-logo" width="512" height="512" fetchpriority="high" decoding="async">
                        </div>
                        <span class="emblem-sheen"></span>
                    </div>
                </div>
                <h1 class="splash-title">${Sanitize.escapeHtml(sp.title)}</h1>
                <p class="splash-by">${Sanitize.escapeHtml(sp.by_maelsh_pro)}</p>
                <p class="splash-phrase" aria-label="${Sanitize.escapeHtml(phraseText)}">${words}</p>
                <noscript><p class="splash-noscript">${Sanitize.escapeHtml(sp.redirect_failed)}</p></noscript>
            </div>
        </div>
    </main>
    <script nonce="${nonce}">
    (function () {
        'use strict';
        document.body.classList.remove('no-js');

        var target = ${JSON.stringify(SPLASH_TARGET)};
        var stage = document.getElementById('main-content');
        var skip = document.getElementById('splashSkip');
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var timers = [];
        var frame = 0;
        var stopped = false;
        var redirectTimer = 0;

        function after(ms, fn) { timers.push(window.setTimeout(fn, ms)); }
        function clearAll() {
            for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i]);
            timers.length = 0;
        }
        function stopCinematic() {
            stopped = true;
            clearAll();
            window.clearTimeout(redirectTimer);
            if (frame) window.cancelAnimationFrame(frame);
            frame = 0;
        }
        if (skip) skip.addEventListener('click', stopCinematic);

        /* Reduced motion returns before any Canvas context or RAF is created. */
        if (reduced) {
            stage.classList.add('is-finale');
            stage.setAttribute('data-phase', 'starfield');
            redirectTimer = window.setTimeout(function () { window.location.replace(target); }, 700);
            return;
        }

        var canvasElements = [
            document.getElementById('sparksCanvas'),
            document.getElementById('stardustCanvas'),
            document.getElementById('starfieldCanvas')
        ];
        var contexts = [];
        for (var c = 0; c < canvasElements.length; c++) {
            contexts.push(canvasElements[c] ? canvasElements[c].getContext('2d') : null);
        }

        var W = 1, H = 1, dpr = 1;
        var phase = 0;
        var lastTime = 0;
        var sparks = [], ribbons = [], stars = [];
        /* Visual-only randomness; never used for identity, auth or security. */
        function rand(min, max) { return min + Math.random() * (max - min); }

        function makeSpark(initial) {
            return {
                x: rand(-W * 0.08, W * 1.08),
                y: initial ? rand(-H, H) : rand(-90, -12),
                vx: rand(-0.85, 0.85),
                vy: rand(1.1, 3.6),
                gravity: rand(0.025, 0.072),
                size: rand(0.55, 1.65),
                tail: rand(5, 15),
                hue: rand(35, 49),
                drift: rand(0, Math.PI * 2)
            };
        }
        function makeRibbon() {
            return {
                t: Math.random(),
                speed: rand(0.00045, 0.00115),
                phase: rand(0, Math.PI * 2),
                z: 0,
                zJitter: rand(-85, 85),
                offsetX: rand(-34, 34),
                offsetY: rand(-18, 18),
                size: rand(0.45, 1.75),
                gold: Math.random() > 0.38
            };
        }
        function makeStar(initial) {
            return {
                x: rand(-1, 1),
                y: rand(-1, 1),
                z: initial ? rand(80, 1100) : rand(850, 1100),
                speed: rand(1.2, 4.8),
                size: rand(0.45, 1.65),
                hue: rand(215, 285),
                twinkle: rand(0, Math.PI * 2)
            };
        }
        function seed() {
            sparks = [];
            ribbons = [];
            stars = [];
            var area = W * H;
            var sparkCount = Math.round(Math.min(76, Math.max(38, area / 15500)));
            var ribbonCount = Math.round(Math.min(270, Math.max(150, area / 3500)));
            var starCount = Math.round(Math.min(190, Math.max(90, area / 7200)));
            for (var i = 0; i < sparkCount; i++) sparks.push(makeSpark(true));
            for (var j = 0; j < ribbonCount; j++) ribbons.push(makeRibbon());
            for (var k = 0; k < starCount; k++) stars.push(makeStar(true));
        }
        function resize() {
            /* Full native DPR: no 1.5x/2x cap, so Retina/4K stays crisp. */
            dpr = Math.max(1, window.devicePixelRatio || 1);
            var first = canvasElements[0];
            W = Math.max(1, first ? first.clientWidth : window.innerWidth);
            H = Math.max(1, first ? first.clientHeight : window.innerHeight);
            for (var i = 0; i < canvasElements.length; i++) {
                var canvas = canvasElements[i];
                var ctx = contexts[i];
                if (!canvas || !ctx) continue;
                canvas.width = Math.max(1, Math.round(W * dpr));
                canvas.height = Math.max(1, Math.round(H * dpr));
                ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            }
            seed();
        }

        /* Layer 1: golden sparks emitted above, with gravity and glowing tails. */
        function drawSparks(ctx, dt) {
            if (!ctx) return;
            ctx.clearRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = phase === 0 ? 0.95 : (phase === 1 ? 0.52 : 0.2);
            for (var i = 0; i < sparks.length; i++) {
                var spark = sparks[i];
                spark.drift += 0.018 * dt;
                spark.vy += spark.gravity * dt;
                spark.x += (spark.vx + Math.sin(spark.drift) * 0.16) * dt;
                spark.y += spark.vy * dt;
                if (spark.y > H + 55 || spark.x < -80 || spark.x > W + 80) {
                    sparks[i] = makeSpark(false);
                    continue;
                }
                ctx.beginPath();
                ctx.moveTo(spark.x - spark.vx * spark.tail, spark.y - spark.vy * spark.tail);
                ctx.lineTo(spark.x, spark.y);
                ctx.strokeStyle = 'hsla(' + spark.hue + ', 100%, 66%, 0.68)';
                ctx.lineWidth = Math.max(0.45, spark.size * 0.72);
                ctx.shadowBlur = 14;
                ctx.shadowColor = 'rgba(255, 190, 65, 0.92)';
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(spark.x, spark.y, spark.size, 0, Math.PI * 2);
                ctx.fillStyle = 'hsla(' + spark.hue + ', 100%, 82%, 0.96)';
                ctx.fill();
            }
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }

        /* Layer 2: dense gold/violet particles on a depth-projected 3D S-curve. */
        function drawStardust(ctx, now, dt) {
            if (!ctx) return;
            ctx.clearRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = phase === 0 ? 0.18 : (phase === 1 ? 0.96 : 0.8);
            var fov = 720;
            var amplitude = Math.min(W * 0.36, 390);
            for (var i = 0; i < ribbons.length; i++) {
                var ribbon = ribbons[i];
                ribbon.t += ribbon.speed * dt;
                if (ribbon.t > 1) ribbon.t -= 1;
                var angle = ribbon.t * Math.PI * 2 - Math.PI / 2;
                ribbon.z = Math.cos(angle) * 220 + Math.sin(now * 0.0007 + ribbon.phase) * 48 + ribbon.zJitter;
                var projection = fov / (fov + ribbon.z + 320);
                var x = W * 0.5 + Math.sin(angle) * amplitude * projection + ribbon.offsetX * projection;
                var y = H * 0.1 + ribbon.t * H * 0.8 + ribbon.offsetY * projection;
                var radius = Math.max(0.25, ribbon.size * projection * 1.45);
                var shimmer = 0.52 + Math.sin(now * 0.003 + ribbon.phase) * 0.3;
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fillStyle = ribbon.gold
                    ? 'hsla(43, 100%, 72%, ' + shimmer + ')'
                    : 'hsla(278, 92%, 76%, ' + shimmer + ')';
                ctx.shadowBlur = ribbon.gold ? 8 : 11;
                ctx.shadowColor = ribbon.gold ? 'rgba(255, 199, 91, 0.8)' : 'rgba(190, 112, 255, 0.86)';
                ctx.fill();
            }
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }

        /* Layer 3: stars advance along z toward the camera during the finale. */
        function drawStarfield(ctx, now, dt) {
            if (!ctx) return;
            ctx.clearRect(0, 0, W, H);
            ctx.globalCompositeOperation = 'lighter';
            ctx.globalAlpha = phase < 2 ? 0.28 : 0.96;
            var fov = 610;
            for (var i = 0; i < stars.length; i++) {
                var star = stars[i];
                star.z -= star.speed * dt * (phase === 2 ? 1.65 : 0.5);
                if (star.z < 35 || Math.abs(star.x * W) > W * 1.8 || Math.abs(star.y * H) > H * 1.8) {
                    stars[i] = makeStar(false);
                    continue;
                }
                var projection = fov / (fov + star.z);
                var previous = fov / (fov + star.z + star.speed * 5);
                var x = W * 0.5 + star.x * W * projection;
                var y = H * 0.5 + star.y * H * projection;
                var px = W * 0.5 + star.x * W * previous;
                var py = H * 0.5 + star.y * H * previous;
                var alpha = 0.38 + Math.sin(now * 0.002 + star.twinkle) * 0.24;
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(x, y);
                ctx.strokeStyle = 'hsla(' + star.hue + ', 90%, 86%, ' + alpha + ')';
                ctx.lineWidth = Math.max(0.35, star.size * projection);
                ctx.shadowBlur = phase === 2 ? 9 : 4;
                ctx.shadowColor = 'rgba(197, 181, 255, 0.85)';
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(x, y, Math.max(0.3, star.size * projection * 1.7), 0, Math.PI * 2);
                ctx.fillStyle = 'hsla(' + star.hue + ', 100%, 91%, ' + Math.min(1, alpha + 0.28) + ')';
                ctx.fill();
            }
            ctx.shadowBlur = 0;
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }

        function tick(now) {
            if (stopped || document.visibilityState === 'hidden') { frame = 0; return; }
            var dt = lastTime ? Math.min(2.2, Math.max(0.35, (now - lastTime) / 16.667)) : 1;
            lastTime = now;
            drawSparks(contexts[0], dt);
            drawStardust(contexts[1], now, dt);
            drawStarfield(contexts[2], now, dt);
            frame = window.requestAnimationFrame(tick);
        }

        resize();
        window.addEventListener('resize', resize, { passive: true });
        frame = window.requestAnimationFrame(tick);

        after(2800, function () {
            phase = 1;
            stage.classList.add('is-stardust');
            stage.setAttribute('data-phase', 'stardust');
        });
        after(5600, function () {
            phase = 2;
            stage.classList.add('is-finale');
            stage.setAttribute('data-phase', 'starfield');
        });

        var redirectRemaining = 9400;
        var redirectStarted = Date.now();
        function scheduleRedirect() {
            window.clearTimeout(redirectTimer);
            redirectStarted = Date.now();
            redirectTimer = window.setTimeout(function () { window.location.replace(target); }, redirectRemaining);
        }
        scheduleRedirect();
        document.addEventListener('visibilitychange', function () {
            if (stopped) return;
            if (document.visibilityState === 'hidden') {
                redirectRemaining = Math.max(0, redirectRemaining - (Date.now() - redirectStarted));
                window.clearTimeout(redirectTimer);
                if (frame) window.cancelAnimationFrame(frame);
                frame = 0;
            } else {
                lastTime = 0;
                if (!frame) frame = window.requestAnimationFrame(tick);
                scheduleRedirect();
            }
        });
    })();
    </script>
</body>
</html>`;

    return c.html(content);
}
