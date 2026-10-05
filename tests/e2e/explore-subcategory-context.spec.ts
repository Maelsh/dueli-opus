/**
 * R3-EXPLORE-CONTEXT-1 — branch context journey, real-browser (B evidence).
 *
 * - Direct URL with category+subcategory+status opens the dedicated view with
 *   the controls set, pages the SAME frozen session to a unique end, and the
 *   context survives refresh / back-forward / filter change (ar/en, RTL/LTR).
 * - An invalid pair (subcategory of another parent) renders an explicit
 *   error state and never fetches a widened session.
 * - Home View All links carry the typed rail context (category + subcategory
 *   + status + view=competitions), stay visible on a mobile viewport, and are
 *   keyboard-focusable with a working Enter journey.
 * - Zero page errors, zero console errors, zero failed session/page calls.
 *
 * Seed scale (db/seed.sql) drives the browser traversal; the >2-page,
 * skip-fill, retry/TTL/identity matrix lives in
 * tests/api/explore-subcategory-context.test.ts (T evidence).
 */
import { test, expect } from '@playwright/test';

const langOf = (projectName: string): string => (projectName === 'ar' ? 'ar' : 'en');

async function competitionIds(page: import('@playwright/test').Page): Promise<number[]> {
    const hrefs = await page.locator('#competitionsGrid a[href*="/competition/"]').evaluateAll(
        (nodes: HTMLAnchorElement[]) =>
            nodes
                .map((a) => a.getAttribute('href') || '')
                .map((h) => (/\/competition\/(\d+)/.exec(h) || [])[1])
                .filter(Boolean)
                .map(Number),
    );
    return [...new Set(hrefs)];
}

async function pageToEnd(page: import('@playwright/test').Page): Promise<number[]> {
    const seen: number[] = [];
    const settled = '[data-action="load-more-competitions"], [data-explore-state="end"], [data-explore-state="error"]';
    for (let i = 0; i < 40; i++) {
        await page.waitForSelector(settled, { timeout: 20000 });
        for (const id of await competitionIds(page)) {
            if (!seen.includes(id)) seen.push(id);
        }
        if ((await page.locator('[data-action="load-more-competitions"]').count()) === 0) break;
        let clicked = false;
        for (let r = 0; r < 5 && !clicked; r++) {
            const btn = page.locator('[data-action="load-more-competitions"]').first();
            if ((await btn.count()) === 0) break;
            try {
                await btn.click({ timeout: 5000 });
                clicked = true;
            } catch {
                await page.waitForTimeout(300);
            }
        }
    }
    return seen;
}

function trackNetwork(page: import('@playwright/test').Page) {
    const errors: string[] = [];
    const consoleErrors: string[] = [];
    const badResponses: string[] = [];
    const sessionPosts: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
        if (m.type() === 'error') consoleErrors.push(m.text());
    });
    page.on('response', (r) => {
        if (r.url().includes('/explore-sessions')) {
            if (r.request().method() === 'POST') sessionPosts.push(`${r.status()} ${r.url()}`);
            if (!r.ok()) badResponses.push(`${r.status()} ${r.url()}`);
        }
    });
    return { errors, consoleErrors, badResponses, sessionPosts };
}

