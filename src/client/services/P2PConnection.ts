/**
 * P2P Connection Service
 * خدمة اتصال نظير لنظير
 *
 * Handles WebRTC P2P connection between host and opponent
 * يتعامل مع اتصال WebRTC بين المضيف والخصم
 *
 * R4-LIVE-INT-1: the signaling transport speaks the CURRENT platform
 * contract only — competition_id + offer/answer/ice/poll + session
 * join/leave/reconnect (the same contract consumed by the live test pages'
 * SignalingManager in src/modules/pages/live/scripts/client/shared.ts).
 * The legacy room contract (room_id + room/join + signal + room/leave +
 * room/:id/status) no longer exists server-side (404) and must never be
 * reintroduced here — no aliases, no fallback to it.
 */

export type SignalingRole = 'host' | 'opponent' | 'viewer';

export interface P2PConnectionConfig {
    /** Legacy 'comp_<id>' room label — kept for callers; the competition id is derived from it. */
    roomId: string;
    /** Preferred: explicit competition id (takes precedence over roomId parsing). */
    competitionId?: number | string;
    role: SignalingRole;
    userId: number;
    onRemoteStream?: (stream: MediaStream) => void;
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
    onError?: (error: Error) => void;
    /** Fired after a bounded session reconnect succeeds (e.g. host re-offers). */
    onReconnectNeeded?: () => void;
}

export interface RoomStatus {
    host_joined: boolean;
    opponent_joined: boolean;
    viewer_count: number;
}

// API Response types
interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
}

interface IceServersData {
    iceServers: RTCIceServer[];
}

interface PollData {
    signals: Array<{ id: number; type: string; payload: unknown; from: string | null; peer: string | null; to: string | null }>;
    role?: string;
    peer?: string;
}

/**
 * Conditional debug logger (same pattern as
 * src/modules/pages/live/scripts/client/shared.ts:42).
 * Enable in devtools: localStorage.setItem('dueli_debug', '1').
 * console.error stays for real errors; everything else goes through here
 * so production consoles stay clean.
 */
function debugLog(...args: unknown[]): void {
    try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('dueli_debug') === '1') {
            console.log.apply(console, args);
        }
    } catch { /* storage unavailable */ }
}

export class P2PConnection {
    private config: P2PConnectionConfig;
    private pc: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private pollingInterval: number | null = null;
    private isConnected: boolean = false;
    private iceServers: RTCIceServer[] = [];
    /** Numeric competition id — the only session key the platform understands. */
    private competitionId: number;
    /** Server-derived identity (never client-supplied) from session join. */
    private serverRole: string | null = null;
    private peer: string | null = null;
    /** Resume point for poll catch-up after an interruption. */
    private lastSignalId = 0;
    private reconnecting = false;

    constructor(config: P2PConnectionConfig) {
        this.config = config;
        const fromRoom = Number(String(config.roomId).replace('comp_', ''));
        const explicit = Number(config.competitionId);
        this.competitionId = Number.isFinite(explicit) && explicit > 0 ? explicit
            : Number.isFinite(fromRoom) && fromRoom > 0 ? fromRoom : NaN;
    }

