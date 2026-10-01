/**
 * R3-GUEST-1 — Home «مقترح لك» guest rail reaches every public competition.
 *
 * Root cause (proved, not assumed): the guest branch served ONLY
 * `status='completed' AND vod_url IS NOT NULL` (a handful of rows — the
 * owner's observed "3"), while users additionally saw `live`; and the Home
 * rail fetched ONE `limit=15` batch with no continuation. No hardcoded 3
 * exists anywhere on the path (exhaustive source scan in the task record).
 *
 * Contract under test:
 * - GET /api/recommendations keeps its envelope; the guest set is every
 *   PUBLIC competition (pending/accepted/live + completed-with-recording),
 *   same scoring weights, suspended/cancelled/archived and
 *   completed-without-recording excluded from the rail.
 * - POST /api/recommendations/suggested-sessions freezes that scored set
 *   once (same #75 store/cursor engine, new provider — no second engine).
 * - GET .../suggested-sessions/:id/page pages it to real exhaustion:
 *   skip-and-fill on eligibility loss, retry-stable cursors, 404/410/409
 *   semantics, identity binding.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { RecommendationEngine } from '../../src/lib/services/RecommendationEngine';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];

const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 100;
function headers(token?: string, guest?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r3guest1-test',
        'CF-Connecting-IP': `10.9.9.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (guest !== undefined) h['X-Guest-Token'] = guest;
    return h;
}

interface SessionPayload {
    session: { id: string; total: number; expires_at: string };
    guest_token: string | null;
}

interface PagePayload {
    items: Array<{ id: number; title: string }>;
    nextCursor: string | null;
    hasMore: boolean;
    session: { id: string; total: number };
}

interface RecEnvelope {
    competitions: Array<{ id: number; score: number; status: string; category_name: string }>;
    hasMore: boolean;
    totalAvailable: number;
}

async function guestGet(
    db: SqliteD1, query: string, opts: { token?: string } = {},
): Promise<{ status: number; data: RecEnvelope | null }> {
    const res = await app.request(`/api/recommendations${query}`, {
        headers: headers(opts.token),
    }, env(db));
    const json = (await res.json()) as { success: boolean; data: RecEnvelope };
    return { status: res.status, data: json.success ? json.data : null };
}

async function createSuggested(
    db: SqliteD1, opts: { token?: string; guest?: string; lang?: string } = {},
): Promise<{ status: number; data: SessionPayload | null }> {
    const res = await app.request(`/api/recommendations/suggested-sessions?lang=${opts.lang ?? 'ar'}`, {
        method: 'POST',
        headers: headers(opts.token, opts.guest),
        body: JSON.stringify({}),
    }, env(db));
    const json = (await res.json()) as { success: boolean; data: SessionPayload };
    return { status: res.status, data: json.success ? json.data : null };
}

async function readSuggested(
    db: SqliteD1, sessionId: string,
    opts: { cursor?: string; limit?: number; token?: string; guest?: string; lang?: string } = {},
): Promise<{ status: number; data: PagePayload | null }> {
    const q = new URLSearchParams();
    if (opts.cursor !== undefined) q.set('cursor', opts.cursor);
    if (opts.limit !== undefined) q.set('limit', String(opts.limit));
    q.set('lang', opts.lang ?? 'ar');
    const res = await app.request(
        `/api/recommendations/suggested-sessions/${sessionId}/page?${q.toString()}`,
        { headers: headers(opts.token, opts.guest) },
        env(db),
    );
    const json = (await res.json()) as { success: boolean; data: PagePayload };
    return { status: res.status, data: json.success ? json.data : null };
}

function utcHoursAgo(hours: number): string {
    return new Date(Date.now() - hours * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
}

/**
 * 30 eligible (12 pending + 12 live + 6 completed-with-recording, mixed
 * ar/en, views and ages incl. created_at ties) + 9 excluded rows
 * (4 completed-without-recording, 2 suspended, 2 cancelled, 1 archived).
 */
