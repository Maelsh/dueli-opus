/**
 * Competition Views Model — R2-L1 (H2).
 * نموذج المشاهدات المحتسبة اليومية
 *
 * One counted view per (competition, identity, UTC day). Identity is the
 * logged-in account (`user:<id>`) or a first-party guest session
 * (`guest:<token>`) — never an IP or device fingerprint. GETs, polls,
 * heartbeats and retries never touch this table directly; only the explicit
 * watch-intent and watch-heartbeat paths insert, with INSERT OR IGNORE so a
 * duplicate resolves to "already counted" instead of a second view.
 *
 * MVC: all SQL lives here. Callers (WatchService) own the policy.
 */

export type WatchIdentityKind = 'user' | 'guest';

export interface WatchIdentity {
    kind: WatchIdentityKind;
    /** `user:<id>` or `guest:<token>` — the UNIQUE scope, never a raw id. */
    key: string;
}

const GUEST_TOKEN_PATTERN = /^[A-Za-z0-9_-]{8,64}$/;

export class CompetitionViewsModel {
    constructor(private readonly db: D1Database) {}

    /** First-party guest tokens only (same shape the session engine issues). */
    static isValidGuestToken(token: string | null | undefined): token is string {
        return typeof token === 'string' && GUEST_TOKEN_PATTERN.test(token);
    }

    /**
     * Resolve the counting identity: the logged-in account wins, else a
     * well-formed presented guest token, else null (the caller issues one).
     */
    static identityFor(userId: number | null, guestToken: string | null): WatchIdentity | null {
        if (typeof userId === 'number' && Number.isInteger(userId) && userId > 0) {
            return { kind: 'user', key: `user:${userId}` };
        }
        if (CompetitionViewsModel.isValidGuestToken(guestToken)) {
            return { kind: 'guest', key: `guest:${guestToken}` };
        }
        return null;
    }

    /**
     * Idempotent daily insert. Returns true exactly when this call created
     * the row (i.e. the view is newly counted); concurrent first views
     * serialize on the UNIQUE constraint so only one caller counts.
     */
    async ensureDailyView(competitionId: number, identity: WatchIdentity, viewDay: string): Promise<boolean> {
        const outcome = await this.db.prepare(
            `INSERT OR IGNORE INTO competition_views (competition_id, identity_kind, identity_key, view_day)
             VALUES (?, ?, ?, ?)`
        ).bind(competitionId, identity.kind, identity.key, viewDay).run();
        return Number(outcome.meta.changes ?? 0) > 0;
    }
}

export default CompetitionViewsModel;
