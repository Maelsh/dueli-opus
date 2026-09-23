import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { translations } from '../../src/i18n';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';
import {
    SyntheticRetirementService,
    USER_DEPENDENTS,
    COMPETITION_DEPENDENTS,
} from '../../src/lib/services/SyntheticRetirementService';

/**
 * C7 synthetic-data lifecycle: gradual, dependency-safe retirement.
 * Policy: oldest is_fake=1 row with ZERO dependents is removed when a real
 * row is created; real rows and admins are never touched.
 */

async function count(db: SqliteD1, table: string): Promise<number> {
    const row = await db.prepare(`SELECT COUNT(*) c FROM ${table}`).first<{ c: number }>();
    return row?.c ?? -1;
}

describe('C7 — dependent lists cover every FK (self-maintaining)', () => {
    let db: SqliteD1;
    beforeEach(() => {
        db = createSqliteD1();
    });
    afterEach(() => { db.close(); });

    it('every FK to users()/competitions() is in the check lists (and vice versa)', async () => {
        const tables = await db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != 'd1_migrations'"
        ).all<{ name: string }>();
        const names: string[] = Array.isArray(tables)
            ? tables.map((t) => t.name)
            : (tables as unknown as { results: { name: string }[] }).results.map((t) => t.name);
        const userKeys = new Set(USER_DEPENDENTS.map((d) => `${d.table}.${d.column}`));
        const compKeys = new Set(COMPETITION_DEPENDENTS.map((d) => `${d.table}.${d.column}`));
        const missing: string[] = [];
        const extra: string[] = [...userKeys, ...compKeys];
        for (const table of names) {
            const fks = await db.prepare(`PRAGMA foreign_key_list(${table})`).all<{
                table: string; from: string;
            }>();
            const list = Array.isArray(fks) ? fks : (fks as unknown as { results: typeof fks }).results;
            for (const fk of list ?? []) {
                const key = `${table}.${fk.from}`;
                const set = fk.table === 'users' ? userKeys : fk.table === 'competitions' ? compKeys : null;
                if (!set) continue;
                if (!set.has(key)) missing.push(`${key} -> ${fk.table}`);
                const ix = extra.indexOf(key);
                if (ix >= 0) extra.splice(ix, 1);
            }
        }
        expect(missing).toEqual([]);
        // Entries for tables not yet in this schema (later stacked migrations)
        // are allowed, but every entry on an EXISTING table must name a real column.
        const existing = new Set(names);
        const columnErrors: string[] = [];
        for (const key of extra) {
            const [table, column] = key.split('.');
            if (!existing.has(table!)) continue;
            try {
                await db.prepare(`SELECT ${column} FROM ${table} LIMIT 0`).all();
            } catch {
                columnErrors.push(key);
            }
        }
        expect(columnErrors).toEqual([]);
    });
});

describe('D2 — schema defaults keep seed synthetic (explicit policy pin)', () => {
    let db: SqliteD1;
    beforeEach(() => {
        db = createSqliteD1();
    });
    afterEach(() => { db.close(); });

    it.each(['users', 'competitions'] as const)('%s.is_fake defaults to 1 (seed omits it on purpose)', async (table) => {
        const cols = await db.prepare(`PRAGMA table_info(${table})`).all<{
            name: string; dflt_value: string | null;
        }>();
        const list = Array.isArray(cols) ? cols : (cols as unknown as { results: typeof cols }).results;
        const col = (list ?? []).find((c) => c.name === 'is_fake');
        expect(col).toBeDefined();
        expect(String(col!.dflt_value)).toBe('1');
    });
});

