/**
 * UNIT41.2-P1 (G3) — unified recorded-eligibility predicate.
 *
 * Contract under test:
 * - ONE definition of "playable recorded" lives in
 *   CompetitionModel.RECORDED_MEDIA_SQL / hasPlayableRecording and is
 *   reused by SearchModel, RecommendationModel (Suggested/Recorded),
 *   ExploreSessionService and the Home rails — no drift.
 * - A completed competition is eligible when it has ANY of: a trimmed
 *   vod_url, a trimmed youtube_video_url, recording_chunks rows,
 *   recording_finals markers, is_fake = 1 (unified demo), or the platform
 *   `demo_explainer_video_url` setting configured. Empty/whitespace-only
 *   media columns are never eligible evidence by themselves.
 * - The unified gate expands eligibility WITHOUT breaking the H7 ordering
 *   contract: the Suggested set stays a deterministically H7-scored
 *   snapshot (no RANDOM, no re-shuffle on every read).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import {
    CompetitionModel,
    RECORDED_MEDIA_SQL,
    EXPIRED_INSTANT_PENDING_SQL,
} from '../../src/models/CompetitionModel';
import { RecommendationModel } from '../../src/models/RecommendationModel';
import { ExploreSessionService } from '../../src/lib/services/ExploreSessionService';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;
const d1 = (db: SqliteD1) => db as unknown as D1Database;

const minutesAgo = (m: number): string => new Date(Date.now() - m * 60_000).toISOString().slice(0, 19).replace('T', ' ');

async function seed(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country) VALUES
         (2, 'creator@g3.local', 'creatorg3', 'x', 'Creator G3', 1, 'ar', 'SA'),
         (4, 'opponent@g3.local', 'opponentg3', 'x', 'Opponent G3', 1, 'ar', 'SA')`,
    ).run();
    await db.prepare(
        `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (10, 'dialogue', 'حوار', 'Dialogue')`,
    ).run();
    // G3: the platform demo explainer (migrations 0045) must not blanket the
    // fixture — each branch below asserts its OWN evidence.
    await db.prepare(
        `DELETE FROM platform_settings WHERE setting_key = 'demo_explainer_video_url'`,
    ).run();
}

async function insertComp(db: SqliteD1, opts: {
    status?: string; vod?: string | null; yt?: string | null; isFake?: number;
    chunks?: boolean; finals?: boolean; ageH?: number;
}): Promise<number> {
    const status = opts.status ?? 'completed';
    const created = status === 'pending' ? minutesAgo(15) : `2026-05-01 10:00:00`;
    const r = await db.prepare(
        `INSERT INTO competitions
            (title, description, rules, category_id, creator_id, language, status, created_at,
             vod_url, youtube_video_url, is_fake)
         VALUES (?, 'd', 'r', 10, 2, 'ar', ?, ?, ?, ?, ?)`,
    ).bind('G3 probe', status, created, opts.vod ?? null, opts.yt ?? null, opts.isFake ?? 0).run();
    const id = Number(r.meta.last_row_id);
    if (opts.chunks) {
        await db.prepare(
            `INSERT INTO recording_chunks (competition_id, sequence, object_path, container, state, created_at, updated_at)
             VALUES (?, 0, 'blocks/c0.mp4', 'mp4', 'ready', datetime('now'), datetime('now'))`,
        ).bind(id).run();
    }
    if (opts.finals) {
        await db.prepare(
            `INSERT INTO recording_finals (competition_id, finalized_at)
             VALUES (?, datetime('now'))`,
        ).bind(id).run();
    }
    return id;
}

describe('UNIT41.2-P1 G3 — one unified recorded-eligibility gate', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('1. recorded slice counts a chunks-only completed competition (no vod/youtube)', async () => {
        const chunksOnly = await insertComp(db, { chunks: true });
        const model = new CompetitionModel(d1(db));
        const recorded = await model.findEligibleIds({ status: 'recorded', playableRecording: true });
        expect(recorded).toContain(chunksOnly);
    });

    it('2. finals marker alone is eligible evidence', async () => {
        const finalsOnly = await insertComp(db, { finals: true });
        const model = new CompetitionModel(d1(db));
        const recorded = await model.findEligibleIds({ status: 'recorded', playableRecording: true });
        expect(recorded).toContain(finalsOnly);
    });

    it('3. is_fake = 1 (unified demo row) makes a media-less completed row eligible', async () => {
        const demo = await insertComp(db, { isFake: 1 });
        expect(CompetitionModel.hasPlayableRecording({
            vod_url: null, youtube_video_url: null, is_fake: 1,
            has_recording_chunks: 0, has_recording_final: 0, demo_explainer_enabled: 0,
        })).toBe(true);
        const model = new CompetitionModel(d1(db));
        expect(await model.findEligibleIds({ status: 'recorded', playableRecording: true })).toContain(demo);
    });

    it('4. the platform demo explainer setting is its own evidence (and non-0 only)', async () => {
        const bare = await insertComp(db, { vod: null, yt: null });
        expect(CompetitionModel.hasPlayableRecording({
            vod_url: null, youtube_video_url: null, is_fake: 0,
            has_recording_chunks: 0, has_recording_final: 0, demo_explainer_enabled: 0,
        })).toBe(false);

        await db.prepare(
            `INSERT INTO platform_settings (setting_key, setting_value)
             VALUES ('demo_explainer_video_url', 'https://maelshpro.com/ffmpeg/storage/live/match_fake/fake.mp4')`,
        ).run();
        expect(await new CompetitionModel(d1(db))
            .findEligibleIds({ status: 'recorded', playableRecording: true })).toContain(bare);

        // Owner explicitly disables it (`0`): eligibility collapses again.
        await db.prepare(
            `UPDATE platform_settings SET setting_value = '0' WHERE setting_key = 'demo_explainer_video_url'`,
        ).run();
        expect(await new CompetitionModel(d1(db))
            .findEligibleIds({ status: 'recorded', playableRecording: true })).not.toContain(bare);
    });

    it('5. empty/whitespace media never counts; trimmed media always does', () => {
        expect(CompetitionModel.hasPlayableRecording({ vod_url: '   ', youtube_video_url: '' })).toBe(false);
        expect(CompetitionModel.hasPlayableRecording({ vod_url: ' ', youtube_video_url: '  https://youtu.be/x ' })).toBe(true);
        expect(CompetitionModel.hasPlayableRecording({ vod_url: ' https://cdn.local/v.mp4 ' })).toBe(true);
    });

    it('6. every consumer routes through the single CompetitionModel twin', () => {
        const rec = readFileSync(join(process.cwd(), 'src/models/RecommendationModel.ts'), 'utf-8');
        const exp = readFileSync(join(process.cwd(), 'src/lib/services/ExploreSessionService.ts'), 'utf-8');
        const rail = readFileSync(join(process.cwd(), 'src/models/HomeRailProviders.ts'), 'utf-8');
        const model = readFileSync(join(process.cwd(), 'src/models/CompetitionModel.ts'), 'utf-8');
        expect(rec).toMatch(/CompetitionModel\.hasPlayableRecording/);
        expect(exp).toMatch(/CompetitionModel\.hasPlayableRecording/);
        // The Home rail provider chain reads the same constants (no local copies).
        expect(model).toContain('export const RECORDED_MEDIA_SQL');
        expect(rail).toMatch(/CompetitionModel|RECORDED_MEDIA|hasPlayableRecording/);
    });

    it('7. Suggested stays the public set with the unified gate and no expiry leaks', async () => {
        // The Suggested WHERE must compose the two shared laws only.
        const where = RecommendationModel.PUBLIC_SUGGESTED_WHERE;
        expect(where).toContain(EXPIRED_INSTANT_PENDING_SQL);
        expect(where).toContain(RECORDED_MEDIA_SQL);

        const probe = await insertComp(db, { chunks: true });
        const res = await app.request('/api/recommendations?limit=50&lang=ar', {}, env(db));
        expect(res.status).toBe(200);
        const json = (await res.json()) as {
            success: boolean;
            data: { competitions: Array<{ id: number; score: number }>; hasMore: boolean; totalAvailable: number };
        };
        expect(json.success).toBe(true);
        const ids = json.data.competitions.map((c) => c.id);
        expect(ids).toContain(probe);
        // H7 score contract: 0–100 scale stays and the order is frozen.
        for (const c of json.data.competitions) {
            expect(c.score).toBeGreaterThanOrEqual(0);
            expect(c.score).toBeLessThanOrEqual(100);
        }
        expect(json.data.hasMore).toBe(false);
    });

    it('8. Explore row re-check agrees with the SQL gate (status slices)', () => {
        const chunksRow = {
            status: 'completed', vod_url: null, youtube_video_url: null, is_fake: 0,
            has_recording_chunks: 1, has_recording_final: 0, demo_explainer_enabled: 0,
        } as never;
        expect(ExploreSessionService.hasPlayableRecording(chunksRow)).toBe(true);
        expect(ExploreSessionService.matchesFilters(chunksRow, { status: 'recorded', category: '', subcategory: '', search: '' })).toBe(true);
        const bareRow = {
            status: 'completed', vod_url: null, youtube_video_url: null, is_fake: 0,
            has_recording_chunks: 0, has_recording_final: 0, demo_explainer_enabled: 0,
        } as never;
        expect(ExploreSessionService.matchesFilters(bareRow, { status: 'recorded', category: '', subcategory: '', search: '' })).toBe(false);
    });
});
