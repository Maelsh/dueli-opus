/**
 * R4-LIVE-END-RECOVERY-1 (unit 28.5) — end/state/finalization/leave wiring.
 *
 * Source-level pins for the server-rendered inline page (the page body is
 * client-rendered). These are NOT visual/audio proof; real two-party
 * end-of-recording acceptance remains pending.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translations } from '../../src/i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(resolve(__dirname, '../../' + rel), 'utf-8');

const PAGE = 'src/modules/pages/competition-page.ts';
const CSP = 'src/client/csp-delegate.ts';

function between(src: string, start: string, end: string): string {
    const a = src.indexOf(start);
    expect(a, `marker exists: ${start}`).toBeGreaterThanOrEqual(0);
    const b = src.indexOf(end, a + start.length);
    expect(b, `marker after ${start}: ${end}`).toBeGreaterThanOrEqual(0);
    return src.slice(a, b);
}

describe('R4-LIVE-END-RECOVERY-1 (28.5) end/state/finalization/leave', () => {
    const page = readSrc(PAGE);
    const csp = readSrc(CSP);

    it('1. FV20-END: completed is a viewer surface for both competitors, without a refresh', () => {
        const check = between(page, 'function checkAndInitStream()', '// Hook into renderCompetition');
        // The old participant exception is exactly what hid the recording.
        expect(check).not.toContain('isUserCreator || isUserOpponent');
        expect(check).toContain("if (surface === 'competitor')");
        expect(check).toContain('initEmbeddedViewer()');
        expect(page).toContain('if (becameCompleted)');
        const apply = between(page, 'function applyCompetitionState(next)', 'async function syncCompetitionFromServer');
        expect(apply).toContain('beginTerminalTeardown()');
        expect(apply).toContain('closeRatingUi()');
        expect(apply).toContain('renderCompetition(nextComp)');
        expect(apply).toContain("nextComp.status === 'completed'");
        // No automatic end from a close/reload: only the explicit end handler
        // POSTs /end.
        expect(page.match(/\/competitions\/' \+ competitionId \+ '\/end/g)?.length).toBe(1);
    });

    it('2. FV20-END: SSE carries the persisted ended_at and missing events recover by GET', () => {
        const sse = between(page, 'function subscribeCompetitionStatus()', '// B2+B3: paged comments');
        expect(sse).toContain('payload.ended_at');
        expect(sse).toContain('scheduleStatusResync(0)');
        expect(page).toContain('syncCompetitionFromServer');
        expect(page).toContain("es.addEventListener('competition_status'");
        // Visibility/rating close is driven by the completed state, not by
        // the participant's own end button.
        expect(page).toContain("document.getElementById('rateStars')");
        expect(page).toContain('rateFinalNote');
    });

    it('3. FV20-FINAL: end does not wait for uploads, does not reload, and makes no VOD claim', () => {
        const end = between(page, "window.endStream = async function()", '// Navigation away never ends');
        expect(end).toContain("'/api/competitions/' + competitionId + '/end'");
        expect(end).not.toContain('vod_url');
        expect(end).not.toContain('location.reload');
        expect(end).toContain('applyCompetitionState');
        expect(end).toContain('scheduleStatusResync(0)');
        // The end request is not blocked by recorder drain.
        expect(end).not.toContain('await compositor.destroy()');
        const stop = between(page, 'function stopRecorderForEnd()', 'function beginTerminalTeardown()');
        expect(stop).toContain('active.destroy()');
        expect(stop).toContain('recordingStopPromise');
        expect(stop).toContain('stopCompositing()');
        const teardown = between(page, 'function beginTerminalTeardown()', 'function closeRatingUi()');
        expect(teardown).toContain('terminalTeardownStarted');
        expect(teardown).toContain('activeP2P.stopLocalMedia()');
        expect(teardown).toContain('activeP2P.disconnect()');
        expect(teardown).toContain('durationTicker');
        expect(teardown).toContain('competitorWatcher');
        expect(teardown).toContain('waitBounded');
        // In-flight acquisition/startup cannot re-attach devices after end.
        expect(between(page, 'async function initCompetitorStream()', 'p2p = new window.P2PConnection'))
            .toContain('terminalTeardownStarted');
        expect(between(page, 'async function acquireCameraVideo()', 'async function acquireMicAudio()'))
            .toContain('terminalTeardownStarted');
        expect(between(page, 'async function acquireMicAudio()', '// Stop screen sharing'))
            .toContain('terminalTeardownStarted');
        // No invented finalize endpoint and no legacy PHP path.
        expect(page).not.toContain('finalize.php');
        expect(page).not.toMatch(/fetch\([^)]*finalize/i);
    });

    it('4. FV20-LEAVE: voluntary leave-and-return is removed; End remains the only terminal action', () => {
        expect(page).not.toContain('id="leaveBtn"');
        expect(page).not.toContain('id="leaveConfirm"');
        expect(page).not.toContain('window.leaveBroadcast');
        expect(page).not.toContain('window.cancelLeaveCompetition');
        expect(page).not.toContain('window.confirmLeaveCompetition');
        expect(page).not.toContain('leave_broadcast');
        expect(csp).not.toContain("'leaveBroadcast'");
        expect(csp).not.toContain("'cancelLeaveCompetition'");
        expect(csp).not.toContain("'confirmLeaveCompetition'");
        expect(page).toContain('id="endBtn"');
        expect(page).toContain('tr.end_competition_confirm');
        expect((translations.ar as Record<string, unknown>).leave_broadcast).toBeUndefined();
        expect((translations.en as Record<string, unknown>).leave_broadcast).toBeUndefined();
    });

    it('5. FV20-LEAVE: navigation warning/cleanup never ends, finalizes or blocks reconnect', () => {
        const before = between(page, "addEventListener('beforeunload'", "addEventListener('pagehide'");
        expect(before).not.toContain('/end');
        expect(before).not.toContain('fetch(');
        expect(before).not.toContain('destroy()');
        const hide = between(page, "window.addEventListener('pagehide'", '// Check if competition needs embedded viewer');
        expect(hide).not.toContain('fetch(');
        expect(hide).not.toContain('/end');
        expect(hide).not.toContain('destroy()');
        // Forced disconnect recovery remains wired.
        expect(page).toContain('onReconnectNeeded');
        expect(page).toContain('watchCompetitorOpponent()');
    });
});
