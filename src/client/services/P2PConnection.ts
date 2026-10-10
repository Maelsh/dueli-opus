/**
 * P2P Connection Service (production live room adapter)
 * خدمة اتصال نظير لنظير
 *
 * Handles WebRTC P2P connection between host and opponent
 * يتعامل مع اتصال WebRTC بين المضيف والخصم
 *
 * R4-LIVE-INT-1: this class is a THIN adapter. All signaling transport
 * (session verify/join, offer/answer/ice/request-offer, poll/viewer-poll,
 * 15s heartbeat, bounded reconnect, self/role filtering) lives in the ONE
 * shared implementation, src/client/services/SignalingManager.ts — the
 * faithful extraction of the proven live-test-pages client. This adapter
 * owns only the RTCPeerConnection lifecycle and local/remote media tracks,
 * exactly like the proven test host/guest flows do at page level.
 *
 * The legacy room contract (room_id + room/join + signal + room/leave +
 * room/:id/status) no longer exists server-side (404) and must never be
 * reintroduced here — no aliases, no fallback to it.
 */

import {
    SignalingManager,
    fetchPlatformIceServers,
    fetchJsonWithTimeout,
    type SignalWhen,
} from './SignalingManager';

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

/** Cap for ICE candidates queued before a remote description exists. */
const MAX_PENDING_ICE = 100;

interface PendingIce {
    generation: number;
    candidate: RTCIceCandidateInit;
}

