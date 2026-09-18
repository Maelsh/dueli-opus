/**
 * @file src/lib/services/ScheduledTaskService.ts
 * @description Cron-driven scheduled task processor with strict lifecycle timers
 * @module lib/services
 *
 * Task 8: Competition Lifecycle & Strict Timers
 * - Rule A (Instant): "Instant" open competitions deleted entirely (with requests) if 1 hour passes without an opponent
 * - Rule B (Scheduled): "Scheduled" open competitions free the creator and cancel if 1 hour passes post-schedule without starting
 * - Rule C (Live Limit): Live broadcasts auto-terminate after exactly 2 hours max
 */

export class ScheduledTaskService {
    constructor(private db: D1Database) { }

    /**
     * T1.5: Finalize a completed competition:
     * aggregate viewer ratings → winner_id → ELO → automatic payouts.
     *
     * B12: aggregates + winner + one-time ELO now run through the atomic
     * db.batch() in updateAggregatesAfterVote (ELO applied at most once
     * per competition, enforced by the DB via competitions.elo_applied_at).
     * Only the financial finalization (finalize_payouts — untouched) is
     * added on top.
     */
    async finalizeCompetition(competitionId: number): Promise<{ winnerId: number | null }> {
        const { LivePayoutEngine } = await import('./LivePayoutEngine');

        // Atomic aggregates + winner + one-time ELO (idempotent)
        await this.updateAggregatesAfterVote(competitionId);

        const row = await this.db.prepare(`
            SELECT winner_id FROM competitions WHERE id = ?
        `).bind(competitionId).first<any>();

        try {
            await new LivePayoutEngine(this.db).finalizePayouts(competitionId);
        } catch (e) {
            console.error(`[Finalize] Payout failed for #${competitionId}:`, e);
        }

        return { winnerId: row?.winner_id ?? null };
    }

    /**
     * Schedule a new task
     */
    async schedule(
        competitionId: number,
        taskType: string,
        executeAt: Date
    ): Promise<number> {
        const result = await this.db.prepare(`
            INSERT INTO competition_scheduled_tasks
            (competition_id, task_type, execute_at, status, created_at)
            VALUES (?, ?, ?, 'pending', datetime('now'))
        `).bind(competitionId, taskType, executeAt.toISOString()).run();
        return result.meta.last_row_id as number;
    }

    /**
     * Cancel a pending task
     */
    async cancel(competitionId: number, taskType: string): Promise<void> {
        await this.db.prepare(`
            UPDATE competition_scheduled_tasks
            SET status = 'completed', result_message = 'Cancelled'
            WHERE competition_id = ? AND task_type = ? AND status = 'pending'
        `).bind(competitionId, taskType).run();
    }

    /**
     * Process all pending tasks that are due
     * Called by cron every minute
     */
    async processPendingTasks(): Promise<{ processed: number; errors: number }> {
        let processed = 0;
        let errors = 0;

        const tasks = await this.db.prepare(`
            SELECT t.*, c.status as competition_status, c.creator_id, c.opponent_id,
                   c.competition_type, c.scheduled_at, c.started_at, c.created_at as competition_created_at
            FROM competition_scheduled_tasks t
            JOIN competitions c ON t.competition_id = c.id
            WHERE datetime(t.execute_at) <= datetime('now')
            AND t.status = 'pending'
            ORDER BY datetime(t.execute_at) ASC
            LIMIT 50
        `).all();

        for (const task of tasks.results as any[]) {
            try {
                await this.executeTask(task);
                processed++;
            } catch (error) {
                errors++;
                await this.db.prepare(`
                    UPDATE competition_scheduled_tasks
                    SET status = 'failed',
                        result_message = ?,
                        executed_at = datetime('now')
                    WHERE id = ?
                `).bind((error as Error).message, task.id).run();
            }
        }

        return { processed, errors };
    }

