/**
 * R2-L2 — production live-room support: VOD timed comments, single-active
 * Like/Dislike, recording-readiness, and unchanged start/end guards (TDD).
 *
 * Contract under test (R2-L2 only, on top of closed J/L1/V):
 * - Timed comments: POST /:id/comments accepts video_offset (seconds);
 *   invalid values clamp to NULL (still 201); the offset rides the GET
 *   payload AND the comment_new SSE event on the EXISTING channel.
 * - completed WITHOUT a recording is NOT recorded: the shared
 *   hasPlayableRecording predicate (the client's only readiness source —
 *   no HEAD probing) is false for bare completed rows.
 * - Like/Dislike: one effective reaction per identity; switching like→
 *   dislike keeps a single row and moves the counts (no doubling);
 *   DELETE returns to neutral. show() carries user_reaction.
 * - start/end guards are untouched: non-participant start → 403, end on a
 *   non-live competition → 409 (no permission change).
 */
import { describe, expect, it, beforeEach } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { RecommendationModel } from '../../src/models/RecommendationModel';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 9000;
function headers(token?: string, lang = 'ar'): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r2l2-test',
        'CF-Connecting-IP': `10.22.22.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    void lang;
    return h;
}

async function seedL2(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, avatar_url, is_active, language, country) VALUES
         (2, 'a@l2.local', 'user_a', 'x', 'User A Display', 'https://cdn.local/a.png', 1, 'ar', 'SA'),
         (3, 'b@l2.local', 'user_b', 'x', 'User B Display', null, 1, 'ar', 'SA'),
         (4, 'c@l2.local', 'user_c', 'x', 'User C Display', null, 1, 'en', 'EG')`,
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('sess-l2-a', 2, datetime('now', '+1 day')),
         ('sess-l2-b', 3, datetime('now', '+1 day')),
         ('sess-l2-c', 4, datetime('now', '+1 day'))`,
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES
         (20, 'dialogue', 'حوار', 'Dialogue', NULL)`,
    ).run();
    await db.prepare(
        `INSERT INTO competitions (id, title, description, rules, category_id, creator_id, opponent_id, language, status, vod_url, total_views, total_comments, likes_count, dislikes_count)
         VALUES
         (10, 'L2 live finals', 'd', 'r', 20, 2, 3, 'ar', 'live', NULL, 0, 0, 0, 0),
         (11, 'L2 recorded finals', 'd', 'r', 20, 2, 3, 'ar', 'completed', 'https://vod.local/match_11.mp4', 0, 0, 0, 0),
         (12, 'L2 bare finals', 'd', 'r', 20, 2, 3, 'ar', 'completed', NULL, 0, 0, 0, 0),
         (13, 'L2 accepted finals', 'd', 'r', 20, 2, 3, 'ar', 'accepted', NULL, 0, 0, 0, 0)`,
    ).run();
}

async function postComment(db: SqliteD1, compId: number, body: Record<string, unknown>, token: string) {
    const res = await app.request(`/api/competitions/${compId}/comments?lang=ar`, {
        method: 'POST',
        headers: headers(token),
        body: JSON.stringify(body),
    }, env(db));
    return { status: res.status, data: await res.json() as any };
}

async function getComments(db: SqliteD1, compId: number) {
    const res = await app.request(`/api/competitions/${compId}/comments?limit=100&offset=0&lang=ar`, {
        headers: headers(),
    }, env(db));
    return { status: res.status, data: await res.json() as any };
}

async function react(db: SqliteD1, compId: number, kind: 'like' | 'dislike', method: string, token?: string) {
    const res = await app.request(`/api/competitions/${compId}/${kind}?lang=en`, {
        method,
        headers: headers(token),
    }, env(db));
    return { status: res.status, data: await res.json() as any };
}

async function show(db: SqliteD1, compId: number, token?: string) {
    const res = await app.request(`/api/competitions/${compId}?lang=en`, {
        headers: headers(token),
    }, env(db));
    return { status: res.status, data: await res.json() as any };
}

