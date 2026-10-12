/**
 * R4-CHUNK-PLAYER-UX-1 (row 29) UI contract pins — live-edge controls.
 *
 * - Return-to-Live + rewind buttons exist in the live info bar only
 *   (RTL-safe flex, dark-safe, aria-labelled, CSP-allowed handlers).
 * - New i18n keys translated ar/en (non-empty, actually translated).
 * - Player exposes the rewind API the buttons call; no parallel player.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { translations } from '../../src/i18n';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

const __dirname = dirname(fileURLToPath(import.meta.url));
const readSrc = (rel: string) => readFileSync(resolve(__dirname, '../../' + rel), 'utf-8');

const PAGE = 'src/modules/pages/competition-page.ts';
const CSP = 'src/client/csp-delegate.ts';
const SHARED = 'src/modules/pages/live/scripts/client/shared.ts';

describe('R4-CHUNK-PLAYER-UX-1 live-edge UI contract', () => {
    it('1. return-to-live + rewind buttons ride the live info bar (RTL-safe)', () => {
        const page = readSrc(PAGE);
        expect(page).toContain('id="embeddedLiveBtn"');
        expect(page).toContain('id="embeddedRewindBtn"');
        expect(page).toContain('data-csp-fn="embeddedReturnToLive"');
        expect(page).toContain('data-csp-fn="embeddedRewindLive"');
        // Live-only surfaces (inside the isLive branch), icon + text with
        // translated titles, no fixed physical side, no inline style.
        expect(page).toContain('aria-label="');
        expect(page).not.toMatch(/embeddedLiveBtn"[^>]*style="/);
        expect(page).not.toMatch(/embeddedRewindBtn"[^>]*style="/);
    });

    it('2. handlers restart at the edge / rewind one chunk (no parallel player)', () => {
        const page = readSrc(PAGE);
        expect(page).toContain('window.embeddedReturnToLive = async function()');
        expect(page).toContain('window.embeddedRewindLive = async function()');
        expect(page).toContain('syncLiveEdgeButtons');
        expect(page).toContain('liveChunkManager');
        // Rewind delegates to the shared sequential player (one system).
        expect(page).toContain('rewindTo(liveCurrentIndex - 1)');
        expect(readSrc(CSP)).toContain("'embeddedReturnToLive'");
        expect(readSrc(CSP)).toContain("'embeddedRewindLive'");
        // Player API exists in the single shared bundle.
        expect(readSrc(SHARED)).toContain('async rewindTo(index)');
    });

    it('3. live_rewind + return_to_live translated ar/en', () => {
        for (const key of ['return_to_live', 'live_rewind'] as const) {
            const arText = (translations.ar as Record<string, unknown>)[key];
            const enText = (translations.en as Record<string, unknown>)[key];
            expect(typeof arText, `ar.${key}`).toBe('string');
            expect(typeof enText, `en.${key}`).toBe('string');
            expect((arText as string).length, `ar.${key} non-empty`).toBeGreaterThan(0);
            expect((enText as string).length, `en.${key} non-empty`).toBeGreaterThan(0);
            expect(arText, `${key} translated`).not.toBe(enText);
        }
    });

    it('4. guest playback untouched (same embedded viewer, no role fork)', () => {
        const page = readSrc(PAGE);
        // No guest-specific player path or second live-edge implementation.
        expect(page).not.toMatch(/isGuest.*LiveSequentialPlayer|guestPlayer/i);
        expect(page).toContain('window.LiveSequentialPlayer');
    });

    it('5. live guest page renders the viewer + edge buttons with parseable scripts', async () => {
        // Render gate: a template/JS slip here kills the whole inline
        // script in the browser (viewer never boots, no state set).
        const db = new SqliteD1();
        try {
            await db.prepare(
                `INSERT INTO users (id, email, username, display_name, password_hash, is_active)
                 VALUES (911, 'pux@local', 'puxuser', 'Pux', 'x', 1), (912, 'pux2@local', 'puxopp', 'Pux Opp', 'x', 1)`
            ).run();
            await db.prepare(`INSERT INTO categories (id, slug, name_ar, name_en) VALUES (911, 'pux-cat', 'P', 'P')`).run().catch(() => undefined);
            await db.prepare(
                `INSERT INTO competitions (id, title, rules, category_id, creator_id, opponent_id, status, language, created_at)
                 VALUES (811, 'Pux Comp', 'rules', 911, 911, 912, 'live', 'en', '2026-09-01 10:00:00')`
            ).run();
            const res = await app.request('/competition/811?lang=en', {}, { DB: db } as unknown as Parameters<typeof app.request>[2]);
            expect(res.status).toBe(200);
            const html = await res.text();
            expect(html).toContain('id="embeddedViewerSection"');
            expect(html).toContain('id="embeddedLiveBtn"');
            expect(html).toContain('id="embeddedRewindBtn"');
            expect(html).toContain('Back to live');
            const bodies = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)]
                .map((m) => m[1] || '').filter((b) => b.trim().length > 0);
            expect(bodies.length).toBeGreaterThan(0);
            for (const body of bodies) {
                // Parse-only gate (CSP bans eval in prod; node construction
                // never executes — DOM/window refs are inert here).
                expect(() => new Function(body), 'inline script parses').not.toThrow();
            }
        } finally {
            db.close();
        }
    });
});
