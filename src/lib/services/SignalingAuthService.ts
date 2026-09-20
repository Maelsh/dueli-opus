/**
 * Signaling Authorization Service (Phase 7.A participants → Phase 7.B viewers)
 * خدمة تفويض الإشارات
 *
 * Single point of authority for platform signaling:
 *   authenticated session → user_id → competition → creator_id/opponent_id → derived role
 *
 * Roles: creator_id → host, opponent_id → guest, any other authenticated user
 * → viewer — but ONLY while the competition is actually live ('live').
 * A client-supplied role is NEVER trusted as authority (spoofing → 403).
 *
 * Eligible competitions (participants): status 'accepted' or 'live'; anything else → 409.
 * Viewable competitions (viewers): status 'live' only; anything else → 403.
 * Missing competition / foreign competition → 403 (no existence oracle).
 *
 * 7.B: every signal is tagged with a server-derived `peer` id
 * ('host' | 'guest' | 'viewer:<userId>') so a viewer can never impersonate a
 * participant, and participant privileges are gated by `canPublish()`.
 *
 * MVC: all business logic lives here; routes only bind HTTP.
 */

export type SignalingRole = 'host' | 'guest';

/** 7.B access roles: participants (host/guest) + read-only watchers (viewer). */
export type SignalingAccessRole = SignalingRole | 'viewer';

/** Server-derived identity used for signal routing (never client-supplied). */
export type SignalingPeerId = string;

/** Signal kinds a role may publish (7.B capability matrix, server-side only). */
export type SignalingSignalKind = 'offer' | 'answer' | 'ice' | 'request_offer';

export type SignalingAuthFailure =
    | { code: 401; error: 'unauthorized' }
    | { code: 403; error: 'forbidden' | 'role_mismatch' }
    | { code: 409; error: 'competition_not_eligible' };

export interface SignalingAuthSuccess {
    userId: number;
    role: SignalingRole;
    competitionId: number;
    competitionStatus: string;
}

export type SignalingAuthResult =
    | ({ ok: true } & SignalingAuthSuccess)
    | ({ ok: false } & SignalingAuthFailure);

/** 7.B: participants and viewers go through the same single authority. */
export interface SignalingAccessSuccess {
    userId: number;
    role: SignalingAccessRole;
    peer: SignalingPeerId;
    competitionId: number;
    competitionStatus: string;
    competitionStartedAt: string | null;
}

export type SignalingAccessResult =
    | ({ ok: true } & SignalingAccessSuccess)
    | ({ ok: false } & SignalingAuthFailure);

const ELIGIBLE_STATUSES = new Set(['accepted', 'live']);
/** Viewers are allowed to watch ONLY an actually-live session. */
const VIEWABLE_STATUS = 'live';

/** 'opponent' is the legacy client alias of the canonical 'guest' role. */
const ROLE_ALIASES: Record<string, SignalingAccessRole> = {
    host: 'host',
    guest: 'guest',
    opponent: 'guest',
    viewer: 'viewer',
};

const VIEWER_PEER_PATTERN = /^viewer:[1-9]\d*$/;

/**
 * Normalize a client-supplied role claim. Unknown claims are returned as-is so
 * the comparison in `authorizeViewer` always fails (spoofing → 403).
 */
function normalizeClaim(claimedRole?: string | null): SignalingAccessRole | undefined {
    if (claimedRole === undefined || claimedRole === null || claimedRole === '') return undefined;
    const key = String(claimedRole);
    return ROLE_ALIASES[key] ?? (key as SignalingAccessRole);
}

export class SignalingAuthService {
    constructor(private readonly db: D1Database) {}