describe('R2-L2 timed comments + reactions + readiness + guards', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = await createSqliteD1();
        await seedL2(db);
    });

    it('1. VOD comment carries video_offset; invalid clamps to NULL; live omits', async () => {
        const timed = await postComment(db, 11, { content: 'goal at 95', video_offset: 95 }, 'sess-l2-c');
        expect(timed.status).toBe(201);
        expect(timed.data.success).toBe(true);
        expect(timed.data.data.video_offset).toBe(95);

        const bad = await postComment(db, 11, { content: 'bad offset', video_offset: -5 }, 'sess-l2-c');
        expect(bad.status).toBe(201);
        expect(bad.data.data.video_offset).toBeNull();

        const live = await postComment(db, 10, { content: 'live shout', is_live: true }, 'sess-l2-c');
        expect(live.status).toBe(201);
        expect(live.data.data.video_offset).toBeNull();
    });

    it('2. GET returns offsets and SSE comment_new carries the offset (same channel)', async () => {
        await postComment(db, 11, { content: 'at 30', video_offset: 30 }, 'sess-l2-c');
        await postComment(db, 11, { content: 'at 120', video_offset: 120 }, 'sess-l2-c');

        const list = await getComments(db, 11);
        expect(list.status).toBe(200);
        const offsets = (list.data.data.items as any[]).map((c) => c.video_offset);
        expect(offsets).toContain(30);
        expect(offsets).toContain(120);

        const rows = await db.prepare(
            `SELECT event_type, payload FROM sse_event_log WHERE channel = ? ORDER BY id ASC`,
        ).bind('competition:11').all<{ event_type: string; payload: string }>();
        const timed = (rows.results ?? []).filter((r) => {
            try {
                const p = JSON.parse(r.payload);
                return r.event_type === 'comment_new' && p?.comment?.video_offset === 120;
            } catch { return false; }
        });
        expect(timed.length).toBeGreaterThan(0);
    });

    it('3. completed without recording is NOT recorded (shared readiness predicate)', async () => {
        const recorded = await show(db, 11);
        const bare = await show(db, 12);
        expect(recorded.data.data.status).toBe('completed');
        expect(bare.data.data.status).toBe('completed');
        expect(RecommendationModel.hasPlayableRecording(recorded.data.data)).toBe(true);
        expect(RecommendationModel.hasPlayableRecording(bare.data.data)).toBe(false);
        expect(RecommendationModel.hasPlayableRecording({ vod_url: '   ', youtube_video_url: null })).toBe(false);
    });

    it('4. like→dislike switches atomically (single row, counts move, no doubling)', async () => {
        const like = await react(db, 11, 'like', 'POST', 'sess-l2-c');
        expect(like.status).toBe(200);
        expect(like.data.data).toMatchObject({ liked: true, disliked: false, likes_count: 1, dislikes_count: 0 });

        const swap = await react(db, 11, 'dislike', 'POST', 'sess-l2-c');
        expect(swap.status).toBe(200);
        expect(swap.data.data).toMatchObject({ liked: false, disliked: true, likes_count: 0, dislikes_count: 1 });

        const likeRows = await db.prepare(`SELECT COUNT(*) AS n FROM likes WHERE competition_id = ?`).bind(11).first<{ n: number }>();
        const dislikeRows = await db.prepare(`SELECT COUNT(*) AS n FROM dislikes WHERE competition_id = ?`).bind(11).first<{ n: number }>();
        expect((likeRows?.n ?? -1) + (dislikeRows?.n ?? -1)).toBe(1);

        const neutral = await react(db, 11, 'dislike', 'DELETE', 'sess-l2-c');
        expect(neutral.status).toBe(200);
        expect(neutral.data.data).toMatchObject({ liked: false, disliked: false, likes_count: 0, dislikes_count: 0 });
    });

    it('5. show() carries the caller reaction; anonymous is neutral', async () => {
        await react(db, 11, 'like', 'POST', 'sess-l2-c');
        const mine = await show(db, 11, 'sess-l2-c');
        expect(mine.data.data.user_reaction).toMatchObject({ liked: true, disliked: false });
        const anon = await show(db, 11);
        expect(anon.data.data.user_reaction).toBeNull();
    });

    it('6. start/end guards unchanged (403 for outsiders, 409 off-state)', async () => {
        const outsider = await app.request(`/api/competitions/13/start?lang=en`, {
            method: 'POST',
            headers: headers('sess-l2-c'),
            body: JSON.stringify({}),
        }, env(db));
        expect(outsider.status).toBe(403);

        const endOffState = await app.request(`/api/competitions/13/end?lang=en`, {
            method: 'POST',
            headers: headers('sess-l2-a'),
            body: JSON.stringify({}),
        }, env(db));
        expect(endOffState.status).toBe(409);
    });
});