    /**
     * Execute a single task based on its type
     */
    private async executeTask(task: any): Promise<void> {
        switch (task.task_type) {
            case 'auto_delete_if_not_live':
                await this.handleAutoDelete(task);
                break;
            case 'auto_end_live':
                await this.handleAutoEnd(task);
                break;
            case 'send_reminder':
                await this.handleReminder(task);
                break;
            case 'distribute_earnings':
            case 'finalize_payouts':
                // T1.5: ratings-based automatic distribution (replaces blind 35/35/30)
                await this.finalizeCompetition(task.competition_id);
                break;
            case 'recalc_aggregates':
                // B12: durable retry for a failed aggregate/ELO batch —
                // updateAggregatesAfterVote is idempotent, so re-running is safe.
                await this.updateAggregatesAfterVote(task.competition_id);
                break;
            case 'check_disconnection':
                await this.handleDisconnectionCheck(task);
                break;
            default:
                throw new Error(`Unknown task type: ${task.task_type}`);
        }

        await this.db.prepare(`
            UPDATE competition_scheduled_tasks
            SET status = 'completed', executed_at = datetime('now'), result_message = 'Success'
            WHERE id = ?
        `).bind(task.id).run();
    }

    /**
     * ====================================================================
     * F-6: Single Source of Truth for Competition lifecycle operations.
     *
     * CronHandler.handleLifecycleTimers (scan-driven, for competitions with
     * no scheduled-task rows) and the private task handlers below
     * (task-driven) both used to carry their own raw-SQL copies of these
     * operations, which had drifted apart. The operations themselves now
     * live ONLY here; callers keep their own trigger eligibility (scan
     * queries / task due times) and delegate the transition + side effects
     * to these methods.
     * ====================================================================
     */

