/**
 * UNIT30.4 / R4-COMP-CONTROLS-EARLY-END-1 — controls + fullscreen contract.
 *
 * Pre-patch behavior this suite pins (authored with the patch; no RED
 * transcript was captured):
 *  - START and PUBLISH were two adjacent buttons; the START arrow could imply
 *    publish consent.
 *  - Expand and fullscreen both targeted the video stage (not the shell) and
 *    the embedded viewer targeted only the video, so mobile fullscreen lost
 *    the LIVE/VOD controls and had no visible EXIT.
 *  - The viewer called standard + WebKit requestFullscreen together and only
 *    listened to the standard event.
 *
 * These are source-contract tests for the inline page scripts plus a pure
 * action-matrix test. Runtime browser behavior is covered by the deferred
 * real-device acceptance checklist.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveLiveAction } from '../../src/client/helpers/CompetitionSurface';

const ROOT = join(__dirname, '..', '..');
const PAGE = readFileSync(join(ROOT, 'src/modules/pages/competition-page.ts'), 'utf8');
const STYLES = readFileSync(join(ROOT, 'src/styles.css'), 'utf8');
const MESSAGING = readFileSync(join(ROOT, 'src/client/ui/MessagingUI.ts'), 'utf8');
const DOWNLOAD = readFileSync(join(ROOT, 'src/client/ui/RecordingDownloadPanel.ts'), 'utf8');
const CONSTANTS = readFileSync(join(ROOT, 'src/shared/constants.ts'), 'utf8');

function between(source: string, start: string, end: string): string {
    const from = source.indexOf(start);
    expect(from, `start marker: ${start}`).toBeGreaterThanOrEqual(0);
    const to = source.indexOf(end, from + start.length);
    expect(to, `end marker: ${end}`).toBeGreaterThan(from);
    return source.slice(from, to);
}

function buttonTag(source: string, id: string): string {
    const idAt = source.indexOf(`id="${id}"`);
    expect(idAt, `button id: ${id}`).toBeGreaterThanOrEqual(0);
    const start = source.lastIndexOf('<button', idAt);
    const end = source.indexOf('</button>', idAt);
    expect(start, `button start: ${id}`).toBeGreaterThanOrEqual(0);
    expect(end, `button end: ${id}`).toBeGreaterThan(idAt);
    return source.slice(start, end + '</button>'.length);
}

describe('UNIT30.4 one tower entry action matrix', () => {
    const base = {
        status: 'accepted',
        role: 'host' as const,
        hasOpponent: true,
        hasMedia: false,
        mediaPublished: false,
        startInFlight: false,
        publishInFlight: false,
    };

    it('host reaches START then PUBLISH, but never both at once', () => {
        expect(resolveLiveAction(base)).toBe('start');
        // Media during prep does not turn START into PUBLISH; the competition
        // must be LIVE before consent can be the action.
        expect(resolveLiveAction({ ...base, hasMedia: true })).toBe('start');
        expect(resolveLiveAction({ ...base, status: 'live', hasMedia: true })).toBe('publish');
        expect(resolveLiveAction({ ...base, status: 'live', hasMedia: true, mediaPublished: true })).toBe('none');
        expect(resolveLiveAction({ ...base, status: 'live', hasMedia: false })).toBe('none');
    });

    it('opponent can publish but never receives START authority from the UI', () => {
        expect(resolveLiveAction({ ...base, role: 'opponent', hasMedia: true })).toBe('publish');
        expect(resolveLiveAction({ ...base, role: 'opponent', hasMedia: false })).toBe('none');
        for (const status of ['pending', 'accepted', 'live', 'completed', 'cancelled']) {
            expect(resolveLiveAction({ ...base, role: 'opponent', status, hasMedia: true })).not.toBe('start');
        }
    });

    it('viewers, missing state and in-flight actions never show an entry', () => {
        expect(resolveLiveAction(null)).toBe('none');
        expect(resolveLiveAction(undefined)).toBe('none');
        expect(resolveLiveAction({ ...base, role: 'viewer', hasMedia: true })).toBe('none');
        expect(resolveLiveAction({ ...base, startInFlight: true })).toBe('none');
        expect(resolveLiveAction({ ...base, status: 'live', hasMedia: true, publishInFlight: true })).toBe('none');
    });

    it('requires a real opponent for host START and a real local source for publish', () => {
        expect(resolveLiveAction({ ...base, hasOpponent: false })).toBe('none');
        expect(resolveLiveAction({ ...base, status: 'live', hasMedia: false })).toBe('none');
    });
});

describe('UNIT30.4 EXPAND and FULLSCREEN are distinct', () => {
    it('uses different entries, icons, labels, aria state and handlers', () => {
        const expand = buttonTag(PAGE, 'expandBtn');
        const fullscreen = buttonTag(PAGE, 'fullscreenBtn');
        expect(expand).toContain('data-csp-fn="toggleExpandStage"');
        expect(expand).toContain('${tr.expand_stage}');
        expect(expand).toContain('fa-up-right-and-down-left-from-center');
        expect(fullscreen).toContain('data-csp-fn="toggleFullscreen"');
        expect(fullscreen).toContain('${tr.fullscreen}');
        expect(fullscreen).toContain('fa-expand');
        expect(fullscreen).toContain('aria-label=');
        expect(fullscreen).toContain('title=');
    });

    it('expand is in-page theater only; fullscreen targets the shell with controls', () => {
        const expand = between(PAGE, 'window.toggleExpandStage = function()', '// ========== end ==========');
        expect(expand).toContain('stageExpanded = !stageExpanded');
        expect(expand).not.toContain('requestFullscreen');
        expect(expand).not.toContain('fullscreenElement');

        const full = between(PAGE, 'window.toggleFullscreen = async function()', '// Swap large/small');
        expect(full).toContain("document.getElementById('competitorShell')");
        expect(full).toContain('requestFullscreenCompat(shell)');
        expect(full).toContain('exitFullscreenCompat()');
        expect(full).not.toContain('competitorView');
        expect(full).toContain('fullscreen_unavailable');
    });

    it('paints native fullscreen state truthfully and keeps an EXIT inside the shell', () => {
        expect(PAGE).toContain('id="competitorExitFullscreenBtn"');
        expect(PAGE).toContain('data-csp-fn="toggleFullscreen"');
        expect(PAGE).toContain('${tr.exit_fullscreen}');
        expect(PAGE).toContain("document.addEventListener('fullscreenchange'");
        expect(PAGE).toContain("document.addEventListener('webkitfullscreenchange'");
        const paint = between(PAGE, 'function paintFullscreenChrome()', 'window.toggleFullscreen = async function()');
        expect(paint).toContain('fullscreenElement() === shell');
        expect(paint).toContain('fa-compress');
        expect(paint).toContain('fa-expand');
        expect(paint).toContain('aria-pressed');
        expect(paint).toContain('is-active');
        // CSS shows the EXIT only in native fullscreen, never in expand.
        expect(STYLES).toContain('.competitor-shell:fullscreen .fs-exit-btn');
        expect(STYLES).toContain('.competitor-shell:-webkit-full-screen .fs-exit-btn');
        expect(STYLES).toContain('#embeddedViewerSection.is-player-fullscreen .fs-exit-btn');
        expect(STYLES).not.toContain('.competitor-shell.is-expanded .fs-exit-btn');
    });
});

describe('UNIT30.4 viewer fullscreen includes video + controls + EXIT', () => {
    it('targets the viewer shell, not the video-only container', () => {
        const fn = between(PAGE, 'window.embeddedToggleFullscreen = async function()', 'function paintEmbeddedFullscreenChrome()');
        expect(fn).toContain("document.getElementById('embeddedViewerSection')");
        expect(fn).toContain('requestFullscreenCompat(shell)');
        expect(fn).toContain('exitFullscreenCompat()');
        expect(fn).not.toContain('embeddedVideoContainer');
        // Unsupported/rejected APIs get a real fixed shell, not a false lock.
        expect(fn).toContain("shell.classList.add('is-player-fullscreen')");
        expect(fn).toContain('player-shell-locked');
        expect(fn).toContain('fullscreen_unavailable');
        // No P2P/recorder/track/source rebuild on a chrome-only action.
        for (const forbidden of ['publishLocalStream', 'startRecording', 'srcObject', 'new MediaStream', 'replaceTrack', 'getUserMedia']) {
            expect(fn).not.toContain(forbidden);
        }
    });

    it('has one normal entry on the surface and no duplicate VOD entry', () => {
        const viewer = between(PAGE, 'id="embeddedViewerSection"', '<!-- No stream yet -->');
        expect(viewer.match(/id="embeddedFsBtn"/g)?.length).toBe(1);
        const vod = between(PAGE, 'id="embeddedVodControls"', '<!-- No stream yet -->');
        expect(vod).not.toContain('embeddedToggleFullscreen');
        expect(viewer).toContain('id="embeddedExitFullscreenBtn"');
        expect(viewer).toContain('${tr.exit_fullscreen}');
        // The shell really contains the video and both control bars.
        expect(viewer).toContain('id="embeddedVideoContainer"');
        expect(viewer).toContain('id="embeddedLiveControls"');
        expect(viewer).toContain('id="embeddedVodControls"');
    });

    it('handles standard + WebKit events, Escape and rejected promises once', () => {
        expect(PAGE).toContain("document.addEventListener('fullscreenchange', syncEmbeddedFullscreenFromBrowser)");
        expect(PAGE).toContain("document.addEventListener('webkitfullscreenchange', syncEmbeddedFullscreenFromBrowser)");
        expect(PAGE).toContain("if (e.key !== 'Escape') return;");
        expect(PAGE).toContain('is-player-fullscreen');
        const req = between(PAGE, 'function requestFullscreenCompat(el)', 'function exitFullscreenCompat()');
        expect(req).toContain('el.requestFullscreen || el.webkitRequestFullscreen');
        expect(req).toContain('.catch(function() { return false; })');
        expect(req).not.toContain('el.requestFullscreen();');
        const exit = between(PAGE, 'function exitFullscreenCompat()', '// Viewer-only orientation attempt');
        expect(exit).toContain('document.exitFullscreen || document.webkitExitFullscreen');
        expect(exit).toContain('.catch(function() { return false; })');
        expect(exit).not.toContain('document.exitFullscreen();');
    });

    it('attempts landscape only for the viewer and restores it on exit', () => {
        const fn = between(PAGE, 'window.embeddedToggleFullscreen = async function()', 'function paintEmbeddedFullscreenChrome()');
        expect(fn).toContain('attemptLandscapeLock()');
        expect(fn).toContain('releaseLandscapeLock()');
        const competitor = between(PAGE, 'window.toggleFullscreen = async function()', '// Swap large/small');
        expect(competitor).not.toContain('attemptLandscapeLock');
        expect(competitor).not.toContain('screen.orientation');
        const sync = between(PAGE, 'function syncEmbeddedFullscreenFromBrowser()', "document.addEventListener('fullscreenchange'");
        expect(sync).toContain('releaseLandscapeLock()');
    });

    it('CSS keeps video contain, controls and safe areas visible without crop', () => {
        const viewer = between(STYLES, '/* Viewer fullscreen shell:', 'body.live-stage-locked');
        expect(viewer).toContain('height: 100dvh');
        expect(viewer).toContain('env(safe-area-inset-top)');
        expect(viewer).toContain('env(safe-area-inset-bottom)');
        expect(viewer).toContain('object-fit: contain');
        expect(viewer).toContain('#embeddedVodControls');
        expect(viewer).toContain('#embeddedLiveControls');
        expect(viewer).toContain('flex: 1 1 auto');
        expect(viewer).toContain('flex: 0 0 auto');
        expect(STYLES).toContain('display: inline-flex !important');
    });
});

describe('UNIT30.4 shared primary gradient on exactly the three requested actions', () => {
    it('uses the canonical existing purple->indigo treatment, not a new gradient', () => {
        expect(CONSTANTS).toContain("export const DUELI_PRIMARY_GRADIENT = 'bg-gradient-to-r from-purple-600 to-indigo-600';");
        expect(CONSTANTS).toContain("export const DUELI_PRIMARY_GRADIENT_HOVER = 'hover:from-purple-700 hover:to-indigo-700';");
    });

    it('applies it to Download, Send comment and Send message only', () => {
        const comment = between(PAGE, 'data-csp-fn="sendComment"', '</form>');
        expect(comment).toContain('${DUELI_PRIMARY_GRADIENT}');
        expect(comment).toContain('${DUELI_PRIMARY_GRADIENT_HOVER}');
        expect(comment.match(/type="submit"/g)?.length).toBe(1);
        expect(comment).toContain('aria-label=');

        const download = between(PAGE, 'id="embeddedDownloadBtn"', '</button>');
        expect(download).toContain('${DUELI_PRIMARY_GRADIENT}');
        expect(download).toContain('${DUELI_PRIMARY_GRADIENT_HOVER}');
        expect(download).toContain('aria-label=');
        expect(download).toContain('title=');

        expect(DOWNLOAD).toContain('${DUELI_PRIMARY_GRADIENT}');
        expect(DOWNLOAD).toContain('${DUELI_PRIMARY_GRADIENT_HOVER}');
        expect(DOWNLOAD).toContain('disabled:cursor-not-allowed disabled:opacity-50');

        const message = between(MESSAGING, 'data-csp-fn="MessagingUI.sendMessage"', '</form>');
        expect(message).toContain('${DUELI_PRIMARY_GRADIENT}');
        expect(message).toContain('${DUELI_PRIMARY_GRADIENT_HOVER}');
        expect(message.match(/type="submit"/g)?.length).toBe(1);
        expect(message).toContain('aria-hidden="true"');
    });

    it('does not paint the rest of the broadcast toolbar with the primary gradient', () => {
        for (const tone of ['bg-blue-600', 'bg-purple-600', 'bg-indigo-600', 'bg-teal-600', 'bg-gray-600', 'bg-red-600']) {
            expect(PAGE).toContain(`live-tool ${tone}`);
        }
        expect(PAGE).toContain('id="endBtn" class="live-tool bg-red-600');
    });
});
