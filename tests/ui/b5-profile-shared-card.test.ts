/**
 * B5 — the profile page keeps all of its own data/actions, but renders a
 * user's competitions through the shared competition card.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../../src/main';
import { UserModel, CompetitionModel } from '../../src/models';
import { FollowModel } from '../../src/models/FollowModel';
import { FakeD1 } from '../helpers/fake-d1';

const env = (db: FakeD1) => ({ DB: db } as never);

const competition = {
    id: 10,
    title: 'Science final',
    status: 'completed',
    category_id: 2,
    creator_id: 1,
    creator_name: 'Sara Ahmed',
    creator_username: 'sara',
    creator_avatar: 'https://img/sara.png',
    opponent_name: 'Omar',
    opponent_username: 'omar',
    opponent_avatar: 'https://img/omar.png',
    total_views: 5,
};

describe('B5 — profile page design alignment', () => {
    let db: FakeD1;
    let findSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
        db = new FakeD1();
        const users = new UserModel(db as unknown as D1Database);
        await users.create({
            email: 'sara@test.com',
            username: 'sara',
            display_name: 'Sara Ahmed',
            bio: 'Debater',
            country: 'SA',
            language: 'ar',
        });
        // The competition read model is not the subject here; stub it so the
        // assertions are about rendering, not about the fake SQL layer.
        findSpy = vi.spyOn(CompetitionModel.prototype, 'findByUser')
            .mockResolvedValue([competition] as never);
        vi.spyOn(FollowModel.prototype, 'getFollowersCount').mockResolvedValue(2 as never);
        vi.spyOn(FollowModel.prototype, 'getFollowingCount').mockResolvedValue(3 as never);
    });

    afterEach(() => vi.restoreAllMocks());

    it.each(['ar', 'en'] as const)('renders the profile competitions through the shared card (%s)', async (lang) => {
        const res = await app.request(`/profile/sara?lang=${lang}`, {}, env(db));
        expect(res.status).toBe(200);
        const html = await res.text();

        // Shared-card fingerprints (same renderer as Home/Search/My Competitions).
        expect(html).toContain('duel-card');
        expect(html).toContain('duel-thumbnail');
        expect(html).toContain('badge-recorded');
        // The legacy inline card markup is gone.
        expect(html).not.toContain('aspect-video bg-gradient-to-br');
    });

    it.each(['ar', 'en'] as const)('preserves the profile-specific data and actions (%s)', async (lang) => {
        const html = await (await app.request(`/profile/sara?lang=${lang}`, {}, env(db))).text();

        expect(html).toContain('Sara Ahmed');
        expect(html).toContain('@sara');
        // Profile-only regions survive the switch to the shared card.
        expect(html).toContain('content-posts');
        expect(html).toContain('content-competitions');
    });

    it('preserves the empty competitions state', async () => {
        findSpy.mockResolvedValue([] as never);
        const html = await (await app.request('/profile/sara?lang=ar', {}, env(db))).text();
        expect(html).not.toContain('duel-card');
        // The profile still renders with its own sections.
        expect(html).toContain('content-competitions');
    });
});