    /**
     * Rule A (Instant): delete an instant competition that never got an
     * opponent. Order: requests → invitations → competition → free creator
     * → notify creator.
     */
    async expireInstantWithoutOpponent(competitionId: number): Promise<void> {
        const competition = await this.db.prepare(`
            SELECT id, creator_id, opponent_id, competition_type, status, created_at
            FROM competitions WHERE id = ?
        `).bind(competitionId).first() as any;

        if (!competition) return;

        await this.db.prepare(`
            DELETE FROM competition_requests WHERE competition_id = ?
        `).bind(competitionId).run();

        await this.db.prepare(`
            DELETE FROM competition_invitations WHERE competition_id = ?
        `).bind(competitionId).run();

        // Clean up any scheduled tasks before deleting the competition
        // (necessary when FK enforcement is ON: competition_scheduled_tasks
        // references competitions.id without ON DELETE CASCADE)
        await this.db.prepare(`
            DELETE FROM competition_scheduled_tasks WHERE competition_id = ?
        `).bind(competitionId).run();

        await this.db.prepare(`
            DELETE FROM competitions WHERE id = ?
        `).bind(competitionId).run();

        await this.db.prepare(`
            UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
            WHERE id = ?
        `).bind(competition.creator_id).run();

        await this.db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                        VALUES (?, 'system', 'Competition Deleted', 'Your instant competition was deleted because no opponent joined within 1 hour.', 'competition', ?, datetime('now'))
                `).bind(competition.creator_id, competitionId).run();
    }

    /**
     * Rule B (Scheduled, no opponent): free the creator, cancel with reason
     * 'scheduled_no_opponent_1hr', delete requests/invitations and notify the
     * creator. No-op if scheduled_at is missing or less than 1 hour past.
     */
    async cancelScheduledWithoutOpponent(competitionId: number): Promise<void> {
        const competition = await this.db.prepare(`
            SELECT id, creator_id, scheduled_at FROM competitions WHERE id = ?
        `).bind(competitionId).first() as any;

        if (!competition || !competition.scheduled_at) return;

        const scheduledTime = new Date(competition.scheduled_at).getTime();
        if ((Date.now() - scheduledTime) / (1000 * 60 * 60) < 1) return;

        await this.db.prepare(`
            UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
            WHERE id = ?
        `).bind(competition.creator_id).run();

        await this.db.prepare(`
            UPDATE competitions SET status = 'cancelled', auto_deleted_reason = 'scheduled_no_opponent_1hr', updated_at = datetime('now') WHERE id = ?
        `).bind(competitionId).run();

        await this.db.prepare(`
            DELETE FROM competition_requests WHERE competition_id = ?
        `).bind(competitionId).run();

        await this.db.prepare(`
            DELETE FROM competition_invitations WHERE competition_id = ?
        `).bind(competitionId).run();

        await this.db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
            VALUES (?, 'system', 'Competition Cancelled', 'Your scheduled competition was cancelled because no opponent joined within 1 hour of the scheduled time.', 'competition', ?, datetime('now'))
                `).bind(competition.creator_id, competitionId).run();
    }

    /**
     * Rule B (Scheduled, has opponent but not started): free all bound users,
     * cancel with reason 'scheduled_not_started_1hr' and notify both
     * participants. No-op if scheduled_at is missing or less than 1 hour past.
     */
    async cancelScheduledNotStarted(competitionId: number): Promise<void> {
        const competition = await this.db.prepare(`
            SELECT id, creator_id, opponent_id, scheduled_at FROM competitions WHERE id = ?
        `).bind(competitionId).first() as any;

        if (!competition || !competition.scheduled_at) return;

        const scheduledTime = new Date(competition.scheduled_at).getTime();
        if ((Date.now() - scheduledTime) / (1000 * 60 * 60) < 1) return;

        await this.db.prepare(`
            UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
            WHERE current_competition_id = ?
        `).bind(competitionId).run();

        await this.db.prepare(`
            UPDATE competitions SET status = 'cancelled', auto_deleted_reason = 'scheduled_not_started_1hr', updated_at = datetime('now') WHERE id = ?
        `).bind(competitionId).run();

        const userIds = [competition.creator_id, competition.opponent_id].filter(Boolean);
        for (const userId of userIds) {
            await this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', 'Competition Cancelled', 'The scheduled competition was cancelled because it did not start within 1 hour of the scheduled time.', 'competition', ?, datetime('now'))
            `).bind(userId, competitionId).run();
        }
    }

    /**
     * Rule C (Live limit): complete a live competition that has been live for
     * at least `minLiveHours` hours: set completed + 'live_max_2hr', free all
     * bound users, delete chunk_keys and notify both participants.
     * Returns true if the competition was ended. The threshold is supplied by
     * the trigger (scan path: 2h exact; scheduled-task path: 1.9h skew
     * tolerance) — the operation itself is shared.
     */
    async endLiveMaxDuration(competitionId: number, minLiveHours: number = 2): Promise<boolean> {
        const competition = await this.db.prepare(`
            SELECT id, creator_id, opponent_id, started_at FROM competitions WHERE id = ?
        `).bind(competitionId).first() as any;

        if (!competition) return false;

        if (competition.started_at) {
            const startedAt = new Date(competition.started_at).getTime();
            const hoursLive = (Date.now() - startedAt) / (1000 * 60 * 60);
            if (hoursLive < minLiveHours) return false;
        }

        await this.db.prepare(`
            UPDATE competitions
            SET status = 'completed', ended_at = datetime('now'), updated_at = datetime('now'),
                auto_deleted_reason = 'live_max_2hr'
            WHERE id = ?
        `).bind(competitionId).run();

        await this.db.prepare(`
            UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
            WHERE current_competition_id = ?
        `).bind(competitionId).run();

        await this.db.prepare(`
            DELETE FROM chunk_keys WHERE competition_id = ?
        `).bind(competitionId).run();

        const userIds = [competition.creator_id, competition.opponent_id].filter(Boolean);
        for (const userId of userIds) {
            await this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', 'Competition Ended', 'The live competition was automatically ended after reaching the 2-hour maximum duration.', 'competition', ?, datetime('now'))
            `).bind(userId, competitionId).run();
        }

        return true;
    }


    /**
     * Rule A (Instant): "Instant" open competitions get deleted entirely
     * (with requests) if 1 hour passes without an opponent.
     */
    private async handleAutoDelete(task: any): Promise<void> {
        if (task.competition_status === 'live' || task.competition_status === 'completed') {
            return;
        }

        const competition = await this.db.prepare(`
            SELECT id, creator_id, opponent_id, competition_type, status, created_at
            FROM competitions WHERE id = ?
        `).bind(task.competition_id).first() as any;

        if (!competition) return;

        if (competition.competition_type === 'instant' && !competition.opponent_id) {
            // Rule A: Instant competition without opponent for 1 hour -> DELETE entirely
            await this.expireInstantWithoutOpponent(competition.id);
        } else if (competition.competition_type === 'scheduled' && !competition.opponent_id) {
            // Rule B: Scheduled competition - free the creator and cancel if 1 hour passes post-schedule
            await this.cancelScheduledWithoutOpponent(competition.id);
        } else if (competition.opponent_id && competition.status !== 'live' && competition.status !== 'completed') {
            // Has opponent but hasn't started - cancel after 1 hour post-schedule
            await this.cancelScheduledNotStarted(competition.id);
        } else {
            // Generic: cancel old pending competitions
            await this.db.prepare(`
                UPDATE competitions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?
            `).bind(task.competition_id).run();

            const userIds = [competition.creator_id, competition.opponent_id].filter(Boolean);
            for (const userId of userIds) {
                await this.db.prepare(`
                    INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                    VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
                `).bind(
                    userId,
                    'Competition Cancelled',
                    'The competition was cancelled because it did not start in time.',
                    task.competition_id
                ).run();
            }

            await this.db.prepare(`
                UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
                WHERE current_competition_id = ?
            `).bind(task.competition_id).run();
        }
    }

    /**
     * Rule C (Live Limit): Live broadcasts auto-terminate after exactly 2 hours max
     */
    private async handleAutoEnd(task: any): Promise<void> {
        if (task.competition_status !== 'live') {
            return;
        }

        await this.endLiveMaxDuration(task.competition_id, 1.9);
    }

    /**
     * Send reminder notification
     */
    private async handleReminder(task: any): Promise<void> {
        const userIds = [task.creator_id, task.opponent_id].filter(Boolean);
        for (const userId of userIds) {
            await this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
            `).bind(
                userId,
                'Competition Reminder',
                'The competition will start soon!',
                task.competition_id
            ).run();
        }
    }

    /**
     * T1.5: Recompute aggregates/winner/ELO/payout-split after each new vote
     * (lightweight — does NOT credit earnings; that happens once via finalize_payouts)
     *
     * B12 — atomicity & ELO idempotency:
     * - All writes (aggregates + winner_id + ELO + elo_applied_at claim) run in
     *   ONE db.batch() — D1 executes a batch as a single serialized transaction,
     *   so no interleaved run() sequence can produce a torn state.
     * - ELO is applied at most once per competition, enforced INSIDE the
     *   database (not JavaScript): the user-rating writes are guarded by
     *   `(SELECT elo_applied_at FROM competitions WHERE id = ?) IS NULL` and the
     *   claim itself is `UPDATE competitions SET elo_applied_at = ? WHERE id = ?
     *   AND elo_applied_at IS NULL`. A concurrent duplicate batch (serialized
     *   after the first) finds the claim set and its guarded writes match 0 rows.
     * - Draw rule (documented in docs/05): equal averages (including both zero
     *   or missing opponent) → winner_id = NULL and the draw ELO rule
     *   (0.5 / 0.5) applies once.
     * - Failure handling: if the batch fails, the vote (caller) still succeeds;
     *   the failure is logged and a `recalc_aggregates` scheduled task is
     *   recorded as a durable retry (executed by processPendingTasks).
     */
    async updateAggregatesAfterVote(competitionId: number): Promise<void> {
        const { LivePayoutEngine } = await import('./LivePayoutEngine');
        const { computeEloChange } = await import('./EloRatingService');
        const { isWindowOpen } = await import('../../models/RatingModel');

        const competition = await this.db.prepare(`
            SELECT id, creator_id, opponent_id, status, ended_at, elo_applied_at FROM competitions WHERE id = ?
        `).bind(competitionId).first<any>();

        if (!competition || competition.status !== 'completed') return;

        const agg = await this.db.prepare(`
            SELECT
                AVG(CASE WHEN competitor_id = ? THEN rating END) as creator_avg,
                AVG(CASE WHEN competitor_id = ? THEN rating END) as opponent_avg
            FROM ratings WHERE competition_id = ?
        `).bind(competition.creator_id, competition.opponent_id ?? -1, competitionId).first<any>();

        const creatorAvg = agg?.creator_avg || 0;
        const opponentAvg = agg?.opponent_avg || 0;
        const parts = (creatorAvg > 0 ? 1 : 0) + (opponentAvg > 0 ? 1 : 0);
        const overallAvg = parts > 0 ? (creatorAvg + opponentAvg) / parts : 0;

        // B12 draw rule: tie (equal averages, including both zero) or missing
        // opponent => explicit winner_id = NULL (never left implicit).
        let winnerId: number | null = null;
        if (competition.opponent_id) {
            if (creatorAvg > opponentAvg) winnerId = competition.creator_id;
            else if (opponentAvg > creatorAvg) winnerId = competition.opponent_id;
        }

        // B12: ELO is finalized only once the rating window (ended_at + 24h,
        // B10) has closed — until then aggregates/winner_id stay provisional
        // and ELO is not claimed, so a later vote/withdrawal can never leave
        // the ELO inconsistent with the final result. Legacy rows without
        // ended_at have no applicable window (isWindowOpen(null) === true) so
        // their ELO stays untouched, same as their rating window.
        const resultFinal = !isWindowOpen(competition.ended_at ?? null, Date.now());

        try {
            await this.applyAggregatesAndEloOnce(competition, creatorAvg, opponentAvg, overallAvg, winnerId, computeEloChange, resultFinal);
        } catch (e) {
            // B12: do NOT swallow silently and do NOT fail the vote — record a
            // durable scheduled retry instead. processPendingTasks re-runs this
            // method (idempotent) until aggregates + ELO land.
            console.error(`[Vote] Aggregate/ELO batch failed for #${competitionId}:`, e);
            try {
                await this.schedule(competitionId, 'recalc_aggregates', new Date(Date.now() + 60 * 1000));
            } catch (scheduleError) {
                console.error(`[Vote] Failed to schedule recalc_aggregates retry for #${competitionId}:`, scheduleError);
            }
        }

        try {
            await new LivePayoutEngine(this.db).recalculatePayouts(competitionId);
        } catch (e) {
            console.error(`[Vote] Payout recalc failed for #${competitionId}:`, e);
        }
    }

    /**
     * B12: single atomic db.batch() — aggregates + one-time ELO.
     * Statement order inside the batch mirrors SQLite's sequential execution:
     * the guarded user-rating writes run while elo_applied_at is still NULL,
     * then the claim sets it. A later serialized duplicate finds it set and
     * its guarded writes match 0 rows.
     */
    private async applyAggregatesAndEloOnce(
        competition: { id: number; creator_id: number; opponent_id: number | null },
        creatorAvg: number,
        opponentAvg: number,
        overallAvg: number,
        winnerId: number | null,
        computeElo: (a: number, b: number, w: number | null, c: number, o: number, k?: number) => { creator: number; opponent: number },
        resultFinal: boolean
    ): Promise<void> {
        const statements: D1PreparedStatement[] = [
            this.db.prepare(`
                UPDATE competitions
                SET creator_rating = ?, opponent_rating = ?, average_rating = ?, winner_id = ?
                WHERE id = ?
            `).bind(creatorAvg, opponentAvg, overallAvg, winnerId, competition.id),
        ];

        if (resultFinal && competition.opponent_id) {
            const creator = await this.db.prepare(`
                SELECT id, elo_rating FROM users WHERE id = ?
            `).bind(competition.creator_id).first<any>();
            const opponent = await this.db.prepare(`
                SELECT id, elo_rating FROM users WHERE id = ?
            `).bind(competition.opponent_id).first<any>();
            const next = computeElo(
                creator?.elo_rating || 1500,
                opponent?.elo_rating || 1500,
                winnerId,
                competition.creator_id,
                competition.opponent_id
            );
            // One-time ELO, guarded inside SQL (never a JS pre-check):
            statements.push(this.db.prepare(`
                UPDATE users SET elo_rating = ?
                WHERE id = ? AND (SELECT elo_applied_at FROM competitions WHERE id = ?) IS NULL
            `).bind(next.creator, competition.creator_id, competition.id));
            statements.push(this.db.prepare(`
                UPDATE users SET elo_rating = ?
                WHERE id = ? AND (SELECT elo_applied_at FROM competitions WHERE id = ?) IS NULL
            `).bind(next.opponent, competition.opponent_id, competition.id));
            // The claim itself — wins exactly once across all invocations.
            statements.push(this.db.prepare(`
                UPDATE competitions SET elo_applied_at = ?
                WHERE id = ? AND elo_applied_at IS NULL
            `).bind(new Date().toISOString(), competition.id));
        }

        await this.db.batch(statements);
    }

    /**
     * Check for disconnections via heartbeat
     */
    private async handleDisconnectionCheck(task: any): Promise<void> {
        if (task.competition_status !== 'live') return;

        const stale = await this.db.prepare(`
            SELECT user_id FROM competition_heartbeats
            WHERE competition_id = ?
            AND last_seen < datetime('now', '-2 minutes')
        `).bind(task.competition_id).all();

        if (stale.results.length >= 2) {
            await this.handleAutoEnd(task);
        }
    }

    /**
     * Cleanup expired requests (TTL 24 hours)
     */
    async cleanupExpiredRequests(): Promise<number> {
        const result = await this.db.prepare(`
            UPDATE competition_requests
            SET status = 'expired', updated_at = datetime('now')
            WHERE status = 'pending'
            AND created_at < datetime('now', '-24 hours')
        `).run();
        return result.meta.changes;
    }

    /**
     * Cleanup old notifications (30+ days, read)
     */
    async cleanupOldNotifications(): Promise<number> {
        const result = await this.db.prepare(`
            DELETE FROM notifications
            WHERE created_at < datetime('now', '-30 days')
            AND is_read = 1
        `).run();
        return result.meta.changes;
    }

    /**
     * Cleanup stale heartbeats
     */
    async cleanupStaleHeartbeats(): Promise<number> {
        const result = await this.db.prepare(`
            DELETE FROM competition_heartbeats
            WHERE last_seen < datetime('now', '-1 hour')
        `).run();
        return result.meta.changes;
    }

    /**
     * Get the timer deadline for a competition based on its type and status
     * Used by the API to provide countdown info to the frontend
     */
    static getTimerDeadline(competition: {
        competition_type: string;
        status: string;
        created_at: string;
        scheduled_at: string | null;
        started_at: string | null;
    }): { type: string; deadline: string | null; labelKey: string } | null {
        if (competition.status === 'pending' || competition.status === 'accepted') {
            if (competition.competition_type === 'instant') {
                // Rule A: Instant - 1 hour from creation without opponent
                const createdAt = new Date(competition.created_at).getTime();
                const deadline = new Date(createdAt + 60 * 60 * 1000);
                return {
                    type: 'instant_join',
                    deadline: deadline.toISOString(),
                    labelKey: 'timers.time_to_join'
                };
            } else if (competition.competition_type === 'scheduled' && competition.scheduled_at) {
                // Rule B: Scheduled - 1 hour after scheduled time without starting
                const scheduledAt = new Date(competition.scheduled_at).getTime();
                const deadline = new Date(scheduledAt + 60 * 60 * 1000);
                return {
                    type: 'scheduled_start',
                    deadline: deadline.toISOString(),
                    labelKey: 'timers.time_to_start'
                };
            }
        } else if (competition.status === 'live' && competition.started_at) {
            // Rule C: Live - 2 hours max
            const startedAt = new Date(competition.started_at).getTime();
            const deadline = new Date(startedAt + 2 * 60 * 60 * 1000);
            return {
                type: 'live_max',
                deadline: deadline.toISOString(),
                labelKey: 'timers.broadcast_ends_in'
            };
        }

        return null;
    }
}

export default ScheduledTaskService;
