/**
 * Competition Model
 * نموذج المنافسة
 * 
 * Handles all database operations for competitions.
 */

import { BaseModel, QueryOptions } from './base/BaseModel';
import type { Competition, CompetitionStatus } from '../config/types';
import { SyntheticRetirementService } from '../lib/services/SyntheticRetirementService';

/**
 * Competition filter options
 */
export interface CompetitionFilters {
    status?: CompetitionStatus | 'recorded' | 'upcoming';
    category?: string | number;
    subcategory?: string;
    /**
     * R3-EXPLORE-CONTEXT-1: when true, only rows with a playable recording
     * (trimmed vod_url OR youtube_video_url) match — the same media
     * predicate Home rails use for their recorded slice. Opt-in only, so the
     * legacy listing (which never sets it) is behaviour-identical.
     */
    playableRecording?: boolean;
    country?: string;
    language?: string;
    creatorId?: number;
    userId?: number; // جلب منافسات المستخدم كـ creator أو opponent
    search?: string;
    limit?: number;
    offset?: number;
}

/**
 * Competition with joined data
 */
export interface CompetitionWithDetails extends Competition {
    category_name_ar?: string;
    category_name_en?: string;
    category_slug?: string;
    category_icon?: string;
    category_color?: string;
    subcategory_name_ar?: string;
    subcategory_name_en?: string;
    subcategory_slug?: string;
    creator_name?: string;
    creator_avatar?: string;
    creator_username?: string;
    opponent_name?: string;
    opponent_avatar?: string;
    opponent_username?: string;
}

/**
 * Competition creation data
 */
export interface CreateCompetitionData {
    title: string;
    description?: string;
    rules: string;
    category_id: number;
    subcategory_id?: number;
    creator_id: number;
    language: string;
    country?: string;
    scheduled_at?: string;
    competition_type?: 'instant' | 'scheduled';
}

/**
 * Competition Model Class
 */
export class CompetitionModel extends BaseModel<Competition> {
    protected readonly tableName = 'competitions';

    /**
     * Find competition with all details
     */
    async findWithDetails(id: number): Promise<CompetitionWithDetails | null> {
        return this.queryOne<CompetitionWithDetails>(`
            SELECT c.*, 
                   cat.name_ar as category_name_ar,
                   cat.name_en as category_name_en,
                   cat.slug as category_slug,
                   cat.icon as category_icon,
                   COALESCE(subcat.color, cat.color) as category_color,
                   subcat.name_ar as subcategory_name_ar,
                   subcat.name_en as subcategory_name_en,
                   subcat.slug as subcategory_slug,
                   creator.display_name as creator_name,
                   creator.avatar_url as creator_avatar,
                   creator.username as creator_username,
                   opponent.display_name as opponent_name,
                   opponent.avatar_url as opponent_avatar,
                   opponent.username as opponent_username
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
            JOIN users creator ON c.creator_id = creator.id
            LEFT JOIN users opponent ON c.opponent_id = opponent.id
            WHERE c.id = ?
        `, id);
    }

