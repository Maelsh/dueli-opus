/**
 * UNIT34-C — public surface cache (guest-only, key isolation).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { CountingDb } from '../helpers/d1-measurement';
import {
    clearPublicSurfaceCache,
    buildPublicCacheKey,
    getPublicCache,
    setPublicCache,
} from '../../src/lib/services/PublicSurfaceCache';
import { RAIL_POLICY_VERSION } from '../../src/models/HomeRailProviders';
import { SessionModel } from '../../src/models/SessionModel';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];
const envOf = (db: unknown): Env => ({ DB: db }) as unknown as Env;

async function seedMinimalHome(db: SqliteD1): Promise<void> {
    await db
        .prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country)
             VALUES (1, 'v@local', 'viewer', 'x', 'Viewer', 1, 'en', 'US'),
                    (2, 'g@local', 'guestcreator', 'x', 'Creator', 1, 'en', 'US')`
        )
        .run();
    await db
        .prepare(`INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES (10, 'dialogue', 'حوار', 'Dialogue', NULL)`)
        .run();
    await db
        .prepare(
            `INSERT INTO competitions (title, description, rules, category_id, creator_id, opponent_id, language, status, started_at)
             VALUES ('live-c', 'd', 'r', 10, 2, 2, 'en', 'live', datetime('now')),
                    ('done-c', 'd', 'r', 10, 2, 2, 'en', 'completed', datetime('now'))`
        )
        .run();
}

describe('UNIT34-C public cache', () => {
    beforeEach(() => clearPublicSurfaceCache());

    it('cache keys isolate surface, category/subcategory, status, lang, policy_version', () => {
        const base = {
            surface: 'suggested-guest',
            category: '',
            subcategory: '',
            status: 'live',
            lang: 'en',
            policy_version: RAIL_POLICY_VERSION,
        };
        const liveEn = buildPublicCacheKey(base);
        const recAr = buildPublicCacheKey({ ...base, status: 'recorded', lang: 'ar' });
        const catRail = buildPublicCacheKey({
            surface: 'category-guest',
            category: 'dialogue',
            subcategory: 'debate',
            status: 'live',
            lang: 'en',
            policy_version: RAIL_POLICY_VERSION,
        });
        const otherPolicy = buildPublicCacheKey({ ...base, policy_version: 'h7-v0-legacy' });
        expect(liveEn).not.toBe(recAr);
        expect(liveEn).not.toBe(catRail);
        expect(liveEn).not.toBe(otherPolicy);
    });

    it('PublicSurfaceCache hit avoids recomputing keyed values (module-level; not session T0)', () => {
        const key = buildPublicCacheKey({
            surface: 'suggested-guest',
            category: '',
            subcategory: '',
            status: 'live',
            lang: 'en',
            policy_version: RAIL_POLICY_VERSION,
        });
        let computeCalls = 0;
        const load = (): number[] => {
            const hit = getPublicCache<number[]>(key);
            if (hit) return hit;
            computeCalls += 1;
            const ids = [1, 2, 3];
            setPublicCache(key, ids);
            return ids;
        };
        expect(load()).toEqual([1, 2, 3]);
        expect(computeCalls).toBe(1);
        expect(load()).toEqual([1, 2, 3]);
        expect(computeCalls).toBe(1);
    });

    it('does not reuse live cache for a different status tab (cache miss by key)', async () => {
        const raw = new SqliteD1();
        await seedMinimalHome(raw);
        const db = new CountingDb(raw);
        const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'unit34-cache' };
        await app.request(
            '/api/home-rails/sessions?lang=en',
            { method: 'POST', headers, body: JSON.stringify({ kind: 'suggested', status: 'live' }) },
            envOf(db)
        );
        const before = db.statements;
        await app.request(
            '/api/home-rails/sessions?lang=en',
            { method: 'POST', headers, body: JSON.stringify({ kind: 'suggested', status: 'completed' }) },
            envOf(db)
        );
        const completedStmts = db.statements - before;
        clearPublicSurfaceCache();
        const coldRaw = new SqliteD1();
        await seedMinimalHome(coldRaw);
        const cold = new CountingDb(coldRaw);
        await app.request(
            '/api/home-rails/sessions?lang=en',
            { method: 'POST', headers, body: JSON.stringify({ kind: 'suggested', status: 'completed' }) },
            envOf(cold)
        );
        const coldCompleted = cold.statements;
        expect(completedStmts).toBeGreaterThanOrEqual(coldCompleted - 2);
    });

    it('logged-in user path does not benefit from guest cache warming', async () => {
        const raw = new SqliteD1();
        await seedMinimalHome(raw);
        const sessions = new SessionModel(raw as unknown as D1Database);
        const session = await sessions.create({ user_id: 1 });
        const db = new CountingDb(raw);
        const headers = { 'Content-Type': 'application/json', 'X-CSRF-Token': 'unit34-cache' };
        const guestBody = JSON.stringify({ kind: 'suggested', status: 'live' });
        await app.request('/api/home-rails/sessions?lang=en', { method: 'POST', headers, body: guestBody }, envOf(db));
        const beforeUser = db.statements;
        const userRes = await app.request(
            '/api/home-rails/sessions?lang=en',
            {
                method: 'POST',
                headers: { ...headers, Authorization: `Bearer ${session.id}` },
                body: guestBody,
            },
            envOf(db)
        );
        expect(userRes.status).toBe(201);
        const userStmts = db.statements - beforeUser;
        clearPublicSurfaceCache();
        const coldRaw = new SqliteD1();
        await seedMinimalHome(coldRaw);
        const cold = new CountingDb(coldRaw);
        const coldSession = await new SessionModel(coldRaw as unknown as D1Database).create({ user_id: 1 });
        await app.request(
            '/api/home-rails/sessions?lang=en',
            {
                method: 'POST',
                headers: { ...headers, Authorization: `Bearer ${coldSession.id}` },
                body: guestBody,
            },
            envOf(cold)
        );
        expect(userStmts).toBeGreaterThanOrEqual(cold.statements - 3);
    });
});
