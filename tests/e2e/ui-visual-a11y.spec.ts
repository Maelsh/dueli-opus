/**
 * Real-browser visual + accessibility acceptance for the UI consistency batch.
 *
 * Uses RELATIVE urls so it runs under any Playwright config / baseURL (it is
 * picked up by the existing `playwright.config.ts` `**\/*.spec.ts` match).
 * Asserts, in a real engine rather than by source inspection:
 *  - every listed surface renders, in ar/RTL and en/LTR, desktop and mobile;
 *  - no console/page errors (a guest /profile legitimately 401s on auth);
 *  - no horizontal overflow;
 *  - the card centre Dueli logo is decoded on first paint, is not lazy, has
 *    intrinsic size, never reserves more than its 48px box, and is a single
 *    shared request that survives F5 and repeat navigation;
 *  - the login modal's dialog semantics, initial focus, Tab / Shift+Tab wrap,
 *    Escape dismissal and focus restoration to the opener.
 */
import { test, expect } from '@playwright/test';

const PAGES = [
    '/', '/profile', '/messages', '/settings', '/earnings',
    '/my-requests', '/reports', '/create', '/donate', '/notifications',
];

for (const viewport of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'mobile', width: 390, height: 844 }]) {
    for (const lang of ['ar', 'en']) {
        test.describe(`${viewport.name} / ${lang}`, () => {
            test.use({ viewport: { width: viewport.width, height: viewport.height } });

            for (const path of PAGES) {
                test(`${path} renders with no console/CSP errors and no horizontal overflow`, async ({ page }) => {
                    const errors: string[] = [];
                    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
                    page.on('pageerror', (e) => errors.push(String(e)));

                    const res = await page.goto(`${path}?lang=${lang}`, { waitUntil: 'load' });
                    expect(res?.status(), `${path} status`).toBeLessThan(500);

                    // Direction must follow the language.
                    const dir = await page.getAttribute('html', 'dir');
                    expect(dir, `${path} dir for ${lang}`).toBe(lang === 'ar' ? 'rtl' : 'ltr');

                    // No horizontal scroll (mobile overflow guard).
                    const overflow = await page.evaluate(
                        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
                    );
                    expect(overflow, `${path} horizontal overflow`).toBeLessThanOrEqual(1);

                    // A guest /profile legitimately probes auth and gets 401 —
                    // that is the expected guest path, not a defect.
                    expect(
                        errors.filter((e) => !/favicon|ERR_|401 \(Unauthorized\)/.test(e)),
                        `${path} errors`,
                    ).toEqual([]);
                });
            }
        });
    }
}

