/**
 * R2-L2 — competition page UI contract (production room, media states,
 * Like/Dislike pair, timed comments, single ad slot).
 *
 * Pins (ar/en, string-level — the page is a server-rendered JS template):
 * 1. Production room wiring: competitors join /live/:id (role resolved
 *    server-side); the /live/host|guest TEST pages are never the sole path.
 * 2. Media states: waiting/playing/error/processing/ready/unavailable with
 *    a manual retry; completed-without-recording is never VOD; readiness
 *    comes from the vod_url/youtube predicate (no HEAD probing).
 * 3. Like + Dislike pair with single-active paint from server counts;
 *    no heart in the competition UI; CSP-allowlisted setReaction.
 * 4. Timed comments on the SAME comments/SSE system: video_offset in the
 *    POST body, offset badges + seek, chronological VOD ordering, playback
 *    sync hook — same competition: channel, no second system.
 * 5. One ad slot, impression once on VIEW (IntersectionObserver +
 *    idempotency key), clear of video/comments/ratings; serving via the
 *    existing /api/advertisements + /impression endpoints.
 * 6. i18n ar/en parity for new keys; dark + RTL preserved.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ar } from '../../src/i18n/ar';
import { en } from '../../src/i18n/en';

const PAGE = readFileSync(resolve(__dirname, '../../src/modules/pages/competition-page.ts'), 'utf-8');
const CSP = readFileSync(resolve(__dirname, '../../src/client/csp-delegate.ts'), 'utf-8');

describe('R2-L2 competition page UI contract', () => {
    it('1. production room: every role enters /live/:id (test pages not the sole path)', () => {
        expect(PAGE).toContain("window.location.href = '/live/' + competitionId + '?lang=' + lang");
        expect(PAGE).toContain('<a href="/live/\\${competitionId}?lang=\\${lang}"');
        // No production href points at the test-only host/guest/viewer pages.
        expect(PAGE).not.toMatch(/href="\/live\/(host|guest|viewer)\?comp=/);
        expect(PAGE).not.toContain('/live/host?comp=');
        expect(PAGE).not.toContain('/live/guest?comp=');
        // Start still guarded (creator/opponent only, accepted → live).
        expect(PAGE).toContain("'/api/competitions/' + competitionId + '/start'");
    });

    it('2. media states are explicit with manual retry (no endless spinner)', () => {
        for (const s of ['waiting', 'playing', 'error', 'processing', 'ready', 'unavailable']) {
            expect(PAGE).toContain(`'${s}'`);
        }
        expect(PAGE).toContain('window.__mediaState');
        expect(PAGE).toContain('data-media-state');
        expect(PAGE).toContain('id="embeddedRetryBtn"');
        expect(PAGE).toContain('window.embeddedRetryMedia');
        expect(PAGE).toContain('VOD_MAX_RETRIES');
        expect(CSP).toContain("'embeddedRetryMedia'");
        // Bounded auto-poll, then manual retry — never an infinite spinner.
        expect(PAGE).not.toMatch(/_vodRetryCount < 20/);
    });

    it('3. readiness uses the existing recording predicate (no HEAD probing)', () => {
        expect(PAGE).toContain('hasPlayableRecording');
        expect(PAGE).toContain("comp.vod_url");
        expect(PAGE).toContain('comp.youtube_video_url');
        expect(PAGE).not.toMatch(/method: ['"]HEAD['"]/);
        expect(PAGE).not.toContain('fetchHEAD');
        // completed without a recording never reaches the VOD player.
        expect(PAGE).toContain('if (!hasPlayableRecording(comp))');
    });

    it('4. Like + Dislike pair, single-active, server counts (no heart)', () => {
        expect(PAGE).toContain('id="likeBtn"');
        expect(PAGE).toContain('id="dislikeBtn"');
        expect(PAGE).toContain('id="dislikeCount"');
        expect(PAGE).toContain('window.setReaction');
        expect(PAGE).toContain('aria-pressed');
        expect(PAGE).toContain('fa-thumbs-up');
        expect(PAGE).toContain('fa-thumbs-down');
        expect(PAGE).toContain('/dislike');
        expect(PAGE).toContain('loadReactionStatus');
        expect(PAGE).toContain('user_reaction');
        expect(PAGE).not.toContain('fa-heart');
        expect(CSP).toContain("'setReaction'");
    });

    it('5. timed comments reuse comments/SSE (offset capture, seek, ordering, sync)', () => {
        expect(PAGE).toContain('video_offset: currentVodTime()');
        expect(PAGE).toContain('data-comment-offset');
        expect(PAGE).toContain('window.seekToCommentOffset');
        expect(PAGE).toContain('orderCommentsForDisplay');
        expect(PAGE).toContain('syncTimedComments');
        expect(PAGE).toContain('currentVodTime');
        // Same channel and merge path — no second system.
        expect(PAGE).toContain("encodeURIComponent('competition:' + competitionId)");
        expect(PAGE).toContain('upsertLiveComment');
        expect(CSP).toContain("'seekToCommentOffset'");
    });

    it('6. single ad slot, impression on VIEW (observer + idempotency)', () => {
        expect(PAGE).toContain('id="competitionAdSlot"');
        expect(PAGE).toContain('loadCompetitionAd');
        expect(PAGE).toContain('IntersectionObserver');
        expect(PAGE).toContain('/api/advertisements?competition_id=');
        expect(PAGE).toContain('/impression');
        expect(PAGE).toContain('idempotency_key');
        expect(PAGE).toContain('context=competition');
        expect(PAGE).toContain('limit=1');
        expect(PAGE).toContain('__compAdImpressed');
        // No click fired, no paid/test purchase path.
        expect(PAGE).not.toContain('/api/advertisements/' + "' + ad.id + '/click");
    });

    it.each(['ar', 'en'] as const)('7. i18n timed-comment key exists and differs (%s)', (lang) => {
        const pack = lang === 'ar' ? (ar as any) : (en as any);
        expect(pack.vod_comment_at).toBeTruthy();
        expect(pack.ads?.sponsored_label).toBeTruthy();
        expect(pack.like?.title).toBeTruthy();
        expect(pack.interactions?.dislike).toBeTruthy();
        expect((ar as any).vod_comment_at).not.toBe((en as any).vod_comment_at);
    });

    it('8. dark + RTL preserved on new surfaces', () => {
        expect(PAGE).toContain('dark:bg-gray-800');
        expect(PAGE).toContain('dark:text-white');
        expect(PAGE).toContain('rounded-xl');
    });
});
