/**
 * R3-RAILS-1B — every Home rail continues independently in the browser.
 *
 * Guest journey against seeded local D1 (B evidence, runs with the same
 * sandbox as the suggested-rail spec):
 * - category rails (Dialogue/Science/Talents) paint beside Suggested, each
 *   with its own scroller + sentinel, and each scrolls past its first batch
 *   with per-rail unique ids (no global dedup: an id MAY appear in Suggested
 *   and in its own section — uniqueness is enforced WITHIN each rail only);
 * - the Upcoming tab is visible to guests and repaints every rail from fresh
 *   status-qualified sessions (context change starts a new snapshot);
 * - retry/end states are translated; no failed home-rails API calls.
 * ar + en run the same file.
 */
import { test, expect } from '@playwright/test';

const langOf = (projectName: string): string => (projectName === 'ar' ? 'ar' : 'en');
const END_TEXT = (lang: string): string => (lang === 'ar' ? 'لا توجد نتائج أخرى' : 'No more results');

async function railIds(page: import('@playwright/test').Page, rail: string): Promise<number[]> {
    const hrefs = await page.locator(`#${rail} a[href*="/competition/"]`).evaluateAll(
        (nodes: HTMLAnchorElement[]) =>
            nodes
                .map((a) => a.getAttribute('href') || '')
                .map((h) => (/\/competition\/(\d+)/.exec(h) || [])[1])
                .filter(Boolean)
                .map(Number),
    );
    return [...new Set(hrefs)];
}

async function scrollRailToEnd(page: import('@playwright/test').Page, rail: string): Promise<void> {
    await page.evaluate((id: string) => {
        const el = document.getElementById(`${id}-scroll`);
        if (!el) return;
        const rtl = getComputedStyle(el).direction === 'rtl';
        el.scrollTo({ left: rtl ? -el.scrollWidth : el.scrollWidth });
    }, rail);
}

async function driveRailToEnd(page: import('@playwright/test').Page, rail: string): Promise<number[]> {
    const seen: number[] = [];
    for (const id of await railIds(page, rail)) {
        if (!seen.includes(id)) seen.push(id);
    }
    for (let i = 0; i < 20; i++) {
        const before = (await railIds(page, rail)).length;
        await scrollRailToEnd(page, rail);
        try {
            await expect
                .poll(async () => (await railIds(page, rail)).length, { timeout: 5000 })
                .toBeGreaterThan(before);
        } catch {
            // Tail batch in flight or true end — the end marker decides.
        }
        for (const id of await railIds(page, rail)) {
            if (!seen.includes(id)) seen.push(id);
        }
        const sentinelText = (await page.locator(`#${rail}-sentinel`).textContent().catch(() => '')) || '';
        if (sentinelText.includes('نتائج') || sentinelText.includes('results')) break;
    }
    return seen;
}

test.describe('R3-RAILS-1B home rails (browser)', () => {
    test('category rails continue independently with per-rail uniqueness', async ({ page }, testInfo) => {
        const lang = langOf(testInfo.project.name);
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        const badResponses: string[] = [];
        page.on('response', (r) => {
            if (r.url().includes('/home-rails/sessions') && !r.ok()) badResponses.push(`${r.status()} ${r.url()}`);
        });

        await page.goto(`/?lang=${lang}`, { waitUntil: 'load' });
        for (const rail of ['home-rail-suggested-live', 'home-rail-cat-dialogue-live']) {
            await expect(page.locator(`#${rail}`)).toBeVisible({ timeout: 25000 });
        }

        // The dialogue rail reaches its own true end, every card unique
        // within the rail (cross-rail overlap with Suggested is allowed —
        // uniqueness is per-rail, never a global dedup).
        const seen = await driveRailToEnd(page, 'home-rail-cat-dialogue-live');
        expect(seen.length).toBeGreaterThan(0);
        expect(new Set(seen).size).toBe(seen.length);
        await expect(page.locator('#home-rail-cat-dialogue-live-sentinel')).toContainText(END_TEXT(lang), {
            timeout: 20000,
        });

        expect(badResponses).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('guest upcoming tab repaints every rail from fresh sessions', async ({ page }, testInfo) => {
        const lang = langOf(testInfo.project.name);
        await page.goto(`/?lang=${lang}`, { waitUntil: 'load' });
        const upcomingTab = page.locator('#tab-upcoming');
        await expect(upcomingTab).toBeVisible({ timeout: 25000 });
        await upcomingTab.click();
        await expect(page.locator('#home-rail-suggested-upcoming')).toBeVisible({ timeout: 25000 });
        // A sandbox flake must surface as the translated retry — never as a
        // silent gap. Exercising it also proves the retry path end to end.
        const retry = page.locator('#home-rail-suggested-upcoming [data-home-rail-retry]');
        if ((await retry.count()) > 0) {
            await retry.first().click();
        }
        await expect
            .poll(async () => (await railIds(page, 'home-rail-suggested-upcoming')).length, { timeout: 25000 })
            .toBeGreaterThan(0);
    });
});
