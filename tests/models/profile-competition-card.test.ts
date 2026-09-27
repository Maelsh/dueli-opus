/**
 * Post-R1 acceptance (C) — profile competition-card contract.
 *
 * Proven root cause on previous main: the profile shelf used
 * CompetitionModel.findByUser, which returned c.* plus bare category names —
 * none of the creator/opponent identity, avatars, or category color/icon the
 * shared getCompetitionCard() consumes. Cards rendered "User vs ?" with
 * default styling while the normal listing (findByFilters) was correct.
 *
 * Pins (against the REAL schema via node:sqlite):
 * - findByUser returns creator_name/username/avatar, opponent_name/username/
 *   avatar, category_color/icon for a two-user competition.
 * - The shared card renders those exact identities/metadata (no "User", no
 *   "?" when valid data exists).
 * - A competition with no opponent keeps null opponent fields (no
 *   fabricated users) and the card keeps its "?" placeholder by design.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';
import { CompetitionModel } from '../../src/models/CompetitionModel';
import { getCompetitionCard } from '../../src/shared/components/competition-card';

const AVATAR_A = 'https://cdn.test/avatar-a.png';
const AVATAR_B = 'https://cdn.test/avatar-b.png';

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, display_name, avatar_url, password_hash)
         VALUES (101, 'a@local', 'alice', 'Alice Creator', ?, 'x'),
                (102, 'b@local', 'bob', 'Bob Opponent', ?, 'x')`
    ).bind(AVATAR_A, AVATAR_B).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, color, icon)
         VALUES (201, 'cience', 'علوم', 'Science', '#123456', 'fa-flask')`
    ).run();
    await db.prepare(
        `INSERT INTO competitions
            (id, title, rules, category_id, creator_id, opponent_id, status,
             language, created_at, total_views)
         VALUES (301, 'Duel One', 'rules', 201, 101, 102, 'completed',
                 'en', '2026-09-01 10:00:00', 42),
                (302, 'Solo Wait', 'rules', 201, 101, NULL, 'pending',
                 'en', '2026-09-02 10:00:00', 7)`
    ).run();
}

describe('post-R1: findByUser satisfies the shared competition-card contract', () => {
    let db: SqliteD1;
    let model: CompetitionModel;

    beforeEach(async () => {
        db = createSqliteD1();
        await seed(db);
        model = new CompetitionModel(db as unknown as D1Database);
    });

    it('returns creator + opponent identity, avatars, category color/icon', async () => {
        const rows = await model.findByUser(101, { limit: 10 });
        const duel = rows.find((r) => r.id === 301)!;
        expect(duel).toBeTruthy();
        expect(duel.creator_name).toBe('Alice Creator');
        expect(duel.creator_username).toBe('alice');
        expect(duel.creator_avatar).toBe(AVATAR_A);
        expect(duel.opponent_name).toBe('Bob Opponent');
        expect(duel.opponent_username).toBe('bob');
        expect(duel.opponent_avatar).toBe(AVATAR_B);
        expect(duel.category_color).toBe('#123456');
        expect(duel.category_icon).toBe('fa-flask');
    });

    it('the shared card renders those exact identities (no "User", no "?")', async () => {
        const rows = await model.findByUser(101, { limit: 10 });
        const duel = rows.find((r) => r.id === 301)!;
        const html = getCompetitionCard(duel as any, 'en');
        expect(html).toContain('Alice Creator');
        expect(html).toContain('Bob Opponent');
        expect(html).toContain(AVATAR_A);
        expect(html).toContain(AVATAR_B);
        expect(html).toContain('#123456');
        expect(html).toContain('/profile/alice');
        expect(html).toContain('/profile/bob');
        expect(html).not.toContain('>User<');
    });

    it('preserves null/no-opponent behavior without fabricating users', async () => {
        const rows = await model.findByUser(101, { limit: 10 });
        const solo = rows.find((r) => r.id === 302)!;
        expect(solo.opponent_name).toBeNull();
        expect(solo.opponent_username).toBeNull();
        expect(solo.opponent_avatar).toBeNull();
        // Creator + category metadata still resolve on the solo row.
        expect(solo.creator_username).toBe('alice');
        expect(solo.category_color).toBe('#123456');
        // The shared card keeps its by-design "?" placeholder for no opponent.
        const html = getCompetitionCard(solo as any, 'en');
        expect(html).toContain('Alice Creator');
        expect(html).toContain('>?</');
    });
});
