/**
 * UNIT41.2-P2 — crisp CSS-3D + three-layer Canvas welcome portal.
 *
 * These tests deliberately reject the old stretched-raster scene stack. They
 * exercise the server-rendered contract AND execute the real inline engine in
 * happy-dom with instrumented high-DPR canvases and controllable browser APIs.
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

interface BrowserHarness {
    window: Window;
    frames: Array<(time: number) => void>;
    timers: Array<{ delay: number; run: () => void }>;
    calls: string[];
    canvases: HTMLCanvasElement[];
}

function browserHarness(html: string, reducedMotion: boolean): BrowserHarness {
    const window = new Window({ url: 'https://dueli.win/welcome' });
    window.document.write(html.replace(/<script\s+nonce="[^"]*">[\s\S]*?<\/script>/, ''));
    window.document.close();

    const frames: Array<(time: number) => void> = [];
    const timers: Array<{ delay: number; run: () => void }> = [];
    const calls: string[] = [];
    const canvases = Array.from(window.document.querySelectorAll('canvas'));

    Object.defineProperties(window, {
        devicePixelRatio: { configurable: true, value: 3 },
        innerWidth: { configurable: true, value: 390 },
        innerHeight: { configurable: true, value: 844 },
        matchMedia: {
            configurable: true,
            value: (query: string) => ({
                matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
                media: query,
                addEventListener: () => undefined,
                removeEventListener: () => undefined,
            }),
        },
        requestAnimationFrame: {
            configurable: true,
            value: (callback: (time: number) => void) => {
                if (reducedMotion) throw new Error('reduced motion must not start a frame loop');
                frames.push(callback);
                return frames.length;
            },
        },
        cancelAnimationFrame: { configurable: true, value: () => undefined },
        setTimeout: {
            configurable: true,
            value: (callback: () => void, delay = 0) => {
                timers.push({ delay, run: callback });
                return timers.length;
            },
        },
        clearTimeout: { configurable: true, value: () => undefined },
    });

    for (const canvas of canvases) {
        Object.defineProperties(canvas, {
            clientWidth: { configurable: true, value: 390 },
            clientHeight: { configurable: true, value: 844 },
        });
    }

    const context = new Proxy({}, {
        get(target: Record<string, unknown>, property: string) {
            if (property in target) return target[property];
            return (...args: unknown[]) => {
                calls.push(`${String(property)}(${args.map((arg) => String(arg)).join(',')})`);
            };
        },
        set(target: Record<string, unknown>, property: string, value: unknown) {
            target[property] = value;
            if (property === 'shadowBlur' && Number(value) > 0) calls.push(`glow:${String(value)}`);
            return true;
        },
    });

    Object.defineProperty(window.HTMLCanvasElement.prototype, 'getContext', {
        configurable: true,
        value: () => {
            if (reducedMotion) throw new Error('reduced motion must not create a Canvas engine');
            return context;
        },
    });

    return { window, frames, timers, calls, canvases };
}

describe('UNIT41.2-P2 — server-rendered cinematic scene', () => {
    it('1. renders a real CSS-3D silk/nebula stage and exactly three ordered Canvas layers', async () => {
        const { response, html } = await renderWelcome();
        expect(response.status).toBe(200);
        expect(html).toContain('class="stage"');
        expect(html).toContain('class="world"');
        expect(html.match(/class="silk-layer /g)).toHaveLength(3);
        expect(html).toContain('class="nebula-depth"');

        const layers = Array.from(html.matchAll(/<canvas\s+id="([^"]+)"\s+class="fx-layer"\s+data-engine-layer="([^"]+)"/g));
        expect(layers.map((match) => match[1])).toEqual(['sparksCanvas', 'stardustCanvas', 'starfieldCanvas']);
        expect(layers.map((match) => match[2])).toEqual(['sparks', 'stardust', 'starfield']);

        const css = inlineStyle(html);
        expect(css).toContain('perspective: 1200px');
        expect(css).toContain('transform-style: preserve-3d');
        expect(css).toContain('translateZ(');
        expect(css).toContain('rotateX(');
        expect(css).toContain('rotateZ(');
        expect(css).toContain('conic-gradient(');
        expect(css).toContain('#05020a');
        expect(css).toContain('#120726');
        expect(css).toContain('#1e0b3b');
    });

    it('2. removes every stretched raster scene; the sole raster image is the contained Dueli emblem', async () => {
        const { html } = await renderWelcome();
        expect(html).not.toMatch(/<img[^>]+(?:src|srcset)="[^"]*\/static\/welcome\/scene-/);
        expect(html).not.toMatch(/<link[^>]+href="[^"]*\/static\/welcome\/scene-/);
        expect(html).not.toContain('scene-layer');
        expect(html).not.toContain('ken-burns');
        expect(html).not.toContain('scale(5.8');
        expect(html.match(/<img\s/g)).toHaveLength(1);
        expect(html).toContain('src="/static/dueli-icon.png"');
        expect(html).toContain('class="emblem-logo"');
        expect(inlineStyle(html)).toMatch(/\.emblem-logo\s*\{[^}]*object-fit:\s*contain/s);
    });

    it('3. keeps the four translated words, metallic emblem, byline and immediate skip contract in SSR order', async () => {
        const { html } = await renderWelcome();
        expect(html.match(/class="splash-word"/g)).toHaveLength(4);
        expect(html.match(/class="splash-separator"/g)).toHaveLength(3);
        for (const word of [en.splash.word_1, en.splash.word_2, en.splash.word_3, en.splash.word_4]) {
            expect(html).toContain(`<span class="splash-word">${word}</span>`);
        }
        expect(html).toContain(`<p class="splash-by">${en.splash.by_maelsh_pro}</p>`);
        expect(html).toContain('class="emblem-ring"');
        expect(html).toContain('class="emblem-sheen"');
        expect(html).toContain('data-splash-skip');
        expect(html).toContain(`href="https://dueli.maelshpro.com/"`);
        expect(html).toContain(en.splash.skip);

        const orderedMarkers = ['class="emblem-tilt"', 'class="splash-title"', 'class="splash-by"', 'class="splash-phrase"'];
        const positions = orderedMarkers.map((marker) => html.indexOf(marker));
        expect(positions.every((position) => position >= 0)).toBe(true);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        expect(html.indexOf('data-splash-skip')).toBeLessThan(html.indexOf('<main'));
    });

    it('4. emits matching CSP nonces and no inline style attribute or event handler', async () => {
        const { response, html } = await renderWelcome();
        const styleNonce = /<style\s+nonce="([^"]+)"/.exec(html)?.[1];
        const scriptNonce = /<script\s+nonce="([^"]+)"/.exec(html)?.[1];
        expect(styleNonce).toBeTruthy();
        expect(scriptNonce).toBe(styleNonce);
        expect(response.headers.get('content-security-policy')).toContain(`'nonce-${styleNonce}'`);
        expect(html).not.toMatch(/\sstyle\s*=/);
        expect(html).not.toMatch(/\son(click|load|error|submit)\s*=/);
        expect(html).toContain('name="robots" content="noindex, follow"');
    });

    it('5. locks responsive, wrapping, safe-area and reduced-motion/no-JS layout invariants', async () => {
        const { html } = await renderWelcome();
        const css = inlineStyle(html);
        expect(css).toContain('min-height: 100svh');
        expect(css).toContain('min-height: 100dvh');
        expect(css).toContain('max-width: calc(100vw - 2rem)');
        expect(css).toContain('max-width: 100%');
        expect(css).toContain('flex-wrap: wrap');
        expect(css).toContain('overflow-wrap: anywhere');
        expect(css).toContain('padding-top: max(');
        expect(css).toContain('env(safe-area-inset-top)');
        expect(css).toContain('@media (max-width: 420px)');
        expect(css).toContain('@media (max-height: 700px)');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toMatch(/prefers-reduced-motion:\s*reduce[^]*\.stage\.is-finale\s+\.splash-word\s*\{[^}]*animation:\s*none/s);
        expect(css).toContain('.no-js .splash-word');
        expect(css).toContain('.no-js .fx-layer');
        expect(css).toContain('.no-js .nebula-depth');
        expect(WELCOME_SOURCE).not.toContain('layers[i].style.transform');
    });
});

describe('UNIT41.2-P2 — executable multi-layer Canvas engine', () => {
    it('6. draws sparks with gravity/tails/glow, a depth-projected S-curve ribbon, and approaching stars', async () => {
        const { html } = await renderWelcome();
        const source = inlineScript(html);
        expect(source).toContain('function drawSparks(');
        expect(source).toContain('function drawStardust(');
        expect(source).toContain('function drawStarfield(');
        expect(source).toContain('spark.vy += spark.gravity');
        expect(source).toContain('ribbon.z');
        expect(source).toContain('star.z -= star.speed');
        expect(source).toContain('fov / (fov +');
        expect(WELCOME_SOURCE).toContain('Math.max(1, window.devicePixelRatio || 1)');
        expect(WELCOME_SOURCE).not.toMatch(/devicePixelRatio[^;\n]*Math\.min|Math\.min\([^;\n]*devicePixelRatio/);

        const harness = browserHarness(html, false);
        harness.window.eval(source);
        expect(harness.canvases).toHaveLength(3);
        for (const canvas of harness.canvases) {
            expect(canvas.width).toBe(1170);
            expect(canvas.height).toBe(2532);
        }
        expect(harness.frames).toHaveLength(1);

        harness.frames[0](16);
        expect(harness.calls.some((call) => call.startsWith('stroke('))).toBe(true);
        expect(harness.calls.some((call) => call.startsWith('glow:'))).toBe(true);

        harness.timers.find((timer) => timer.delay === 2800)?.run();
        harness.frames.at(-1)?.(2816);
        harness.timers.find((timer) => timer.delay === 5600)?.run();
        harness.frames.at(-1)?.(5616);
        expect(harness.window.document.getElementById('main-content')?.classList.contains('is-finale')).toBe(true);
        expect(harness.calls.filter((call) => call.startsWith('arc(')).length).toBeGreaterThan(20);
        expect(harness.calls.filter((call) => call.startsWith('setTransform(')).length).toBeGreaterThanOrEqual(3);
        harness.window.close();
    });

    it('7. reduced motion shows the complete finale without creating Canvas or starting RAF', async () => {
        const { html } = await renderWelcome();
        const harness = browserHarness(html, true);
        expect(() => harness.window.eval(inlineScript(html))).not.toThrow();
        expect(harness.window.document.body.classList.contains('no-js')).toBe(false);
        expect(harness.window.document.getElementById('main-content')?.classList.contains('is-finale')).toBe(true);
        expect(harness.frames).toHaveLength(0);
        expect(harness.timers.map((timer) => timer.delay)).toEqual([700]);
        expect(harness.calls).toHaveLength(0);
        harness.window.close();
    });

    it('8. uses only the existing splash translation keys and leaves every locale pack untouched', () => {
        const used = Array.from(WELCOME_SOURCE.matchAll(/sp\.([A-Za-z0-9_]+)/g), (match) => match[1]);
        expect(new Set(used)).toEqual(new Set(['title', 'by_maelsh_pro', 'skip', 'redirect_failed']));
        expect(WELCOME_SOURCE).toContain("['word_1', 'word_2', 'word_3', 'word_4']");
        expect(WELCOME_SOURCE).not.toContain('sp.skip_label');
    });
});
