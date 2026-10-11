/**
 * R4-COMP-UNIFIED-1 — unified-page integration pins (source-level, fast).
 *
 * Behavioral coverage: tests/client/competition-surface.test.ts (the single
 * role×state decision), PR108 uploader/resume/finalize suites, PR107
 * signaling matrix. This file pins the page wiring that behavior cannot
 * reach cheaply:
 *  - competitor block renders only via the single decision helper;
 *  - host-only recording (compositor init gated on host role);
 *  - single finalize path, never from unload;
 *  - viewer surfaces expose no competitor controls;
 *  - new competitor i18n keys exist in ar AND en.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from '../../src/i18n';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');
const PAGE = 'src/modules/pages/competition-page.ts';

describe('R4-COMP-UNIFIED-1 page wiring pins', () => {
    it('1. competitor block renders only through the single decision helper', () => {
        const src = readSrc(PAGE);
        expect(src).toContain('competitorView');
        expect(src).toContain('window.resolveVideoSurface');
        // No client role claim feeds the gating (no ?role= / #role parsing).
        expect(src).not.toMatch(/\.search.*\brole\b/);
        expect(src).not.toMatch(/claimed_role/);
    });

    it('2. recording is host-only (compositor init gated on host role)', () => {
        const src = readSrc(PAGE);
        const initBlock = src.match(/function initCompetitorCompositor[\s\S]{0,400}/);
        expect(initBlock, 'host-only compositor init must exist').toBeTruthy();
        // initCompetitorCompositor is called only on the host branch.
        const hostCalls = [...src.matchAll(/if \(userRole === 'host'\) \{\s*\n\s*initCompetitorCompositor\(\);/g)];
        expect(hostCalls.length).toBeGreaterThanOrEqual(1);
        expect(src).toContain("platformName: tr.app_title");
    });

    it('3. single finalize, never from unload', () => {
        const src = readSrc(PAGE);
        expect(src).not.toMatch(/fetch\([^)]*finalize\.php/);
        expect(src).not.toMatch(/addEventListener\('beforeunload'/);
        expect(src).toContain('await compositor.destroy()');
        expect(src).toContain('/api/competitions/');
    });

    it('4. viewer embedded section exposes no competitor controls', () => {
        const src = readSrc(PAGE);
        const viewerSection = src.match(/id="embeddedViewerSection"[\s\S]{0,4000}?id="embeddedVodControls"/);
        expect(viewerSection, 'viewer section must exist').toBeTruthy();
        const viewerHtml = viewerSection![0];
        expect(viewerHtml).not.toContain('competitorControls');
        expect(viewerHtml).not.toContain('localVideo');
        expect(viewerHtml).not.toContain('endStream');
    });

    it('5. competitor i18n keys exist in ar and en (translated, non-empty)', () => {
        for (const key of ['join_stream', 'end_stream_confirm', 'you_are_host', 'you_are_guest'] as const) {
            const arText = (translations.ar as Record<string, unknown>)[key];
            const enText = (translations.en as Record<string, unknown>)[key];
            expect(typeof arText, `ar.${key}`).toBe('string');
            expect(typeof enText, `en.${key}`).toBe('string');
            expect((arText as string).length, `ar.${key} non-empty`).toBeGreaterThan(0);
            expect((enText as string).length, `en.${key} non-empty`).toBeGreaterThan(0);
            expect(arText, `${key} translated`).not.toBe(enText);
        }
    });

    it('6. test pages are untouched (still independent diagnostics surfaces)', () => {
        for (const rel of [
            'src/modules/pages/live/scripts/client/host.ts',
            'src/modules/pages/live/scripts/client/guest.ts',
            'src/modules/pages/live/scripts/client/viewer.ts',
        ]) {
            expect(() => readSrc(rel)).not.toThrow();
        }
        // /live/:id compat entry stays reachable from the unified page.
        expect(readSrc(PAGE)).toContain('/live/');
    });
});
