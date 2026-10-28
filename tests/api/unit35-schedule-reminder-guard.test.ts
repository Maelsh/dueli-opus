/**
 * UNIT35-C — reminder API rejects live/completed competitions.
 */
import { describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { SessionModel } from '../../src/models/SessionModel';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];
const envOf = (db: unknown): Env => ({ DB: db }) as unknown as Env;

async function seedUser(db: SqliteD1): Promise<string> {
    await db
        .prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active)
             VALUES (1, 'u@local', 'user1', 'x', 'User', 1)`
        )
        .run();
    const session = await new SessionModel(db as unknown as D1Database).create({ user_id: 1 });
    return session.id;
}

describe('UNIT35 schedule reminder guards', () => {
    it('POST /remind returns 422 when competition is live', async () => {
        const db = new SqliteD1();
        const token = await seedUser(db);
        await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1,'c','C','C')`).run();
        await db
            .prepare(
                `INSERT INTO competitions (id, title, rules, category_id, creator_id, status, scheduled_at, started_at)
                 VALUES (10, 'T', 'R', 1, 1, 'live', datetime('now', '+1 hour'), datetime('now'))`
            )
            .run();
        const res = await app.request(
            '/api/competitions/10/remind',
            {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ remind_before_minutes: 30 }),
            },
            envOf(db)
        );
        expect(res.status).toBe(422);
        const body = (await res.json()) as { error?: string };
        expect(body.error).toBeTruthy();
    });
});
