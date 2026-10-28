/**
 * UNIT35.1 — home/explore search cards use creator_name (not bare Unknown).
 */
import { describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

type Env = Parameters<typeof app.request>[2];
const envOf = (db: unknown): Env => ({ DB: db }) as unknown as Env;

describe('UNIT35.1 search competitions hydration', () => {
    it('returns creator_name aligned with CompetitionModel alias', async () => {
        const db = new SqliteD1();
        await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1,'c','C','C')`).run();
        await db
            .prepare(
                `INSERT INTO users (id, email, username, password_hash, display_name, is_active)
                 VALUES (1, 'c@local', 'creator1', 'x', 'Creator Display', 1)`
            )
            .run();
        await db
            .prepare(
                `INSERT INTO competitions (id, title, rules, category_id, creator_id, status)
                 VALUES (50, 'Alpha Duel', 'R', 1, 1, 'completed')`
            )
            .run();

        const res = await app.request('/api/search/competitions?q=Alpha&limit=5', {}, envOf(db));
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            success?: boolean;
            data?: { items?: Array<{ creator_name?: string; creator_display_name?: string }> };
        };
        const item = body.data?.items?.[0];
        expect(item?.creator_name).toBe('Creator Display');
        expect(item?.creator_display_name).toBeUndefined();
    });
});
