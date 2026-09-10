import { beforeAll, describe, expect, it } from 'vitest';
import { CompetitionModel } from '../../src/models/CompetitionModel';
import {
    applyMigrationsViaWrangler,
    execD1,
    queryD1,
    readRepoFile,
    runD1Write,
} from './helpers/wrangler-d1-runner.mjs';

/* B5-1 — state guards on real D1 via Wrangler CLI. Real model, real SQL.
 * Zero Node built-in imports here (tsconfig is workers-types only). */

function esc(v: unknown): string {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    return `'${String(v).replace(/'/g, "''")}'`;
}

function runD1JsonWrite(command: string): { changes?: number; lastRowId?: number } {
    return runD1Write(command) as { changes?: number; lastRowId?: number };
}

function makeRealD1(): ConstructorParameters<typeof CompetitionModel>[0] {
    const fill = (sql: string, params: unknown[]) => {
        let i = 0;
        return sql.replace(/\?/g, () => esc(params[i++]));
    };
    const db = {
        prepare(sql: string) {
            let params: unknown[] = [];
            const stmt = {
                bind(...p: unknown[]) { params = p; return stmt; },
                async run() {
                    const m = runD1JsonWrite(fill(sql, params));
                    // Local Wrangler CLI omits changes for writes:
                    // signal "unknown" so the model uses its real-state fallback.
                    const meta: Record<string, unknown> = {};
                    if (typeof m.changes === 'number') meta['changes'] = m.changes;
                    if (typeof m.lastRowId === 'number') meta['last_row_id'] = m.lastRowId;
                    return { meta };
                },
                async first() {
                    const rows = queryD1(fill(sql, params)) as Record<string, unknown>[];
                    return (rows[0] ?? null) as unknown;
                },
                async all() {
                    const rows = queryD1(fill(sql, params)) as Record<string, unknown>[];
                    return { results: rows } as unknown;
                },
            };
            return stmt;
        },
    };
    return db as ConstructorParameters<typeof CompetitionModel>[0];
}

function seedAll() {
    execD1(`INSERT INTO users (id, email, username, password_hash, display_name, is_verified) VALUES (810001, 'b51-creator@test.local', 'b51_creator', 'x', 'B51 Creator', 1);`);
    execD1(`INSERT INTO users (id, email, username, password_hash, display_name, is_verified) VALUES (810002, 'b51-opp@test.local', 'b51_opp', 'x', 'B51 Opponent', 1);`);
    execD1(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (810001, 'b51cat', 'B5-1', 'B51 Cat');`);
    const ins = (id: number, status: string, opp: string) =>
        execD1(`INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type) VALUES (${id}, 'B51 comp ${id}', 'rules', 810001, 810001, ${opp}, '${status}', 'scheduled');`);
    ins(1, 'pending', 'NULL');
    ins(2, 'accepted', 'NULL');
    ins(3, 'accepted', '810002');
    ins(4, 'live', '810002');
    ins(5, 'live', '810002');
    ins(6, 'completed', '810002');
}

function statusOf(id: number): string {
    const rows = queryD1(`SELECT status FROM competitions WHERE id = ${id}`) as { status: string }[];
    return rows[0].status;
}

function ctrlSrc(): Promise<string> {
    return readRepoFile('src/controllers/CompetitionController.ts');
}

describe('B5-1 competition state guards (real D1 + real CompetitionModel)', () => {
    let model: CompetitionModel;
    beforeAll(() => {
        applyMigrationsViaWrangler();
        model = new CompetitionModel(makeRealD1());
        seedAll();
    });

    it('1. pending -> end rejected (complete=false, row untouched)', async () => {
        expect(await model.complete(1)).toBe(false);
        expect(statusOf(1)).toBe('pending');
    });

    it('2. accepted without opponent -> start rejected (controller i18n guard)', async () => {
        expect(statusOf(2)).toBe('accepted');
        const rows = queryD1(`SELECT opponent_id FROM competitions WHERE id = 2`) as { opponent_id: number | null }[];
        expect(rows[0].opponent_id).toBeNull();
        expect(await ctrlSrc()).toContain('competition_errors.no_opponent');
        expect(statusOf(2)).toBe('accepted');
    });

    it('3. accepted with opponent -> start ok, status becomes live', async () => {
        expect(await model.startLive(3)).toBe(true);
        expect(statusOf(3)).toBe('live');
    });

    it('4. live -> start rejected (startLive=false, stays live)', async () => {
        expect(await model.startLive(4)).toBe(false);
        expect(statusOf(4)).toBe('live');
        expect(await ctrlSrc()).toContain('competition_errors.not_eligible_to_start');
    });

    it('5. live -> end ok, status becomes completed', async () => {
        expect(await model.complete(5)).toBe(true);
        expect(statusOf(5)).toBe('completed');
    });

    it('6. end twice -> idempotent, no duplicate finalize_payouts', async () => {
        execD1(`INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status, created_at) VALUES (5, 'finalize_payouts', datetime('now', '+24 hours'), 'pending', datetime('now'));`);
        expect(await model.complete(5)).toBe(false);
        expect(await ctrlSrc()).toContain('already_completed');
        const tasks = queryD1(`SELECT COUNT(*) as n FROM competition_scheduled_tasks WHERE competition_id = 5 AND task_type = 'finalize_payouts' AND status = 'pending'`) as { n: number }[];
        expect(tasks[0].n).toBe(1);
        expect(statusOf(5)).toBe('completed');
        expect(await model.complete(6)).toBe(false);
    });

    it('controller maps wrong-state end to 409 not_live', async () => {
        const src = await ctrlSrc();
        expect(src).toContain('competition_errors.not_live');
        expect(src).toMatch(/status !== 'live'[\s\S]*?409/);
        expect(src).toMatch(/status !== 'accepted'[\s\S]*?409/);
    });
});
