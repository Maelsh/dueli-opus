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

import { t } from '../../i18n';

/**
 * Result of one aggregates/ELO pass.
 *
 * - `settled`: the atomic batch committed, so `winner_id` in the row is the
 *   computed result (final when `final` is true).
 * - `final`: the competition was already completed (not a live provisional
 *   vote pass).
 * - `finalClaimed`: this call won the one-time `elo_applied_at` claim. It is
 *   the only call allowed to announce the settled final result, which makes
 *   concurrent finalizes and retries converge on exactly one final event.
 */
export interface AggregateUpdateResult {
    settled: boolean;
    final: boolean;
    finalClaimed: boolean;
    winnerId: number | null;
}

export class ScheduledTaskService {
    constructor(private db: D1Database) { }

    /**
     * R2-V: finalize a cutoff competition (status already completed):
     * final aggregates → winner_id → one-time ELO → one-time payouts.
     *
     * The cutoff (guarded live->completed) ALWAYS happens first in the
     * caller (end/complete or endLiveMaxDuration) — from there on every
     * rating write is rejected, so this method observes the frozen tally.
     * Idempotent: aggregates+ELO run through the atomic DB-claimed batch in
     * updateAggregatesAfterVote, payouts through the claimed ledger tx in
     * LivePayoutEngine.finalizePayouts. Concurrent ends, retries and
     * duplicate finalize_payouts tasks all converge to exactly one effect.
     * Formulas (winner/ELO/20-80) are untouched — only timing moved to cutoff.
     */
    async finalizeCompetition(competitionId: number): Promise<{ winnerId: number | null; settled: boolean }> {
        const { LivePayoutEngine } = await import('./LivePayoutEngine');

        // Final aggregates + winner + one-time ELO (idempotent).
        // For a completed competition updateAggregatesAfterVote finalizes ELO.
        // `settled` is false when the atomic batch failed: in that case the
        // durable recalc_aggregates retry owns the final settlement and the
        // final event must NOT be published here.
        const settlement = await this.updateAggregatesAfterVote(competitionId);

        let winnerId: number | null = null;
        try {
            const row = await this.db.prepare(`
                SELECT winner_id FROM competitions WHERE id = ?
            `).bind(competitionId).first<{ winner_id: number | null }>();
            // A failed pass may leave a provisional live winner in the row;
            // never return it as a final result.
            winnerId = settlement.settled ? row?.winner_id ?? null : null;
        } catch (e) {
            // The final event re-reads the row; a failed read here must not
            // suppress the settled announcement below.
            console.error(`[Finalize] Winner read failed for #${competitionId}:`, e);
        }

        try {
            await new LivePayoutEngine(this.db).finalizePayouts(competitionId);
        } catch (e) {
            // Durable retry: the finalize_payouts task re-runs this whole
            // method (idempotent), so a transient ledger failure recovers.
            console.error(`[Finalize] Payout failed for #${competitionId}:`, e);
            try {
                await this.schedule(competitionId, 'finalize_payouts', new Date(Date.now() + 60 * 1000));
            } catch (scheduleError) {
                console.error(`[Finalize] Failed to schedule payout retry for #${competitionId}:`, scheduleError);
            }
        }

        // Codex P2 / UNIT30.4 remediation: the terminal event may already have
        // gone out as result_pending. Only the invocation that actually
        // committed the final aggregates+ELO (the one-time elo_applied_at
        // claim) may emit result_pending:false. A failed batch or a losing
        // concurrent finalize stays pending and publishes nothing.
        if (settlement.settled && settlement.final && settlement.finalClaimed) {
            await this.publishFinalCompetitionStatus(competitionId);
        }
        return { winnerId, settled: settlement.settled };
    }

