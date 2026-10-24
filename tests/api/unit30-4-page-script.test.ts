/**
 * UNIT30.4 — rendered competition page script contract.
 *
 * The page is a server template containing a large inline browser script.
 * TypeScript/build checks the outer template but does not execute the client
 * string, so parse every inline script from a real rendered response. This
 * catches syntax regressions in the start/end and video-layout wiring without
 * claiming browser behavior.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';

describe('UNIT30.4 rendered competition page scripts', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = createSqliteD1();
        db.exec(`
            INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country)
            VALUES (1, 'host@u304-page.local', 'host304page', 'x', 'Host', 1, 'en', 'SA'),
                   (2, 'guest@u304-page.local', 'guest304page', 'x', 'Guest', 1, 'en', 'SA');
            INSERT INTO categories (id, slug, name_ar, name_en)
            VALUES (9001, 'dialogue', 'حوار', 'Dialogue');
            INSERT INTO competitions
                (id, title, rules, category_id, creator_id, opponent_id, status)
            VALUES (9002, 'Rendered page', 'Rules', 9001, 1, 2, 'live');
            INSERT INTO sessions (id, user_id, expires_at)
            VALUES ('u304-page-host', 1, datetime('now', '+1 day'));
        `);
    });

    afterEach(() => db.close());

    it('parses every rendered inline script as JavaScript', async () => {
        const res = await app.request('/competition/9002?lang=en', {
            headers: { Cookie: 'sessionId=u304-page-host' },
        }, { DB: db as unknown as D1Database } as never);
        expect(res.status).toBe(200);
        const html = await res.text();
        const scripts = Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi));
        let parsed = 0;
        for (const [, attrs, body] of scripts) {
            if (/\bsrc\s*=/.test(attrs)) continue;
            if (/\btype\s*=\s*["']application\/(?:ld\+)?json["']/.test(attrs)) continue;
            const code = body.trim();
            if (!code) continue;
            expect(() => new Function(code), code.slice(0, 240)).not.toThrow();
            parsed += 1;
        }
        // Shared streaming script + the competition page script.
        expect(parsed).toBeGreaterThanOrEqual(2);
    });
});
