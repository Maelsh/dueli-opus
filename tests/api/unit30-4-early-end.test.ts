/**
 * UNIT30.4 / R4-COMP-CONTROLS-EARLY-END-1 — server-authoritative early end.
 *
 * These tests run the REAL migrations through SqliteD1 (including 0043), so
 * the guarded transition, the SQLite-measured duration and the separate
 * result-credit ledger are exercised as production SQL — not a fake model.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/main';
import { CompetitionModel } from '../../src/models/CompetitionModel';
import { H7SignalsModel } from '../../src/models/H7SignalsModel';
import { EventPusher } from '../../src/lib/services/EventPusher';
import { ScheduledTaskService } from '../../src/lib/services/ScheduledTaskService';
import { SqliteD1 } from '../helpers/sqlite-d1';

type Env = Parameters<typeof app.request>[2];
const env = (database: SqliteD1): Env => ({ DB: database } as unknown as Env);

let db: SqliteD1;
let ipSeq = 940;

async function seedBase(database: SqliteD1 = new SqliteD1()): Promise<void> {
    db = database;
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country)
         VALUES (1, 'host@u304.local', 'host304', 'x', 'Host', 1, 'ar', 'SA'),
                (2, 'guest@u304.local', 'guest304', 'x', 'Guest', 1, 'ar', 'SA'),
                (3, 'viewer@u304.local', 'viewer304', 'x', 'Viewer', 1, 'ar', 'SA')`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id)
         VALUES (1, 'dialogue', 'حوار', 'Dialogue', NULL)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
          ('sess-u304-host', 1, datetime('now', '+1 day')),
          ('sess-u304-guest', 2, datetime('now', '+1 day')),
          ('sess-u304-viewer', 3, datetime('now', '+1 day'))`
    ).run();
}

function postEnd(id: number, session: string, body: unknown = {}) {
    ipSeq += 1;
    return app.request(`/api/competitions/${id}/end`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session}`,
            'X-CSRF-Token': 'u304-early-end',
            'CF-Connecting-IP': `10.30.4.${(ipSeq % 250) + 1}`,
        },
        body: JSON.stringify(body),
    }, env(db));
}

async function addLiveCompetition(startedExpr: string): Promise<number> {
    const res = await db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, creator_id, opponent_id, status,
             language, country, created_at, started_at, stream_status)
         VALUES ('Early end fixture', 'd', 'r', 1, 1, 2, 'live',
                 'ar', 'SA', datetime('now'), ${startedExpr}, 'live')`
    ).run();
    return Number(res.meta.last_row_id);
}

async function readRow(id: number): Promise<Record<string, unknown>> {
    const row = await db.prepare(
        `SELECT status, started_at, ended_at, duration_seconds, ended_early,
                ended_by_user_id, end_reason, result_source, result_version,
                winner_id, elo_applied_at
           FROM competitions WHERE id = ?`
    ).bind(id).first<Record<string, unknown>>();
    return row ?? {};
}

async function credits(id: number): Promise<Array<{ competitor_id: number; stars: number; source: string; reason: string }>> {
    const res = await db.prepare(
        `SELECT competitor_id, stars, source, reason
           FROM competition_result_credits
          WHERE competition_id = ?
          ORDER BY stars DESC, competitor_id ASC`
    ).bind(id).all<{ competitor_id: number; stars: number; source: string; reason: string }>();
    return res.results ?? [];
}

/**
 * Simulates a transient failure of the single atomic aggregates/ELO batch
 * (the statement that writes `creator_rating`/`opponent_rating`/`winner_id`).
 * Other batches (the guarded cutoff + credit ledger) keep working.
 */
class FailingAggregateBatchD1 extends SqliteD1 {
    failAggregateBatch = false;

    async batch(statements: Parameters<SqliteD1['batch']>[0]) {
        const sql = statements.map((statement) => statement.sqlText).join('\n');
        if (this.failAggregateBatch && sql.includes('SET creator_rating')) {
            this.failAggregateBatch = false;
            throw new Error('simulated aggregate batch failure');
        }
        return super.batch(statements);
    }
}

beforeEach(async () => {
    await seedBase();
});

