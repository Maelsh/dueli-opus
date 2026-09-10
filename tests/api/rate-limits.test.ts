/**
 * @file tests/api/rate-limits.test.ts
 * @description B7: per-action rate limits + content length bounds (comments/messages).
 *
 * Scenarios (docs/15-ROADMAP.md — B7):
 * 1. 10 comments/minute ⇒ 10 succeed · the 11th ⇒ 429 + Retry-After header
 * 2. 20 messages/minute ⇒ 20 succeed · the 21st ⇒ 429
 * 3. window expiry (row edited directly) ⇒ allowed again
 * 4. per-user per-action isolation: another user unaffected · comment does
 *    not consume message quota
 * 5. comment of 2001 chars ⇒ 400 + localized i18n message + no row written
 * 6. message of 4001 chars ⇒ 400 + no row written
 *
 * Note: comment creation returns 201 (this.success(c, comment, 201)) and
 * message send returns 200 in this codebase — "succeed" below means that.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';

function env(db: FakeD1) {
    return { DB: db } as any;
}

const sharedDb = new FakeD1();

function resetDb() {
    Object.assign(sharedDb, {
        users: [], blocks: [], sessions: [], donations: [],
        competitions: [], requests: [], ratings: [],
        invitations: [], notifications: [], conversations: [], messages: [],
        comments: [], rateLimits: [],
        userSeq: 0, blockSeq: 0, donationSeq: 0, competitionSeq: 0,
        conversationSeq: 0, messageSeq: 0, ratingSeq: 0, invitationSeq: 0,
        notificationSeq: 0, commentSeq: 0,
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

describe('B7: per-action rate limits and content bounds', () => {
    let aId: number, bId: number;
    let aSession: string, bSession: string;

    beforeEach(async () => {
        resetDb();
        const users = new UserModel(sharedDb as any);
        const sessions = new SessionModel(sharedDb as any);
        aId = (await users.create({ email: 'b7a@test.local', username: 'b7_a', display_name: 'B7 A' })).id;
        bId = (await users.create({ email: 'b7b@test.local', username: 'b7_b', display_name: 'B7 B' })).id;
        aSession = (await sessions.create({ user_id: aId })).id;
        bSession = (await sessions.create({ user_id: bId })).id;

        // Competition owned by A, used for comments
        sharedDb.competitions.push({
            id: 930001,
            title: 'B7 comp',
            creator_id: aId,
            opponent_id: bId,
            status: 'live',
            category_id: 820001,
            total_comments: 0,
        });

        // Conversation between A and B, used for messages
        sharedDb.conversations.push({
            id: 940001,
            user1_id: aId,
            user2_id: bId,
            created_at: new Date().toISOString(),
            last_message_at: null,
        });
    });


    it('1. 10 comments succeed · comment 11 ⇒ 429 + Retry-After header', async () => {
        for (let i = 1; i <= 10; i++) {
            const res = await authedPost('/api/competitions/930001/comments', aSession, 'ar', { content: `c${i}` });
            expect(res.status, `comment ${i}`).toBe(201);
        }
        const res11 = await authedPost('/api/competitions/930001/comments', aSession, 'ar', { content: 'c11' });
        expect(res11.status).toBe(429);
        expect(res11.headers.get('Retry-After')).toBeTruthy();
        const text = await res11.text();
        expect(text).toContain('محاولات كثيرة، حاول بعد قليل');
    });

    it('2. 20 messages succeed · message 21 ⇒ 429', async () => {
        for (let i = 1; i <= 20; i++) {
            const res = await authedPost('/api/conversations/940001/messages', aSession, 'ar', { content: `m${i}` });
            expect(res.status, `message ${i}`).toBe(200);
        }
        const res21 = await authedPost('/api/conversations/940001/messages', aSession, 'ar', { content: 'm21' });
        expect(res21.status).toBe(429);
        expect(res21.headers.get('Retry-After')).toBeTruthy();
    });

    it('3. after the window expires (row edited directly) ⇒ allowed again', async () => {
        for (let i = 1; i <= 10; i++) {
            await authedPost('/api/competitions/930001/comments', aSession, 'ar', { content: `c${i}` });
        }
        expect((await authedPost('/api/competitions/930001/comments', aSession, 'ar', { content: 'c11' })).status).toBe(429);

        // Simulate window expiry: push the counter row into a long-gone window.
        // The next request writes a fresh row for the current window (count 1).
        const windowMs = 60_000;
        const staleStart = Math.floor(Date.now() / windowMs) * windowMs - windowMs * 5;
        sharedDb.rateLimits.forEach((r) => { r.window_start = staleStart; });

        const res = await authedPost('/api/competitions/930001/comments', aSession, 'ar', { content: 'after-window' });
        expect(res.status).toBe(201);
    });

    it('4. per-user per-action: another user unaffected · comment ≠ message quota', async () => {
        for (let i = 1; i <= 10; i++) {
            await authedPost('/api/competitions/930001/comments', aSession, 'ar', { content: `c${i}` });
        }
        expect((await authedPost('/api/competitions/930001/comments', aSession, 'ar', { content: 'c11' })).status).toBe(429);

        // Another user has a fresh key (rl:comment:user:B)
        const resB = await authedPost('/api/competitions/930001/comments', bSession, 'ar', { content: 'from B' });
        expect(resB.status).toBe(201);

        // Exhausted comment quota did not touch the message quota
        const msgRes = await authedPost('/api/conversations/940001/messages', aSession, 'ar', { content: 'still allowed' });
        expect(msgRes.status).toBe(200);
    });

    it('5. comment of 2001 chars ⇒ 400 + localized message + no row written', async () => {
        const before = sharedDb.comments.length;
        const res = await authedPost('/api/competitions/930001/comments', aSession, 'ar', { content: 'x'.repeat(2001) });
        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toContain('النص أطول من الحد المسموح');
        expect(sharedDb.comments.length).toBe(before);
    });

    it('6. message of 4001 chars ⇒ 400 + no row written', async () => {
        const before = sharedDb.messages.length;
        const res = await authedPost('/api/conversations/940001/messages', aSession, 'ar', { content: 'y'.repeat(4001) });
        expect(res.status).toBe(400);
        const text = await res.text();
        expect(text).toContain('النص أطول من الحد المسموح');
        expect(sharedDb.messages.length).toBe(before);
    });
});
