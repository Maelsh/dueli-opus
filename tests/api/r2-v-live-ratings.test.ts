/**
 * R2-V — live-only viewer ratings (1..5) with L1 300s eligibility.
 *
 * Contract under test (task R2-V):
 * - Registered viewer only, after L1 eligibility = 300s live watch for the
 *   SAME competition (SSOT: watch_history via WatchService.getViewerWatch).
 *   299 rejected, 300 allowed. No client seconds/user_id trust.
 * - Both competitors ratable; edit replaces previous value (one effective
 *   vote per viewer/competition/competitor).
 * - Every rate/update/withdraw is atomically guarded by live status
 *   (no check-then-write race). After live ends every write is rejected
 *   immediately (no 24h, no grace).
 * - During live the interim tally is visible and updates via the existing
 *   competition SSE channel. At close: cutoff first (live->completed),
 *   then final result/ELO/finalization exactly once with retry/idempotency.
 * - Winner/ELO formulas, 20/80 split and closed history untouched.
 * - no-ratings/tie stay correct (no fake result).
 *
 * RED: legacy code rates only completed+24h with no replacement, so the
 * live-only cases below fail on BASE.
 */
import { describe, expect, it, beforeEach } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 6000;
function headers(token?: string, lang = 'ar'): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r2v-test',
        'CF-Connecting-IP': `10.22.22.${(ipSeq % 250) + 1}`,
        'X-Forwarded-For': `10.22.22.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    void lang;
    return h;
}

async function seedV(db: SqliteD1): Promise<{ creator: number; opponent: number }> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country, elo_rating)
         VALUES
          (101, 'v-creator@local', 'v_creator', 'x', 'V Creator', 1, 'ar', 'SA', 1500),
          (102, 'v-opponent@local', 'v_opponent', 'x', 'V Opponent', 1, 'ar', 'SA', 1500),
          (103, 'v-viewer@local', 'v_viewer', 'x', 'V Viewer', 1, 'ar', 'SA', 1500),
          (104, 'v-viewer2@local', 'v_viewer2', 'x', 'V Viewer2', 1, 'en', 'EG', 1500),
          (105, 'v-stranger@local', 'v_stranger', 'x', 'V Stranger', 1, 'ar', 'SA', 1500)`,
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
          ('sess-v-viewer', 103, datetime('now', '+1 day')),
          ('sess-v-viewer2', 104, datetime('now', '+1 day')),
          ('sess-v-stranger', 105, datetime('now', '+1 day')),
          ('sess-v-creator', 101, datetime('now', '+1 day')),
          ('sess-v-opponent', 102, datetime('now', '+1 day'))`,
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES (40, 'dialogue', 'حوار', 'Dialogue', NULL)`,
    ).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, description, rules, category_id, creator_id, opponent_id, language, status, total_views, total_comments, creator_rating, opponent_rating, average_rating, winner_id, started_at)
         VALUES
          (501, 'V live finals', 'd', 'r', 40, 101, 102, 'ar', 'live', 0, 0, 0, 0, 0, NULL, datetime('now')),
          (502, 'V pending finals', 'd', 'r', 40, 101, NULL, 'ar', 'pending', 0, 0, 0, 0, 0, NULL, NULL),
          (503, 'V done finals', 'd', 'r', 40, 101, 102, 'ar', 'completed', 0, 0, 0, 0, 0, NULL, datetime('now', '-3 hours'))`,
    ).run();
    await db.prepare(`UPDATE competitions SET ended_at = datetime('now') WHERE id = 503`).run();
    return { creator: 101, opponent: 102 };
}

async function setWatch(db: SqliteD1, userId: number, compId: number, seconds: number): Promise<void> {
    await db.prepare(
        `INSERT INTO watch_history (user_id, competition_id, watch_duration_seconds, completed, watched_at)
         VALUES (?, ?, ?, 0, datetime('now'))
         ON CONFLICT(user_id, competition_id) DO UPDATE SET watch_duration_seconds = ?, watched_at = datetime('now')`,
    ).bind(userId, compId, seconds, seconds).run();
}

async function rate(
    db: SqliteD1, compId: number, token: string | undefined, body: unknown, method = 'POST', lang = 'ar',
): Promise<{ status: number; data: any }> {
    const res = await app.request(`/api/competitions/${compId}/rate?lang=${lang}`, {
        method,
        headers: headers(token, lang),
        body: JSON.stringify(body),
    }, env(db));
    let data: any = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
}

async function withdraw(
    db: SqliteD1, compId: number, token: string | undefined, competitorId: number, lang = 'ar',
): Promise<{ status: number; data: any }> {
    const res = await app.request(`/api/competitions/${compId}/rate?competitor_id=${competitorId}&lang=${lang}`, {
        method: 'DELETE',
        headers: headers(token, lang),
    }, env(db));
    let data: any = null;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
}

async function summary(db: SqliteD1, compId: number): Promise<any> {
    const res = await app.request(`/api/competitions/${compId}/ratings/summary?lang=ar`, {
        headers: headers(),
    }, env(db));
    return res.json();
}

async function sseTypes(db: SqliteD1, channel: string): Promise<string[]> {
    const rows = await db.prepare(
        `SELECT event_type FROM sse_event_log WHERE channel = ? ORDER BY id ASC`,
    ).bind(channel).all<{ event_type: string }>();
    return rows.results.map((r) => r.event_type);
}

describe('R2-V — live-only ratings with L1 300s eligibility', () => {
    let db: SqliteD1;
    let creator = 101;
    let opponent = 102;

    beforeEach(async () => {
        db = createSqliteD1();
        const ids = await seedV(db);
        creator = ids.creator;
        opponent = ids.opponent;
    });

    it('1. 299 rejected, 300 allowed (same live competition, SSOT watch_history)', async () => {
        await setWatch(db, 103, 501, 299);
        const denied = await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 5 });
        expect(denied.status).toBe(403);
        await setWatch(db, 103, 501, 300);
        const allowed = await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 5 });
        expect(allowed.status).toBe(201);
    });

    it('2. both competitors ratable (one effective vote each)', async () => {
        await setWatch(db, 103, 501, 300);
        expect((await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 5 })).status).toBe(201);
        expect((await rate(db, 501, 'sess-v-viewer', { competitor_id: opponent, rating: 4 })).status).toBe(201);
        const rows = await db.prepare(
            `SELECT COUNT(*) AS n FROM ratings WHERE competition_id = 501 AND user_id = 103`,
        ).first<{ n: number }>();
        expect(rows?.n).toBe(2);
    });

    it('3. edit replaces previous value (5 -> 2), still one row', async () => {
        await setWatch(db, 103, 501, 300);
        expect((await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 5 })).status).toBe(201);
        const second = await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 2 });
        expect([200, 201]).toContain(second.status);
        const rows = await db.prepare(
            `SELECT rating AS r FROM ratings WHERE competition_id = 501 AND user_id = 103 AND competitor_id = 101`,
        ).all<{ r: number }>();
        expect(rows.results).toHaveLength(1);
        expect(rows.results[0].r).toBe(2);
        const sum: any = await summary(db, 501);
        const entry = sum.data.competitors.find((c: any) => c.competitor_id === creator);
        expect(entry.count).toBe(1);
        expect(entry.average).toBeCloseTo(2, 5);
    });

    it('4. concurrent first votes serialize to one effective row', async () => {
        await setWatch(db, 103, 501, 300);
        const attempts = await Promise.all([
            rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 5 }),
            rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 4 }),
            rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 3 }),
        ]);
        // Every attempt is either created or replaced — never a duplicate row,
        // never a 500, never a second effective vote.
        for (const a of attempts) expect([200, 201]).toContain(a.status);
        const rows = await db.prepare(
            `SELECT COUNT(*) AS n FROM ratings WHERE competition_id = 501 AND user_id = 103 AND competitor_id = 101`,
        ).first<{ n: number }>();
        expect(rows?.n).toBe(1);
    });

    it('5. end-vs-rate race: write after cutoff is rejected (no post-end write)', async () => {
        await setWatch(db, 103, 501, 300);
        // Live cutoff first…
        await db.prepare(`UPDATE competitions SET status = 'completed', ended_at = datetime('now') WHERE id = 501`).run();
        const late = await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 5 });
        expect(late.status).toBe(403);
        const rows = await db.prepare(
            `SELECT COUNT(*) AS n FROM ratings WHERE competition_id = 501`,
        ).first<{ n: number }>();
        expect(rows?.n).toBe(0);
    });

    it('6. after end every write is rejected immediately (POST/PUT/DELETE, no grace)', async () => {
        await setWatch(db, 103, 501, 600);
        expect((await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 5 })).status).toBe(201);
        await db.prepare(`UPDATE competitions SET status = 'completed', ended_at = datetime('now') WHERE id = 501`).run();
        expect((await rate(db, 501, 'sess-v-viewer', { competitor_id: opponent, rating: 5 })).status).toBe(403);
        expect((await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 1 }, 'PUT')).status).toBe(403);
        expect((await withdraw(db, 501, 'sess-v-viewer', creator)).status).toBe(403);
    });

    it('7. live aggregate updates immediately and broadcasts on the existing channel', async () => {
        await setWatch(db, 103, 501, 300);
        await setWatch(db, 104, 501, 300);
        expect((await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 5 })).status).toBe(201);
        let sum: any = await summary(db, 501);
        let entry = sum.data.competitors.find((c: any) => c.competitor_id === creator);
        expect(entry.count).toBe(1);
        expect(entry.average).toBeCloseTo(5, 5);
        expect((await rate(db, 501, 'sess-v-viewer2', { competitor_id: creator, rating: 3 }, 'POST', 'en')).status).toBe(201);
        sum = await summary(db, 501);
        entry = sum.data.competitors.find((c: any) => c.competitor_id === creator);
        expect(entry.count).toBe(2);
        expect(entry.average).toBeCloseTo(4, 5);
        const types = await sseTypes(db, 'competition:501');
        expect(types).toContain('rating_updated');
    });

    it('8. close finalizes once: cutoff first, then winner/ELO/payouts with retry idempotency', async () => {
        await setWatch(db, 103, 501, 300);
        await setWatch(db, 104, 501, 300);
        expect((await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 5 })).status).toBe(201);
        expect((await rate(db, 501, 'sess-v-viewer2', { competitor_id: opponent, rating: 5 }, 'POST', 'en')).status).toBe(201);
        // Close via the real end path (cutoff = guarded live->completed).
        const endRes = await app.request(`/api/competitions/501/end?lang=en`, {
            method: 'POST',
            headers: headers('sess-v-creator', 'en'),
            body: JSON.stringify({}),
        }, env(db));
        expect(endRes.status).toBe(200);
        const comp = await db.prepare(`SELECT status AS s, winner_id AS w, elo_applied_at AS e FROM competitions WHERE id = 501`).first<{ s: string; w: number | null; e: string | null }>();
        expect(comp?.s).toBe('completed');
        // Final result is decided (both sides have one 5 => tie => NULL winner, draw ELO once).
        expect(comp?.w).toBeNull();
        expect(comp?.e).toBeTruthy();
        const eloAfter = await db.prepare(`SELECT elo_rating AS e FROM users WHERE id = 101`).first<{ e: number }>();
        // Retry must be a no-op (exactly once).
        const { ScheduledTaskService } = await import('../../src/lib/services/ScheduledTaskService');
        const svc = new ScheduledTaskService(db as unknown as D1Database);
        await svc.finalizeCompetition(501);
        await svc.finalizeCompetition(501);
        const eloRetry = await db.prepare(`SELECT elo_rating AS e FROM users WHERE id = 101`).first<{ e: number }>();
        expect(eloRetry?.e).toBe(eloAfter?.e);
        // Post-close writes stay rejected.
        expect((await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 1 })).status).toBe(403);
    });

    it('9. no-ratings and tie stay correct (no fake result)', async () => {
        // No ratings: averages null, no winner, pending result label path.
        let sum: any = await summary(db, 501);
        for (const c of sum.data.competitors) {
            expect(c.average).toBeNull();
            expect(c.count).toBe(0);
        }
        // Tie: equal averages => winner NULL (draw), never a fake winner.
        await setWatch(db, 103, 501, 300);
        await setWatch(db, 104, 501, 300);
        expect((await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 4 })).status).toBe(201);
        expect((await rate(db, 501, 'sess-v-viewer2', { competitor_id: opponent, rating: 4 }, 'POST', 'en')).status).toBe(201);
        const endRes = await app.request(`/api/competitions/501/end?lang=en`, {
            method: 'POST',
            headers: headers('sess-v-creator', 'en'),
            body: JSON.stringify({}),
        }, env(db));
        expect(endRes.status).toBe(200);
        const comp = await db.prepare(`SELECT winner_id AS w FROM competitions WHERE id = 501`).first<{ w: number | null }>();
        expect(comp?.w).toBeNull();
    });

    it('10. guards: self, range, pending and forged watch claims', async () => {
        await setWatch(db, 103, 501, 300);
        // Self-rating forbidden even when live+eligible.
        expect((await rate(db, 501, 'sess-v-creator', { competitor_id: opponent, rating: 5 })).status).toBe(403);
        expect((await rate(db, 501, 'sess-v-opponent', { competitor_id: creator, rating: 5 })).status).toBe(403);
        // Range 1..5 only.
        expect((await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 6 })).status).toBe(422);
        expect((await rate(db, 501, 'sess-v-viewer', { competitor_id: creator, rating: 0 })).status).toBe(422);
        // Pending competition never ratable even with watch time.
        await setWatch(db, 103, 502, 9999);
        expect((await rate(db, 502, 'sess-v-viewer', { competitor_id: creator, rating: 5 })).status).toBe(403);
        // Forged body seconds/user_id do not grant eligibility (stranger has 0s).
        const forged = await rate(db, 501, 'sess-v-stranger', { competitor_id: creator, rating: 5, seconds: 99999, user_id: 103, watch_seconds: 99999 } as any);
        expect(forged.status).toBe(403);
    });
});
