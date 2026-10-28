/**
 * UNIT35 — schedule reminder POST guard vs DELETE allowance.
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
    return (await new SessionModel(db as unknown as D1Database).create({ user_id: 1 })).id;
}

async function seedCompetition(db: SqliteD1, id: number, status: string): Promise<void> {
    await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1,'c','C','C')`).run();
    await db
        .prepare(
            `INSERT INTO competitions (id, title, rules, category_id, creator_id, status, scheduled_at)
             VALUES (?, 'T', 'R', 1, 1, ?, datetime('now', '+1 hour'))`
        )
        .bind(id, status)
        .run();
    await db
        .prepare(
            `INSERT INTO competition_reminders (competition_id, user_id, remind_at, created_at)
             VALUES (?, 1, datetime('now', '+30 minutes'), datetime('now'))`
        )
        .bind(id)
        .run();
}

describe('UNIT35 schedule reminder guards', () => {
    it('POST /remind returns 422 when competition is live', async () => {
        const db = new SqliteD1();
        const token = await seedUser(db);
        await seedCompetition(db, 10, 'live');
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
    });

    it.each(['live', 'completed', 'cancelled'] as const)(
        'DELETE /remind succeeds even when competition is %s',
        async (status) => {
            const db = new SqliteD1();
            const token = await seedUser(db);
            const id = status === 'live' ? 11 : status === 'completed' ? 12 : 13;
            await seedCompetition(db, id, status);
            const res = await app.request(
                `/api/competitions/${id}/remind`,
                { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } },
                envOf(db)
            );
            expect(res.status).toBe(200);
            const body = (await res.json()) as { success?: boolean; data?: { removed?: boolean } };
            expect(body.success).toBe(true);
            expect(body.data?.removed).toBe(true);
        }
    );
});
