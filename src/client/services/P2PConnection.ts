/**
 * P2P Connection Service
 * خدمة اتصال نظير لنظير
 * 
 * Handles WebRTC P2P connection between host and opponent
 * يتعامل مع اتصال WebRTC بين المضيف والخصم
 */

export type SignalingRole = 'host' | 'opponent' | 'viewer';

export interface P2PConnectionConfig {
    roomId: string;
    role: SignalingRole;
    userId: number;
    onRemoteStream?: (stream: MediaStream) => void;
    onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
    onError?: (error: Error) => void;
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
    signals: Array<{ type: string; data: unknown }>;
    room_status: RoomStatus;
}

export class P2PConnection {
    private config: P2PConnectionConfig;
    private pc: RTCPeerConnection | null = null;
    private localStream: MediaStream | null = null;
    private remoteStream: MediaStream | null = null;
    private pollingInterval: number | null = null;
    private isConnected: boolean = false;
    private iceServers: RTCIceServer[] = [];

    constructor(config: P2PConnectionConfig) {
        this.config = config;
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
     * Fetch ICE servers from signaling server
     */
    private async fetchIceServers(): Promise<void> {
        try {
            const response = await fetch('/api/signaling/ice-servers');
            const result: ApiResponse<IceServersData> = await response.json();
            if (result.success && result.data) {
                this.iceServers = result.data.iceServers;
            }
        } catch (error) {
            console.warn('Failed to fetch ICE servers, using defaults');
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
            }
        };
    }

    /**
     * Join the signaling room
     */
    async joinRoom(): Promise<boolean> {
        try {
            const response = await fetch('/api/signaling/room/join', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_id: this.config.roomId,
                    user_id: this.config.userId,
                    role: this.config.role
                })
            });

            const result: ApiResponse = await response.json();
            return result.success === true;
        } catch (error) {
            console.error('Failed to join room:', error);
            return false;
        }
    }

    /**
     * Initialize local media stream
     * @param constraints - Media constraints or { useMock: true } for testing
     */
    async initLocalStream(constraints?: MediaStreamConstraints | { useMock: boolean }): Promise<MediaStream> {
        // Check if mock mode requested
        if (constraints && 'useMock' in constraints && constraints.useMock) {
            console.log('[P2P] Using mock stream for testing');
            return this.createMockStream();
        }

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
                (constraints as MediaStreamConstraints) || defaultConstraints
            );

            // Add tracks to peer connection
            if (this.pc && this.localStream) {
                this.localStream.getTracks().forEach(track => {
                    this.pc!.addTrack(track, this.localStream!);
                });
            }

            return this.localStream;
        } catch (error) {
            console.warn('[P2P] Camera access failed, falling back to mock stream:', error);
            // Fallback to mock stream if camera fails
            return this.createMockStream();
        }
    }

    /**
     * Create a mock video/audio stream for testing
     * Generates a Canvas with timer and role text
     */
    private createMockStream(): MediaStream {
        // Create canvas for video
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const ctx = canvas.getContext('2d')!;

        let startTime = Date.now();

        // Animation function
        const drawFrame = () => {
            // Background gradient
            const gradient = ctx.createLinearGradient(0, 0, 0, 480);
            gradient.addColorStop(0, '#1a1a2e');
            gradient.addColorStop(1, '#16213e');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, 640, 480);

            // Timer
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            const mins = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const secs = (elapsed % 60).toString().padStart(2, '0');

            ctx.fillStyle = '#fff';
            ctx.font = 'bold 48px Arial';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(`${mins}:${secs}`, 320, 200);

            // Role text
            ctx.font = '24px Arial';
            ctx.fillStyle = '#a855f7';
            ctx.fillText(`Mock Stream - ${this.config.role.toUpperCase()}`, 320, 280);

            // User ID
            ctx.font = '18px Arial';
            ctx.fillStyle = '#888';
            ctx.fillText(`User ID: ${this.config.userId}`, 320, 320);

            // Animated circle (to show it's "live")
            const radius = 10 + Math.sin(Date.now() / 200) * 5;
            ctx.beginPath();
            ctx.arc(320, 380, radius, 0, Math.PI * 2);
            ctx.fillStyle = '#ef4444';
            ctx.fill();

            requestAnimationFrame(drawFrame);
        };
        drawFrame();

        // Create stream from canvas
        const videoStream = canvas.captureStream(30);

        // Create silent audio context
        const audioContext = new AudioContext();
        const oscillator = audioContext.createOscillator();
        oscillator.frequency.value = 0; // Silent
        const dest = audioContext.createMediaStreamDestination();
        oscillator.connect(dest);
        oscillator.start();

        // Combine video and audio
        const audioTrack = dest.stream.getAudioTracks()[0];
        if (audioTrack) {
            videoStream.addTrack(audioTrack);
        }

        this.localStream = videoStream;

        // Add tracks to peer connection
        if (this.pc && this.localStream) {
            this.localStream.getTracks().forEach(track => {
                this.pc!.addTrack(track, this.localStream!);
            });
        }

        console.log('[P2P] Mock stream created successfully');
        return this.localStream;
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
     * Send signal to signaling server
     */
    private async sendSignal(type: string, data: any): Promise<void> {
        try {
            await fetch('/api/signaling/signal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_id: this.config.roomId,
                    from_role: this.config.role,
                    signal_type: type,
                    signal_data: data
                })
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
     * Poll for pending signals
     */
    private async pollSignals(): Promise<void> {
        try {
            const response = await fetch(
                `/api/signaling/poll?room_id=${this.config.roomId}&role=${this.config.role}`
            );
            const result: ApiResponse<PollData> = await response.json();

            if (result.success && result.data?.signals) {
                for (const signal of result.data.signals) {
                    await this.handleSignal(signal);
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
                await this.handleIceCandidate(signal.data);
                break;
        }
    }

    /**
     * Check room status
     */
    async getRoomStatus(): Promise<RoomStatus | null> {
        try {
            const response = await fetch(
                `/api/signaling/room/${this.config.roomId}/status`
            );
            const result: ApiResponse<RoomStatus> = await response.json();
            return result.success && result.data ? result.data : null;
        } catch (error) {
            console.error('Failed to get room status:', error);
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

        // Leave room
        try {
            await fetch('/api/signaling/room/leave', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    room_id: this.config.roomId,
                    user_id: this.config.userId,
                    role: this.config.role
                })
            });
        } catch (error) {
            console.error('Failed to leave room:', error);
        }

        this.isConnected = false;
    }
}

export default P2PConnection;