    /**
     * 7.B: any authenticated user who is allowed to take part in the live
     * session — as host, guest, or viewer. This is the single derivation point
     * used by every signaling route.
     *
     * @param userId authenticated user id (null → 401)
     * @param competitionId numeric competition id (NaN/<=0 → 403)
     * @param claimedRole optional client-supplied role; mismatch → 403 (never authoritative)
     */
    async authorizeViewer(
        userId: number | null | undefined,
        competitionId: number,
        claimedRole?: string | null
    ): Promise<SignalingAccessResult> {
        if (userId === null || userId === undefined) {
            return { ok: false, code: 401, error: 'unauthorized' };
        }
        if (!Number.isFinite(competitionId) || competitionId <= 0) {
            return { ok: false, code: 403, error: 'forbidden' };
        }

        const competition = await this.loadCompetition(competitionId);
        if (!competition) {
            return { ok: false, code: 403, error: 'forbidden' };
        }

        const derived: SignalingAccessRole | null =
            userId === competition.creator_id ? 'host'
            : competition.opponent_id !== null && userId === competition.opponent_id ? 'guest'
            : null;

        const claim = normalizeClaim(claimedRole);

        if (derived === null) {
            // 7.B: non-participants may watch — as `viewer` ONLY, and only a
            // live session. Claiming host/guest is spoofing → role_mismatch.
            if (claim !== undefined && claim !== 'viewer') {
                return { ok: false, code: 403, error: 'role_mismatch' };
            }
            if (competition.status !== VIEWABLE_STATUS) {
                return { ok: false, code: 403, error: 'forbidden' };
            }
            return {
                ok: true,
                userId,
                role: 'viewer',
                peer: SignalingAuthService.peerId('viewer', userId),
                competitionId: competition.id,
                competitionStatus: competition.status,
                competitionStartedAt: competition.started_at ?? null,
            };
        }

        // Client role is informational only — mismatch is spoofing.
        if (claim !== undefined && claim !== derived) {
            return { ok: false, code: 403, error: 'role_mismatch' };
        }

        if (!ELIGIBLE_STATUSES.has(competition.status)) {
            return { ok: false, code: 409, error: 'competition_not_eligible' };
        }

        return {
            ok: true,
            userId,
            role: derived,
            peer: derived,
            competitionId: competition.id,
            competitionStatus: competition.status,
            competitionStartedAt: competition.started_at ?? null,
        };
    }

    /**
     * 7.A contract (participants only): host/guest derivation for
     * offer/answer/ICE/poll. Viewers still get 403 here — they use the 7.B
     * session/viewer surfaces instead. Kept so the 7.A authorization boundary
     * can never be widened accidentally.
     */
    async authorize(
        userId: number | null | undefined,
        competitionId: number,
        claimedRole?: string | null
    ): Promise<SignalingAuthResult> {
        const access = await this.authorizeViewer(userId, competitionId, claimedRole);
        if (!access.ok) return access;
        if (access.role === 'viewer') {
            return { ok: false, code: 403, error: 'forbidden' };
        }
        return {
            ok: true,
            userId: access.userId,
            role: access.role,
            competitionId: access.competitionId,
            competitionStatus: access.competitionStatus,
        };
    }

    /** Server-derived peer id — a client can never pick its own identity. */
    static peerId(role: SignalingAccessRole, userId: number): SignalingPeerId {
        return role === 'viewer' ? `viewer:${userId}` : role;
    }

    /** True for `viewer:<userId>` peer ids. */
    static isViewerPeer(peer: unknown): peer is string {
        return typeof peer === 'string' && VIEWER_PEER_PATTERN.test(peer);
    }

    /** True for the participant peer ids. */
    static isParticipantPeer(peer: unknown): boolean {
        return peer === 'host' || peer === 'guest';
    }

    /**
     * 7.B capability matrix — the only place deciding whether a role may
     * publish a signal kind. Viewers are receive-only peers: they may answer
     * an offer and exchange ICE, but can never offer as a participant.
     */
    static canPublish(role: SignalingAccessRole, kind: SignalingSignalKind): boolean {
        switch (kind) {
            case 'offer': return role === 'host';
            case 'answer': return role === 'guest' || role === 'viewer';
            case 'ice': return role === 'host' || role === 'guest' || role === 'viewer';
            case 'request_offer': return role === 'guest' || role === 'viewer';
            default: return false;
        }
    }

    /** Competition lookup shared by every derivation (one SQL shape). */
    private async loadCompetition(competitionId: number): Promise<{
        id: number;
        creator_id: number;
        opponent_id: number | null;
        status: string;
        started_at: string | null;
    } | null> {
        try {
            // NOTE: this exact SELECT shape is covered by tests/helpers/fake-d1.ts.
            return await this.db.prepare(
                `SELECT id, creator_id, opponent_id, status, started_at FROM competitions WHERE id = ?`
            ).bind(competitionId).first() as {
                id: number; creator_id: number; opponent_id: number | null; status: string; started_at: string | null;
            } | null;
        } catch {
            // Transport/DB failure must never become an authorization success.
            throw new Error('signaling_auth_transport_failed');
        }
    }
}

export default SignalingAuthService;
