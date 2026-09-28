/**
 * Card centre Dueli logo — the owner-reported defect.
 *
 * The shared competition card paints a `bg-white` circle and puts the Dueli
 * logo inside it as an `loading="lazy"` image. The circle is a pure-CSS paint
 * (instant) while the logo is deferred by the browser's lazy-loading
 * heuristic, so the centre shows a blank white disc and the logo pops in
 * noticeably later. These tests pin the fix.
 */
import { describe, it, expect } from 'vitest';
import { getCompetitionCard } from '../../src/shared/components/competition-card';

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

const CENTRE = /<div class="w-12 h-12 bg-white rounded-full[^"]*">\s*<img([^>]*)>/;

describe('card centre Dueli logo renders with the circle, never after it', () => {
    it('the centre logo is NOT lazy-loaded (root cause of the blank white disc)', () => {
        const html = getCompetitionCard(base, 'ar');
        const centre = CENTRE.exec(html);
        expect(centre, 'centre circle + logo not found in the shared card').toBeTruthy();
        expect(centre![1]).not.toMatch(/loading="lazy"/);
    });

    it('the centre logo declares intrinsic size and async decoding (no layout shift)', () => {
        const html = getCompetitionCard(base, 'en');
        const attrs = CENTRE.exec(html)![1];
        expect(attrs).toMatch(/width="48"/);
        expect(attrs).toMatch(/height="48"/);
        expect(attrs).toMatch(/decoding="async"/);
    });

    it('the white disc always immediately contains the logo (never paints alone)', () => {
        const html = getCompetitionCard(base, 'ar');
        expect(html).toMatch(/bg-white rounded-full[^"]*">\s*<img[^>]+dueli-icon\.png/);
    });

    it('every card references the SAME logo URL (one request, no per-card penalty)', () => {
        const urls = new Set<string>();
        for (let i = 0; i < 3; i++) {
            const html = getCompetitionCard({ ...(base as object), id: i + 1 } as never, 'ar');
            for (const m of html.matchAll(/<img[^>]+src="([^"]*dueli-icon\.png)"/g)) urls.add(m[1]);
        }
        expect([...urls]).toEqual(['/static/dueli-icon.png']);
    });

    it('competitor avatars are unaffected by the logo fix', () => {
        const html = getCompetitionCard(base, 'ar');
        expect(html).toContain('/profile/sara');
        expect(html).toContain('/profile/omar');
    });
});
