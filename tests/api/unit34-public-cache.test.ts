/**
 * UNIT34-C — public surface cache (guest-only, key isolation).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { CountingDb } from '../helpers/d1-measurement';
import { clearPublicSurfaceCache } from '../../src/lib/services/PublicSurfaceCache';

type Env = Parameters<typeof app.request>[2];
const envOf = (db: unknown): Env => ({ DB: db }) as unknown as Env;

async function seedMinimalHome(db: SqliteD1): Promise<void> {
    await db
        .prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country)
             VALUES (2, 'g@local', 'guestcreator', 'x', 'Creator', 1, 'en', 'US')`
        )
        .run();
    await db
        .prepare(`INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES (10, 'dialogue', 'حوار', 'Dialogue', NULL)`)
        .run();
    await db
        .prepare(
            `INSERT INTO competitions (title, description, rules, category_id, creator_id, opponent_id, language, status, started_at)
             VALUES ('c1', 'd', 'r', 10, 2, 2, 'en', 'live', datetime('now'))`
        )
        .run();
}

describe('UNIT34-C public cache', () => {
    beforeEach(() => clearPublicSurfaceCache());

    it('reduces guest suggested-rail T0 statement count on cache hit', async () => {
        const raw = new SqliteD1();
        await seedMinimalHome(raw);
        const db = new CountingDb(raw);
        const body = JSON.stringify({ kind: 'suggested', status: 'live' });
        const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'unit34-cache' };
        const first = await app.request('/api/home-rails/sessions?lang=en', { method: 'POST', headers, body }, envOf(db));
        expect(first.status).toBe(201);
        const firstStmts = db.statements;
        const second = await app.request('/api/home-rails/sessions?lang=en', { method: 'POST', headers, body }, envOf(db));
        expect(second.status).toBe(201);
        const secondStmts = db.statements - firstStmts;
        expect(secondStmts).toBeLessThan(firstStmts);
        process.stdout.write(`[UNIT34 cache] guest suggested T0 first=${firstStmts} stmts cached=${secondStmts} stmts\n`);
    });
});
