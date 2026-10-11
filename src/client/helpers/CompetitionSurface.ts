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
    if ((isCreator || isOpponent) && comp.opponent_id && isLive) return 'competitor';
    // Competitors before going live.
    if ((isCreator || isOpponent) && comp.opponent_id && (isPending || isAccepted)) return 'golive';
    if (comp.youtube_live_id && isLive) return 'youtube-live';
    if (comp.youtube_video_url) return 'youtube-vod';
    // Audience (anyone else, any auth state) watches chunks; completed
    // without a recording is handled downstream as processing/unavailable.
    if (isLive || isCompleted) return 'embedded';
    return 'waiting';
}

export default resolveVideoSurface;