async function seed(db: SqliteD1): Promise<{ eligible: number[] }> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country) VALUES
         (2, 'creator@g1.local', 'creatorg1', 'x', 'Creator', 1, 'ar', 'SA'),
         (3, 'viewer@g1.local', 'viewerg1', 'x', 'Viewer', 1, 'ar', 'SA')`,
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-g1-user3', 3, datetime('now', '+1 day'))`,
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (10, 'dialogue', 'حوار', 'Dialogue')`,
    ).run();
    const stmt = db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, creator_id, language, status, created_at, total_views, vod_url)
         VALUES (?, 'd', 'r', 10, 2, ?, ?, ?, ?, ?)`,
    );
    const eligible: number[] = [];
    let i = 0;
    const add = async (status: string, lang: string, ageH: number, views: number, vod: string | null, want: boolean) => {
        i += 1;
        const created = `2026-04-${String((i % 27) + 1).padStart(2, '0')} 10:00:00`;
        const r = await stmt.bind(`G1 probe ${i}`, lang, status, created, views, vod).run();
        if (want) eligible.push(Number(r.meta.last_row_id));
    };
    for (let k = 0; k < 12; k++) await add('pending', k % 2 ? 'en' : 'ar', 6 + k, k * 10, null, true);
    for (let k = 0; k < 12; k++) await add('live', k % 2 ? 'ar' : 'en', 6 + k * 2, k * 25, null, true);
    for (let k = 0; k < 6; k++) {
        await add('completed', 'ar', 6, k * 100, `https://example.test/vod-g1-${k}.mp4`, true);
    }
    for (let k = 0; k < 4; k++) await add('completed', 'ar', 6, 5, null, false);
    await add('suspended', 'ar', 6, 9999, 'https://example.test/vod-x.mp4', false);
    await add('suspended', 'ar', 6, 9999, null, false);
    await add('cancelled', 'ar', 6, 9999, 'https://example.test/vod-x.mp4', false);
    await add('cancelled', 'ar', 6, 9999, null, false);
    await add('archived', 'ar', 6, 9999, 'https://example.test/vod-x.mp4', false);
    // A pinned scoring fixture: ar + fresh (<1d) + 100 views, pending.
    const pin = await stmt.bind(
        'G1 pinned scoring', 'ar', 'pending', utcHoursAgo(0.5), 100, null,
    ).run();
    eligible.push(Number(pin.meta.last_row_id));
    return { eligible };
}

async function traverseAll(
    db: SqliteD1, sessionId: string, limit: number, opts: { guest?: string } = {},
): Promise<number[]> {
    const ids: number[] = [];
    let cursor: string | undefined;
    for (let pages = 0; ; pages += 1) {
        const page = await readSuggested(db, sessionId, { cursor, limit, ...opts });
        expect(page.status, `page ${pages} should be 200`).toBe(200);
        ids.push(...(page.data?.items.map((c) => c.id) ?? []));
        if (!page.data?.hasMore) {
            expect(page.data?.nextCursor).toBeNull();
            break;
        }
        cursor = page.data?.nextCursor ?? undefined;
        if (pages > 60) throw new Error('traversal did not terminate');
    }
    return ids;
}

