/**
 * Primary visual consistency + profile hero, on the auth-gated surfaces that
 * were still painted with a flat `bg-purple-600` instead of the canonical
 * Dueli purple→indigo identity, and the blue-dominant profile hero.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import app from '../../src/main';
import {
    DUELI_AUTH_GRADIENT,
    DUELI_HERO_GRADIENT,
    DUELI_PRIMARY_BTN,
    DUELI_PRIMARY_GRADIENT,
} from '../../src/shared/constants';
import { FakeD1 } from '../helpers/fake-d1';
import { getCompetitionCard } from '../../src/shared/components/competition-card';

/** Auth-gated pages whose login/retry/empty CTAs must share the primary token. */
const AUTH_GATED_PAGES = [
    '/settings',
    '/reports',
    '/earnings',
    '/messages',
    '/my-requests',
    '/notifications',
] as const;

describe('canonical primary treatment on every auth-gated surface', () => {
    it.each(AUTH_GATED_PAGES)('%s drops the flat purple CTA for the shared token', async (path) => {
        const html = await (await app.request(`${path}?lang=ar`, {}, { DB: new FakeD1() } as never)).text();
        expect(html).not.toMatch(/class="[^"]*bg-purple-600 text-white rounded-full/);
    });

    it.each(AUTH_GATED_PAGES)('%s exposes the shared primary token to its script', async (path) => {
        const html = await (await app.request(`${path}?lang=ar`, {}, { DB: new FakeD1() } as never)).text();
        expect(html).toContain(DUELI_PRIMARY_BTN);
    });

    it('the token is the canonical purple→indigo identity', () => {
        expect(DUELI_PRIMARY_GRADIENT).toBe('bg-gradient-to-r from-purple-600 to-indigo-600');
        expect(DUELI_PRIMARY_BTN).toContain(DUELI_PRIMARY_GRADIENT);
        expect(DUELI_AUTH_GRADIENT).toBe(DUELI_PRIMARY_GRADIENT);
    });

    it('My Competitions keeps its already-canonical treatment (no regression)', async () => {
        const html = await (await app.request('/my-competitions?lang=ar', {}, { DB: new FakeD1() } as never)).text();
        expect(html).toContain(DUELI_PRIMARY_BTN);
        expect(html).not.toMatch(/class="[^"]*bg-purple-600 text-white rounded-full/);
    });
});

describe('profile hero uses the canonical identity', () => {
    const src = () => readFileSync(resolve(__dirname, '../../src/modules/pages/profile-page.ts'), 'utf-8');

    it('the hero renders the canonical token, not the rejected flat treatments', () => {
        const s = src();
        // The hero must be driven by the shared token …
        expect(s).toContain('${DUELI_HERO_GRADIENT}');
        // … and the owner-rejected treatments must be gone entirely: the
        // blue-dominant banner (via-indigo-600 … to-purple-700) and the flat
        // two-stop purple field it was replaced with in #71.
        expect(s).not.toContain('via-indigo-600');
        expect(s).not.toContain('to-purple-700');
        // Depth layers so the large surface never reads as one flat field.
        expect(s).toContain('DUELI_HERO_DECOR');
    });

    it('the hero token is a visibly blended multi-stop Dueli composition', () => {
        expect(DUELI_HERO_GRADIENT).toBe('bg-gradient-to-br from-violet-800 via-purple-600 to-indigo-500');
        const stops = DUELI_HERO_GRADIENT.match(/(from-|via-|to-)[a-z-\[\]#0-9]+/g) ?? [];
        expect(stops.length).toBeGreaterThanOrEqual(3);
    });

    it('profile data, avatar, stats and RTL/LTR wiring are preserved', () => {
        const s = src();
        expect(s).toContain('user.avatar_url');
        expect(s).toContain('stats.competitions');
        expect(s).toContain('stats.wins');
        expect(s).toContain('stats.followers');
        expect(s).toContain("${rtl ? 'text-right' : 'text-left'}");
        expect(s).toContain("${rtl ? 'flex-row-reverse' : ''}");
    });
});

describe('avatar intrinsic dimensions cause no layout regression', () => {
    it('the 16px competitor avatars keep their CSS box, not a 40x40 reserve', () => {
        const html = getCompetitionCard({
            id: 1,
            title: 'Final',
            status: 'completed',
            creator_name: 'Sara',
            creator_username: 'sara',
            opponent_name: 'Omar',
            opponent_username: 'omar',
        } as never, 'ar');
        const avatars = [...html.matchAll(/<img[^>]*w-4 h-4[^>]*>/g)];
        expect(avatars.length).toBeGreaterThan(0);
        for (const [tag] of avatars) {
            expect(tag).toMatch(/width="40"/);
            expect(tag).toMatch(/height="40"/);
        }
        // The CSS class still governs the rendered box, so the intrinsic attrs
        // only reserve the aspect ratio — no 40x40 box is forced on the row.
        expect(html).toMatch(/class="w-4 h-4 rounded-full[^"]*"/);
    });
});
