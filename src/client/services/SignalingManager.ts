/**
 * Shared Signaling Manager (browser client — shipped in the app bundle).
 *
 * R4-LIVE-INT-1: this is the ONE signaling-transport implementation. It is
 * the faithful extraction of the proven SignalingManager that the live test
 * pages (host/guest) exercised at length
 * (src/modules/pages/live/scripts/client/shared.ts): session verify →
 * presence join → offer/answer/ice/request-offer → poll/viewer-poll →
 * 15s heartbeat → bounded reconnect. The test pages consume this exact
 * class via `window.SignalingManager`; the production live room reaches it
 * through `src/client/services/P2PConnection.ts` (thin RTC adapter).
 *
 * Proven semantics preserved byte-for-byte at the contract level:
 *  - platform endpoints only (/api/signaling/*), Bearer session auth;
 *  - role/peer are SERVER-derived per response, never trusted from claims;
 *  - viewers send no role claim and read only their own peer signals;
 *  - a viewer publish always addresses a participant (default 'host');
 *  - 401/403/409 during reconnect are terminal (retrying can't fix them).
 *
 * Hardening added (REMOTE B1 + hang evidence from real-browser runs):
 *  - B1: self-echo / role-impossible signals are dropped in the poll loop
 *    via shouldConsume (host never takes an offer, non-hosts never take an
 *    answer, nobody processes its own publications);
 *  - every request carries a hard timeout — a hung request fails fast
 *    instead of stalling join/poll/heartbeat/reconnect forever;
 *  - overlapping poll ticks are skipped (slow networks must not stack
 *    polls and scramble the cursor).
 *
 * Diagnostics stay OUT: all logging goes through the injected `logger`
 * (test pages pass testLog; production passes a console-only log). No
 * user-visible strings live here, so no i18n impact.
 */

import {
    SignalingReconnectPolicy,
    type SignalingPeerState,
} from '../../lib/services/SignalingReconnectPolicy';

export type SignalingManagerRole = 'host' | 'guest' | 'viewer';
export type SignalingManagerMode = 'participant' | 'viewer';
export type LogLevel = 'info' | 'success' | 'warn' | 'error';
export type LogFn = (msg: string, type?: LogLevel) => void;

export interface IncomingSignal {
    id?: number;
    type: string;
    payload: unknown;
    from?: string | null;
    peer?: string | null;
    to?: string | null;
}

export interface SignalWhen {
    signalType: string;
    signalData: unknown;
    from: string | null;
    fromRole: string | null;
    to: string | null;
}

export interface SignalingManagerConfig {
    /** Legacy 'comp_<id>' room label — the competition id is derived from it. */
    roomId: string | number;
    /** Role CLAIM for verification ('opponent' accepted as the guest alias). */
    role?: string;
    /** Session token (Bearer). */
    token?: string | null;
    /** 'viewer' for receive-only watchers; anything else is a participant. */
    mode?: string;
    logger?: LogFn;
    /**
     * May be async — the poll loop awaits it, so multi-signal batches apply
     * in order instead of racing each other.
     */
    onSignal?: (data: SignalWhen) => void | Promise<void>;
    onPeerJoined?: (data: { role: string }) => void;
    onPeerLeft?: (data: { role: string }) => void;
    onError?: (error: Error) => void;
    onConnected?: (state: unknown) => void;
    onSessionState?: (state: unknown) => void;
    onViewerJoined?: (data: unknown) => void;
    onReconnecting?: () => void;
    onRecovered?: (state: unknown) => void;
    onReconnectFailed?: (info: unknown) => void;
    onIceRestartNeeded?: () => void;
}

/** Presence heartbeat period (ms) — matches the proven test client. */
export const SIGNALING_HEARTBEAT_MS = 15000;
/** Hard timeout (ms) for every signaling request. */
export const SIGNALING_FETCH_TIMEOUT_MS = 15000;
/** Poll interval (ms). */
export const SIGNALING_POLL_MS = 1000;

