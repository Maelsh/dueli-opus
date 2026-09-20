/**
 * Signaling Session Service (Phase 7.B — viewers / late join)
 * خدمة حالة جلسة الإشارات
 *
 * Live session discovery + presence for late joiners, built on the EXISTING
 * `sse_event_log` storage (channel `signaling:<competitionId>`, event types
 * `session_join` / `session_leave`). No new table, no schema change, no second
 * signaling system.
 *
 * Presence = newest presence event per server-derived peer id, within TTL.
 * A crashed client therefore disappears once its heartbeat expires
 * (participants and viewers both re-announce via POST /api/signaling/session/join).
 *
 * MVC: all logic lives here; routes only bind HTTP.
 */

import { SseEventLogModel, type SseEventLog } from '../../models/SseEventLogModel';
import type { SignalingAccessSuccess } from './SignalingAuthService';

/** How long a presence announcement stays valid (clients heartbeat faster). */
export const SIGNALING_PRESENCE_TTL_MS = 45_000;

/** How many newest channel events are scanned to derive presence. */
const PRESENCE_SCAN_LIMIT = 300;

export type SignalingPresenceAction = 'join' | 'leave';

export interface SignalingPresence {
    /** Participants currently present (heartbeat within TTL). */
    host: boolean;
    guest: boolean;
    /** Present viewer peer ids — only exposed to participants (routing). */
    viewers: string[];
    viewerCount: number;
    lastEventId: number;
}

export interface SignalingSessionState {
    competitionId: number;
    role: SignalingAccessSuccess['role'];
    peer: string;
    live: boolean;
    competitionStatus: string;
    startedAt: string | null;
    presence: SignalingPresence;
    presenceTtlSeconds: number;
    /** Highest event id in the channel — late joiners resume from here. */
    lastEventId: number;
}

function safeParse(raw: unknown): Record<string, any> | null {
    if (typeof raw !== 'string' || raw.length === 0) return null;
    try {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed as Record<string, any> : null;
    } catch {
        return null;
    }
}

export class SignalingSessionService {
    constructor(private readonly db: D1Database) {}

    /** Channel name shared with the 7.A signal exchange. */
    static channelFor(competitionId: number): string {
        return `signaling:${competitionId}`;
    }

    /**
     * Derive live presence from the newest channel events.
     * Events are newest-first, so the first sighting of a peer wins; an event
     * whose payload timestamp is older than the TTL is ignored entirely.
     */
    async getPresence(competitionId: number, now: number = Date.now()): Promise<SignalingPresence> {
        const events: SseEventLog[] = await new SseEventLogModel(this.db)
            .getRecent(SignalingSessionService.channelFor(competitionId), PRESENCE_SCAN_LIMIT);

        const lastEventId = events.length > 0 ? events[0].id : 0;
        const latest = new Map<string, SignalingPresenceAction>();

        for (const event of events) {
            if (event.event_type !== 'session_join' && event.event_type !== 'session_leave') continue;
            const payload = safeParse(event.payload);
            const peer = typeof payload?.peer === 'string' ? payload.peer : null;
            const at = typeof payload?.at === 'string' ? Date.parse(payload.at) : NaN;
            if (!peer || !Number.isFinite(at) || now - at > SIGNALING_PRESENCE_TTL_MS) continue;
            if (latest.has(peer)) continue; // newest event for this peer already seen
            latest.set(peer, event.event_type === 'session_join' ? 'join' : 'leave');
        }

        const present = [...latest.entries()].filter(([, action]) => action === 'join').map(([peer]) => peer);
        const viewers = present.filter((peer) => peer.startsWith('viewer:'));

        return {
            host: present.includes('host'),
            guest: present.includes('guest'),
            viewers,
            viewerCount: viewers.length,
            lastEventId,
        };
    }

    /**
     * Announce presence (join = also the heartbeat) or departure, then return
     * the resulting session state. Announcing never touches any peer
     * connection — a late participant/viewer can never drop the existing
     * host↔guest link.
     */
    async announce(
        access: SignalingAccessSuccess,
        action: SignalingPresenceAction,
        now: number = Date.now()
    ): Promise<{ eventId: number; state: SignalingSessionState }> {
        const model = new SseEventLogModel(this.db);
        const row = await model.publish(
            SignalingSessionService.channelFor(access.competitionId),
            action === 'join' ? 'session_join' : 'session_leave',
            {
                competition_id: access.competitionId,
                peer: access.peer,
                role: access.role,
                user_id: access.userId,
                at: new Date(now).toISOString(),
            }
        );

        const state = await this.describe(access, now);
        return { eventId: row.id, state };
    }

    /**
     * Read-only session state for a late joiner: competition status,
     * participants presence, viewer count, resume point.
     * Viewer peer ids are only revealed to participants (routing need).
     */
    async describe(access: SignalingAccessSuccess, now: number = Date.now()): Promise<SignalingSessionState> {
        const presence = await this.getPresence(access.competitionId, now);
        const isParticipant = access.role === 'host' || access.role === 'guest';

        return {
            competitionId: access.competitionId,
            role: access.role,
            peer: access.peer,
            live: access.competitionStatus === 'live',
            competitionStatus: access.competitionStatus,
            startedAt: access.competitionStartedAt ?? null,
            presence: {
                host: presence.host,
                guest: presence.guest,
                viewers: isParticipant ? presence.viewers : [],
                viewerCount: presence.viewerCount,
                lastEventId: presence.lastEventId,
            },
            presenceTtlSeconds: Math.floor(SIGNALING_PRESENCE_TTL_MS / 1000),
            lastEventId: presence.lastEventId,
        };
    }
}

export default SignalingSessionService;
