/**
 * UNIT41.2-P3 — GPU-accelerated 3-scene cinematic welcome portal.
 *
 * Verifies the refined 3-scene showcase (swirling golden stardust -> cosmic
 * nebula slogan -> draped black silk & raining sparks) built with the official
 * Dueli emblem (/static/dueli-icon.png), zero manual control chrome, strict CSP
 * nonces, 56-language parity, reduced-motion/no-JS accessibility, and redirect
 * to https://dueli.maelshpro.com/.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Window } from 'happy-dom';
import app from '../../src/main';
import { FakeD1 } from '../helpers/fake-d1';
import { en } from '../../src/i18n/en';

const WELCOME_SOURCE = readFileSync(
    resolve(__dirname, '../../src/modules/pages/welcome-page.ts'),
    'utf8',
);

type Env = Parameters<typeof app.request>[2];
const env = (): Env => ({ DB: new FakeD1() }) as unknown as Env;

async function renderWelcome(lang = 'en') {
    const response = await app.request(`/welcome?lang=${lang}`, {}, env());
    return { response, html: await response.text() };
}

function inlineScript(html: string): string {
    const match = /<script\s+nonce="[^"]*">([\s\S]*?)<\/script>/.exec(html);
    expect(match, 'nonce-bearing inline engine').toBeTruthy();
    return match?.[1] ?? '';
}

function inlineStyle(html: string): string {
    const match = /<style\s+nonce="[^"]*">([\s\S]*?)<\/style>/.exec(html);
    expect(match, 'nonce-bearing inline stylesheet').toBeTruthy();
    return match?.[1] ?? '';
}

describe('UNIT41.2-P3 — 3-scene cinematic welcome showcase', () => {
    it('1. renders the 3D stage with zero playback/control-bar chrome and zero stretched raster backgrounds', async () => {
        const { response, html } = await renderWelcome();
        expect(response.status).toBe(200);
        expect(html).toContain('id="canvas-container"');
        expect(html).toContain('id="logo-container"');
        expect(html).toContain('id="slogan-container"');

        // All manual demo controls from dueli.html must be stripped
        expect(html).not.toContain('id="start-modal"');
        expect(html).not.toContain('id="btn-scene-1"');
        expect(html).not.toContain('id="btn-replay"');
        expect(html).not.toContain('id="btn-mute"');
        expect(html).not.toContain('id="timeline-bar"');
        expect(html).not.toContain('tone.js');

        // Official Dueli emblem is the ONLY raster <img>
        expect(html).not.toMatch(/<img[^>]+(?:src|srcset)="[^"]*\/static\/welcome\/scene-/);
        expect(html.match(/<img\s/g)).toHaveLength(1);
        expect(html).toContain('src="/static/dueli-icon.png"');
        expect(html).toContain('class="emblem-logo"');
        expect(inlineStyle(html)).toMatch(/\.emblem-logo\s*\{[^}]*object-fit:\s*contain/s);
    });

    it('2. preserves the four translated words, official Dueli lockup, byline and immediate skip link', async () => {
        const { html } = await renderWelcome();
        expect(html.match(/class="splash-word"/g)).toHaveLength(4);
        expect(html.match(/class="splash-separator"/g)).toHaveLength(3);
        for (const word of [en.splash.word_1, en.splash.word_2, en.splash.word_3, en.splash.word_4]) {
            expect(html).toContain(`<span class="splash-word">${word}</span>`);
        }
        expect(html).toContain('class="dueli-wordmark">Dueli</h1>');
        expect(html).toContain(`class="splash-by">${en.splash.by_maelsh_pro}</p>`);
        expect(html).toContain('data-splash-skip');
        expect(html).toContain('href="https://dueli.maelshpro.com/"');
        expect(html).toContain(en.splash.skip);
        expect(html.indexOf('data-splash-skip')).toBeLessThan(html.indexOf('<main'));
    });

    it('3. emits matching CSP nonces, permitted script sources, and zero inline style/event attributes', async () => {
        const { response, html } = await renderWelcome();
        const styleNonce = /<style\s+nonce="([^"]+)"/.exec(html)?.[1];
        const scriptNonce = /<script\s+nonce="([^"]+)"/.exec(html)?.[1];
        expect(styleNonce).toBeTruthy();
        expect(scriptNonce).toBe(styleNonce);
        const csp = response.headers.get('content-security-policy') ?? '';
        expect(csp).toContain(`'nonce-${styleNonce}'`);
        expect(csp).toContain('https://cdnjs.cloudflare.com');
        expect(html).not.toMatch(/\sstyle\s*=/);
        expect(html).not.toMatch(/\son(click|load|error|submit)\s*=/);
        expect(html).toContain('name="robots" content="noindex, follow"');
    });

    it('4. locks responsive viewport, safe-area, reduced-motion and no-JS invariants', async () => {
        const { html } = await renderWelcome();
        const css = inlineStyle(html);
        expect(css).toContain('min-height: 100svh');
        expect(css).toContain('min-height: 100dvh');
        expect(css).toContain('max-width: calc(100vw - 2rem)');
        expect(css).toContain('flex-wrap: wrap');
        expect(css).toContain('overflow-wrap: anywhere');
        expect(css).toContain('env(safe-area-inset-top)');
        expect(css).toContain('@media (max-width: 420px)');
        expect(css).toContain('@media (max-height: 700px)');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toContain('.no-js .splash-word');
    });

    it('5. advances cleanly through Scene 1 -> Scene 2 -> Scene 3 -> platform redirect when WebGL is absent, and honours reduced-motion', async () => {
        const { html } = await renderWelcome();
        const source = inlineScript(html);

        // Reduced motion skips animation loops and schedules immediate 700ms redirect
        const rmWin = new Window({ url: 'https://dueli.win/welcome' });
        rmWin.document.write(html.replace(/<script[\s\S]*?<\/script>/g, ''));
        rmWin.document.close();
        const rmTimers: number[] = [];
        Object.defineProperties(rmWin, {
            matchMedia: {
                configurable: true,
                value: (q: string) => ({ matches: q.includes('prefers-reduced-motion') }),
            },
            setTimeout: {
                configurable: true,
                value: (_cb: () => void, delay = 0) => {
                    rmTimers.push(delay);
                    return rmTimers.length;
                },
            },
        });
        expect(() => rmWin.eval(source)).not.toThrow();
        expect(rmWin.document.getElementById('main-content')?.classList.contains('is-static-finale')).toBe(true);
        expect(rmTimers).toEqual([700]);
        rmWin.close();

        // Standard motion fallback timer sequence (4s -> Scene 2, 8s -> Scene 3, 12s -> redirect)
        const stdWin = new Window({ url: 'https://dueli.win/welcome' });
        stdWin.document.write(html.replace(/<script[\s\S]*?<\/script>/g, ''));
        stdWin.document.close();
        Object.defineProperty(stdWin.document, 'readyState', { configurable: true, value: 'complete' });
        const scheduled: Array<{ delay: number; cb: () => void }> = [];
        Object.defineProperties(stdWin, {
            matchMedia: {
                configurable: true,
                value: () => ({ matches: false }),
            },
            setTimeout: {
                configurable: true,
                value: (cb: () => void, delay = 0) => {
                    scheduled.push({ delay, cb });
                    return scheduled.length;
                },
            },
        });
        expect(() => stdWin.eval(source)).not.toThrow();
        expect(stdWin.document.getElementById('main-content')?.classList.contains('scene-1')).toBe(true);
        scheduled.find((t) => t.delay === 4000)?.cb();
        expect(stdWin.document.getElementById('main-content')?.classList.contains('scene-2')).toBe(true);
        scheduled.find((t) => t.delay === 8000)?.cb();
        expect(stdWin.document.getElementById('main-content')?.classList.contains('scene-3')).toBe(true);
        expect(scheduled.some((t) => t.delay === 12000)).toBe(true);
        stdWin.close();
    });

    it('6. uses only existing splash translation keys (zero locale pack churn across all 56 languages)', () => {
        const used = Array.from(WELCOME_SOURCE.matchAll(/sp\.([A-Za-z0-9_]+)/g), (match) => match[1]);
        expect(new Set(used)).toEqual(new Set(['title', 'by_maelsh_pro', 'skip', 'redirect_failed']));
        expect(WELCOME_SOURCE).toContain("['word_1', 'word_2', 'word_3', 'word_4']");
    });
});
