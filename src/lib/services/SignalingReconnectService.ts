/**
 * Signaling Reconnect Service (Phase 7.C — reconnect / resilience)
 * خدمة إعادة الاتصال للإشارات
 *
 * Bounded, deterministic recovery for interrupted live WebRTC sessions:
 *   - `SignalingReconnectPolicy` is a PURE state machine: it maps a WebRTC
 *     peer-connection state to the intended recovery action and computes the
 *     bounded retry schedule (exponential backoff, capped, no jitter →
 *     deterministic and testable).
 *   - `SignalingReconnectService` performs the SERVER side of a recovery:
 *     re-announce presence (heartbeat refresh) through the EXISTING
 *     `SignalingSessionService` and return the session state (resume point
 *     `lastEventId`) so a recovering client can catch up via /poll.
 *
 * Authorization is NEVER decided here: the caller must present an access
 * result produced by `SignalingAuthService` (single authority). The role and
 * peer id in the response are therefore always server-derived — a reconnect
 * can never change host/guest/viewer or spoof an identity.
 *
 * No new storage, no schema change, no SQL of its own.
 * MVC: all logic lives here; routes only bind HTTP.
 */

import { SignalingSessionService, type SignalingSessionState } from './SignalingSessionService';
import type { SignalingAccessSuccess } from './SignalingAuthService';
import { SignalingReconnectPolicy } from './SignalingReconnectPolicy';
import type { SignalingReconnectPolicyConfig } from './SignalingReconnectPolicy';

// R4-LIVE-INT-1: the policy lives in SignalingReconnectPolicy.ts (single
// SSOT shared with the browser client); re-exported here so every existing
// importer keeps working unchanged.
export { SignalingReconnectPolicy } from './SignalingReconnectPolicy';
export type {
    SignalingPeerState,
    SignalingReconnectAction,
    SignalingReconnectPolicyConfig,
} from './SignalingReconnectPolicy';

export interface SignalingReconnectResult {
    state: SignalingSessionState;
    /** Server-side retry bounds so the client can never retry unbounded. */
    policy: SignalingReconnectPolicyConfig;
    /** Server event id the reconnect happened at (resume point). */
    resumedAtEventId: number;
}

export class SignalingReconnectService {
    private readonly policy = new SignalingReconnectPolicy();

    constructor(private readonly db: D1Database) {}

    /**
     * Server-side recovery step: re-announce presence (acts as the heartbeat
     * refresh after an interruption — the old announce may have expired from
     * the presence window) and return the resulting session state.
     *
     * `access` MUST come from SignalingAuthService — role and peer are
     * server-derived and cannot be influenced by the reconnecting client.
     */
    async reconnect(access: SignalingAccessSuccess, now: number = Date.now()): Promise<SignalingReconnectResult> {
        const sessions = new SignalingSessionService(this.db);
        const { eventId, state } = await sessions.announce(access, 'join', now);
        return {
            state,
            policy: this.policy.limits,
            resumedAtEventId: eventId,
        };
    }
}

export default SignalingReconnectService;