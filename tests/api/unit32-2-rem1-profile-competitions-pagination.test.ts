/**
 * UNIT32.2-REM1 — profile competition shelf pagination
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../../src/main';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';

const OWNER = 32300;
const OTHER = 32301;
const OWNER_SESSION = 'u323-owner';

const env = (db: SqliteD1) => ({ DB: db as unknown as D1Database } as never);

let db: SqliteD1;

async function call(path: string, session?: string): Promise<Response> {
    return app.request(`${path}${path.includes('?') ? '&' : '?'}lang=en`, {
        headers: {
            'Content-Type': 'application/json',
            ...(session ? { Authorization: `Bearer ${OWNER_SESSION}` } : {}),
            'X-CSRF-Token': 'test',
        },
    }, env(db));
}

beforeEach(() => {
    db = createSqliteD1();
    db.exec(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active)
        VALUES (${OWNER}, 'pag@test.local', 'pag_owner', 'x', 'Pag Owner', 1, 1),
               (${OTHER}, 'other@test.local', 'pag_other', 'x', 'Other', 1, 1);
        INSERT INTO categories (id, slug, name_ar, name_en) VALUES (3230, 'pag', 'P', 'P');
        INSERT INTO sessions (id, user_id, expires_at) VALUES ('${OWNER_SESSION}', ${OWNER}, datetime('now', '+1 day'));
    `);
    for (let i = 1; i <= 55; i++) {
        const id = 40000 + i;
        const ts = `2026-01-${String(Math.min(i, 28)).padStart(2, '0')} 12:00:0${i % 10}`;
        db.exec(`
            INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, created_at, competition_type)
            VALUES (${id}, 'Comp ${i}', 'r', 3230, ${OWNER}, NULL, 'pending', '${ts}', 'instant');
        `);
    }
    db.exec(`
        INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, created_at, competition_type)
        VALUES (39999, 'Other user comp', 'r', 3230, ${OTHER}, NULL, 'pending', '2026-01-01 08:00:00', 'instant');
    `);
});

describe('UNIT32.2-REM1 profile competitions API pagination', () => {
    it('pages through all owner competitions without dupes until hasMore=false', async () => {
        const collected: number[] = [];
        let cursor: string | null = null;
        let guard = 0;
        while (guard++ < 10) {
            const q = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
            const res = await call(`/api/users/pag_owner/competitions?limit=20${q}`);
            expect(res.status).toBe(200);
            const body = (await res.json()) as { success: boolean; data: { items: Array<{ id: number }>; hasMore: boolean; nextCursor: string | null } };
            expect(body.success).toBe(true);
            for (const row of body.data.items) {
                expect(collected.includes(row.id)).toBe(false);
                collected.push(row.id);
            }
            if (!body.data.hasMore) {
                expect(body.data.nextCursor).toBeNull();
                break;
            }
            cursor = body.data.nextCursor;
            expect(cursor).toBeTruthy();
        }
        expect(collected.length).toBe(55);
        expect(collected.includes(39999)).toBe(false);
    });

    it('deletes an eligible competition discovered on a later page', async () => {
        let cursor: string | null = null;
        let targetId: number | null = null;
        for (let page = 0; page < 4; page++) {
            const q = cursor ? `&cursor=${encodeURIComponent(cursor)}` : '';
            const res = await call(`/api/users/pag_owner/competitions?limit=20${q}`);
            const body = (await res.json()) as any;
            const items = body.data.items as Array<{ id: number; title: string }>;
            if (page === 2 && items.length > 0) {
                targetId = items[0].id;
                break;
            }
            cursor = body.data.nextCursor;
        }
        expect(targetId).toBeTruthy();
        const del = await app.request(`/api/competitions/${targetId}?lang=en`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${OWNER_SESSION}`, 'X-CSRF-Token': 'test' },
        }, env(db));
        expect(del.status).toBe(200);
        const row = await db.prepare('SELECT COUNT(*) AS n FROM competitions WHERE id = ?').bind(targetId).first<{ n: number }>();
        expect(row?.n).toBe(0);
    });
});
