import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';

function env(db: FakeD1) {
    return { DB: db } as any;
}

/**
 * R2-V rating eligibility (live-only + L1 300s SSOT).
 * Legacy B10 contract (completed + 24h window + no replacement) is removed:
 * - live + 300s => 201 (create) / 200 (replace, one effective row)
 * - 299s => 403 watch key; pending/non-live => 403 live-only key
 * - completed (cutoff) => 403 window-closed key, no grace period
 * - self-rating stays 403; range stays 422; forged body claims ignored.
 */
describe('R2-V rating eligibility (live-only + 300s SSOT)', () => {
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
            status: 'live',
        });
        db.watchHistory.push({ user_id: viewerId, competition_id: 10001, watch_duration_seconds: 300 });
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

    it('1. live + 300s watched -> 201', async () => {
        const res = await rate(10001, viewerSession, 'en', { competitor_id: creatorId, rating: 5 }, '10.10.1.1');
        expect(res.status).toBe(201);
        expect(db.ratings.length).toBe(1);
    });

    it('2. live but 299s -> 403 watch key', async () => {
        db.watchHistory.find((w) => w.user_id === viewerId)!.watch_duration_seconds = 299;
        const res = await rate(10001, viewerSession, 'en', { competitor_id: creatorId, rating: 4 }, '10.10.1.2');
        expect(res.status).toBe(403);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe('Watch 300 seconds of the live broadcast first to unlock rating');
        expect(db.ratings.length).toBe(0);
    });

    it('3. creator rates own competition -> 403 self key', async () => {
        const res = await rate(10001, creatorSession, 'en', { competitor_id: opponentId, rating: 5 }, '10.10.1.3');
        expect(res.status).toBe(403);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe('You cannot rate yourself or your own competition');
        expect(db.ratings.length).toBe(0);
    });

    it('4. opponent rates own competition -> 403 self key', async () => {
        const res = await rate(10001, opponentSession, 'en', { competitor_id: creatorId, rating: 5 }, '10.10.1.4');
        expect(res.status).toBe(403);
        const json = (await res.json()) as { error: string };
        expect(json.error).toBe('You cannot rate yourself or your own competition');
        expect(db.ratings.length).toBe(0);
    });

    it('5. after cutoff (completed) -> 403 closed key, no grace period', async () => {
        db.competitions.find((c) => c.id === 10001)!.status = 'completed';
        const res = await rate(10001, viewerSession, 'ar', { competitor_id: creatorId, rating: 5 }, '10.10.1.5');
        expect(res.status).toBe(403);
        expect(db.ratings.length).toBe(0);
    });

    it('6. pending competition -> 403 live-only key even with watch time', async () => {
        db.competitions.find((c) => c.id === 10001)!.status = 'pending';
        const res = await rate(10001, viewerSession, 'en', { competitor_id: creatorId, rating: 5 }, '10.10.1.6');
        expect(res.status).toBe(403);
        expect(db.ratings.length).toBe(0);
    });

    it('7. second rating by same user REPLACES (200), still one row', async () => {
        const first = await rate(10001, viewerSession, 'en', { competitor_id: creatorId, rating: 5 }, '10.10.1.7');
        expect(first.status).toBe(201);
        const second = await rate(10001, viewerSession, 'en', { competitor_id: creatorId, rating: 2 }, '10.10.1.8');
        expect(second.status).toBe(200);
        expect(db.ratings.length).toBe(1);
        expect(db.ratings[0].rating).toBe(2);
    });

    it('8. client-supplied watch claims cannot grant eligibility', async () => {
        const res = await rate(10001, strangerSession, 'en', { competitor_id: creatorId, rating: 5, seconds: 99999, user_id: viewerId, watch_seconds: 99999 } as any, '10.10.1.9');
        expect(res.status).toBe(403);
        expect(db.ratings.length).toBe(0);
    });

    it('9. ar + en carry the live-only keys', async () => {
        const arPack = (await import('../../src/i18n/ar')).ar;
        const enPack = (await import('../../src/i18n/en')).en;
        expect(arPack.competition_errors.rating_self_forbidden).toBeTruthy();
        expect(arPack.competition_errors.rating_watch_required).toBeTruthy();
        expect(arPack.competition_errors.rating_window_closed).toBeTruthy();
        expect(arPack.competition_errors.rating_live_only).toBeTruthy();
        expect(enPack.competition_errors.rating_self_forbidden).toBeTruthy();
        expect(enPack.competition_errors.rating_watch_required).toBeTruthy();
        expect(enPack.competition_errors.rating_window_closed).toBeTruthy();
        expect(enPack.competition_errors.rating_live_only).toBeTruthy();
        expect(arPack.competition_errors.rating_live_only).not.toBe(enPack.competition_errors.rating_live_only);
        db.competitions.find((c) => c.id === 10001)!.status = 'completed';
        const win = await rate(10001, viewerSession, 'en', { competitor_id: creatorId, rating: 5 }, '10.10.1.12');
        expect(await win.text()).toContain('ratings are closed');
    });
});
