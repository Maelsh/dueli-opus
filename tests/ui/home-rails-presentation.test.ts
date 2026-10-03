/**
 * R3-RAILS-1B — Home rail section/sentinel markup (ar/en, RTL/LTR,
 * keyboard/pointer, dark mode).
 *
 * The rail builders in src/shared/components/home-rail.ts are pure string
 * functions fed ONLY by the existing i18n keys (discovery.retry,
 * discovery.no_more_results, loading, view_all, previous/next) — no new
 * keys, no hardcoded user-visible text. These tests pin the translated
 * continuation states the scroller cycles through (loading → idle → retry →
 * end) in both locales and both directions.
 */
import { describe, expect, it } from 'vitest';
import {
    getRailSentinelHTML,
    getHomeRailSection,
    getHomeRailErrorSection,
    homeRailSectionId,
    homeRailScrollerId,
    homeRailSentinelId,
} from '../../src/shared/components/home-rail';
import { translations } from '../../src/i18n';

describe('R3-RAILS-1B rail markup', () => {
    it('1. sentinel ids derive from the rail key', () => {
        expect(homeRailSectionId('suggested-live')).toBe('home-rail-suggested-live');
        expect(homeRailScrollerId('cat-dialogue-live')).toBe('home-rail-cat-dialogue-live-scroll');
        expect(homeRailSentinelId('sub-physics-recorded')).toBe('home-rail-sub-physics-recorded-sentinel');
    });

    it.each(['ar', 'en'] as const)('2. retry state is a translated native button (%s)', (lang) => {
        const html = getRailSentinelHTML('suggested-live', 'retry', lang);
        const label = translations[lang].discovery.retry;
        expect(label).toBeTruthy();
        expect(html).toContain(label);
        expect(html).toContain('type="button"');
        expect(html).toContain('data-home-rail-retry="suggested-live"');
        expect(html).toContain('aria-label');
        expect(html).toContain('dark:');
    });

    it.each(['ar', 'en'] as const)('3. end state carries the translated terminal marker (%s)', (lang) => {
        const html = getRailSentinelHTML('suggested-live', 'end', lang);
        const marker = translations[lang].discovery.no_more_results;
        expect(marker).toBeTruthy();
        expect(html).toContain(marker);
        expect(html).toContain('dark:');
    });

    it.each(['ar', 'en'] as const)('4. loading state is a spinner with screen-reader text (%s)', (lang) => {
        const html = getRailSentinelHTML('suggested-live', 'loading', lang);
        expect(html).toContain('fa-spinner');
        expect(html).toContain('sr-only');
        expect(html).toContain(translations[lang].loading);
    });

    it('5. idle sentinel is an empty spacer (observer target, no text)', () => {
        expect(getRailSentinelHTML('suggested-live', 'idle', 'ar')).toBe('');
        expect(getRailSentinelHTML('suggested-live', 'idle', 'en')).toBe('');
    });

    it.each(['ar', 'en'] as const)('6. section wires scroller, sentinel, a11y and arrows (%s)', (lang) => {
        const html = getHomeRailSection({
            railKey: 'cat-dialogue-live',
            title: 'T',
            icon: 'fas fa-comments',
            lang,
            color: '#8B5CF6',
            cardsHtml: '<a href="/competition/1">x</a>',
            sentinelMode: 'idle',
        });
        expect(html).toContain('id="home-rail-cat-dialogue-live"');
        expect(html).toContain('id="home-rail-cat-dialogue-live-scroll"');
        expect(html).toContain('id="home-rail-cat-dialogue-live-sentinel"');
        expect(html).toContain('tabindex="0"');
        expect(html).toContain('role="region"');
        expect(html).toContain('aria-live="polite"');
        expect(html).toContain('aria-label');
        expect(html).toContain('dark:');
        expect(html).toContain('<a href="/competition/1">x</a>');
        // Direction-aware arrows: RTL chevrons flip.
        if (lang === 'ar') {
            expect(html).toContain('fa-chevron-right');
        } else {
            expect(html).toContain('fa-chevron-left');
        }
        expect(html).toContain(translations[lang].view_all);
    });

    it.each(['ar', 'en'] as const)('7. error section is title + explicit translated retry (%s)', (lang) => {
        const html = getHomeRailErrorSection('cat-science-live', 'S', 'fas fa-flask', lang, '#06B6D4');
        expect(html).toContain('id="home-rail-cat-science-live"');
        expect(html).toContain(translations[lang].discovery.retry);
        expect(html).not.toContain('fa-spinner');
    });

    it('8. no user-visible string lives outside translations', () => {
        for (const lang of ['ar', 'en'] as const) {
            const retry = getRailSentinelHTML('k', 'retry', lang);
            const end = getRailSentinelHTML('k', 'end', lang);
            const loading = getRailSentinelHTML('k', 'loading', lang);
            expect(retry).toContain(translations[lang].discovery.retry);
            expect(end).toContain(translations[lang].discovery.no_more_results);
            expect(loading).toContain(translations[lang].loading);
        }
    });
});
