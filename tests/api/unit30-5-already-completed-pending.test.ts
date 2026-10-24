/**
 * UNIT30.5 / R4-EARLY-END-SETTLEMENT-RACE-FIX.
 *
 * A second `/end` request can observe a completed competition before the
 * aggregates/ELO batch has settled. The first `already_completed` branch must
 * use the same pending semantics as the guarded-cutoff branch: a two-sided
 * result is pending until `elo_applied_at` is set, and a provisional live
 * winner must never be returned as final.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { CompetitionModel } from '../../src/models/CompetitionModel';
import { ScheduledTaskService } from '../../src/lib/services/ScheduledTaskService';
import { SqliteD1 } from '../helpers/sqlite-d1';

type Env = Parameters<typeof app.request>[2];
const env = (database: SqliteD1): Env => ({ DB: database } as unknown as Env);

let db: SqliteD1;
let ipSeq = 3050;

async function seedBase(): Promise<void> {
    db = new SqliteD1();
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country, elo_rating)
         VALUES (1, 'host@u305.local', 'host305', 'x', 'Host', 1, 'ar', 'SA', 1500),
                (2, 'guest@u305.local', 'guest305', 'x', 'Guest', 1, 'ar', 'SA', 1500),
                (3, 'viewer@u305.local', 'viewer305', 'x', 'Viewer', 1, 'ar', 'SA', 1500)`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id)
         VALUES (1, 'dialogue', 'Dialogue', 'Dialogue', NULL)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
          ('sess-u305-host', 1, datetime('now', '+1 day')),
          ('sess-u305-guest', 2, datetime('now', '+1 day'))`
    ).run();
}

function postEnd(id: number, session: string) {
    ipSeq += 1;
    return app.request(`/api/competitions/${id}/end`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session}`,
            'X-CSRF-Token': 'u305-already-completed',
            'CF-Connecting-IP': `10.30.5.${(ipSeq % 250) + 1}`,
        },
        body: JSON.stringify({}),
    }, env(db));
}

async function addLiveCompetition(): Promise<number> {
    const res = await db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, creator_id, opponent_id, status,
             language, country, created_at, started_at, stream_status)
         VALUES ('Settlement race fixture', 'd', 'r', 1, 1, 2, 'live',
                 'ar', 'SA', datetime('now'), datetime('now', '-120 seconds'), 'live')`
    ).run();
    return Number(res.meta.last_row_id);
}

async function addCompletedNoOpponent(): Promise<number> {
    const res = await db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, creator_id, opponent_id, status,
             language, country, created_at, started_at, ended_at, stream_status,
             ended_early, result_source)
         VALUES ('No-opponent completed fixture', 'd', 'r', 1, 1, NULL, 'completed',
                 'ar', 'SA', datetime('now'), datetime('now', '-120 seconds'),
                 datetime('now'), 'ended', 1, 'AUTO')`
    ).run();
    return Number(res.meta.last_row_id);
}

async function readRow(id: number): Promise<Record<string, unknown>> {
    const row = await db.prepare(
        `SELECT status, ended_at, ended_early, ended_by_user_id, result_source,
                winner_id, elo_applied_at
           FROM competitions WHERE id = ?`
    ).bind(id).first<Record<string, unknown>>();
    return row ?? {};
}

async function endData(id: number, session: string): Promise<Record<string, unknown>> {
    const res = await postEnd(id, session);
    expect(res.status).toBe(200);
    const json = await res.json() as { data: Record<string, unknown> };
    return json.data;
}

beforeEach(async () => {
    await seedBase();
});

describe('UNIT30.5 already-completed settlement race', () => {
    it('does not return the provisional winner before elo_applied_at is set', async () => {
        const id = await addLiveCompetition();
        const model = new CompetitionModel(db as unknown as D1Database);
        const service = new ScheduledTaskService(db as unknown as D1Database);

        // A live viewer vote creates the provisional winner 1.
        await db.prepare(
            `INSERT INTO ratings (competition_id, user_id, competitor_id, rating)
             VALUES (?, 3, 1, 5)`
        ).bind(id).run();
        await service.updateAggregatesAfterVote(id);
        expect(Number((await readRow(id)).winner_id)).toBe(1);

        // Cutoff persists the early-end withdrawal, but settlement/ELO is not
        // final yet: winner_id still holds the provisional live value.
        expect(await model.complete(id, { actorUserId: 1, endReason: 'competitor_end' })).toBe(true);
        const unsettled = await readRow(id);
        expect(unsettled.status).toBe('completed');
        expect(Number(unsettled.winner_id)).toBe(1);
        expect(unsettled.elo_applied_at).toBeNull();

        // A second /end hits the first already_completed branch. It must not
        // expose the provisional winner.
        const pending = await endData(id, 'sess-u305-guest');
        expect(pending.already_completed).toBe(true);
        expect(pending.winner_id).toBeNull();
        expect(pending.result_pending).toBe(true);

        // Settlement makes the withdrawal winner (opponent 2) final.
        await service.finalizeCompetition(id);
        const settled = await readRow(id);
        expect(Number(settled.winner_id)).toBe(2);
        expect(settled.elo_applied_at).toBeTruthy();

        const final = await endData(id, 'sess-u305-guest');
        expect(final.already_completed).toBe(true);
        expect(final.result_pending).toBe(false);
        expect(Number(final.winner_id)).toBe(2);
    });

    it('treats a completed no-opponent row as settled (no ELO claim to wait for)', async () => {
        const id = await addCompletedNoOpponent();
        expect((await readRow(id)).elo_applied_at).toBeNull();

        const data = await endData(id, 'sess-u305-host');
        expect(data.already_completed).toBe(true);
        expect(data.result_pending).toBe(false);
        expect(data.winner_id).toBeNull();
    });

    it('returns the final winner when elo_applied_at is already set', async () => {
        const id = await addLiveCompetition();
        const model = new CompetitionModel(db as unknown as D1Database);
        const service = new ScheduledTaskService(db as unknown as D1Database);

        expect(await model.complete(id, { actorUserId: 1, endReason: 'competitor_end' })).toBe(true);
        await service.finalizeCompetition(id);
        const settled = await readRow(id);
        expect(settled.elo_applied_at).toBeTruthy();
        expect(Number(settled.winner_id)).toBe(2);

        const data = await endData(id, 'sess-u305-guest');
        expect(data.already_completed).toBe(true);
        expect(data.result_pending).toBe(false);
        expect(Number(data.winner_id)).toBe(2);
    });
});
