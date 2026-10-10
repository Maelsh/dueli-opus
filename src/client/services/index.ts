/**
 * @file src/client/services/index.ts
 * @description تصدير وحدات Services
 * @module client/services
 */

export { AuthService } from './AuthService';
export { SseService } from './SseService';
export { ThemeService } from './ThemeService';
export { CompetitionService } from './CompetitionService';
export { SearchService } from './SearchService';
export { InteractionService } from './InteractionService';
export { MessagingService } from './MessagingService';
export { SettingsService } from './SettingsService';

// Streaming Services - خدمات البث
export { P2PConnection } from './P2PConnection';
// R4-LIVE-INT-1: single shared signaling transport (bundle + test pages).
export { SignalingManager } from './SignalingManager';
export { VideoCompositor } from './VideoCompositor';
export { ChunkUploader } from './ChunkUploader';

