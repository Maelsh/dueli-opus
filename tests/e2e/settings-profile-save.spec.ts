import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

/**
 * UNIT32 / R4-PROFILE-SAVE-1 (P-01) — the /settings save journey in a real
 * browser.
 *
 * Before the fix the page sent `display_name` and `bio` to PUT /api/settings
 * and the endpoint answered 200 while dropping them, so the settings screen
 * reported a successful save that never happened.
 *
 * This spec walks the journey a user actually walks:
 *   1. log in and open /settings
 *   2. type a display name and a bio
 *   3. save and wait for a TRUSTED result (the response body + the toast)
 *   4. re-read the profile through the authoritative user read path
 *   5. reload /settings and prove the shown values are the persisted ones
 *   6. the failure path: a refused save shows an error and changes nothing
 *
 * Real path only: browser + real Hono API + real local D1. No mocks.
 */

function d1(sql: string): void {
    execSync(`npx wrangler d1 execute dueli-db --local --command "${sql}" --json`, {
        stdio: 'pipe',
        cwd: process.cwd()
    });
}

function actor(locale: string) {
    const p = locale.toLowerCase();
    return {
        name: `Unit32 E2E ${locale}`,
        email: `unit32-e2e-${p}@example.test`,
        password: 'Unit32E2Epass!'
    };
}

async function registerViaApi(request: APIRequestContext, u: { name: string; email: string; password: string }): Promise<void> {
    const res = await request.post('/api/auth/register', {
        headers: { 'X-CSRF-Token': '1' },
        data: { name: u.name, email: u.email, password: u.password, country: 'EG' }
    });
    expect(res.status(), 'register should return 201').toBe(201);
}

async function loginViaUi(page: Page, u: { email: string; password: string }): Promise<void> {
    await page.goto('/?lang=en');
    await page.locator('#authSection button[data-csp-fn="showLoginModal"]').first().click();
    await page.locator('#loginTab').click();
    await page.locator('#loginEmail').fill(u.email);
    await page.locator('#loginPassword').fill(u.password);
    const loginRes = page.waitForResponse(
        (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'
    );
    await page.locator('#loginForm button[type="submit"]').click();
    const res = await loginRes;
    expect(res.ok(), 'login should succeed').toBeTruthy();
    await expect.poll(async () => page.evaluate(() => Boolean((window as any).currentUser))).toBe(true);
}

test('UNIT32 / P-01 — the settings save persists the display name and the bio', async ({ page }, testInfo) => {
    const locale = testInfo.project.name;
    const u = actor(locale);

    await registerViaApi(page.request, u);
    // Local E2E has no mail infra: flip the verification flag directly.
    d1(`UPDATE users SET is_verified = 1 WHERE email = '${u.email}'`);
    await loginViaUi(page, u);

    const username = await page.evaluate(() => (window as any).currentUser?.username);
    expect(username, 'the session must expose the username').toBeTruthy();

    // 1. Open the settings page as an authenticated user.
    await page.goto('/settings?lang=en');
    const displayName = page.locator('#displayName');
    const bio = page.locator('#bio');
    await expect(displayName, 'the profile fields must be visible').toBeVisible();

    // 2. Type a new display name and bio.
    await displayName.fill('Unit32 Saved Name');
    await bio.fill('Unit32 saved bio');

    // 3. Save and wait for a TRUSTED result.
    const putRes = page.waitForResponse(
        (r) => r.url().includes('/api/settings') && r.request().method() === 'PUT'
    );
    await page.locator('#settingsContent form button[type="submit"]').click();
    const saved = await putRes;
    expect(saved.status(), 'the save must succeed').toBe(200);
    const savedBody = await saved.json();
    expect(savedBody?.success, 'the response body must confirm the save').toBe(true);
    await expect(page.locator('.toast-success'), 'a success toast must be shown').toBeVisible();

    // 4. Re-read the profile through the authoritative user read path.
    const profileRes = await page.request.get(`/api/users/${username}`);
    expect(profileRes.ok()).toBeTruthy();
    const profile = (await profileRes.json())?.data;
    expect(profile?.display_name, 'the display name must be persisted').toBe('Unit32 Saved Name');
    expect(profile?.bio, 'the bio must be persisted').toBe('Unit32 saved bio');

    // 5. Reload the page: the shown values must be the persisted ones.
    await page.reload();
    await expect(page.locator('#displayName'), 'the reloaded form must show the saved name')
        .toHaveValue('Unit32 Saved Name');
    await expect(page.locator('#bio'), 'the reloaded form must show the saved bio')
        .toHaveValue('Unit32 saved bio');

    // 6. The failure path: a refused save shows an error and changes nothing.
    await page.locator('#displayName').fill('X');
    await page.locator('#bio').fill('Unit32 rejected bio');
    const putRes2 = page.waitForResponse(
        (r) => r.url().includes('/api/settings') && r.request().method() === 'PUT'
    );
    await page.locator('#settingsContent form button[type="submit"]').click();
    const refused = await putRes2;
    expect(refused.status(), 'an invalid display name must be refused').toBe(422);
    await expect(page.locator('.toast-error'), 'an error toast must be shown').toBeVisible();

    const afterRes = await page.request.get(`/api/users/${username}`);
    const after = (await afterRes.json())?.data;
    expect(after?.display_name, 'a refused save must not change the stored name').toBe('Unit32 Saved Name');
    expect(after?.bio, 'a refused save must not change the stored bio').toBe('Unit32 saved bio');
});
