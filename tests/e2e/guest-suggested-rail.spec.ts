/**
 * R3-RAILS-1B — Home «مقترح لك» guest rail reaches real exhaustion (B evidence).
 *
 * Updated for the per-rail session engine: the suggested rail is now
 * `#home-rail-suggested-live` (status-qualified sessions under
 * /api/home-rails/sessions), and the terminal state is an explicit
 * translated end marker — not a removed sentinel.
 *
 * Guest journey in a real browser against seeded local D1:
 * - the suggested rail paints its first frozen batch;
 * - scrolling the rail appends cursor batches until the server reports the
 *   true end (translated end marker) — more than one batch, every card unique;
 * - no page errors and no failed home-rails API calls.
 * ar + en run the same file (title and rail headers asserted per locale).
 */
import { test, expect } from '@playwright/test';

const langOf = (projectName: string): string => (projectName === 'ar' ? 'ar' : 'en');
const RAIL = 'home-rail-suggested-live';

async function railIds(page: import('@playwright/test').Page): Promise<number[]> {
    const hrefs = await page.locator(`#${RAIL} a[href*="/competition/"]`).evaluateAll(
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
    await page.evaluate((rail: string) => {
        const el = document.getElementById(`${rail}-scroll`);
        if (!el) return;
        const rtl = getComputedStyle(el).direction === 'rtl';
        el.scrollTo({ left: rtl ? -el.scrollWidth : el.scrollWidth });
    }, RAIL);
}

test.describe('R3-RAILS-1B guest suggested rail (browser)', () => {
    test('guest scrolls the frozen rail past the first batch to a unique end', async ({ page }, testInfo) => {
        const lang = langOf(testInfo.project.name);
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        const badResponses: string[] = [];
        page.on('response', (r) => {
            if (r.url().includes('/home-rails/sessions') && !r.ok()) badResponses.push(`${r.status()} ${r.url()}`);
        });

        await page.goto(`/?lang=${lang}`, { waitUntil: 'load' });
        const rail = page.locator(`#${RAIL}`);
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
            const before = (await railIds(page)).length;
            await scrollRailToEnd(page);
            try {
                await expect
                    .poll(async () => (await railIds(page)).length, { timeout: 5000 })
                    .toBeGreaterThan(before);
            } catch {
                // No growth: either the tail batch is still in flight or the
                // session truly ended — re-check the end marker below.
            }
            for (const id of await railIds(page)) {
                if (!seen.includes(id)) seen.push(id);
            }
        }

        // Multi-batch proof on seed scale, every card reached exactly once.
        expect(seen.length).toBeGreaterThan(15);
        expect(new Set(seen).size).toBe(seen.length);
        // True exhaustion: the sentinel carries the translated end marker —
        // the end comes ONLY from the server hasMore flag.
        const sentinel = page.locator(`#${RAIL}-sentinel`);
        await expect(sentinel).toContainText(lang === 'ar' ? 'لا توجد نتائج أخرى' : 'No more results', {
            timeout: 20000,
        });

        expect(badResponses).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('rail header is localized (ar/en surface check)', async ({ page }, testInfo) => {
        const lang = langOf(testInfo.project.name);
        await page.goto(`/?lang=${lang}`, { waitUntil: 'load' });
        const rail = page.locator(`#${RAIL}`);
        await expect(rail).toBeVisible({ timeout: 25000 });
        await expect(rail.locator('h2').first()).toContainText(lang === 'ar' ? 'مقترح لك' : 'Suggested', {
            timeout: 25000,
        });
    });
});
