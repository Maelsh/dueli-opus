/**
 * R4-COMP-UNIFIED-1 — role × state surface matrix (pure, server-derived).
 *
 * resolveVideoSurface is the SINGLE decision point for the unified
 * /competition/:id video area (render branch + init gating both call it via
 * window.resolveVideoSurface). Inputs are server-derived only (session user
 * id + competition row) — never a client role claim. 4 roles (creator,
 * opponent, other user, guest) × 4 states (pending, accepted, live,
 * completed) + youtube/ghost edges.
 */
import { describe, it, expect } from 'vitest';
import { resolveVideoSurface } from '../../src/client/helpers/CompetitionSurface';

const base = { creator_id: 1, opponent_id: 2 };

describe('R4-COMP-UNIFIED-1 video surface matrix', () => {
    const cases: Array<{
        name: string;
        comp: Record<string, unknown>;
        userId: number | null;
        want: string;
    }> = [
        // creator (host side)
        { name: 'creator/live → competitor', comp: { ...base, status: 'live' }, userId: 1, want: 'competitor' },
        // R4-LIVE-ENTRY-RECOVERY-REM1: accepted parties enter the prep surface
        // immediately — no redirect gate, no "Go Live" card.
        { name: 'creator/accepted → competitor (prep)', comp: { ...base, status: 'accepted' }, userId: 1, want: 'competitor' },
        { name: 'creator/pending → golive (legacy race edge)', comp: { ...base, status: 'pending' }, userId: 1, want: 'golive' },
        { name: 'creator/completed → embedded (VOD surfaces)', comp: { ...base, status: 'completed' }, userId: 1, want: 'embedded' },
        // opponent (guest side)
        { name: 'opponent/live → competitor', comp: { ...base, status: 'live' }, userId: 2, want: 'competitor' },
        { name: 'opponent/accepted → competitor (prep)', comp: { ...base, status: 'accepted' }, userId: 2, want: 'competitor' },
        { name: 'opponent/pending → golive (legacy race edge)', comp: { ...base, status: 'pending' }, userId: 2, want: 'golive' },
        { name: 'opponent/completed → embedded', comp: { ...base, status: 'completed' }, userId: 2, want: 'embedded' },
        // other authenticated user (audience)
        { name: 'viewer/live → embedded (chunks, never P2P)', comp: { ...base, status: 'live' }, userId: 9, want: 'embedded' },
        { name: 'viewer/accepted → waiting', comp: { ...base, status: 'accepted' }, userId: 9, want: 'waiting' },
        { name: 'viewer/pending → waiting', comp: { ...base, status: 'pending' }, userId: 9, want: 'waiting' },
        { name: 'viewer/completed → embedded (VOD)', comp: { ...base, status: 'completed' }, userId: 9, want: 'embedded' },
        // guest (unauthenticated)
        { name: 'guest/live → embedded', comp: { ...base, status: 'live' }, userId: null, want: 'embedded' },
        { name: 'guest/pending → waiting', comp: { ...base, status: 'pending' }, userId: null, want: 'waiting' },
        { name: 'guest/completed → embedded', comp: { ...base, status: 'completed' }, userId: null, want: 'embedded' },
        // edges: no opponent yet, youtube fallbacks, ghost rows
        { name: 'creator/live without opponent → embedded (nothing to connect)', comp: { creator_id: 1, opponent_id: null, status: 'live' }, userId: 1, want: 'embedded' },
        { name: 'youtube live wins for viewers', comp: { ...base, status: 'live', youtube_live_id: 'x' }, userId: 9, want: 'youtube-live' },
        { name: 'youtube vod wins when present', comp: { ...base, status: 'completed', youtube_video_url: 'https://x?v=y' }, userId: 9, want: 'youtube-vod' },
        { name: 'null competition → waiting (never crash)', comp: null as any, userId: 1, want: 'waiting' },
        { name: 'stream_status live counts as live', comp: { ...base, status: 'pending', stream_status: 'live' }, userId: 1, want: 'competitor' },
        { name: 'stream_status ready counts as completed', comp: { ...base, status: 'live', stream_status: 'ready' }, userId: 9, want: 'embedded' },
    ];

    for (const c of cases) {
        it(c.name, () => {
            expect(resolveVideoSurface(c.comp as any, c.userId)).toBe(c.want);
        });
    }

    it('spoofing is impossible by construction (no role input exists)', () => {
        // The signature takes only (row, userId) — there is no claimed-role
        // parameter to spoof. A foreign user never resolves to competitor.
        expect(resolveVideoSurface({ ...base, status: 'live' }, 999)).toBe('embedded');
        expect(resolveVideoSurface({ ...base, status: 'live' }, 0)).toBe('embedded');
    });
});