describe('UNIT30.4 early-end duration and credit ledger', () => {
    it('treats a trusted 299.5s competitor End as early: opponent +10, actor 0, one winner', async () => {
        const id = await addLiveCompetition("strftime('%Y-%m-%d %H:%M:%f', 'now', '-299.5 seconds')");
        const model = new CompetitionModel(db as unknown as D1Database);

        expect(await model.complete(id, { actorUserId: 1, endReason: 'competitor_end' })).toBe(true);

        const row = await readRow(id);
        expect(row.status).toBe('completed');
        expect(Number(row.ended_early)).toBe(1);
        expect(row.result_source).toBe('SYSTEM_EARLY_END');
        expect(Number(row.ended_by_user_id)).toBe(1);
        expect(row.end_reason).toBe('early_withdrawal');
        expect(Number(row.result_version)).toBe(1);
        expect(Number(row.duration_seconds)).toBeGreaterThanOrEqual(299);
        expect(Number(row.duration_seconds)).toBeLessThan(300);

        expect(await credits(id)).toEqual([
            { competitor_id: 2, stars: 10, source: 'SYSTEM_EARLY_END', reason: 'early_withdrawal' },
            { competitor_id: 1, stars: 0, source: 'SYSTEM_EARLY_END', reason: 'early_withdrawal' },
        ]);

        // Finalization (the existing idempotent path) must name the opponent
        // as winner from the confirmed actor, not from absent viewer votes.
        await new ScheduledTaskService(db as unknown as D1Database).updateAggregatesAfterVote(id);
        expect(Number((await readRow(id)).winner_id)).toBe(2);
    });

    it('API ignores client duration/winner/credit claims and uses the session actor', async () => {
        const id = await addLiveCompetition("strftime('%Y-%m-%d %H:%M:%f', 'now', '-100 seconds')");

        // Viewer can never end.
        expect((await postEnd(id, 'sess-u304-viewer', {})).status).toBe(403);

        const res = await postEnd(id, 'sess-u304-host', {
            duration_seconds: 9999,
            early_end: false,
            winner_id: 2,
            stars: 10,
            ended_by_user_id: 2,
            result_source: 'RATINGS',
        });
        expect(res.status).toBe(200);
        const json = await res.json() as { data: Record<string, unknown> };
        expect(json.data.early_end).toBe(true);
        expect(json.data.result_source).toBe('SYSTEM_EARLY_END');
        expect(Number(json.data.winner_id)).toBe(2);

        const row = await readRow(id);
        expect(Number(row.duration_seconds)).toBeLessThan(300);
        expect(Number(row.ended_by_user_id)).toBe(1);
        expect(await credits(id)).toHaveLength(2);

        // A losing simultaneous request cannot overwrite the actor, winner
        // or credits, even with a different claimed winner in the body.
        const repeat = await postEnd(id, 'sess-u304-guest', { winner_id: 1, stars: 999 });
        expect(repeat.status).toBe(200);
        const repeatJson = await repeat.json() as { data: Record<string, unknown> };
        expect(repeatJson.data.already_completed).toBe(true);
        expect(Number(repeatJson.data.winner_id)).toBe(2);
        expect(Number((await readRow(id)).ended_by_user_id)).toBe(1);
        expect(await credits(id)).toHaveLength(2);
    });

    it('Codex P2: connected viewers get result_pending, then the settled winner after finalize', async () => {
        const id = await addLiveCompetition("strftime('%Y-%m-%d %H:%M:%f', 'now', '-120 seconds')");
        const events: Array<Record<string, unknown>> = [];
        const spy = vi.spyOn(EventPusher.prototype, 'publishCompetitionStatus')
            .mockImplementation(async (competitionId, change) => {
                events.push({ competition_id: competitionId, ...change });
                return { id: events.length, sseMessage: '' } as never;
            });

        try {
            const res = await postEnd(id, 'sess-u304-host', {});
            expect(res.status).toBe(200);
            const json = await res.json() as { data: Record<string, unknown> };
            expect(Number(json.data.winner_id)).toBe(2);

            const terminal = events.filter(event => event.status === 'completed');
            expect(terminal.length).toBeGreaterThanOrEqual(2);
            // The immediate cutoff event is terminal for teardown but must
            // never claim a winner before finalizeCompetition settles it.
            expect(terminal[0].result_pending).toBe(true);
            expect(terminal[0].winner_id).toBeUndefined();
            // The last event is the one a still-connected viewer receives
            // without reloading; it carries the final winner.
            const final = terminal[terminal.length - 1];
            expect(final.result_pending).toBe(false);
            expect(final.winner_id).toBe(2);
            expect(final.result_source).toBe('SYSTEM_EARLY_END');
            expect(final.early_end).toBe(true);
        } finally {
            spy.mockRestore();
        }
    });

    it('REGRESSION: aggregate failure keeps result pending; the successful recalc publishes the settled winner once', async () => {
        const fdb = new FailingAggregateBatchD1();
        await seedBase(fdb);
        const id = await addLiveCompetition("strftime('%Y-%m-%d %H:%M:%f', 'now', '-120 seconds')");

        // A real viewer vote favors the creator. That is the provisional live
        // winner and must never be announced as the final early-end result.
        await fdb.prepare(
            `INSERT INTO ratings (competition_id, user_id, competitor_id, rating)
             VALUES (?, 3, 1, 5)`
        ).bind(id).run();
        const service = new ScheduledTaskService(fdb as unknown as D1Database);
        await service.updateAggregatesAfterVote(id);
        expect(Number((await readRow(id)).winner_id)).toBe(1);

        const events: Array<Record<string, unknown>> = [];
        const spy = vi.spyOn(EventPusher.prototype, 'publishCompetitionStatus')
            .mockImplementation(async (competitionId, change) => {
                events.push({ competition_id: competitionId, ...change });
                return { id: events.length, sseMessage: '' } as never;
            });

        try {
            fdb.failAggregateBatch = true;
            const res = await postEnd(id, 'sess-u304-host', {});
            expect(res.status).toBe(200);
            const json = await res.json() as { data: Record<string, unknown> };
            // Cutoff persisted, but the final result is not settled yet.
            expect(json.data.result_pending).toBe(true);
            expect(json.data.winner_id).toBeNull();

            const pending = events.filter(event => event.status === 'completed');
            expect(pending).toHaveLength(1);
            expect(pending[0].result_pending).toBe(true);
            expect(pending[0].winner_id).toBeUndefined();

            const unsettled = await readRow(id);
            expect(unsettled.status).toBe('completed');
            expect(Number(unsettled.winner_id)).toBe(1); // provisional, not final
            expect(unsettled.elo_applied_at).toBeNull();

            const retry = await fdb.prepare(
                `SELECT id FROM competition_scheduled_tasks
                  WHERE competition_id = ? AND task_type = 'recalc_aggregates' AND status = 'pending'
                  ORDER BY id DESC LIMIT 1`
            ).bind(id).first<{ id: number }>();
            expect(retry).toBeTruthy();

            // The retry succeeds: settle the DB and publish the final winner
            // (the opponent, because the creator withdrew early) exactly once.
            await fdb.prepare(
                `UPDATE competition_scheduled_tasks
                    SET execute_at = datetime('now', '-1 minute')
                  WHERE id = ?`
            ).bind(retry!.id).run();
            fdb.failAggregateBatch = false;
            await service.processPendingTasks();

            const settled = await readRow(id);
            expect(Number(settled.winner_id)).toBe(2);
            expect(settled.elo_applied_at).toBeTruthy();

            const finals = events.filter(event => event.status === 'completed' && event.result_pending === false);
            expect(finals).toHaveLength(1);
            expect(finals[0].winner_id).toBe(2);
            expect(finals[0].result_source).toBe('SYSTEM_EARLY_END');
            expect(finals[0].early_end).toBe(true);

            // Retry/concurrency must not duplicate or contradict the final event.
            await service.finalizeCompetition(id);
            await service.processPendingTasks();
            expect(events.filter(event => event.status === 'completed' && event.result_pending === false)).toHaveLength(1);
        } finally {
            spy.mockRestore();
        }
    });

    it('REGRESSION: a vote pass racing the cutoff cannot claim or announce the final result', async () => {
        const id = await addLiveCompetition("strftime('%Y-%m-%d %H:%M:%f', 'now', '-120 seconds')");
        const model = new CompetitionModel(db as unknown as D1Database);
        expect(await model.complete(id, { actorUserId: 1, endReason: 'competitor_end' })).toBe(true);

        const events: Array<Record<string, unknown>> = [];
        const spy = vi.spyOn(EventPusher.prototype, 'publishCompetitionStatus')
            .mockImplementation(async (competitionId, change) => {
                events.push({ competition_id: competitionId, ...change });
                return { id: events.length, sseMessage: '' } as never;
            });

        try {
            const service = new ScheduledTaskService(db as unknown as D1Database);
            // The vote request read `live`, then the cutoff landed before its
            // aggregate pass. It must not run the final ELO pass or announce.
            const votePass = await service.updateAggregatesAfterVote(id, { allowFinalize: false });
            expect(votePass.settled).toBe(false);
            expect(votePass.final).toBe(true);
            expect(votePass.finalClaimed).toBe(false);
            expect((await readRow(id)).elo_applied_at).toBeNull();
            expect(events.filter(event => event.result_pending === false)).toHaveLength(0);

            // The finalize path still owns the claim and emits the one final event.
            const finalized = await service.finalizeCompetition(id);
            expect(finalized.settled).toBe(true);
            expect((await readRow(id)).elo_applied_at).toBeTruthy();
            const finals = events.filter(event => event.status === 'completed' && event.result_pending === false);
            expect(finals).toHaveLength(1);
            expect(finals[0].winner_id).toBe(2);
        } finally {
            spy.mockRestore();
        }
    });

    it('REGRESSION: a delayed live aggregate pass cannot overwrite the final row', async () => {
        const id = await addLiveCompetition("strftime('%Y-%m-%d %H:%M:%f', 'now', '-120 seconds')");
        const service = new ScheduledTaskService(db as unknown as D1Database);

        // The live provisional pass emits a status guard.
        const batchSpy = vi.spyOn(db, 'batch');
        try {
            await service.updateAggregatesAfterVote(id, { allowFinalize: false });
            const sql = batchSpy.mock.calls[0]?.[0]?.[0]?.sqlText ?? '';
            expect(sql).toContain("AND status = 'live'");
        } finally {
            batchSpy.mockRestore();
        }

        // Cutoff + finalize settles the opponent as the winner.
        const model = new CompetitionModel(db as unknown as D1Database);
        expect(await model.complete(id, { actorUserId: 1, endReason: 'competitor_end' })).toBe(true);
        await service.finalizeCompetition(id);
        expect(Number((await readRow(id)).winner_id)).toBe(2);

        // The delayed provisional write now matches zero rows.
        const delayed = await db.prepare(`
            UPDATE competitions
            SET creator_rating = 5, opponent_rating = 0, average_rating = 5, winner_id = 1
            WHERE id = ? AND status = 'live'
        `).bind(id).run();
        expect(Number(delayed.meta.changes)).toBe(0);
        expect(Number((await readRow(id)).winner_id)).toBe(2);
    });

    it('REGRESSION: concurrent finalize publishes exactly one settled winner event', async () => {
        const id = await addLiveCompetition("strftime('%Y-%m-%d %H:%M:%f', 'now', '-120 seconds')");
        const model = new CompetitionModel(db as unknown as D1Database);
        expect(await model.complete(id, { actorUserId: 1, endReason: 'competitor_end' })).toBe(true);

        const events: Array<Record<string, unknown>> = [];
        const spy = vi.spyOn(EventPusher.prototype, 'publishCompetitionStatus')
            .mockImplementation(async (competitionId, change) => {
                events.push({ competition_id: competitionId, ...change });
                return { id: events.length, sseMessage: '' } as never;
            });

        try {
            const service = new ScheduledTaskService(db as unknown as D1Database);
            await Promise.all([
                service.finalizeCompetition(id),
                service.finalizeCompetition(id),
            ]);

            const finals = events.filter(event => event.status === 'completed' && event.result_pending === false);
            expect(finals).toHaveLength(1);
            expect(finals[0].winner_id).toBe(2);
            expect(Number((await readRow(id)).winner_id)).toBe(2);
        } finally {
            spy.mockRestore();
        }
    });

    it('rejects an unauthorized model actor without closing the competition', async () => {
        const id = await addLiveCompetition("strftime('%Y-%m-%d %H:%M:%f', 'now', '-100 seconds')");
        const model = new CompetitionModel(db as unknown as D1Database);
        expect(await model.complete(id, { actorUserId: 3, endReason: 'competitor_end' })).toBe(false);
        expect((await readRow(id)).status).toBe('live');
        expect(await credits(id)).toEqual([]);
    });

    it('treats a trusted 300.5s End as normal and adds no system credit', async () => {
        const id = await addLiveCompetition("strftime('%Y-%m-%d %H:%M:%f', 'now', '-300.5 seconds')");
        const model = new CompetitionModel(db as unknown as D1Database);

        expect(await model.complete(id, { actorUserId: 2, endReason: 'competitor_end' })).toBe(true);
        const row = await readRow(id);
        expect(Number(row.ended_early)).toBe(0);
        expect(row.result_source).toBe('RATINGS');
        expect(row.end_reason).toBe('normal_end');
        expect(await credits(id)).toEqual([]);
    });

    it('does not double-add on retry/reload or a losing simultaneous End', async () => {
        const id = await addLiveCompetition("strftime('%Y-%m-%d %H:%M:%f', 'now', '-120 seconds')");
        const model = new CompetitionModel(db as unknown as D1Database);

        expect(await model.complete(id, { actorUserId: 1, endReason: 'competitor_end' })).toBe(true);
        const first = await credits(id);
        expect(first).toHaveLength(2);

        // Retry / reload / losing request (opponent) must not change the
        // actor, the result, or the credit count.
        expect(await model.complete(id, { actorUserId: 1, endReason: 'competitor_end' })).toBe(false);
        expect(await model.complete(id, { actorUserId: 2, endReason: 'competitor_end' })).toBe(false);
        expect(await credits(id)).toEqual(first);
        expect(Number((await readRow(id)).ended_by_user_id)).toBe(1);
    });

    it('auto-end stores AUTO with no invented withdrawing actor and no credit', async () => {
        const id = await addLiveCompetition("datetime('now', '-10 seconds')");
        const service = new ScheduledTaskService(db as unknown as D1Database);

        expect(await service.endLiveMaxDuration(id, 0)).toBe(true);
        const row = await readRow(id);
        expect(Number(row.ended_early)).toBe(1);
        expect(row.result_source).toBe('AUTO');
        expect(row.ended_by_user_id).toBeNull();
        expect(row.end_reason).toBe('auto_end');
        expect(await credits(id)).toEqual([]);
    });

    it('does not invent a winner for an auto-end, but keeps the short quality rule', async () => {
        const id = await addLiveCompetition("datetime('now', '-10 seconds')");
        const service = new ScheduledTaskService(db as unknown as D1Database);
        expect(await service.endLiveMaxDuration(id, 0)).toBe(true);
        await service.updateAggregatesAfterVote(id);
        expect((await readRow(id)).winner_id).toBeNull();
    });

    it('integrates the system credit once into the profile aggregate, never as a fake rating', async () => {
        const id = await addLiveCompetition("strftime('%Y-%m-%d %H:%M:%f', 'now', '-60 seconds')");
        const model = new CompetitionModel(db as unknown as D1Database);
        expect(await model.complete(id, { actorUserId: 1, endReason: 'competitor_end' })).toBe(true);

        const ratings = await db.prepare(
            'SELECT COUNT(*) AS n FROM ratings WHERE competition_id = ?'
        ).bind(id).first<{ n: number }>();
        expect(Number(ratings?.n)).toBe(0);

        const profiles = await new H7SignalsModel(db as unknown as D1Database).loadProfiles([1, 2]);
        expect(profiles.get(1)).toEqual({ sum: 0, count: 1 });
        expect(profiles.get(2)).toEqual({ sum: 10, count: 1 });
    });

    it('falls back to the ratings-only profile aggregate before migration 0043 is applied', async () => {
        const id = await addLiveCompetition("datetime('now', '-60 seconds')");
        await db.prepare(
            `INSERT INTO ratings (competition_id, user_id, competitor_id, rating)
             VALUES (?, 3, 1, 5)`
        ).bind(id).run();
        // Simulate a deploy that briefly precedes the additive migration.
        await db.prepare('DROP TABLE competition_result_credits').run();

        const profiles = await new H7SignalsModel(db as unknown as D1Database).loadProfiles([1]);
        expect(profiles.get(1)).toEqual({ sum: 5, count: 1 });
    });
});
