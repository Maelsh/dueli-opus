/**
 * R1 final owner-acceptance remediation — RED-first contract.
 *
 * A. Profile keeps Competitions/Posts tabs and re-exposes Block via the
 *    existing POST/DELETE /api/blocks contract (no new backend).
 * B. Earnings summary cards are Dueli-brand gradients, not giant solid
 *    emerald/orange/slate blocks.
 * C. Shared active-tab token carries white readable text.
 * D. Shared card: recorded badge gap like Live; textual `vs` replaced by a
 *    small neutral gray Dueli mark.
 * E. Reports moves decorative emphasis to the Dueli palette (no orange theme).
 * F. Donate harmonised with multi-stop Dueli gradients (heart kept).
 * G. Settings selects get a coherent RTL-aware affordance; Danger Zone is a
 *    restrained container with text/icon emphasis (all strings translated).
 * H. Explore search form: no icon/text overlap, RTL-correct padding, aligned
 *    selects sharing the settings affordance.
 * I. No "Showing first results (6)"; View-all actions sit under each section
 *    in Dueli styling (not header-side, not blue).
 * J. No verification badge in user-card presentation; no red avatar ring
 *    (neutral or Dueli gradient ring instead).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import app from '../../src/main';
import { translations } from '../../src/i18n';
import { DUELI_TAB_ACTIVE } from '../../src/shared/constants';
import { getCompetitionCard } from '../../src/shared/components/competition-card';
import { getUserCard } from '../../src/shared/components/user-card';
import { FakeD1 } from '../helpers/fake-d1';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');
const ar = translations.ar as Record<string, unknown>;
const en = translations.en as Record<string, unknown>;

const base = {
    id: 7, title: 'Final', status: 'completed', creator_id: 3,
    creator_name: 'Sara', creator_username: 'sara', creator_avatar: 'https://img/sara.png',
    opponent_id: 4, opponent_name: 'Omar', opponent_username: 'omar', opponent_avatar: 'https://img/omar.png',
} as never;

describe('A — profile content navigation + block', () => {
    it('profile SSR keeps both Competitions and Posts tabs with working switcher', async () => {
        const db = new FakeD1();
        const { UserModel } = await import('../../src/models');
        await new UserModel(db as unknown as D1Database).create({
            email: 'sara@test.com', username: 'sara', display_name: 'Sara',
            bio: '', country: 'SA', language: 'ar',
        });
        const html = await (
            await app.request('/profile/sara?lang=ar', {}, { DB: db } as never)
        ).text();
        expect(html).toContain('id="tab-competitions"');
        expect(html).toContain('id="tab-posts"');
        expect(html).toContain('id="content-competitions"');
        expect(html).toContain('id="content-posts"');
        expect(html).toContain('setProfileTab');
    });

    it('tabs strip stacks above the positioned hero (hero must not swallow tab clicks)', async () => {
        const db = new FakeD1();
        const { UserModel } = await import('../../src/models');
        await new UserModel(db as unknown as D1Database).create({
            email: 'sara@test.com', username: 'sara', display_name: 'Sara',
            bio: '', country: 'SA', language: 'ar',
        });
        const html = await (
            await app.request('/profile/sara?lang=ar', {}, { DB: db } as never)
        ).text();
        // The -mt-16 overlap region belongs to the tabs container: with the
        // hero positioned (decor), only an explicit stacking context above it
        // keeps the tab buttons clickable. Regression of the #72 hero change.
        expect(html).toMatch(/-mt-16 relative z-10/);
    });

    it('profile actions re-expose Block through the existing blocks contract', () => {        const src = readSrc('src/modules/pages/profile-page.ts');
        expect(src, 'block toggle via existing contract').toMatch(/\/api\/blocks/);
        expect(src).toMatch(/toggleBlock|blockUser/);
        for (const key of ['block', 'unblock', 'confirm_block', 'user_blocked', 'user_unblocked']) {
            expect(ar[key], `ar.${key}`).toBeTruthy();
            expect(en[key], `en.${key}`).toBeTruthy();
        }
    });
});

describe('B — earnings cards are Dueli gradients', () => {
    it('no giant solid emerald/orange/slate summary blocks remain', () => {
        const src = readSrc('src/modules/pages/earnings-page.ts');
        expect(src).not.toMatch(/from-emerald-500 to-teal-600/);
        expect(src).not.toMatch(/from-amber-500 to-orange-600/);
        expect(src).not.toMatch(/from-slate-600 to-gray-700/);
    });

    it('three distinct Dueli-brand gradients distinguish the states', () => {
        const src = readSrc('src/modules/pages/earnings-page.ts');
        for (const g of ['DUELI_EARNINGS_AVAILABLE', 'DUELI_EARNINGS_PENDING', 'DUELI_EARNINGS_WITHDRAWN']) {
            expect(src, g).toContain(g);
        }
        const constants = readSrc('src/shared/constants.ts');
        for (const g of ['DUELI_EARNINGS_AVAILABLE', 'DUELI_EARNINGS_PENDING', 'DUELI_EARNINGS_WITHDRAWN']) {
            expect(constants, g).toContain(g);
        }
        // Dueli family only — no flat single colors, no slate wash.
        expect(constants).not.toMatch(/DUELI_EARNINGS_AVAILABLE = '[^']*from-slate/);
    });
});

describe('C — active tabs carry white readable text', () => {
    it('the shared active-tab token includes white text', () => {
        expect(DUELI_TAB_ACTIVE).toMatch(/text-white/);
        expect(DUELI_TAB_ACTIVE).toMatch(/from-purple-600/);
    });

    it('my-competitions and my-requests active tabs render white text', async () => {
        for (const path of ['/my-competitions', '/my-requests']) {
            const html = await (
                await app.request(`${path}?lang=ar`, {}, { DB: new FakeD1() } as never)
            ).text();
            expect(html, `${path} active tab`).toMatch(/text-white/);
        }
    });
});

describe('D — shared competition card polish', () => {
    it('recorded badge matches the Live icon+gap treatment', () => {
        const css = readSrc('src/styles.css');
        const recorded = /[.]badge-recorded\s*{[^}]*}/.exec(css);
        expect(recorded, '.badge-recorded rule').toBeTruthy();
        expect(recorded![0]).toMatch(/inline-flex/);
        expect(recorded![0]).toMatch(/gap:\s*6px/);
    });

    it('no textual `vs` separator; small neutral gray Dueli mark instead', () => {
        const html = getCompetitionCard(base, 'ar');
        // The old visible text separator is gone …
        expect(html).not.toMatch(/text-gray-300">vs</);
        // … replaced by the gray Dueli mark (footer identity, subtle) …
        expect(html).toMatch(/grayscale/);
        expect(html).toMatch(/dueli-icon\.png/);
        // … with screen-reader meaning preserved, bright battle logo untouched.
        expect(html).toMatch(/sr-only/);
    });

    it('centre logo timing fix and card data survive the polish', () => {
        const html = getCompetitionCard(base, 'en');
        expect(html).toMatch(/fetchpriority="high"/);
        expect(html).toContain('Final');
        expect(html).toContain('badge-recorded');
        expect(html).toContain('/profile/sara');
        expect(html).toContain('/profile/omar');
    });
});

describe('E — reports without the orange theme', () => {
    it('decorative emphasis uses the Dueli palette', () => {
        const src = readSrc('src/modules/pages/reports-page.ts');
        expect(src).not.toMatch(/from-orange-600 to-red-600/);
        expect(src).not.toMatch(/accent-orange-600/);
        expect(src).toMatch(/DUELI_PRIMARY_BTN|from-purple-600 to-indigo-600/);
    });
});

describe('F — donate harmonised with Dueli', () => {
    it('no flat pink/red dominance; multi-stop Dueli gradients instead', () => {
        const src = readSrc('src/modules/pages/donate-page.ts');
        expect(src).not.toMatch(/from-pink-500 to-red-600/);
        expect(src).not.toMatch(/from-pink-600 to-red-600/);
        expect(src).toMatch(/from-purple-600.*via-.*to-indigo-600|via-fuchsia-500|via-pink-500/);
    });

    it('heart/support meaning retained', () => {
        const src = readSrc('src/modules/pages/donate-page.ts');
        expect(src).toMatch(/fa-heart/);
    });
});

describe('G — settings selects + danger zone', () => {
    it('selects share a coherent RTL-aware affordance (native behavior kept)', () => {
        const src = readSrc('src/modules/pages/settings-page.ts');
        expect(src).toMatch(/appearance-none/);
        expect(src).toMatch(/fa-chevron-down/);
        // Native select element preserved (keyboard/accessibility intact).
        expect(src).toContain('<select');
    });

    it('danger zone is restrained: neutral container, text/icon emphasis', () => {
        const src = readSrc('src/modules/pages/settings-page.ts');
        expect(src).not.toMatch(/bg-red-50[\s"']/);
        expect(src).toMatch(/text-red-600/);
        // Subtle emphasis honors reduced-motion (no raw rapid flashing).
        expect(src).toMatch(/motion-safe:|prefers-reduced-motion|animate-pulse/);
        expect(src).toMatch(/motion-reduce:animate-none|@media \(prefers-reduced-motion/);
    });

    it('every visible danger-zone string is translated ar+en', () => {
        for (const key of ['danger_zone', 'delete_account', 'delete_account_warning', 'confirm_delete_account']) {
            expect(ar[key], `ar.${key}`).toBeTruthy();
            expect(en[key], `en.${key}`).toBeTruthy();
        }
    });
});

describe('H — explore search form coherence', () => {
    it('search padding is RTL-correct (icon side gets the room)', () => {
        const src = readSrc('src/modules/pages/explore-page.ts');
        // RTL: icon sits at right-4 so the input needs pr-12; LTR mirrors.
        expect(src).toMatch(/\$\{rtl \? 'pr-12 pl-4' : 'pl-12 pr-4'\}/);
    });

    it('selects reuse the shared affordance', () => {
        const src = readSrc('src/modules/pages/explore-page.ts');
        expect(src).toMatch(/appearance-none/);
        expect(src).toMatch(/fa-chevron-down/);
    });
});

describe('I — view-all placement without the redundant line', () => {
    it('no "showing first results" redundancy in the preview renderer', () => {
        const src = readSrc('src/modules/pages/explore-page.ts');
        // The preview grid no longer interpolates a "showing first" line;
        // the header count plus the under-section View-all carry the journey.
        expect(src).not.toMatch(/showing_first \|\|/);
        expect(src).not.toMatch(/Showing first results/);
    });

    it('view-all actions render under each section in Dueli styling', async () => {
        const html = await (
            await app.request('/explore?search=x&lang=ar', {}, { DB: new FakeD1() } as never)
        ).text();
        expect(html).toContain('id="compsViewAllUnder"');
        expect(html).toContain('id="usersViewAllUnder"');
        expect(html).toMatch(/from-purple-600 to-indigo-600/);
    });
});

describe('J — user cards without verification badge or red ring', () => {
    it('shared user-card has no verification badge and no red ring', () => {
        const html = getUserCard(
            { id: 1, username: 'sara', display_name: 'Sara', is_verified: true, is_busy: true } as never,
            'ar',
        );
        expect(html).not.toMatch(/fa-check/);
        expect(html).not.toMatch(/bg-blue-500/);
        expect(html).not.toMatch(/border-red-500/);
        expect(html).toContain('/profile/sara');
    });

    it('explore inline user cards follow the same rule', () => {
        const src = readSrc('src/modules/pages/explore-page.ts');
        expect(src).not.toMatch(/is_verified \?/);
        expect(src).not.toMatch(/border-red-500/);
    });
});
