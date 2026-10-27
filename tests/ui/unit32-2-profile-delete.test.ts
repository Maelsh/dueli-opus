/**
 * UNIT32.2 — owner profile competitions delete affordance (server HTML)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';
import type { D1Database } from '@cloudflare/workers-types';

const CREATOR = 32270;
const OPPONENT = 32271;
const CREATOR_SESSION = 'u322-prof-owner';

const env = (db: SqliteD1) => ({ DB: db as unknown as D1Database } as never);

let db: SqliteD1;

function seed(): void {
    db.exec(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active)
        VALUES (${CREATOR}, 'own322@test.local', 'owner322', 'x', 'Owner', 1, 1),
               (${OPPONENT}, 'opp322@test.local', 'opp322', 'x', 'Opp', 1, 1);
        INSERT INTO categories (id, slug, name_ar, name_en) VALUES (3227, 'u322p', 'P', 'P');
        INSERT INTO sessions (id, user_id, expires_at) VALUES ('${CREATOR_SESSION}', ${CREATOR}, datetime('now', '+1 day'));
        INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, scheduled_at, competition_type)
        VALUES (32271, 'Deletable', 'rules', 3227, ${CREATOR}, NULL, 'pending', NULL, 'instant'),
               (32272, 'Has opponent', 'rules', 3227, ${CREATOR}, ${OPPONENT}, 'pending', NULL, 'instant');
    `);
}

beforeEach(() => {
    db = createSqliteD1();
    seed();
});

describe('UNIT32.2 — profile owner delete UI markup', () => {
    it('owner sees delete control only on eligible pending competitions', async () => {
        const res = await app.request('/profile/owner322?lang=en', {
            headers: { Authorization: `Bearer ${CREATOR_SESSION}` },
        }, env(db));
        const html = await res.text();
        expect(html).toContain('id="profileCollections"');
        expect(html).toContain('data-owner-comp-wrap="32271"');
        expect(html).not.toContain('data-owner-comp-wrap="32272"');
    });
});
