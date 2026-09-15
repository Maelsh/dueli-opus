/**
 * B8 — dislike is a real API action + atomic like/dislike toggle.
 *
 * RED-FIRST: these tests FAIL on the baseline commit:
 *  - `POST/DELETE /api/competitions/:id/dislike` do not exist (404),
 *  - `getLikeStatus` returns `{ liked, likeCount }` only,
 *  - nothing ever writes the `dislikes` table or the cached
 *    `competitions.dislikes_count` column (migration 0001).
 *
 * The dislike storage already exists (two physical tables: `likes`,
 * `dislikes`, both UNIQUE(user_id, competition_id)) so no migration is added.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';

const COMP_ID = 930001;

function env(db: FakeD1) {
    return { DB: db } as any;
}

const sharedDb = new FakeD1();

function resetDb() {
    Object.assign(sharedDb, {
        users: [], blocks: [], sessions: [], competitions: [], likes: [], dislikes: [],
        userSeq: 0, blockSeq: 0, competitionSeq: 0, likeSeq: 0, dislikeSeq: 0,
    });
}

async function setup() {
    const users = new UserModel(sharedDb as any);
    const sessions = new SessionModel(sharedDb as any);
    const owner = await users.create({ email: 'b8owner@test.local', username: 'b8_owner', display_name: 'B8 Owner' });
    const viewer = await users.create({ email: 'b8viewer@test.local', username: 'b8_viewer', display_name: 'B8 Viewer' });
    const viewerSession = (await sessions.create({ user_id: viewer.id })).id;
    sharedDb.competitions.push({
        id: COMP_ID, title: 'B8 comp', creator_id: owner.id, opponent_id: viewer.id,
        status: 'live', category_id: 830001, likes_count: 0, dislikes_count: 0,
    });
    return { owner, viewer, viewerSession };
}

interface InteractionBody {
    success: boolean;
    error?: string;
    data: { liked: boolean; disliked: boolean; likes_count: number; dislikes_count: number };
}

function req(path: string, sid: string | null, method: string) {
    return app.request(`${path}?lang=en`, {
        method,
        headers: {
            ...(sid ? { Authorization: `Bearer ${sid}` } : {}),
            'X-CSRF-Token': 'test',
        },
    }, env(sharedDb));
}

describe('B8: dislike works and like/dislike toggle atomically', () => {
    beforeEach(() => resetDb());

    it('1. POST dislike -> 200, disliked=true and dislikes_count=1 (row written)', async () => {
        const s = await setup();
        const res = await req(`/api/competitions/${COMP_ID}/dislike`, s.viewerSession, 'POST');
        expect(res.status).toBe(200);
        const body = await res.json() as InteractionBody;
        expect(body.success).toBe(true);
        expect(body.data.disliked).toBe(true);
        expect(body.data.liked).toBe(false);
        expect(body.data.likes_count).toBe(0);
        expect(body.data.dislikes_count).toBe(1);
        expect(sharedDb.dislikes).toHaveLength(1);
        expect(sharedDb.dislikes[0].user_id).toBe(s.viewer.id);
    });

    it('2. like after dislike -> likes_count=1, dislikes_count=0 and never both rows (atomic switch)', async () => {
        const s = await setup();
        expect((await req(`/api/competitions/${COMP_ID}/dislike`, s.viewerSession, 'POST')).status).toBe(200);

        const res = await req(`/api/competitions/${COMP_ID}/like`, s.viewerSession, 'POST');
        expect(res.status).toBe(200);
        const body = await res.json() as InteractionBody;
        expect(body.data.liked).toBe(true);
        expect(body.data.disliked).toBe(false);
        expect(body.data.likes_count).toBe(1);
        expect(body.data.dislikes_count).toBe(0);

        // Invariant: one user can never hold both rows for the same competition.
        expect(sharedDb.likes.filter((l) => l.user_id === s.viewer.id && l.competition_id === COMP_ID)).toHaveLength(1);
        expect(sharedDb.dislikes.filter((d) => d.user_id === s.viewer.id && d.competition_id === COMP_ID)).toHaveLength(0);
    });

    it('3. repeated dislike by the same user is idempotent (no duplicate row, counter stays 1)', async () => {
        const s = await setup();
        expect((await req(`/api/competitions/${COMP_ID}/dislike`, s.viewerSession, 'POST')).status).toBe(200);
        const second = await req(`/api/competitions/${COMP_ID}/dislike`, s.viewerSession, 'POST');
        expect(second.status).toBe(200);
        const body = await second.json() as InteractionBody;
        expect(body.data.disliked).toBe(true);
        expect(body.data.dislikes_count).toBe(1);
        expect(sharedDb.dislikes).toHaveLength(1);
    });
    it('4. DELETE dislike -> 200 and dislikes_count=0 (row removed)', async () => {
        const s = await setup();
        expect((await req(`/api/competitions/${COMP_ID}/dislike`, s.viewerSession, 'POST')).status).toBe(200);

        const res = await req(`/api/competitions/${COMP_ID}/dislike`, s.viewerSession, 'DELETE');
        expect(res.status).toBe(200);
        const body = await res.json() as InteractionBody;
        expect(body.data.disliked).toBe(false);
        expect(body.data.dislikes_count).toBe(0);
        expect(sharedDb.dislikes).toHaveLength(0);
    });

    it('5. GET like status returns the four fields (anonymous + authenticated)', async () => {
        const s = await setup();
        expect((await req(`/api/competitions/${COMP_ID}/dislike`, s.viewerSession, 'POST')).status).toBe(200);

        const anon = await (await req(`/api/competitions/${COMP_ID}/like`, null, 'GET')).json() as InteractionBody;
        expect(anon.data).toEqual({ liked: false, disliked: false, likes_count: 0, dislikes_count: 1 });

        const mine = await (await req(`/api/competitions/${COMP_ID}/like`, s.viewerSession, 'GET')).json() as InteractionBody;
        expect(mine.data).toEqual({ liked: false, disliked: true, likes_count: 0, dislikes_count: 1 });
    });

    it('6. blocked user -> 403 (central B6 mechanism) and no row is written', async () => {
        const s = await setup();
        // The competition owner blocks the viewer.
        await sharedDb.prepare(
            "INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, datetime('now'))"
        ).bind(s.owner.id, s.viewer.id, 'test').run();

        const disliked = await req(`/api/competitions/${COMP_ID}/dislike`, s.viewerSession, 'POST');
        expect(disliked.status).toBe(403);
        expect(((await disliked.json()) as InteractionBody).error).toBe('This action is not available');

        const liked = await req(`/api/competitions/${COMP_ID}/like`, s.viewerSession, 'POST');
        expect(liked.status).toBe(403);

        expect(sharedDb.dislikes).toHaveLength(0);
        expect(sharedDb.likes).toHaveLength(0);
    });
});

