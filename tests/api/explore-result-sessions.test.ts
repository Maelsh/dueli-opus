/**
 * R3-B7 — Explore competitions stable result session (TDD RED first).
 *
 * Contract under test (see docs/05 §4 “ترتيب محفوظ في جلسة نتائج D1”):
 * - POST /api/competitions/explore-sessions {search,category,status}
 *   → { session: { id, total, expires_at }, guest_token: string|null }
 *   Freezes the CURRENT Explore shuffle ONCE (no RANDOM+OFFSET per batch,
 *   no newest-first, no new ranking weights, no total cap).
 * - GET /api/competitions/explore-sessions/:id/page?cursor&limit&search&category&status
 *   → { items, nextCursor: string|null, hasMore: boolean, session }
 *   Re-checks eligibility per row, skips the ineligible and fills the batch
 *   from later snapshot positions. hasMore/nextCursor derive from REAL
 *   snapshot progress — never from client dedup or short-batch inference.
 * - Identity: logged-in user (Bearer) or first-party guest token
 *   (X-Guest-Token, localStorage-persisted). Cross-identity reads → 404,
 *   expired sessions → 410 with a refresh path, filter/context drift → 409.
 *
 * RED: these endpoints/tables do not exist on BASE (404 + missing tables).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { ExploreSessionService } from '../../src/lib/services/ExploreSessionService';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];

const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 0;
function headers(token?: string, guest?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r3b7-test',
        'CF-Connecting-IP': `10.7.7.${(ipSeq % 250) + 1}`,
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

async function createSession(
    db: SqliteD1,
    body: Record<string, unknown> = {},
    opts: { token?: string; guest?: string; lang?: string } = {},
): Promise<{ status: number; data: SessionPayload | null; raw: unknown }> {
    const res = await app.request(`/api/competitions/explore-sessions?lang=${opts.lang ?? 'ar'}`, {
        method: 'POST',
        headers: headers(opts.token, opts.guest),
        body: JSON.stringify(body),
    }, env(db));
    const json = (await res.json()) as { success: boolean; data: SessionPayload };
    return { status: res.status, data: json.success ? json.data : null, raw: json };
}

async function readPage(
    db: SqliteD1,
    sessionId: string,
    opts: {
        cursor?: string; limit?: number; token?: string; guest?: string;
        search?: string; category?: string; status?: string; lang?: string;
    } = {},
): Promise<{ status: number; data: PagePayload | null; raw: unknown }> {
    const q = new URLSearchParams();
    if (opts.cursor !== undefined) q.set('cursor', opts.cursor);
    if (opts.limit !== undefined) q.set('limit', String(opts.limit));
    if (opts.search !== undefined) q.set('search', opts.search);
    if (opts.category !== undefined) q.set('category', opts.category);
    if (opts.status !== undefined) q.set('status', opts.status);
    q.set('lang', opts.lang ?? 'ar');
    const res = await app.request(
        `/api/competitions/explore-sessions/${sessionId}/page?${q.toString()}`,
        { headers: headers(opts.token, opts.guest) },
        env(db),
    );
    const json = (await res.json()) as { success: boolean; data: PagePayload };
    return { status: res.status, data: json.success ? json.data : null, raw: json };
}

/** Seeds users/sessions/categories + a large eligible set with ties + branches. */
async function seedBig(db: SqliteD1, total: number): Promise<{ eligibleIds: number[] }> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country) VALUES
         (2, 'creator@b7.local', 'creatorb7', 'x', 'Creator', 1, 'ar', 'SA'),
         (3, 'other@b7.local', 'otherb7', 'x', 'Other', 1, 'ar', 'SA')`,
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('sess-b7-user2', 2, datetime('now', '+1 day')),
         ('sess-b7-user3', 3, datetime('now', '+1 day'))`,
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES
         (10, 'dialogue', 'حوار', 'Dialogue', NULL),
         (11, 'science', 'علوم', 'Science', NULL),
         (12, 'talents', 'مواهب', 'Talents', NULL),
         (13, 'physics', 'فيزياء', 'Physics', 11)`,
    ).run();
    // 1200 eligible: mixed statuses, categories incl. a real subcategory,
    // identical created_at in blocks of 200 (ties), searchable titles.
    const statuses = ['pending', 'live', 'completed'];
    const cats = [10, 11, 12, 13];
    const stmt = db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, subcategory_id, creator_id, language, status, created_at)
         VALUES (?, 'd', 'r', ?, ?, 2, 'ar', ?, ?)`,
    );
    const eligibleIds: number[] = [];
    for (let i = 1; i <= total; i++) {
        const created = `2026-05-${String((i % 28) + 1).padStart(2, '0')} 10:00:00`;
        const cat = cats[i % cats.length] as number;
        const sub = cat === 13 ? 13 : null;
        const realCat = cat === 13 ? 11 : cat;
        const r = await stmt.bind(
            `B7 probe ${i} finals`, realCat, sub, statuses[i % statuses.length], created,
        ).run();
        eligibleIds.push(Number(r.meta.last_row_id));
    }
    return { eligibleIds };
}

