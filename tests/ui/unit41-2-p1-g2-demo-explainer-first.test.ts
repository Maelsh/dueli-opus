/**
 * UNIT41.2-P1 (G2) — the unified demo explainer is tried FIRST in every
 * "no real chunks" branch of the competition page player.
 *
 * Contract under test (competition-page completed-recording resolution):
 * - playlist request !ok        → showDemoExplainer() first, fallback after
 * - upstream error/invalid      → showDemoExplainer() first, fallback after
 * - empty chunk list (terminal recording_state or transient) → explainer first
 * In all three branches the explainer check precedes the legacy handler
 * (handleVodNotReady / error overlay / unavailable overlay), so a completed
 * competition without real chunks shows the configured unified video when
 * one exists instead of the processing/retry spinner.
 *
 * Slices are located by content anchors (not line numbers) and compared by
 * FIRST occurrence order, so the tests survive reflows and line endings.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(process.cwd(), 'src/modules/pages/competition-page.ts'), 'utf-8');

function slice(from: string, to: string): string {
    const start = src.indexOf(from);
    expect(start, `anchor not found: ${from}`).toBeGreaterThan(-1);
    const end = src.indexOf(to, start);
    expect(end, `end anchor not found after: ${from}`).toBeGreaterThan(start);
    return src.slice(start, end);
}

/** Completion-player resolution region: from the playlist fetch to the honest VOD mode. */
function completedRegion(): string {
    return slice(
        "fetch('/api/chunks/playlist/' + competitionId)",
        "updateEmbeddedMode('vod')",
    );
}

describe('UNIT41.2-P1 G2 — demo explainer wins the no-real-chunks branches', () => {
    it('1. playlist !ok branch: explainer first, honest fallback second', () => {
        const branch = completedRegion().slice(
            completedRegion().indexOf('if (!playlistRes.ok)'),
            completedRegion().indexOf('const playlistData'),
        );
        const explainerAt = branch.indexOf('if (showDemoExplainer()) return;');
        const fallbackAt = branch.indexOf('handleVodNotReady()');
        expect(explainerAt).toBeGreaterThan(-1);
        expect(fallbackAt).toBeGreaterThan(explainerAt);
    });

    it('2. upstream error/invalid branch: explainer first, error overlay second', () => {
        const region = completedRegion();
        const branch = region.slice(
            region.indexOf("upstream === 'error' || playlistData.upstream === 'invalid'"),
            region.indexOf("if (!playlistData.chunks || playlistData.chunks.length === 0)"),
        );
        const explainerAt = branch.indexOf('if (showDemoExplainer()) return;');
        const errorAt = branch.indexOf("setMediaState('error')");
        expect(explainerAt).toBeGreaterThan(-1);
        expect(errorAt).toBeGreaterThan(explainerAt);
    });

    it('3. empty-chunks branch: explainer first in BOTH index states', () => {
        const region = completedRegion();
        const emptyBranch = region.slice(
            region.indexOf('if (!playlistData.chunks || playlistData.chunks.length === 0)'),
        );
        // Terminal recording_state === 'none' resolution.
        const noneBranch = emptyBranch.slice(
            emptyBranch.indexOf("playlistData.index_metadata && playlistData.index_metadata.recording_state === 'none'"),
        );
        const explainerAt = noneBranch.indexOf('if (showDemoExplainer()) return;');
        const unavailableAt = noneBranch.indexOf("setMediaState('unavailable')");
        expect(explainerAt).toBeGreaterThan(-1);
        expect(unavailableAt).toBeGreaterThan(explainerAt);

        // Transient empty list: the explainer still wins before handleVodNotReady.
        const tailBranch = emptyBranch.slice(
            emptyBranch.lastIndexOf('UNIT41.2-P1 (G2)'),
        );
        const tailExplainerAt = tailBranch.indexOf('if (showDemoExplainer()) return;');
        const tailFallbackAt = tailBranch.indexOf('handleVodNotReady()');
        expect(tailExplainerAt).toBeGreaterThan(-1);
        expect(tailFallbackAt).toBeGreaterThan(tailExplainerAt);
    });

    it('4. the explainer helper is defined and honors the owner configuration', () => {
        expect(src).toMatch(/function showDemoExplainer\(/);
        expect(src).toMatch(/demo_explainer_video_url/);
    });
});
