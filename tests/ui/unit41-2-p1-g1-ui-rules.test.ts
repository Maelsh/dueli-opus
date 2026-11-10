/**
 * UNIT41.2-P1 (G1) — UI polish rules (real built stylesheet + components).
 *
 * Contract under test:
 * - `.user-menu-item.hidden` is display:none with !important (admin item
 *   never leaks as a ghost menu row before JS hides it).
 * - scroll-snap is disabled while edge-hover auto-scrolling
 *   (`.dueli-auto-scrolling + .row-scroll`), so snap cannot fight the helper.
 * - The rule reaches the BUILT stylesheet the pages actually load.
 * - guide-nav table is separated from the banner (mt-6 pt-2).
 * - login-modal OAuth buttons stack vertical and full-width.
 * - the user menu carries the collections quick link (G6 surface).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf-8');

describe('UNIT41.2-P1 G1 — UI rules', () => {
    it('1. .user-menu-item.hidden is display:none !important (styles.css)', () => {
        const css = read('src/styles.css');
        expect(css).toMatch(/\.user-menu-item\.hidden\s*\{[^}]*display:\s*none\s*!important/);
    });

    it('2. scroll-snap is switched off while auto-scrolling', () => {
        const css = read('src/styles.css');
        expect(css).toMatch(/\.dueli-auto-scrolling/);
        expect(css).toMatch(/dueli-auto-scrolling[^{]*\{[^}]*scroll-snap-type:\s*none/);
        // The helper toggles exactly this class.
        const helper = read('src/client/ui/edge-hover-scroll.ts');
        expect(helper).toMatch(/classList\.add\('dueli-auto-scrolling'\)/);
        expect(helper).toMatch(/classList\.remove\('dueli-auto-scrolling'\)/);
    });

    it('3. the built stylesheet ships the hidden-menu rule', () => {
        const dist = read('public/static/styles.css');
        expect(dist).toMatch(/user-menu-item\.hidden/);
        expect(dist).toMatch(/dueli-auto-scrolling/);
    });

    it('4. guide-nav separates the tab bar from the banner', () => {
        const nav = read('src/shared/components/guide-nav.ts');
        expect(nav).toMatch(/class="mt-6 pt-2 mb-10"/);
    });

    it('5. login-modal OAuth buttons stack vertical at full width', () => {
        const modal = read('src/shared/components/login-modal.ts');
        expect(modal).toMatch(/grid\s+grid-cols-1\s+gap-3/);
    });

    it('6. the user menu links the collections card (anchor on the profile page)', () => {
        const nav = read('src/shared/components/navigation.ts');
        expect(nav).toMatch(/#profileCollections/);
        const profile = read('src/modules/pages/profile-page.ts');
        expect(profile).toMatch(/profileCollections/);
    });
});
