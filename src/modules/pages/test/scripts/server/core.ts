/**
 * Test Stream Server Core
 * Server-Side TypeScript - Types, Interfaces, Constants
 */

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

// ===== Constants =====

export const STREAM_SERVER_URL = 'https://stream.maelsh.pro';
export const FFMPEG_URL = 'https://maelsh.pro/ffmpeg';
export const TEST_ROOM_ID = 'test_room_001';

// ===== Quality Presets =====

export const QUALITY_PRESETS: Record<string, QualityPreset> = {
    excellent: { name: 'Excellent', width: 1280, height: 360, fps: 30, segment: 4000, bitrate: 2000000 },
    good: { name: 'Good', width: 854, height: 240, fps: 24, segment: 6000, bitrate: 1000000 },
    medium: { name: 'Medium', width: 640, height: 180, fps: 15, segment: 10000, bitrate: 500000 },
    low: { name: 'Low', width: 426, height: 120, fps: 10, segment: 20000, bitrate: 250000 },
    minimal: { name: 'Minimal', width: 320, height: 90, fps: 10, segment: 30000, bitrate: 150000 }
};

// ===== ICE Servers Configuration =====

export const ICE_SERVERS = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    {
        urls: 'turn:maelsh.pro:3000?transport=tcp',
        username: 'dueli',
        credential: 'dueli-turn-secret-2024'
    },
    {
        urls: 'turn:maelsh.pro:3000',
        username: 'dueli',
        credential: 'dueli-turn-secret-2024'
    }
];
