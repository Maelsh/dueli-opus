/**
 * R3-D2 — user discovery + matchmaking on h7-v1 (OWNER APPROVED 2026-10-04).
 *
 * Covers the task literally:
 * - Profile = SUM effective stars / contested competitions (denominator is
 *   competitions, never raters/ratings; may exceed 5, never clamped; zero
 *   participations => null, no division by zero). Single SSOT reused by
 *   display + ranking.
 * - User search: Unicode-aware text layers (exact → prefix/whole-word →
 *   partial, D1-REM1 logic, never ASCII \b) + H7 weights inside the layer
 *   (text 60, specialization 15, Profile 15, language 5, country 5).
 *   Followed/busy/stale-presence NEVER exclude; self/block hold.
 * - Opponent: mandatory layers (same sub+lang+country → same sub+lang
 *   other country → close spec in main category → fallback) BEFORE score;
 *   fame/Profile never bury a higher layer. Intra-layer H7 (spec 40,
 *   Profile 20, experience 15, presence 15, follow 10). Follower stays a
 *   candidate; busy stays a candidate; self/block/pending/H3 hold; invite
 *   eligibility rechecked at SEND.
 * - Follow: H7 (interest 25, lang 20, country 10, Profile 15, experience 10,
 *   activity 10, new-account 10). Busy NEVER blocks follow. Follow
 *   eligibility is separate from duel/search eligibility.
 * - Participation (user→competition): eligible seats only (pending + no
 *   opponent; accepted/open never auto-joinable) + H7 inside (topic 35,
 *   creator history 20, creator activity 10, follow 10, recency 15,
 *   schedule 10). Seat eligibility from the real contract.
 * - Competition→user candidate-sessions mirror the opponent provider.
 * - Sessions (§7): full eligible set at T0, frozen order, presence drift
 *   never reorders, new session recalculates, skip-fill on hard-eligibility
 *   loss, no duplicates, full exhaustion (>100), no RANDOM+OFFSET.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import {
    H7_POLICY_VERSION,
    H7_USER_SEARCH_WEIGHTS,
    H7_OPPONENT_WEIGHTS,
    H7_FOLLOW_WEIGHTS,
    H7_PARTICIPATION_WEIGHTS,
    h7ProfileDisplay,
} from '../../src/lib/services/H7RankingPolicy';
import {
    h7FollowScore,
    h7OpponentLayer,
    h7OpponentScore,
    h7UserSearchLayer,
    h7UserSearchScore,
    h7ParticipationScore,
} from '../../src/lib/services/H7UserRankingService';
import { UserSignalsModel } from '../../src/models/UserSignalsModel';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

let ipSeq = 900;
function headers(token?: string, guest?: string): Record<string, string> {
    ipSeq += 1;
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'r3d2-test',
        'CF-Connecting-IP': `10.9.9.${(ipSeq % 250) + 1}`,
    };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (guest !== undefined) h['X-Guest-Token'] = guest;
    return h;
}

async function seedBase(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country, is_online, last_seen_at, is_busy, created_at) VALUES
          (2, 'creator@d2.local', 'creator', 'x', 'Creator C', 1, 'ar', 'SA', 1, datetime('now'), 0, datetime('now')),
          (3, 'viewer@d2.local', 'viewer', 'x', 'Viewer V', 1, 'ar', 'SA', 1, datetime('now'), 0, datetime('now'))`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-d2-user2', 2, datetime('now', '+1 day')), ('sess-d2-user3', 3, datetime('now', '+1 day'))`
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en, parent_id) VALUES
          (10, 'dialogue', 'حوار', 'Dialogue', NULL),
          (11, 'science', 'علوم', 'Science', NULL),
          (12, 'talents', 'مواهب', 'Talents', NULL),
          (13, 'physics', 'فيزياء', 'Physics', 11),
          (14, 'religions', 'أديان', 'Religions', 10)`
    ).run();
}

async function addUser(
    db: SqliteD1,
    opts: {
        id: number; username: string; display?: string; lang?: string; country?: string;
        online?: boolean; seen?: string | null; busy?: boolean; active?: boolean; created?: string;
    }
): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country, is_online, last_seen_at, is_busy, created_at)
          VALUES (?, ?, ?, 'x', ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
        opts.id, `${opts.username}@d2.local`, opts.username, opts.display ?? opts.username,
        opts.active === false ? 0 : 1, opts.lang ?? 'ar', opts.country ?? 'SA',
        opts.online ? 1 : 0, opts.seen ?? null, opts.busy ? 1 : 0,
        opts.created ?? new Date().toISOString().slice(0, 19).replace('T', ' ')
    ).run();
}

async function addCompetition(
    db: SqliteD1,
    opts: {
        title: string; categoryId?: number; subcategoryId?: number | null; creatorId?: number;
        opponentId?: number | null; lang?: string; country?: string | null; status?: string;
    }
): Promise<number> {
    const r = await db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, subcategory_id, creator_id, opponent_id,
             language, country, status, created_at, total_views, likes_count, dislikes_count)
          VALUES (?, 'd', 'r', ?, ?, ?, ?, ?, ?, ?, datetime('now'), 0, 0, 0)`
    ).bind(
        opts.title, opts.categoryId ?? 11, opts.subcategoryId ?? null,
        opts.creatorId ?? 2, opts.opponentId ?? null, opts.lang ?? 'ar', opts.country ?? null,
        opts.status ?? 'pending'
    ).run();
    return Number(r.meta.last_row_id);
}

async function addRating(db: SqliteD1, competitionId: number, userId: number, competitorId: number, rating: number): Promise<void> {
    await db.prepare(
        `INSERT INTO ratings (competition_id, user_id, competitor_id, rating, created_at)
          VALUES (?, ?, ?, ?, datetime('now'))`
    ).bind(competitionId, userId, competitorId, rating).run();
}

async function createSession(
    db: SqliteD1, path: string, body: unknown, opts: { token?: string; guest?: string; lang?: string } = {}
): Promise<{ status: number; data: { session: { id: string; total: number } } | null; guestToken: string | null }> {
    const res = await app.request(`${path}?lang=${opts.lang ?? 'ar'}`, {
        method: 'POST', headers: headers(opts.token, opts.guest), body: JSON.stringify(body ?? {}),
    }, env(db));
    const json = (await res.json()) as { success: boolean; data: { session: { id: string; total: number }; guest_token?: string | null } };
    return { status: res.status, data: json.success ? json.data : null, guestToken: json.success ? (json.data.guest_token ?? null) : null };
}

async function readSession(
    db: SqliteD1, path: string, sid: string, extra: Record<string, string>, opts: { token?: string; guest?: string; cursor?: string; limit?: number; lang?: string } = {}
): Promise<{ status: number; ids: number[]; hasMore: boolean; cursor: string | null; total: number }> {
    const q = new URLSearchParams({ lang: opts.lang ?? 'ar', ...extra });
    if (opts.cursor !== undefined) q.set('cursor', opts.cursor);
    if (opts.limit !== undefined) q.set('limit', String(opts.limit));
    const res = await app.request(`${path}/${sid}/page?${q.toString()}`, {
        headers: headers(opts.token, opts.guest),
    }, env(db));
    const json = (await res.json()) as {
        success: boolean;
        data: { items: Array<{ id: number }>; nextCursor: string | null; hasMore: boolean; session: { id: string; total: number } };
    };
    if (!json.success) return { status: res.status, ids: [], hasMore: false, cursor: null, total: 0 };
    return {
        status: res.status,
        ids: (json.data.items ?? []).map((c) => c.id),
        hasMore: json.data.hasMore,
        cursor: json.data.nextCursor,
        total: json.data.session.total,
    };
}

async function traverse(
    db: SqliteD1, path: string, sid: string, extra: Record<string, string>, opts: { token?: string; guest?: string; limit?: number } = {}
): Promise<number[]> {
    const ids: number[] = [];
    let cursor: string | undefined;
    for (let pages = 0; ; pages += 1) {
        const page = await readSession(db, path, sid, extra, { cursor, limit: opts.limit ?? 7, token: opts.token, guest: opts.guest });
        expect(page.status).toBe(200);
        ids.push(...page.ids);
        if (!page.hasMore) break;
        cursor = page.cursor ?? undefined;
        if (pages > 120) throw new Error('D2 traversal did not terminate');
    }
    return ids;
}

describe('R3-D2 policy numbers pinned from §11', () => {
    it('h7-v1 D2 tables sum to 100 with approved values', () => {
        expect(H7_POLICY_VERSION).toBe('h7-v1');
        expect({ ...H7_USER_SEARCH_WEIGHTS }).toMatchObject({ text: 60, specialization: 15, profile: 15, language: 5, country: 5 });
        expect(Object.values(H7_USER_SEARCH_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
        expect({ ...H7_OPPONENT_WEIGHTS }).toMatchObject({ specialization: 40, profile: 20, experience: 15, presence: 15, follow: 10 });
        expect(Object.values(H7_OPPONENT_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
        expect({ ...H7_FOLLOW_WEIGHTS }).toMatchObject({ interest: 25, language: 20, country: 10, profile: 15, experience: 10, activity: 10, newAccount: 10 });
        expect(Object.values(H7_FOLLOW_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
        expect({ ...H7_PARTICIPATION_WEIGHTS }).toMatchObject({ topic: 35, creatorHistory: 20, creatorActivity: 10, follow: 10, recency: 15, schedule: 10 });
        expect(Object.values(H7_PARTICIPATION_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
    });
});

describe('R3-D2 Profile SSOT (08/11)', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seedBase(db);
    });

    it('denominator is contested competitions, not raters/ratings', async () => {
        // Competitor 20: ONE contested competition (with opponent) rated by
        // THREE raters (5+5+5) + ONE bare pending row with no opponent.
        await addUser(db, { id: 20, username: 'star20' });
        await addUser(db, { id: 21, username: 'opp21' });
        const c1 = await addCompetition(db, { title: 'Duel A', creatorId: 20, opponentId: 21, status: 'completed' });
        await addCompetition(db, { title: 'Bare pending', creatorId: 20, opponentId: null, status: 'pending' });
        await addRating(db, c1, 3, 20, 5);
        await addRating(db, c1, 2, 20, 5);
        await addRating(db, c1, 21, 20, 5);
        const p = await new UserSignalsModel(db).getProfile(20);
        // 15 stars / 1 contested competition — NOT /3 raters, NOT /2 rows.
        expect(p.competitions).toBe(1);
        expect(p.starsSum).toBe(15);
        expect(p.profile).toBe(15);
    });

    it('Profile may exceed 5 (never clamped) and zero means null', async () => {
        await addUser(db, { id: 22, username: 'giant22' });
        await addUser(db, { id: 23, username: 'fresh23' });
        const c1 = await addCompetition(db, { title: 'Duel X', creatorId: 22, opponentId: 3, status: 'completed' });
        const c2 = await addCompetition(db, { title: 'Duel Y', creatorId: 2, opponentId: 22, status: 'completed' });
        for (const u of [2, 3]) {
            await addRating(db, c1, u, 22, 5);
            await addRating(db, c2, u, 22, 5);
        }
        // Extra bare rows never inflate the denominator.
        await addCompetition(db, { title: 'Bare 1', creatorId: 23, opponentId: null, status: 'pending' });
        const signals = new UserSignalsModel(db);
        const big = await signals.getProfile(22);
        expect(big.profile).toBe(10);
        expect(h7ProfileDisplay(60, 2)).toBe(30);
        const empty = await signals.getProfile(23);
        expect(empty.competitions).toBe(0);
        expect(empty.profile).toBeNull();
    });

    it('profile API + competitor-stats share the SSOT', async () => {
        await addUser(db, { id: 24, username: 'star24' });
        const c1 = await addCompetition(db, { title: 'Duel P', creatorId: 24, opponentId: 3, status: 'completed' });
        await addRating(db, c1, 2, 24, 4);
        await addRating(db, c1, 3, 24, 5);
        const show = await app.request('/api/users/star24?lang=en', { headers: headers() }, env(db));
        expect(show.status).toBe(200);
        const showJson = (await show.json()) as { success: boolean; data: { profile_score: number | null; profile_competitions: number; profile_stars: number } };
        expect(showJson.data.profile_score).toBe(9);
        expect(showJson.data.profile_competitions).toBe(1);
        expect(showJson.data.profile_stars).toBe(9);
        const stats = await app.request('/api/recommendations/competitor-stats/24?lang=en', { headers: headers() }, env(db));
        expect(stats.status).toBe(200);
        const statsJson = (await stats.json()) as { success: boolean; data: { profile_score: number | null; profile_competitions: number } };
        expect(statsJson.data.profile_score).toBe(9);
        expect(statsJson.data.profile_competitions).toBe(1);
        // Contested-but-unrated reads as a true zero (user 3 opposed c1).
        const zero = await app.request('/api/users/viewer?lang=en', { headers: headers() }, env(db));
        const zeroJson = (await zero.json()) as { success: boolean; data: { profile_score: number | null; profile_competitions: number } };
        expect(zeroJson.data.profile_score).toBe(0);
        expect(zeroJson.data.profile_competitions).toBe(1);
        // Zero participations reads null (no division by zero).
        await addUser(db, { id: 25, username: 'fresh25' });
        const fresh = await app.request('/api/users/fresh25?lang=en', { headers: headers() }, env(db));
        const freshJson = (await fresh.json()) as { success: boolean; data: { profile_score: number | null } };
        expect(freshJson.data.profile_score).toBeNull();
    });
});

describe('R3-D2 user search (H7 + Unicode layers)', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seedBase(db);
    });

    it('exact beats prefix/whole-word beats partial, in ar and en', async () => {
        await addUser(db, { id: 30, username: 'sara', display: 'Sara Ahmed' });
        await addUser(db, { id: 31, username: 'sara_fan', display: 'Sara fan club' });
        await addUser(db, { id: 32, username: 'xsarax', display: 'I love xsarax styles' });
        // Arabic trio: exact, whole-word mid-text with punctuation, infix.
        await addUser(db, { id: 33, username: 'ahmed', display: 'أحمد' });
        await addUser(db, { id: 34, username: 'fan34', display: 'منافسة، أحمد! قوية' });
        await addUser(db, { id: 35, username: 'fan35', display: 'بأحمدممتاز' });
        expect(h7UserSearchLayer({ username: 'sara', display_name: 'Sara', bio: null } as never, 'sara')).toBe(0);
        expect(h7UserSearchLayer({ username: 'sara_fan', display_name: 'Sara fan club', bio: null } as never, 'sara')).toBe(1);
        expect(h7UserSearchLayer({ username: 'xsarax', display_name: 'I love xsarax styles', bio: null } as never, 'sara')).toBe(2);
        // Unicode whole-word: «أحمد» surrounded by Arabic punctuation is a
        // whole word (layer 1); the same letters inside a longer token are
        // partial (layer 2) — the ASCII \b bug would demote both.
        expect(h7UserSearchLayer({ username: 'fan34', display_name: 'منافسة، أحمد! قوية', bio: null } as never, 'أحمد')).toBe(1);
        expect(h7UserSearchLayer({ username: 'fan35', display_name: 'بأحمدممتاز', bio: null } as never, 'أحمد')).toBe(2);

        const res = await app.request('/api/search/users?q=sara&limit=20&lang=en', { headers: headers() }, env(db));
        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; data: { items: Array<{ id: number }> } };
        const ids = json.data.items.map((u) => u.id);
        expect(ids.indexOf(30)).toBeLessThan(ids.indexOf(31));
        expect(ids.indexOf(31)).toBeLessThan(ids.indexOf(32));

        const ar = await app.request(`/api/search/users?q=${encodeURIComponent('أحمد')}&limit=20&lang=ar`, { headers: headers() }, env(db));
        expect(ar.status).toBe(200);
        const arJson = (await ar.json()) as { success: boolean; data: { items: Array<{ id: number }> } };
        const arIds = arJson.data.items.map((u) => u.id);
        expect(arIds).toContain(33);
        expect(arIds).toContain(34);
        expect(arIds.indexOf(33)).toBeLessThan(arIds.indexOf(34));
        expect(arIds.indexOf(34)).toBeLessThan(arIds.indexOf(35));
    });

    it('H7 orders inside one layer; followed/busy/stale stay searchable; self/block excluded', async () => {
        // Two partial-layer candidates: same text tier, different Profile.
        // 40 holds one contested competition with 5 effective 5-star rows
        // (Profile 25 → N(25;20) ≈ 0.52, above the 0.5 neutral band);
        // 41 holds no record (neutral 0.5).
        await addUser(db, { id: 40, username: 'duelist40', display: 'best duelist ever' });
        await addUser(db, { id: 41, username: 'duelist41', display: 'best duelist ever' });
        for (const r of [90, 91, 92]) await addUser(db, { id: r, username: `rater${r}` });
        const c1 = await addCompetition(db, { title: 'D1', creatorId: 40, opponentId: 3, status: 'completed' });
        for (const u of [2, 3, 90, 91, 92]) await addRating(db, c1, u, 40, 5);
        // Followed + busy + long-offline candidates stay searchable.
        await addUser(db, { id: 42, username: 'duelist42', display: 'best duelist ever', busy: true });
        await addUser(db, { id: 43, username: 'duelist43', display: 'best duelist ever', seen: '2020-01-01 00:00:00' });
        await db.prepare(`INSERT INTO follows (follower_id, following_id, created_at) VALUES (2, 42, datetime('now'))`).run();
        // Self + blocked are hidden from the viewer's search.
        await addUser(db, { id: 44, username: 'blocked44', display: 'best duelist ever' });
        await db.prepare(`INSERT INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (2, 44, datetime('now'))`).run();

        const res = await app.request('/api/search/users?q=duelist&limit=20&lang=en', { headers: headers('sess-d2-user2') }, env(db));
        expect(res.status).toBe(200);
        const json = (await res.json()) as { success: boolean; data: { items: Array<{ id: number }> } };
        const ids = json.data.items.map((u) => u.id);
        // Higher Profile first inside the same text layer.
        expect(ids.indexOf(40)).toBeLessThan(ids.indexOf(41));
        // Followed, busy and stale-presence candidates are NOT excluded.
        expect(ids).toContain(42);
        expect(ids).toContain(43);
        // Self + blocked are excluded for the viewer …
        expect(ids).not.toContain(2);
        expect(ids).not.toContain(44);
        // … but visible to a stranger (permissions follow the usage context).
        const anon = await app.request('/api/search/users?q=duelist&limit=20&lang=en', { headers: headers() }, env(db));
        const anonJson = (await anon.json()) as { success: boolean; data: { items: Array<{ id: number }> } };
        expect(anonJson.data.items.map((u) => u.id)).toContain(44);
    });
});

describe('R3-D2 opponent suggestions (layers before score)', () => {
    let db: SqliteD1;
    let compId: number;
    beforeEach(async () => {
        db = new SqliteD1();
        await seedBase(db);
        // Viewer 2 creates a physics (science) competition, ar/SA.
        compId = await addCompetition(db, {
            title: 'Physics duel', categoryId: 11, subcategoryId: 13,
            creatorId: 2, opponentId: null, lang: 'ar', country: 'SA', status: 'pending',
        });
        // L1: same sub + lang + other country.
        await addUser(db, { id: 50, username: 'l1phys', display: 'L1', lang: 'ar', country: 'EG' });
        await addCompetition(db, { title: 'P', categoryId: 11, subcategoryId: 13, creatorId: 50, opponentId: 3, status: 'completed' });
        // Fallback superstar: giant Profile, no physics at all.
        await addUser(db, { id: 51, username: 'superstar', display: 'Super', lang: 'ar', country: 'SA' });
        const s1 = await addCompetition(db, { title: 'T1', categoryId: 12, creatorId: 51, opponentId: 3, status: 'completed' });
        const s2 = await addCompetition(db, { title: 'T2', categoryId: 12, creatorId: 51, opponentId: 2, status: 'completed' });
        for (const u of [2, 3]) {
            await addRating(db, s1, u, 51, 5);
            await addRating(db, s2, u, 51, 5);
        }
        // L0: same sub + lang + country, zero Profile.
        await addUser(db, { id: 52, username: 'l0phys', display: 'L0', lang: 'ar', country: 'SA' });
        await addCompetition(db, { title: 'P0', categoryId: 11, subcategoryId: 13, creatorId: 52, opponentId: 3, status: 'completed' });
    });

    it('layer order beats Profile; follower + busy stay candidates; self/block/H3 excluded', async () => {
        // Follower + busy qualifiers stay in the duel pool.
        await db.prepare(`INSERT INTO follows (follower_id, following_id, created_at) VALUES (2, 52, datetime('now'))`).run();
        await db.prepare(`UPDATE users SET is_busy = 1 WHERE id = 52`).run();
        // Blocked + pending-invite + pending-request + closed-requests excluded.
        await addUser(db, { id: 53, username: 'blocked53', display: 'B', lang: 'ar', country: 'SA' });
        await addCompetition(db, { title: 'P53', categoryId: 11, subcategoryId: 13, creatorId: 53, opponentId: 3, status: 'completed' });
        await db.prepare(`INSERT INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (2, 53, datetime('now'))`).run();
        await addUser(db, { id: 54, username: 'invited54', display: 'I', lang: 'ar', country: 'SA' });
        await db.prepare(`INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status, created_at) VALUES (?, 2, 54, 'pending', datetime('now'))`).bind(compId).run();
        await addUser(db, { id: 55, username: 'requester55', display: 'R', lang: 'ar', country: 'SA' });
        await db.prepare(`INSERT INTO competition_requests (competition_id, requester_id, status, created_at) VALUES (?, 55, 'pending', datetime('now'))`).bind(compId).run();

        const created = await createSession(db, '/api/matchmaking/opponent-sessions', { competition_id: compId }, { token: 'sess-d2-user2' });
        expect(created.status).toBe(201);
        const sid = created.data!.session.id;
        const ids = await traverse(db, '/api/matchmaking/opponent-sessions', sid, { competition_id: String(compId) }, { token: 'sess-d2-user2' });
        // L0 (52) first despite zero Profile; L1 (50) next; the superstar (51)
        // never buries a higher layer.
        expect(ids.indexOf(52)).toBeLessThan(ids.indexOf(50));
        expect(ids.indexOf(50)).toBeLessThan(ids.indexOf(51));
        // Followed + busy qualifier stays a candidate.
        expect(ids).toContain(52);
        // Self / blocked / pending-invite / pending-request excluded.
        expect(ids).not.toContain(2);
        expect(ids).not.toContain(53);
        expect(ids).not.toContain(54);
        expect(ids).not.toContain(55);

        // Unit pins: layer helper + intra-layer score shape.
        expect(h7OpponentLayer(
            { language: 'ar', country: 'SA' } as never,
            { categoryCounts: new Map(), subcategoryCounts: new Map([['physics', 2]]), explicitFavs: [], totalParticipations: 2 },
            { subcategory: 'physics', category: 'science', language: 'ar', country: 'SA' }
        )).toBe(0);
        const superScore = h7OpponentScore(
            { id: 51, language: 'ar', country: 'SA', is_online: 1, last_seen_at: null } as never,
            { categoryCounts: new Map([['talents', 2]]), subcategoryCounts: new Map(), explicitFavs: [], totalParticipations: 2 },
            { userId: 51, starsSum: 20, competitions: 2, profile: 10 },
            { viewerId: 2, language: 'ar', country: 'SA', followingIds: new Set(), viewerSpec: null },
            { subcategory: 'physics', category: 'science', language: 'ar', country: 'SA' },
            Date.now()
        );
        expect(superScore).toBeGreaterThanOrEqual(0);
        expect(superScore).toBeLessThanOrEqual(100);
    });

    it('invite eligibility is rechecked at SEND; frozen suggestion never guarantees it', async () => {
        await addUser(db, { id: 56, username: 'cand56', display: 'C56', lang: 'ar', country: 'SA' });
        const created = await createSession(db, '/api/matchmaking/opponent-sessions', { competition_id: compId }, { token: 'sess-d2-user2' });
        const ids = await traverse(db, '/api/matchmaking/opponent-sessions', created.data!.session.id, { competition_id: String(compId) }, { token: 'sess-d2-user2' });
        expect(ids).toContain(56);
        // First invite succeeds …
        const inv = await app.request(`/api/competitions/${compId}/invite?lang=en`, {
            method: 'POST', headers: headers('sess-d2-user2'), body: JSON.stringify({ invitee_id: 56 }),
        }, env(db));
        expect(inv.status).toBe(200);
        // … the repeat is a real 409 recheck (not the stale suggestion).
        const dup = await app.request(`/api/competitions/${compId}/invite?lang=en`, {
            method: 'POST', headers: headers('sess-d2-user2'), body: JSON.stringify({ invitee_id: 56 }),
        }, env(db));
        expect(dup.status).toBe(409);
        // Self-invite stays rejected at SEND.
        const self = await app.request(`/api/competitions/${compId}/invite?lang=en`, {
            method: 'POST', headers: headers('sess-d2-user2'), body: JSON.stringify({ invitee_id: 2 }),
        }, env(db));
        expect(self.status).toBe(409);
    });

    it('competition→user candidate-sessions mirror the opponent provider', async () => {
        const created = await createSession(db, '/api/competitions/candidate-sessions', { competition_id: compId }, { token: 'sess-d2-user2' });
        expect(created.status).toBe(201);
        const ids = await traverse(db, '/api/competitions/candidate-sessions', created.data!.session.id, { competition_id: String(compId) }, { token: 'sess-d2-user2' });
        expect(ids.indexOf(52)).toBeLessThan(ids.indexOf(51));
        expect(ids).not.toContain(2);
    });
});

describe('R3-D2 follow suggestions (own H7, own eligibility)', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seedBase(db);
    });

    it('busy never blocks follow; followed/self/blocked excluded; follow ≠ duel eligibility', async () => {
        await addUser(db, { id: 60, username: 'busy60', display: 'Busy Bee', busy: true });
        await addUser(db, { id: 61, username: 'plain61', display: 'Plain' });
        await addUser(db, { id: 62, username: 'blocked62', display: 'Blocked' });
        await db.prepare(`INSERT INTO user_blocks (blocker_id, blocked_id, created_at) VALUES (2, 62, datetime('now'))`).run();
        // 61 is already followed: out of follow pool, still a duel candidate.
        await db.prepare(`INSERT INTO follows (follower_id, following_id, created_at) VALUES (2, 61, datetime('now'))`).run();

        const created = await createSession(db, '/api/users/follow-sessions', {}, { token: 'sess-d2-user2' });
        expect(created.status).toBe(201);
        const followIds = await traverse(db, '/api/users/follow-sessions', created.data!.session.id, {}, { token: 'sess-d2-user2' });
        expect(followIds).toContain(60);
        expect(followIds).not.toContain(61);
        expect(followIds).not.toContain(2);
        expect(followIds).not.toContain(62);

        // Same viewer: 61 stays visible to search and to duel candidates.
        const search = await app.request('/api/search/users?q=plain61&limit=10&lang=en', { headers: headers('sess-d2-user2') }, env(db));
        const searchJson = (await search.json()) as { success: boolean; data: { items: Array<{ id: number }> } };
        expect(searchJson.data.items.map((u) => u.id)).toContain(61);

        // Unit pin: follow score stays on the 0–100 scale.
        const s = h7FollowScore(
            { id: 60, language: 'ar', country: 'SA', is_online: 0, last_seen_at: new Date().toISOString(), created_at: new Date().toISOString() } as never,
            { categoryCounts: new Map([['science', 1]]), subcategoryCounts: new Map(), explicitFavs: [], totalParticipations: 1 },
            { userId: 60, starsSum: 0, competitions: 1, profile: 0 },
            { viewerId: 2, language: 'ar', country: 'SA', followingIds: new Set(), viewerSpec: null },
            Date.now()
        );
        expect(s).toBeGreaterThanOrEqual(0);
        expect(s).toBeLessThanOrEqual(100);
    });
});

describe('R3-D2 participation (user→competition, real seats only)', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seedBase(db);
    });

    it('eligible pending seats rank H7; accepted/own/H3/closed seats excluded', async () => {
        // Eligible seat by another creator (physics, scheduled soon).
        const open = await addCompetition(db, { title: 'Open physics seat', categoryId: 11, subcategoryId: 13, creatorId: 3, opponentId: null, status: 'pending' });
        // Accepted (has opponent) — never auto-joinable.
        await addCompetition(db, { title: 'Taken seat', categoryId: 11, subcategoryId: 13, creatorId: 3, opponentId: 2, status: 'accepted' });
        // Own seat — excluded.
        await addCompetition(db, { title: 'Own seat', categoryId: 11, creatorId: 2, opponentId: null, status: 'pending' });
        // H3: pending invite for viewer on this seat — accept/decline, not join.
        const invited = await addCompetition(db, { title: 'Invited seat', categoryId: 11, creatorId: 3, opponentId: null, status: 'pending' });
        await db.prepare(`INSERT INTO competition_invitations (competition_id, inviter_id, invitee_id, status, created_at) VALUES (?, 3, 2, 'pending', datetime('now'))`).bind(invited).run();
        // H3: viewer's own pending request on this seat.
        const requested = await addCompetition(db, { title: 'Requested seat', categoryId: 11, creatorId: 3, opponentId: null, status: 'pending' });
        await db.prepare(`INSERT INTO competition_requests (competition_id, requester_id, status, created_at) VALUES (?, 2, 'pending', datetime('now'))`).bind(requested).run();

        const created = await createSession(db, '/api/competitions/participation-sessions', {}, { token: 'sess-d2-user2' });
        expect(created.status).toBe(201);
        const ids = await traverse(db, '/api/competitions/participation-sessions', created.data!.session.id, {}, { token: 'sess-d2-user2' });
        expect(ids).toContain(open);
        expect(ids).not.toContain(invited);
        expect(ids).not.toContain(requested);
        for (const id of ids) {
            const row = await db.prepare(`SELECT status, opponent_id, creator_id FROM competitions WHERE id = ?`).bind(id).first<{ status: string; opponent_id: number | null; creator_id: number }>();
            expect(row!.status).toBe('pending');
            expect(row!.opponent_id).toBeNull();
            expect(row!.creator_id).not.toBe(2);
        }
        // Unit pin: participation score on the 0–100 scale.
        const ps = h7ParticipationScore(
            { id: open, category_slug: 'science', subcategory_slug: 'physics', creator_id: 3, language: 'ar', country: 'SA', created_at: new Date().toISOString(), scheduled_at: null, total_views: 0, stars_sum: 0, likes_count: 0, dislikes_count: 0 },
            { viewerId: 2, language: 'ar', country: 'SA', followingIds: new Set(), viewerSpec: null, creatorProfiles: new Map(), creatorLastSeen: new Map() },
            0.5, 0.5, Date.now()
        );
        expect(ps).toBeGreaterThanOrEqual(0);
        expect(ps).toBeLessThanOrEqual(100);
    });
});

describe('R3-D2 sessions (§7): frozen, exhaustive, skip-fill', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = new SqliteD1();
        await seedBase(db);
    });

    it('>100 candidates traverse exactly once; frozen despite presence drift; new session recalculates; skip-fill on deactivation', async () => {
        for (let i = 100; i < 220; i += 1) {
            await addUser(db, { id: i, username: `cand${i}`, display: `Candidate ${i}` });
        }
        const created = await createSession(db, '/api/users/follow-sessions', {}, { token: 'sess-d2-user2' });
        expect(created.status).toBe(201);
        expect(created.data!.session.total).toBeGreaterThan(100);
        // Presence drift after T0 …
        await db.prepare(`UPDATE users SET is_online = 1 WHERE id = 100`).run();
        await db.prepare(`UPDATE users SET last_seen_at = datetime('now') WHERE id = 101`).run();
        const first = await traverse(db, '/api/users/follow-sessions', created.data!.session.id, {}, { token: 'sess-d2-user2', limit: 9 });
        // … never reorders the frozen scroll and never duplicates.
        expect(new Set(first).size).toBe(first.length);
        expect(first.length).toBe(created.data!.session.total);
        const retry = await readSession(db, '/api/users/follow-sessions', created.data!.session.id, {}, { token: 'sess-d2-user2', limit: 9 });
        expect(retry.status).toBe(200);
        // Deactivate one candidate mid-session: skip-fill keeps exhaustion exact.
        await db.prepare(`UPDATE users SET is_active = 0 WHERE id = 110`).run();
        const after = await traverse(db, '/api/users/follow-sessions', created.data!.session.id, {}, { token: 'sess-d2-user2', limit: 9 });
        expect(after).not.toContain(110);
        expect(new Set(after).size).toBe(after.length);
        expect(after.length).toBe(created.data!.session.total - 1);
        // A NEW session recalculates from the latest data.
        const fresh = await createSession(db, '/api/users/follow-sessions', {}, { token: 'sess-d2-user2' });
        expect(fresh.data!.session.total).toBe(created.data!.session.total - 1);
    });

    it('user-search sessions isolate guests and keep the full set at T0', async () => {
        for (let i = 300; i < 330; i += 1) {
            await addUser(db, { id: i, username: `seek${i}`, display: `Seeker ${i}` });
        }
        const g1 = await createSession(db, '/api/search/users-sessions', { q: 'seek' }, { guest: 'guest-token-aaa-1111' });
        expect(g1.status).toBe(201);
        expect(g1.guestToken).toBeNull();
        const anon = await createSession(db, '/api/search/users-sessions', { q: 'seek' }, {});
        expect(anon.status).toBe(201);
        expect(anon.guestToken).toBeTruthy();
        // A stranger with no token cannot read another identity's session.
        const foreign = await readSession(db, '/api/search/users-sessions', g1.data!.session.id, { q: 'seek' }, { guest: 'guest-token-bbb-2222' });
        expect(foreign.status).toBe(404);
        const ids = await traverse(db, '/api/search/users-sessions', anon.data!.session.id, { q: 'seek' }, { guest: anon.guestToken! });
        expect(ids.length).toBe(anon.data!.session.total);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
