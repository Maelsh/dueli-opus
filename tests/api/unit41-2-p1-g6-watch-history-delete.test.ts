/**
 * UNIT41.2-P1 (G6) — owner-only Watch History delete + clear-all.
 *
 * Contract under test:
 * - The whole /api/watch surface requires an authenticated session (no
 *   `user_id` parameter anywhere in the contract): a guest gets 401.
 * - DELETE /api/watch/history/:competitionId removes ONLY the caller's own
 *   row for that competition and never another member's history.
 * - DELETE /api/watch/history clears the caller's history only; other
 *   members' rows survive.
 * - GET /api/watch/history keeps the owner-scoped envelope.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 800;
function headers(token?: string, method = 'DELETE'): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'X-CSRF-Token': 'g6-history-test',
        'CF-Connecting-IP': `10.6.6.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    void method;
    return h;
}

async function seed(db: SqliteD1): Promise<{ ownRows: number[] }> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country) VALUES
         (2, 'owner@g6.local', 'ownerg6', 'x', 'Owner G6', 1, 'ar', 'SA'),
         (3, 'other@g6.local', 'otherg6', 'x', 'Other G6', 1, 'ar', 'SA')`,
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('sess-g6-user2', 2, datetime('now', '+1 day')),
         ('sess-g6-user3', 3, datetime('now', '+1 day'))`,
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (10, 'dialogue', 'حوار', 'Dialogue')`,
    ).run();
    const stmt = db.prepare(
        `INSERT INTO competitions (title, description, rules, category_id, creator_id, language, status, created_at, vod_url, is_fake)
         VALUES (?, 'd', 'r', 10, 2, 'ar', 'completed', '2026-05-01 10:00:00', 'https://cdn.local/g6.mp4', 0)`,
    );
    const ids: number[] = [];
    for (let k = 0; k < 3; k++) {
        const r = await stmt.bind(`G6 probe ${k}`).run();
        ids.push(Number(r.meta.last_row_id));
    }
    await db.prepare(
        `WITH entries(user_id, competition_id, s) AS (
            VALUES (2, ${ids[0]}, 120), (2, ${ids[1]}, 120), (3, ${ids[1]}, 120), (3, ${ids[2]}, 120)
        )
        INSERT INTO watch_history (user_id, competition_id, watched_at, watch_duration_seconds, completed)
        SELECT user_id, competition_id, datetime('now', '-1 day'), s, 1 FROM entries`,
    ).run();
    return { ownRows: ids };
}

async function historyCount(db: SqliteD1, userId: number): Promise<number> {
    return (await db.prepare(`SELECT COUNT(*) AS n FROM watch_history WHERE user_id = ?`)
        .bind(userId).first<{ n: number }>())?.n ?? 0;
}

describe('UNIT41.2-P1 G6 — owner-only watch history delete/clear', () => {
    let db: SqliteD1;
    let ids: number[];

    beforeEach(async () => {
        db = new SqliteD1();
        ({ ownRows: ids } = await seed(db));
    });

    it('1. a guest cannot touch the history API at all (401)', async () => {
        const del = await app.request(`/api/watch/history/${ids[0]}`, {
            method: 'DELETE', headers: headers(),
        }, env(db));
        expect(del.status).toBe(401);
        const clear = await app.request('/api/watch/history', { method: 'DELETE', headers: headers() }, env(db));
        expect(clear.status).toBe(401);
        const list = await app.request('/api/watch/history?lang=ar', { headers: headers() }, env(db));
        expect(list.status).toBe(401);
        // Nothing was mutated by the attempts.
        expect(await historyCount(db, 2)).toBe(2);
        expect(await historyCount(db, 3)).toBe(2);
    });

    it('2. DELETE single entry removes only the caller row for that competition', async () => {
        const res = await app.request(`/api/watch/history/${ids[0]}`, {
            method: 'DELETE', headers: headers('sess-g6-user2'),
        }, env(db));
        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; data: { competition_id: number; removed: boolean } };
        expect(json.success).toBe(true);
        expect(json.data.competition_id).toBe(ids[0]);
        expect(json.data.removed).toBe(true);
        expect(await historyCount(db, 2)).toBe(1);
        // The other member's row for the SAME competition is untouched.
        expect(await historyCount(db, 3)).toBe(2);
    });

    it('3. an entry the caller never watched is an idempotent no success-with-false', async () => {
        const res = await app.request(`/api/watch/history/${ids[2]}`, {
            method: 'DELETE', headers: headers('sess-g6-user2'),
        }, env(db));
        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; data: { removed: boolean } };
        expect(json.success).toBe(true);
        expect(json.data.removed).toBe(false);
        expect(await historyCount(db, 2)).toBe(2);
        expect(await historyCount(db, 3)).toBe(2);
    });

    it('4. DELETE /api/watch/history clears only the caller history', async () => {
        const res = await app.request('/api/watch/history', {
            method: 'DELETE', headers: headers('sess-g6-user2'),
        }, env(db));
        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; data: { cleared: boolean } };
        expect(json.success).toBe(true);
        expect(json.data.cleared).toBe(true);
        expect(await historyCount(db, 2)).toBe(0);
        expect(await historyCount(db, 3)).toBe(2);
    });

    it('5. profile-page wires the per-card delete, clear-all and the collections anchor', () => {
        const { readFileSync } = require('node:fs') as typeof import('node:fs');
        const { join } = require('node:path') as typeof import('node:path');
        const src = readFileSync(join(process.cwd(), 'src/modules/pages/profile-page.ts'), 'utf-8');
        expect(src).toMatch(/wireCollectionRemoveButtons/);
        expect(src).toMatch(/removeCollectionItem/);
        expect(src).toMatch(/clearWatchHistory/);
        // Per-card delete targets /api/watch/<later|history>/:id via concat.
        expect(src).toMatch(/'\/api\/watch\/' \+ \(kind === 'later' \? 'later' : 'history'\) \+ '\/'/);
        expect(src).toMatch(/fetch\('\/api\/watch\/history', \{ method: 'DELETE' \}/);
    });

    it('6. navigation carries the collections quick link (owner menu)', () => {
        const { readFileSync } = require('node:fs') as typeof import('node:fs');
        const { join } = require('node:path') as typeof import('node:path');
        const src = readFileSync(join(process.cwd(), 'src/shared/components/navigation.ts'), 'utf-8');
        expect(src).toMatch(/\/profile\?lang=\$\{lang\}#profileCollections/);
    });
});