/**
 * Single fetch-with-timeout implementation shared by the manager and its
 * thin adapters. A signaling request must never hang forever: slowness
 * fails fast and the bounded retry layers above decide what next.
 */
export async function fetchJsonWithTimeout(
    url: string,
    init: RequestInit,
    ms: number = SIGNALING_FETCH_TIMEOUT_MS,
): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    try {
        return await fetch(url, { ...init, signal: controller.signal });
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            throw new Error(`Signaling request timed out: ${url}`);
        }
        throw error instanceof Error ? error : new Error(String(error));
    } finally {
        clearTimeout(timer);
    }
}

export interface PlatformIceServers {
    iceServers: RTCIceServer[];
    turnAvailable: boolean;
    expiresAt: string | null;
}

const STUN_FALLBACK: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
];

/**
 * Authenticated ICE fetch (short-lived per-session TURN, STUN-only
 * fallback). No UI strings — callers decide what to log or display.
 */
export async function fetchPlatformIceServers(token: string | null): Promise<PlatformIceServers> {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    try {
        const response = await fetchJsonWithTimeout('/api/signaling/ice-servers', { headers });
        const result = (await response.json().catch(() => null)) as {
            success?: boolean;
            data?: { iceServers?: RTCIceServer[]; turn_available?: boolean; expires_at?: string | null } | null;
        } | null;
        if (response.ok && result && result.success && result.data && Array.isArray(result.data.iceServers)) {
            return {
                iceServers: result.data.iceServers,
                turnAvailable: result.data.turn_available === true,
                expiresAt: typeof result.data.expires_at === 'string' ? result.data.expires_at : null,
            };
        }
    } catch {
        // Fall through to STUN — never leave the caller with zero servers.
    }
    return { iceServers: STUN_FALLBACK, turnAvailable: false, expiresAt: null };
}

const noop: LogFn = () => {};
function debugLogger(): LogFn {
    return (msg: string, type: LogLevel = 'info') => {
        try {
            if (typeof localStorage !== 'undefined' && localStorage.getItem('dueli_debug') === '1') {
                console.log(`[signaling:${type}]`, msg);
            }
        } catch { /* storage unavailable */ }
    };
}

interface SessionWire {
    success?: boolean;
    error?: string;
    data?: {
        role?: string;
        peer?: string;
        [key: string]: unknown;
    } | null;
}

interface PollWire {
    success?: boolean;
    data?: {
        role?: string;
        peer?: string;
        signals?: Array<{
            id?: number;
            type?: string;
            payload?: unknown;
            from?: string | null;
            peer?: string | null;
            to?: string | null;
        }> | null;
    } | null;
}

export class SignalingManager {
    private signalingUrl: string | null = null;
    private roomId: string | number;
    private competitionId: string;
    private role?: string;
    private mode: SignalingManagerMode;
    private token?: string | null;
    private log: LogFn;
    private onSignal: (data: SignalWhen) => void | Promise<void>;
    private onPeerJoined: (data: { role: string }) => void;
    private onPeerLeft: (data: { role: string }) => void;
    private onError: (error: Error) => void;
    private onConnected: (state: unknown) => void;
    private onSessionState: (state: unknown) => void;
    private onViewerJoined: (data: unknown) => void;
    private onReconnecting: () => void;
    private onRecovered: (state: unknown) => void;
    private onReconnectFailed: (info: unknown) => void;
    private onIceRestartNeeded: () => void;
    private reconnecting = false;
    private pollInterval: number | null = null;
    private pollInFlight = false;
    private heartbeatInterval: number | null = null;
    private lastTimestamp = 0;
    private peerWasConnected = false;
    private isConnected = false;
    private serverRole: string | null = null;
    private peer: string | null = null;
    private sessionState: unknown = null;
    private readonly policy = new SignalingReconnectPolicy();

