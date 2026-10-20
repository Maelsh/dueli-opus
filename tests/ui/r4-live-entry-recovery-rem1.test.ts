/**
 * R4-LIVE-ENTRY-RECOVERY-REM1 (unit 28.3.1) — unified broadcast entry.
 *
 * Contract under test (source-level pins + a parse gate on the rendered
 * inline scripts; the page body is client-rendered, so the markup lives
 * inside the page's own script template):
 *  1. `/competition/:id` is the ONE production broadcast UI; the start
 *     action happens in place (no navigation to a second /live room).
 *  2. Invite acceptance + LIVE arrive over the EXISTING competition SSE
 *     channel plus one bounded GET resync (no polling loop, no refresh).
 *  3. Preparation allows a screen source without camera/mic; camera/mic
 *     acquisition, invite acceptance, LIVE and refresh never publish.
 *     Publish is exactly one explicit handler.
 *  4. Per-party consent: recording stays host-only AND live+publish gated.
 *  5. Tools mirror the mandatory reference (host.ts/guest.ts/test.css):
 *     icon-only, 40px, translated title/aria-label, visible focus; screen
 *     blue, camera purple, switch indigo, mic green, speaker teal,
 *     hide-local gray, actions green/amber/red.
 *  6. Exactly two <video> elements in the competitor stage; large/small
 *     roles move by CSS, a third video is never added.
 *  7. Leave/back never end the competition and never trap the user
 *     (in-page confirm, no beforeunload).
 *
 * S (visual/audio/device) verification is manual and tracked separately in
 * the task report — these pins are NOT visual/audio proof.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { translations } from '../../src/i18n';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(resolve(__dirname, '../../' + rel), 'utf-8');

const PAGE = 'src/modules/pages/competition-page.ts';
const CSP = 'src/client/csp-delegate.ts';
const STYLES = 'src/styles.css';
const ROOM = 'src/modules/pages/live-room-page.ts';
const COMPOSITOR = 'src/client/services/VideoCompositor.ts';
const REFERENCE_HOST = 'src/modules/pages/live/views/host.ts';
const REFERENCE_GUEST = 'src/modules/pages/live/views/guest.ts';
const REFERENCE_CSS = 'src/modules/pages/live/styles/test.css';

/** Slice between two literal markers; fails loudly when a marker moved. */
function between(src: string, start: string, end: string): string {
    const a = src.indexOf(start);
    expect(a, `marker exists: ${start}`).toBeGreaterThanOrEqual(0);
    const b = src.indexOf(end, a + start.length);
    expect(b, `marker after ${start}: ${end}`).toBeGreaterThanOrEqual(0);
    return src.slice(a, b);
}

function button(src: string, id: string): string {
    const m = src.match(new RegExp(`<button[^>]*id="${id}"[^>]*>[\\s\\S]*?<\\/button>`));
    expect(m, `button exists: ${id}`).toBeTruthy();
    return m![0];
}

