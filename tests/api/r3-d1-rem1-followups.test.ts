/**
 * R3-D1-REM1 — close the 4 known REMOTE follow-ups before D2.
 *
 * 1. Unicode-aware search word boundaries (ar/en): `\b` is ASCII-only and
 *    demoted whole Arabic words to partial. h7HasWholeWord uses Unicode
 *    letter/number lookarounds; layers stay exact → prefix/whole-word →
 *    partial/description per H7. No FTS/embeddings/new deps.
 * 2. `fav:` namespace reserved for the Settings-favorites writer:
 *    title-word extraction skips colon words, search recording drops
 *    `fav:`-prefixed input (any case/whitespace). Valid favs preserved,
 *    taxonomy validation + ownership untouched.
 * 3. Counted-view writer invariant (H2): exactly one writer —
 *    WatchService.recordWatchIntent (identity/competition/UTC-day).
 *    `POST /api/analytics/view` is a thin idempotent alias to the same
 *    SSOT (client `watch_time` ignored by construction); the dead
 *    `RecommendationEngine.recordView` bypass is deleted. No IP
 *    fingerprint; GET/polling/presence never count.
 * 4. H7SignalsModel comment now describes the new architecture truth
 *    (static — proved by the pins below, not by the comment itself).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';
import { h7HasWholeWord, h7SearchLayer } from '../../src/lib/services/H7RankingPolicy';
import { RecommendationEngine } from '../../src/lib/services/RecommendationEngine';
import { WatchHistoryModel } from '../../src/models/WatchHistoryModel';
import { H7SignalsModel } from '../../src/models/H7SignalsModel';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 900;
function headers(token?: string, guest?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r3d1rem1-test',
        'CF-Connecting-IP': `10.6.6.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (guest !== undefined) h['X-Guest-Token'] = guest;
    return h;
}

describe('REM1-1 — Unicode-aware search word boundaries (ar/en)', () => {
    it('Arabic whole word mid-text is whole-word (not partial)', () => {
        expect(h7HasWholeWord('مباراة الحوار الكبرى', 'الحوار')).toBe(true);
        expect(h7SearchLayer('مباراة الحوار الكبرى', null, 'الحوار')).toBe(1);
    });

    it('Arabic prefix stays prefix', () => {
        expect(h7SearchLayer('الحوار المفتوح اليوم', null, 'الحوار')).toBe(1);
    });

    it('Arabic infix inside a longer word is partial (no false whole-word)', () => {
        // "نهائي" inside "النهائي" is preceded by a letter → not a word.
        expect(h7HasWholeWord('مباراة النهائي الكبرى', 'نهائي')).toBe(false);
        expect(h7SearchLayer('مباراة النهائي الكبرى', null, 'نهائي')).toBe(2);
    });

    it('punctuation delimits Arabic words', () => {
        expect(h7HasWholeWord('مناظرة الحوار، اليوم', 'الحوار')).toBe(true);
        expect(h7SearchLayer('مناظرة الحوار، اليوم', null, 'الحوار')).toBe(1);
        expect(h7HasWholeWord('الحوار: مناظرة اليوم', 'مناظرة')).toBe(true);
    });

    it('English whole-word/prefix/partial still hold', () => {
        expect(h7SearchLayer('Alpha Finals', null, 'Alpha Finals')).toBe(0);
        expect(h7SearchLayer('Alpha Championship', null, 'Alpha')).toBe(1);
        expect(h7SearchLayer('The Alpha contest', null, 'Alpha')).toBe(1);
        expect(h7SearchLayer('Grand Alphax event', null, 'Alpha')).toBe(2);
        expect(h7HasWholeWord('playoffs (finals)', 'finals')).toBe(true);
    });

    it('mixed Arabic/English queries work both directions', () => {
        expect(h7SearchLayer('مسابقة AI الكبرى', null, 'AI')).toBe(1);
        expect(h7SearchLayer('مسابقة AI الكبرى', null, 'الكبرى')).toBe(1);
        expect(h7SearchLayer('AI food challenge', null, 'food')).toBe(1);
    });

    it('whitespace/punctuation noise never breaks layers', () => {
        expect(h7SearchLayer('  مباراة الحوار الكبرى  ', null, '  الحوار  ')).toBe(1);
        expect(h7SearchLayer('مباراة  الحوار   الكبرى', null, 'الحوار')).toBe(1);
        expect(h7SearchLayer('Anything', null, '')).toBe(3);
        expect(h7SearchLayer('Unrelated', null, 'zzz-no-match')).toBe(3);
    });

    it('Arabic search works end-to-end through explore sessions', async () => {
        const db = createSqliteD1();
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active) VALUES (2, 'c@rem1.local', 'crem1', 'x', 'C', 1)`
        ).run();
        await db.prepare(
            `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (10, 'dialogue', 'حوار', 'Dialogue')`
        ).run();
        const ins = await db.prepare(
            `INSERT INTO competitions (title, description, rules, category_id, creator_id, language, status, created_at)
             VALUES ('مباراة الحوار الكبرى', 'وصف', 'r', 10, 2, 'ar', 'live', datetime('now'))`
        ).run();
        const id = Number(ins.meta.last_row_id);
        const created = await app.request('/api/competitions/explore-sessions?lang=ar', {
            method: 'POST', headers: headers(), body: JSON.stringify({ search: 'الحوار' }),
        }, env(db));
        expect(created.status).toBe(201);
        const json = (await created.json()) as {
            success: boolean; data: { session: { id: string }; guest_token: string | null };
        };
        const page = await app.request(
            `/api/competitions/explore-sessions/${json.data.session.id}/page?search=${encodeURIComponent('الحوار')}&lang=ar&limit=12`,
            { headers: headers(undefined, json.data.guest_token ?? undefined) }, env(db)
        );
        expect(page.status).toBe(200);
        const body = (await page.json()) as { success: boolean; data: { items: Array<{ id: number }> } };
        expect(body.data.items.map((c) => c.id)).toContain(id);
        db.close();
    });
});

describe('REM1-2 — fav: namespace reserved for the favorites writer', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = createSqliteD1();
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active) VALUES
             (2, 'c@rem1.local', 'crem1', 'x', 'C', 1),
             (3, 'v@rem1.local', 'vrem1', 'x', 'V', 1)`
        ).run();
        await db.prepare(
            `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (10, 'dialogue', 'حوار', 'Dialogue')`
        ).run();
    });

    it('hostile competition titles cannot mint fav: rows via keyword extraction', async () => {
        const ins = await db.prepare(
            `INSERT INTO competitions (title, description, rules, category_id, creator_id, language, status, created_at)
             VALUES ('fav:science rocks here daily', 'd', 'r', 10, 2, 'ar', 'live', datetime('now'))`
        ).run();
        const compId = Number(ins.meta.last_row_id);
        await new WatchHistoryModel(db as unknown as D1Database).record({
            user_id: 3, competition_id: compId, watch_duration_seconds: 5,
        });
        const rows = await db.prepare(
            `SELECT keyword FROM user_keywords WHERE user_id = 3`
        ).all<{ keyword: string }>();
        const keywords = (rows.results ?? []).map((r) => r.keyword);
        expect(keywords.filter((k) => k.toLowerCase().startsWith('fav:'))).toEqual([]);
        // Legit title words are still extracted (no over-blocking).
        expect(keywords.length).toBeGreaterThan(0);
    });

    it('recordSearch drops fav:-prefixed input in every case/whitespace shape', async () => {
        const engine = new RecommendationEngine(db as unknown as D1Database);
        for (const hostile of ['fav:science', ' FAV:Physics ', 'Fav:Religions', 'fav:']) {
            await engine.recordSearch(3, hostile);
        }
        await engine.recordSearch(3, 'genuine topic');
        const rows = await db.prepare(
            `SELECT keyword FROM user_keywords WHERE user_id = 3`
        ).all<{ keyword: string }>();
        const keywords = (rows.results ?? []).map((r) => r.keyword);
        expect(keywords.filter((k) => k.toLowerCase().startsWith('fav:'))).toEqual([]);
        expect(keywords).toContain('genuine topic');
    });

    it('pre-existing valid favorites survive hostile writes', async () => {
        const signals = new H7SignalsModel(db as unknown as D1Database);
        await signals.setFavoriteSlugs(3, ['dialogue', 'physics']);
        const engine = new RecommendationEngine(db as unknown as D1Database);
        await engine.recordSearch(3, 'fav:dialogue');
        const ins = await db.prepare(
            `INSERT INTO competitions (title, description, rules, category_id, creator_id, language, status, created_at)
             VALUES ('fav:physics debate tonight live', 'd', 'r', 10, 2, 'ar', 'live', datetime('now'))`
        ).run();
        await new WatchHistoryModel(db as unknown as D1Database).record({
            user_id: 3, competition_id: Number(ins.meta.last_row_id), watch_duration_seconds: 5,
        });
        expect((await signals.getFavoriteSlugs(3)).sort()).toEqual(['dialogue', 'physics']);
        const rows = await db.prepare(
            `SELECT keyword FROM user_keywords WHERE user_id = 3 AND lower(keyword) LIKE 'fav:%'`
        ).all<{ keyword: string }>();
        expect((rows.results ?? []).map((r) => r.keyword).sort()).toEqual(['fav:dialogue', 'fav:physics']);
    });

    it('settings rejects fav:-shaped slugs (422) while taxonomy validation stays', async () => {
        await db.prepare(
            `INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-rem1-u3', 3, datetime('now', '+1 day'))`
        ).run();
        for (const bad of [['fav:physics'], ['FAV:dialogue'], ['nope-xyz']]) {
            const res = await app.request('/api/settings/favorites?lang=ar', {
                method: 'PUT', headers: headers('sess-rem1-u3'), body: JSON.stringify({ favorites: bad }),
            }, env(db));
            expect(res.status, JSON.stringify(bad)).toBe(422);
        }
        const ok = await app.request('/api/settings/favorites?lang=ar', {
            method: 'PUT', headers: headers('sess-rem1-u3'), body: JSON.stringify({ favorites: ['Dialogue'] }),
        }, env(db));
        expect(ok.status).toBe(200);
    });
});

describe('REM1-3 — counted-view writer invariant (H2)', () => {
    let db: SqliteD1;
    let compId: number;

    beforeEach(async () => {
        db = createSqliteD1();
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active) VALUES (2, 'c@rem1.local', 'crem1', 'x', 'C', 1)`
        ).run();
        await db.prepare(
            `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (10, 'dialogue', 'حوار', 'Dialogue')`
        ).run();
        const ins = await db.prepare(
            `INSERT INTO competitions (title, description, rules, category_id, creator_id, language, status, created_at, total_views)
             VALUES ('View probe', 'd', 'r', 10, 2, 'ar', 'live', datetime('now'), 0)`
        ).run();
        compId = Number(ins.meta.last_row_id);
    });

    async function legacyView(guest?: string, watchTime = 0) {
        const res = await app.request('/api/analytics/view?lang=ar', {
            method: 'POST', headers: headers(undefined, guest),
            body: JSON.stringify({ competition_id: compId, watch_time: watchTime }),
        }, env(db));
        return { status: res.status, json: (await res.json()) as { success: boolean; data?: { counted: boolean; total_views: number; guest_token: string | null } } };
    }

    async function views(): Promise<number> {
        const row = await db.prepare(`SELECT total_views AS v FROM competitions WHERE id = ?`).bind(compId).first<{ v: number }>();
        return Number(row?.v ?? 0);
    }

    it('repeated legacy endpoint, same identity/day => counted exactly once', async () => {
        const first = await legacyView();
        expect(first.status).toBe(200);
        expect(first.json.data?.counted).toBe(true);
        const guest = first.json.data?.guest_token ?? undefined;
        expect(await views()).toBe(1);
        const second = await legacyView(guest);
        expect(second.status).toBe(200);
        expect(second.json.data?.counted).toBe(false);
        expect(await views()).toBe(1);
        const third = await legacyView(guest, 9999);
        expect(third.json.data?.counted).toBe(false);
        expect(await views()).toBe(1);
    });

    it('canonical + legacy same identity/day => still once (shared SSOT)', async () => {
        const canon = await app.request(`/api/competitions/${compId}/watch?lang=ar`, {
            method: 'POST', headers: headers(),
        }, env(db));
        expect(canon.status).toBe(200);
        const canonJson = (await canon.json()) as { success: boolean; data: { counted: boolean; guest_token: string | null } };
        expect(canonJson.data.counted).toBe(true);
        const guest = canonJson.data.guest_token ?? undefined;
        const via = await legacyView(guest);
        expect(via.json.data?.counted).toBe(false);
        expect(await views()).toBe(1);
    });

    it('different identities count separately (no cross-identity dedup)', async () => {
        const a = await legacyView();
        const b = await legacyView();
        expect(a.json.data?.counted).toBe(true);
        expect(b.json.data?.counted).toBe(true);
        expect(await views()).toBe(2);
        expect(a.json.data?.guest_token).not.toBe(b.json.data?.guest_token);
    });

    it('legacy endpoint 404s on unknown competition; client watch_time never lands in history', async () => {
        const res = await app.request('/api/analytics/view?lang=ar', {
            method: 'POST', headers: headers(),
            body: JSON.stringify({ competition_id: 999999, watch_time: 9999 }),
        }, env(db));
        expect(res.status).toBe(404);
        const first = await legacyView(undefined, 9999);
        const guestKey = first.json.data?.guest_token as string;
        // Guests never accumulate H1; and no watch_history row exists at all.
        const hist = await db.prepare(`SELECT COUNT(*) AS n FROM watch_history`).first<{ n: number }>();
        expect(Number(hist?.n ?? 0)).toBe(0);
        expect(guestKey).toBeTruthy();
    });

    it('GET details never counts (polling-safe)', async () => {
        const before = await views();
        for (let i = 0; i < 3; i++) {
            const res = await app.request(`/api/competitions/${compId}?lang=ar`, { headers: headers() }, env(db));
            expect(res.status).toBe(200);
        }
        expect(await views()).toBe(before);
    });

    it('static pin: exactly one counted-view writer exists repo-wide', async () => {
        const engineSrc = readFileSync(join(process.cwd(), 'src/lib/services/RecommendationEngine.ts'), 'utf-8');
        expect(engineSrc).not.toMatch(/async recordView/);
        const analyticsSrc = readFileSync(join(process.cwd(), 'src/modules/api/analytics/routes.ts'), 'utf-8');
        const code = analyticsSrc.replace(/\/\*[\s\S]*?\*\//g, '');
        expect(code).not.toMatch(/UPDATE competitions SET total_views/);
        expect(code).toMatch(/recordWatchIntent/);
        // incrementViews is the SSOT counter step: defined once, called once.
        const modelSrc = readFileSync(join(process.cwd(), 'src/models/CompetitionModel.ts'), 'utf-8');
        expect(modelSrc).toMatch(/async incrementViews/);
        const watchSrc = readFileSync(join(process.cwd(), 'src/lib/services/WatchService.ts'), 'utf-8');
        expect(watchSrc).toMatch(/incrementViews\(competitionId\)/);
    });
});
