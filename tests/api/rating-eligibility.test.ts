import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';
import { RATING_WINDOW_MS } from '../../src/models/RatingModel';

function env(db: FakeD1) {
    return { DB: db } as any;
}

const FIXED_NOW = Date.parse('2026-09-15T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

describe('B10 rating eligibility + 24h window', () => {
    let db: FakeD1;
    let creatorId: number;
    let opponentId: number;
    let viewerId: number;
    let strangerId: number;
    let viewerSession: string;
    let strangerSession: string;
    let creatorSession: string;
    let opponentSession: string;

    beforeEach(async () => {
        db = new FakeD1();
        const users = new UserModel(db as unknown as D1Database);
        const sessions = new SessionModel(db as unknown as D1Database);
        creatorId = (await users.create({ email: 'b10c@test.local', username: 'b10_c', display_name: 'B10 C' })).id;
        opponentId = (await users.create({ email: 'b10o@test.local', username: 'b10_o', display_name: 'B10 O' })).id;
        viewerId = (await users.create({ email: 'b10v@test.local', username: 'b10_v', display_name: 'B10 V' })).id;
        strangerId = (await users.create({ email: 'b10s@test.local', username: 'b10_s', display_name: 'B10 S' })).id;
        viewerSession = (await sessions.create({ user_id: viewerId })).id;
        strangerSession = (await sessions.create({ user_id: strangerId })).id;
        creatorSession = (await sessions.create({ user_id: creatorId })).id;
        opponentSession = (await sessions.create({ user_id: opponentId })).id;
        db.competitions.push({
            id: 10001,
            title: 'B10 comp',
            creator_id: creatorId,
            opponent_id: opponentId,
            status: 'completed',
            ended_at: iso(FIXED_NOW - 60 * 60 * 1000),
        });
        db.watchHistory.push({ user_id: viewerId, competition_id: 10001, watch_duration_seconds: 120 });
    });

    async function rate(compId: number, sid: string, lang: string, body: unknown, ip: string) {
        return app.request(`/api/competitions/${compId}/rate?lang=${lang}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${sid}`,
                'X-CSRF-Token': 'test',
                'X-Forwarded-For': ip,
            },
            body: JSON.stringify(body),
        }, env(db));
    }

    async function rateWithNow(compId: number, sid: string, lang: string, body: unknown, ip: string, nowMs: number) {
        const realNow = Date.now;
        (Date as any).now = () => nowMs;
        try {
            return await rate(compId, sid, lang, body, ip);
        } finally {
            (Date as any).now = realNow;
        }
    }

    it('1. completed + watched + inside 24h -> 201', async () => {
        const res = await rateWithNow(10001, viewerSession, 'en', { competitor_id: creatorId, rating: 5 }, '10.10.1.1', FIXED_NOW);
        expect(res.status).toBe(201);
        expect(db.ratings.length).toBe(1);
    });

    it('2. completed but no watch history -> 403 watch key', async () => {
        const res = await rateWithNow(10001, strangerSession, 'en', { competitor_id: creatorId, rating: 4 }, '10.10.1.2', FIXED_NOW);
        expect(res.status).toBe(403);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe('You must watch the competition before rating it');
        expect(db.ratings.length).toBe(0);
    });

    it('3. creator rates own competition -> 403 self key', async () => {
        const res = await rateWithNow(10001, creatorSession, 'en', { competitor_id: opponentId, rating: 5 }, '10.10.1.3', FIXED_NOW);
        expect(res.status).toBe(403);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe('You cannot rate yourself or your own competition');
        expect(db.ratings.length).toBe(0);
    });

    it('4. opponent rates own competition -> 403 self key', async () => {
        const res = await rateWithNow(10001, opponentSession, 'en', { competitor_id: creatorId, rating: 5 }, '10.10.1.4', FIXED_NOW);
        expect(res.status).toBe(403);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe('You cannot rate yourself or your own competition');
        expect(db.ratings.length).toBe(0);
    });

    it('5. after ended_at + 24h -> 403 window key (even watched, never rated)', async () => {
        const res = await rateWithNow(10001, viewerSession, 'ar', { competitor_id: creatorId, rating: 5 }, '10.10.1.5', FIXED_NOW + RATING_WINDOW_MS + 1000);
        expect(res.status).toBe(403);
        expect(db.ratings.length).toBe(0);
    });

    it('6. exactly at ended_at + 24h boundary -> still allowed', async () => {
        const endedMs = Date.parse(iso(FIXED_NOW - 60 * 60 * 1000));
        const res = await rateWithNow(10001, viewerSession, 'en', { competitor_id: creatorId, rating: 5 }, '10.10.1.6', endedMs + RATING_WINDOW_MS);
        expect(res.status).toBe(201);
        expect(db.ratings.length).toBe(1);
    });

    it('7. second rating by same user -> 409 already_rated, no extra row', async () => {
        const first = await rateWithNow(10001, viewerSession, 'en', { competitor_id: creatorId, rating: 5 }, '10.10.1.7', FIXED_NOW);
        expect(first.status).toBe(201);
        const second = await rateWithNow(10001, viewerSession, 'en', { competitor_id: creatorId, rating: 4 }, '10.10.1.8', FIXED_NOW);
        expect(second.status).toBe(409);
        expect(db.ratings.length).toBe(1);
    });

    it('8. client-supplied timestamps cannot extend the window', async () => {
        const res = await rateWithNow(10001, viewerSession, 'en', { competitor_id: creatorId, rating: 5, ended_at: iso(FIXED_NOW), now: iso(FIXED_NOW) }, '10.10.1.9', FIXED_NOW + RATING_WINDOW_MS + 60 * 1000);
        expect(res.status).toBe(403);
        expect(db.ratings.length).toBe(0);
    });

    it('9. ar + en carry all three new keys', async () => {
        const arPack = (await import('../../src/i18n/ar')).ar;
        const enPack = (await import('../../src/i18n/en')).en;
        expect(arPack.competition_errors.rating_self_forbidden).toBeTruthy();
        expect(arPack.competition_errors.rating_watch_required).toBeTruthy();
        expect(arPack.competition_errors.rating_window_closed).toBeTruthy();
        expect(enPack.competition_errors.rating_self_forbidden).toBeTruthy();
        expect(enPack.competition_errors.rating_watch_required).toBeTruthy();
        expect(enPack.competition_errors.rating_window_closed).toBeTruthy();
        expect(arPack.competition_errors.rating_self_forbidden).not.toBe(enPack.competition_errors.rating_self_forbidden);
        const win = await rateWithNow(10001, viewerSession, 'en', { competitor_id: creatorId, rating: 5 }, '10.10.1.12', FIXED_NOW + RATING_WINDOW_MS + 5000);
        expect(await win.text()).toContain('Rating window has closed');
    });
});
