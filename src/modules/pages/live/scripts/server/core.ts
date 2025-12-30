/**
 * Test Stream Server Core
 * Server-Side TypeScript - Types, Interfaces, Constants
 * 
 * الآن يستخدم config/defaults.ts للثوابت
 */

import {
    DEFAULT_STREAMING_URL,
    DEFAULT_UPLOAD_URL
} from '../../../../../config/defaults';

// ===== Types & State Machine =====

export type PlayerState =
    | 'idle'
    | 'waiting'
    | 'playing'
    | 'preloading'
    | 'switching'
    | 'ended'
    | 'error';

export interface ChunkInfo {
    index: number;
    filename: string;
    url: string;
    duration?: number;
    size?: number;
}

export interface PlaylistData {
    competition_id: string;
    mode: 'sequential-mp4' | 'sequential-webm';
    extension: 'mp4' | 'webm';
    chunk_duration: number;
    chunks: ChunkInfo[];
    status: 'live' | 'finished';
}

export interface QualityPreset {
    name: string;
    width: number;
    height: number;
    fps: number;
    segment: number;
    bitrate: number;
}

export interface DeviceCapabilities {
    isMobile: boolean;
    supportsScreenShare: boolean;
    supportsCamera: boolean;
}

// ===== Constants from defaults.ts =====

export const STREAM_SERVER_URL = DEFAULT_STREAMING_URL;
export const FFMPEG_URL = DEFAULT_UPLOAD_URL;
export const TEST_ROOM_ID = 'test_room_001';

// ===== Quality Presets =====

export const QUALITY_PRESETS: Record<string, QualityPreset> = {
    excellent: { name: 'Excellent', width: 1280, height: 360, fps: 30, segment: 4000, bitrate: 2000000 },
    good: { name: 'Good', width: 854, height: 240, fps: 24, segment: 6000, bitrate: 1000000 },
    medium: { name: 'Medium', width: 640, height: 180, fps: 15, segment: 10000, bitrate: 500000 },
    low: { name: 'Low', width: 426, height: 120, fps: 10, segment: 20000, bitrate: 250000 },
    minimal: { name: 'Minimal', width: 320, height: 90, fps: 10, segment: 30000, bitrate: 150000 }
};

// ===== ICE Servers =====
// ملاحظة: ICE Servers تُجلب الآن ديناميكياً من /api/signaling/ice-servers
// Note: ICE Servers are now fetched dynamically from /api/signaling/ice-servers

// للتوافق المؤقت فقط - ستُزال لاحقاً
// For backward compatibility only - will be removed later
export const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
];

/**
 * Fetch ICE servers from platform API
 * جلب إعدادات ICE من المنصة
 */
export async function fetchIceServers(): Promise<RTCIceServer[]> {
    try {
        const response = await fetch('/api/signaling/ice-servers');
        const data = await response.json();
        if (data.success && data.data.iceServers) {
            return data.data.iceServers;
        }
    } catch (error) {
        console.error('Failed to fetch ICE servers:', error);
    }
    return ICE_SERVERS; // Fallback to static list
}

