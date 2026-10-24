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

/** Where the current local preview came from (display only, never consent). */
export type LocalMediaSource = 'camera' | 'screen' | 'none';

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
    /**
     * R4-LIVE-ENTRY-RECOVERY-1 (privacy contract): local tracks are NOT added
     * as senders on the peer connection until the party explicitly publishes.
     * getUserMedia is only a self-preview permission — a muted/hidden track
     * that still holds a sender is NOT consent. Publishing is idempotent.
     */
    private localPublished = false;
    /** Preview origin — display state only; publish still requires consent. */
    private localSource: LocalMediaSource = 'none';
    /** Serializes createOffer so concurrent triggers never race setLocalDescription. */
    private offerInFlight = false;

    constructor(config: P2PConnectionConfig) {
        this.config = config;
        const fromRoom = Number(String(config.roomId).replace('comp_', ''));
        const explicit = Number(config.competitionId);
        this.competitionId = Number.isFinite(explicit) && explicit > 0 ? explicit
            : Number.isFinite(fromRoom) && fromRoom > 0 ? fromRoom : NaN;
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
        // A new peer connection has no senders — publishing must recur before
        // any local media can flow on it.
        this.localPublished = false;
        this.offerInFlight = false;

        // Authenticated ICE (short-lived per-session TURN, STUN fallback).
        // SEC-08: cookie auth; no JS-readable session token is sent.
        const ice = await fetchPlatformIceServers(null);
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
            this.localSource = 'camera';

            // PRIVACY CONTRACT: acquiring a self-preview is NOT consent to
            // publish. No track becomes an RTCRtpSender here — the caller keeps
            // the stream for the local preview only. Tracks are attached to the
            // peer connection solely in publishLocalStream(), after the party's
            // explicit "start/publish" action. A muted or hidden track that
            // still holds a sender does not satisfy this contract.
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
     * R4-LIVE-ENTRY-RECOVERY-1: replace the local preview stream (e.g. camera switch)
     * before explicit publish. This updates the source that publishLocalStream()
     * will attach to the peer connection. Does NOT add tracks to the PC.
     * Stops old tracks that are not part of the new stream (device access is
     * released, but no sender is ever created here).
     */
    async replaceLocalStream(constraints?: MediaStreamConstraints): Promise<MediaStream> {
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
            const newStream = await navigator.mediaDevices.getUserMedia(
                constraints || defaultConstraints
            );
            const old = this.localStream;
            this.localStream = newStream;
            this.localSource = 'camera';
            if (old && old !== newStream) {
                const kept = newStream.getTracks();
                old.getTracks().forEach(t => {
                    if (!kept.includes(t)) t.stop();
                });
            }
            return this.localStream;
        } catch (error) {
            console.error('[P2P] Camera switch failed:', error);
            throw new Error('Failed to switch camera');
        }
    }

    /**
     * R4-LIVE-ENTRY-RECOVERY-REM1: install a prepared stream (camera, screen,
     * or screen+mic mix) as the local preview. This is preview-only: it never
     * creates an RTCRtpSender. The caller must invoke publishLocalStream()
     * explicitly before anything can leave the device.
     */
    setLocalPreviewStream(
        stream: MediaStream | null,
        options: { stopPrevious?: boolean; source?: LocalMediaSource } = {}
    ): void {
        const previous = this.localStream;
        if (options.stopPrevious !== false && previous && previous !== stream) {
            previous.getTracks().forEach(track => track.stop());
        }
        this.localStream = stream;
        this.localSource = stream ? (options.source ?? 'camera') : 'none';
    }

    /** Current preview origin (display only; never implies consent). */
    getLocalSource(): LocalMediaSource {
        return this.localSource;
    }

    /**
     * R4-LIVE-ENTRY-RECOVERY-REM1: swap one published track (after explicit
     * consent only). Returns:
     *  - 'replaced' — an existing sender now carries the new track (no renegotiation),
     *  - 'added' — a NEW sender was added; the caller must negotiate,
     *  - 'none' — not published / no peer connection / nothing to do.
     * Passing null detaches the sender without adding a hidden fallback track.
     */
    async setPublishedTrack(
        kind: 'audio' | 'video',
        track: MediaStreamTrack | null
    ): Promise<'none' | 'replaced' | 'added'> {
        if (!this.pc || !this.localPublished) return 'none';
        const sender = this.findSender(kind);
        if (sender) {
            await sender.replaceTrack(track);
            return 'replaced';
        }
        if (!track) return 'none';
        const added = this.localStream
            ? this.pc.addTrack(track, this.localStream)
            : this.pc.addTrack(track);
        if (added) this.tagSender(added, kind);
        return 'added';
    }

    /** True when the published local media has at least one live track. */
    hasPublishedTrack(kind?: 'audio' | 'video'): boolean {
        if (!this.localPublished || !this.pc) return false;
        return this.pc.getSenders().some(s =>
            !!s.track && (kind ? s.track.kind === kind : true)
        );
    }

    /**
     * UNIT30.4 §15.7 — read-only truth for the start/End button. A click or
     * the competition being LIVE is not publishing; this reports the actual
     * RTCRtpSender tracks. A muted/disabled track is still published; an
     * ended/removed sender is not. Missing readyState (test doubles) counts as
     * live so the adapter contract stays usable outside a browser.
     */
    getPublishedMediaState(): { published: boolean; video: boolean; audio: boolean } {
        if (!this.localPublished || !this.pc) {
            return { published: false, video: false, audio: false };
        }
        const tracks = this.pc.getSenders()
            .map(sender => sender.track)
            .filter((track): track is MediaStreamTrack => !!track)
            .filter(track => !track.readyState || track.readyState === 'live');
        const video = tracks.some(track => track.kind === 'video');
        const audio = tracks.some(track => track.kind === 'audio');
        return { published: video || audio, video, audio };
    }

    private findSender(kind: 'audio' | 'video'): RTCRtpSender | undefined {
        if (!this.pc) return undefined;
        const senders = this.pc.getSenders();
        return senders.find(s => !!s.track && s.track.kind === kind)
            ?? senders.find(s => (s as unknown as { __dueliKind?: string }).__dueliKind === kind);
    }

    private tagSender(sender: RTCRtpSender, kind: 'audio' | 'video'): void {
        try {
            (sender as unknown as { __dueliKind?: string }).__dueliKind = kind;
        } catch { /* host object may be non-extensible; kind matching falls back to track.kind */ }
    }

    /**
     * Renegotiate after a NEW track kind was added post-publish. The host is
     * the sole offerer; the guest asks the host for a fresh offer through the
     * existing request_offer transport hint.
     */
    async negotiateMediaChange(): Promise<void> {
        if (!this.signaling) return;
        if (this.signaling.effectiveRole() === 'host') {
            await this.createOffer();
        } else {
            try { await this.signaling.requestOffer(); } catch { /* host watcher retries */ }
        }
    }

    /**
     * R4-LIVE-ENTRY-RECOVERY-1 (privacy contract): attach the local preview
     * tracks to the peer connection. This is the ONLY place local media becomes
     * an RTCRtpSender, and it must run solely after the party's explicit publish
     * consent — never automatically on stream acquisition. Idempotent: a second
     * call is a no-op once published. Returns whether the local media is now
     * published (a non-empty stream and peer connection must exist).
     */
    publishLocalStream(): boolean {
        if (this.localPublished) return true;
        if (!this.pc || !this.localStream || this.localStream.getTracks().length === 0) return false;
        this.localStream.getTracks().forEach(track => {
            const sender = this.pc!.addTrack(track, this.localStream!);
            if (sender) this.tagSender(sender, track.kind === 'audio' ? 'audio' : 'video');
        });
        this.localPublished = true;
        return true;
    }

    /** Whether this party has explicitly published its local media. */
    isLocalPublished(): boolean {
        return this.localPublished;
    }

    /**
     * Stop and release local device tracks (never touches the competition).
     * Stopping local media also re-arms the consent gate: a later track can
     * only flow again through an explicit publishLocalStream().
     */
    stopLocalMedia(): void {
        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }
        this.localSource = 'none';
        this.localPublished = false;
    }

    /**
     * Guest/viewer late-join re-offer request via the existing request_offer
     * transport hint. Used after a guest publishes so the host re-offers and
     * the answer can now carry the guest's media (host remains the sole offerer).
     */
    async requestReoffer(): Promise<void> {
        if (!this.signaling) return;
        try { await this.signaling.requestOffer(); } catch { /* best effort — the host watcher also re-offers */ }
    }

    /**
     * Create and send offer (host only — the transport drops offers published
     * by any other role, and the server rejects them).
     */
    async createOffer(): Promise<void> {
        // R4-LIVE-ENTRY-RECOVERY-1 (defect C — stable-state race): several
        // triggers (initial offer, presence watcher, ICE-restart, bounded
        // recovery, request_offer) can reach here concurrently. Serialize them,
        // and never start a second negotiation while one is already in progress
        // (signalingState !== 'stable') — a concurrent setLocalDescription
        // throws InvalidStateError. The running negotiation (or the next
        // trigger) carries the offer to completion.
        if (!this.pc || this.offerInFlight) return;
        let signalingState = 'unknown';
        try { signalingState = this.pc.signalingState || 'unknown'; } catch { /* closed pc */ }
        if (signalingState !== 'stable') {
            debugLog('Skipping offer: a negotiation is already in progress (' + signalingState + ')');
            return;
        }

        this.offerInFlight = true;
        try {
            const offer = await this.pc.createOffer();
            await this.pc.setLocalDescription(offer);
            await this.sendSignal('offer', offer);
        } catch (error) {
            console.error('Failed to create offer:', error);
            this.config.onError?.(error as Error);
        } finally {
            this.offerInFlight = false;
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
                { headers: { 'Content-Type': 'application/json' }, credentials: 'include' }
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
        this.stopLocalMedia();

        // Close peer connection
        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        this.isConnected = false;
        // Exiting preparation / ending the session stops local media and arms
        // the contract gate again: nothing is published on a torn-down link.
        this.localPublished = false;
        this.localSource = 'none';
        this.offerInFlight = false;
    }
}

export default P2PConnection;