describe('C7 — synthetic user retirement', () => {
    let db: SqliteD1;
    beforeEach(() => {
        db = createSqliteD1();
    });
    afterEach(() => { db.close(); });

    async function seedUsers() {
        // 2 synthetic (oldest first), 1 real, 1 synthetic admin.
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_fake, is_admin) VALUES
             (101, 's1@local', 'syn1', 'x', 'Syn 1', 1, 0),
             (102, 's2@local', 'syn2', 'x', 'Syn 2', 1, 0),
             (103, 'real@local', 'real1', 'x', 'Real', 0, 0),
             (104, 'sa@local', 'synadmin', 'x', 'Syn Admin', 1, 1)`
        ).run();
    }

    it('retires the oldest dependency-free synthetic user, never real/admin', async () => {
        await seedUsers();
        const svc = new SyntheticRetirementService(db as unknown as D1Database);
        expect(await svc.retireOneSyntheticUser()).toBe(101);
        expect(await count(db, 'users')).toBe(3);
        expect(await svc.retireOneSyntheticUser()).toBe(102);
        expect(await count(db, 'users')).toBe(2);
        // Only the real user and the synthetic admin remain; nothing left to retire.
        expect(await svc.retireOneSyntheticUser()).toBeNull();
        const remaining = await db.prepare('SELECT id FROM users ORDER BY id').all<{ id: number }>();
        const ids = (Array.isArray(remaining) ? remaining : (remaining as unknown as { results: { id: number }[] }).results).map((r) => r.id);
        expect(ids).toEqual([103, 104]);
    });

    it('skips a synthetic user that still has dependents', async () => {
        await seedUsers();
        await db.prepare(
            `INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-dep', 101, datetime('now', '+1 day'))`
        ).run();
        const svc = new SyntheticRetirementService(db as unknown as D1Database);
        expect(await svc.retireOneSyntheticUser()).toBe(102);
        expect(await count(db, 'users')).toBe(3);
    });

    it('returns null when no synthetic users exist', async () => {
        const svc = new SyntheticRetirementService(db as unknown as D1Database);
        expect(await svc.retireOneSyntheticUser()).toBeNull();
    });
});

describe('C7 — synthetic rows are visibly labeled in the frontend', () => {
    let db: SqliteD1;
    beforeEach(() => {
        db = createSqliteD1();
        db.exec(`
            INSERT INTO users (id, email, username, password_hash, display_name, is_fake) VALUES
             (111, 'synv@local', 'syn_visible', 'x', 'Syn Visible', 1),
             (112, 'realv@local', 'real_visible', 'x', 'Real Visible', 0);
        `);
    });
    afterEach(() => { db.close(); });

    function call(path: string) {
        return app.request(
            `https://c7-preview.dueli.pages.dev${path}`,
            {},
            { DB: db as unknown as D1Database } as never,
        );
    }

    it.each(['ar', 'en'] as const)('profile of a synthetic user shows the Demo badge (%s)', async (lang) => {
        const res = await call(`/profile/syn_visible?lang=${lang}`);
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('data-demo-badge="1"');
        expect(html).toContain(translations[lang].demo.badge);
        expect(html).toContain(translations[lang].demo.title);
    });

    it.each(['ar', 'en'] as const)('profile of a real user shows no Demo badge (%s)', async (lang) => {
        const res = await call(`/profile/real_visible?lang=${lang}`);
        expect(res.status).toBe(200);
        expect(await res.text()).not.toContain('data-demo-badge="1"');
    });

    it('demo keys exist in both languages and differ', () => {
        expect(translations.ar.demo.badge).toBeTruthy();
        expect(translations.en.demo.badge).toBeTruthy();
        expect(translations.ar.demo.badge).not.toBe(translations.en.demo.badge);
    });
});

describe('C7 — synthetic competition retirement', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = createSqliteD1();
        await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'c', 'C', 'C')`).run();
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_fake) VALUES
             (201, 'host@local', 'host', 'x', 'Host', 0)`
        ).run();
    });
    afterEach(() => { db.close(); });

    async function seedComps() {
        await db.prepare(
            `INSERT INTO competitions (id, title, rules, category_id, creator_id, status, is_fake) VALUES
             (301, 'Syn A', 'r', 1, 201, 'completed', 1),
             (302, 'Syn B', 'r', 1, 201, 'completed', 1),
             (303, 'Real C', 'r', 1, 201, 'live', 0)`
        ).run();
    }

    it('retires the oldest dependency-free synthetic competition, never real ones', async () => {
        await seedComps();
        const svc = new SyntheticRetirementService(db as unknown as D1Database);
        expect(await svc.retireOneSyntheticCompetition()).toBe(301);
        expect(await svc.retireOneSyntheticCompetition()).toBe(302);
        expect(await svc.retireOneSyntheticCompetition()).toBeNull();
        expect(await count(db, 'competitions')).toBe(1);
    });

    it('skips a synthetic competition that still has dependents', async () => {
        await seedComps();
        await db.prepare(
            `INSERT INTO ratings (competition_id, user_id, competitor_id, rating) VALUES (301, 201, 201, 5)`
        ).run();
        const svc = new SyntheticRetirementService(db as unknown as D1Database);
        expect(await svc.retireOneSyntheticCompetition()).toBe(302);
        expect(await count(db, 'competitions')).toBe(2);
    });
});
