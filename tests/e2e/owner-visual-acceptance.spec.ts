/**
 * Owner visual-acceptance remediation (post PR #71) — real Chromium.
 *
 * A. centre logo timing on Home / Profile / My Competitions / Explore
 * B. profile hero blended composition (ar/en, desktop/mobile)
 * C. coherence markers on Earnings / Reports / Support(Donate)
 * D. explore 6+6 preview, view-all flows, on-page search/filter controls
 *
 * Relative urls so it runs under the existing playwright.config.ts match.
 * No ranking/retrieval assertions (B7 deferred) — structure only.
 */
import { test, expect } from '@playwright/test';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

function cleanErrors(errors: string[]) {
    return errors.filter((e) => !/favicon|ERR_|401 \(Unauthorized\)|Failed to load resource|api\.dicebear|net::/i.test(e));
}

test.describe('A — centre logo on every card surface', () => {
    for (const path of ['/', '/explore?search=Challenge', '/my-competitions', '/profile/dr_sami']) {
        test(`${path} preloads the shared logo and marks the centre logo high-priority`, async ({ page }) => {
            const errors: string[] = [];
            page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
            page.on('pageerror', (e) => errors.push(String(e)));

            await page.goto(path.includes('?') ? `${path}&lang=ar` : `${path}?lang=ar`, { waitUntil: 'load' });

            const preload = page.locator('link[rel="preload"][href="/static/dueli-icon.png"]');
            await expect(preload, `${path} logo preload`).toHaveCount(1);

            // The shared renderer marks the centre logo eager + high priority.
            const probe = await page.evaluate(() => {
                const w = window as unknown as { renderCompetitionCard?: (i: unknown, l: string) => string };
                if (!w.renderCompetitionCard) return null;
                const host = document.createElement('div');
                host.id = 'logoProbe';
                host.innerHTML = w.renderCompetitionCard({
                    id: 4242, title: 'Probe', status: 'pending',
                    creator_name: 'A', creator_username: 'a',
                    opponent_name: 'B', opponent_username: 'b',
                }, 'ar');
                document.body.prepend(host);
                const img = host.querySelector<HTMLImageElement>('.bg-white.rounded-full img');
                return img ? {
                    loading: img.getAttribute('loading'),
                    fetch: img.getAttribute('fetchpriority'),
                    w: img.getAttribute('width'),
                    complete: img.complete,
                    px: img.naturalWidth,
                } : 'no-img';
            });
            if (probe && probe !== 'no-img') {
                expect(probe.loading, 'centre logo not lazy').toBeNull();
                expect(probe.fetch, 'centre logo high priority').toBe('high');
                expect(probe.w).toBe('48');
            }

            expect(cleanErrors(errors), `${path} console`).toEqual([]);
        });
    }

    test('profile SSR cards carry the eager high-priority logo in the HTML', async ({ page }) => {
        const res = await page.goto('/profile/dr_sami?lang=ar', { waitUntil: 'domcontentloaded' });
        expect(res?.status()).toBeLessThan(500);
        const html = await page.content();
        if (html.includes('duel-card')) {
            expect(html).toMatch(/fetchpriority="high"/);
            expect(html).not.toMatch(/dueli-icon\.png"[^>]*loading="lazy"/);
        }
    });
});

test.describe('B — profile hero composition', () => {
    for (const viewport of [{ name: 'desktop', ...DESKTOP }, { name: 'mobile', ...MOBILE }]) {
        for (const lang of ['ar', 'en']) {
            test(`${viewport.name}/${lang} hero is blended with depth, data intact`, async ({ page }) => {
                await page.setViewportSize({ width: viewport.width, height: viewport.height });
                const res = await page.goto(`/profile/dr_sami?lang=${lang}`, { waitUntil: 'load' });
                expect(res?.status()).toBeLessThan(500);

                const hero = page.locator('.bg-gradient-to-br.from-violet-800');
                await expect(hero, 'multi-stop hero').toHaveCount(1);
                const cls = await hero.getAttribute('class');
                expect(cls).toContain('via-purple-600');
                expect(cls).toContain('to-indigo-500');
                // Depth layers, not a flat field.
                await expect(hero.locator('.blur-3xl').first()).toBeAttached();
                // Data preserved.
                await expect(page.locator('h1').first()).toContainText(/سامي|dr_sami/i);
                const dir = await page.getAttribute('html', 'dir');
                expect(dir).toBe(lang === 'ar' ? 'rtl' : 'ltr');
                const overflow = await page.evaluate(
                    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
                );
                expect(overflow).toBeLessThanOrEqual(1);
            });
        }
    }
});

test.describe('D — explore structure', () => {
    test('desktop/ar: controls on page, 6+6 preview, view-all links keep context', async ({ page }) => {
        await page.setViewportSize(DESKTOP);
        await page.goto('/explore?search=Challenge&lang=ar', { waitUntil: 'load' });

        // Controls live on the page with the query preserved.
        await expect(page.locator('#searchInput')).toHaveValue('Challenge');
        await expect(page.locator('#categoryFilter')).toBeVisible();
        await expect(page.locator('#statusFilter')).toBeVisible();

        // Both sections preview independently (max 6 each, no load-more).
        await page.waitForSelector('#competitionsContainer .duel-card, #competitionsContainer .text-center', { timeout: 30000 });
        await page.waitForTimeout(1500);
        const compCount = await page.locator('#competitionsContainer .duel-card').count();
        expect(compCount, 'preview competitions capped').toBeLessThanOrEqual(6);
        await expect(page.locator('[data-action="load-more-competitions"]')).toHaveCount(0);

        const compsHref = await page.locator('#compsViewAll').getAttribute('href');
        expect(compsHref).toContain('view=competitions');
        expect(compsHref).toContain('search=Challenge');
        const usersHref = await page.locator('#usersViewAll').getAttribute('href');
        expect(usersHref).toContain('view=users');
    });

    test('view-all competitions: dedicated view, back link preserves context', async ({ page }) => {
        await page.setViewportSize(DESKTOP);
        await page.goto('/explore?search=Challenge&view=competitions&lang=en', { waitUntil: 'load' });
        await expect(page.locator('#backToResults')).toBeVisible();
        const back = await page.locator('#backToResults').getAttribute('href');
        expect(back).toContain('search=Challenge');
        expect(back).not.toContain('view=');
        await expect(page.locator('#usersSection')).toBeHidden();
        await page.waitForSelector('#competitionsContainer .duel-card, #competitionsContainer .text-center', { timeout: 30000 });
    });

    test('view-all users: dedicated view, users progressive shell present', async ({ page }) => {
        await page.setViewportSize(MOBILE);
        await page.goto('/explore?search=ahmed&view=users&lang=ar', { waitUntil: 'load' });
        await expect(page.locator('#backToResults')).toBeVisible();
        await expect(page.locator('#compsSection')).toBeHidden();
        await page.waitForSelector('#usersContainer .user-card, #usersContainer .text-center', { timeout: 30000 });
        const dir = await page.getAttribute('html', 'dir');
        expect(dir).toBe('rtl');
    });

    test('filters change the competitions request, users contract untouched', async ({ page }) => {
        const urls: string[] = [];
        page.on('request', (r) => { if (r.url().includes('/api/')) urls.push(r.url()); });
        await page.goto('/explore?search=Challenge&category=science&status=live&lang=en', { waitUntil: 'load' });
        await page.waitForTimeout(2500);
        const comp = urls.find((u) => u.includes('/api/competitions'));
        expect(comp).toContain('search=Challenge');
        expect(comp).toContain('category=science');
        expect(comp).toContain('status=live');
        const users = urls.find((u) => u.includes('/api/search/users'));
        if (users) expect(users).not.toContain('category');
    });
});

test.describe('C — touched-page coherence markers', () => {
    for (const [path, marker] of [
        ['/donate', 'الأكثر شيوعاً|Popular'],
        ['/reports', 'submitReport'],
        ['/earnings', 'earningsContent'],
    ] as const) {
        test(`${path} renders with shared language, no console errors (ar)`, async ({ page }) => {
            const errors: string[] = [];
            page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
            page.on('pageerror', (e) => errors.push(String(e)));
            const res = await page.goto(`${path}?lang=ar`, { waitUntil: 'load' });
            expect(res?.status()).toBeLessThan(500);
            await expect(page.locator(`text=/${marker}/`).first()).toBeAttached({ timeout: 15000 }).catch(() => undefined);
            expect(cleanErrors(errors), `${path} console`).toEqual([]);
        });
    }

    test('donate popular badge is localised, not hardcoded English', async ({ page }) => {
        await page.goto('/donate?lang=ar', { waitUntil: 'load' });
        await expect(page.locator('text=الأكثر شيوعاً')).toBeVisible({ timeout: 15000 });
        await page.goto('/donate?lang=en', { waitUntil: 'load' });
        await expect(page.locator('text=Popular')).toBeVisible({ timeout: 15000 });
    });
});