/**
 * Conditional debug logger (same pattern as the shared signaling manager).
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
    private isConnected: boolean = false;
    private iceServers: RTCIceServer[] = [];
    /** Numeric competition id — the only session key the platform understands. */
    private competitionId: number;
    /** Shared transport (the single signaling implementation). */
    private signaling: SignalingManager | null = null;
    /** B2: ICE candidates that arrived before a remote description existed. */
    private pendingIce: PendingIce[] = [];
    private hasRemoteDescription = false;
    /**
     * Bumped on every initialize()/disconnect() so queued candidates can
     * never leak across sessions or connection attempts.
     */
    private sessionGeneration = 0;

    constructor(config: P2PConnectionConfig) {
        this.config = config;
        const fromRoom = Number(String(config.roomId).replace('comp_', ''));
        const explicit = Number(config.competitionId);
        this.competitionId = Number.isFinite(explicit) && explicit > 0 ? explicit
            : Number.isFinite(fromRoom) && fromRoom > 0 ? fromRoom : NaN;
    }

    /**
     * Session token for Bearer auth (never ?token=, SEC-11).
     * Reads the canonical session id exposed by app.js (window.sessionId).
     */
    private sessionToken(): string | null {
        try {
            // window.sessionId is declared on Window by src/client/index.ts.
            const sess = (typeof window !== 'undefined' && window.sessionId)
                || (typeof localStorage !== 'undefined' && localStorage.getItem('sessionId'));
            return sess || null;
        } catch {
            return null;
        }
    }

    private authHeaders(): Record<string, string> {
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        const sess = this.sessionToken();
        if (sess) headers['Authorization'] = 'Bearer ' + sess;
        return headers;
    }

    /**
     * Initialize the connection (ICE + peer connection; signaling transport
     * starts on joinRoom, mirroring the proven test flows).
     */
    async initialize(): Promise<void> {
        // New connection attempt: fresh ICE generation so no candidate from a
        // previous attempt can ever be applied to this peer connection.
        this.sessionGeneration++;
        this.pendingIce = [];
        this.hasRemoteDescription = false;

        // Authenticated ICE (short-lived per-session TURN, STUN fallback).
        const ice = await fetchPlatformIceServers(this.sessionToken());
        this.iceServers = ice.iceServers;

        // Create peer connection
        this.createPeerConnection();
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
                void this.sendSignal('ice', event.candidate);
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
                // Bounded session recovery lives in the shared transport:
                // 'disconnected' → one controlled ICE restart (re-offer or a
                // fresh request, per role); 'failed'/'closed' → bounded
                // signaling reconnect. No unbounded retry here.
                void this.signaling?.handlePeerState(state);
            }
        };
    }

    /**
     * Join the live session through the shared transport (verify + presence
     * join + poll + heartbeat, all with server-derived role/peer).
     * Idempotent: re-joining after a refresh/reconnect resumes the same
     * session and re-arms a single heartbeat (never doubled).
     */
    async joinRoom(): Promise<boolean> {
        if (this.signaling) {
            try { await this.signaling.disconnect(); } catch { /* best effort */ }
            this.signaling = null;
        }
        const manager = new SignalingManager({
            roomId: this.config.roomId,
            role: this.config.role,
            token: this.sessionToken(),
            mode: this.config.role === 'viewer' ? 'viewer' : 'participant',
            logger: (msg, type = 'info') => debugLog('[signaling]', type, msg),
            onSignal: (data) => this.handleIncoming(data),
            onError: (error) => this.config.onError?.(error),
            onIceRestartNeeded: () => {
                // Proven recovery mapping: the host re-offers (no rebuild);
                // guest/viewer ask the host for a fresh offer instead —
                // answering is driven by offers, and a guest can never offer.
                if (manager.effectiveRole() === 'host') {
                    void this.createOffer();
                } else {
                    void manager.requestOffer();
                }
            },
            onRecovered: () => {
                try { this.config.onReconnectNeeded?.(); } catch { /* hook must never break recovery */ }
            },
            onReconnectFailed: (info) => {
                const reason = info && typeof info === 'object' && 'reason' in info
                    ? String((info as { reason: unknown }).reason) : 'reconnect_failed';
                this.config.onError?.(new Error(`Signaling reconnect failed: ${reason}`));
            },
        });
        this.signaling = manager;
        await manager.connect();
        return manager.snapshot().isConnected;
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
     * Create and send offer (host only — the transport drops offers published
     * by any other role, and the server rejects them).
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
     * Dispatch an incoming platform signal to the RTC layer. Transport-level
     * filtering (self-echo, role-impossible, peer-scoped) already happened in
     * the shared manager — this layer applies WebRTC semantics only.
     */
    private async handleIncoming(data: SignalWhen): Promise<void> {
        switch (data.signalType) {
            case 'offer':
                await this.handleOffer(data.signalData as RTCSessionDescriptionInit);
                break;
            case 'answer':
                await this.handleAnswer(data.signalData as RTCSessionDescriptionInit);
                break;
            case 'ice':
                await this.handleIceCandidate(data.signalData as RTCIceCandidateInit);
                break;
            case 'request_offer':
                // Late-join hint: the host re-offers without rebuilding the
                // link (mirrors the proven test host). Non-hosts ignore it.
                if (this.signaling && this.signaling.effectiveRole() === 'host') {
                    await this.createOffer();
                }
                break;
        }
    }

    /**
     * Handle incoming offer and create answer.
     */
    private async handleOffer(offer: RTCSessionDescriptionInit): Promise<void> {
        if (!this.pc) return;
        const generation = this.sessionGeneration;

        try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
            if (!this.pc || generation !== this.sessionGeneration) return; // stale attempt
            this.hasRemoteDescription = true;
            // Apply queued candidates in arrival order before answering.
            await this.drainIceQueue(generation);
            if (!this.pc || generation !== this.sessionGeneration) return; // stale attempt
            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);
            await this.sendSignal('answer', answer);
        } catch (error) {
            console.error('Failed to handle offer:', error);
            this.config.onError?.(error as Error);
        }
    }

    /**
     * Handle incoming answer.
     */
    private async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
        if (!this.pc) return;
        const generation = this.sessionGeneration;

        try {
            await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
            if (!this.pc || generation !== this.sessionGeneration) return; // stale attempt
            this.hasRemoteDescription = true;
            // The host may have gathered candidates before the answer.
            await this.drainIceQueue(generation);
        } catch (error) {
            console.error('Failed to handle answer:', error);
            this.config.onError?.(error as Error);
        }
    }

    /**
     * Drain queued ICE candidates FIFO. Failures are logged with context
     * and reported once — the drain never aborts early (one bad candidate
     * must not silently discard the rest) and never crosses a session
     * generation (stale attempts are dropped, never leaked).
     */
    private async drainIceQueue(generation: number): Promise<void> {
        let failures = 0;
        while (this.pendingIce.length > 0) {
            if (!this.pc || generation !== this.sessionGeneration) {
                this.pendingIce = [];
                return;
            }
            const next = this.pendingIce.shift();
            if (!next || next.generation !== generation) continue;
            try {
                await this.pc.addIceCandidate(new RTCIceCandidate(next.candidate));
            } catch (error) {
                failures++;
                console.error('Failed to add queued ICE candidate:', error);
            }
        }
        if (failures > 0) {
            this.config.onError?.(new Error(`${failures} queued ICE candidate(s) failed`));
        }
    }

    /**
     * Handle incoming ICE candidate (ordered via the queue until a remote
     * description exists; never applied without a peer connection).
     */
    private async handleIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
        if (!this.pc) {
            debugLog('Dropping ICE candidate: no peer connection');
            return;
        }

        if (!this.hasRemoteDescription) {
            if (this.pendingIce.length >= MAX_PENDING_ICE) {
                this.pendingIce.shift();
                debugLog('ICE queue full: dropping oldest candidate');
            }
            this.pendingIce.push({ generation: this.sessionGeneration, candidate });
            return;
        }

        try {
            await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (error) {
            console.error('Failed to add ICE candidate:', error);
            this.config.onError?.(error as Error);
        }
    }

    /**
     * Publish a signal through the shared transport.
     */
    private async sendSignal(type: 'offer' | 'answer' | 'ice' | 'request_offer', data: unknown, target?: string | null): Promise<void> {
        try {
            await this.signaling?.sendSignal(type, data, target ?? undefined);
        } catch (error) {
            console.error('Failed to send signal:', error);
        }
    }

    /**
     * Check session presence (host/guest/viewers) — read-only, derived
     * server-side from the live session. Keeps the page's existing
     * host_joined/opponent_joined contract without any room endpoint.
     */
    async getRoomStatus(): Promise<RoomStatus | null> {
        try {
            const response = await fetchJsonWithTimeout(
                `/api/signaling/session?competition_id=${this.competitionId}`,
                { headers: this.authHeaders() }
            );
            if (!response.ok) return null;
            const result = (await response.json().catch(() => null)) as {
                success?: boolean;
                data?: { presence?: { host?: unknown; guest?: unknown; viewer_count?: unknown } | null } | null;
            } | null;
            const presence = result?.data?.presence;
            if (!result || !result.success || !presence) return null;
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
     * Bounded session recovery through the shared transport (presence
     * re-announce + single heartbeat + cursor-preserving catch-up poll).
     */
    async reconnect(): Promise<boolean> {
        if (!this.signaling) return false;
        const state = await this.signaling.reconnectAfterInterruption();
        return state !== null;
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
        // Withdraw presence first so other peers see the session state update.
        // Platform signals live in the SSE log; the session lifecycle ends
        // with the competition — never with a host interruption.
        if (this.signaling) {
            try { await this.signaling.disconnect(); } catch { /* best effort */ }
            this.signaling = null;
        }

        // Invalidate any queued candidates — a later session must never
        // inherit them.
        this.sessionGeneration++;
        this.pendingIce = [];
        this.hasRemoteDescription = false;

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

        this.isConnected = false;
    }
}

export default P2PConnection;
