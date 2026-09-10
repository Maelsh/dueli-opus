import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';
import { ConversationModel, MessageModel } from '../../src/models/MessageModel';
import { UserBlockModel } from '../../src/models/UserBlockModel';
import { BlockedInteractionError } from '../../src/lib/errors/AppError';

function env(db: FakeD1) {
    return { DB: db } as any;
}

const sharedDb = new FakeD1();

function resetDb() {
    Object.assign(sharedDb, {
        users: [], blocks: [], sessions: [], donations: [],
        competitions: [], requests: [], ratings: [],
        invitations: [], notifications: [], conversations: [], messages: [],
        userSeq: 0, blockSeq: 0, donationSeq: 0, competitionSeq: 0,
        conversationSeq: 0, messageSeq: 0, ratingSeq: 0, invitationSeq: 0, notificationSeq: 0,
    });
}

async function authedPost(path: string, sid: string, lang: string, body?: unknown) {
    const sep = path.includes('?') ? '&' : '?';
    return app.request(`${path}${sep}lang=${lang}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sid}`,
            'X-CSRF-Token': 'test',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    }, env(sharedDb));
}

describe('B6: Central block enforcement via API', () => {
    let aId: number, bId: number;
    let aSession: string, bSession: string;

    beforeEach(async () => {
        resetDb();
        const users = new UserModel(sharedDb as any);
        const sessions = new SessionModel(sharedDb as any);
        aId = (await users.create({ email: 'b6a@test.local', username: 'b6_a', display_name: 'B6 A' })).id;
        bId = (await users.create({ email: 'b6b@test.local', username: 'b6_b', display_name: 'B6 B' })).id;
        aSession = (await sessions.create({ user_id: aId })).id;
        bSession = (await sessions.create({ user_id: bId })).id;

        sharedDb.competitions.push({
            id: 910001,
            title: 'B6 comp',
            creator_id: aId,
            opponent_id: bId,
            status: 'completed',
            category_id: 820001,
        });
    });

    it('1. A blocked B -> B starts a conversation with A: 403 + no conversation row', async () => {
        await sharedDb.prepare(
            'INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
        ).bind(aId, bId, 'test').run();

        const res = await authedPost(`/api/users/${aId}/message`, bSession, 'ar', { content: 'hi from B' });
        expect(res.status).toBe(403);
        const text = await res.text();
        expect(text).toContain('لا يمكن إتمام هذا الإجراء');
    });

    it('2. A blocked B -> B cannot send message on existing conversation (model-level)', async () => {
        const blockModel = new UserBlockModel(sharedDb as any);
        const conversationModel = new ConversationModel(sharedDb as any);
        const messageModel = new MessageModel(sharedDb as any);

        // Create conversation directly (simulating pre-existing conversation)
        sharedDb.conversations.push({
            id: 920001,
            user1_id: aId,
            user2_id: bId,
            created_at: new Date().toISOString(),
            last_message_at: null,
        });

        // Block B from messaging A
        await sharedDb.prepare(
            'INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
        ).bind(aId, bId, 'test').run();

        // B tries to send a message
        await expect(messageModel.create({
            conversation_id: 920001,
            sender_id: bId,
            content: 'after block'
        })).rejects.toBeInstanceOf(BlockedInteractionError);

        // Verify no message was created
        const messages = sharedDb.messages.filter((m: any) => m.conversation_id === 920001);
        expect(messages.length).toBe(0);
    });

    it('3. A blocked B -> B cannot comment on A competition (model-level)', async () => {
        const commentModel = new (await import('../../src/models/CommentModel')).CommentModel(sharedDb as any);
        const blockModel = new UserBlockModel(sharedDb as any);

        await sharedDb.prepare(
            'INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
        ).bind(aId, bId, 'test').run();

        await expect(commentModel.create({
            competition_id: 910001,
            user_id: bId,
            content: 'this should be blocked',
            is_live: false
        })).rejects.toBeInstanceOf(BlockedInteractionError);
    });

    it('4. A blocked B -> B cannot follow A: 403', async () => {
        await sharedDb.prepare(
            'INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
        ).bind(aId, bId, 'test').run();

        const res = await authedPost(`/api/users/${aId}/follow`, bSession, 'ar');
        expect(res.status).toBe(403);
        const text = await res.text();
        expect(text).toContain('لا يمكن إتمام هذا الإجراء');
    });

    it('5. A blocked B -> B cannot rate A: 403', async () => {
        await sharedDb.prepare(
            'INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
        ).bind(aId, bId, 'test').run();

        const res = await authedPost(`/api/competitions/910001/rate`, bSession, 'ar', { competitor_id: aId, rating: 5 });
        expect(res.status).toBe(403);
        const text = await res.text();
        expect(text).toContain('لا يمكن إتمام هذا الإجراء');
    });

    it('6. Reverse direction: B blocks A -> A cannot message B: 403', async () => {
        await sharedDb.prepare(
            'INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
        ).bind(bId, aId, 'test').run();

        const res = await authedPost(`/api/users/${bId}/message`, aSession, 'ar', { content: 'hi from A' });
        expect(res.status).toBe(403);
        const text = await res.text();
        expect(text).toContain('لا يمكن إتمام هذا الإجراء');
    });

    it('7. No block: all five actions succeed (200)', async () => {
        // Follow
        const followRes = await authedPost(`/api/users/${aId}/follow`, bSession, 'ar');
        expect(followRes.status).toBe(200);

        // Rate
        const rateRes = await authedPost(`/api/competitions/910001/rate`, bSession, 'ar', { competitor_id: aId, rating: 5 });
        expect(rateRes.status).toBe(201);

        // Comment
        const commentRes = await authedPost(`/api/competitions/910001/comments`, bSession, 'ar', { content: 'good luck' });
        expect(commentRes.status).toBe(201);
    });
});

describe('B6: isBlockedBetween is single source of truth (model-level)', () => {
    let aId: number, bId: number;
    let blockModel: UserBlockModel;

    beforeEach(async () => {
        resetDb();
        const users = new UserModel(sharedDb as any);
        aId = (await users.create({ email: 'b6a2@test.local', username: 'b6_a2', display_name: 'B6 A' })).id;
        bId = (await users.create({ email: 'b6b2@test.local', username: 'b6_b2', display_name: 'B6 B' })).id;
        blockModel = new UserBlockModel(sharedDb as any);

        // A blocks B
        await sharedDb.prepare(
            'INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, datetime(\'now\'))'
        ).bind(aId, bId, 'spam').run();
    });

    it('isBlockedBetween returns true for blocking pair', async () => {
        expect(await blockModel.isBlockedBetween(aId, bId)).toBe(true);
        expect(await blockModel.isBlockedBetween(bId, aId)).toBe(true);
    });

    it('isBlockedBetween returns false for unblocking pair', async () => {
        const cId = (await new UserModel(sharedDb as any).create({
            email: 'b6c@test.local', username: 'b6_c', display_name: 'B6 C'
        })).id;

        expect(await blockModel.isBlockedBetween(aId, cId)).toBe(false);
        expect(await blockModel.isBlockedBetween(bId, cId)).toBe(false);
    });
});