describe('R4-LIVE-ENTRY-RECOVERY-REM1 broadcast surface', () => {
    const page = readSrc(PAGE);

    it('1. /competition/:id is the room and start happens in place (no redirect)', () => {
        // No in-page navigation to the old room implementation.
        expect(page).not.toContain("location.href = '/live/'");
        expect(page).not.toContain("location.replace('/live/'");
        expect(page).not.toMatch(/window\.location\s*=\s*['"`]\/live\//);
        // In-place start: same page, status chrome + bounded resync + record
        // eligibility (never a teardown of the preview/PC/recorder).
        const start = between(page, 'async function startCompetition()', 'window.startCompetition = startCompetition');
        expect(start).toContain("'/api/competitions/' + competitionId + '/start'");
        expect(start).toContain('paintCompetitionChrome()');
        expect(start).toContain('maybeStartRecording()');
        expect(start).toContain('scheduleStatusResync(0)');
        expect(start).not.toContain('location.reload');
        expect(start).not.toContain('location.href');
    });

    it('2. status updates ride the existing competition SSE + bounded GET resync', () => {
        expect(page).toContain('function subscribeCompetitionStatus()');
        expect(page).toContain("new EventSource('/api/sse?channel=' + encodeURIComponent('competition:' + competitionId))");
        expect(page).toContain("es.addEventListener('competition_status'");
        // Bounded resync: 4 tries 0/1.5/4/8s, never a polling loop.
        expect(page).toContain('[0, 1500, 4000, 8000]');
        expect(page).toContain('tries > 3');
        expect(page).toContain("fetch('/api/competitions/' + competitionId)");
        // Structural re-render only on a surface change; accepted→live is
        // chrome-only so the PC/recorder/preview stay mounted.
        const apply = between(page, 'function applyCompetitionState(next)', 'async function syncCompetitionFromServer');
        expect(apply).toContain('nextSurface !== prevSurface');
        expect(apply).toContain('renderCompetition(competitionData)');
        expect(apply).not.toContain('location.reload');
        // The subscription is started by the single dynamics init.
        expect(between(page, 'async function initCompetitionDynamics()', 'function watchHeaders()'))
            .toContain('subscribeCompetitionStatus()');
    });

    it('3. acquisition/acceptance/LIVE/refresh never publish; one explicit consent handler', () => {
        // Exactly one call site of the publish contract (the explicit handler).
        expect(page.match(/p2p\.publishLocalStream\(\)/g)?.length).toBe(1);
        const publish = between(page, 'async function publishMedia()', 'window.publishMedia = publishMedia');
        expect(publish).toContain('if (!p2p || mediaPublished) return;');
        expect(publish).toContain('p2p.publishLocalStream()');
        expect(publish).toContain('tr.nothing_to_publish');
        // Acquisition must not publish (initLocalStream is preview-only).
        const init = between(page, 'async function initCompetitorStream()', 'async function publishMedia()');
        expect(init).toContain('p2p.initLocalStream()');
        expect(init).not.toContain('publishLocalStream');
        expect(init).not.toContain('mediaPublished');
        // Screening during prep is allowed and independent from consent.
        const share = between(page, 'window.shareScreen = async function()', 'window.toggleAudio = async function()');
        expect(share).toContain('getDisplayMedia');
        expect(share).not.toContain('mediaPublished');
        expect(share).toContain('p2p.isLocalPublished()');
        // No page-level sender introspection (consent lives in the adapter).
        expect(page).not.toContain('getSenders');
    });

    it('4. honest publish state + no misleading end/start buttons', () => {
        const paint = between(page, 'function paintCompetitorControls()', 'function applyStageVisibility()');
        // Publish line is driven by mediaPublished/prepReady, never by LIVE.
        expect(paint).toContain('if (mediaPublished) setPublishState(tr.publish_state_on);');
        expect(paint).toContain('setPublishState(tr.publish_state_off)');
        expect(paint).toContain('setPublishState(tr.media_none)');
        expect(paint).toContain("setHidden('endBtn', status !== 'live')");
        expect(paint).toContain("setHidden('startBtn', !canStart)");
        expect(paint).toContain("const canStart = status === 'accepted' && !!competitionData.opponent_id && !startInFlight;");
        // Publish appears only with a real local source + p2p, and not twice.
        expect(paint).toContain("setHidden('publishBtn', !p2p || mediaPublished || !hasMedia)");
        expect(paint).toContain("setHidden('screenBtn', !supportsScreenShare())");
        // End is guarded by LIVE state and an explicit confirmation.
        const end = between(page, 'window.endStream = async function()', '// Navigation away never ends');
        expect(end).toContain("competitionData.status !== 'live'");
        expect(end).toContain('tr.end_competition_confirm');
        expect(end).toContain("'/api/competitions/' + competitionId + '/end'");
    });

    it('5. tools mirror the mandatory reference palette, icon-only + translated', () => {
        const referenceHost = readSrc(REFERENCE_HOST);
        const referenceGuest = readSrc(REFERENCE_GUEST);
        const referenceCss = readSrc(REFERENCE_CSS);
        // Mandatory reference still carries the palette + 40px round controls.
        for (const tone of ['bg-blue-600', 'bg-purple-600', 'bg-indigo-600', 'bg-green-600', 'bg-teal-600', 'bg-gray-600']) {
            expect(referenceHost, `reference host ${tone}`).toContain(tone);
        }
        expect(referenceHost).toContain('bg-amber-600');
        expect(referenceHost).toContain('bg-red-600');
        expect(referenceGuest.length).toBeGreaterThan(0);
        expect(referenceCss).toMatch(/\.control-btn\s*\{[^}]*width:\s*40px;[^}]*height:\s*40px;/);

        const tools: Array<[string, string, string]> = [
            ['startBtn', 'bg-green-600', 'start_competition'],
            ['publishBtn', 'bg-green-600', 'prep_publish_host'],
            ['screenBtn', 'bg-blue-600', 'share_screen'],
            ['videoBtn', 'bg-purple-600', 'toggle_camera'],
            ['switchCamBtn', 'bg-indigo-600', 'switch_camera'],
            ['audioBtn', 'bg-green-600', 'toggle_mic'],
            ['speakerBtn', 'bg-teal-600', 'toggle_speaker'],
            ['localVideoBtn', 'bg-gray-600', 'toggle_my_video'],
            ['swapBtn', 'bg-indigo-600', 'swap_videos'],
            ['expandBtn', 'bg-indigo-600', 'expand_stage'],
            ['fullscreenBtn', 'bg-gray-600', 'fullscreen'],
            ['leaveBtn', 'bg-amber-600', 'leave_broadcast'],
            ['endBtn', 'bg-red-600', 'end_competition'],
        ];
        for (const [id, tone, key] of tools) {
            const tag = button(page, id);
            expect(tag, `${id} color`).toContain(tone);
            expect(tag, `${id} aria-label`).toContain('aria-label="\\${tr.');
            expect(tag, `${id} title`).toContain('title="\\${tr.');
            expect(tag, `${id} tr key`).toContain('\\${tr.' + key + '}');
            // Icon-only: nothing but one aria-hidden icon inside the button.
            const inner = tag.slice(tag.indexOf('>') + 1, tag.lastIndexOf('</button>')).trim();
            expect(inner, `${id} icon-only`).toMatch(/^<i class="[^"]+" aria-hidden="true"><\/i>$/);
        }
        // Every tool handler is wired in the page and CSP-allowlisted.
        const handlers: Array<[string, string]> = [
            ['startBtn', 'startCompetition'],
            ['publishBtn', 'publishMedia'],
            ['screenBtn', 'shareScreen'],
            ['videoBtn', 'toggleVideo'],
            ['switchCamBtn', 'switchCamera'],
            ['audioBtn', 'toggleAudio'],
            ['speakerBtn', 'toggleSpeaker'],
            ['localVideoBtn', 'toggleLocalVideo'],
            ['swapBtn', 'swapVideos'],
            ['expandBtn', 'toggleExpandStage'],
            ['fullscreenBtn', 'toggleFullscreen'],
            ['leaveBtn', 'leaveBroadcast'],
            ['endBtn', 'endStream'],
        ];
        const csp = readSrc(CSP);
        for (const [id, fn] of handlers) {
            expect(button(page, id), `${id} CSP wiring`).toContain(`data-csp-fn="${fn}"`);
            expect(page, `${fn} defined`).toMatch(new RegExp(`window\\.${fn}\\s*=`));
            expect(csp, `${fn} allowlisted`).toContain(`'${fn}'`);
        }
        // Visible focus + 40px shape classes are real CSS, not dead markup.
        const styles = readSrc(STYLES);
        expect(styles).toMatch(/\.live-tool\s*\{[^}]*width:\s*2\.5rem;[^}]*height:\s*2\.5rem;[^}]*border-radius:\s*9999px;/);
        expect(styles).toContain('.live-tool:focus-visible');
        expect(styles).toContain('outline: 2px solid');
    });

    it('6. exactly two videos in the competitor stage; swap moves CSS roles only', () => {
        const stage = between(page, 'id="competitorView"', 'id="competitorControls"');
        expect(stage.match(/<video/g)?.length).toBe(2);
        expect(stage.match(/id="localVideo"/g)?.length).toBe(1);
        expect(stage.match(/id="remoteVideo"/g)?.length).toBe(1);
        // The only canvas is the hidden recording compositor canvas.
        expect(stage.match(/<canvas/g)?.length).toBe(1);
        expect(stage).toContain('id="compositeCanvas" class="hidden"');
        // Layouts: normal, in-page expanded, native fullscreen.
        const styles = readSrc(STYLES);
        expect(styles).toContain('.live-stage.is-swapped');
        expect(styles).toContain('.live-stage.is-expanded');
        expect(styles).toContain('.live-stage-pip');
        expect(styles).toContain('body.live-stage-locked');
        expect(page).toContain('window.toggleExpandStage = function()');
        expect(page).toContain("stage.classList.toggle('is-swapped', videosSwapped)");
        expect(page).toContain("stage.classList.toggle('is-expanded', stageExpanded)");
        expect(page).toContain("document.body.classList.toggle('live-stage-locked', stageExpanded)");
        // Small pane is draggable inside bounds, hideable, and resets on swap.
        const pip = between(page, 'function makePipDraggable(el)', 'function setupCompetitorStage()');
        expect(pip).toContain("const pipId = videosSwapped ? 'remoteVideoWrapper' : 'localVideoWrapper';");
        expect(pip).toContain('Math.min(Math.max(0, startLeft + (moveEv.clientX - startX)), maxLeft)');
        expect(pip).toContain('Math.min(Math.max(0, startTop + (moveEv.clientY - startY)), maxTop)');
        expect(page).toContain('function resetPipPosition()');
        expect(page).toContain('window.swapVideos = function()');
        // Hide-local never touches tracks/senders.
        const hide = between(page, 'window.toggleLocalVideo = function()', 'window.switchCamera = async function()');
        expect(hide).toContain('localVideoVisible = !localVideoVisible');
        expect(hide).not.toContain('stop()');
        expect(hide).not.toContain('publishLocalStream');
    });

    it('7. screen source is preparable without camera/mic; stop never hides a sender', () => {
        const share = between(page, 'window.shareScreen = async function()', 'window.toggleAudio = async function()');
        // Audio-capable request first, explicit fallback when unavailable.
        expect(share).toContain('getDisplayMedia({ video: { cursor: \'always\' }, audio: true })');
        expect(share).toContain('getDisplayMedia({ video: { cursor: \'always\' }, audio: false })');
        expect(share).toContain('hadCameraBeforeScreen');
        // Starting a share stops the camera video track (keeps mic unless
        // screen audio takes the single audio slot).
        expect(share).toContain("if (t.kind === 'video' || (screenAudio && t.kind === 'audio'))");
        expect(share).toContain("p2p.setLocalPreviewStream(stream, { stopPrevious: false, source: 'screen' })");
        // Stopping restores camera only if one existed, otherwise the published
        // sender is detached (never a stopped source behind a hidden sender).
        const stop = between(page, 'async function stopScreenShare(reason)', 'window.stopScreenShare = stopScreenShare');
        expect(stop).toContain('if (hadCameraBeforeScreen)');
        expect(stop).toContain("await syncPublishedTrack('video', restored)");
        expect(stop).toContain("if (hadScreenAudio) await syncPublishedTrack('audio', localTrackOf('audio'))");
        // Browser "Stop sharing" triggers the same path; no auto-republish.
        expect(page).toContain("track.onended = function()");
        expect(page).toContain("stopScreenShare('ended')");
        // Tools acquire-or-toggle; camera switch is video-only, mic untouched.
        const audio = between(page, 'window.toggleAudio = async function()', 'window.toggleVideo = async function()');
        expect(audio).toContain('acquireMicAudio()');
        const video = between(page, 'window.toggleVideo = async function()', 'window.toggleSpeaker = function()');
        expect(video).toContain('acquireCameraVideo()');
        expect(video).toContain("stopScreenShare('switch-camera')");
        const cam = between(page, 'window.switchCamera = async function()', '// Screen-source selection is available during PREPARATION');
        expect(cam).toContain("getUserMedia({ video: { facingMode: currentFacingMode } })");
        expect(cam).not.toContain('audio: true');
        expect(cam).not.toContain('publishLocalStream');
        expect(cam).toContain('await syncPublishedTrack(\'video\', track)');
    });

    it('8. recording stays host-only and needs publish + LIVE (never LIVE alone)', () => {
        const rec = between(page, 'function maybeStartRecording()', '// ========== R4-LIVE-ENTRY-RECOVERY-REM1: stage + tools');
        expect(rec).toContain("if (userRole !== 'host' || !p2p || !compositor) return;");
        expect(rec).toContain('if (!p2p.isLocalPublished()) return;');
        expect(rec).toContain("if (!competitionData || competitionData.status !== 'live') return;");
        // Compositor identity follows the host UI language.
        const compositor = between(page, 'function initCompetitorCompositor()', 'compositor.startCompositing()');
        expect(compositor).toContain('platformName: tr.app_title');
        expect(compositor).toContain('rtl: isRTL');
        const room = readSrc(ROOM);
        expect(room).toContain('platformName: tr.app_title');
        expect(room).toContain('rtl: isRTL');
        // The compositor actually consumes both values for recorded frames.
        const vc = readSrc(COMPOSITOR);
        expect(vc).toContain('this.config.platformName as string');
        expect(vc).toContain('this.config.rtl === true');
        // Old recordings are never rewritten: no VOD/serve mutation here.
        expect(page).not.toMatch(/force_refresh|recompute.*recording|overwrite.*vod/i);
    });

    it('9. leave/back never end the competition and never trap navigation', () => {
        expect(page).not.toContain("addEventListener('beforeunload'");
        expect(page).not.toContain('onbeforeunload');
        // pagehide closes subscriptions only — no end, no finalize, no destroy.
        const hide = between(page, "window.addEventListener('pagehide'", '// Check if competition needs embedded viewer');
        expect(hide).toContain('competitionStatusES.close()');
        expect(hide).toContain('commentsLiveES.close()');
        expect(hide).toContain('ratingsLiveES.close()');
        expect(hide).not.toContain('fetch(');
        expect(hide).not.toContain('/end');
        expect(hide).not.toContain('destroy()');
        // Explicit leave: in-page confirm, presence leave, local teardown, no end.
        const leave = between(page, 'window.leaveBroadcast = function()', 'window.endStream = async function()');
        expect(leave).toContain('setLeaveConfirmVisible(true)');
        expect(leave).toContain("'/api/signaling/session/leave'");
        expect(leave).toContain('await p2p.disconnect()');
        expect(leave).toContain('await compositor.destroy()');
        expect(leave).not.toContain("'/end'");
        // The overlay is a real dialog with translated actions.
        expect(page).toContain('id="leaveConfirm"');
        expect(page).toContain('role="dialog"');
        expect(page).toContain('aria-modal="true"');
        expect(page).toContain('id="leaveConfirmStay"');
        expect(page).toContain('id="leaveConfirmLeave"');
        expect(page).toContain('window.cancelLeaveCompetition = function()');
    });

    it('10. competitor UI carries no chunk counters/diagnostics/excess publish text', () => {
        const stage = between(page, 'id="competitorView"', 'id="leaveConfirm"');
        expect(stage.toLowerCase()).not.toContain('chunk');
        expect(stage.toLowerCase()).not.toContain('diagnostic');
        expect(stage.toLowerCase()).not.toContain('bitrate');
        expect(stage.toLowerCase()).not.toContain('uploaded');
        // Upload diagnostics are accepted by the compositor but not rendered.
        expect(page).toContain('onChunkUploaded: function() { /* diagnostics removed from the UI */ }');
        // A single honest state line remains (aria-live), no duplicate walls.
        expect(stage.match(/id="publishState"/g)?.length).toBe(1);
        expect(stage).toContain('aria-live="polite"');
    });

    it('11. new i18n keys exist, are translated and different in ar/en', () => {
        const keys = [
            'live_tools', 'start_competition', 'start_competition_failed',
            'publish_state_off', 'publish_state_on', 'nothing_to_publish',
            'media_none', 'waiting_peer_media', 'screen_share_stopped',
            'leave_broadcast', 'leave_broadcast_confirm', 'end_competition',
            'end_competition_confirm', 'expand_stage', 'collapse_stage',
        ] as const;
        for (const key of keys) {
            const arText = (translations.ar as Record<string, unknown>)[key];
            const enText = (translations.en as Record<string, unknown>)[key];
            expect(typeof arText, `ar.${key}`).toBe('string');
            expect(typeof enText, `en.${key}`).toBe('string');
            expect((arText as string).trim().length, `ar.${key} non-empty`).toBeGreaterThan(0);
            expect((enText as string).trim().length, `en.${key} non-empty`).toBeGreaterThan(0);
            expect(arText, `${key} translated`).not.toBe(enText);
        }
        // The publish line never claims publication in its "off" copy.
        expect(translations.ar.publish_state_off).not.toContain('تنشر');
        expect(translations.en.publish_state_off).toContain('not published');
    });

    it('12. rendered competitor pages parse in ar and en (parse gate)', async () => {
        const db = new SqliteD1();
        try {
            await db.prepare(
                `INSERT INTO users (id, email, username, display_name, password_hash, is_active)
                 VALUES (921, 'rem1@local', 'rem1host', 'Rem One', 'x', 1),
                        (922, 'rem1b@local', 'rem1guest', 'Rem Two', 'x', 1)`
            ).run();
            await db.prepare(
                `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (921, 'rem1-cat', 'قسم', 'Category')`
            ).run();
            await db.prepare(
                `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, language, created_at)
                 VALUES (821, 'REM1 accepted', 'rules', 921, 921, 922, 'accepted', 'ar', '2026-09-01 10:00:00'),
                        (822, 'REM1 live', 'rules', 921, 921, 922, 'live', 'en', '2026-09-01 10:00:00')`
            ).run();
            for (const [path, lang] of [['/competition/821', 'ar'], ['/competition/822', 'en']] as const) {
                const res = await app.request(`${path}?lang=${lang}`, {}, { DB: db } as unknown as Parameters<typeof app.request>[2]);
                expect(res.status, `${path} ${lang}`).toBe(200);
                const html = await res.text();
                expect(html).toContain('id="competitorView"');
                expect(html).toContain('id="publishState"');
                expect(html).toContain('id="competitorControls"');
                const bodies = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
                    .map((m) => m[1] || '').filter((b) => b.trim().length > 0);
                expect(bodies.length).toBeGreaterThan(0);
                for (const body of bodies) {
                    // Parse-only: no execution (window/document are inert).
                    expect(() => new Function(body), `inline script parses (${path} ${lang})`).not.toThrow();
                }
            }
        } finally {
            db.close();
        }
    });

    it('13. comments state is executable and an early comment event never throws (B-1 regression)', async () => {
        // The declaration must be its own executable statement — a comment on
        // the same line swallows it (ReferenceError on the first read).
        expect(page).toMatch(/^\s*let commentsItems = \[\];\s*$/m);
        expect(page).not.toMatch(/\/\/[^\r\n]*\blet commentsItems = \[\];/);
        const declLine = page.split(/\r?\n/).find((line) => line.includes('let commentsItems = [];'));
        expect(declLine, 'declaration line exists').toBeTruthy();
        expect(declLine!.trim(), 'declaration is not behind a comment').toBe('let commentsItems = [];');

        // Execute the REAL state + load + SSE slice from the page. Under the
        // swallowed declaration, the first read throws ReferenceError and the
        // SSE listener silently drops the comment (its try/catch hides it).
        const slice = between(page, '// B2+B3: paged comments state', '// R2-L2: VOD timed comments');
        expect(slice).toMatch(/^\s*let commentsItems = \[\];\s*$/m);

        const box: Record<string, { innerHTML: string; textContent: string; classList: { toggle(): void } }> = {};
        const element = () => ({ innerHTML: '', textContent: '', classList: { toggle() {} } });
        const sseHandlers: Record<string, (ev: { data: string }) => void> = {};
        class FakeEventSource {
            constructor(_url: string) { /* channel is asserted below via fetch/URL stubs */ }
            addEventListener(type: string, fn: (ev: { data: string }) => void) { sseHandlers[type] = fn; }
            close() { /* no-op */ }
        }
        const requested: string[] = [];
        const factory = new Function(
            'window', 'document', 'fetch', 'EventSource', 'competitionId', 'tr', 'renderCommentsTree',
            slice + `
            return {
                paintCommentsEmpty: paintCommentsEmpty,
                loadCommentsInitial: loadCommentsInitial,
                upsertLiveComment: upsertLiveComment,
                subscribeCommentsLive: subscribeCommentsLive,
                items: function() { return commentsItems; }
            };`
        );
        const api = factory(
            {},
            { getElementById: (id: string) => (box[id] = box[id] || element()) },
            (url: string) => {
                requested.push(url);
                return Promise.resolve({
                    json: () => Promise.resolve({ success: true, data: { items: [{ id: 7, content: 'loaded' }], total: 1 } }),
                });
            },
            FakeEventSource,
            42,
            {},
            (items: Array<{ id: number }>) => items.map((c) => String(c.id)).join(',')
        ) as {
            paintCommentsEmpty(): void;
            loadCommentsInitial(): Promise<void>;
            upsertLiveComment(cm: { id: number; content: string }): void;
            subscribeCommentsLive(): void;
            items(): Array<{ id: number }>;
        };

        // Early paint BEFORE the initial GET resolves: reads commentsItems.
        expect(() => api.paintCommentsEmpty()).not.toThrow();
        // Early direct receipt (POST response / replay) BEFORE the initial GET.
        expect(() => api.upsertLiveComment({ id: 1, content: 'early' })).not.toThrow();
        expect(api.items().map((c) => c.id)).toEqual([1]);
        // Early SSE event BEFORE the initial GET resolves: the handler must
        // merge it, not swallow a ReferenceError.
        api.subscribeCommentsLive();
        expect(sseHandlers.comment_new, 'comment_new listener registered').toBeTruthy();
        expect(() => sseHandlers.comment_new({ data: JSON.stringify({ comment: { id: 2, content: 'sse' } }) }))
            .not.toThrow();
        expect(api.items().map((c) => c.id)).toEqual([2, 1]);
        // The load path itself still hydrates the first page.
        await api.loadCommentsInitial();
        expect(requested[0]).toBe('/api/competitions/42/comments?limit=20&offset=0');
        expect(api.items().map((c) => c.id)).toEqual([7]);
    });
});
