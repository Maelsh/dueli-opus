/**
 * Owner visual-acceptance remediation (post PR #71) — RED-first contract.
 *
 * A. Card centre logo: PR #71 removed loading="lazy" but the logo asset is
 *    still discovered late on every surface (no <link rel="preload">, no
 *    fetchpriority), so SSR surfaces (profile) and auth-gated client surfaces
 *    (my-competitions) still paint the blank white disc first.
 * B. Profile hero: must be a visibly blended multi-stop Dueli composition,
 *    not one flat purple field.
 * C. Coherence: earnings/reports/donate share one card/input/section product
 *    language (semantic accent colours preserved) with no i18n leakage.
 * D. Explore: search + filters on the page, 6+6 independent previews, and a
 *    dedicated view-all per section — no ranking/retrieval change.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import app from '../../src/main';
import { translations } from '../../src/i18n';
import { generateHTML } from '../../src/shared/templates/layout';
import {
    DUELI_HERO_GRADIENT,
    DUELI_CARD,
    DUELI_INPUT,
} from '../../src/shared/constants';
import { getCompetitionCard } from '../../src/shared/components/competition-card';
import { FakeD1 } from '../helpers/fake-d1';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

const base = {
    id: 7,
    title: 'Final',
    status: 'completed',
    creator_id: 3,
    creator_name: 'Sara',
    creator_username: 'sara',
    creator_avatar: 'https://img/sara.png',
    opponent_id: 4,
    opponent_name: 'Omar',
    opponent_username: 'omar',
    opponent_avatar: 'https://img/omar.png',
} as never;

describe('A — centre logo is discovered at parse time on every surface', () => {
    it('the document head preloads the single shared logo asset', () => {
        const html = generateHTML('<p>hi</p>', 'ar', 't', 'nonce-1');
        expect(html).toMatch(/<link rel="preload" as="image" href="\/static\/dueli-icon\.png"/);
    });

    it('every card-rendering surface serves the preload (home/profile/explore/my-competitions)', async () => {
        for (const path of ['/', '/profile/sara', '/explore', '/my-competitions']) {
            const html = await (
                await app.request(`${path}?lang=ar`, {}, { DB: new FakeD1() } as never)
            ).text();
            expect(html, `${path} must preload the card logo`).toMatch(
                /<link rel="preload" as="image" href="\/static\/dueli-icon\.png"/,
            );
        }
    });

    it('the centre logo carries fetchpriority="high" (wins the race vs remote avatars)', () => {
        const html = getCompetitionCard(base, 'ar');
        const centre = /<div class="w-12 h-12 bg-white rounded-full[^"]*">\s*<img([^>]*)>/.exec(html);
        expect(centre, 'centre circle + logo').toBeTruthy();
        expect(centre![1]).toMatch(/fetchpriority="high"/);
        expect(centre![1]).not.toMatch(/loading="lazy"/);
    });
});

describe('B — profile hero is a visibly blended Dueli composition', () => {
    it('the hero token carries three or more stops (a real transition, not one flat field)', () => {
        const stops = DUELI_HERO_GRADIENT.match(/(from-|via-|to-)[a-z-\[\]#0-9]+/g) ?? [];
        expect(stops.length, `hero stops in "${DUELI_HERO_GRADIENT}"`).toBeGreaterThanOrEqual(3);
        // Still the Dueli family — no all-blue, no rainbow.
        expect(DUELI_HERO_GRADIENT).toMatch(/purple|violet/);
        expect(DUELI_HERO_GRADIENT).not.toMatch(/red|green|yellow|orange/);
    });

    it('the hero surface carries depth layers (not a flat gradient alone)', () => {
        const src = readSrc('src/modules/pages/profile-page.ts');
        expect(src).toContain('${DUELI_HERO_DECOR}');
        const decor = readSrc('src/shared/constants.ts');
        expect(decor, 'depth overlay in the hero').toMatch(/blur-[23]?xl|bg-white\/\[0\.04\]|radial/);
    });

    it('profile data, avatar, stats and RTL/LTR wiring are preserved', () => {
        const src = readSrc('src/modules/pages/profile-page.ts');
        expect(src).toContain('user.avatar_url');
        expect(src).toContain('stats.competitions');
        expect(src).toContain('stats.followers');
        expect(src).toContain("${rtl ? 'text-right' : 'text-left'}");
        expect(src).toContain('edit_profile');
    });
});

describe('C — one product language on earnings/reports/donate', () => {
    it('the shared card + input tokens exist and keep semantic freedom', () => {
        expect(DUELI_CARD, 'DUELI_CARD token').toMatch(/rounded-2xl/);
        expect(DUELI_CARD).toMatch(/dark:/);
        expect(DUELI_INPUT, 'DUELI_INPUT token').toMatch(/rounded-xl/);
        expect(DUELI_INPUT).toMatch(/focus:ring-2/);
    });

    it('all three touched surfaces render through the shared card token', () => {
        for (const rel of [
            'src/modules/pages/earnings-page.ts',
            'src/modules/pages/reports-page.ts',
            'src/modules/pages/donate-page.ts',
        ]) {
            expect(readSrc(rel), rel).toContain('DUELI_CARD');
        }
    });

    it('semantic accent colours survive (no all-purple wash)', () => {
        expect(readSrc('src/modules/pages/earnings-page.ts')).toMatch(/emerald|teal/);
        expect(readSrc('src/modules/pages/reports-page.ts')).toMatch(/orange|red/);
        expect(readSrc('src/modules/pages/donate-page.ts')).toMatch(/pink|red/);
    });

    it('no English leakage on the touched Arabic surfaces', () => {
        const ar = translations.ar as Record<string, unknown>;
        for (const key of [
            'withdrawal_history',
            'no_withdrawal_history',
            'description',
            'popular',
            'submit_withdrawal',
            'payment_details',
            'payment_method',
            'bank_transfer',
            'amount',
        ]) {
            expect(ar[key], `ar.${key}`).toBeTruthy();
        }
        const en = translations.en as Record<string, unknown>;
        for (const key of ['withdrawal_history', 'no_withdrawal_history', 'description', 'popular']) {
            expect(en[key], `en.${key}`).toBeTruthy();
        }
    });
});

describe('D — explore/search structure (no ranking change)', () => {
    const get = (path: string) =>
        app.request(path, {}, { DB: new FakeD1() } as never).then((r) => r.text());

    it('the results page carries its own search input + competition filters', async () => {
        const html = await get('/explore?search=finals&lang=ar');
        expect(html).toContain('id="searchInput"');
        expect(html).toContain('id="categoryFilter"');
        expect(html).toContain('id="statusFilter"');
        // The query/filter context survives server rendering (back-nav safe).
        expect(html).toContain('value="finals"');
    });

    it('preview sections are capped at 6 + 6 with independent view-all links', async () => {
        const html = await get('/explore?search=finals&lang=ar');
        expect(html).toMatch(/view=competitions/);
        expect(html).toMatch(/view=users/);
        const src = readSrc('src/modules/pages/explore-page.ts');
        expect(src).toMatch(/PREVIEW_COMPETITIONS\s*=\s*6/);
        expect(src).toMatch(/PREVIEW_USERS\s*=\s*6/);
    });

    it('retrieval contracts are unchanged (same endpoints, same params)', () => {
        const src = readSrc('src/modules/pages/explore-page.ts');
        expect(src).toContain('/api/competitions?');
        expect(src).toContain('/api/search/users?');
        // No retrieval/ranking semantics live in this page: no SQL, no
        // scoring, no ordering — it only pages the existing contracts.
        expect(src).not.toMatch(/ORDER BY|orderBy|\.sort\(|score\(|recommendation/i);
    });

    it('new search i18n exists in both languages', () => {
        for (const key of ['view_all_competitions', 'view_all_users', 'back_to_results', 'filters']) {
            expect((translations.ar as Record<string, unknown>)[key], `ar.${key}`).toBeTruthy();
            expect((translations.en as Record<string, unknown>)[key], `en.${key}`).toBeTruthy();
        }
    });
});