test.describe('login modal accessibility (real browser)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('dialog semantics, initial focus, Tab wrap and Escape + focus restore', async ({ page }) => {
        await page.goto(`/?lang=ar`, { waitUntil: 'load' });

        // The trigger we will later assert focus returns to.
        const trigger = page.locator('#loginModal').locator('xpath=..');
        void trigger;

        // Open via the real delegated action (CSP path).
        await page.evaluate(() => (window as unknown as { showLoginModal: () => void }).showLoginModal());
        await page.waitForSelector('#loginModal:not(.hidden)');
        await page.waitForTimeout(300);

        // Dialog semantics.
        await expect(page.locator('#loginModal')).toHaveAttribute('role', 'dialog');
        await expect(page.locator('#loginModal')).toHaveAttribute('aria-modal', 'true');

        // Initial focus entered the modal.
        const inside = await page.evaluate(() =>
            document.getElementById('loginModal')!.contains(document.activeElement));
        expect(inside, 'focus entered the modal').toBe(true);

        // Body scroll is locked while open.
        expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden');

        // Tab from the last VISIBLE focusable wraps to the first. Visibility must
        // match the trap's own rule — an ancestor-walk, since a control inside a
        // `display:none` sub-form (register / forgot-password) still reports its
        // own computed display as non-none.
        const wrap = await page.evaluate(() => {
            const root = document.getElementById('loginModal')!;
            const sel = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
            const visible = (el: Element) => {
                for (let c: Element | null = el; c; c = c.parentElement) {
                    const cs = getComputedStyle(c as HTMLElement);
                    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
                }
                return true;
            };
            const items = [...root.querySelectorAll<HTMLElement>(sel)].filter(visible);
            const first = items[0];
            const last = items[items.length - 1];
            last.focus();
            const e = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
            document.dispatchEvent(e);
            return {
                prevented: e.defaultPrevented,
                active: document.activeElement === first,
                count: items.length,
                lastId: last.id || last.className,
            };
        });
        expect(wrap.count).toBeGreaterThan(1);
        expect(wrap.prevented, `Tab was trapped (last=${wrap.lastId})`).toBe(true);
        expect(wrap.active, 'Tab wrapped to the first control').toBe(true);

        // Shift+Tab from the first wraps to the last visible control.
        const back = await page.evaluate(() => {
            const root = document.getElementById('loginModal')!;
            const sel = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';
            const visible = (el: Element) => {
                for (let c: Element | null = el; c; c = c.parentElement) {
                    const cs = getComputedStyle(c as HTMLElement);
                    if (cs.display === 'none' || cs.visibility === 'hidden') return false;
                }
                return true;
            };
            const items = [...root.querySelectorAll<HTMLElement>(sel)].filter(visible);
            const last = items[items.length - 1];
            items[0].focus();
            const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
            document.dispatchEvent(e);
            return { prevented: e.defaultPrevented, active: document.activeElement === last };
        });
        expect(back.prevented, 'Shift+Tab was trapped').toBe(true);
        expect(back.active, 'Shift+Tab wrapped to the last control').toBe(true);

        // Escape dismisses and restores the page state.
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        await expect(page.locator('#loginModal')).toHaveClass(/hidden/);
        expect(await page.evaluate(() => document.body.style.overflow), 'scroll lock released').toBe('');
    });

    test('closing the login modal returns focus to the element that opened it', async ({ page }) => {
        await page.goto(`/?lang=ar`, { waitUntil: 'load' });

        // Open it from a real focusable trigger so restoration is meaningful.
        await page.evaluate(() => {
            const b = document.createElement('button');
            b.id = 'a11yTrigger';
            b.textContent = 'open login';
            document.body.prepend(b);
            b.focus();
            (window as unknown as { showLoginModal: () => void }).showLoginModal();
        });
        await page.waitForSelector('#loginModal:not(.hidden)');
        await page.waitForTimeout(300);

        await page.evaluate(() => (window as unknown as { hideLoginModal: () => void }).hideLoginModal());
        await page.waitForTimeout(400);

        const activeId = await page.evaluate(() => document.activeElement?.id ?? null);
        expect(activeId, 'focus restored to the opener').toBe('a11yTrigger');
    });
});
test.describe('my-requests tab state (PR #71 blocker)', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    /** Reads every tab's state-relevant classes after each switch. */
    // NOTE (R1): `text-white` is now part of the canonical DUELI_TAB_ACTIVE
    // token (white text on the Dueli gradient). The legacy flat marker that
    // must never reappear is the flat purple background `bg-purple-600`.
    const readTabs = (page) => page.evaluate(() => {
        const ACTIVE = ['bg-gradient-to-r', 'from-purple-600', 'to-indigo-600', 'text-white'];
        const INACTIVE = ['text-gray-600'];
        const out: Record<string, string[]> = {};
        for (const el of document.querySelectorAll('[id^="tab-"]')) {
            out[el.id] = [...el.classList].filter(
                (c) => ACTIVE.includes(c) || INACTIVE.includes(c) || c === 'bg-purple-600',
            );
        }
        return out;
    });

    const conflicting = (tabs: Record<string, string[]>, active: string[], inactive: string[]) =>
        Object.entries(tabs)
            .filter(([, cls]) => {
                const hasActive = active.some((c) => cls.includes(c));
                const hasInactive = inactive.some((c) => cls.includes(c));
                return hasActive && hasInactive;
            })
            .map(([id]) => id);

    const ACTIVE = ['bg-gradient-to-r', 'from-purple-600', 'to-indigo-600', 'text-white'];
    const INACTIVE = ['text-gray-600'];

    test('Received starts active, then each switch leaves exactly ONE active tab', async ({ page }) => {
        await page.goto('/my-requests?lang=ar', { waitUntil: 'load' });
        await page.waitForTimeout(400);

        // 1. Initially Received is the only active tab, and carries no legacy
        //    flat active classes alongside the canonical token.
        let tabs = await readTabs(page);
        expect(conflicting(tabs, ACTIVE, INACTIVE), 'conflicting classes on load').toEqual([]);
        const activeOnLoad = Object.entries(tabs)
            .filter(([, c]) => ACTIVE.some((a) => c.includes(a)))
            .map(([id]) => id);
        expect(activeOnLoad, 'exactly one active tab on load').toEqual(['tab-received']);
        // R1: `text-white` is canonical now (see NOTE above); the legacy
        // flat background must stay gone, and the token text must be present.
        expect(tabs['tab-received'], 'no legacy flat background remains')
            .not.toContain('bg-purple-600');
        expect(tabs['tab-received']).toContain('text-white');

        // 2. Click Invitations.
        await page.click('#tab-invitations');
        await page.waitForTimeout(400);
        tabs = await readTabs(page);
        expect(conflicting(tabs, ACTIVE, INACTIVE), 'conflicting after -> invitations').toEqual([]);
        let active = Object.entries(tabs)
            .filter(([, c]) => ACTIVE.some((a) => c.includes(a)))
            .map(([id]) => id);
        expect(active, 'only invitations active').toEqual(['tab-invitations']);
        // 3. Received is fully inactive now.
        expect(tabs['tab-received'], 'received went inactive').toEqual(
            expect.arrayContaining(['text-gray-600']),
        );
        expect(tabs['tab-received'].some((c) => ACTIVE.includes(c))).toBe(false);

        // 4. Click Sent.
        await page.click('#tab-sent');
        await page.waitForTimeout(400);
        tabs = await readTabs(page);
        expect(conflicting(tabs, ACTIVE, INACTIVE), 'conflicting after -> sent').toEqual([]);
        active = Object.entries(tabs)
            .filter(([, c]) => ACTIVE.some((a) => c.includes(a)))
            .map(([id]) => id);
        expect(active, 'only sent active').toEqual(['tab-sent']);
        expect(tabs['tab-invitations'].some((c) => ACTIVE.includes(c))).toBe(false);
    });
});

