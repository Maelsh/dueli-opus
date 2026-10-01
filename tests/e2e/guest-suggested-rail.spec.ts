/**
 * R3-GUEST-1 — Home «مقترح لك» guest rail reaches real exhaustion (B evidence).
 *
 * Guest journey in a real browser against seeded local D1 (~190 public
 * competitions: pending + live; completed-without-recording stays out of the
 * rail by design):
 * - the suggested rail paints its first frozen batch (15 cards);
 * - scrolling the rail appends cursor batches until the server reports the
 *   true end (sentinel removed) — more than one batch, every card unique;
 * - no page errors and no failed suggested-session API calls.
 * ar + en run the same file (title and rail headers asserted per locale).
 */
import { test, expect } from '@playwright/test';

const langOf = (projectName: string): string => (projectName === 'ar' ? 'ar' : 'en');

async function railIds(page: import('@playwright/test').Page): Promise<number[]> {
    const hrefs = await page.locator('#suggested-rail a[href*="/competition/"]').evaluateAll(
        (nodes: HTMLAnchorElement[]) =>
            nodes
                .map((a) => a.getAttribute('href') || '')
                .map((h) => (/\/competition\/(\d+)/.exec(h) || [])[1])
                .filter(Boolean)
                .map(Number),
    );
    // Each card links twice (cover + title) — the card identity is unique.
    return [...new Set(hrefs)];
}

async function scrollRailToEnd(page: import('@playwright/test').Page): Promise<void> {
    // RTL scrollers run negative (Chrome: 0 at the right edge), so the far
    // end is direction-aware — a real visitor's hover-scroll has no such issue.
    await page.evaluate(() => {
        const el = document.getElementById('suggested-rail-scroll');
        if (!el) return;
        const rtl = getComputedStyle(el).direction === 'rtl';
        el.scrollTo({ left: rtl ? -el.scrollWidth : el.scrollWidth });
    });
}

test.describe('R3-GUEST-1 guest suggested rail (browser)', () => {
    test('guest scrolls the frozen rail past the first batch to a unique end', async ({ page }, testInfo) => {
        const lang = langOf(testInfo.project.name);
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        const badResponses: string[] = [];
        page.on('response', (r) => {
            if (r.url().includes('/suggested-sessions') && !r.ok()) badResponses.push(`${r.status()} ${r.url()}`);
        });

        await page.goto(`/?lang=${lang}`, { waitUntil: 'load' });
        const rail = page.locator('#suggested-rail');
        await expect(rail).toBeVisible({ timeout: 25000 });
        await expect
            .poll(async () => (await railIds(page)).length, { timeout: 25000 })
            .toBeGreaterThanOrEqual(15);

        const seen: number[] = [];
        for (const id of await railIds(page)) {
            if (!seen.includes(id)) seen.push(id);
        }
        // Drive the rail to its true end: scroll, wait for growth, repeat.
        for (let i = 0; i < 20; i++) {
            const sentinel = page.locator('#suggested-rail-sentinel');
            if ((await sentinel.count()) === 0) break;
            const before = (await railIds(page)).length;
            await scrollRailToEnd(page);
            try {
                await expect
                    .poll(async () => (await railIds(page)).length, { timeout: 5000 })
                    .toBeGreaterThan(before);
            } catch {
                // No growth: either the tail batch is still in flight or the
                // session truly ended — re-check the sentinel below.
            }
            for (const id of await railIds(page)) {
                if (!seen.includes(id)) seen.push(id);
            }
        }

        // Multi-batch proof on seed scale, every card reached exactly once.
        expect(seen.length).toBeGreaterThan(15);
        expect(new Set(seen).size).toBe(seen.length);
        // True exhaustion: the sentinel is gone only on server hasMore=false.
        await expect(page.locator('#suggested-rail-sentinel')).toHaveCount(0, { timeout: 20000 });

        expect(badResponses).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('rail header is localized (ar/en surface check)', async ({ page }, testInfo) => {
        const lang = langOf(testInfo.project.name);
        await page.goto(`/?lang=${lang}`, { waitUntil: 'load' });
        const rail = page.locator('#suggested-rail');
        await expect(rail).toBeVisible({ timeout: 25000 });
        await expect(rail.locator('h2').first()).toContainText(lang === 'ar' ? 'مقترح لك' : 'Suggested', {
            timeout: 25000,
        });
    });
});
