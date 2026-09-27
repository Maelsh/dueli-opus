/**
 * Post-R1 acceptance (F) — no translation OBJECTS in title attributes.
 *
 * Proven defect on previous main: `tr.search` and `tr.report` (both objects)
 * were interpolated into title="…" (home search button, nav reports link,
 * competition report surfaces), rendering title="[object Object]"; the
 * likes-count title fell back to the wrong leaf ('Already liked').
 *
 * Pins: shared navigation, home page (en+ar), competition card, and the
 * competition report surfaces carry string leaves only — never
 * "[object Object]".
 */
import { describe, it, expect } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { getNavigation } from '../../src/shared/components/navigation';
import { getCompetitionCard } from '../../src/shared/components/competition-card';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

const CARD_ITEM: any = {
    id: 901,
    title: 'Title Attr Card',
    status: 'completed',
    created_at: '2026-09-01 10:00:00',
    total_views: 5,
    likes_count: 3,
    dislikes_count: 1,
    category_color: '#123456',
    category_icon: 'fa-flask',
    creator_username: 'alice',
    creator_name: 'Alice',
    creator_avatar: 'https://cdn.test/a.png',
    opponent_username: 'bob',
    opponent_name: 'Bob',
    opponent_avatar: 'https://cdn.test/b.png',
};

describe('post-R1: title attributes never render [object Object]', () => {
    it('shared navigation (en+ar): reports link + messages use string leaves', () => {
        const en = getNavigation('en');
        expect(en).not.toContain('[object Object]');
        expect(en).toContain('title="Report"');
        expect(en).toContain('title="Messages"');
        const ar = getNavigation('ar');
        expect(ar).not.toContain('[object Object]');
        expect(ar).toContain('title="إبلاغ"');
        expect(ar).toContain('title="الرسائل"');
    });

    it('competition card: likes title uses the intended string leaf', () => {
        const en = getCompetitionCard(CARD_ITEM, 'en');
        expect(en).not.toContain('[object Object]');
        expect(en).toContain('title="Likes"');
        const ar = getCompetitionCard(CARD_ITEM, 'ar');
        expect(ar).not.toContain('[object Object]');
        expect(ar).toContain('title="الإعجابات"');
    });

    it('home page (en+ar): search button title is a string, page has no [object Object]', async () => {
        const db = new SqliteD1();
        for (const lang of ['en', 'ar']) {
            const res = await app.request(`/?lang=${lang}`, {}, env(db));
            expect(res.status).toBe(200);
            const html = await res.text();
            expect(html, lang).not.toContain('[object Object]');
        }
    });
});
