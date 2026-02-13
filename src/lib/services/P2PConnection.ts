/**
 * P2P Connection Service
 * خدمة الاتصال النظير إلى نظير
 * 
 * Enhanced WebRTC P2P streaming with fallback mechanisms
 */

export interface P2PConfig {
    iceServers: RTCIceServer[];
    reconnectAttempts?: number;
    reconnectDelay?: number;
    fallbackTimeout?: number;
}

export interface ConnectionState {
    status: 'connecting' | 'connected' | 'disconnected' | 'failed' | 'reconnecting';
    peerId: string;
    latency: number;
    bytesReceived: number;
    bytesSent: number;
    quality: 'excellent' | 'good' | 'fair' | 'poor';
}

export class P2PConnection {
    private pc: RTCPeerConnection | null = null;
    private dataChannel: RTCDataChannel | null = null;
    private config: P2PConfig;
    private reconnectCount: number = 0;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    private state: ConnectionState;
    private onStateChange: ((state: ConnectionState) => void) | null = null;
    private onMessage: ((data: any) => void) | null = null;
    private onStream: ((stream: MediaStream) => void) | null = null;
    private statsInterval: ReturnType<typeof setInterval> | null = null;

    private lastStats: RTCStatsReport | null = null;

    constructor(config: P2PConfig) {
        this.config = {
            reconnectAttempts: 3,
            reconnectDelay: 2000,
            fallbackTimeout: 10000,
            ...config
        };

        this.state = {
            status: 'disconnected',
            peerId: '',
            latency: 0,
            bytesReceived: 0,
            bytesSent: 0,
            quality: 'excellent'
        };
    }

    /**
     * Initialize peer connection
     */
    async initialize(peerId: string): Promise<boolean> {
        try {
            this.state.peerId = peerId;
            this.updateState({ status: 'connecting' });

            // Create peer connection with optimized settings
            this.pc = new RTCPeerConnection({
                iceServers: this.config.iceServers,
                iceTransportPolicy: 'all',
                bundlePolicy: 'max-bundle',
                rtcpMuxPolicy: 'require',
                iceCandidatePoolSize: 10
            });

            // Setup event handlers
            this.setupPeerConnectionHandlers();

            // Start fallback timer
            this.startFallbackTimer();

            return true;
        } catch (error) {
            console.error('P2P initialization error:', error);
            this.updateState({ status: 'failed' });
            return false;
        }
    }

    /**
     * Setup peer connection event handlers
     */
    private setupPeerConnectionHandlers() {
        if (!this.pc) return;

        // Connection state change
        this.pc.onconnectionstatechange = () => {
            const state = this.pc?.connectionState;
            console.log('P2P connection state:', state);

            switch (state) {
                case 'connected':
                    this.clearFallbackTimer();
                    this.reconnectCount = 0;
                    this.updateState({ status: 'connected' });
                    this.startStatsMonitoring();
                    break;
                case 'disconnected':
                    this.handleDisconnection();
                    break;
                case 'failed':
                    this.handleFailure();
                    break;
            }
        };

        // ICE connection state
        this.pc.oniceconnectionstatechange = () => {
            console.log('ICE connection state:', this.pc?.iceConnectionState);
        };

        // Incoming stream
        this.pc.ontrack = (event) => {
            console.log('Received remote stream');
            if (this.onStream && event.streams[0]) {
                this.onStream(event.streams[0]);
            }
        };

        // Data channel from remote
        this.pc.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannelHandlers();
        };

