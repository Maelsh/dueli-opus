import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    downloadErrorKey,
    formatDownloadBytes,
    formatDownloadDuration,
    isDownloadUserAuthenticated,
} from '../../src/client/ui/RecordingDownloadPanel';
import { getViewerScript } from '../../src/modules/pages/live/scripts/client/viewer';

const globals = globalThis as unknown as Record<string, unknown>;
const COMPETITION_PAGE = readFileSync(
    resolve(__dirname, '../../src/modules/pages/competition-page.ts'),
    'utf-8'
);

afterEach(() => {
    delete globals.window;
    delete globals.localStorage;
});

describe('R4-CHUNK-DOWNLOAD-1 download UI helpers', () => {
    it('shows download affordances only for an authenticated user hint (no session key)', () => {
        globals.window = { currentUser: { id: 7 } };
        expect(isDownloadUserAuthenticated()).toBe(true);

        globals.window = { currentUser: null };
        expect(isDownloadUserAuthenticated()).toBe(false);

        globals.window = {};
        globals.localStorage = {
            getItem: (key: string) => (key === 'user' ? '{"id":8}' : null),
        };
        expect(isDownloadUserAuthenticated()).toBe(true);

        // A stale session key is no longer part of the hint.
        globals.localStorage = {
            getItem: (key: string) => (key === 'sessionId' ? 'sess' : null),
        };
        expect(isDownloadUserAuthenticated()).toBe(false);
    });

    it('maps every failure code to a user-facing translation key', () => {
        expect(downloadErrorKey('not_authenticated')).toBe('download_ui.error_not_authenticated');
        expect(downloadErrorKey('chunk_integrity_failed')).toBe('download_ui.error_chunk_integrity');
        expect(downloadErrorKey('ffmpeg_unavailable')).toBe('download_ui.error_ffmpeg_unavailable');
        expect(downloadErrorKey('cancelled')).toBe('download_ui.cancelled');
        expect(downloadErrorKey('unknown')).toBe('download_ui.error_unknown');
    });

    it('exposes the /live download before the player finishes loading, with the right competition id', () => {
        const script = getViewerScript('en');
        const modeSet = script.indexOf("currentMode = 'vod';");
        const showCall = script.indexOf('showDownloadButtons();');
        const playerStart = script.indexOf('currentPlayer = new SmartVodPlayer');

        expect(script).toContain('let currentCompetitionId = null;');
        expect(script).toContain('currentCompetitionId = String(competitionId);');
        expect(script).toContain('window.openRecordingDownload(currentCompetitionId)');
        expect(script).toContain("if (!window.currentUser || !window.currentUser.id)");
        expect(modeSet).toBeGreaterThan(-1);
        expect(modeSet).toBeLessThan(showCall);
        expect(showCall).toBeGreaterThan(-1);
        expect(playerStart).toBeGreaterThan(showCall);
        expect(script).not.toContain('fullyLoaded');
    });

    it('keeps the competition download outside the VOD-ready controls and gates it by state', () => {
        const download = COMPETITION_PAGE.indexOf('id="embeddedDownloadBtn"');
        const vodControls = COMPETITION_PAGE.indexOf('id="embeddedVodControls"');
        expect(download).toBeGreaterThan(-1);
        expect(vodControls).toBeGreaterThan(download);
        expect(COMPETITION_PAGE.match(/id="embeddedDownloadBtn"/g)).toHaveLength(1);
        expect(COMPETITION_PAGE).toContain("competitionData.status === 'completed' || competitionData.stream_status === 'ready'");
    });

    it('formats sizes and durations without inventing values', () => {
        expect(formatDownloadBytes(0)).toBe('0 B');
        expect(formatDownloadBytes(1024, 'en')).toBe('1 KB');
        expect(formatDownloadBytes(1536, 'en')).toBe('1.5 KB');
        expect(formatDownloadBytes(-1)).toBe('0 B');
        expect(formatDownloadDuration(0)).toBe('0:00');
        expect(formatDownloadDuration(65_000)).toBe('1:05');
        expect(formatDownloadDuration(3_665_000)).toBe('1:01:05');
    });
});