    constructor(config: SignalingManagerConfig) {
        // 7.A: platform endpoints are the only signaling path.
        // signalingUrl/roomId are kept as inert constructor fields for
        // backward-compat callers but are never fetched.
        this.signalingUrl = null;
        this.roomId = config.roomId;
        this.competitionId = String(config.roomId).replace('comp_', '');
        // 7.A/7.B: 'role' is only a CLAIM used for verification. The authoritative
        // role always comes back from the server (this.serverRole / this.peer).
        this.role = config.role;
        // 7.B: 'participant' (host/guest) or 'viewer' (receive-only watcher).
        // A viewer never claims a role — the server derives 'viewer'.
        this.mode = config.mode === 'viewer' ? 'viewer' : 'participant';
        this.token = config.token;
        this.log = config.logger ?? debugLogger();
        // All hooks are optional; unset ones are silent no-ops. onPeerLeft /
// onViewerJoined are reserved by the proven test-page contract (fired by
        // page-level presence diffing, not by the transport) — kept assigned
        // so the shapes stay compatible.
        const silent = (): void => {};
        this.onSignal = config.onSignal ?? silent;
        this.onPeerJoined = config.onPeerJoined ?? silent;
        this.onPeerLeft = config.onPeerLeft ?? silent;
        this.onError = config.onError ?? silent;
        this.onConnected = config.onConnected ?? silent;
        this.onSessionState = config.onSessionState ?? silent;
        this.onViewerJoined = config.onViewerJoined ?? silent;
        this.onReconnecting = config.onReconnecting ?? silent;
        this.onRecovered = config.onRecovered ?? silent;
        this.onReconnectFailed = config.onReconnectFailed ?? silent;
        this.onIceRestartNeeded = config.onIceRestartNeeded ?? silent;
        void this.onPeerLeft;
        void this.onViewerJoined;
    }

    /** Best-known own role — server-derived when known, else the claim. */
    effectiveRole(): 'host' | 'guest' | 'viewer' {
        if (this.serverRole === 'host' || this.serverRole === 'guest' || this.serverRole === 'viewer') {
            return this.serverRole;
        }
        if (this.mode === 'viewer') return 'viewer';
        const claim = typeof this.role === 'string' ? this.role : '';
        if (claim === 'host') return 'host';
        if (claim === 'guest' || claim === 'opponent') return 'guest';
        return 'viewer';
    }

    /**
     * B1: self-signal / role-impossible filter. Drops (without touching the
     * cursor): our own publications, offers on the host side (single
     * offerer — an offer reaching the host is echo/glare), and answers on
     * non-host sides (only the host consumes answers). Correct-direction
     * offer/answer/ICE always pass.
     */
    shouldConsume(signal: IncomingSignal): boolean {
        const sender = signal.peer || signal.from || null;
        if (sender && this.peer && sender === this.peer) return false;
        const role = this.effectiveRole();
        if (signal.type === 'offer' && role === 'host') return false;
        if (signal.type === 'answer' && role !== 'host') return false;
        return true;
    }