describe('R3-GUEST-1 — guest suggested rail reaches every public competition', () => {
    let db: SqliteD1;
    let eligible: number[];

    beforeEach(async () => {
        db = new SqliteD1();
        ({ eligible } = await seed(db));
    });

    it('1. guest GET covers all 31 public rows with unchanged scoring weights', async () => {
        const res = await guestGet(db, '?limit=50&lang=ar');
        expect(res.status).toBe(200);
        expect(res.data?.totalAvailable).toBe(eligible.length);
        const ids = res.data?.competitions.map((c) => c.id) ?? [];
        expect(new Set(ids).size).toBe(eligible.length);
        for (const id of eligible) expect(ids).toContain(id);
        // The pinned row keeps the exact legacy arithmetic:
        // language 25 + views(100 × 0.01) + recency-max 10.
        const pinned = res.data?.competitions.find((c) => c.id === eligible[eligible.length - 1]);
        expect(pinned?.score).toBeCloseTo(
            RecommendationEngine.WEIGHT_LANGUAGE_MATCH
            + 100 * RecommendationEngine.VIEW_POPULARITY_FACTOR
            + RecommendationEngine.WEIGHT_RECENCY_MAX,
            10,
        );
        // Rows still carry the card fields the rail renders.
        expect(res.data?.competitions[0]?.category_name).toBeTruthy();
    });

    it('2. user GET keeps its extended engine contract (shape + live scope)', async () => {
        const res = await guestGet(db, '?limit=50&lang=ar', { token: 'sess-g1-user3' });
        expect(res.status).toBe(200);
        expect(res.data?.totalAvailable).toBeGreaterThan(0);
        const statuses = new Set(res.data?.competitions.map((c) => c.status));
        expect(statuses.has('pending')).toBe(false);
        for (const s of statuses) expect(['live', 'completed']).toContain(s);
    });

    it('3. session freezes the full public set; traversal is exactly-once to real exhaustion', async () => {
        const created = await createSuggested(db, {});
        expect(created.status).toBe(201);
        expect(created.data?.session.total).toBe(eligible.length);
        expect(created.data?.guest_token).toBeTruthy();
        const t0 = Date.now();
        const ids = await traverseAll(db, created.data?.session.id as string, 6, {
            guest: created.data?.guest_token ?? undefined,
        });
        const readMs = Date.now() - t0;
        expect(ids).toHaveLength(eligible.length);
        expect(new Set(ids).size).toBe(ids.length);
        for (const id of eligible) expect(ids).toContain(id);
        process.stdout.write(`[R3-GUEST-1 cost] 31-row traversal (limit=6): ${readMs}ms\n`);
    });

    it('4. retry with the same cursor returns the identical batch', async () => {
        const created = await createSuggested(db, {});
        const sid = created.data?.session.id as string;
        const guest = created.data?.guest_token ?? undefined;
        const first = await readSuggested(db, sid, { limit: 6, guest });
        expect(first.status).toBe(200);
        expect(first.data?.items).toHaveLength(6);
        const cursor = first.data?.nextCursor ?? undefined;
        const a = await readSuggested(db, sid, { cursor, limit: 6, guest });
        const b = await readSuggested(db, sid, { cursor, limit: 6, guest });
        expect(a.data?.items.map((c) => c.id)).toEqual(b.data?.items.map((c) => c.id));
        expect(a.data?.nextCursor).toBe(b.data?.nextCursor);
    });

    it('5. ar and en sessions exhaust the same set (language scores, never filters)', async () => {
        const ar = await createSuggested(db, { lang: 'ar' });
        const en = await createSuggested(db, { lang: 'en' });
        const arGuest = ar.data?.guest_token ?? undefined;
        const idsAr = await traverseAll(db, ar.data?.session.id as string, 10, { guest: arGuest });
        // The en guest token is separate; traverse with it.
        const enGuest = en.data?.guest_token ?? undefined;
        const idsEn: number[] = [];
        let cursor: string | undefined;
        for (;;) {
            const page = await readSuggested(db, en.data?.session.id as string, {
                cursor, limit: 10, guest: enGuest, lang: 'en',
            });
            expect(page.status).toBe(200);
            idsEn.push(...(page.data?.items.map((c) => c.id) ?? []));
            if (!page.data?.hasMore) break;
            cursor = page.data?.nextCursor ?? undefined;
        }
        expect(new Set(idsAr).size).toBe(eligible.length);
        expect(idsEn.sort((a, b) => a - b)).toEqual(idsAr.sort((a, b) => a - b));
        // fr normalizes (never 500, never empty).
        const fr = await guestGet(db, '?limit=50&lang=fr');
        expect(fr.status).toBe(200);
        expect(fr.data?.totalAvailable).toBe(eligible.length);
    });

    it('6. identity binding + expiry: foreign reads 404, lapsed session 410', async () => {
        const created = await createSuggested(db, {});
        const sid = created.data?.session.id as string;
        const guest = created.data?.guest_token ?? undefined;
        expect((await readSuggested(db, sid, { limit: 6, guest: 'guest-stranger-9' })).status).toBe(404);
        expect((await readSuggested(db, sid, { limit: 6, token: 'sess-g1-user3' })).status).toBe(404);
        expect((await readSuggested(db, sid, { limit: 6 })).status).toBe(404);
        await db.prepare(`UPDATE explore_result_sessions SET expires_at = datetime('now', '-1 minute') WHERE id = ?`)
            .bind(sid).run();
        expect((await readSuggested(db, sid, { limit: 6, guest })).status).toBe(410);
    });

    it('7. eligibility loss is skipped; batches still fill to real exhaustion', async () => {
        const created = await createSuggested(db, {});
        const sid = created.data?.session.id as string;
        const guest = created.data?.guest_token ?? undefined;
        await db.prepare(`DELETE FROM competitions WHERE id % 7 = 0`).run();
        await db.prepare(`UPDATE competitions SET status = 'suspended' WHERE id % 11 = 0`).run();
        const remaining = await db.prepare(
            `SELECT id FROM competitions WHERE status IN ('pending','accepted','live') OR (status = 'completed' AND vod_url IS NOT NULL)`,
        ).all<{ id: number }>();
        const ids = await traverseAll(db, sid, 6, { guest });
        expect(ids).toHaveLength(remaining.results.length);
        expect(new Set(ids).size).toBe(ids.length);
        const first = await readSuggested(db, sid, { limit: 6, guest });
        // Batches still fill while survivors remain (except the true tail).
        expect(first.data?.items.length).toBeGreaterThan(0);
    });

    it('8. arrivals after T0 surface only in a refresh session', async () => {
        const created = await createSuggested(db, {});
        const sid = created.data?.session.id as string;
        const guest = created.data?.guest_token ?? undefined;
        const ins = await db.prepare(
            `INSERT INTO competitions (title, description, rules, category_id, creator_id, language, status, created_at)
             VALUES ('G1 late arrival', 'd', 'r', 10, 2, 'ar', 'live', datetime('now'))`,
        ).run();
        const lateId = Number(ins.meta.last_row_id);
        const ids = await traverseAll(db, sid, 10, { guest });
        expect(ids).not.toContain(lateId);
        const refreshed = await createSuggested(db, {});
        expect((refreshed.data?.session.total ?? 0)).toBe(eligible.length + 1);
    });

    it('9. RecommendationController holds no SQL (MVC: queries live in Models)', async () => {
        const { readFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const src = readFileSync(join(process.cwd(), 'src/controllers/RecommendationController.ts'), 'utf-8');
        expect(src).not.toMatch(/\.prepare\(|SELECT\s|INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM/i);
    });
});
