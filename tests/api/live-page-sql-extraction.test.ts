import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { translations } from '../../src/i18n';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';

// F-5C: exercise unchanged page handlers and model SQL through the real app.
describe.each(['host', 'guest'] as const)('F-5C live %s page', (role) => {
    let db: SqliteD1;
    const session = role === 'host' ? 'host-session' : 'guest-session';
    beforeEach(() => {
        db = createSqliteD1();
        db.exec(`
            INSERT INTO users (id, email, username, password_hash, display_name)
            VALUES (1, 'host@test.local', 'host_user', 'x', 'Host'),
                   (2, 'guest@test.local', 'guest_user', 'x', 'Guest'),
                   (3, 'viewer@test.local', 'viewer_user', 'x', 'Viewer');
            INSERT INTO categories (id, slug, name_ar, name_en) VALUES (9001, 'pages', 'Pages', 'Pages');
            INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id)
            VALUES (9002, 'Page competition', 'Rules', 9001, 1, 2);
            INSERT INTO sessions (id, user_id, expires_at) VALUES
                ('host-session', 1, datetime('now', '+1 day')),
                ('guest-session', 2, datetime('now', '+1 day')),
                ('viewer-session', 3, datetime('now', '+1 day'));
        `);
    });
    afterEach(() => db.close());

    function call(comp = '9002', token: string | null = session, lang: 'ar' | 'en' = 'en') {
        return app.request(`/live/${role}?comp=${encodeURIComponent(comp)}&lang=${lang}`, {
            headers: token ? { Cookie: `sessionId=${token}` } : {},
        }, { DB: db as unknown as D1Database } as never);
    }

    it.each(['ar', 'en'] as const)('renders the authorized role with unchanged localization in %s', async (lang) => {
        const res = await call('9002', session, lang);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
        const html = await res.text();
        expect(html).toContain(`${translations[lang][role]} - ${translations[lang].test_stream}`);
        expect(html).toContain('id="localVideo"');
        expect(html).toContain(`dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`);
    });

    it.each([null, 'missing-session'])('redirects missing/unknown session %s to the original login URL', async (token) => {
        const res = await call('9002', token);
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe(`/login?redirect=/live/${role}?comp=9002&lang=en`);
    });

    it.each(["datetime('now', '-1 day')", "datetime('now')"])('rejects expiration at %s using a strict SQL boundary', async (expiry) => {
        db.exec(`UPDATE sessions SET expires_at = ${expiry}`);
        const res = await call();
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe(`/login?redirect=/live/${role}?comp=9002&lang=en`);
    });

    it.each(['viewer-session', role === 'host' ? 'guest-session' : 'host-session'])('rejects the wrong role for %s', async (token) => {
        const res = await call('9002', token, 'ar');
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe('/competition/9002?lang=ar&error=not_authorized');
    });

    it.each(['9999', 'not-a-number', '0x232a'])('preserves missing/nonmatching competition lookup for %s', async (comp) => {
        const res = await call(comp);
        expect(res.status).toBe(302);
        expect(res.headers.get('location')).toBe(`/competition/${comp}?lang=en&error=not_authorized`);
    });

    it('keeps SQLite numeric-affinity matching without coercing the bound string', async () => {
        expect((await call('09002')).status).toBe(200);
    });

    if (role === 'guest') {
        it('rejects a competition with no opponent', async () => {
            db.exec('UPDATE competitions SET opponent_id = NULL WHERE id = 9002');
            const res = await call();
            expect(res.status).toBe(302);
            expect(res.headers.get('location')).toBe('/competition/9002?lang=en&error=not_authorized');
        });
    }
});