        // ICE candidates
        this.pc.onicecandidate = (event) => {
            if (event.candidate) {
                // Send candidate to signaling server
                this.sendSignal({
                    type: 'ice-candidate',
                    candidate: event.candidate
                });
            }
        };
    }

    /**
     * Create offer (for initiator)
     */
    async createOffer(): Promise<RTCSessionDescriptionInit | null> {
        if (!this.pc) return null;

        try {
            // Create data channel for control messages
            this.dataChannel = this.pc.createDataChannel('control', {
                ordered: true,
                maxRetransmits: 3
            });
            this.setupDataChannelHandlers();

            // Create offer
            const offer = await this.pc.createOffer({
                offerToReceiveAudio: true,
                offerToReceiveVideo: true
            });

            await this.pc.setLocalDescription(offer);
            return offer;

        } catch (error) {
            console.error('Create offer error:', error);
            return null;
        }
    }

    /**
     * Handle answer (for initiator)
     */
    async handleAnswer(answer: RTCSessionDescriptionInit): Promise<boolean> {
        if (!this.pc) return false;

        try {
            await this.pc.setRemoteDescription(answer);
            return true;
        } catch (error) {
            console.error('Handle answer error:', error);
            return false;
        }
    }

    /**
     * Handle offer (for receiver)
     */
    async handleOffer(offer: RTCSessionDescriptionInit): Promise<RTCSessionDescriptionInit | null> {
        if (!this.pc) return null;

        try {
            await this.pc.setRemoteDescription(offer);

            const answer = await this.pc.createAnswer();
            await this.pc.setLocalDescription(answer);

            return answer;
        } catch (error) {
            console.error('Handle offer error:', error);
            return null;
        }
    }

    /**
     * Add ICE candidate
     */
    async addIceCandidate(candidate: RTCIceCandidateInit): Promise<boolean> {
        if (!this.pc) return false;

        try {
            await this.pc.addIceCandidate(candidate);
            return true;
        } catch (error) {
            console.error('Add ICE candidate error:', error);
            return false;
        }
    }

    /**
     * Add local stream
     */
    addStream(stream: MediaStream): void {
        if (!this.pc) return;

        stream.getTracks().forEach(track => {
            this.pc?.addTrack(track, stream);
        });
    }

    /**
     * Remove stream
     */
    removeStream(stream: MediaStream): void {
        if (!this.pc) return;

        const senders = this.pc.getSenders();
        senders.forEach(sender => {
            if (sender.track && stream.getTracks().includes(sender.track)) {
                this.pc?.removeTrack(sender);
            }
        });
    }

    /**
     * Send data through data channel
     */
    sendData(data: any): boolean {
        if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
            return false;
        }

        try {
            this.dataChannel.send(JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Send data error:', error);
            return false;
        }
    }

    /**
     * Setup data channel handlers
     */
    private setupDataChannelHandlers() {
        if (!this.dataChannel) return;

        this.dataChannel.onopen = () => {
            console.log('Data channel opened');
        };

        this.dataChannel.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (this.onMessage) {
                    this.onMessage(data);
                }
            } catch (error) {
                console.error('Data channel message error:', error);
            }
        };

        this.dataChannel.onerror = (error) => {
            console.error('Data channel error:', error);
        };

        this.dataChannel.onclose = () => {
            console.log('Data channel closed');
        };
    }

    /**
     * Handle disconnection
     */
    private handleDisconnection() {
        this.updateState({ status: 'disconnected' });
        this.stopStatsMonitoring();
        this.attemptReconnect();
    }

    /**
     * Handle connection failure
     */
    private handleFailure() {
        this.updateState({ status: 'failed' });
        this.stopStatsMonitoring();
        this.attemptReconnect();
    }

    /**
     * Attempt to reconnect
     */
    private attemptReconnect() {
        if (this.reconnectCount >= (this.config.reconnectAttempts || 3)) {
            console.error('Max reconnection attempts reached');
            this.updateState({ status: 'failed' });
            return;
        }

        this.reconnectCount++;
        this.updateState({ status: 'reconnecting' });

        console.log(`Reconnection attempt ${this.reconnectCount}/${this.config.reconnectAttempts}`);

        this.reconnectTimer = setTimeout(() => {
            this.reinitialize();
        }, this.config.reconnectDelay);
    }

    /**
     * Reinitialize connection
     */
    private async reinitialize(): Promise<void> {
        this.cleanup();
        await this.initialize(this.state.peerId);
    }

    /**
     * Start fallback timer
     */
    private startFallbackTimer() {
        this.fallbackTimer = setTimeout(() => {
            if (this.state.status !== 'connected') {
                console.warn('P2P connection timeout, triggering fallback');
                this.triggerFallback();
            }
        }, this.config.fallbackTimeout);
    }

    /**
     * Clear fallback timer
     */
    private clearFallbackTimer() {
        if (this.fallbackTimer) {
            clearTimeout(this.fallbackTimer);
            this.fallbackTimer = null;
        }
    }

    /**
     * Trigger fallback mechanism
     */
    private triggerFallback() {
        // Emit fallback event for parent to handle
        // Parent should switch to relay server or YouTube streaming
        this.sendData({ type: 'fallback', reason: 'timeout' });
    }

    /**
     * Start connection quality monitoring
     */
    private startStatsMonitoring() {
        if (!this.pc) return;

        this.statsInterval = setInterval(async () => {
            try {
                const stats = await this.pc?.getStats();
                if (stats) {
                    this.analyzeStats(stats);
                    this.lastStats = stats;
                }
            } catch (error) {
                console.error('Stats monitoring error:', error);
            }
        }, 2000);
    }

    /**
     * Stop stats monitoring
     */
    private stopStatsMonitoring() {
        if (this.statsInterval) {
            clearInterval(this.statsInterval);
            this.statsInterval = null;
        }
    }

    /**
     * Analyze connection statistics
     */
    private analyzeStats(stats: RTCStatsReport) {
        let bytesReceived = 0;
        let bytesSent = 0;
        let packetsLost = 0;
        let packetsReceived = 0;
        let jitter = 0;
        let rtt = 0;

        stats.forEach(report => {
            if (report.type === 'inbound-rtp') {
                bytesReceived = report.bytesReceived || 0;
                packetsLost = report.packetsLost || 0;
                packetsReceived = report.packetsReceived || 0;
                jitter = report.jitter || 0;
            } else if (report.type === 'outbound-rtp') {
                bytesSent = report.bytesSent || 0;
            } else if (report.type === 'candidate-pair' && report.state === 'succeeded') {
                rtt = report.currentRoundTripTime || 0;
            }
        });

        // Calculate quality
        const packetLossRate = packetsReceived > 0 ? (packetsLost / packetsReceived) * 100 : 0;
        let quality: ConnectionState['quality'] = 'excellent';

        if (packetLossRate > 5 || rtt > 0.3 || jitter > 0.1) {
            quality = 'poor';
        } else if (packetLossRate > 2 || rtt > 0.15 || jitter > 0.05) {
            quality = 'fair';
        } else if (packetLossRate > 0.5 || rtt > 0.08) {
            quality = 'good';
        }

        this.updateState({
            latency: Math.round(rtt * 1000),
            bytesReceived,
            bytesSent,
            quality
        });

        // Trigger quality adaptation if needed
        if (quality === 'poor') {
            this.adaptQuality();
        }
    }

    /**
     * Adapt quality based on network conditions
     */
    private adaptQuality() {
        // Send quality adaptation message to peer
        this.sendData({
            type: 'quality-adaptation',
            action: 'reduce-bitrate',
            reason: 'poor-connection'
        });
    }

    /**
     * Update connection state
     */
    private updateState(updates: Partial<ConnectionState>) {
        this.state = { ...this.state, ...updates };
        if (this.onStateChange) {
            this.onStateChange(this.state);
        }
    }

    /**
     * Set event handlers
     */
    on(event: 'statechange', handler: (state: ConnectionState) => void): void;
    on(event: 'message', handler: (data: any) => void): void;
    on(event: 'stream', handler: (stream: MediaStream) => void): void;
    on(event: string, handler: any): void {
        switch (event) {
            case 'statechange':
                this.onStateChange = handler;
                break;
            case 'message':
                this.onMessage = handler;
                break;
            case 'stream':
                this.onStream = handler;
                break;
        }
    }

    /**
     * Send signal to signaling server
     */
    private sendSignal(data: any) {
        // This should be implemented by the parent class
        // to send data through the signaling server
        console.log('Signal:', data);
    }

    /**
     * Get current connection state
     */
    getState(): ConnectionState {
        return { ...this.state };
    }

    /**
     * Check if connected
     */
    isConnected(): boolean {
        return this.state.status === 'connected';
    }

    /**
     * Cleanup and close connection
     */
    cleanup(): void {
        this.clearFallbackTimer();
        this.stopStatsMonitoring();

        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.dataChannel) {
            this.dataChannel.close();
            this.dataChannel = null;
        }

        if (this.pc) {
            this.pc.close();
            this.pc = null;
        }

        this.updateState({ status: 'disconnected' });
    }

    /**
     * Get connection quality string
     */
    getQualityString(): string {
        const qualityMap = {
            'excellent': 'ممتاز / Excellent',
            'good': 'جيد / Good',
            'fair': 'مقبول / Fair',
            'poor': 'ضعيف / Poor'
        };
        return qualityMap[this.state.quality];
    }
}

// Factory function
export function createP2PConnection(iceServers: RTCIceServer[]): P2PConnection {
    return new P2PConnection({ iceServers });
}

export default P2PConnection;
