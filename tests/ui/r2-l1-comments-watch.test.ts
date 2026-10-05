/**
 * R2-L1 — comments/watch/presence UI contract (behavioural pins).
 *
 * - Competition page: author-joined POST merge by id, SSE comment_new with
 *   the correct name + comment_deleted removal, visible error on failure,
 *   watch intent + bounded heartbeat + presence display wiring.
 * - Live room: comments flow through the shared API/SSE (no DOM-only rows),
 *   viewer count reflects presence with the viewers_now label.
 * - Exactly one new user-visible key (viewers_now, ar+en); everything else
 *   reuses existing keys. No rating UI is added (R2-V owns it).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { translations } from '../../src/i18n';
import { FakeD1 } from '../helpers/fake-d1';

const readSrc = (rel: string): string => readFileSync(join(process.cwd(), rel), 'utf-8');

function seedRoom(db: FakeD1): void {
    db.users.push({
        id: 2, email: 'a@l1.ui', username: 'user_a', display_name: 'User A',
        avatar_url: null, is_active: 1, language: 'ar', country: 'SA',
    } as never);
    db.sessions.push({ id: 'sess-l1-a', user_id: 2, expires_at: '2030-01-01 00:00:00' } as never);
    db.competitions.push({
        id: 10, title: 'L1 UI finals', creator_id: 2, opponent_id: null,
        status: 'live', category_id: 1, total_views: 7, total_comments: 0,
    } as never);
}

const req = (db: FakeD1, path: string, sid: string | null, method: string, body?: unknown) =>
    app.request(`${path}${path.includes('?') ? '&' : '?'}lang=ar`, {
        method,
        headers: {
            ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
            ...(sid ? { Authorization: `Bearer ${sid}` } : {}),
            'X-CSRF-Token': 'test',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    }, { DB: db } as never);

describe('R2-L1 competition page + live room contracts', () => {
    it('1. competition page renders watch/presence/comment hooks', async () => {
        const db = new FakeD1();
        seedRoom(db);
        const html = await (await req(db, '/competition/10', null, 'GET')).text();
        expect(html).toContain('id="statViews"');
        expect(html).toContain('id="presenceNow"');
        expect(html).toContain('id="commentInput"');
        expect(html).toContain('id="chatMessages"');
    });

    it('2. POST comment returns the author shape the list/SSE use (no extra GET needed)', async () => {
        const db = new FakeD1();
        seedRoom(db);
        const res = await (await req(db, '/api/competitions/10/comments', 'sess-l1-a', 'POST', {
            content: 'ui hello',
        })).json() as any;
        expect(res.success).toBe(true);
        expect(res.data.id).toBeGreaterThan(0);
        expect(res.data.display_name).toBe('User A');
        expect(res.data.username).toBe('user_a');
        const list = await (await req(db, '/api/competitions/10/comments?limit=20&offset=0', null, 'GET')).json() as any;
        expect(list.data.total).toBe(1);
        expect(list.data.items[0].display_name).toBe('User A');
    });

    it('3. client merges by id, handles deletion, shows errors, sends auth', () => {
        const src = readSrc('src/modules/pages/competition-page.ts');
        // Id-dedup merge for POST responses and SSE echoes.
        expect(src).toContain('upsertLiveComment');
        expect(src).toContain('findIndex');
        // Deletion sync converges without refresh.
        expect(src).toContain('comment_deleted');
        expect(src).toContain('removeLiveComment');
        // Author fallback when an older payload lacks display_name.
        expect(src).toContain('cm.display_name || cm.username');
        // Session auth on the POST (server still binds identity server-side).
        expect(src).toContain("'Authorization'");
        // Failures surface to the user instead of console-only.
        expect(src).toContain("showToast((data && data.error)");
        // Watch intent + bounded heartbeat + presence wiring, no client trust.
        expect(src).toContain('/api/competitions/\' + competitionId + \'/watch\'');
        expect(src).toContain('watch-heartbeat');
        expect(src).toContain('visibilityState');
        expect(src).toContain('viewer_count');
        expect(src).toContain('presenceNow');
        // No rating UI here — R2-V owns stars.
        expect(src).not.toContain('watch_eligible');
    });

    it('4. live room comments use the shared API/SSE with id-dedup; count shows presence', () => {
        const src = readSrc('src/modules/pages/live-room-page.ts');
        expect(src).toContain('/api/competitions/\' + competitionId + \'/comments');
        expect(src).toContain('loadRoomCommentsInitial');
        expect(src).toContain('subscribeRoomCommentsLive');
        expect(src).toContain('data-comment-id');
        expect(src).toContain('roomCommentsSeen');
        expect(src).toContain('comment_deleted');
        // No DOM-only comment path remains.
        expect(src).not.toContain("log('Comment sent: ' + text");
        // Presence count uses the viewers_now label.
        expect(src).toContain('viewer_count');
        expect(src).toContain('viewers_now');
    });

    it('5. exactly one new visible key (viewers_now, ar+en); controller exposes viewer_watch', () => {
        expect(translations.ar.viewers_now).toBe('يشاهدون الآن');
        expect(translations.en.viewers_now).toBe('watching now');
        const src = readSrc('src/controllers/CompetitionController.ts');
        expect(src).toContain('viewer_watch');
        expect(src).toContain('getViewerWatch');
        // GET details holds no counter increment.
        expect(src).not.toContain('incrementViews');
    });

    it('6. live room markup carries the shared-comment hooks (source pin)', () => {
        // /live self-fetches over HTTP so it cannot render under FakeD1;
        // the browser B covers the room journey. Here pin the markup hooks.
        const src = readSrc('src/modules/pages/live-room-page.ts');
        expect(src).toContain('id="commentsContainer"');
        expect(src).toContain('id="viewerCount"');
        expect(src).toContain('id="commentInputBar"');
    });
});