    private async publishFinalCompetitionStatus(competitionId: number): Promise<boolean> {
        try {
            const row = await this.db.prepare(`
                SELECT status, ended_at, ended_early, result_source, winner_id
                FROM competitions WHERE id = ?
            `).bind(competitionId).first<{
                status: string;
                ended_at: string | null;
                ended_early: number | null;
                result_source: string | null;
                winner_id: number | null;
            }>();
            if (!row || row.status !== 'completed') return false;
            const { EventPusher } = await import('./EventPusher');
            await new EventPusher(this.db).publishCompetitionStatus(competitionId, {
                status: 'completed',
                ended_at: row.ended_at ?? null,
                early_end: !!row.ended_early,
                result_source: row.result_source ?? null,
                winner_id: row.winner_id ?? null,
                result_pending: false,
                updated_at: new Date().toISOString(),
            });
            return true;
        } catch (e) {
            // SSE is display metadata; the persisted row remains authoritative.
            console.error(`[Finalize] Final status publish failed for #${competitionId}:`, e);
            return false;
        }
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
            case 'recalc_aggregates': {
                // B12: durable retry for a failed aggregate/ELO batch —
                // updateAggregatesAfterVote is idempotent, so re-running is safe.
                // UNIT30.4 remediation: a successful retry must also emit the
                // final event that the failed finalize could not publish. The
                // one-time ELO claim makes this exactly once across retries.
                const settlement = await this.updateAggregatesAfterVote(task.competition_id);
                if (settlement.settled && settlement.final && settlement.finalClaimed) {
                    await this.publishFinalCompetitionStatus(task.competition_id);
                }
                break;
            }
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

        // F-7: user-facing notification copy goes through i18n (stored snapshot
        // stays English via t(key, 'en'), so lifecycle/SQL behavior is unchanged).
        await this.db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                        VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
                `).bind(
                    competition.creator_id,
                    t('notification.comp_deleted_title', 'en'),
                    t('notification.comp_deleted', 'en'),
                    competitionId
                ).run();
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

        // F-7: i18n (stored snapshot stays English; behavior unchanged).
        await this.db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
            VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
                `).bind(
                    competition.creator_id,
                    t('notification.comp_cancelled', 'en'),
                    t('notification.comp_cancelled_no_opponent', 'en'),
                    competitionId
                ).run();
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
            // F-7: i18n (stored snapshot stays English; behavior unchanged).
            await this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
            `).bind(
                userId,
                t('notification.comp_cancelled', 'en'),
                t('notification.comp_cancelled_not_started', 'en'),
                competitionId
            ).run();
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

        // R2-V: guarded cutoff — only live -> completed fixes the tally.
        // Already-completed (historical) rows are never recomputed here.
        const cutoff = await this.db.prepare(`
            UPDATE competitions
            SET status = 'completed', ended_at = datetime('now'), updated_at = datetime('now'),
                auto_deleted_reason = 'live_max_2hr',
                duration_seconds = CASE WHEN started_at IS NOT NULL
                    AND julianday('now') >= julianday(started_at)
                    THEN CAST((julianday('now') - julianday(started_at)) * 86400 AS INTEGER)
                    ELSE NULL END,
                ended_early = CASE WHEN started_at IS NOT NULL
                    AND (julianday('now') - julianday(started_at)) * 86400 >= 0
                    AND (julianday('now') - julianday(started_at)) * 86400 < 300
                    THEN 1 ELSE 0 END,
                ended_by_user_id = NULL,
                end_reason = 'auto_end',
                result_source = 'AUTO',
                result_version = 1
            WHERE id = ? AND status = 'live'
        `).bind(competitionId).run();
        if (Number(cutoff?.meta?.changes ?? 1) === 0) return false;

        // R4-LIVE-END-RECOVERY-1 (28.5): automatic end is the same terminal
        // lifecycle event as a manual end. Both participants and viewers
        // already listen on the competition channel; the row is authoritative.
        try {
            const endedRow = await this.db.prepare(
                'SELECT ended_at FROM competitions WHERE id = ?'
            ).bind(competitionId).first<{ ended_at: string | null }>();
            const { EventPusher } = await import('./EventPusher');
            await new EventPusher(this.db).publishCompetitionStatus(competitionId, {
                status: 'completed',
                ended_at: endedRow?.ended_at ?? null,
                early_end: false,
                result_source: 'AUTO',
                // Codex P2: finalizeCompetition() below emits the settled
                // winner; this cutoff event only tears down the live surface.
                result_pending: true,
                updated_at: new Date().toISOString(),
            });
        } catch (pushError) {
            console.error(`[AutoEnd] Status publish failed for #${competitionId}:`, pushError);
        }

        await this.db.prepare(`
            UPDATE users SET is_busy = 0, current_competition_id = NULL, busy_since = NULL
            WHERE current_competition_id = ?
        `).bind(competitionId).run();

        // R4-CHUNK-UPLOAD-SAFE-1: NO bulk key deletion on auto-end either
        // (same drain-tail rule as the controller path — single-use + TTL
        // + opportunistic prune keep the table tiny without killing tails).

        // R4-CHUNK-UPLOAD-SAFE-1: cron auto-end frees the recorder lease
        // (extracted lifecycle, PR110/HOLD preserved for row 30).
        try {
            const { RecordingLeaseModel } = await import('../../models/RecordingLeaseModel');
            await new RecordingLeaseModel(this.db).releaseForCompetition(competitionId);
        } catch (e) {
            console.error(`[AutoEnd] Lease release failed for #${competitionId}:`, e);
        }

        // R4-CHUNK-INDEX-1: snapshot the index at auto-end (ended ≠
        // finalized). Best-effort like the controller path — the marker is
        // informational for SAFE28/download and never blocks the cutoff.
        try {
            const { ChunkIndexModel } = await import('../../models/ChunkIndexModel');
            await new ChunkIndexModel(this.db).recordFinalMarker(competitionId);
        } catch (e) {
            console.error(`[AutoEnd] Index marker failed for #${competitionId}:`, e);
        }

        const userIds = [competition.creator_id, competition.opponent_id].filter(Boolean);
        for (const userId of userIds) {
            // F-7: i18n (stored snapshot stays English; behavior unchanged).
            await this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
            `).bind(
                userId,
                t('notification.comp_ended_title', 'en'),
                t('notification.comp_ended', 'en'),
                competitionId
            ).run();
        }

        // R2-V: cutoff first, then final result/ELO/payouts exactly once
        // (idempotent — concurrent auto-ends converge).
        try {
            await this.finalizeCompetition(competitionId);
        } catch (e) {
            console.error(`[AutoEnd] Finalize failed for #${competitionId}:`, e);
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
                // F-7: i18n (stored snapshot stays English; behavior unchanged).
                await this.db.prepare(`
                    INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                    VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
                `).bind(
                    userId,
                    t('notification.comp_cancelled', 'en'),
                    t('notification.comp_cancelled_generic', 'en'),
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
            // F-7: i18n (stored snapshot stays English; behavior unchanged).
            await this.db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', ?, ?, 'competition', ?, datetime('now'))
            `).bind(
                userId,
                t('notification.comp_reminder_title', 'en'),
                t('notification.comp_reminder', 'en'),
                task.competition_id
            ).run();
        }
    }

    /**
     * R2-V: recompute aggregates/winner after each live vote (provisional),
     * or finalize them once after the cutoff (completed).
     *
     * - LIVE: aggregates + winner_id stay provisional (visible interim tally,
     *   no ELO). A later vote/withdraw simply overwrites them.
     * - COMPLETED (cutoff already fixed by end/complete): aggregates + winner
     *   become final and ELO is applied exactly once (DB-claimed).
     * - Any other status: no-op (ratings are live-only, so this path is only
     *   reachable for live/completed).
     *
     * Winner/ELO formulas and the 20/80 payout split are untouched — only the
     * TIMING changed (final at cutoff, not 24h later). Historical completed
     * rows are never recomputed by votes (writes are rejected post-cutoff);
     * only the explicit finalize path touches them, idempotently.
     *
     * B12 atomicity & ELO idempotency are preserved:
     * - All writes run in ONE db.batch() (serialized transaction).
     * - ELO at most once per competition, enforced INSIDE the database via
     *   the elo_applied_at claim. Concurrent duplicates find it set.
     * - Draw rule: equal averages (including both zero) or missing opponent
     *   => explicit winner_id = NULL + draw ELO (0.5/0.5) once.
     * - Failure never fails the vote: a durable `recalc_aggregates` retry is
     *   scheduled (idempotent re-run via processPendingTasks).
     *
     * `allowFinalize` is false for vote callers. A vote request that started
     * just before the cutoff may read `completed` here after the guarded
     * live->completed transition; it must NOT run the final aggregates/ELO
     * pass, because only finalize/retry paths are allowed to claim the
     * one-time result and announce it. The finalize path recomputes from the
     * same frozen tally (including the accepted vote) and emits the event.
     */
    async updateAggregatesAfterVote(
        competitionId: number,
        options?: { allowFinalize?: boolean },
    ): Promise<AggregateUpdateResult> {
        const allowFinalize = options?.allowFinalize !== false;
        const { LivePayoutEngine } = await import('./LivePayoutEngine');
        const { computeEloChange } = await import('./EloRatingService');

        const competition = await this.db.prepare(`
            SELECT id, creator_id, opponent_id, status, ended_at, elo_applied_at,
                   result_source, ended_by_user_id, ended_early
              FROM competitions WHERE id = ?
        `).bind(competitionId).first<any>();

        if (!competition) {
            return { settled: false, final: false, finalClaimed: false, winnerId: null };
        }
        // R2-V: ratings exist only for live; completed is the finalize path.
        if (competition.status !== 'live' && competition.status !== 'completed') {
            return { settled: false, final: false, finalClaimed: false, winnerId: null };
        }
        // A vote racing the cutoff must leave the final claim/announcement to
        // finalizeCompetition (or the recalc_aggregates retry).
        if (!allowFinalize && competition.status === 'completed') {
            return { settled: false, final: true, finalClaimed: false, winnerId: null };
        }

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

        // Draw rule: tie (equal averages, including both zero) or missing
        // opponent => explicit winner_id = NULL (never left implicit).
        let winnerId: number | null = null;
        if (competition.opponent_id) {
            if (creatorAvg > opponentAvg) winnerId = competition.creator_id;
            else if (opponentAvg > creatorAvg) winnerId = competition.opponent_id;
        }

        // UNIT30.4: a confirmed competitor early End is a withdrawal by that
        // actor — the opponent wins regardless of (typically absent) viewer
        // votes. Automatic/admin closes carry no actor and never invent one.
        if (competition.result_source === 'SYSTEM_EARLY_END' && competition.opponent_id) {
            if (competition.ended_by_user_id === competition.creator_id) {
                winnerId = competition.opponent_id;
            } else if (competition.ended_by_user_id === competition.opponent_id) {
                winnerId = competition.creator_id;
            }
        }

        // R2-V: final exactly at the cutoff — no 24h window. Live stays
        // provisional (ELO untouched); completed finalizes ELO once.
        const resultFinal = competition.status === 'completed';

        let settled = false;
        let finalClaimed = false;
        try {
            finalClaimed = await this.applyAggregatesAndEloOnce(competition, creatorAvg, opponentAvg, overallAvg, winnerId, computeEloChange, resultFinal);
            settled = true;
        } catch (e) {
            // Do NOT swallow silently and do NOT fail the vote — record a
            // durable scheduled retry instead. processPendingTasks re-runs this
            // method (idempotent) until aggregates + ELO land. The caller must
            // treat this pass as unsettled and must not announce a final result.
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

        return { settled, final: resultFinal, finalClaimed, winnerId };
    }

    /**
     * B12: single atomic db.batch() — aggregates + one-time ELO.
     * Statement order inside the batch mirrors SQLite's sequential execution:
     * the guarded user-rating writes run while elo_applied_at is still NULL,
     * then the claim sets it. A later serialized duplicate finds it set and
     * its guarded writes match 0 rows.
     */
    private async applyAggregatesAndEloOnce(
        competition: { id: number; creator_id: number; opponent_id: number | null; elo_applied_at?: string | null },
        creatorAvg: number,
        opponentAvg: number,
        overallAvg: number,
        winnerId: number | null,
        computeElo: (a: number, b: number, w: number | null, c: number, o: number, k?: number) => { creator: number; opponent: number },
        resultFinal: boolean
    ): Promise<boolean> {
        // Provisional (live) writes are guarded by status so a vote batch that
        // was delayed past the cutoff can never overwrite the settled final
        // aggregates/winner. The final pass is the only one allowed to write
        // a completed row (and it is already serialized with the ELO claim).
        const statements: D1PreparedStatement[] = [
            this.db.prepare(`
                UPDATE competitions
                SET creator_rating = ?, opponent_rating = ?, average_rating = ?, winner_id = ?
                WHERE id = ?${resultFinal ? '' : " AND status = 'live'"}
            `).bind(creatorAvg, opponentAvg, overallAvg, winnerId, competition.id),
        ];

        let hasFinalClaim = false;
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
            hasFinalClaim = true;
        }

        const results = await this.db.batch(statements);
        if (!hasFinalClaim) return false;

        // The claim is the last statement. `changes = 1` identifies the one
        // invocation that settled the final result; every concurrent/retried
        // invocation finds the row already claimed and gets 0.
        const claim = results[results.length - 1];
        if (typeof claim?.meta?.changes === 'number') {
            return claim.meta.changes > 0;
        }
        // Fallback for runtimes that omit per-statement changes: the
        // pre-batch snapshot is the only local evidence. If ELO was already
        // applied, this invocation did not win the claim.
        return competition.elo_applied_at == null;
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