    /**
     * Shared WHERE predicate for filtered competition listings.
     *
     * R3-B7: the SAME predicate feeds the legacy RANDOM() listing, the
     * session-build ID extraction, and the per-row eligibility re-check, so
     * the frozen snapshot and the live listing can never disagree on what
     * "eligible" means. No behaviour change to findByFilters.
     */
    private buildFilterWhere(filters: CompetitionFilters): { clause: string; params: Array<string | number> } {
        let clause = '';
        const params: Array<string | number> = [];

        // Status filter
        if (filters.status) {
            if (filters.status === 'recorded' || filters.status === 'completed') {
                clause += ' AND c.status = ?';
                params.push('completed');
            } else if (filters.status === 'live') {
                clause += ' AND c.status = ?';
                params.push('live');
            } else if (filters.status === 'pending') {
                // pending فقط (بانتظار خصم)
                clause += ' AND c.status = ?';
                params.push('pending');
            } else if (filters.status === 'accepted') {
                // accepted فقط (مجدولة)
                clause += ' AND c.status = ?';
                params.push('accepted');
            } else if (filters.status === 'upcoming') {
                // upcoming = pending + accepted (اللاحقة: فورية ومجدولة)
                clause += ' AND (c.status = ? OR c.status = ?)';
                params.push('pending', 'accepted');
            }
        }

        // Category filter
        if (filters.category) {
            clause += ' AND (c.category_id = ? OR c.subcategory_id = ? OR cat.slug = ?)';
            params.push(filters.category, filters.category, filters.category);
        }

        // Subcategory filter (filter by subcategory slug)
        if (filters.subcategory) {
            clause += ' AND subcat.slug = ?';
            params.push(filters.subcategory);
        }

        // Playable-recording gate (recorded slices only — see findHomeRailIds
        // for the rail twin of this predicate).
        if (filters.playableRecording) {
            clause += ` AND (NULLIF(TRIM(c.vod_url), '') IS NOT NULL OR NULLIF(TRIM(c.youtube_video_url), '') IS NOT NULL)`;
        }

        // Country filter
        if (filters.country) {
            clause += ' AND c.country = ?';
            params.push(filters.country);
        }

        // Language filter
        if (filters.language) {
            clause += ' AND c.language = ?';
            params.push(filters.language);
        }

        // Creator filter
        if (filters.creatorId) {
            clause += ' AND c.creator_id = ?';
            params.push(filters.creatorId);
        }

        // User filter (creator OR opponent)
        if (filters.userId) {
            clause += ' AND (c.creator_id = ? OR c.opponent_id = ?)';
            params.push(filters.userId, filters.userId);
        }

        // Search filter (R3-D1 h7-v1 layers need title OR description in the
        // eligible set; ranking into exact/prefix/partial happens in the
        // session provider, never here).
        if (filters.search) {
            clause += ' AND (c.title LIKE ? OR c.description LIKE ?)';
            params.push(`%${filters.search}%`, `%${filters.search}%`);
        }

        return { clause, params };
    }

    /**
     * The joined details SELECT shared by every filtered listing.
     */
    private static readonly DETAILS_SELECT = `
            SELECT c.*,
                   cat.name_ar as category_name_ar,
                   cat.name_en as category_name_en,
                   cat.slug as category_slug,
                   cat.icon as category_icon,
                   COALESCE(subcat.color, cat.color) as category_color,
                   subcat.slug as subcategory_slug,
                   creator.display_name as creator_name,
                   creator.avatar_url as creator_avatar,
                   creator.username as creator_username,
                   opponent.display_name as opponent_name,
                   opponent.avatar_url as opponent_avatar,
                   opponent.username as opponent_username
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
            JOIN users creator ON c.creator_id = creator.id
            LEFT JOIN users opponent ON c.opponent_id = opponent.id
            WHERE 1=1
        `;

    /**
     * Find competitions with filters (legacy compat surface, no callers in
     * ranked discovery — R3-D1 ranks via H7 sessions + CompetitionController.list).
     * Deterministic newest-first; never ORDER BY RANDOM().
     */
    async findByFilters(filters: CompetitionFilters): Promise<CompetitionWithDetails[]> {
        const { clause, params } = this.buildFilterWhere(filters);

        // Order and pagination
        const query = CompetitionModel.DETAILS_SELECT + clause + ' ORDER BY c.created_at DESC, c.id ASC LIMIT ? OFFSET ?';
        const allParams: Array<string | number> = [...params, filters.limit || 20, filters.offset || 0];

        return this.query<CompetitionWithDetails>(query, ...allParams);
    }

