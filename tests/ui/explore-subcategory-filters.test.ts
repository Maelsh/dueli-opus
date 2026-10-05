/**
 * R3-EXPLORE-CONTEXT-1 — View All context + Explore subcategory filter (UI contract).
 *
 * Behavioural pins (05 §9 + 08 View All/Subcategory):
 * - railViewAllHref carries typed rail context (category + subcategory when
 *   present + status + lang + view=competitions); suggested rails carry their
 *   status only; translated labels never become query keys.
 * - The rail View All link is present on all viewports (no silent mobile gap).
 * - Explore renders an explicit subcategory filter from the taxonomy with the
 *   selection preserved; preview/view-all/back links keep the full context.
 * - Invalid pairs never render as a silent All: unknown subcategories and
 *   cross-parent pairs render an explicit error state.
 * - A valid subcategory without a parent canonicalizes to its known parent.
 * - Zero new user-visible strings (existing i18n keys only).
 */
import { describe, expect, it } from 'vitest';
import app from '../../src/main';
import {
    getHomeRailSection,
    railViewAllHref,
} from '../../src/shared/components/home-rail';
import { translations } from '../../src/i18n';
import { FakeD1 } from '../helpers/fake-d1';

const get = (path: string) =>
    app.request(path, {}, { DB: new FakeD1() } as never).then((r) => r.text());

function queryOf(href: string): URLSearchParams {
    const q = href.split('?')[1] ?? '';
    return new URLSearchParams(q.replace(/&amp;/g, '&'));
}

describe('R3-EXPLORE-CONTEXT-1 rail View All context', () => {
    it.each(['ar', 'en'] as const)('1. typed rail context reaches the URL (%s)', (lang) => {
        const sub = railViewAllHref({
            kind: 'category', category: 'dialogue', subcategory: 'sects', status: 'live', lang,
        });
        const q = queryOf(sub);
        expect(q.get('category')).toBe('dialogue');
        expect(q.get('subcategory')).toBe('sects');
        expect(q.get('status')).toBe('live');
        expect(q.get('view')).toBe('competitions');
        expect(q.get('lang')).toBe(lang);

        const main = railViewAllHref({
            kind: 'category', category: 'science', subcategory: '', status: 'recorded', lang,
        });
        const qm = queryOf(main);
        expect(qm.get('category')).toBe('science');
        expect(qm.get('subcategory')).toBeNull();
        expect(qm.get('status')).toBe('recorded');
        expect(qm.get('view')).toBe('competitions');

        // Suggested carries its status bucket only — no invented category.
        const sug = railViewAllHref({
            kind: 'suggested', category: '', subcategory: '', status: 'upcoming', lang,
        });
        const qs = queryOf(sug);
        expect(qs.get('category')).toBeNull();
        expect(qs.get('subcategory')).toBeNull();
        expect(qs.get('status')).toBe('upcoming');
        expect(qs.get('view')).toBe('competitions');
    });

    it.each(['ar', 'en'] as const)('2. rail section renders the typed href, visible on mobile (%s)', (lang) => {
        const href = railViewAllHref({
            kind: 'category', category: 'dialogue', subcategory: 'sects', status: 'live', lang,
        });
        const html = getHomeRailSection({
            railKey: 'sub-sects-live',
            title: 'Sects',
            icon: 'fas fa-book',
            lang,
            color: '#A855F7',
            cardsHtml: '',
            sentinelMode: 'idle',
            viewAllHref: href,
        });
        // Query keys survive HTML escaping (&amp;) and stay parseable.
        expect(html).toContain('subcategory=sects');
        expect(html).toContain('view=competitions');
        expect(html).toContain(translations[lang].view_all);
        // The View All anchor itself is never viewport-hidden (contract §9.9).
        const anchors = html.match(/<a [^>]*>[^]*?<\/a>/g) ?? [];
        const viewAll = anchors.filter((a) => a.includes('subcategory=sects'));
        expect(viewAll).toHaveLength(1);
        expect(viewAll[0]).not.toMatch(/class="[^"]*\bhidden\b/);
    });
});

