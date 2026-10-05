/**
 * R2-V — competition page rating contract (live provisional + read-only final).
 *
 * Pins (ar/en):
 * - Card renders for live AND completed (not only completed).
 * - Live shows the provisional badge via existing `ratings.live_provisional`;
 *   completed shows `ratings.final_readonly`; not-eligible hint uses
 *   `ratings.not_eligible` (zero hardcoded visible strings).
 * - Stars call the existing `submitRating` (POST upsert); withdraw path
 *   `withdrawRating` is CSP-allowlisted.
 * - Tally refreshes from `/ratings/summary` + live `rating_updated` events
 *   on the EXISTING competition SSE channel (no new realtime system).
 * - RTL/LTR + dark variants preserved (card class).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ar } from '../../src/i18n/ar';
import { en } from '../../src/i18n/en';

const PAGE = readFileSync(resolve(__dirname, '../../src/modules/pages/competition-page.ts'), 'utf-8');
const CSP = readFileSync(resolve(__dirname, '../../src/client/csp-delegate.ts'), 'utf-8');

describe('R2-V competition page rating contract', () => {
    it('1. card renders for live and completed with provisional/final states', () => {
        expect(PAGE).toContain('(isLive || isCompleted)');
        expect(PAGE).toContain('ratings.live_provisional');
        expect(PAGE).toContain('ratings.final_readonly');
        expect(PAGE).toContain('ratings.not_eligible');
        expect(PAGE).toContain('id="rateCard"');
        expect(PAGE).toContain('id="rateTally"');
        expect(PAGE).toContain('id="rateStateLine"');
    });

    it('2. stars upsert via POST; withdraw via DELETE; both CSP-allowlisted', () => {
        expect(PAGE).toContain("'/api/competitions/' + competitionId + '/rate");
        expect(PAGE).toContain("method: 'POST'");
        expect(PAGE).toContain("method: 'DELETE'");
        expect(PAGE).toContain('window.submitRating');
        expect(PAGE).toContain('window.withdrawRating');
        expect(CSP).toContain("'submitRating'");
        expect(CSP).toContain("'withdrawRating'");
        // Replacement: stars stay enabled (no permanent lock on success).
        expect(PAGE).not.toMatch(/Lock this row's stars/);
    });

    it('3. tally syncs from summary + rating_updated on the existing channel', () => {
        expect(PAGE).toContain('/ratings/summary');
        expect(PAGE).toContain("encodeURIComponent('competition:' + competitionId)");
        expect(PAGE).toContain("es.addEventListener('rating_updated'");
        expect(PAGE).toContain('loadRatingSummary');
        expect(PAGE).toContain('subscribeRatingsLive');
    });

    it.each(['ar', 'en'] as const)('4. i18n rating states exist and differ (%s)', (lang) => {
        const pack = lang === 'ar' ? (ar as any) : (en as any);
        for (const k of ['live_provisional', 'final_readonly', 'not_eligible', 'summary_title', 'no_ratings', 'withdrawn']) {
            expect(pack.ratings?.[k], `${lang}.ratings.${k}`).toBeTruthy();
        }
        expect((ar as any).ratings.live_provisional).not.toBe((en as any).ratings.live_provisional);
        expect((ar as any).ratings.final_readonly).not.toBe((en as any).ratings.final_readonly);
        expect((ar as any).competition_errors.rating_live_only).toBeTruthy();
        expect((en as any).competition_errors.rating_live_only).toBeTruthy();
        expect((ar as any).competition_errors.rating_live_only).not.toBe((en as any).competition_errors.rating_live_only);
    });

    it('5. dark + RTL preserved on the rating card', () => {
        expect(PAGE).toContain('dark:text-white');
        expect(PAGE).toContain('dark:text-gray-300');
        expect(PAGE).toContain('dir="ltr"');
    });
});
