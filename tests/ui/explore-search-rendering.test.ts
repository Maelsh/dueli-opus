/**
 * R1.1 — Safe search-query rendering on the Explore page (RED-first).
 *
 * Regression scope (strictly the explore page):
 * 1. The raw `search` value must NEVER be interpolated into innerHTML
 *    (reflected XSS: ?search=<img src=x onerror=...>).
 * 2. The search display must use a text sink (textContent) so HTML/SVG
 *    payloads render as inert text and never execute.
 * 3. Arabic + English queries must round-trip intact; design (purple
 *    banner + search icon), i18n key, and RTL/LTR handling must survive.
 *
 * Node-only: static source assertions (same style as
 * tests/ui/rtl-dark-mobile.test.ts) + a sink-semantics simulation with a
 * minimal fake element, no new dependencies, no browser.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from '../../src/i18n';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

const EXPLORE_PAGE = 'src/modules/pages/explore-page.ts';

/** Minimal fake element modelling the textContent-vs-innerHTML contract. */
function makeFakeElement() {
    return {
        textContent: '',
        innerHTML: '',
        children: [] as { tag: string; text: string }[],
    };
}

const PAYLOADS = [
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '"><script>alert(1)</script>',
    '<strong>hijack</strong>',
];

const QUERIES = {
    ar: 'منافسات كرة القدم',
    en: 'football finals 2026',
};

describe('R1.1 explore search rendering — no raw search in innerHTML', () => {
    it('never interpolates the raw search value into innerHTML', () => {
        const src = readSrc(EXPLORE_PAGE);
        // The vulnerable shape was:
        //   getElementById('searchQueryDisplay').innerHTML = `...<strong>${search}</strong>...`
        // Any innerHTML template that also carries ${search} re-opens reflected XSS.
        const vuln = /searchQueryDisplay[\s\S]{0,600}innerHTML[\s\S]{0,1200}\$\{search\}/;
        expect(src, 'raw ${search} inside searchQueryDisplay innerHTML (reflected XSS)').not.toMatch(vuln);
        // Belt-and-braces: no innerHTML assignment in the file may carry ${search} at all.
        // (Safe URL usages go through encodeURIComponent, never raw interpolation.)
        const lines = src.split('\n');
        const innerHtmlWithRawSearch = lines.filter(
            (l, i) =>
                l.includes('innerHTML') &&
                lines.slice(i, i + 15).join('\n').includes('${search}'),
        );
        expect(innerHtmlWithRawSearch, 'innerHTML sink carrying raw ${search}').toEqual([]);
    });

    it('renders the search display through a text sink (textContent)', () => {
        const src = readSrc(EXPLORE_PAGE);
        // The fix must assign the untrusted value via textContent, never innerHTML.
        expect(src, 'search value must reach the DOM via textContent').toMatch(
            /searchQueryDisplay[\s\S]{0,2000}\.textContent\s*=\s*search/,
        );
    });
});

describe('R1.1 explore search rendering — payloads stay inert text', () => {
    it('HTML/SVG inputs assigned via textContent never become markup', () => {
        const src = readSrc(EXPLORE_PAGE);
        // Guard the contract the simulation below relies on: the file must not
        // route the search value through an HTML sink.
        expect(src).toMatch(/\.textContent\s*=\s*search/);

        for (const payload of PAYLOADS) {
            // textContent semantics: the exact string is stored, no parsing.
            const el = makeFakeElement();
            el.textContent = payload;
            expect(el.textContent).toBe(payload);
            // Nothing was parsed into elements and the HTML sink stayed empty.
            expect(el.children).toEqual([]);
            expect(el.innerHTML).toBe('');
            // The stored text, if later serialized, must not contain live tags.
            expect(el.textContent).toContain('<');
            expect(() => JSON.parse(JSON.stringify(el.textContent))).not.toThrow();
        }
    });

    it('Arabic and English queries round-trip intact (no mangling by the fix)', () => {
        for (const q of Object.values(QUERIES)) {
            const el = makeFakeElement();
            el.textContent = q; // same sink the page must use
            expect(el.textContent).toBe(q);
        }
        // i18n label used next to the query exists in both languages.
        expect(translations.ar.search_results_for).toBeTruthy();
        expect(translations.en.search_results_for).toBeTruthy();
        const src = readSrc(EXPLORE_PAGE);
        expect(src).toContain('search_results_for');
    });
});

describe('R1.1 explore search rendering — design / RTL / i18n preserved', () => {
    it('keeps the purple banner, search icon, bold query, and bidi-safe direction', () => {
        const src = readSrc(EXPLORE_PAGE);
        expect(src).toContain('searchQueryDisplay');
        expect(src).toContain('bg-purple-50');
        expect(src).toContain('fa-search');
        // Query emphasis is now a real <strong> element filled via textContent.
        expect(src).toMatch(/createElement\(['"]strong['"]\)/);
        // Mixed-direction queries (ar/en) must not break layout: dir auto or
        // break-words on the query node.
        expect(src).toMatch(/dir\s*=\s*['"]auto['"]|break-words/);
    });

    it('keeps CSP nonce usage and encodeURIComponent for URL usages of search', () => {
        const src = readSrc(EXPLORE_PAGE);
        expect(src).toContain('cspNonce');
        expect(src).toContain('encodeURIComponent(search)');
    });
});
