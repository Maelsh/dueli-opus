/**
 * PR #71 blocker — My Requests tabs must have ONE source of truth for the
 * active/inactive state.
 *
 * The server-rendered `#tab-received` still started with the legacy flat
 * `bg-purple-600 text-white`, while the new `setTab()` only removed/added the
 * shared `DUELI_TAB_ACTIVE` / `DUELI_TAB_INACTIVE` token classes. Selecting
 * another tab therefore left the original tab with BOTH `text-white` and
 * `text-gray-600` and still painted purple — two "active" tabs at once.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import app from '../../src/main';
import { DUELI_TAB_ACTIVE, DUELI_TAB_INACTIVE } from '../../src/shared/constants';
import { FakeD1 } from '../helpers/fake-d1';

const LEGACY_ACTIVE = ['bg-purple-600'];
// NOTE (R1): `text-white` used to be part of the legacy flat pair, but the
// canonical DUELI_TAB_ACTIVE token now carries it (white text on the Dueli
// gradient). The remaining legacy marker is the flat purple background.

const tabClass = (html: string, id: string): string => {
    const m = new RegExp(`id="${id}"[^>]*class="([^"]*)"`).exec(html);
    expect(m, `tab ${id} not rendered`).toBeTruthy();
    return m![1];
};

async function render(): Promise<string> {
    return (await app.request('/my-requests?lang=ar', {}, { DB: new FakeD1() } as never)).text();
}

describe('my-requests initial tab state uses the shared tokens', () => {
    it('the initially active Received tab renders DUELI_TAB_ACTIVE, not legacy flat classes', async () => {
        const cls = tabClass(await render(), 'tab-received');
        for (const c of DUELI_TAB_ACTIVE.split(' ').filter(Boolean)) {
            expect(cls, `missing active token class "${c}"`).toContain(c);
        }
        for (const legacy of LEGACY_ACTIVE) {
            expect(cls, `legacy active class "${legacy}" still present`).not.toContain(legacy);
        }
    });

    it('the inactive tabs render DUELI_TAB_INACTIVE and no active token', async () => {
        const html = await render();
        for (const id of ['tab-sent', 'tab-invitations']) {
            const cls = tabClass(html, id);
            for (const c of DUELI_TAB_INACTIVE.split(' ').filter(Boolean)) {
                expect(cls, `${id} missing inactive token class "${c}"`).toContain(c);
            }
            for (const c of DUELI_TAB_ACTIVE.split(' ').filter(Boolean)) {
                expect(cls, `${id} must not carry the active token "${c}"`).not.toContain(c);
            }
        }
    });

    it('no tab is rendered with both active and inactive token classes', async () => {
        const html = await render();
        const active = DUELI_TAB_ACTIVE.split(' ').filter(Boolean);
        const inactive = DUELI_TAB_INACTIVE.split(' ').filter(Boolean);
        for (const id of ['tab-received', 'tab-sent', 'tab-invitations']) {
            const cls = tabClass(html, id);
            const hasActive = active.some((c) => cls.includes(c));
            const hasInactive = inactive.some((c) => cls.includes(c));
            expect(hasActive && hasInactive, `${id} has contradictory state classes`).toBe(false);
        }
    });

    it('the tabs are actually wired: window.setTab is bound for CSP delegation', () => {
        const src = readFileSync(resolve(__dirname, '../../src/modules/pages/my-requests-page.ts'), 'utf-8');
        // Without the binding the delegated data-csp-fn="setTab" resolves to
        // nothing and the tab strip is dead, so no state source can be true.
        expect(src).toContain('window.setTab = setTab;');
    });

    it('setTab clears BOTH the active and the inactive token classes', () => {
        const src = readFileSync(resolve(__dirname, '../../src/modules/pages/my-requests-page.ts'), 'utf-8');
        expect(src).toContain('classList.remove(...ACTIVE_TAB_CLASSES)');
        expect(src).toContain('classList.add(...INACTIVE_TAB_CLASSES)');
        expect(src).toContain('active.classList.add(...ACTIVE_TAB_CLASSES)');
        expect(src).toContain('active.classList.remove(...INACTIVE_TAB_CLASSES)');
        // No leftover per-page duplicate of the gradient definition.
        expect(src).not.toMatch(/class="[^"]*bg-purple-600 text-white/);
    });
});
