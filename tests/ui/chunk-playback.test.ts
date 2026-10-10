/**
 * R4-CHUNK-PLAY-1 — page/i18n pins (source-level, fast).
 *
 * Behavioral coverage lives in tests/client/chunk-playback.test.ts (real
 * evaluated logic) and tests/api/chunks-playlist.test.ts (server). This
 * file pins the integration points that behavior cannot reach cheaply:
 *  - single finalize path (no direct finalize.php from the live room page);
 *  - honest best-effort beforeunload (never awaited);
 *  - competition VOD maps proxy upstream states (error/invalid ≠ processing);
 *  - audience-state i18n keys exist in ar AND en (actually translated).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from '../../src/i18n';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

describe('R4-CHUNK-PLAY-1 page integration pins', () => {
    it('1. live room ends through the single uploader finalize (no direct finalize.php call)', () => {
        const room = readSrc('src/modules/pages/live-room-page.ts');
        expect(room).not.toMatch(/fetch\([^)]*finalize\.php/);
        expect(room).toContain('compositor.destroy()');
        expect(room).toContain('/api/competitions/');
    });

    it('2. beforeunload is best-effort (never awaited — no false promises)', () => {
        const room = readSrc('src/modules/pages/live-room-page.ts');
        const unload = room.match(/addEventListener\('beforeunload'[\s\S]{0,800}/);
        expect(unload, 'beforeunload handler must exist').toBeTruthy();
        expect(unload![0]).not.toMatch(/await compositor\.destroy\(\)/);
        expect(unload![0]).not.toMatch(/await p2p\.disconnect\(\)/);
    });

    it('3. competition VOD maps upstream error/invalid to error (not processing)', () => {
        const comp = readSrc('src/modules/pages/competition-page.ts');
        expect(comp).toContain('playlistData.upstream');
        expect(comp).toMatch(/upstream === 'error'/);
        expect(comp).toMatch(/upstream === 'invalid'/);
    });

    it('4. playlist polling stays bounded (backoff cap + bounded misses + edge cache)', () => {
        const shared = readSrc('src/modules/pages/live/scripts/client/shared.ts');
        expect(shared).toMatch(/Math\.min\(1000 \+ .* \* 500, 5000\)/);
        expect(shared).toContain('MAX_MISSES');
        expect(shared).toContain('MAX_CONSECUTIVE_ERRORS');
        expect(shared).toContain('MAX_GAP_SKIP');
    });

    it('5. audience-state i18n keys exist in ar and en (translated, non-empty)', () => {
        for (const key of [
            'connecting_to_stream', 'loading_video', 'stream_ended',
            'streaming_unavailable', 'recording_not_ready', 'chunk',
        ] as const) {
            const arText = (translations.ar as Record<string, unknown>)[key];
            const enText = (translations.en as Record<string, unknown>)[key];
            expect(typeof arText, `ar.${key}`).toBe('string');
            expect(typeof enText, `en.${key}`).toBe('string');
            expect((arText as string).length, `ar.${key} non-empty`).toBeGreaterThan(0);
            expect((enText as string).length, `en.${key} non-empty`).toBeGreaterThan(0);
            expect(arText, `${key} translated`).not.toBe(enText);
        }
    });

    it('6. no dead parallel player is referenced by production surfaces', () => {
        // client/services/ChunkPlayer.ts, live/core.ts and the shared-string
        // VodMsePlayer have no consumers — document the fact so nobody wires
        // a second player by accident (row 27 owns download/merge output).
        const comp = readSrc('src/modules/pages/competition-page.ts');
        const room = readSrc('src/modules/pages/live-room-page.ts');
        const viewer = readSrc('src/modules/pages/live/scripts/client/viewer.ts');
        for (const src of [comp, room, viewer]) {
            expect(src).not.toMatch(/VodMsePlayer/);
            expect(src).not.toMatch(/window\.ChunkPlayer/);
        }
    });
});
