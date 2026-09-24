/**
 * R1.6 — Live room (/live/:id) controls repair (P11-006 / P11-007).
 *
 * Proven defects in src/modules/pages/live-room-page.ts (still live):
 *   F1 duplicate IDs: two `commentsOverlay` + two `commentsContainer`
 *       blocks — getElementById targeting is split, viewer comments can
 *       never reach their overlay.
 *   F2 debug control in prod: `clearDataBtn` ("for debugging") rendered
 *       unconditionally for every role (V4 acceptance: absent).
 *   F3 no comment input: window.sendComment reads #commentInput, but no
 *       such element exists and nothing invokes it — commenting from the
 *       room is impossible.
 *   F4 unsafe sink on the comment path: sendComment concatenates the raw
 *       text into innerHTML (same reflected-XSS class as R1.1) — must be
 *       textContent now that the input exists.
 *
 * Verified CORRECT/stale, untouched: home live-list envelopes
 * (CompetitionController returns a bare array; HomePage readers match),
 * end-stream POST /api/competitions/:id/end (route exists), ad 404
 * fallback (__ancestorDisplayNone delegate present), /live/host|guest
 * entry (canonical plan-16 streaming flow, not stubs).
 * Backend-gated remainders (noted, not fixed): live viewer count
 * (no UI-side presence contract), signaling leave + finalize teardown,
 * realtime fan-out of others' comments.
 *
 * Tests render the real handler (fetch stubbed for the server-side
 * competition lookup) and execute the page's OWN sendComment.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from '../../src/i18n';
import { liveRoomPage } from '../../src/modules/pages/live-room-page';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

const PAGE = 'src/modules/pages/live-room-page.ts';

function mockCtx(lang: 'ar' | 'en') {
    return {
        get: (k: string) => (k === 'lang' ? lang : k === 'cspNonce' ? 'test-nonce' : null),
        html: (s: string) => s,
        req: { url: `http://localhost/live/7?lang=${lang}`, param: () => '7' },
    } as never;
}

async function renderRoom(lang: 'ar' | 'en'): Promise<string> {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
        new Response(JSON.stringify({ success: true, data: { id: 7, title: 'Room', status: 'live' } }), {
            headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch;
    try {
        return (await (liveRoomPage as (c: never) => Promise<string>)(mockCtx(lang))) as string;
    } finally {
        globalThis.fetch = realFetch;
    }
}

const countId = (html: string, id: string) =>
    [...html.matchAll(new RegExp(`id="${id}"`, 'g'))].length;

/** Extract the page's OWN sendComment and run it against fakes. */
function runPageSendComment(src: string, inputValue: string) {
    const m = src.match(/window\.sendComment = (function\(\) \{[\s\S]*?\n            \});/);
    expect(m, 'page must define its own window.sendComment').toBeTruthy();
    const appended: Record<string, unknown>[] = [];
    const assigned: { kind: string; value: unknown }[] = [];
    const fakeInput = { value: inputValue };
    const fakeContainer = {
        appendChild: (c: unknown) => void appended.push(c as Record<string, unknown>),
        append: (...c: unknown[]) => void appended.push(...(c as Record<string, unknown>[])),
        scrollTop: 0,
        scrollHeight: 0,
    };
    const fakeDocument = {
        getElementById: (id: string) => (id === 'commentInput' ? fakeInput : fakeContainer),
        createElement: () => {
            const node: Record<string, unknown> = { children: [] as unknown[] };
            Object.defineProperties(node, {
                innerHTML: { set: (v: unknown) => void assigned.push({ kind: 'innerHTML', value: v }) },
                textContent: { set: (v: unknown) => void assigned.push({ kind: 'textContent', value: v }) },
            });
            (node as Record<string, unknown>).append = (...c: unknown[]) =>
                void (node.children as unknown[]).push(...c);
            (node as Record<string, unknown>).appendChild = (c: unknown) =>
                void (node.children as unknown[]).push(c);
            return node;
        },
    };
    const fn = new Function(
        'document',
        'window',
        'log',
        `return (${(m as RegExpMatchArray)[1]});`,
    );
    // Invoke the page's own sendComment with fakes.
    const send = fn(fakeDocument, { currentUser: { username: 'u' } }, () => {}) as () => void;
    send();
    return { appended, assigned, input: fakeInput };
}

describe('R1.6 live room comment DOM (P11-007)', () => {
    it.each(['en', 'ar'] as const)('single comments overlay+container (%s)', async (lang) => {
        const html = await renderRoom(lang);
        expect(countId(html, 'commentsContainer')).toBe(1);
        expect(countId(html, 'commentsOverlay')).toBe(1);
    });

    it('exposes a comment input wired to the page sendComment', async () => {
        const html = await renderRoom('en');
        expect(html).toContain('id="commentInput"');
        expect(html).toContain('data-csp-fn="sendComment"');
        expect(html).toContain(translations.en.add_comment);
        const ar = await renderRoom('ar');
        expect(ar).toContain(translations.ar.add_comment);
    });

    it('renders HTML/SVG comment text as inert text, never markup (behavioral)', () => {
        const payload = '<svg onload=alert(1)>';
        const { appended, assigned } = runPageSendComment(readSrc(PAGE), payload);
        expect(appended.length).toBeGreaterThan(0);
        expect(
            assigned.filter((a) => a.kind === 'innerHTML' && String(a.value).includes('<')),
            'raw comment text must never reach innerHTML',
        ).toEqual([]);
        expect(
            assigned.some((a) => a.kind === 'textContent' && a.value === payload),
            'comment text must land via textContent',
        ).toBe(true);
    });
});

describe('R1.6 live room debug control (P11-006)', () => {
    it.each(['en', 'ar'] as const)('no clear-site-data button for any role (%s)', async (lang) => {
        const html = await renderRoom(lang);
        expect(html, 'debug clearDataBtn must be gone').not.toContain('id="clearDataBtn"');
        expect(html).not.toContain('data-csp-fn="clearSiteData"');
    });
});
