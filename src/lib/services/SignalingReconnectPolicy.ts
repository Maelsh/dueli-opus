/**
 * Signaling Reconnect Policy (Phase 7.C — reconnect / resilience)
 * سياسة إعادة الاتصال للإشارات
 *
 * PURE state machine with zero imports: it maps a WebRTC peer-connection
 * state to the intended recovery action and computes the bounded retry
 * schedule (exponential backoff, capped, no jitter → deterministic and
 * testable).
 *
 * R4-LIVE-INT-1: this file is the SINGLE source of truth for the retry
 * bounds, imported by BOTH the server recovery service
 * (SignalingReconnectService) and the browser signaling client
 * (src/client/services/SignalingManager.ts, shipped in the app bundle).
 * The old pattern of embedding a JSON-baked copy of the bounds into page
 * scripts is gone — any bound change happens here once, and the parity is
 * pinned by tests (server schedule test + client source test).
 */

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

export default SignalingReconnectPolicy;
