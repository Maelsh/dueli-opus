/**
 * Competition video-surface decision (R4-COMP-UNIFIED-1).
 *
 * Pure function: given a competition row and the session-verified user id,
 * decide which video surface the unified /competition/:id page shows.
 * Server-derived inputs only (session user + competition row) — never a
 * client role claim. Consumed by the competition inline script (render
 * branch + init gating) via `window.resolveVideoSurface` (bound in the
 * app bundle), and pinned by unit tests across roles × states.
 */

export type VideoSurface =
    | 'competitor'
    | 'golive'
    | 'youtube-live'
    | 'youtube-vod'
    | 'embedded'
    | 'waiting';

export interface SurfaceCompetition {
    status?: string | null;
    stream_status?: string | null;
    creator_id?: number | null;
    opponent_id?: number | null;
    youtube_live_id?: string | null;
    youtube_video_url?: string | null;
}

export type LiveAction = 'start' | 'publish' | 'none';

export interface LiveActionState {
    status?: string | null;
    role?: 'host' | 'opponent' | 'viewer' | null;
    hasOpponent?: boolean;
    hasMedia?: boolean;
    mediaPublished?: boolean;
    startInFlight?: boolean;
    publishInFlight?: boolean;
}

/**
 * UNIT30.4 — the ONE tower entry's state/role decision.
 *
 * - Host at `accepted` starts the competition (existing authorized API).
 * - A competitor with real local media and no consent yet publishes. This is
 *   the same explicit publish action as before; LIVE/acquisition never sets
 *   `mediaPublished`.
 * - Opponent never gets a start action from this entry. The existing server
 *   start permission is not removed, but the unified UI exposes only publish
 *   for that role.
 * - While an action is in flight the entry is `none` (disabled), so a double
 *   click cannot send two requests.
 */
export function resolveLiveAction(state: LiveActionState | null | undefined): LiveAction {
    if (!state) return 'none';
    if (state.startInFlight || state.publishInFlight) return 'none';
    const role = state.role ?? null;
    const isCompetitor = role === 'host' || role === 'opponent';
    if (!isCompetitor) return 'none';
    if (state.status === 'accepted' && role === 'host' && state.hasOpponent) return 'start';
    if ((state.status === 'accepted' || state.status === 'live') && state.hasMedia && !state.mediaPublished) {
        return 'publish';
    }
    return 'none';
}

/** UNIT30.4 §15.7 — one visible tower action OR one visible End action. */
export type CompetitorButtonVisibility = 'hidden' | 'visible' | 'loading';
export type CompetitorControlProgress =
    | 'starting'
    | 'publishing'
    | 'ending'
    | 'verifying'
    | 'waiting'
    | 'ended'
    | null;

export interface CompetitorButtonState {
    start: CompetitorButtonVisibility;
    end: CompetitorButtonVisibility;
    progress: CompetitorControlProgress;
}

export interface CompetitorButtonInput {
    status?: string | null;
    role?: 'host' | 'opponent' | 'viewer' | null;
    mediaPublished?: boolean;
    startInFlight?: boolean;
    publishInFlight?: boolean;
    endInFlight?: boolean;
    endUnknown?: boolean;
}

/**
 * Display truth for §15.7. `mediaPublished` must come from the real
 * published-sender state, never from the click or the competition being live.
 * At most one of start/end is visible (or loading); a null pair is only
 * allowed with a progress/waiting state or a terminal surface.
 */
export function resolveCompetitorButtons(
    state: CompetitorButtonInput | null | undefined
): CompetitorButtonState {
    if (!state) return { start: 'hidden', end: 'hidden', progress: null };
    const role = state.role ?? null;
    const isCompetitor = role === 'host' || role === 'opponent';
    const status = state.status ?? null;
    const final = status === 'completed' || status === 'ended' || status === 'cancelled';
    if (final) return { start: 'hidden', end: 'hidden', progress: 'ended' };
    if (!isCompetitor) return { start: 'hidden', end: 'hidden', progress: null };

    // End/verify wins over a stale start attempt: a server end must never
    // bring the start action back while the outcome is being verified.
    if (state.endUnknown) return { start: 'hidden', end: 'loading', progress: 'verifying' };
    if (state.endInFlight) return { start: 'hidden', end: 'loading', progress: 'ending' };
    if (state.startInFlight) return { start: 'loading', end: 'hidden', progress: 'starting' };
    if (state.publishInFlight) return { start: 'loading', end: 'hidden', progress: 'publishing' };

    if (status === 'accepted') {
        if (role === 'host') return { start: 'visible', end: 'hidden', progress: null };
        // The opponent can publish during prep, then waits for the host; the
        // End action is never shown before the competition is live.
        if (state.mediaPublished) return { start: 'hidden', end: 'hidden', progress: 'waiting' };
        return { start: 'visible', end: 'hidden', progress: null };
    }
    if (status === 'live') {
        if (state.mediaPublished) return { start: 'hidden', end: 'visible', progress: null };
        // Start here means "publish my own source" (or republish after an
        // explicit source stop); LIVE alone never hides it.
        return { start: 'visible', end: 'hidden', progress: null };
    }
    return { start: 'hidden', end: 'hidden', progress: 'waiting' };
}

export type CompetitorVideoLayout = 'local' | 'remote' | 'terminal';

/**
 * UNIT30.4 §15.8 — the ONLY layout inputs are the server-final state and
 * actual opponent-video presence (V). P, the generic connection state and the
 * LIVE flag are deliberately absent.
 */
export function resolveCompetitorVideoLayout(state: {
    serverFinal?: boolean;
    remoteVideoPresent?: boolean;
} | null | undefined): CompetitorVideoLayout {
    if (!state) return 'local';
    if (state.serverFinal) return 'terminal';
    return state.remoteVideoPresent ? 'remote' : 'local';
}

export function resolveVideoSurface(comp: SurfaceCompetition | null | undefined, userId: number | null | undefined): VideoSurface {
    if (!comp) return 'waiting';
    const status = comp.status ?? null;
    const streamStatus = comp.stream_status ?? null;
    const isCreator = userId !== null && userId !== undefined && userId === comp.creator_id;
    const isOpponent = userId !== null && userId !== undefined && userId === comp.opponent_id;
    const isLive = status === 'live' || streamStatus === 'live';
    const isCompleted = status === 'completed' || streamStatus === 'ready';
    const isPending = status === 'pending';
    const isAccepted = status === 'accepted';

    // Competitors run the in-page live flow (same classes as /live/:id).
    // A28-SURFACE: a completed competition WINS over a stale stream_status
    // 'live' — the terminal decision must reach the VOD/processing surface,
    // never keep the finished competitors on the live stage.
    if ((isCreator || isOpponent) && comp.opponent_id && isLive && !isCompleted) return 'competitor';
    // R4-LIVE-ENTRY-RECOVERY-REM1: accepted parties enter the private prep
    // surface immediately (camera/screen preview + independent publish),
    // never the old redirect-to-/live "Go Live" card.
    if ((isCreator || isOpponent) && comp.opponent_id && isAccepted) return 'competitor';
    // Legacy pending-with-opponent edge (race/backfill): keep the ready card.
    if ((isCreator || isOpponent) && comp.opponent_id && isPending) return 'golive';
    if (comp.youtube_live_id && isLive) return 'youtube-live';
    if (comp.youtube_video_url) return 'youtube-vod';
    // Audience (anyone else, any auth state) watches chunks; completed
    // without a recording is handled downstream as processing/unavailable.
    if (isLive || isCompleted) return 'embedded';
    return 'waiting';
}

export default resolveVideoSurface;
