/**
 * Post-R1 acceptance (E) — unsupported recommendation languages must not 500.
 *
 * Proven failure on previous main: GET /api/recommendations?lang=fr (or any
 * non-ar/en value) interpolated the raw language into `cat.name_<lang>`,
 * producing an unknown SQL column and a 500. Only ar/en have backing data.
 *
 * Pins:
 * - ar / en ⇒ 200 with valid data.
 * - fr / ca / xx / empty / malformed ⇒ 200 via the canonical fallback
 *   (normalizeContentLanguage), never an arbitrary SQL identifier.
 * - normalizeContentLanguage unit contract: allowlist {ar, en}, en fallback.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { normalizeContentLanguage } from '../../src/i18n';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, display_name, password_hash, country, language, is_active)
         VALUES (61, 'r@local', 'recuser', 'Rec User', 'x', 'SA', 'ar', 1)`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (71, 'rec-cat', 'قسم', 'Category')`
    ).run();
    await db.prepare(
        `INSERT INTO competitions
            (id, title, rules, category_id, creator_id, status, language, country,
             created_at, total_views, vod_url)
         VALUES (701, 'Rec Comp', 'rules', 71, 61, 'completed', 'ar', 'SA',
                 datetime('now'), 10, 'https://example.test/vod701.mp4')`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at)
         VALUES ('sess-rec', 61, datetime('now', '+1 day'))`
    ).run();
}

describe('post-R1: recommendation language fallback (no 500)', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    async function guest(lang: string) {
        return app.request(`/api/recommendations?lang=${encodeURIComponent(lang)}`, {}, env(db));
    }

    it('ar ⇒ 200 with category data', async () => {
        const res = await guest('ar');
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.success).toBe(true);
        expect(body.data.competitions.length).toBeGreaterThan(0);
        expect(body.data.competitions[0].category_name).toBe('قسم');
    });

    it('en ⇒ 200 with category data', async () => {
        const res = await guest('en');
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.data.competitions[0].category_name).toBe('Category');
    });

    for (const lang of ['fr', 'ca', 'xx']) {
        it(`${lang} ⇒ 200 via canonical fallback (never 500)`, async () => {
            const res = await guest(lang);
            expect(res.status).toBe(200);
            const body = (await res.json()) as any;
            expect(body.success).toBe(true);
            expect(Array.isArray(body.data.competitions)).toBe(true);
            // Fallback resolves to the default language's column.
            expect(body.data.competitions[0].category_name).toBe('Category');
        });
    }

    for (const lang of ['', 'en-US', 'AR', 'fr-FR', 'en;DROP TABLE competitions;--', '123']) {
        it(`malformed ${JSON.stringify(lang)} ⇒ 200, no dynamic SQL column`, async () => {
            const res = await guest(lang);
            expect(res.status).toBe(200);
            expect(((await res.json()) as any).success).toBe(true);
        });
    }

    it('authenticated fr ⇒ 200 via the same fallback', async () => {
        const res = await app.request('/api/recommendations?lang=fr', {
            headers: { Authorization: 'Bearer sess-rec' },
        }, env(db));
        expect(res.status).toBe(200);
        expect(((await res.json()) as any).success).toBe(true);
    });

    it('normalizeContentLanguage: explicit allowlist with en fallback', () => {
        expect(normalizeContentLanguage('ar')).toBe('ar');
        expect(normalizeContentLanguage('en')).toBe('en');
        expect(normalizeContentLanguage('AR')).toBe('ar');
        expect(normalizeContentLanguage('en-US')).toBe('en');
        expect(normalizeContentLanguage('fr')).toBe('en');
        expect(normalizeContentLanguage('ca')).toBe('en');
        expect(normalizeContentLanguage('xx')).toBe('en');
        expect(normalizeContentLanguage('')).toBe('en');
        expect(normalizeContentLanguage('en;DROP TABLE x;--')).toBe('en');
        expect(normalizeContentLanguage(null)).toBe('en');
        expect(normalizeContentLanguage(undefined)).toBe('en');
        expect(normalizeContentLanguage(123)).toBe('en');
    });
});
