import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';
import { ScheduledTaskService } from '../../src/lib/services/ScheduledTaskService';

const FIXED_NOW = Date.parse('2026-09-15T12:00:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();
const env = (db: FakeD1) => ({ DB: db }) as any;

/**
 * B12 test-side ELO oracle: independently re-derives the expected
 * single-application result (K=32) so the assertion cannot pass by
 * accident or by copying a production bug.
 */
const K = 32;
function expectedElo(
    creatorRating: number,
    opponentRating: number,
    winnerId: number | null,
    creatorId: number,
    opponentId: number
): { creator: number; opponent: number } {
    const eC = 1 / (1 + Math.pow(10, (opponentRating - creatorRating) / 400));
    const eO = 1 / (1 + Math.pow(10, (creatorRating - opponentRating) / 400));
    let aC = 0.5;
    let aO = 0.5;
    if (winnerId === creatorId) { aC = 1; aO = 0; }
    else if (winnerId === opponentId) { aC = 0; aO = 1; }
    return {
        creator: Math.round(creatorRating + K * (aC - eC)),
        opponent: Math.round(opponentRating + K * (aO - eO)),
    };
}

async function withNow<T>(nowMs: number, fn: () => Promise<T>): Promise<T> {
    const realNow = Date.now;
    (Date as any).now = () => nowMs;
    try {
        return await fn();
    } finally {
        (Date as any).now = realNow;
    }
}

/** LATE: after the 24h rating window has closed — the only moment ELO is finalized (B12). */
const LATE = FIXED_NOW + 25 * 60 * 60 * 1000;

/** Simulates a transient DB failure inside the aggregate batch. */
class FailingBatchD1 extends FakeD1 {
    failBatch = true;
    async batch(statements: never[]): Promise<never[]> {
        if (this.failBatch) throw new Error('simulated batch failure');
        return super.batch(statements) as Promise<never[]>;
    }
}

describe('B12 winner determination + ELO atomicity/idempotency (RED-FIRST)', () => {
    let db: FakeD1;
    let creatorId: number;
    let opponentId: number;
    const COMP_ID = 30001;

    beforeEach(async () => {
        db = new FakeD1();
        const users = new UserModel(db as unknown as D1Database);
        creatorId = (await users.create({ email: 'b12c@test.local', username: 'b12_c', display_name: 'B12 C' })).id;
        opponentId = (await users.create({ email: 'b12o@test.local', username: 'b12_o', display_name: 'B12 O' })).id;
        db.competitions.push({
            id: COMP_ID,
            title: 'B12 comp',
            creator_id: creatorId,
            opponent_id: opponentId,
            status: 'completed',
            ended_at: iso(FIXED_NOW - 60 * 60 * 1000),
            creator_rating: 0,
            opponent_rating: 0,
            average_rating: 0,
            winner_id: null,
        });
    });

    async function createSession(userId: number): Promise<string> {
        const sessions = new SessionModel(db as unknown as D1Database);
        return (await sessions.create({ user_id: userId })).id;
    }

    async function seedVoter(
        target: FakeD1,
        i: number,
        users: UserModel
    ): Promise<void> {
        const u = await users.create({ email: `b12v${i}@test.local`, username: `b12_v${i}`, display_name: `B12 V${i}` });
        target.watchHistory.push({ user_id: u.id, competition_id: COMP_ID, watch_duration_seconds: 120 });
    }

    async function rate(sid: string, competitorId: number, rating: number, ip: string): Promise<Response> {
        return app.request(`/api/competitions/${COMP_ID}/rate?lang=en`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${sid}`,
                'X-CSRF-Token': 'test',
                'X-Forwarded-For': ip,
            },
            body: JSON.stringify({ competitor_id: competitorId, rating }),
        }, env(db));
    }

    it('1. 50 concurrent votes => exactly one winner, ratings=50, ELO applied once', async () => {
        const users = new UserModel(db as unknown as D1Database);
        const sessions: string[] = [];
        for (let i = 0; i < 50; i++) {
            await seedVoter(db, i, users);
        }
        const allSessions = new SessionModel(db as unknown as D1Database);
        for (const u of db.users) {
            if (u.email.startsWith('b12v')) sessions.push((await allSessions.create({ user_id: u.id })).id);
        }
        const responses = await withNow(FIXED_NOW, () =>
            Promise.all(sessions.map((sid, i) => rate(sid, creatorId, 5, `10.12.1.${i + 1}`)))
        );
        for (const r of responses) {
            expect(r.status, 'every vote must succeed').toBe(201);
        }
        expect(db.ratings.length).toBe(50);
        const comp = db.competitions.find((c) => c.id === COMP_ID);
        // One stable winner — the creator (every vote is 5 for the creator)
        expect(comp.winner_id).toBe(creatorId);
        expect(comp.winner_id).not.toBe(opponentId);
        // While the rating window is open, ELO is NOT yet finalized
        expect(comp.elo_applied_at ?? null).toBeNull();

        // After the window closes, ELO is applied exactly once (DB-claimed)
        const svc = new ScheduledTaskService(db as unknown as D1Database);
        await withNow(LATE, () => svc.updateAggregatesAfterVote(COMP_ID));
        const creator = db.users.find((u) => u.id === creatorId);
        const opponent = db.users.find((u) => u.id === opponentId);
        const once = expectedElo(1500, 1500, creatorId, creatorId, opponentId);
        expect(creator.elo_rating).toBe(once.creator);
        expect(opponent.elo_rating).toBe(once.opponent);
        expect(db.competitions.find((c) => c.id === COMP_ID).elo_applied_at).toBeTruthy();
    });

    it('2. updateAggregatesAfterVote twice => ELO not doubled', async () => {
        const users = new UserModel(db as unknown as D1Database);
        const r1 = await users.create({ email: 'b12r1@test.local', username: 'b12_r1', display_name: 'B12 R1' });
        const r2 = await users.create({ email: 'b12r2@test.local', username: 'b12_r2', display_name: 'B12 R2' });
        db.watchHistory.push({ user_id: r1.id, competition_id: COMP_ID, watch_duration_seconds: 120 });
        db.watchHistory.push({ user_id: r2.id, competition_id: COMP_ID, watch_duration_seconds: 120 });
        const s1 = await createSession(r1.id);
        const s2 = await createSession(r2.id);
        expect((await withNow(FIXED_NOW, () => rate(s1, creatorId, 5, '10.12.2.1'))).status).toBe(201);
        expect((await withNow(FIXED_NOW, () => rate(s2, opponentId, 2, '10.12.2.2'))).status).toBe(201);

        const svc = new ScheduledTaskService(db as unknown as D1Database);
        // ELO is finalized only after the window closes; two invocations there
        const once = expectedElo(1500, 1500, creatorId, creatorId, opponentId);
        await withNow(LATE, () => svc.updateAggregatesAfterVote(COMP_ID));
        expect(db.users.find((u) => u.id === creatorId).elo_rating).toBe(once.creator);
        expect(db.users.find((u) => u.id === opponentId).elo_rating).toBe(once.opponent);

        // Second invocation must be a no-op for ELO
        await withNow(LATE, () => svc.updateAggregatesAfterVote(COMP_ID));
        expect(db.users.find((u) => u.id === creatorId).elo_rating).toBe(once.creator);
        expect(db.users.find((u) => u.id === opponentId).elo_rating).toBe(once.opponent);
        expect(db.competitions.find((c) => c.id === COMP_ID).winner_id).toBe(creatorId);
    });

    it('3. draw => winner_id NULL, documented draw ELO rule applied once', async () => {
        const users = new UserModel(db as unknown as D1Database);
        const r1 = await users.create({ email: 'b12d1@test.local', username: 'b12_d1', display_name: 'B12 D1' });
        const r2 = await users.create({ email: 'b12d2@test.local', username: 'b12_d2', display_name: 'B12 D2' });
        // Unequal starting ELOs so the draw delta is observable
        db.users.find((u) => u.id === creatorId).elo_rating = 1500;
        db.users.find((u) => u.id === opponentId).elo_rating = 1600;
        db.watchHistory.push({ user_id: r1.id, competition_id: COMP_ID, watch_duration_seconds: 120 });
        db.watchHistory.push({ user_id: r2.id, competition_id: COMP_ID, watch_duration_seconds: 120 });
        const s1 = await createSession(r1.id);
        const s2 = await createSession(r2.id);
        expect((await withNow(FIXED_NOW, () => rate(s1, creatorId, 4, '10.12.3.1'))).status).toBe(201);
        expect((await withNow(FIXED_NOW, () => rate(s2, opponentId, 4, '10.12.3.2'))).status).toBe(201);

        const svc = new ScheduledTaskService(db as unknown as D1Database);
        // ELO is finalized only after the window closes; two invocations there
        await withNow(LATE, () => svc.updateAggregatesAfterVote(COMP_ID));
        const comp = db.competitions.find((c) => c.id === COMP_ID);
        // Explicit documented draw rule: equal averages => winner_id = NULL
        expect(comp.winner_id).toBeNull();
        const drawOnce = expectedElo(1500, 1600, null, creatorId, opponentId);
        expect(db.users.find((u) => u.id === creatorId).elo_rating).toBe(drawOnce.creator);
        expect(db.users.find((u) => u.id === opponentId).elo_rating).toBe(drawOnce.opponent);
        // Re-running must not apply the draw ELO again
        await withNow(LATE, () => svc.updateAggregatesAfterVote(COMP_ID));
        expect(db.users.find((u) => u.id === creatorId).elo_rating).toBe(drawOnce.creator);
        expect(db.users.find((u) => u.id === opponentId).elo_rating).toBe(drawOnce.opponent);
    });



    it('4. failure inside the aggregate batch => vote still 201, retry task scheduled and recovers', async () => {
        const fdb = new FailingBatchD1();
        // Share the seeded tables; the failing db only overrides batch()
        fdb.users = db.users;
        fdb.competitions = db.competitions;
        fdb.watchHistory = db.watchHistory;
        // Create the voter on the shared users table (keeps id sequence sane)
        const users = new UserModel(db as unknown as D1Database);
        const r = await users.create({ email: 'b12f@test.local', username: 'b12_f', display_name: 'B12 F' });
        fdb.watchHistory.push({ user_id: r.id, competition_id: COMP_ID, watch_duration_seconds: 120 });
        const sessions = new SessionModel(fdb as unknown as D1Database);
        const sid = (await sessions.create({ user_id: r.id })).id;
        const res = await withNow(FIXED_NOW, () =>
            app.request(`/api/competitions/${COMP_ID}/rate?lang=en`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sid}`, 'X-CSRF-Token': 'test' },
                body: JSON.stringify({ competitor_id: creatorId, rating: 5 }),
            }, env(fdb))
        );
        // The vote itself must not fail because aggregates failed
        expect(res.status).toBe(201);
        expect(fdb.ratings.length).toBe(1);
        // No half-written state: winner untouched while the batch failed
        const comp = fdb.competitions.find((c) => c.id === COMP_ID);
        expect(comp.winner_id).toBeNull();
        // Failure is durably recorded and a retry is scheduled
        const retry = fdb.scheduledTasks.find((t) => t.task_type === 'recalc_aggregates');
        expect(retry).toBeTruthy();
        expect(retry.status).toBe('pending');

        // The scheduled retry recovers the aggregates + one-time ELO
        // (run with the clock past the rating window so ELO is finalizable)
        retry.execute_at = iso(Date.now() - 1000);
        fdb.failBatch = false;
        const svc = new ScheduledTaskService(fdb as unknown as D1Database);
        await withNow(LATE, () => svc.processPendingTasks());
        expect(fdb.competitions.find((c) => c.id === COMP_ID).winner_id).toBe(creatorId);
        const once = expectedElo(1500, 1500, creatorId, creatorId, opponentId);
        expect(fdb.users.find((u) => u.id === creatorId).elo_rating).toBe(once.creator);
        expect(fdb.users.find((u) => u.id === opponentId).elo_rating).toBe(once.opponent);
    });

    it('5. late vote after the 24h window => rejected, winner_id and ELO untouched', async () => {
        const users = new UserModel(db as unknown as D1Database);
        const r1 = await users.create({ email: 'b12w1@test.local', username: 'b12_w1', display_name: 'B12 W1' });
        const r2 = await users.create({ email: 'b12w2@test.local', username: 'b12_w2', display_name: 'B12 W2' });
        db.watchHistory.push({ user_id: r1.id, competition_id: COMP_ID, watch_duration_seconds: 120 });
        db.watchHistory.push({ user_id: r2.id, competition_id: COMP_ID, watch_duration_seconds: 120 });
        const s1 = await createSession(r1.id);
        const s2 = await createSession(r2.id);
        expect((await withNow(FIXED_NOW, () => rate(s1, creatorId, 5, '10.12.5.1'))).status).toBe(201);
        // Finalize ELO once after the window closes
        const svc = new ScheduledTaskService(db as unknown as D1Database);
        await withNow(LATE, () => svc.updateAggregatesAfterVote(COMP_ID));
        const comp = db.competitions.find((c) => c.id === COMP_ID);
        const winnerBefore = comp.winner_id;
        const eloBefore = db.users.find((u) => u.id === creatorId).elo_rating;
        const claimBefore = comp.elo_applied_at;

        const late = FIXED_NOW + 24 * 60 * 60 * 1000 + 60 * 1000;
        const res = await withNow(late, () => rate(s2, opponentId, 5, '10.12.5.2'));
        expect(res.status).toBe(403);
        expect(db.ratings.length).toBe(1);
        const compAfter = db.competitions.find((c) => c.id === COMP_ID);
        expect(compAfter.winner_id).toBe(winnerBefore);
        expect(compAfter.elo_applied_at).toBe(claimBefore);
        expect(db.users.find((u) => u.id === creatorId).elo_rating).toBe(eloBefore);
    });

    it('6. i18n result keys (competition.winner/draw/pending_result) + summary result label', async () => {
        const { ar } = await import('../../src/i18n/ar');
        const { en } = await import('../../src/i18n/en');
        for (const k of ['winner', 'draw', 'pending_result']) {
            expect((ar as any).competition?.[k]).toBeTruthy();
            expect((en as any).competition?.[k]).toBeTruthy();
            expect((ar as any).competition[k]).not.toBe((en as any).competition[k]);
        }
        const users = new UserModel(db as unknown as D1Database);
        const r = await users.create({ email: 'b12s@test.local', username: 'b12_s', display_name: 'B12 S' });
        db.watchHistory.push({ user_id: r.id, competition_id: COMP_ID, watch_duration_seconds: 120 });
        const sid = await createSession(r.id);
        expect((await withNow(FIXED_NOW, () => rate(sid, creatorId, 5, '10.12.6.1'))).status).toBe(201);
        const sum = await withNow(FIXED_NOW, () =>
            app.request(`/api/competitions/${COMP_ID}/ratings/summary?lang=ar`, { method: 'GET' }, env(db)));
        const json = (await sum.json()) as any;
        expect(json.data.result.status).toBe('winner');
        expect(json.data.result.label).toBe((ar as any).competition.winner);
    });
});