    /**
     * Session auth headers — Bearer header only (SEC-11: secrets never go in
     * the URL query string).
     * Reads the canonical session id exposed by app.js (window.sessionId).
     */
    private authHeaders(): Record<string, string> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        try {
            // window.sessionId is declared on Window by src/client/index.ts.
            const sess = (typeof window !== 'undefined' && window.sessionId)
                || (typeof localStorage !== 'undefined' && localStorage.getItem('sessionId'));
            if (sess) headers['Authorization'] = 'Bearer ' + sess;
        } catch { /* storage unavailable */ }
        return headers;
    }

    /**
     * Canonical role claim for the platform gate. 'opponent' is the
     * page-local label of the guest side; viewers send no claim (the server
     * derives 'viewer' for any authorized watcher).
     */
    private claimedRole(): string | undefined {
        if (this.config.role === 'viewer') return undefined;
        return this.config.role === 'opponent' ? 'guest' : this.config.role;
    }

    /**
     * Bounded session recovery after a WebRTC/signaling interruption.
     * SSOT for the bounds is SignalingReconnectPolicy.DEFAULT server-side
     * (maxAttempts 5, backoff 1s/2s/4s/8s capped at 15s — deterministic, no
     * jitter). The values are embedded here (not imported) so the browser
     * bundle never pulls server DB code; any bound change must update both
     * places and the parity test in tests/api/live-signaling-integration.
     * 4xx authorizations are terminal — retrying can never fix them.
     */
    async reconnect(): Promise<boolean> {
        if (this.reconnecting) return false;
        this.reconnecting = true;
        try {
            for (let attempt = 1; attempt <= 5; attempt++) {
                try {
                    const body: Record<string, unknown> = { competition_id: this.competitionId };
                    const claim = this.claimedRole();
                    if (claim) body['claimed_role'] = claim;
                    const res = await fetch('/api/signaling/reconnect', {
                        method: 'POST',
                        headers: this.authHeaders(),
                        body: JSON.stringify(body)
                    });
                    if (res.ok) {
                        const json = (await res.json().catch(() => null)) as ApiResponse<{
                            role: string; peer: string; last_event_id: number;
                        }> | null;
                        if (json && json.success && json.data) {
                            this.serverRole = json.data.role ?? this.serverRole;
                            this.peer = json.data.peer ?? this.peer;
                            if (typeof json.data.last_event_id === 'number') {
                                this.lastSignalId = Math.max(this.lastSignalId, json.data.last_event_id);
                            }
                            this.reconnecting = false;
                            try { this.config.onReconnectNeeded?.(); } catch { /* hook must never break recovery */ }
                            return true;
                        }
                    }
                    if (res.status === 401 || res.status === 403 || res.status === 409) {
                        this.reconnecting = false;
                        return false;
                    }
                } catch { /* transient network error → next bounded attempt */ }
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 15000);
                await new Promise((r) => setTimeout(r, delay));
            }
            this.reconnecting = false;
            return false;
        } catch {
            this.reconnecting = false;
            return false;
        }
    }

    /**
     * Initialize the connection
     */
    async initialize(): Promise<void> {
        // Get ICE servers from signaling server
        await this.fetchIceServers();

        // Create peer connection
        this.createPeerConnection();

        // Start polling for signals
        this.startPolling();
    }

    /**
     * Fetch ICE servers from the platform (authenticated — short-lived
     * per-session TURN credentials, STUN-only fallback when unavailable).
     */
    private async fetchIceServers(): Promise<void> {
        try {
            const response = await fetch('/api/signaling/ice-servers', { headers: this.authHeaders() });
            const result: ApiResponse<IceServersData> = await response.json();
            if (result.success && result.data) {
                this.iceServers = result.data.iceServers;
            }
        } catch (error) {
            debugLog('Failed to fetch ICE servers, using defaults');
            this.iceServers = [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ];
        }
    }

    /**
     * Create and configure RTCPeerConnection
     */
    private createPeerConnection(): void {
        this.pc = new RTCPeerConnection({
            iceServers: this.iceServers
        });

        // Handle ICE candidates
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                this.sendSignal('ice-candidate', event.candidate);
            }
        };

        // Handle remote stream
        this.pc.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                this.remoteStream = event.streams[0];
                this.config.onRemoteStream?.(this.remoteStream);
            }
        };

        // Handle connection state changes
        this.pc.onconnectionstatechange = () => {
            const state = this.pc?.connectionState || 'closed';
            this.isConnected = state === 'connected';
            this.config.onConnectionStateChange?.(state);

            if (state === 'failed' || state === 'disconnected') {
                this.config.onError?.(new Error(`Connection ${state}`));
                // Bounded session recovery: re-announce presence so the
                // session state stays accurate and poll catch-up resumes from
                // lastSignalId. Renegotiation (re-offer) stays with the page
                // via onReconnectNeeded — no unbounded retry here.
                void this.reconnect();
            }
        };
    }

    /**
     * Join the live session (also the presence heartbeat entry point).
     * Idempotent: re-joining after a refresh/reconnect resumes the same
     * session — the role/peer below are SERVER-derived, never trusted from
     * the client claim.
     */
    async joinRoom(): Promise<boolean> {
        try {
            const body: Record<string, unknown> = { competition_id: this.competitionId };
            const claim = this.claimedRole();
            if (claim) body['claimed_role'] = claim;
            const response = await fetch('/api/signaling/session/join', {
                method: 'POST',
                headers: this.authHeaders(),
                body: JSON.stringify(body)
            });

            if (!response.ok) return false;
            const result: ApiResponse<{ role: string; peer: string }> = await response.json();
            if (result.success && result.data) {
                this.serverRole = result.data.role ?? null;
                this.peer = result.data.peer ?? null;
            }
            return result.success === true;
        } catch (error) {
            console.error('Failed to join session:', error);
            return false;
        }
    }

    /**
     * Initialize local media stream
     * @param constraints - Media constraints
     */
    async initLocalStream(constraints?: MediaStreamConstraints): Promise<MediaStream> {
        const defaultConstraints: MediaStreamConstraints = {
            video: {
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 30 }
            },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        };

        try {
            this.localStream = await navigator.mediaDevices.getUserMedia(
                constraints || defaultConstraints
            );

            // Add tracks to peer connection
            if (this.pc && this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    this.pc!.addTrack(track, this.localStream!);
                });
            }

            return this.localStream;
        } catch (error) {
            console.error('[P2P] Camera/Mic access failed:', error);
            throw new Error('Failed to access camera/microphone. Please use Screen Share instead.');
        }
    }


    /**
     * Get local stream
     */
    getLocalStream(): MediaStream | null {
        return this.localStream;
    }

    /**
     * Get remote stream
     */
    getRemoteStream(): MediaStream | null {
        return this.remoteStream;
    }

    /**
     * Create and send offer (host only)
     */
    async createOffer(): Promise<void> {
        if (!this.pc) return;

        try {
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            await this.sendSignal('offer', offer);
        } catch (error) {
            console.error('Failed to create offer:', error);
            this.config.onError?.(error as Error);
        }
    }

    /**
     * Handle incoming offer and create answer (opponent only)
     */
    private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
        if (!this.pc) return;

        try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            await this.sendSignal('answer', answer);
        } catch (error) {
            console.error('Failed to handle offer:', error);
            this.config.onError?.(error as Error);
        }
    }

    /**
     * Handle incoming answer (host only)
     */
    private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
        if (!this.pc) return;

        try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (error) {
            console.error('Failed to handle answer:', error);
            this.config.onError?.(error as Error);
        }
    }

    /**
     * Handle incoming ICE candidate
     */
    private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (!this.pc) return;

        try {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
        }
    }

    /**
     * Send a signal to the platform (offer/answer/ice/request_offer).
     * The server stamps the sender identity and validates the target
     * server-side — a client can never retarget outside its role's reach.
     */
    private async sendSignal(type: string, data: any, target?: string | null): Promise<void> {
        const endpoint = type === 'offer' ? '/api/signaling/offer'
            : type === 'answer' ? '/api/signaling/answer'
            : type === 'ice' || type === 'ice-candidate' ? '/api/signaling/ice'
            : type === 'request_offer' ? '/api/signaling/request-offer'
            : null;
        if (!endpoint) return;
        try {
            const body: Record<string, unknown> = {
                competition_id: this.competitionId,
                payload: data
            };
            if (target) body['to'] = target;
            await fetch(endpoint, {
                method: 'POST',
                headers: this.authHeaders(),
                body: JSON.stringify(body)
            });
        } catch (error) {
            console.error('Failed to send signal:', error);
        }
    }

    /**
     * Start polling for signals
     */
    private startPolling(): void {
        this.pollingInterval = window.setInterval(async () => {
            await this.pollSignals();
        }, 1000); // Poll every second
    }

    /**
     * Poll for peer signals (platform poll — session auth via Bearer, role
     * re-derived server-side per request). Signals addressed to another peer
     * are never consumed; lastSignalId is the resume point after any
     * interruption (no replay, no loss on refresh).
     */
    private async pollSignals(): Promise<void> {
        try {
            const endpoint = this.config.role === 'viewer' ? '/api/signaling/viewer/poll' : '/api/signaling/poll';
            const response = await fetch(
                `${endpoint}?competition_id=${this.competitionId}&since=${this.lastSignalId}`,
                { headers: this.authHeaders() }
            );
            if (!response.ok) return;
            const result: ApiResponse<PollData> = await response.json();

            if (result.success && result.data?.signals) {
                if (result.data.role) this.serverRole = result.data.role;
                if (result.data.peer) this.peer = result.data.peer;
                for (const signal of result.data.signals) {
                    if (typeof signal.id === 'number') {
                        this.lastSignalId = Math.max(this.lastSignalId, signal.id);
                    }
                    // Peer-scoped visibility: never consume another peer's signal.
                    if (signal.to && this.peer && signal.to !== this.peer) continue;
                    await this.handleSignal({ type: signal.type, data: signal.payload });
                }
            }
        } catch (error) {
            console.error('Polling error:', error);
        }
    }

    /**
     * Handle incoming signal
     */
    private async handleSignal(signal: { type: string; data: any }): Promise<void> {
        switch (signal.type) {
            case 'offer':
                await this.handleOffer(signal.data);
                break;
            case 'answer':
                await this.handleAnswer(signal.data);
                break;
            case 'ice-candidate':
            case 'ice':
                await this.handleIceCandidate(signal.data);
                break;
        }
    }

    /**
     * Check session presence (host/guest/viewers) — read-only, derived
     * server-side from the live session. Keeps the page's existing
     * host_joined/opponent_joined contract without any room endpoint.
     */
    async getRoomStatus(): Promise<RoomStatus | null> {
        try {
            const response = await fetch(
                `/api/signaling/session?competition_id=${this.competitionId}`,
                { headers: this.authHeaders() }
            );
            if (!response.ok) return null;
            const result = await response.json() as any;
            const presence = result?.data?.presence;
            if (!result.success || !presence) return null;
            return {
                host_joined: !!presence.host,
                opponent_joined: !!presence.guest,
                viewer_count: typeof presence.viewer_count === 'number' ? presence.viewer_count : 0
            };
        } catch (error) {
            console.error('Failed to get session presence:', error);
            return null;
        }
    }

    /**
     * Check if connected
     */
    isP2PConnected(): boolean {
        return this.isConnected;
    }

    /**
     * Disconnect and cleanup
     */
    async disconnect(): Promise<void> {
        // Stop polling
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
        }

        // Stop local tracks
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        // Close peer connection
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        // Withdraw presence so other peers see the session state update.
        // Platform signals live in the SSE log; the session lifecycle ends
        // with the competition — never with a host interruption.
        try {
            await fetch('/api/signaling/session/leave', {
                method: 'POST',
                headers: this.authHeaders(),
                body: JSON.stringify({
                    competition_id: this.competitionId
                })
            });
        } catch (error) {
            console.error('Failed to leave session:', error);
        }

        this.isConnected = false;
    }
}

export default P2PConnection;
