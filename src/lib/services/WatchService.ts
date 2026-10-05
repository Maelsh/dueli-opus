/**
 * Watch Service — R2-L1 (H1 + H2).
 * خدمة المشاهدة والحضور المحتسب
 *
 * Single policy owner for "who watched what, for how long":
 *
 * - H2 (counted views): one counted view per (competition, identity, UTC
 *   day) in `competition_views`. Identity is the logged-in account or a
 *   first-party guest token (never IP/device). GETs, polls, heartbeats and
 *   retries never count — only the explicit intent/heartbeat paths insert,
 *   and `total_views` increments exactly when a new day-row is created.
 *   Presence (SignalingSessionService) stays a separate system that never
 *   writes counters.
 * - H1 (watch duration): cumulative LIVE seconds per (user, competition) in
 *   `watch_history.watch_duration_seconds`, accumulated ONLY from
 *   server-derived heartbeat deltas (capped per pulse). Guests never
 *   accumulate (they cannot rate) but still count H2 views. Non-live
 *   competitions never accumulate (the pulse proves nothing about live
 *   watching). 300 seconds unlocks rating eligibility — read by R2-V from
 *   `getViewerWatch` (the one clear source), never from client claims.
 *
 * No `#private` fields (Workers compat). All SQL lives in the Models.
 */

import { CompetitionModel } from '../../models/CompetitionModel';
import { CompetitionViewsModel, type WatchIdentity } from '../../models/CompetitionViewsModel';
import { WatchHistoryModel } from '../../models/WatchHistoryModel';
import { ExploreSessionService } from './ExploreSessionService';

/** H1: cumulative live seconds that unlock rating eligibility (owner-settled). */
export const WATCH_ELIGIBILITY_SECONDS = 300;

/**
 * Upper bound credited for a single heartbeat (tolerates timer jitter and
 * background tabs without trusting any client-supplied duration).
 */
export const HEARTBEAT_MAX_DELTA_SECONDS = 120;

export interface WatchIntentResult {
    counted: boolean;
    totalViews: number;
    guestToken: string | null;
}

export interface WatchHeartbeatResult extends WatchIntentResult {
    live: boolean;
    /** Cumulative seconds, or null for guests/anonymous (never accumulate). */
    watchSeconds: number | null;
    watchEligible: boolean;
}

export class WatchService {
    constructor(private readonly db: D1Database) {}

    /** UTC YYYY-MM-DD grain for H2 dedup (server clock, never client date). */
    static utcDay(now: Date = new Date()): string {
        return now.toISOString().slice(0, 10);
    }

    /**
     * Resolve the counting identity and issue a first-party guest token when
     * the caller presents none. The issued token must be persisted caller-side
     * (same `dueli_guest_token` the Explore flow uses).
     */
    static identityForCreate(
        userId: number | null,
        guestToken: string | null
    ): { identity: WatchIdentity; issuedGuestToken: string | null } {
        const existing = CompetitionViewsModel.identityFor(userId, guestToken);
        if (existing) return { identity: existing, issuedGuestToken: null };
        const issued = ExploreSessionService.issueGuestToken();
        return { identity: { kind: 'guest', key: `guest:${issued}` }, issuedGuestToken: issued };
    }

    /** Strict read-time identity: never issues (a stranger stays a stranger). */
    static identityForRead(userId: number | null, guestToken: string | null): WatchIdentity | null {
        return CompetitionViewsModel.identityFor(userId, guestToken);
    }

    private async totalViews(competitionId: number): Promise<number> {
        const row = await new CompetitionModel(this.db).findById(competitionId) as { total_views?: number } | null;
        return Number(row?.total_views ?? 0);
    }

    /**
     * H2: record one watch intent. Idempotent per (competition, identity,
     * day) — repeats return counted=false with the counter untouched.
     */
    async recordWatchIntent(
        competitionId: number,
        identity: WatchIdentity,
        viewDay: string = WatchService.utcDay()
    ): Promise<{ counted: boolean; totalViews: number }> {
        const counted = await new CompetitionViewsModel(this.db).ensureDailyView(
            competitionId, identity, viewDay
        );
        if (counted) {
            await new CompetitionModel(this.db).incrementViews(competitionId);
        }
        return { counted, totalViews: await this.totalViews(competitionId) };
    }

    /**
     * H1+H2: one bounded playback pulse. Always runs the H2 intent first (a
     * live watcher is a viewer), then — for logged-in users on a LIVE
     * competition only — accumulates a server-derived, capped slice. The
     * request body is never read: no seconds, no user_id, no live flag from
     * the client. Replays add ~0; races serialize on the stored timestamp.
     */
    async heartbeat(
        competitionId: number,
        userId: number | null,
        identity: WatchIdentity,
        viewDay: string = WatchService.utcDay()
    ): Promise<Omit<WatchHeartbeatResult, 'guestToken'>> {
        const intent = await this.recordWatchIntent(competitionId, identity, viewDay);
        const competition = await new CompetitionModel(this.db).findById(competitionId) as { status?: string } | null;
        const live = competition?.status === 'live';
        if (!live || userId === null) {
            return { ...intent, live, watchSeconds: null, watchEligible: false };
        }
        const seconds = await new WatchHistoryModel(this.db).addHeartbeatSeconds(
            userId, competitionId, HEARTBEAT_MAX_DELTA_SECONDS
        );
        return { ...intent, live, watchSeconds: seconds, watchEligible: seconds >= WATCH_ELIGIBILITY_SECONDS };
    }

    /**
     * The one clear source R2-V reads for rating eligibility: cumulative
     * live seconds and the 300s verdict for one (user, competition).
     */
    async getViewerWatch(
        competitionId: number,
        userId: number
    ): Promise<{ seconds: number; eligible: boolean; required: number }> {
        const seconds = await new WatchHistoryModel(this.db).getWatchSeconds(userId, competitionId);
        return { seconds, eligible: seconds >= WATCH_ELIGIBILITY_SECONDS, required: WATCH_ELIGIBILITY_SECONDS };
    }
}

export default WatchService;