    /**
     * R3-B7: extract EVERY eligible competition id for the given filters.
     *
     * Same joins + same predicate as findByFilters, but with NO ORDER BY
     * RANDOM(), NO LIMIT/OFFSET and NO total cap — the caller (the shared
     * result-session service) freezes the order once. Returns ids only;
     * card hydration happens per page with a live eligibility re-check.
     */
    async findEligibleIds(filters: CompetitionFilters): Promise<number[]> {
        const { clause, params } = this.buildFilterWhere(filters);
        const query = `
            SELECT c.id as id
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
            JOIN users creator ON c.creator_id = creator.id
            LEFT JOIN users opponent ON c.opponent_id = opponent.id
            WHERE 1=1
        ` + clause;
        const rows = await this.query<{ id: number }>(query, ...params);
        return rows.map((row) => row.id);
    }

    /**
     * R3-RAILS-1B: extract EVERY eligible competition id for ONE Home rail.
     *
     * Same joins + same predicate as findByFilters (one definition of
     * “eligible”), with two rail-mandated narrowings, and NO ORDER BY
     * RANDOM(), NO LIMIT/OFFSET, NO total cap — the rail provider freezes the
     * order once at T0 via the shared result-session service:
     * - recorded slices additionally require a playable recording per the
     *   current media contract (trimmed vod_url OR youtube_video_url);
     *   completed rows without one are result-page rows, never rail cards.
     * - blocked creators (either direction, caller-loaded) never enter a
     *   logged-in rail snapshot.
     * Card hydration + live per-row re-check happen per page in the service.
     */
    async findHomeRailIds(options: {
        status: string;
        category?: string;
        subcategory?: string;
        excludeCreatorIds?: number[];
        /**
         * D1 hotfix: when the rail identity is known, block narrowing uses a
         * NOT EXISTS anti-join on user_blocks (both directions) instead of
         * expanding excludeCreatorIds into bound placeholders — the block list
         * is unbounded and the old NOT IN form exceeded D1's 100-bind hard
         * limit (rail 500). The anti-join reads the same rows, so NO blocked
         * creator becomes eligible at any list size. The array path below is
         * kept only for callers without an identity (guests always pass []);
         * identity callers must pass excludeUserId.
         */
        excludeUserId?: number | null;
    }): Promise<number[]> {
        const filters: CompetitionFilters = {};
        if (options.status !== '') {
            filters.status = options.status as CompetitionFilters['status'];
        }
        if (options.category !== undefined && options.category !== '') {
            filters.category = options.category;
        }
        if (options.subcategory !== undefined && options.subcategory !== '') {
            filters.subcategory = options.subcategory;
        }
        const { clause, params } = this.buildFilterWhere(filters);
        const extraParams: Array<string | number> = [];
        let extra = '';
        if (options.status === 'recorded') {
            extra += ` AND (NULLIF(TRIM(c.vod_url), '') IS NOT NULL OR NULLIF(TRIM(c.youtube_video_url), '') IS NOT NULL)`;
        }
        const excluded = [...new Set((options.excludeCreatorIds ?? []).filter((id) => Number.isInteger(id) && id > 0))];
        const excludeUserId = options.excludeUserId;
        if (typeof excludeUserId === 'number' && Number.isInteger(excludeUserId) && excludeUserId > 0) {
            extra += ` AND NOT EXISTS (
                SELECT 1 FROM user_blocks b
                 WHERE (b.blocker_id = ? AND b.blocked_id = c.creator_id)
                    OR (b.blocked_id = ? AND b.blocker_id = c.creator_id)
            )`;
            extraParams.push(excludeUserId, excludeUserId);
        } else if (excluded.length > 0) {
            extra += ` AND c.creator_id NOT IN (${excluded.map(() => '?').join(',')})`;
            extraParams.push(...excluded);
        }
        const query = `
            SELECT c.id as id
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
            JOIN users creator ON c.creator_id = creator.id
            LEFT JOIN users opponent ON c.opponent_id = opponent.id
            WHERE 1=1
        ` + clause + extra;
        const rows = await this.query<{ id: number }>(query, ...params, ...extraParams);
        return rows.map((row) => row.id);
    }