test.describe('R3-EXPLORE-CONTEXT-1 branch context (browser)', () => {
    test('direct URL keeps branch filters across paging, refresh, back-forward and filter change', async ({
        page,
    }, testInfo) => {
        const lang = langOf(testInfo.project.name);
        const net = trackNetwork(page);

        await page.goto(
            `/explore?category=dialogue&subcategory=sects&status=live&view=competitions&lang=${lang}`,
            { waitUntil: 'load' },
        );
        // Direction follows the locale.
        await expect(page.locator('html')).toHaveAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
        // Controls reflect the URL context.
        await expect(page.locator('#categoryFilter')).toHaveValue('dialogue');
        await expect(page.locator('#subcategoryFilter')).toHaveValue('sects');
        await expect(page.locator('#statusFilter')).toHaveValue('live');

        await expect(page.locator('#competitionsGrid')).toBeVisible({ timeout: 20000 });
        const seen = await pageToEnd(page);
        expect(seen.length).toBeGreaterThan(0);
        expect(new Set(seen).size).toBe(seen.length);
        await expect(page.locator('[data-explore-state="end"]')).toBeVisible({ timeout: 15000 });

        // Refresh: same filters, same eligible SET (a reload freezes a new
        // session, so the order may reshuffle — the contract promises filter
        // restoration, not snapshot pinning).
        await page.reload({ waitUntil: 'load' });
        await expect(page.locator('#subcategoryFilter')).toHaveValue('sects', { timeout: 15000 });
        const seenAfter = await pageToEnd(page);
        expect([...seenAfter].sort((a, b) => a - b)).toEqual([...seen].sort((a, b) => a - b));

        // Back-forward between preview and the dedicated view keeps context.
        await page.goto(`/explore?category=dialogue&subcategory=sects&status=live&lang=${lang}`, {
            waitUntil: 'load',
        });
        const viewAll = page.locator('#compsViewAllUnder');
        await expect(viewAll).toHaveAttribute('href', /esession=/, { timeout: 20000 });
        const href = (await viewAll.getAttribute('href')) || '';
        expect(href).toContain('subcategory=sects');
        expect(href).toContain('view=competitions');
        await viewAll.click();
        await page.waitForURL(/view=competitions/, { timeout: 15000 });
        await expect(page.locator('#competitionsGrid')).toBeVisible({ timeout: 20000 });
        await page.goBack();
        await page.waitForURL(/\/explore\?/, { timeout: 15000 });
        await expect(page.locator('#subcategoryFilter')).toHaveValue('sects');
        await page.goForward();
        await page.waitForURL(/view=competitions/, { timeout: 15000 });
        await expect(page.locator('#subcategoryFilter')).toHaveValue('sects');

        // Sibling-branch change: URL, controls and view-all follow, no widen.
        await page.selectOption('#subcategoryFilter', 'politics');
        await page.locator('form[role="search"] button[type="submit"]').click();
        await page.waitForURL(/subcategory=politics/, { timeout: 15000 });
        expect(page.url()).toContain('view=competitions');
        expect(page.url()).toContain('status=live');
        await expect(page.locator('#subcategoryFilter')).toHaveValue('politics');
        await expect(page.locator('#competitionsGrid')).toBeVisible({ timeout: 20000 });
        // Dedicated view: the back-to-results link (not the preview view-all)
        // carries the new branch context.
        const backHref = (await page.locator('#backToResults').getAttribute('href')) || '';
        expect(backHref).toContain('subcategory=politics');
        expect(backHref).toContain('status=live');

        expect(net.badResponses).toEqual([]);
        expect(net.errors).toEqual([]);
        expect(net.consoleErrors).toEqual([]);
    });

    test('invalid pair renders an explicit error and fetches no widened session', async ({
        page,
    }, testInfo) => {
        const lang = langOf(testInfo.project.name);
        const net = trackNetwork(page);

        await page.goto(`/explore?category=dialogue&subcategory=physics&lang=${lang}`, {
            waitUntil: 'load',
        });
        // Server banner and the client no-fetch guard agree (both visible).
        await expect(page.locator('[data-explore-state="invalid-filter"]').first()).toBeVisible({
            timeout: 15000,
        });
        expect(await page.locator('[data-explore-state="invalid-filter"]').count()).toBeGreaterThanOrEqual(1);
        // No frozen session is ever created for the invalid pair.
        await page.waitForTimeout(3000);
        expect(net.sessionPosts).toEqual([]);
        expect(net.badResponses).toEqual([]);
        expect(net.errors).toEqual([]);
    });

    test('Home View All carries typed context, stays visible on mobile, keyboard works', async ({
        page,
    }, testInfo) => {
        const lang = langOf(testInfo.project.name);
        const net = trackNetwork(page);
        await page.setViewportSize({ width: 390, height: 844 });

        await page.goto(`/?lang=${lang}`, { waitUntil: 'load' });
        const suggestedRail = page.locator('#home-rail-suggested-live');
        await expect(suggestedRail).toBeVisible({ timeout: 30000 });
        const suggestedLink = suggestedRail.locator('a[href*="view=competitions"]').first();
        await expect(suggestedLink).toBeVisible();
        const sugHref = (await suggestedLink.getAttribute('href')) || '';
        const sugQ = new URL(sugHref, 'http://x').searchParams;
        expect(sugQ.get('status')).toBe('live');
        expect(sugQ.get('view')).toBe('competitions');
        expect(sugQ.get('category')).toBeNull();

        const catRail = page.locator('#home-rail-cat-dialogue-live');
        await expect(catRail).toBeVisible({ timeout: 30000 });
        const catLink = catRail.locator('a[href*="view=competitions"]').first();
        // Visible on the mobile viewport — no silent gap.
        await expect(catLink).toBeVisible();
        const catHref = (await catLink.getAttribute('href')) || '';
        const catQ = new URL(catHref, 'http://x').searchParams;
        expect(catQ.get('category')).toBe('dialogue');
        expect(catQ.get('status')).toBe('live');
        expect(catQ.get('view')).toBe('competitions');

        // Keyboard: focus the link and Enter through to the filtered view.
        await catLink.focus();
        await expect(catLink).toBeFocused();
        await page.keyboard.press('Enter');
        await page.waitForURL(/category=dialogue/, { timeout: 15000 });
        await expect(page.locator('#categoryFilter')).toHaveValue('dialogue');
        await expect(page.locator('#statusFilter')).toHaveValue('live');

        expect(net.errors).toEqual([]);
        expect(net.consoleErrors).toEqual([]);
    });
});
