/**
 * UNIT30.6 / D-02 — competition page client contract for the zero-chunk
 * completed competition.
 *
 * The page is a server template with a large inline script (string-level
 * pins per the established R2-L2 harness). Production 2263 showed: the
 * recorded badge painted BEFORE playlist verification, then a minutes-long
 * processing poll for chunks that can never exist. Pins:
 *  1. the zero-chunks branch resolves a terminal not-recorded verdict
 *     (index_metadata.recording_state === 'none') to unavailable
 *     IMMEDIATELY — the gate sits before handleVodNotReady();
 *  2. the recorded badge is painted only AFTER verified chunks exist
 *     (pre-verification the badge is hidden, never a false 'مسجل');
 *  3. ar/en parity for the honest translated state (recording_none);
 *  4. every rendered inline script still parses (syntax regression guard).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../../src/main';
import { ar } from '../../src/i18n/ar';
import { en } from '../../src/i18n/en';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';

const PAGE = readFileSync(resolve(__dirname, '../../src/modules/pages/competition-page.ts'), 'utf-8');

describe('UNIT30.6 D-02: zero-chunk completed competition page contract', () => {
    it('1. terminal not-recorded verdict resolves immediately, before the bounded poll', () => {
        const guard = PAGE.indexOf('!playlistData.chunks || playlistData.chunks.length === 0');
        const gate = PAGE.indexOf("playlistData.index_metadata.recording_state === 'none'");
        const pollAfterGuard = PAGE.indexOf('handleVodNotReady()', guard);
        expect(guard, 'zero-chunks guard exists').toBeGreaterThan(-1);
        expect(gate, 'terminal verdict gate exists').toBeGreaterThan(guard);
        expect(pollAfterGuard, 'bounded poll stays as the fallback AFTER the gate').toBeGreaterThan(gate);

        // Inside the gate: honest unavailable state, no spinner, no VOD chrome.
        const gateBlock = PAGE.slice(gate, pollAfterGuard);
        expect(gateBlock).toContain("setMediaState('unavailable')");
        expect(gateBlock).toContain('showStatusOverlay(tr.recording_none');
    });

    it('2. recorded badge is painted only after verified chunks exist', () => {
        const guard = PAGE.indexOf('!playlistData.chunks || playlistData.chunks.length === 0');
        // The completed branch hides the badge pre-verification (never leaves
        // a stale LIVE chip, never promises 'مسجل' before evidence).
        const branchStart = PAGE.indexOf('isCompletedComp');
        const hideBefore = PAGE.indexOf("updateEmbeddedMode('none')", branchStart);
        expect(hideBefore, 'badge hidden pre-verification').toBeGreaterThan(-1);
        expect(hideBefore).toBeLessThan(guard);
        // The FIRST 'vod' badge paint overall happens post-verification.
        const firstVodPaint = PAGE.indexOf("updateEmbeddedMode('vod')");
        expect(firstVodPaint, 'no pre-verification recorded badge anywhere').toBeGreaterThan(guard);
    });

    it('3. honest translated state exists in ar and en (parity, non-empty)', () => {
        expect(typeof (ar as Record<string, unknown>).recording_none).toBe('string');
        expect(String((ar as Record<string, unknown>).recording_none).length).toBeGreaterThan(0);
        expect(typeof (en as Record<string, unknown>).recording_none).toBe('string');
        expect(String((en as Record<string, unknown>).recording_none).length).toBeGreaterThan(0);
        expect(PAGE).toContain('tr.recording_none');
    });
});

describe('UNIT30.6 D-02: rendered competition page scripts still parse', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = createSqliteD1();
        db.exec(`
            INSERT INTO users (id, email, username, password_hash, display_name, is_active, language, country)
            VALUES (1, 'host@u306z-page.local', 'host306z', 'x', 'Host', 1, 'en', 'SA');
            INSERT INTO categories (id, slug, name_ar, name_en)
            VALUES (9601, 'dialogue', 'حوار', 'Dialogue');
            INSERT INTO competitions
                (id, title, rules, category_id, creator_id, opponent_id, status)
            VALUES (9602, 'Zero chunk page', 'Rules', 9601, 1, NULL, 'completed');
            INSERT INTO sessions (id, user_id, expires_at)
            VALUES ('u306z-page-host', 1, datetime('now', '+1 day'));
        `);
    });

    afterEach(() => db.close());

    it('parses every rendered inline script as JavaScript', async () => {
        const res = await app.request('/competition/9602?lang=en', {
            headers: { Cookie: 'sessionId=u306z-page-host' },
        }, { DB: db as unknown as D1Database } as never);
        expect(res.status).toBe(200);
        const html = await res.text();
        const scripts = Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi));
        let parsed = 0;
        for (const [, attrs, body] of scripts) {
            if (/\bsrc\s*=/.test(attrs)) continue;
            if (/\btype\s*=\s*["']application\/(?:ld\+)?json["']/.test(attrs)) continue;
            const code = body.trim();
            if (!code) continue;
            expect(() => new Function(code), code.slice(0, 240)).not.toThrow();
            parsed += 1;
        }
        expect(parsed).toBeGreaterThanOrEqual(2);
    });
});
