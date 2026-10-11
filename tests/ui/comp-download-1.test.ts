/**
 * R4-CHUNK-DOWNLOAD-1 (row 27) UI contract pins — unified page only.
 *
 * B (no functional /live dependence): goLive stays in-page, no /live href
 *   or redirect string remains in competition-page; /live/:id is a server
 *   redirect to /competition/:id (main.ts), finance + test pages intact.
 * C (automatic transitions): competition_status is published by the
 *   controllers and consumed on the always-on channel; one bounded
 *   statusWatch replaces the per-viewer poll; re-entry never stacks
 *   players/listeners; same-status refreshes never re-render.
 * A (download): the emitted player assembles a real MP4 (concat +
 *   re-encode, ftyp-proven) with progress/cancel/explicit errors; the
 *   legacy unbounded merge wait is bounded; cancel is CSP-allowed.
 * D (single recorder): lease endpoints + gates + migration exist; the page
 *   claims before recording and aborts (no finalize) on loss.
 * Plus: new i18n keys ar/en translated, RTL/dark-safe progress UI.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { translations } from '../../src/i18n';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(resolve(__dirname, '../../' + rel), 'utf-8');

const PAGE = 'src/modules/pages/competition-page.ts';
const SHARED = 'src/modules/pages/live/scripts/client/shared.ts';
const MAIN = 'src/main.ts';
const CSP = 'src/client/csp-delegate.ts';
const ROUTES = 'src/modules/api/chunks/routes.ts';
const CONTROLLER = 'src/controllers/CompetitionController.ts';
const UPLOADER = 'src/client/services/ChunkUploader.ts';
const COMPOSITOR = 'src/client/services/VideoCompositor.ts';

describe('R4-CHUNK-DOWNLOAD-1 unified-page contract', () => {
    it('B1. goLive stays in-page: no /live navigation or href in the unified page', () => {
        const page = readSrc(PAGE);
        expect(page).not.toContain("window.location.href = '/live/'");
        expect(page).not.toContain('<a href="/live/');
        expect(page).not.toContain('href="/live/${competitionId}');
        // The start call itself is unchanged (server decision stays).
        expect(page).toContain("'/api/competitions/' + competitionId + '/start'");
        // In-page follow-up: reload straight onto the live DOM (lossless
        // pre-live — never a /live navigation, never a stranding fetch).
        expect(page).toContain('location.reload()');
    });

    it('B2. /live/:id is a server redirect to /competition/:id (no loop, lang kept)', () => {
        const main = readSrc(MAIN);
        expect(main).toContain("app.get('/live/:id'");
        expect(main).toContain('c.redirect(`/competition/${id}${suffix}`');
        // No second execution path, no redirect loop back from the page (B1).
        expect(main).not.toMatch(/app\.get\('\/live\/:id', liveRoomPage/);
        // Untouched: test-lab pages and the finance dashboard stay routed.
        expect(main).toContain('/live/:id/finance');
    });

    it('B3. test pages stay diagnostic-only; live-room module intact for its tests', () => {
        for (const rel of [
            'src/modules/pages/live/scripts/client/host.ts',
            'src/modules/pages/live/scripts/client/guest.ts',
            'src/modules/pages/live/scripts/client/viewer.ts',
            'src/modules/pages/live-room-page.ts',
        ]) {
            expect(() => readSrc(rel)).not.toThrow();
        }
        expect(readSrc('src/modules/pages/index.ts')).toContain('liveRoomPage');
        // Production page never links the test-only rooms.
        expect(readSrc(PAGE)).not.toMatch(/\/live\/(host|guest|viewer)\?comp=/);
    });

    it('C1. controllers publish competition_status on the existing channel', () => {
        const controller = readSrc(CONTROLLER);
        expect(controller).toContain('publishCompetitionStatus(');
        // pending→accepted carries the new opponent; accepted→live and
        // live→completed carry the status. (CRLF-safe: no newline matching.)
        expect(controller).toContain("competitionId, 'accepted'");
        expect(controller).toContain("opponent_id: request.requester_id");
        expect(controller).toContain("publishCompetitionStatus(id, 'live')");
        expect(controller).toContain("publishCompetitionStatus(id, 'completed')");
        // The event type existed but was never published before this unit.
        expect(readSrc('src/lib/services/EventPusher.ts')).toContain('async publishCompetitionStatus(');
    });

    it('C2. page listens on the always-on channel + one bounded watcher (no dup timers)', () => {
        const page = readSrc(PAGE);
        // Listener rides the comments stream (exists in every status).
        expect(page).toContain("es.addEventListener('competition_status'");
        expect(page).toContain('handleRemoteStatus');
        // Single watcher with start/stop guards; the old per-viewer 30s
        // poll is gone.
        expect(page).toContain('startStatusWatch()');
        expect(page).toContain('stopStatusWatch()');
        expect(page).toContain('statusWatchTimer = setInterval');
        expect(page).not.toContain('window._statusPollInterval = setInterval');
        // Same-status refresh adopts fields silently — never re-renders
        // (re-render destroys live video elements).
        expect(page).toMatch(/fresh\.status === competitionData\.status/);
    });

    it('C3. live→completed tears down in place; pre-live converges without media loss', () => {
        const page = readSrc(PAGE);
        expect(page).toContain('teardownLiveMedia()');
        expect(page).toContain('applyRemoteStatusTransition');
        // Host finalizes before leaving live (tail + merge never lost).
        expect(page).toContain('await teardownLiveMedia()');
        // Re-entry never stacks players (C4).
        expect(page).toContain('stop the previous player FIRST');
        // Pre-live reloads are lossless by construction (documented rule).
        expect(page).toContain("oldStatus === 'pending' || oldStatus === 'accepted'");
        // C4 glare guard: the offer loop lives until CONNECTED (bounded
        // 15s re-offer), so simultaneous transition re-inits converge
        // instead of stalling on one mismatched pair.
        expect(page).toContain('competitorLastOfferAt');
        expect(page).toContain('now - competitorLastOfferAt >= 15000');
    });

    it('A1. emitted player assembles a real MP4 (concat + re-encode, ftyp proof)', () => {
        const shared = readSrc(SHARED);
        expect(shared).toContain('async assembleRecording(');
        expect(shared).toContain('async downloadAssembled(');
        expect(shared).toContain('loadFfmpegCore(');
        expect(shared).toContain('isValidMp4Bytes(');
        // Re-encode (continuous timestamps/duration/seek), not byte-concat.
        expect(shared).toContain("'-c:v', 'libx264'");
        expect(shared).toContain("'-movflags', '+faststart'");
        // ftyp proof gates the .mp4 name on both new and legacy paths.
        expect(shared).toContain('OUTPUT_INVALID');
        // The naive unbounded merge wait is bounded with explicit gaps.
        expect(shared).toContain('MERGE_INCOMPLETE');
        expect(shared).not.toMatch(/while \(!this\.isFullyLoaded\(\)\) \{\s*\n/);
    });

    it('A2. page download uses assembly with progress + cancel (CSP-allowed)', () => {
        const page = readSrc(PAGE);
        expect(page).toContain('downloadAssembled(');
        expect(page).toContain('id="embeddedDownloadProgress"');
        expect(page).toContain('id="embeddedDownloadBar"');
        expect(page).toContain('window.embeddedCancelDownload');
        expect(page).toContain('role="status" aria-live="polite"');
        expect(readSrc(CSP)).toContain("'embeddedCancelDownload'");
        // Gaps and cancel are reported, never silent.
        expect(page).toContain('download_gaps');
        expect(page).toContain('download_cancelled');
    });

    it('D1. lease endpoints + gates + store exist (server)', () => {
        const routes = readSrc(ROUTES);
        for (const p of ['/lease/acquire', '/lease/heartbeat', '/lease/release', '/lease/:id']) {
            expect(routes).toContain(p);
        }
        expect(routes).toContain('Only the host can hold the recording lease');
        expect(routes).toContain('lease_held');
        expect(routes).toContain('lease_unavailable');
        // Deployment-window honesty: missing store ⇒ explicit 503, not a crash.
        expect(routes).toContain("code: 'lease_unavailable'");
        const mig = readSrc('migrations/0040_recording_leases.sql');
        expect(mig).toContain('CREATE TABLE IF NOT EXISTS recording_leases');
        expect(mig).toContain('generation');
        expect(readSrc('src/models/RecordingLeaseModel.ts')).toContain('class RecordingLeaseModel');
    });

    it('D2. recorder claims before capture; loss aborts without finalize (client)', () => {
        const comp = readSrc(COMPOSITOR);
        expect(comp).toContain('acquireRecordingLease()');
        expect(comp).toContain('async abortRecording()');
        expect(comp).toContain('aborting');
        const uploader = readSrc(UPLOADER);
        expect(uploader).toContain('async acquireLease()');
        expect(uploader).toContain('handleLeaseLost');
        expect(uploader).toContain('Finalize refused (lease lost)');
        expect(uploader).toContain('class PlatformRecordingLease');
        // Page wiring: claim-first + bounded re-claim + loss toast.
        const page = readSrc(PAGE);
        expect(page).toContain('acquireRecordingLease()');
        expect(page).toContain('notifyLeaseHeld');
        expect(page).toContain('recording_lease_lost');
        expect(page).toContain('new window.PlatformRecordingLease(');
        // /end frees the lease server-side (no stuck lock).
        expect(readSrc(CONTROLLER)).toContain('releaseForCompetition(id)');
    });

    it('E. new i18n keys exist ar+en (translated, non-empty) + RTL-safe progress', () => {
        for (const key of [
            'download_fetching', 'download_assembling', 'download_validating',
            'download_done', 'download_gaps', 'download_failed', 'download_cancelled',
            'recording_in_use', 'recording_lease_lost',
        ] as const) {
            const arText = (translations.ar as Record<string, unknown>)[key];
            const enText = (translations.en as Record<string, unknown>)[key];
            expect(typeof arText, `ar.${key}`).toBe('string');
            expect(typeof enText, `en.${key}`).toBe('string');
            expect((arText as string).length, `ar.${key} non-empty`).toBeGreaterThan(0);
            expect((enText as string).length, `en.${key} non-empty`).toBeGreaterThan(0);
            expect(arText, `${key} translated`).not.toBe(enText);
        }
        // Progress UI uses logical-safe flex + dark variants (no fixed side).
        const page = readSrc(PAGE);
        expect(page).toContain('id="embeddedDownloadProgress"');
        expect(page).toContain('bg-gray-700');
    });
});
