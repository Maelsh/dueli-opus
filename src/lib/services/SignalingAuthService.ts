/**
 * Signaling Authorization Service (Phase 7.A — WebRTC Signaling)
 * خدمة تفويض الإشارات
 *
 * Single point of authority for platform signaling:
 *   authenticated session → user_id → competition → creator_id/opponent_id → derived role
 *
 * Roles: creator_id → host, opponent_id → guest.
 * A client-supplied role is NEVER trusted as authority (spoofing → 403).
 *
 * Eligible competitions: status 'accepted' or 'live' only; anything else → 409.
 * Missing competition / non-participant → 403 (no existence oracle).
 *
 * MVC: all business logic lives here; routes only bind HTTP.
 */

export type SignalingRole = 'host' | 'guest';

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

const ELIGIBLE_STATUSES = new Set(['accepted', 'live']);

export class SignalingAuthService {
    constructor(private readonly db: D1Database) {}

    /**
     * Derive the server-side role for userId in competitionId.
     * Returns ok:false with the mapped HTTP failure (401/403/409) otherwise.
     *
     * @param userId authenticated user id (null → 401)
     * @param competitionId numeric competition id (NaN/<=0 → 403)
     * @param claimedRole optional client-supplied role; mismatch → 403 (never authoritative)
     */
    async authorize(
        userId: number | null | undefined,
        competitionId: number,
        claimedRole?: string | null
    ): Promise<SignalingAuthResult> {
        if (userId === null || userId === undefined) {
            return { ok: false, code: 401, error: 'unauthorized' };
        }
        if (!Number.isFinite(competitionId) || competitionId <= 0) {
            return { ok: false, code: 403, error: 'forbidden' };
        }

        let competition: { id: number; creator_id: number; opponent_id: number | null; status: string } | null;
        try {
            // NOTE: this exact SELECT shape is also covered by tests/helpers/fake-d1.ts.
            competition = await this.db.prepare(
                `SELECT id, creator_id, opponent_id, status FROM competitions WHERE id = ?`
            ).bind(competitionId).first() as {
                id: number; creator_id: number; opponent_id: number | null; status: string;
            } | null;
        } catch {
            // Transport/DB failure must never become an authorization success.
            throw new Error('signaling_auth_transport_failed');
        }

        if (!competition) {
            return { ok: false, code: 403, error: 'forbidden' };
        }

        let role: SignalingRole | null = null;
        if (userId === competition.creator_id) {
            role = 'host';
        } else if (competition.opponent_id !== null && userId === competition.opponent_id) {
            role = 'guest';
        }

        if (!role) {
            return { ok: false, code: 403, error: 'forbidden' };
        }

        // Client role is informational only — mismatch is spoofing.
        if (claimedRole !== undefined && claimedRole !== null && claimedRole !== '' && claimedRole !== role) {
            return { ok: false, code: 403, error: 'role_mismatch' };
        }

        if (!ELIGIBLE_STATUSES.has(competition.status)) {
            return { ok: false, code: 409, error: 'competition_not_eligible' };
        }

        return { ok: true, userId, role, competitionId: competition.id, competitionStatus: competition.status };
    }
}

export default SignalingAuthService;