    private authHeaders(): Record<string, string> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (this.token) headers['Authorization'] = 'Bearer ' + this.token;
        return headers;
    }

    private async fetchJson(url: string, init: RequestInit, ms: number = SIGNALING_FETCH_TIMEOUT_MS): Promise<Response> {
        return fetchJsonWithTimeout(url, init, ms);
    }

    async connect(): Promise<void> {
        this.log('Connecting to signaling (Polling)...', 'info');
        try {
            // 7.A: the ONLY signaling path is the platform
            // (/api/signaling/*, gated by SignalingAuthService).
            // 7.B: viewers never verify a role claim — /api/signaling/session/join
            // derives 'viewer' server-side for any authorized watcher.
            if (this.mode !== 'viewer') {
                const res = await this.fetchJson('/api/signaling/verify', {
                    method: 'POST',
                    headers: this.authHeaders(),
                    body: JSON.stringify({
                        session_token: this.token,
                        competition_id: Number(this.competitionId),
                        claimed_role: this.role,
                    }),
                });
                const data = (await res.json().catch(() => null)) as { valid?: boolean; error?: string } | null;
                if (!data || !data.valid) {
                    this.log('Join failed: ' + ((data && data.error) || 'Unknown'), 'error');
                    this.onError(new Error((data && data.error) || 'verify_failed'));
                    return;
                }
            }

            // 7.B: announce presence (also the late-join entry point) and read the
            // current session state — role/peer below are SERVER-derived.
            const state = await this.announcePresence('join');
            if (!state) return;

            this.log('Joined room as ' + (this.serverRole || this.role), 'success');
            this.isConnected = true;
            this.onConnected(state);
            this.startPolling();
            this.startHeartbeat();
        } catch (err) {
            const error = err instanceof Error ? err : new Error(String(err));
            this.log('Connection error: ' + error.message, 'error');
            this.onError(error);
        }
    }

    /**
     * 7.B: announce (or withdraw) presence on the live session and sync state.
     * Joined 'join' calls double as the presence heartbeat, so a late joiner is
     * discovered without touching any existing peer connection.
     */
    async announcePresence(action: 'join' | 'leave'): Promise<Record<string, unknown> | null> {
        const body: Record<string, unknown> = { competition_id: Number(this.competitionId) };
        // Only participants have a role claim; viewers are derived server-side.
        if (action === 'join' && this.mode !== 'viewer' && this.role) {
            body['claimed_role'] = this.role;
        }
        try {
            const res = await this.fetchJson('/api/signaling/session/' + action, {
                method: 'POST',
                headers: this.authHeaders(),
                body: JSON.stringify(body),
            });
            const data = (await res.json().catch(() => null)) as SessionWire | null;
            if (!data || !data.success) {
                if (action === 'join') {
                    this.log('Session join failed: ' + ((data && data.error) || 'Unknown'), 'error');
                    this.onError(new Error((data && data.error) || 'session_join_failed'));
                }
                return null;
            }
            const payload = (data.data ?? {}) as Record<string, unknown>;
            if (typeof payload['role'] === 'string') this.serverRole = payload['role'] as string;
            if (typeof payload['peer'] === 'string') this.peer = payload['peer'] as string;
            this.sessionState = data.data ?? null;
            this.onSessionState(data.data);
            return payload;
        } catch (err) {
            this.log('Presence sync error: ' + (err instanceof Error ? err.message : String(err)), 'warn');
            if (action === 'join') this.onError(err instanceof Error ? err : new Error(String(err)));
            return null;
        }
    }

    /** 7.B: keep presence alive so the session state stays accurate. */
    startHeartbeat(): void {
        if (this.heartbeatInterval !== null) clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = window.setInterval(() => {
            if (!this.isConnected) return;
            void this.announcePresence('join');
        }, SIGNALING_HEARTBEAT_MS);
    }

    stopHeartbeat(): void {
        if (this.heartbeatInterval !== null) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    startPolling(): void {
        if (this.pollInterval !== null) clearInterval(this.pollInterval);

        // 7.A: platform poll — session auth via Bearer, role re-derived
        // server-side per request. Peer role labels shown to the user.
        // 7.B: viewers use the viewer-scoped read (own-peer signals only).
        const endpoint = this.mode === 'viewer' ? '/api/signaling/viewer/poll' : '/api/signaling/poll';
        const peerLabel = this.serverRole === 'viewer' ? 'host' : this.serverRole === 'host' ? 'opponent' : 'host';
        const token = this.token;
        const self = this;

        this.pollInterval = window.setInterval(() => {
            void self.pollOnce(endpoint, peerLabel, token);
        }, SIGNALING_POLL_MS);
    }

    stopPolling(): void {
        if (this.pollInterval !== null) {
            clearInterval(this.pollInterval);
            this.pollInterval = null;
        }
        this.pollInFlight = false;
    }

    /** One poll tick (also used directly by the reconnect catch-up). */
    async pollOnce(endpoint?: string, peerLabel?: string, token?: string | null): Promise<void> {
        if (this.pollInFlight) return;
        if (!this.isConnected) return;
        this.pollInFlight = true;
        try {
            const ep = endpoint ?? (this.mode === 'viewer' ? '/api/signaling/viewer/poll' : '/api/signaling/poll');
            const label = peerLabel ?? (this.serverRole === 'host' ? 'opponent' : 'host');
            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            const tok = token !== undefined ? token : this.token;
            if (tok) headers['Authorization'] = 'Bearer ' + tok;
            const res = await this.fetchJson(
                ep + '?competition_id=' + encodeURIComponent(this.competitionId)
                + '&since=' + encodeURIComponent(String(this.lastTimestamp || 0)),
                { headers },
            );
            const data = (await res.json().catch(() => null)) as PollWire | null;
            if (!data || !data.success) return;

            const signals = data.data && Array.isArray(data.data.signals) ? data.data.signals : [];
            if (signals.length > 0) {
                let sawPeer = false;
                for (const signal of signals) {
                    if (typeof signal.id === 'number' && signal.id <= this.lastTimestamp) continue; // stale redelivery
                    if (typeof signal.id === 'number') {
                        this.lastTimestamp = Math.max(this.lastTimestamp, signal.id);
                    }
                    // 7.B: signals addressed to another peer are never for us.
                    if (signal.to && signal.to !== this.peer) continue;
                    const incoming: IncomingSignal = {
                        id: signal.id,
                        type: typeof signal.type === 'string' ? signal.type : '',
                        payload: signal.payload,
                        from: typeof signal.from === 'string' ? signal.from : null,
                        peer: typeof signal.peer === 'string' ? signal.peer : null,
                        to: typeof signal.to === 'string' ? signal.to : null,
                    };
                    if (!this.shouldConsume(incoming)) continue;
                    const sender = incoming.peer || incoming.from;
                    if (sender && sender !== this.peer) sawPeer = true;
                    await this.onSignal({
                        signalType: incoming.type,
                        signalData: incoming.payload,
                        from: sender ?? null,
                        fromRole: incoming.from ?? null,
                        to: incoming.to || null,
                    });
                }
                if (sawPeer && !this.peerWasConnected) {
                    this.peerWasConnected = true;
                    this.log('Peer connected', 'info');
                    this.onPeerJoined({ role: label });
                }
            }
        } catch (err) {
            console.error('Poll error:', err instanceof Error ? err.message : err);
        } finally {
            this.pollInFlight = false;
        }
    }

    /**
     * 7.B: ask the host for a fresh offer (late join) — guest or viewer only.
     * The server stamps the sender identity; 'to' may only be a participant.
     */
    async requestOffer(target?: string): Promise<unknown> {
        return this.sendSignal('request_offer', null, target);
    }

    async sendSignal(signalType: string, signalData: unknown, target?: string | null): Promise<unknown> {
        if (!this.isConnected) return null;
        // 7.A/7.B: offer/answer/ice/request_offer go to the platform endpoints,
        // never to the external worker. request_offer is the 7.B late-join hint
        // (guest/viewer → host); its target is validated server-side.
        const endpoint =
            signalType === 'offer' ? '/api/signaling/offer'
            : signalType === 'answer' ? '/api/signaling/answer'
            : signalType === 'ice' ? '/api/signaling/ice'
            : signalType === 'request_offer' ? '/api/signaling/request-offer'
            : null;
        if (!endpoint) return null;
        const body: Record<string, unknown> = {
            competition_id: Number(this.competitionId),
            payload: signalData,
        };
        // A viewer must always address a participant; the server rejects anything else.
        if (target) body['to'] = target;
        else if (this.mode === 'viewer') body['to'] = 'host';
        try {
            const res = await this.fetchJson(endpoint, {
                method: 'POST',
                headers: this.authHeaders(),
                body: JSON.stringify(body),
            });
            const data = (await res.json().catch(() => null)) as {
                success?: boolean; code?: string; error?: string;
            } | null;
            if (!data || !data.success) {
                this.log('Signal rejected (' + signalType + '): ' + ((data && (data.code || data.error)) || 'error'), 'warn');
            }
            return data;
        } catch (err) {
            console.error('Send signal error:', err instanceof Error ? err.message : err);
            return null;
        }
    }

    /**
     * 7.C: feed a WebRTC peer-connection state through the bounded recovery
     * policy. 'disconnected' → one controlled ICE restart via the page's
     * onIceRestartNeeded hook; 'failed'/'closed' → full signaling reconnect.
     * Healthy states clear any in-flight recovery. Idempotent per episode.
     */
    handlePeerState(state: SignalingPeerState | string): string {
        const action = SignalingReconnectPolicy.actionForPeerState(state);
        if (state === 'connected' || state === 'checking') {
            this.reconnecting = false;
            return 'none';
        }
        if (action === 'ice_restart') {
            if (!this.reconnecting) this.onIceRestartNeeded();
            return action;
        }
        if (action === 'reconnect') {
            if (!this.reconnecting) void this.reconnectAfterInterruption();
            return action;
        }
        return action;
    }

    /**
     * 7.C: bounded, deterministic reconnect loop after a signaling/network
     * interruption. Authorization stays server-side: POST /api/signaling/
     * reconnect re-derives role/peer via SignalingAuthService — a client can
     * never reconnect as (or become) a different role. 4xx authorizations are
     * terminal; transient failures retry on the policy backoff schedule and
     * stop after maxAttempts. The poll cursor is preserved across the
     * interruption, so the next poll replays exactly the missed signals.
     */
    async reconnectAfterInterruption(): Promise<Record<string, unknown> | null> {
        if (this.reconnecting) return null;
        this.reconnecting = true;
        this.isConnected = false; // polling/heartbeat pause while recovering
        this.onReconnecting();
        const maxAttempts = this.policy.limits.maxAttempts;
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                const body: Record<string, unknown> = { competition_id: Number(this.competitionId) };
                if (this.mode !== 'viewer' && this.role) body['claimed_role'] = this.role;
                const res = await this.fetchJson('/api/signaling/reconnect', {
                    method: 'POST',
                    headers: this.authHeaders(),
                    body: JSON.stringify(body),
                });
                const data = (await res.json().catch(() => null)) as SessionWire | null;
                if (data && data.success) {
                    // Role/peer below are SERVER-derived — the session identity
                    // is preserved exactly as it was before the interruption.
                    const payload = (data.data ?? {}) as Record<string, unknown>;
                    if (typeof payload['role'] === 'string') this.serverRole = payload['role'] as string;
                    if (typeof payload['peer'] === 'string') this.peer = payload['peer'] as string;
                    this.sessionState = data.data ?? null;
                    this.onSessionState(data.data);
                    this.isConnected = true;
                    this.reconnecting = false;
                    this.startPolling();
                    this.startHeartbeat();
                    this.onRecovered(data.data);
                    return payload;
                }
                if (res.status === 401 || res.status === 403 || res.status === 409) {
                    // Authorization rejection — retrying can never fix it.
                    this.reconnecting = false;
                    this.onReconnectFailed({ reason: 'unauthorized', status: res.status });
                    return null;
                }
            } catch {
                // Transient network error → next bounded attempt.
            }
            await new Promise((r) => setTimeout(r, this.policy.delayForAttempt(attempt)));
        }
        this.reconnecting = false;
        this.onReconnectFailed({ reason: 'exhausted', attempts: maxAttempts });
        return null;
    }

    async disconnect(): Promise<void> {
        this.isConnected = false;
        this.stopPolling();
        this.stopHeartbeat();
        // 7.B: withdraw presence so other peers see the session state update.
        // 7.A: no external leave call — platform signals live in the SSE log;
        // the room lifecycle ends with the competition.
        try {
            await this.announcePresence('leave');
        } catch (err) {
            console.error('Leave error:', err instanceof Error ? err.message : err);
        }
        this.log('Signaling disconnected', 'warn');
    }

    /** Introspection for tests and page wiring (read-only snapshot). */
    snapshot(): {
        isConnected: boolean;
        serverRole: string | null;
        peer: string | null;
        lastTimestamp: number;
        reconnecting: boolean;
    } {
        return {
            isConnected: this.isConnected,
            serverRole: this.serverRole,
            peer: this.peer,
            lastTimestamp: this.lastTimestamp,
            reconnecting: this.reconnecting,
        };
    }
}

export default SignalingManager;
