import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import app from '../../src/main';
import { translations } from '../../src/i18n';
import { CompetitionModel } from '../../src/models/CompetitionModel';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';

// F-5C behavioral pins: run before and after extraction against real migrations.
describe('F-5C profile SSR follow counts', () => {
    let db: SqliteD1;
    beforeEach(() => {
        db = createSqliteD1();
        db.exec(`
            INSERT INTO users (id, email, username, password_hash, display_name, total_wins)
            VALUES (1, 'pages-a@test.local', 'pages_a', 'x', 'Pages A', 4),
                   (2, 'pages-b@test.local', 'pages_b', 'x', 'Pages B', 0),
                   (3, 'pages-c@test.local', 'pages_c', 'x', 'Pages C', 0);
            INSERT INTO follows (follower_id, following_id) VALUES (2, 1), (3, 1), (1, 2);
            INSERT INTO sessions (id, user_id, expires_at)
            VALUES ('pages-session', 1, datetime('now', '+1 day'));
        `);
    });
    afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); db.close(); });

    function call(path: string, headers: Record<string, string> = {}) {
        return app.request(`https://f5c-preview.dueli.pages.dev${path}`, { headers },
            { DB: db as unknown as D1Database } as never);
    }

    function counts(html: string) {
        return [...html.matchAll(/<span class="text-2xl font-bold">(\d+)<\/span>/g)]
            .map((match) => Number(match[1]));
    }

    it.each(['ar', 'en'] as const)('renders exact directional counts locally on Preview in %s', async (lang) => {
        const fetch = vi.fn().mockRejectedValue(new Error('SSR must not self-fetch'));
        vi.stubGlobal('fetch', fetch);
        const res = await call(`/profile/pages_a?lang=${lang}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
        const html = await res.text();
        expect(counts(html)).toEqual([0, 4, 2, 1]);
        expect(html).toContain(translations[lang].followers);
        expect(html).toContain(translations[lang].following);
        expect(html).toContain(`dir="${lang === 'ar' ? 'rtl' : 'ltr'}"`);
        expect(fetch).not.toHaveBeenCalled();
    });

    it('renders zero counts for an existing user without relations', async () => {
        db.exec('DELETE FROM follows');
        const res = await call('/profile/pages_a?lang=en');
        expect(res.status).toBe(200);
        expect(counts(await res.text())).toEqual([0, 4, 0, 0]);
    });

    it.each([
        { Authorization: 'Bearer pages-session' },
        { Cookie: 'sessionId=pages-session' },
        { Cookie: 'session_id=pages-session' },
    ])('preserves own-profile session resolution using %j', async (headers) => {
        const res = await call('/profile?lang=en', headers);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('@pages_a');
        expect(counts(html)).toEqual([0, 4, 2, 1]);
    });

    it('preserves 401 for missing/expired sessions and 404 for unknown profiles', async () => {
        expect((await call('/profile?lang=en')).status).toBe(401);
        db.exec("UPDATE sessions SET expires_at = datetime('now', '-1 day')");
        expect((await call('/profile?lang=en', { Cookie: 'sessionId=pages-session' })).status).toBe(401);
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await call('/profile/missing?lang=en');
        expect(res.status).toBe(404);
        expect(await res.text()).toContain('missing');
        expect(error).toHaveBeenCalledWith(expect.stringContaining('[Profile] user not found:'));
    });

    it('keeps the outer error handler and default stats when a follow query rejects', async () => {
        db.exec('DROP TABLE follows');
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        const res = await call('/profile/pages_a?lang=en');
        expect(res.status).toBe(200);
        expect(counts(await res.text())).toEqual([0, 0, 0, 0]);
        expect(error).toHaveBeenCalledWith(expect.stringContaining('[Profile] query failed:'), expect.any(Error));
    });

    it('keeps competition lookup failures isolated from follow counts', async () => {
        vi.spyOn(CompetitionModel.prototype, 'findByUser').mockRejectedValueOnce(new Error('lookup failed'));
        const res = await call('/profile/pages_a?lang=en');
        expect(res.status).toBe(200);
        expect(counts(await res.text())).toEqual([0, 4, 2, 1]);
    });
});