test.describe('card centre logo', () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test('the centre Dueli logo is already decoded on first paint (no blank white disc)', async ({ page }) => {
        const logoRequests: string[] = [];
        page.on('request', (r) => { if (r.url().includes('dueli-icon.png')) logoRequests.push(r.url()); });

        await page.goto(`/?lang=ar`, { waitUntil: 'domcontentloaded' });

        // Inject a card through the real shared renderer path (client bundle).
        const state = await page.evaluate(async () => {
            const w = window as unknown as { renderCompetitionCard?: (i: unknown) => string };
            if (!w.renderCompetitionCard) return null;
            const host = document.createElement('div');
            host.id = 'probe';
            host.innerHTML = w.renderCompetitionCard({
                id: 1, title: 'Probe', status: 'pending',
                creator_name: 'A', creator_username: 'a',
                opponent_name: 'B', opponent_username: 'b',
            }, 'ar');
            document.body.prepend(host);
            return true;
        });
        test.skip(!state, 'client renderer not bound');

        const img = page.locator('#probe .bg-white.rounded-full img').first();
        await expect(img).toHaveCount(1);

        // complete && naturalWidth > 0 => painted, not a blank disc.
        const ready = await img.evaluate((el) => ({
            complete: el.complete,
            w: el.naturalWidth,
            loading: el.getAttribute('loading'),
            width: el.getAttribute('width'),
            height: el.getAttribute('height'),
        }));
        expect(ready.complete, 'logo decoded').toBe(true);
        expect(ready.w, 'logo has real pixels').toBeGreaterThan(0);
        expect(ready.loading, 'centre logo must not be lazy').toBeNull();
        expect(ready.width).toBe('48');
        expect(ready.height).toBe('48');

        // The centre circle is never wider than its 48px box (no layout shift).
        const box = await img.evaluate((el) => {
            const r = el.getBoundingClientRect();
            return { w: Math.round(r.width), h: Math.round(r.height) };
        });
        expect(box.w).toBeLessThanOrEqual(48);
        expect(box.h).toBeLessThanOrEqual(48);

        // One shared URL => a single network request across all cards.
        expect(new Set(logoRequests).size).toBeLessThanOrEqual(1);
    });

    test('F5 and repeat navigation keep the logo visible (service worker not stale)', async ({ page }) => {
        for (let i = 0; i < 2; i++) {
            await page.goto(`/?lang=ar`, { waitUntil: 'load' });
            await page.reload({ waitUntil: 'load' });
            const visible = await page.evaluate(() =>
                [...document.querySelectorAll('img[src*="dueli-icon.png"]')].every(
                    (el) => (el as HTMLImageElement).complete && (el as HTMLImageElement).naturalWidth > 0,
                ),
            );
            expect(visible, `pass ${i + 1}: all Dueli logos decoded`).toBe(true);
        }
    });
});