    /**
     * R3-B7: hydrate full card rows for an explicit id set.
     *
     * Batched (90 ids per statement) so the bound-parameter count stays
     * within the D1 per-statement budget. Result order is unspecified —
     * callers re-order against their frozen snapshot.
     */
    async findByIds(ids: number[]): Promise<CompetitionWithDetails[]> {
        const unique = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))];
        if (unique.length === 0) return [];
        const out: CompetitionWithDetails[] = [];
        for (let i = 0; i < unique.length; i += 90) {
            const batch = unique.slice(i, i + 90);
            const placeholders = batch.map(() => '?').join(',');
            const rows = await this.query<CompetitionWithDetails>(
                CompetitionModel.DETAILS_SELECT + ` AND c.id IN (${placeholders})`,
                ...batch
            );
            out.push(...rows);
        }
        return out;
    }

    /**
     * Find user's competitions.
     *
     * Post-R1 acceptance (contract C): returns the SAME joined shape as
     * findByFilters (the working competition listing) so the shared
     * getCompetitionCard renders identical identities/metadata here —
     * creator + opponent identity/avatars and category color/icon. Only the
     * ordering differs (newest-first for a profile shelf); B7 ranking/order
     * semantics are untouched.
     */
    async findByUser(userId: number, options: QueryOptions = {}): Promise<CompetitionWithDetails[]> {
        const { limit = 20, offset = 0 } = options;

        return this.query<CompetitionWithDetails>(`
            SELECT c.*,
                   cat.name_ar as category_name_ar,
                   cat.name_en as category_name_en,
                   cat.slug as category_slug,
                   cat.icon as category_icon,
                   COALESCE(subcat.color, cat.color) as category_color,
                   subcat.slug as subcategory_slug,
                   creator.display_name as creator_name,
                   creator.avatar_url as creator_avatar,
                   creator.username as creator_username,
                   opponent.display_name as opponent_name,
                   opponent.avatar_url as opponent_avatar,
                   opponent.username as opponent_username
            FROM competitions c
            JOIN categories cat ON c.category_id = cat.id
            LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
            JOIN users creator ON c.creator_id = creator.id
            LEFT JOIN users opponent ON c.opponent_id = opponent.id
            WHERE c.creator_id = ? OR c.opponent_id = ?
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `, userId, userId, limit, offset);
    }

    /**
     * Create competition
     */
    async create(data: CreateCompetitionData): Promise<Competition> {
        const result = await this.db.prepare(`
            INSERT INTO competitions (
                title, description, rules, category_id, subcategory_id,
                creator_id, language, country, scheduled_at, competition_type, status, is_fake, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, datetime('now'))
        `).bind(
            data.title,
            data.description || null,
            data.rules,
            data.category_id,
            data.subcategory_id || null,
            data.creator_id,
            data.language,
            data.country || null,
            data.scheduled_at || null,
            data.competition_type || 'instant'
        ).run();

        const created = (await this.findById(result.meta.last_row_id as number))!;
        // C7 synthetic lifecycle: a real competition retires one dependency-free
        // synthetic competition. Best-effort (see UserModel.create).
        try {
            await new SyntheticRetirementService(this.db).retireOneSyntheticCompetition();
        } catch (error) {
            console.error('[SyntheticRetirement] competition retire skipped:', error);
        }
        return created;
    }

    /**
     * Update competition
     */
    async update(id: number, data: Partial<Competition>): Promise<Competition | null> {
        const updates: string[] = [];
        const values: any[] = [];

        const allowedFields = ['title', 'description', 'rules', 'status', 'youtube_live_id', 'youtube_video_url'];

        for (const field of allowedFields) {
            if (data[field as keyof Competition] !== undefined) {
                updates.push(`${field} = ?`);
                values.push(data[field as keyof Competition]);
            }
        }

        if (updates.length === 0) return this.findById(id);

        updates.push('updated_at = datetime("now")');
        values.push(id);

        await this.db.prepare(
            `UPDATE competitions SET ${updates.join(', ')} WHERE id = ?`
        ).bind(...values).run();

        return this.findById(id);
    }

    /**
     * Set opponent
     */
    async setOpponent(id: number, opponentId: number): Promise<boolean> {
        const result = await this.db.prepare(
            'UPDATE competitions SET opponent_id = ?, status = "accepted" WHERE id = ? AND opponent_id IS NULL'
        ).bind(opponentId, id).run();
        return result.meta.changes > 0;
    }

    /**
     * Start competition (go live) - supports both YouTube and P2P
     */
    async startLive(id: number, options?: {
        youtubeLiveId?: string;
        liveUrl?: string;
    }): Promise<boolean> {
        const liveUrl = options?.liveUrl || null;
        const youtubeLiveId = options?.youtubeLiveId || null;

        // B5-1: guarded transition — only accepted -> live.
        // Capture the pre-state so environments where `meta.changes` is
        // unavailable (some local Wrangler CLI versions omit it for writes)
        // can still decide from real before/after state.
        const before = await this.db.prepare(
            'SELECT status FROM competitions WHERE id = ?'
        ).bind(id).first<{ status: string } | null>();

        const result = await this.db.prepare(`
            UPDATE competitions 
            SET status = 'live', 
                started_at = datetime('now'), 
                youtube_live_id = ?,
                live_url = ?,
                stream_status = 'live',
                stream_started_at = datetime('now')
            WHERE id = ? AND status = 'accepted'
        `).bind(youtubeLiveId, liveUrl, id).run();
        // Real D1/workers runtime: authoritative row-count signal.
        if (typeof result.meta?.changes === 'number' && result.meta.changes > 0) return true;
        if (typeof result.meta?.changes === 'number' && result.meta.changes === 0) return false;
        // Fallback (meta unavailable): true only on a real accepted -> live flip.
        const after = await this.db.prepare(
            'SELECT status FROM competitions WHERE id = ?'
        ).bind(id).first<{ status: string } | null>();
        return before?.status === 'accepted' && after?.status === 'live';
    }

    /**
     * End competition - supports both YouTube and P2P VOD
     */
    async complete(id: number, options?: {
        youtubeVideoUrl?: string;
        vodUrl?: string;
    }): Promise<boolean> {
        const vodUrl = options?.vodUrl || null;
        const youtubeVideoUrl = options?.youtubeVideoUrl || null;

        // B5-1: guarded transition — only live -> completed (see startLive).
        const before = await this.db.prepare(
            'SELECT status FROM competitions WHERE id = ?'
        ).bind(id).first<{ status: string } | null>();

        const result = await this.db.prepare(`
            UPDATE competitions 
            SET status = 'completed', 
                ended_at = datetime('now'), 
                youtube_video_url = ?,
                vod_url = ?,
                stream_status = 'ready',
                stream_ended_at = datetime('now')
            WHERE id = ? AND status = 'live'
        `).bind(youtubeVideoUrl, vodUrl, id).run();
        if (typeof result.meta?.changes === 'number' && result.meta.changes > 0) return true;
        if (typeof result.meta?.changes === 'number' && result.meta.changes === 0) return false;
        const after = await this.db.prepare(
            'SELECT status FROM competitions WHERE id = ?'
        ).bind(id).first<{ status: string } | null>();
        return before?.status === 'live' && after?.status === 'completed';
    }

    /**
     * Update stream status during processing
     */
    async updateStreamStatus(id: number, status: string): Promise<boolean> {
        const result = await this.db.prepare(
            'UPDATE competitions SET stream_status = ? WHERE id = ?'
        ).bind(status, id).run();
        return result.meta.changes > 0;
    }

    /**
     * Set VOD URL after finalization
     */
    async setVodUrl(id: number, vodUrl: string): Promise<boolean> {
        const result = await this.db.prepare(`
            UPDATE competitions 
            SET vod_url = ?, stream_status = 'ready' 
            WHERE id = ?
        `).bind(vodUrl, id).run();
        return result.meta.changes > 0;
    }

    /**
     * Increment views — H2 SSOT writer, one call per newly counted view.
     *
     * R3-D1-REM1 invariant: the ONLY caller is
     * WatchService.recordWatchIntent, and only when a new
     * (competition, identity, UTC-day) row is created in
     * `competition_views`. Never call from GET/polling/presence, analytics
     * aliases, or client-supplied durations — those paths delegate to (or
     * are denied by) the SSOT instead.
     */
    async incrementViews(id: number): Promise<void> {
        await this.db.prepare(
            'UPDATE competitions SET total_views = total_views + 1 WHERE id = ?'
        ).bind(id).run();
    }

    /**
     * Pending immediate competitions created by a user (no opponent yet).
     * منافسات فورية معلقة بلا خصم
     */
    async findPendingImmediateByCreator(
        creatorId: number,
        excludeCompetitionId: number
    ): Promise<Array<{ id: number; title: string }>> {
        const result = await this.db.prepare(`
            SELECT id, title FROM competitions 
            WHERE creator_id = ? AND id != ? AND scheduled_at IS NULL AND opponent_id IS NULL AND status = 'pending'
        `).bind(creatorId, excludeCompetitionId).all();
        return (result.results || []) as Array<{ id: number; title: string }>;
    }

    /**
     * Pending scheduled competitions that conflict (inside windowSeconds) with a slot.
     * منافسات مجدولة معلقة متعارضة زمنياً
     */
    async findPendingTimeConflicts(
        creatorId: number,
        excludeCompetitionId: number,
        scheduledAt: string,
        windowSeconds: number
    ): Promise<Array<{ id: number; title: string }>> {
        const result = await this.db.prepare(`
            SELECT id, title FROM competitions 
            WHERE creator_id = ? AND id != ? AND scheduled_at IS NOT NULL AND opponent_id IS NULL 
            AND ABS(strftime('%s', scheduled_at) - strftime('%s', ?)) < ?
        `).bind(creatorId, excludeCompetitionId, scheduledAt, windowSeconds).all();
        return (result.results || []) as Array<{ id: number; title: string }>;
    }

    /**
     * Delete the upload chunk keys bound to a competition (their lifetime is the
     * competition's live stream, so they are dropped when it ends).
     * حذف مفاتيح القطع عند انتهاء المنافسة
     */
    async deleteChunkKeys(competitionId: number): Promise<number> {
        const result = await this.db.prepare(
            'DELETE FROM chunk_keys WHERE competition_id = ?'
        ).bind(competitionId).run();
        return result.meta.changes;
    }

    // =====================================
    // Admin moderation operations (F-5D)
    // عمليات الإشراف الإداري
    // =====================================

    /**
     * Resolve the creator of a competition (F-5D moderation cascade).
     */
    async getCreatorId(competitionId: number): Promise<number | null> {
        const row = await this.db.prepare('SELECT creator_id FROM competitions WHERE id = ?')
            .bind(competitionId).first<{ creator_id: number }>();
        return row?.creator_id ?? null;
    }

    /**
     * Fetch the state needed to validate a broadcast suspension.
     */
    async getSuspendState(id: number): Promise<{
        id: number; title: string; status: string;
        creator_id: number; opponent_id: number | null;
    } | null> {
        return this.db.prepare(
            `SELECT id, title, status, creator_id, opponent_id FROM competitions WHERE id = ?`
        ).bind(id).first<{
            id: number; title: string; status: string;
            creator_id: number; opponent_id: number | null;
        }>();
    }

    /**
     * Fetch the state needed to validate a broadcast restore.
     */
    async getRestoreState(id: number): Promise<{ id: number; status: string } | null> {
        return this.db.prepare(
            `SELECT id, status FROM competitions WHERE id = ?`
        ).bind(id).first<{ id: number; status: string }>();
    }

    /**
     * Suspend a competition with a public tombstone reason (Task 9).
     * NEVER deletes the competition — retains full history.
     */
    async suspend(id: number, tombstoneReason: string): Promise<boolean> {
        const result = await this.db.prepare(`
                UPDATE competitions
                SET status = 'suspended',
                    auto_deleted_reason = ?,
                    updated_at = datetime('now')
                WHERE id = ?
            `).bind(tombstoneReason, id).run();
        return result.meta.changes > 0;
    }

    /**
     * Restore a suspended competition back to 'archived' (transparent, visible).
     */
    async restore(id: number, tombstoneReason: string): Promise<boolean> {
        const result = await this.db.prepare(`
                UPDATE competitions
                SET status = 'archived',
                    auto_deleted_reason = ?,
                    updated_at = datetime('now')
                WHERE id = ?
            `).bind(tombstoneReason, id).run();
        return result.meta.changes > 0;
    }

    /**
     * Record a suspension in competition_suspensions.
     */
    async recordSuspension(competitionId: number, adminId: number, reason: string): Promise<boolean> {
        const result = await this.db.prepare(`
                INSERT INTO competition_suspensions (competition_id, admin_id, reason)
                VALUES (?, ?, ?)
            `).bind(competitionId, adminId, reason).run();
        return result.meta.changes > 0;
    }

    /**
     * Mark the open suspension record as restored.
     */
    async markSuspensionRestored(competitionId: number, adminId: number): Promise<boolean> {
        const result = await this.db.prepare(`
                UPDATE competition_suspensions
                SET restored_at = datetime('now'), restored_by = ?
                WHERE competition_id = ? AND restored_at IS NULL
            `).bind(adminId, competitionId).run();
        return result.meta.changes > 0;
    }

    /**
     * Delete a competition and its dependent rows (moderation cascade).
     *
     * R4-EVENTS-NOTIFY-1 REMEDIATION (P1): full dependent survey + atomicity.
     * Dependent map (migrations/0001–0007, FK ON):
     *   - deleted here (no ON DELETE action, competition-owned): requests,
     *     invitations, legacy invites (defensive — no writers left), ratings,
     *     comments, chunk_keys, scheduled_tasks, scheduled_competitions,
     *     suspensions, hidden flags. Order: dependents first, competition last.
     *   - deleted by the DB itself (ON DELETE CASCADE — no code): likes,
     *     dislikes, reminders, watch_history, watch_later, views,
     *     heartbeats, revenue logs. SET NULL likewise (donations,
     *     users.current_competition_id, financial logs).
     *   - NEVER deleted here (history, no FK): notifications, reports.
     * All statements run in ONE db.batch() — a single serialized write
     * transaction — so the delete either fully applies or fully rolls back;
     * a mid-delete failure can never leave a partially-deleted competition.
     */
    async deleteCascade(competitionId: number): Promise<boolean> {
        const statements = [
            'DELETE FROM competition_requests WHERE competition_id = ?',
            'DELETE FROM competition_invitations WHERE competition_id = ?',
            'DELETE FROM competition_invites WHERE competition_id = ?',
            'DELETE FROM ratings WHERE competition_id = ?',
            'DELETE FROM comments WHERE competition_id = ?',
            'DELETE FROM chunk_keys WHERE competition_id = ?',
            'DELETE FROM competition_scheduled_tasks WHERE competition_id = ?',
            'DELETE FROM scheduled_competitions WHERE competition_id = ?',
            'DELETE FROM competition_suspensions WHERE competition_id = ?',
            'DELETE FROM user_hidden_competitions WHERE competition_id = ?',
            'DELETE FROM competitions WHERE id = ?',
        ].map((sql) => this.db.prepare(sql).bind(competitionId));
        await this.db.batch(statements);
        return true;
    }
}

export default CompetitionModel;
