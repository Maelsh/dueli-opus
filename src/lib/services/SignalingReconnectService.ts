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

/** Peer connection states reported by RTCPeerConnection/ICE. */
export type SignalingPeerState =
    | 'new' | 'checking' | 'connected' | 'completed'
    | 'disconnected' | 'failed' | 'closed';

/** Recovery actions the client may take for a peer state. */
export type SignalingReconnectAction = 'none' | 'ice_restart' | 'reconnect' | 'give_up';

export interface SignalingReconnectPolicyConfig {
    /** Total attempts before the client gives up (bounded retry). */
    maxAttempts: number;
    /** Delay before the first retry. */
    baseDelayMs: number;
    /** Upper bound of the backoff schedule. */
    maxDelayMs: number;
}

/**
 * Deterministic retry policy: delays are base * 2^(attempt-1), capped at
 * maxDelayMs. No jitter, no wall-clock reads — the whole schedule is a pure
 * function of the attempt number, so tests can assert it exactly.
 */
export class SignalingReconnectPolicy {
    static readonly DEFAULT: SignalingReconnectPolicyConfig = {
        maxAttempts: 5,
        baseDelayMs: 1_000,
        maxDelayMs: 15_000,
    };

    constructor(private readonly config: SignalingReconnectPolicyConfig = SignalingReconnectPolicy.DEFAULT) {}

    /**
     * Map a peer-connection state to the intended recovery action:
     *   - transient ICE loss ('disconnected') → try an ICE restart first;
     *   - hard failure ('failed'/'closed')    → full signaling reconnect;
     *   - healthy states                      → nothing to do.
     */
    static actionForPeerState(state: SignalingPeerState | string): SignalingReconnectAction {
        switch (state) {
            case 'disconnected':
                return 'ice_restart';
            case 'failed':
            case 'closed':
                return 'reconnect';
            default:
                return 'none';
        }
    }

    /** True while attempt number `attempt` (1-based) is still allowed. */
    shouldRetry(attempt: number): boolean {
        return Number.isFinite(attempt) && attempt >= 1 && attempt <= this.config.maxAttempts;
    }

    /** Backoff delay (ms) before the given 1-based attempt. Capped, deterministic. */
    delayForAttempt(attempt: number): number {
        if (!this.shouldRetry(attempt)) return 0;
        const raw = this.config.baseDelayMs * Math.pow(2, attempt - 1);
        return Math.min(raw, this.config.maxDelayMs);
    }

    /** The full deterministic schedule — used by the client and by tests. */
    schedule(): number[] {
        const out: number[] = [];
        for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
            out.push(this.delayForAttempt(attempt));
        }
        return out;
    }

    get limits(): SignalingReconnectPolicyConfig {
        return { ...this.config };
    }
}

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