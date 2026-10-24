/**
 * UNIT30.4 / R4-COMP-CONTROLS-EARLY-END-1 — short-recording discovery tier.
 *
 * H7 numeric weights are unchanged. The approved priority layer is applied
 * after eligibility/filtering and H7 ordering: trusted completed recordings
 * >=300s first, trusted completed recordings <300s after, within the same
 * surface/filter. Unknown/inconsistent duration is tier 1 (no guessed
 * penalty), and LIVE/upcoming are never short just because their age is.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { H7SignalsModel } from '../../src/models/H7SignalsModel';
import {
    H7_DISCOVERY_ORDERING_VERSION,
    H7_POLICY_VERSION,
    H7_SHORT_DURATION_SECONDS,
    h7Quality,
    h7QualityForTier,
    h7QualityTier,
} from '../../src/lib/services/H7RankingPolicy';
import {
    h7ApplyDiscoveryDiversityByTier,
    h7ApplyPriorityTier,
} from '../../src/lib/services/H7RankingService';
import { SqliteD1 } from '../helpers/sqlite-d1';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let db: SqliteD1;
let ipSeq = 900;

function headers(guest?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'u304-tier',
        'CF-Connecting-IP': `10.9.9.${(ipSeq % 250) + 1}`,
    };
    if (guest !== undefined) h['X-Guest-Token'] = guest;
    return h;
}

async function seed(): Promise<void> {
    db = new SqliteD1();
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country)
         VALUES (1, 'creator@u304tier.local', 'creator304', 'x', 'Creator', 1, 'ar', 'SA'),
                (2, 'opponent@u304tier.local', 'opponent304', 'x', 'Opponent', 1, 'ar', 'SA')`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id)
         VALUES (10, 'dialogue', 'حوار', 'Dialogue', NULL)`
    ).run();
}

async function addCompleted(opts: {
    title: string;
    startedExpr: string;
    endedExpr: string;
    views?: number;
    vod?: string | null;
}): Promise<number> {
    const res = await db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, creator_id, opponent_id, status,
             language, country, created_at, started_at, ended_at, total_views, vod_url)
         VALUES (?, 'd', 'r', 10, 1, 2, 'completed', 'ar', 'SA',
                 datetime('now'), ${opts.startedExpr}, ${opts.endedExpr}, ?, ?)`
    ).bind(opts.title, opts.views ?? 0, opts.vod ?? '/api/recordings/1/manifest').run();
    return Number(res.meta.last_row_id);
}

async function createRecordedRail(): Promise<{ sid: string; guest: string }> {
    const res = await app.request('/api/home-rails/sessions?lang=ar', {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ kind: 'suggested', status: 'recorded' }),
    }, env(db));
    const json = (await res.json()) as {
        success: boolean;
        data: { session: { id: string }; guest_token: string | null };
    };
    expect([200, 201]).toContain(res.status);
    expect(json.success).toBe(true);
    return { sid: json.data.session.id, guest: json.data.guest_token ?? '' };
}

async function readPage(sid: string, guest: string, cursor?: string, limit = 1): Promise<{
    ids: number[];
    nextCursor: string | null;
    hasMore: boolean;
}> {
    const q = new URLSearchParams({ kind: 'suggested', status: 'recorded', limit: String(limit), lang: 'ar' });
    if (cursor) q.set('cursor', cursor);
    const res = await app.request(`/api/home-rails/sessions/${sid}/page?${q.toString()}`, {
        headers: headers(guest),
    }, env(db));
    const json = (await res.json()) as {
        success: boolean;
        data: { items: Array<{ id: number }>; nextCursor: string | null; hasMore: boolean };
    };
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    return {
        ids: json.data.items.map((i) => i.id),
        nextCursor: json.data.nextCursor,
        hasMore: json.data.hasMore,
    };
}

beforeEach(async () => {
    await seed();
});

describe('UNIT30.4 short-tier policy helpers', () => {
    it('uses the official strict <300s boundary and never guesses unknown/negative durations', () => {
        expect(H7_SHORT_DURATION_SECONDS).toBe(300);
        expect(H7_DISCOVERY_ORDERING_VERSION).toBe('short-tier-v1');
        expect(H7_POLICY_VERSION).toBe('h7-v1');
        expect(h7QualityTier(299.999)).toBe(2);
        expect(h7QualityTier(300)).toBe(1);
        expect(h7QualityTier(300.001)).toBe(1);
        expect(h7QualityTier(null)).toBe(1);
        expect(h7QualityTier(undefined)).toBe(1);
        expect(h7QualityTier(-1)).toBe(1);
        expect(h7QualityTier(Number.NaN)).toBe(1);
    });

    it('zeroes only the competition quality contribution, not the H7 weights or real signals', () => {
        const normal = h7Quality(10, 500, 4, 1);
        expect(h7QualityForTier(1, 10, 500, 4, 1)).toBe(normal);
        expect(h7QualityForTier(undefined, 10, 500, 4, 1)).toBe(normal);
        expect(h7QualityForTier(2, 10, 500, 4, 1)).toBe(0);
        expect(h7QualityForTier(2, 0, 0, 0, 0)).toBe(0);
    });

    it('partitions long before short while preserving order inside each tier', () => {
        const ordered = [
            { id: 1, quality_tier: 1 },
            { id: 2, quality_tier: 2 },
            { id: 3, quality_tier: 1 },
            { id: 4, quality_tier: 2 },
        ];
        expect(h7ApplyPriorityTier(ordered).map((x) => x.id)).toEqual([1, 3, 2, 4]);

        const diverse = h7ApplyDiscoveryDiversityByTier([
            { id: 1, creator_id: 1, opponent_id: 2, created_at: null, total_views: 1, quality_tier: 1 },
            { id: 2, creator_id: 1, opponent_id: 2, created_at: null, total_views: 9999, quality_tier: 2 },
            { id: 3, creator_id: 2, opponent_id: 1, created_at: null, total_views: 2, quality_tier: 1 },
            { id: 4, creator_id: 2, opponent_id: 1, created_at: null, total_views: 9999, quality_tier: 2 },
        ], Date.now());
        expect(diverse.map((x) => x.id)).toEqual([1, 3, 2, 4]);
    });
});

describe('UNIT30.4 H7 signals + recorded rail', () => {
    it('derives tier from authoritative timestamps; LIVE/unknown stay tier 1', async () => {
        const long = await addCompleted({
            title: 'Long',
            startedExpr: "datetime('now', '-301 seconds')",
            endedExpr: "datetime('now')",
        });
        const short = await addCompleted({
            title: 'Short',
            startedExpr: "strftime('%Y-%m-%d %H:%M:%f', 'now', '-299.5 seconds')",
            endedExpr: "datetime('now')",
        });
        const live = await addCompleted({
            title: 'Live',
            startedExpr: "datetime('now', '-10 seconds')",
            endedExpr: 'NULL',
            vod: null,
        });
        await db.prepare("UPDATE competitions SET status = 'live', ended_at = NULL, vod_url = NULL WHERE id = ?").bind(live).run();

        const rows = await new H7SignalsModel(db as unknown as D1Database)
            .loadCompetitions([long, short, live]);
        const byId = new Map(rows.map((r) => [r.id, r]));
        expect(byId.get(long)?.quality_tier).toBe(1);
        expect(byId.get(short)?.quality_tier).toBe(2);
        expect(byId.get(live)?.quality_tier).toBe(1);
    });

    it('keeps short cards discoverable after long cards with stable cursor/hasMore and no duplicates', async () => {
        const longA = await addCompleted({
            title: 'Long A',
            startedExpr: "datetime('now', '-500 seconds')",
            endedExpr: "datetime('now')",
            views: 1,
        });
        const longB = await addCompleted({
            title: 'Long B',
            startedExpr: "datetime('now', '-400 seconds')",
            endedExpr: "datetime('now')",
            views: 2,
        });
        const shortA = await addCompleted({
            title: 'Short A',
            startedExpr: "strftime('%Y-%m-%d %H:%M:%f', 'now', '-200 seconds')",
            endedExpr: "datetime('now')",
            views: 999999,
        });
        const shortB = await addCompleted({
            title: 'Short B',
            startedExpr: "strftime('%Y-%m-%d %H:%M:%f', 'now', '-100 seconds')",
            endedExpr: "datetime('now')",
            views: 999999,
        });

        const { sid, guest } = await createRecordedRail();
        const seen: number[] = [];
        let cursor: string | undefined;
        for (let page = 0; page < 10; page += 1) {
            const result = await readPage(sid, guest, cursor, 1);
            seen.push(...result.ids);
            if (!result.hasMore) break;
            expect(result.nextCursor).toBeTruthy();
            cursor = result.nextCursor ?? undefined;
        }

        expect(new Set(seen).size).toBe(seen.length);
        expect(seen).toHaveLength(4);
        expect(seen.slice(0, 2).sort((a, b) => a - b)).toEqual([longA, longB].sort((a, b) => a - b));
        expect(seen.slice(2).sort((a, b) => a - b)).toEqual([shortA, shortB].sort((a, b) => a - b));
        // The short cards were not hidden by the huge views signal.
        expect(seen).toContain(shortA);
        expect(seen).toContain(shortB);
    });
});
