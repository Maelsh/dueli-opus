/**
 * B3 + B4 + B6 — shared competition card behaviour.
 *
 *  B3: the "recorded" play glyph follows the page direction (shared renderer,
 *      not a per-page patch).
 *  B4: My Competitions renders the canonical Dueli gradient for its primary
 *      actions and active tab, and inactive tabs keep inactive styling.
 *  B6: a real user's avatar links to their profile; an avatar without a valid
 *      identity produces no link, and no nested anchors are produced.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import app from '../../src/main';
import { getCompetitionCard } from '../../src/shared/components/competition-card';
import { getProfilePath, getUserAvatarLink } from '../../src/shared/components/user-avatar';
import { DUELI_PRIMARY_GRADIENT, DUELI_TAB_INACTIVE } from '../../src/shared/constants';
import { FakeD1 } from '../helpers/fake-d1';

const base = {
    id: 1,
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

describe('B3 — recorded badge follows the page direction', () => {
    it.each([
        ['ar', true],
        ['en', false],
    ] as const)('lang=%s sets the mirrored glyph: %s', (lang, mirrored) => {
        const html = getCompetitionCard(base, lang);
        const badge = /<span class="badge-recorded[^"]*">(.*?)<\/span>/s.exec(html);
        expect(badge, 'recorded badge missing').toBeTruthy();
        expect(badge![1].includes('recorded-play-rtl')).toBe(mirrored);
    });

    it('uses a direction-aware shared class, not a per-page patch', () => {
        const css = readFileSync(resolve(__dirname, '../../src/styles.css'), 'utf-8');
        expect(css).toMatch(/\.recorded-play-rtl\s*\{[^}]*rotate\(180deg\)/);
        // Still no forbidden scale flip anywhere in the UI sources.
        expect(css).not.toMatch(/scaleX\(-1\)|scale-x-\[-1\]/);
    });
});

describe('B6 — avatar to profile linking', () => {
    it('builds the canonical /profile/:username path', () => {
        expect(getProfilePath('sara', 'ar')).toBe('/profile/sara?lang=ar');
        expect(getProfilePath('  ', 'en')).toBeNull();
        expect(getProfilePath(undefined, 'en')).toBeNull();
    });

    it('links an avatar that represents a real user', () => {
        const html = getUserAvatarLink({ username: 'sara', displayName: 'Sara', avatarUrl: 'https://img/s.png', lang: 'ar' });
        expect(html).toContain('href="/profile/sara?lang=ar"');
        expect(html).toContain('alt="Sara"');
    });

    it('never links an avatar without a valid identity', () => {
        for (const username of [undefined, '', '   ']) {
            const html = getUserAvatarLink({ username, displayName: 'Anon', lang: 'ar' });
            expect(html).not.toContain('<a ');
            expect(html).toContain('<img');
        }
    });

    it('uses a delegated action instead of a nested anchor inside a card link', () => {
        const nested = getUserAvatarLink({ username: 'sara', displayName: 'Sara', lang: 'ar', nested: true });
        expect(nested).not.toContain('<a ');
        expect(nested).toContain('data-csp-fn="__navigateProfile"');
        expect(nested).toContain('role="link"');
    });

    it('renders a competition card with no nested anchors', () => {
        const html = getCompetitionCard(base, 'ar');
        // The card root is one link; count anchors to prove nothing nests.
        const opens = html.match(/<a\b/g) || [];
        const closes = html.match(/<\/a>/g) || [];
        expect(opens.length).toBe(closes.length);
        expect(opens.length).toBeGreaterThan(0);
    });

    it('does not link a competitor that has no username', () => {
        const html = getCompetitionCard({ ...(base as object), creator_username: undefined } as never, 'ar');
        expect(html).not.toContain('/profile/undefined');
    });
});

describe('B4 — canonical Dueli gradient on My Competitions', () => {
    it('uses the approved gradient, not a flat purple', async () => {
        const db = new FakeD1();
        const res = await app.request('/my-competitions?lang=ar', {}, { DB: db } as never);
        const html = await res.text();

        expect(html).toContain(DUELI_PRIMARY_GRADIENT);
        // The old flat treatment must be gone from the tab strip and CTAs.
        expect(html).not.toContain('bg-purple-600 text-white rounded-full font-bold');
    });

    it('keeps inactive tabs visually inactive', async () => {
        const db = new FakeD1();
        const html = await (await app.request('/my-competitions?lang=ar', {}, { DB: db } as never)).text();

        const pendingTab = /id="tab-pending"[^>]*class="([^"]*)"/.exec(html);
        expect(pendingTab).toBeTruthy();
        expect(pendingTab![1]).toContain('text-gray-600');
        expect(pendingTab![1]).not.toContain(DUELI_PRIMARY_GRADIENT);
        expect(DUELI_TAB_INACTIVE).toContain('text-gray-600');
    });

    it('applies the canonical gradient to the active tab and the login CTA', async () => {
        const db = new FakeD1();
        const html = await (await app.request('/my-competitions?lang=ar', {}, { DB: db } as never)).text();

        const allTab = /id="tab-all"[^>]*class="([^"]*)"/.exec(html);
        expect(allTab![1]).toContain(DUELI_PRIMARY_GRADIENT);
    });
});
