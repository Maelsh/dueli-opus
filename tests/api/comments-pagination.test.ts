/**
 * B2+B3 — competition comments: pagination, threaded replies, live publish, soft-delete.
 * RED-FIRST: these tests FAIL on main (no GET /:id/comments route, no
 * findByCompetitionPaged, full arrays in GET /:id, hard delete, no publish).
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { CommentModel } from '../../src/models/CommentModel';
import { FakeD1 } from '../helpers/fake-d1';
import * as EventPusherModule from '../../src/lib/services/EventPusher';

function env(db: FakeD1) {
    return { DB: db } as unknown as { DB: D1Database };
}

const sharedDb = new FakeD1();

function resetDb() {
    Object.assign(sharedDb, {
        users: [], blocks: [], sessions: [], donations: [],
        competitions: [], requests: [], ratings: [],
        invitations: [], notifications: [], conversations: [], messages: [],
        comments: [], rateLimits: [], sseEvents: [],
        userSeq: 0, blockSeq: 0, donationSeq: 0, competitionSeq: 0,
        conversationSeq: 0, messageSeq: 0, ratingSeq: 0, invitationSeq: 0,
        notificationSeq: 0, commentSeq: 0,
    });
}

async function setupUsers() {
    const users = new UserModel(sharedDb as unknown as D1Database);
    const sessions = new SessionModel(sharedDb as unknown as D1Database);
    const owner = await users.create({ email: 'b2owner@test.local', username: 'b2_owner', display_name: 'B2 Owner' });
    const viewer = await users.create({ email: 'b2viewer@test.local', username: 'b2_viewer', display_name: 'B2 Viewer' });
    const other = await users.create({ email: 'b2other@test.local', username: 'b2_other', display_name: 'B2 Other' });
    const ownerSession = (await sessions.create({ user_id: owner.id })).id;
    const viewerSession = (await sessions.create({ user_id: viewer.id })).id;
    const otherSession = (await sessions.create({ user_id: other.id })).id;
    sharedDb.competitions.push({
        id: 920001, title: 'B2 comp', creator_id: owner.id, opponent_id: viewer.id,
        status: 'live', category_id: 820001, total_comments: 0,
    });
    return { owner, viewer, other, ownerSession, viewerSession, otherSession };
}

function req(path: string, sid: string | null, method: string, body?: unknown) {
    const sep = path.includes('?') ? '&' : '?';
    return app.request(`${path}${sep}lang=en`, {
        method,
        headers: {
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(sid ? { Authorization: `Bearer ${sid}` } : {}),
            'X-CSRF-Token': 'test',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    }, env(sharedDb));
}
describe('B2+B3: paged threaded live comments', () => {
    beforeEach(() => { resetDb(); vi.restoreAllMocks(); });

    it('1. 25 comments limit=20 -> 20 + total=25; offset=20 -> 5', async () => {
        const s = await setupUsers();
        const cm = new CommentModel(sharedDb as unknown as D1Database);
        for (let i = 1; i <= 25; i++) {
            await cm.create({ competition_id: 920001, user_id: s.owner.id, content: `c${i}` });
        }
        const p1 = await (await req('/api/competitions/920001/comments?limit=20&offset=0', null, 'GET')).json() as { success: boolean; data: { items: unknown[]; total: number } };
        expect(p1.success).toBe(true);
        expect(p1.data.items).toHaveLength(20);
        expect(p1.data.total).toBe(25);
        const p2 = await (await req('/api/competitions/920001/comments?limit=20&offset=20', null, 'GET')).json() as { success: boolean; data: { items: unknown[] } };
        expect(p2.data.items).toHaveLength(5);
    });

    it('2. limit=500 clamped to 100', async () => {
        await setupUsers();
        const res = await (await req('/api/competitions/920001/comments?limit=500', null, 'GET')).json() as { success: boolean; data: { limit: number } };
        expect(res.data.limit).toBe(100);
    });

    it('3. parent_id returns replies; roots carry replies_count', async () => {
        const s = await setupUsers();
        const cm = new CommentModel(sharedDb as unknown as D1Database);
        const root = await cm.create({ competition_id: 920001, user_id: s.owner.id, content: 'root' });
        await cm.create({ competition_id: 920001, user_id: s.viewer.id, content: 'r1', parent_id: root.id });
        await cm.create({ competition_id: 920001, user_id: s.viewer.id, content: 'r2', parent_id: root.id });
        const roots = await (await req('/api/competitions/920001/comments', null, 'GET')).json() as { success: boolean; data: { items: { id: number; replies_count: number }[] } };
        expect(roots.data.items.find((c) => c.id === root.id)?.replies_count).toBe(2);
        const replies = await (await req(`/api/competitions/920001/comments?parent_id=${root.id}`, null, 'GET')).json() as { success: boolean; data: { items: { content: string }[]; total: number } };
        expect(replies.data.total).toBe(2);
    });

    it('4. GET competition is light + has comments_count', async () => {
        const s = await setupUsers();
        const cm = new CommentModel(sharedDb as unknown as D1Database);
        await cm.create({ competition_id: 920001, user_id: s.owner.id, content: 'hello' });
        const res = await (await req('/api/competitions/920001', null, 'GET')).json() as { success: boolean; data: Record<string, unknown> };
        expect(res.data).not.toHaveProperty('comments');
        expect(res.data).toHaveProperty('comments_count', 1);
    });

    it('5. soft-delete hides but keeps row', async () => {
        const s = await setupUsers();
        const cm = new CommentModel(sharedDb as unknown as D1Database);
        const c1 = await cm.create({ competition_id: 920001, user_id: s.owner.id, content: 'gone' });
        expect((await req(`/api/competitions/920001/comments/${c1.id}`, s.ownerSession, 'DELETE')).status).toBe(200);
        const page = await (await req('/api/competitions/920001/comments', null, 'GET')).json() as { success: boolean; data: { items: { id: number }[]; total: number } };
        expect(page.data.total).toBe(0);
        expect(sharedDb.comments.find((c) => c.id === c1.id)?.deleted_at).toBeTruthy();
    });

    it('6. addComment publishes once + 7. non-owner delete 403', async () => {
        const s = await setupUsers();
        const spy = vi.spyOn(EventPusherModule.EventPusher.prototype, 'publishComment').mockResolvedValue({ id: 1, sseMessage: 'x' });
        expect((await req('/api/competitions/920001/comments', s.ownerSession, 'POST', { content: 'live!' })).status).toBe(201);
        expect(spy).toHaveBeenCalledTimes(1);
        const cm = new CommentModel(sharedDb as unknown as D1Database);
        const c1 = await cm.create({ competition_id: 920001, user_id: s.owner.id, content: 'mine' });
        expect((await req(`/api/competitions/920001/comments/${c1.id}`, s.otherSession, 'DELETE')).status).toBe(403);
    });
});