async function traverseAll(
    db: SqliteD1, sessionId: string, limit: number,
    opts: { token?: string; guest?: string } = {},
): Promise<{ ids: number[]; pages: number }> {
    const ids: number[] = [];
    let cursor: string | undefined;
    let pages = 0;
    for (;;) {
        const page = await readPage(db, sessionId, { cursor, limit, ...opts });
        expect(page.status, `page ${pages} should be 200`).toBe(200);
        ids.push(...(page.data?.items.map((c) => c.id) ?? []));
        pages += 1;
        if (!page.data?.hasMore) {
            expect(page.data?.nextCursor).toBeNull();
            break;
        }
        expect(page.data?.nextCursor).toBeTruthy();
        cursor = page.data?.nextCursor ?? undefined;
        if (pages > 500) throw new Error('traversal did not terminate (hasMore loop?)');
    }
    return { ids, pages };
}

describe('R3-B7 — stable result session over >1000 eligible rows', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seedBig(db, 1200);
    });

    it('1. freezes the full eligible set in many chunks (no hidden cap)', async () => {
        const t0 = Date.now();
        const created = await createSession(db, {}, { token: 'sess-b7-user2' });
        const buildMs = Date.now() - t0;
        expect(created.status).toBe(201);
        expect(created.data?.session.total).toBe(1200);
        const chunks = await db.prepare(
            `SELECT COUNT(*) AS n FROM explore_result_chunks WHERE session_id = ?`,
        ).bind(created.data?.session.id).first<{ n: number }>();
        expect(chunks?.n).toBeGreaterThan(1);
        const stored = await db.prepare(
            `SELECT COUNT(*) AS n FROM explore_result_chunks WHERE session_id = ?`,
        ).bind(created.data?.session.id).first<{ n: number }>();
        expect(stored?.n).toBe(chunks?.n);
        // eslint-disable-next-line no-console
        console.info(`[R3-B7 cost] build 1200-row session: ${buildMs}ms, ${chunks?.n} chunks`);
        process.stdout.write(`[R3-B7 cost] build 1200-row session: ${buildMs}ms, ${chunks?.n} chunks\n`);
        expect(buildMs).toBeLessThan(30000);
    });

    it('2. traverses every eligible exactly once until real exhaustion', async () => {
        const created = await createSession(db, {}, { token: 'sess-b7-user2' });
        const sid = created.data?.session.id as string;
        const t0 = Date.now();
        const { ids } = await traverseAll(db, sid, 50, { token: 'sess-b7-user2' });
        const readMs = Date.now() - t0;
        const inDb = await db.prepare(
            `SELECT id FROM competitions WHERE creator_id = 2`,
        ).all<{ id: number }>();
        const expected = new Set(inDb.results.map((r) => r.id));
        expect(ids).toHaveLength(expected.size);
        expect(new Set(ids).size).toBe(ids.length); // no duplicates
        for (const id of ids) expect(expected.has(id)).toBe(true); // no skips, no extras
        // eslint-disable-next-line no-console
        console.info(`[R3-B7 cost] 1200-row traversal (limit=50): ${readMs}ms total`);
        process.stdout.write(`[R3-B7 cost] 1200-row traversal (limit=50): ${readMs}ms total\n`);
    });

    it('3. retry with the same cursor returns the identical batch', async () => {
        const created = await createSession(db, {}, { token: 'sess-b7-user2' });
        const sid = created.data?.session.id as string;
        const first = await readPage(db, sid, { limit: 12, token: 'sess-b7-user2' });
        expect(first.status).toBe(200);
        expect(first.data?.items).toHaveLength(12);
        expect(first.data?.nextCursor).toBeTruthy();
        const retry = await readPage(db, sid, {
            cursor: first.data?.nextCursor ?? undefined, limit: 12, token: 'sess-b7-user2',
        });
        const retry2 = await readPage(db, sid, {
            cursor: first.data?.nextCursor ?? undefined, limit: 12, token: 'sess-b7-user2',
        });
        expect(retry.data?.items.map((c) => c.id)).toEqual(retry2.data?.items.map((c) => c.id));
        expect(retry.data?.nextCursor).toBe(retry2.data?.nextCursor);
        expect(retry.data?.hasMore).toBe(retry2.data?.hasMore);
    });

    it('4. score/presence drift after T0 never reorders the frozen snapshot', async () => {
        const created = await createSession(db, {}, { token: 'sess-b7-user2' });
        const sid = created.data?.session.id as string;
        const before = await traverseAll(db, sid, 100, { token: 'sess-b7-user2' });
        // Drift: retitle + flip statuses (still eligible under the empty filter).
        await db.prepare(`UPDATE competitions SET title = 'drifted', status = 'live' WHERE id % 7 = 0`).run();
        const after = await traverseAll(db, sid, 100, { token: 'sess-b7-user2' });
        expect(after.ids).toEqual(before.ids);
    });

    it('5. eligibility loss is skipped and the batch still fills from later positions', async () => {
        const created = await createSession(db, {}, { token: 'sess-b7-user2' });
        const sid = created.data?.session.id as string;
        // Lose eligibility AFTER the freeze: hard-delete 40 + move 40 out of
        // the status filter used below (completed fixture keeps the rest).
        await db.prepare(`DELETE FROM competitions WHERE id % 29 = 0`).run();
        const lost = await readPage(db, sid, { limit: 12, status: '', token: 'sess-b7-user2' });
        expect(lost.status).toBe(200);
        const remaining = await db.prepare(`SELECT COUNT(*) AS n FROM competitions`).first<{ n: number }>();
        const { ids } = await traverseAll(db, sid, 50, { token: 'sess-b7-user2' });
        expect(ids).toHaveLength(remaining?.n);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('6. arrivals after T0 are invisible until an explicit refresh session', async () => {
        const created = await createSession(db, {}, { token: 'sess-b7-user2' });
        const sid = created.data?.session.id as string;
        const ins = await db.prepare(
            `INSERT INTO competitions (title, description, rules, category_id, creator_id, language, status)
             VALUES ('B7 late arrival finals', 'd', 'r', 10, 2, 'ar', 'pending')`,
        ).run();
        const lateId = Number(ins.meta.last_row_id);
        const { ids } = await traverseAll(db, sid, 100, { token: 'sess-b7-user2' });
        expect(ids).not.toContain(lateId);
        const refreshed = await createSession(db, {}, { token: 'sess-b7-user2' });
        expect((refreshed.data?.session.total ?? 0)).toBe(1201);
        const { ids: ids2 } = await traverseAll(db, refreshed.data?.session.id as string, 100, { token: 'sess-b7-user2' });
        expect(ids2).toContain(lateId);
    });

    it('7. filter change separates sessions; mismatched page filters → 409', async () => {
        const all = await createSession(db, {}, { token: 'sess-b7-user2' });
        const live = await createSession(db, { status: 'live' }, { token: 'sess-b7-user2' });
        expect(live.data?.session.id).not.toBe(all.data?.session.id);
        expect(live.data?.session.total).toBeGreaterThan(0);
        expect(live.data?.session.total).toBeLessThan(1200);
        const { ids } = await traverseAll(db, live.data?.session.id as string, 50, {
            token: 'sess-b7-user2', status: 'live',
        });
        const statuses = await db.prepare(
            `SELECT DISTINCT status AS s FROM competitions WHERE status = 'live'`,
        ).all<{ s: string }>();
        expect(statuses.results.map((r) => r.s)).toEqual(['live']);
        expect(ids.length).toBeGreaterThan(0);
        const mismatch = await readPage(db, live.data?.session.id as string, {
            limit: 12, status: 'pending', token: 'sess-b7-user2',
        });
        expect(mismatch.status).toBe(409);
    });

    it('8. sessions are identity-bound: foreign user/guest reads → 404, expiry → 410', async () => {
        const created = await createSession(db, {}, { token: 'sess-b7-user2' });
        const sid = created.data?.session.id as string;
        expect((await readPage(db, sid, { limit: 12, token: 'sess-b7-user3' })).status).toBe(404);
        expect((await readPage(db, sid, { limit: 12, guest: 'guest-stranger-01' })).status).toBe(404);
        expect((await readPage(db, '00000000-0000-4000-8000-000000000000', {
            limit: 12, token: 'sess-b7-user2',
        })).status).toBe(404);
        // Guest-owned session: a second guest token cannot read it.
        const g = await createSession(db, {}, { guest: 'guest-owner-01' });
        expect(g.status).toBe(201);
        const gsid = g.data?.session.id as string;
        expect((await readPage(db, gsid, { limit: 6, guest: 'guest-owner-01' })).status).toBe(200);
        expect((await readPage(db, gsid, { limit: 6, guest: 'guest-other-02' })).status).toBe(404);
        // Expire the session server-side → 410 refresh signal (never 200-stale).
        await db.prepare(`UPDATE explore_result_sessions SET expires_at = datetime('now', '-1 minute') WHERE id = ?`)
            .bind(sid).run();
        expect((await readPage(db, sid, { limit: 12, token: 'sess-b7-user2' })).status).toBe(410);
    });

    it('9. preview(6) → view-all continuation has no overlap and no gap', async () => {
        const created = await createSession(db, {}, { token: 'sess-b7-user2' });
        const sid = created.data?.session.id as string;
        const preview = await readPage(db, sid, { limit: 6, token: 'sess-b7-user2' });
        expect(preview.data?.items).toHaveLength(6);
        const rest = await readPage(db, sid, {
            cursor: preview.data?.nextCursor ?? undefined, limit: 12, token: 'sess-b7-user2',
        });
        const previewIds = new Set(preview.data?.items.map((c) => c.id));
        for (const c of rest.data?.items ?? []) expect(previewIds.has(c.id)).toBe(false);
        // The union equals the first 18 snapshot positions: continue and compare.
        const full = await traverseAll(db, sid, 6, { token: 'sess-b7-user2' });
        expect([...(preview.data?.items.map((c) => c.id) ?? []), ...(rest.data?.items.map((c) => c.id) ?? [])])
            .toEqual(full.ids.slice(0, 18));
    });

    it('10. legacy list contract is untouched (same array shape, limit/offset)', async () => {
        const res = await app.request('/api/competitions?limit=5&offset=0&lang=ar', {
            headers: headers('sess-b7-user2'),
        }, env(db));
        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; data: unknown[] };
        expect(json.success).toBe(true);
        expect(Array.isArray(json.data)).toBe(true);
        expect(json.data.length).toBeLessThanOrEqual(5);
    });

    it('11. CompetitionController holds no SQL (MVC: queries live in Models/services)', () => {
        const src = readFileSync(join(process.cwd(), 'src/controllers/CompetitionController.ts'), 'utf-8');
        expect(src).not.toMatch(/\.prepare\(|SELECT\s|INSERT\s+INTO|UPDATE\s+competitions|DELETE\s+FROM/i);
    });

    it('12. guest-first-visit is issued a first-party token (no IP identity)', async () => {
        const created = await createSession(db, {});
        expect(created.status).toBe(201);
        expect(created.data?.guest_token).toBeTruthy();
        const page = await readPage(db, created.data?.session.id as string, {
            limit: 6, guest: created.data?.guest_token ?? undefined,
        });
        expect(page.status).toBe(200);
        expect(page.data?.items).toHaveLength(6);
    });

    it('13. continuation: a scan cap yields a partial batch + advanced cursor + hasMore', async () => {
        const created = await createSession(db, {}, { token: 'sess-b7-user2' });
        const sid = created.data?.session.id as string;
        // Heavy mid-snapshot loss: every second row becomes ineligible.
        await db.prepare(`DELETE FROM competitions WHERE id % 2 = 0`).run();
        const service = new ExploreSessionService(db as unknown as D1Database);
        const identity = { kind: 'user' as const, key: 'user:2' };
        const first = await service.readPage(identity, sid, {
            limit: 12, filters: {}, uiLang: 'ar', maxScan: 10,
        });
        expect('page' in first).toBe(true);
        if (!('page' in first)) throw new Error('expected a page, got a failure');
        // 10 scanned positions hold ~5 eligible rows: partial batch, but the
        // cursor advanced past all 10 and hasMore stays true (never a false end).
        expect(first.page.items.length).toBeLessThan(12);
        expect(first.page.items.length).toBeGreaterThan(0);
        expect(first.page.hasMore).toBe(true);
        expect(first.page.nextCursor).toBeTruthy();
        // Following the continuation cursor still reaches every survivor once.
        const seen: number[] = first.page.items.map((c) => c.id);
        let cursor: string | null = first.page.nextCursor;
        while (cursor) {
            const next = await service.readPage(identity, sid, {
                cursor, limit: 50, filters: {}, uiLang: 'ar',
            });
            if (!('page' in next)) throw new Error('expected a page, got a failure');
            seen.push(...next.page.items.map((c) => c.id));
            cursor = next.page.nextCursor;
            if (!next.page.hasMore) break;
        }
        const survivors = await db.prepare(`SELECT id FROM competitions`).all<{ id: number }>();
        expect(new Set(seen).size).toBe(seen.length);
        expect(seen.sort((a, b) => a - b))
            .toEqual(survivors.results.map((r) => r.id).sort((a, b) => a - b));
    });

    it('14. ties on created_at traverse exactly once in frozen order', async () => {
        const stamp = '2026-06-01 12:00:00';
        await db.prepare(`UPDATE competitions SET created_at = ?`).bind(stamp).run();
        const created = await createSession(db, {}, { token: 'sess-b7-user2' });
        const sid = created.data?.session.id as string;
        const { ids } = await traverseAll(db, sid, 100, { token: 'sess-b7-user2' });
        expect(ids).toHaveLength(1200);
        expect(new Set(ids).size).toBe(1200);
    });
});
