/**
 * R3-B7 — Explore result session, real-browser journey (B evidence).
 *
 * - Preview freezes one session (view-all href gains esession=...), capped 6.
 * - View-all pages that SAME session with cursor batches to the true end:
 *   every card id unique, count beyond one batch, explicit end state.
 * - Reloading the view-all URL reopens the session from its start with the
 *   identical first rows (frozen order — no loss, no repeat).
 * - Changing the status filter freezes a NEW session (different esession).
 * - No page errors; no failed session/page API calls.
 *
 * Seed scale (db/seed.sql, ~266 competitions) covers multi-batch paging;
 * the >1000-row/chunk/skip/continuation matrix lives in
 * tests/api/explore-result-sessions.test.ts (T evidence).
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
    // Each card links twice (cover + title) — the card identity is unique.
    return [...new Set(hrefs)];
}

test.describe('R3-B7 explore result session (browser)', () => {
    test('preview freezes a session; view-all pages it to a unique, stable end', async ({ page }, testInfo) => {
        const lang = langOf(testInfo.project.name);
        const errors: string[] = [];
        page.on('pageerror', (e) => errors.push(String(e)));
        const badResponses: string[] = [];
        page.on('response', (r) => {
            if (r.url().includes('/explore-sessions') && !r.ok()) badResponses.push(`${r.status()} ${r.url()}`);
        });

        await page.goto(`/explore?lang=${lang}`, { waitUntil: 'load' });
        await expect(page.locator('#competitionsGrid')).toBeVisible({ timeout: 20000 });
        const previewIds = await competitionIds(page);
        expect(previewIds.length).toBeGreaterThan(0);
        expect(previewIds.length).toBeLessThanOrEqual(6);

        const viewAll = page.locator('#compsViewAllUnder');
        await expect(viewAll).toHaveAttribute('href', /esession=/, { timeout: 20000 });
        const href = (await viewAll.getAttribute('href')) || '';
        const firstSession = new URL(href, 'http://x').searchParams.get('esession');
        expect(firstSession).toBeTruthy();

        // View-all reopens the SAME session from its start.
        await viewAll.click();
        await page.waitForURL(/view=competitions/, { timeout: 15000 });
        await expect(page.locator('#competitionsGrid')).toBeVisible({ timeout: 20000 });

        const seen: number[] = [];
        const settled = '[data-action="load-more-competitions"], [data-explore-state="end"], [data-explore-state="error"]';
        for (let i = 0; i < 40; i++) {
            await page.waitForSelector(settled, { timeout: 20000 });
            for (const id of await competitionIds(page)) {
                if (!seen.includes(id)) seen.push(id);
            }
            if ((await page.locator('[data-action="load-more-competitions"]').count()) === 0) break;
            // The auto-loader (IntersectionObserver) can replace the status
            // node mid-click — re-resolve and retry instead of flaking.
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
        // Multi-batch proof on seed scale: more than one 12-batch, all unique.
        expect(seen.length).toBeGreaterThan(12);
        expect(new Set(seen).size).toBe(seen.length);
        // The preview rows are the head of the same frozen order.
        expect(seen.slice(0, previewIds.length)).toEqual(previewIds);
        await expect(page.locator('[data-explore-state="end"]')).toBeVisible({ timeout: 15000 });

        // Reload: same session, same frozen head — no loss, no repeat.
        await page.reload({ waitUntil: 'load' });
        await expect
            .poll(async () => (await competitionIds(page)).length, { timeout: 20000 })
            .toBeGreaterThanOrEqual(12);
        expect((await competitionIds(page)).slice(0, previewIds.length)).toEqual(previewIds);

        expect(badResponses).toEqual([]);
        expect(errors).toEqual([]);
    });

    test('a filter change freezes a new session', async ({ page }, testInfo) => {
        const lang = langOf(testInfo.project.name);
        await page.goto(`/explore?lang=${lang}`, { waitUntil: 'load' });
        const viewAll = page.locator('#compsViewAllUnder');
        await expect(viewAll).toHaveAttribute('href', /esession=/, { timeout: 20000 });
        const before = new URL((await viewAll.getAttribute('href')) || '', 'http://x').searchParams.get('esession');

        await page.selectOption('#statusFilter', 'live');
        await page.locator('form[role="search"] button[type="submit"]').click();
        await page.waitForURL(/status=live/, { timeout: 15000 });
        const after = page.locator('#compsViewAllUnder');
        await expect(after).toHaveAttribute('href', /esession=/, { timeout: 20000 });
        const afterSession = new URL((await after.getAttribute('href')) || '', 'http://x').searchParams.get('esession');
        expect(afterSession).toBeTruthy();
        expect(afterSession).not.toBe(before);
    });
});