describe('R3-EXPLORE-CONTEXT-1 explore subcategory filter', () => {
    it.each(['ar', 'en'] as const)('3. subcategory filter renders from the taxonomy, selection kept (%s)', async (lang) => {
        const html = await get(`/explore?category=dialogue&subcategory=sects&status=live&lang=${lang}`);
        expect(html).toContain('id="subcategoryFilter"');
        expect(html).toContain('name="subcategory"');
        // Dialogue children offered, selection preserved.
        expect(html).toContain('value="sects" selected');
        expect(html).toContain('value="politics"');
        // Another parent's child is not offered under a chosen parent.
        expect(html).not.toContain('value="physics"');
        // Translated labels, no raw-slug fallback for known branches.
        const pack = translations[lang].categories as unknown as Record<string, string>;
        expect(html).toContain(pack.sects);
    });

    it('4. preview/view-all/back links keep the full branch context', async () => {
        const html = await get('/explore?category=dialogue&subcategory=sects&status=live&lang=ar');
        expect(html).toContain('subcategory=sects');
        expect(html).toContain('view=competitions');
        expect(html).toContain('category=dialogue');
        expect(html).toContain('status=live');
        // Back-to-results keeps the filters (dedicated view only).
        const viewHtml = await get('/explore?category=science&subcategory=physics&status=recorded&view=competitions&lang=en');
        expect(viewHtml).toContain('id="backToResults"');
        expect(viewHtml).toContain('subcategory=physics');
        expect(viewHtml).toContain('status=recorded');
        // Filter submit preserves the dedicated view (no silent drop to preview).
        expect(viewHtml).toContain('name="view" value="competitions"');
    });

    // The server-rendered invalid-filter banner (the same token also occurs
    // inside the client script source, so pin the banner's own markup).
    const bannerOf = (html: string): boolean =>
        html.includes('bg-red-50 dark:bg-red-900/20 border border-red-200');

    it('5. invalid pairs render an explicit error, never a silent All', async () => {
        // Cross-parent pair.
        const cross = await get('/explore?category=dialogue&subcategory=physics&lang=ar');
        expect(bannerOf(cross)).toBe(true);
        // Unknown subcategory.
        const unknown = await get('/explore?category=dialogue&subcategory=nope&lang=en');
        expect(bannerOf(unknown)).toBe(true);
        // Unknown parent.
        const badParent = await get('/explore?category=nope&lang=ar');
        expect(bannerOf(badParent)).toBe(true);
        // The invalid selection is not presented as a chosen All: the raw
        // control keeps no checked/explicit state for the bad value.
        expect(unknown).not.toContain('value="nope" selected');
    });

    it('6. subcategory without a parent canonicalizes to its known parent', async () => {
        const html = await get('/explore?subcategory=physics&lang=ar');
        expect(bannerOf(html)).toBe(false);
        expect(html).toContain('value="science" selected');
        expect(html).toContain('value="physics" selected');
        expect(html).toContain('subcategory=physics');
    });

    it('7. session transport carries the subcategory; no retrieval change in the page', async () => {
        const { readFileSync } = await import('node:fs');
        const { join } = await import('node:path');
        const src = readFileSync(join(process.cwd(), 'src/modules/pages/explore-page.ts'), 'utf-8');
        // Canonical create body + page URL both thread the subcategory.
        expect(src).toContain('subcategory: subcategoryParam()');
        expect(src).toContain("url += '&subcategory=' + encodeURIComponent(sub)");
        // Parent change drops an orphaned child; child change keeps the rest.
        expect(src).toContain('bindSubcategoryReset');
        // The page still owns no retrieval: no SQL, no ordering, no weights.
        expect(src).not.toMatch(/SELECT\s|ORDER BY|freezeShuffle|Math\.random/);
    });

    it('8. no new user-visible strings (existing keys only)', async () => {
        const html = await get('/explore?category=dialogue&subcategory=sects&lang=ar');
        expect(html).toContain(translations.ar.select_subcategory);
        const en = await get('/explore?category=dialogue&subcategory=sects&lang=en');
        expect(en).toContain(translations.en.select_subcategory);
        expect(translations.ar.errors.invalid_request).toBeTruthy();
        expect(translations.en.errors.invalid_request).toBeTruthy();
    });
});
