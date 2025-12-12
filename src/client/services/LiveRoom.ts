/**
 * Live Room Service
 * خدمة غرفة البث المباشر
 * 
 * يتكامل مع Jitsi Meet للبث المباشر
 */

import { State } from '../core/State';
import { ApiClient } from '../core/ApiClient';

/**
 * Jitsi Configuration
 */
interface JitsiConfig {
    serverUrl: string;
    roomName: string;
    jwt?: string;
    userInfo: {
        displayName: string;
        email: string;
        avatar?: string;
    };
    configOverwrite?: Record<string, any>;
    interfaceConfigOverwrite?: Record<string, any>;
}

/**
 * Live Room Service
 * خدمة غرفة البث المباشر
 */
export class LiveRoom {
    private static api: any = null;
    private static currentRoomName: string | null = null;

    /**
     * Initialize Jitsi API
     * تهيئة Jitsi API
     */
    static async init(containerId: string, config: JitsiConfig): Promise<boolean> {
        // Check if Jitsi API script is loaded
        if (typeof (window as any).JitsiMeetExternalAPI === 'undefined') {
            await this.loadJitsiScript(config.serverUrl);
        }

        const JitsiMeetExternalAPI = (window as any).JitsiMeetExternalAPI;
        if (!JitsiMeetExternalAPI) {
            console.error('Jitsi API not available');
            return false;
        }

        try {
            this.api = new JitsiMeetExternalAPI(config.serverUrl.replace('https://', ''), {
                roomName: config.roomName,
                width: '100%',
                height: '100%',
                parentNode: document.getElementById(containerId),
                jwt: config.jwt,
                userInfo: config.userInfo,
                configOverwrite: {
                    startWithAudioMuted: true,
                    startWithVideoMuted: false,
                    prejoinPageEnabled: false,
                    disableDeepLinking: true,
                    ...config.configOverwrite
                },
                interfaceConfigOverwrite: {
                    TOOLBAR_BUTTONS: [
                        'microphone', 'camera', 'desktop', 'fullscreen',
                        'fodeviceselection', 'chat', 'settings', 'raisehand',
                        'videoquality', 'filmstrip', 'participants-pane', 'tileview'
                    ],
                    SHOW_JITSI_WATERMARK: false,
                    SHOW_WATERMARK_FOR_GUESTS: false,
                    SHOW_BRAND_WATERMARK: false,
                    BRAND_WATERMARK_LINK: '',
                    SHOW_POWERED_BY: false,
                    DISABLE_JOIN_LEAVE_NOTIFICATIONS: true,
                    ...config.interfaceConfigOverwrite
                }
            });

            this.currentRoomName = config.roomName;
            this.setupEventListeners();
            return true;
        } catch (error) {
            console.error('Failed to initialize Jitsi:', error);
            return false;
        }
    }

    /**
     * Load Jitsi external API script
     */
    private static loadJitsiScript(serverUrl: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = `${serverUrl}/external_api.js`;
            script.async = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error('Failed to load Jitsi script'));
            document.head.appendChild(script);
        });
    }

    /**
     * Setup event listeners
     */
    private static setupEventListeners(): void {
        if (!this.api) return;

        this.api.addListener('videoConferenceJoined', (data: any) => {
            console.log('Joined room:', data.roomName);
            // Notify backend that user joined
            this.notifyJoined();
        });

        this.api.addListener('videoConferenceLeft', (data: any) => {
            console.log('Left room:', data.roomName);
        });

        this.api.addListener('participantJoined', (data: any) => {
            console.log('Participant joined:', data.displayName);
        });

        this.api.addListener('participantLeft', (data: any) => {
            console.log('Participant left:', data.id);
        });
    }

    /**
     * Notify backend user joined
     */
    private static async notifyJoined(): Promise<void> {
        // Can be used to track viewers or update competition status
        if (State.sessionId && this.currentRoomName) {
            try {
                await ApiClient.post('/api/competitions/join-stream', {
                    roomName: this.currentRoomName
                });
            } catch (err) {
                console.error('Failed to notify join:', err);
            }
        }
    }

    /**
     * Leave the room
     */
    static leave(): void {
        if (this.api) {
            this.api.dispose();
            this.api = null;
            this.currentRoomName = null;
        }
    }

    /**
     * Toggle audio
     */
    static toggleAudio(): void {
        this.api?.executeCommand('toggleAudio');
    }

    /**
     * Toggle video
     */
    static toggleVideo(): void {
        this.api?.executeCommand('toggleVideo');
    }

    /**
     * Toggle screen share
     */
    static toggleScreenShare(): void {
        this.api?.executeCommand('toggleShareScreen');
    }

    /**
     * End meeting (for moderator/creator)
     */
    static endMeeting(): void {
        this.api?.executeCommand('hangup');
        this.leave();
    }

    /**
     * Get participants count
     */
    static async getParticipantsCount(): Promise<number> {
        if (!this.api) return 0;
        try {
            const count = await this.api.getNumberOfParticipants();
            return count;
        } catch {
            return 0;
        }
    }

    /**
     * Check if API is initialized
     */
    static isInitialized(): boolean {
        return this.api !== null;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).LiveRoom = LiveRoom;
}

export default LiveRoom;
