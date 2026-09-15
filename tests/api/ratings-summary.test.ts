import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';

const FIXED_NOW = Date.parse('2026-09-15T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const env = (db: FakeD1) => ({ DB: db }) as any;

async function withNow<T>(nowMs: number, fn: () => Promise<T>): Promise<T> {
    const realNow = Date.now;
    const RealDate = Date;
    const FakeDate = class extends RealDate {
        constructor(...args: never[]) {
            if (args.length === 0) {
                super(nowMs);
            } else {
                // @ts-expect-error spread
                super(...args);
            }
        }
        static now() {
            return nowMs;
        }
    } as unknown as DateConstructor;
    (globalThis as never as { Date: DateConstructor }).Date = FakeDate;
    (Date as unknown as { now: () => number }).now = () => nowMs;
    try {
        return await fn();
    } finally {
        (globalThis as never as { Date: DateConstructor }).Date = RealDate;
        realNow.name; // keep ref
        (Date as unknown as { now: () => number }).now = realNow;
    }
}

describe('B11 anonymous ratings summary + in-window withdrawal (RED-FIRST)', () => {
    let db: FakeD1;
    let creatorId: number;
    let opponentId: number;
    let sessions: string[] = [];
    let raterIds: number[] = [];

    beforeEach(async () => {
        db = new FakeD1();
        sessions = [];
        raterIds = [];
        const users = new UserModel(db as unknown as D1Database);
        const sess = new SessionModel(db as unknown as D1Database);
        creatorId = (await users.create({ email: 'b11c@test.local', username: 'b11_c', display_name: 'B11 C' })).id;
        opponentId = (await users.create({ email: 'b11o@test.local', username: 'b11_o', display_name: 'B11 O' })).id;
        db.competitions.push({
            id: 20001, title: 'B11 comp', creator_id: creatorId, opponent_id: opponentId,
            status: 'completed', ended_at: iso(FIXED_NOW - 60 * 60 * 1000),
            creator_rating: 0, opponent_rating: 0, average_rating: 0,
        });
        const ratings = [5, 5, 4, 4, 3];
        for (let i = 0; i < 5; i++) {
            const u = await users.create({ email: `b11r${i}@test.local`, username: `b11_r${i}`, display_name: `B11 R${i}` });
            raterIds.push(u.id);
            sessions.push((await sess.create({ user_id: u.id })).id);
            db.watchHistory.push({ user_id: u.id, competition_id: 20001, watch_duration_seconds: 120 });
        }
        for (let i = 0; i < 5; i++) {
            db.ratings.push({
                id: i + 1, competition_id: 20001, user_id: raterIds[i],
                competitor_id: creatorId, rating: ratings[i],
                created_at: iso(FIXED_NOW - 30 * 60 * 1000 + i * 1000),
            });
        }
        db.ratingSeq = 5;
    });

    it('1. five ratings => average/count/distribution correct', async () => {
        const res = await withNow(FIXED_NOW, () =>
            app.request('/api/competitions/20001/ratings/summary', { method: 'GET' }, env(db)));
        expect(res.status).toBe(200);
        const json = (await res.json()) as any;
        const entry = json.data.competitors.find((c: any) => c.competitor_id === creatorId);
        expect(entry.count).toBe(5);
        expect(entry.average).toBeCloseTo(4.2, 5);
        expect(entry.distribution).toEqual({ '1': 0, '2': 0, '3': 1, '4': 2, '5': 2 });
    });

    it('3. DELETE inside window => 200 and average recomputed', async () => {
        const res = await withNow(FIXED_NOW, () =>
            app.request(`/api/competitions/20001/rate?competitor_id=${creatorId}`, {
                method: 'DELETE',
                headers: { 'X-CSRF-Token': 't', Authorization: `Bearer ${sessions[0]}` },
            }, env(db)));
        expect(res.status).toBe(200);
        expect(db.ratings.length).toBe(4);
        const sum = await withNow(FIXED_NOW, () =>
            app.request('/api/competitions/20001/ratings/summary', { method: 'GET' }, env(db)));
        const json = (await sum.json()) as any;
        const entry = json.data.competitors.find((c: any) => c.competitor_id === creatorId);
        expect(entry.count).toBe(4);
        expect(entry.average).toBeCloseTo(4.0, 5);
    });

    it('4. DELETE outside window => 409 and average unchanged', async () => {
        const late = FIXED_NOW + 24 * 60 * 60 * 1000 + 60 * 1000;
        const res = await withNow(late, () =>
            app.request(`/api/competitions/20001/rate?competitor_id=${creatorId}`, {
                method: 'DELETE',
                headers: { 'X-CSRF-Token': 't', Authorization: `Bearer ${sessions[0]}` },
            }, env(db)));
        expect(res.status).toBe(409);
        expect(db.ratings.length).toBe(5);
        const sum = await withNow(late, () =>
            app.request('/api/competitions/20001/ratings/summary', { method: 'GET' }, env(db)));
        const json = (await sum.json()) as any;
        const entry = json.data.competitors.find((c: any) => c.competitor_id === creatorId);
        expect(entry.average).toBeCloseTo(4.2, 5);
    });

    it('5. DELETE by user who never rated => 404 or 403', async () => {
        const users = new UserModel(db as unknown as D1Database);
        const sess = new SessionModel(db as unknown as D1Database);
        const stranger = await users.create({ email: 'b11x@test.local', username: 'b11_x', display_name: 'B11 X' });
        const strangerSession = (await sess.create({ user_id: stranger.id })).id;
        db.watchHistory.push({ user_id: stranger.id, competition_id: 20001, watch_duration_seconds: 60 });
        const res = await withNow(FIXED_NOW, () =>
            app.request(`/api/competitions/20001/rate?competitor_id=${creatorId}`, {
                method: 'DELETE',
                headers: { 'X-CSRF-Token': 't', Authorization: `Bearer ${strangerSession}` },
            }, env(db)));
        expect([404, 403]).toContain(res.status);
        expect(db.ratings.length).toBe(5);
    });

    it('6. no ratings => average null, no NaN', async () => {
        db.ratings = [];
        const res = await withNow(FIXED_NOW, () =>
            app.request('/api/competitions/20001/ratings/summary', { method: 'GET' }, env(db)));
        expect(res.status).toBe(200);
        const text = await res.text();
        expect(text).not.toContain('NaN');
        const json = JSON.parse(text) as any;
        for (const c of json.data.competitors) {
            expect(c.average).toBeNull();
            expect(c.count).toBe(0);
        }
    });

    it('7. i18n ratings keys exist in ar+en', async () => {
        const { ar } = await import('../../src/i18n/ar');
        const { en } = await import('../../src/i18n/en');
        for (const k of ['summary_title', 'average', 'no_ratings', 'withdrawn']) {
            expect((ar as any).ratings?.[k]).toBeTruthy();
            expect((en as any).ratings?.[k]).toBeTruthy();
        }
    });

    it('2. summary leaks no user_id or rater identity', async () => {
        const res = await withNow(FIXED_NOW, () =>
            app.request('/api/competitions/20001/ratings/summary', { method: 'GET' }, env(db)));
        const text = await res.text();
        expect(text).not.toContain('user_id');
        expect(text).not.toContain('display_name');
        expect(text).not.toContain('avatar_url');
        expect(text).not.toContain('username');
        expect(text).not.toContain('email');
    });
});
