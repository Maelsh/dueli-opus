/**
 * UNIT32.2-REM1 — safe competition title in delete confirm (CSP args)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';
import type { D1Database } from '@cloudflare/workers-types';

const env = (db: SqliteD1) => ({ DB: db as unknown as D1Database } as never);

describe('UNIT32.2-REM1 profile delete title encoding', () => {
    beforeEach(() => {
        // per-test db in each it
    });

    it('embeds quoted title in data-comp-title without breaking data-csp-args JSON', async () => {
        const db = createSqliteD1();
        const title = 'Say "hello" & bye <test>';
        db.exec(`
            INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active)
            VALUES (601, 't@test.local', 'title_owner', 'x', 'Owner', 1, 1);
            INSERT INTO categories (id, slug, name_ar, name_en) VALUES (6010, 'c', 'C', 'C');
            INSERT INTO sessions (id, user_id, expires_at) VALUES ('title-sess', 601, datetime('now', '+1 day'));
            INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, competition_type)
            VALUES (6011, '${title.replace(/'/g, "''")}', 'r', 6010, 601, NULL, 'pending', 'instant');
        `);
        const html = await (await app.request('/profile/title_owner?lang=en', {
            headers: { Authorization: `Bearer title-sess` },
        }, env(db))).text();
        expect(html).toContain("data-csp-args='[6011]'");
        expect(html).toContain('data-comp-title="');
        expect(html).toContain('&quot;hello&quot;');
        expect(html).toContain('&lt;test&gt;');
        expect(html).not.toContain("confirmDeleteOwnerCompetition' data-csp-args='[6011,");
    });
});
