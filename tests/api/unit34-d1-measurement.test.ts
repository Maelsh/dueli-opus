/**
 * UNIT34-B — reproducible D1 measurement harness (local statement counts + EXPLAIN).
 * rowsRead/rowsWritten are NOT available in local wrangler/sqlite — statement
 * executions and QUERY PLAN only; production rowsRead is estimated in the report.
 */
import { describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { CountingDb } from '../helpers/d1-measurement';
import { SearchModel } from '../../src/models/SearchModel';
import { H7SignalsModel } from '../../src/models/H7SignalsModel';
import { clearPublicSurfaceCache } from '../../src/lib/services/PublicSurfaceCache';

type Env = Parameters<typeof app.request>[2];
const envOf = (db: unknown): Env => ({ DB: db }) as unknown as Env;

const DATASET = 'synthetic ~6 users, 5+ live competitions (opt1-style seed)';

async function seedOpt1Style(db: SqliteD1): Promise<void> {
    await db
        .prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country) VALUES
             (1, 'v@local', 'viewer', 'x', 'Viewer', 1, 'en', 'US'),
             (2, 'a@local', 'alice', 'x', 'Alice', 1, 'en', 'US'),
             (3, 'b@local', 'bob', 'x', 'Bob', 1, 'en', 'US')`
        )
        .run();
    await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES (10, 'dialogue', 'd', 'Dialogue', NULL)`).run();
    for (let i = 0; i < 5; i += 1) {
        await db
            .prepare(
                `INSERT INTO competitions (title, description, rules, category_id, creator_id, opponent_id, language, status, started_at)
                 VALUES (?, 'd', 'r', 10, 2, 3, 'en', 'live', datetime('now'))`
            )
            .bind(`unit34 c${i}`)
            .run();
    }
}

describe('UNIT34-B measurement harness', () => {
    it('1) Home rail T0 vs continuation (statement counts)', async () => {
        clearPublicSurfaceCache();
        const raw = new SqliteD1();
        await seedOpt1Style(raw);
        const db = new CountingDb(raw);
        const body = JSON.stringify({ kind: 'suggested', status: 'live' });
        const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'unit34-measure' };
        const created = await app.request('/api/home-rails/sessions?lang=en', { method: 'POST', headers, body }, envOf(db));
        expect(created.status).toBe(201);
        const t0 = db.statements;
        const createdBody = (await created.json()) as { data: { session: { id: string }; guest_token: string | null } };
        const sid = createdBody.data.session.id;
        const readHeaders: Record<string, string> = { ...headers };
        if (createdBody.data.guest_token) readHeaders['X-Guest-Token'] = createdBody.data.guest_token;
        const pq = new URLSearchParams({ kind: 'suggested', status: 'live', lang: 'en', limit: '12' });
        const before = db.statements;
        const page = await app.request(`/api/home-rails/sessions/${sid}/page?${pq}`, { headers: readHeaders }, envOf(db));
        expect(page.status).toBe(200);
        const continuation = db.statements - before;
        expect(t0).toBeGreaterThan(continuation);
        process.stdout.write(`[UNIT34 measure] home-rail T0=${t0} continuation=${continuation} dataset=${DATASET}\n`);
    });

    it('2) Explore T0 vs continuation (statement counts)', async () => {
        const raw = new SqliteD1();
        await seedOpt1Style(raw);
        const db = new CountingDb(raw);
        const created = await app.request('/api/competitions/explore-sessions?lang=en', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'unit34-measure' },
            body: JSON.stringify({ search: '', status: 'live', category: '', subcategory: '' }),
        }, envOf(db));
        expect(created.status).toBe(201);
        const t0 = db.statements;
        const body = (await created.json()) as { data: { session: { id: string }; guest_token: string | null } };
        const readHeaders: Record<string, string> = { 'X-CSRF-Token': 'unit34-measure' };
        if (body.data.guest_token) readHeaders['X-Guest-Token'] = body.data.guest_token;
        const pq = new URLSearchParams({ search: '', status: 'live', category: '', subcategory: '', lang: 'en', limit: '12' });
        const before = db.statements;
        const page = await app.request(
            `/api/competitions/explore-sessions/${body.data.session.id}/page?${pq}`,
            { headers: readHeaders },
            envOf(db)
        );
        expect(page.status).toBe(200);
        const continuation = db.statements - before;
        expect(t0).toBeGreaterThan(continuation);
        process.stdout.write(`[UNIT34 measure] explore T0=${t0} continuation=${continuation}\n`);
    });

    it('3) H7SignalsModel + UserSignalsModel load paths (statement counts)', async () => {
        const raw = new SqliteD1();
        await seedOpt1Style(raw);
        const db = new CountingDb(raw);
        const h7 = new H7SignalsModel(db as never);
        const ids = [1, 2, 3, 4, 5];
        const before = db.statements;
        await h7.loadCompetitions(ids);
        const compStmts = db.statements - before;
        const beforeCtx = db.statements;
        await h7.loadViewerContext(db as never, null, 'en', null);
        const ctxStmts = db.statements - beforeCtx;
        const beforeU = db.statements;
        await h7.loadProfiles([2, 3]);
        const profileStmts = db.statements - beforeU;
        expect(compStmts).toBeGreaterThan(0);
        process.stdout.write(`[UNIT34 measure] H7 loadCompetitions=${compStmts} viewerCtx=${ctxStmts} profiles=${profileStmts}\n`);
    });

    it('4) searchCompetitions + searchUsers (statement counts)', async () => {
        const raw = new SqliteD1();
        await seedOpt1Style(raw);
        const db = new CountingDb(raw);
        const search = new SearchModel(db as never);
        const before = db.statements;
        await search.searchCompetitions('unit34', 10, 0);
        const compSearch = db.statements - before;
        const beforeU = db.statements;
        await search.searchUsers('ali', 10, 0);
        const userSearch = db.statements - beforeU;
        expect(compSearch).toBeGreaterThan(0);
        expect(userSearch).toBeGreaterThan(0);
        process.stdout.write(`[UNIT34 measure] searchCompetitions=${compSearch} searchUsers=${userSearch}\n`);
    });

    it('5) documents EXPLAIN availability for competitions listing index path', async () => {
        const raw = new SqliteD1();
        await seedOpt1Style(raw);
        const plan = await raw
            .prepare(`EXPLAIN QUERY PLAN SELECT id FROM competitions WHERE status = 'live' ORDER BY created_at DESC LIMIT 20`)
            .all<{ detail: string }>();
        const text = plan.results.map((r) => r.detail).join(' ');
        expect(text.length).toBeGreaterThan(0);
        process.stdout.write(`[UNIT34 measure] EXPLAIN sample: ${text.slice(0, 120)}…\n`);
    });
});
