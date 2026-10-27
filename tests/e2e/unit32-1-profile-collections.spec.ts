/**
 * UNIT32.1 / R4-PROFILE-COLLECTIONS-1 — real-browser journey.
 *
 * Seeds two verified accounts and a small competition set directly in local
 * D1 (auth flows are untouched by this unit), then walks the owner's profile:
 *   - the collections section exists for the owner only;
 *   - Watch Later pages past the first page, removes a card through its
 *     bookmark, and re-adds it from the competition page (state stays
 *     consistent across surfaces and after reload);
 *   - Viewing History opens newest-first and shows real watch metadata;
 *   - another user's session and a guest never receive the section;
 *   - the layout stays usable on a phone viewport in ar/en.
 *
 * Server matrices (owner isolation, idempotency, invalid cursors, H1/H2
 * safety) live in tests/api/unit32-1-profile-collections.test.ts.
 */
import { test, expect, type APIRequestContext } from '@playwright/test';
import { execSync } from 'node:child_process';
import { seededAuthCookies } from './helpers/session';

const ORIGIN = 'http://127.0.0.1:4173';

function d1exec(sql: string): string {
    // `wrangler ... --command` runs through cmd.exe on Windows, where a
    // multi-line argument is truncated into "incomplete input". SQL whitespace
    // is insignificant, so fold every statement to one line.
    const command = sql.replace(/\s+/g, ' ').trim();
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt += 1) {
        try {
            return execSync(`npx wrangler d1 execute dueli-db --local --command "${command}" --json`, {
                stdio: 'pipe',
                cwd: process.cwd(),
            }).toString();
        } catch (err) {
            lastError = err;
            execSync('node -e "Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 2000)"', { stdio: 'pipe' });
        }
    }
    throw lastError;
}

function d1(sql: string): void {
    d1exec(sql);
}

function d1query<T>(sql: string): T[] {
    const parsed = JSON.parse(d1exec(sql)) as Array<{ results?: T[] }>;
    return parsed.flatMap((block) => block.results ?? []);
}

const q = (value: string) => value.replace(/'/g, "''");

test.describe('UNIT32.1 — profile collections', () => {
    test.describe.configure({ retries: 1 });
    // Local wrangler + D1 is slow (each API call can take 0.5–2s); this journey
    // makes several navigations and two full cursor walks.
    test.setTimeout(300000);

    test('owner watches later, browses history and keeps state across surfaces', async ({ browser }, testInfo) => {
        const locale = testInfo.project.name;
        const dir = locale === 'ar' ? 'rtl' : 'ltr';
        const stamp = `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`;
        const actorA = {
            email: `u321-${locale}-a-${stamp}@example.test`,
            username: `u321${locale}a${stamp}`,
            name: `Collections A ${locale}`,
            session: `sess-u321-${locale}-a-${stamp}`,
        };
        const actorB = {
            email: `u321-${locale}-b-${stamp}@example.test`,
            username: `u321${locale}b${stamp}`,
            name: `Collections B ${locale}`,
            session: `sess-u321-${locale}-b-${stamp}`,
        };

        d1(`INSERT INTO users (email, username, password_hash, display_name, is_active, is_verified, language, country)
            VALUES ('${q(actorA.email)}', '${q(actorA.username)}', 'x', '${q(actorA.name)}', 1, 1, '${locale}', 'EG')`);
        d1(`INSERT INTO users (email, username, password_hash, display_name, is_active, is_verified, language, country)
            VALUES ('${q(actorB.email)}', '${q(actorB.username)}', 'x', '${q(actorB.name)}', 1, 1, '${locale}', 'EG')`);
        const users = d1query<{ id: number; email: string }>(
            `SELECT id, email FROM users WHERE email LIKE 'u321-${locale}-%${stamp}@example.test'`,
        );
        const idA = users.find((u) => u.email === actorA.email)?.id as number;
        const idB = users.find((u) => u.email === actorB.email)?.id as number;
        expect(idA).toBeTruthy();
        expect(idB).toBeTruthy();

        d1(`INSERT INTO sessions (id, user_id, expires_at) VALUES
            ('${q(actorA.session)}', ${idA}, datetime('now', '+1 day')),
            ('${q(actorB.session)}', ${idB}, datetime('now', '+1 day'))`);

        d1(`INSERT INTO categories (slug, name_ar, name_en, icon, color)
            VALUES ('u321-${locale}-${stamp}', 'عام', 'General', 'fas fa-trophy', '#8B5CF6')`);
        const categoryId = d1query<{ id: number }>(
            `SELECT id FROM categories WHERE slug = 'u321-${locale}-${stamp}'`,
        )[0].id;

        const titles = Array.from({ length: 8 }, (_, i) => `Collections ${locale} ${i + 1}`);
        d1(`INSERT INTO competitions (title, rules, category_id, creator_id, status, is_fake) VALUES
            ${titles.map((title) => `('${q(title)}', 'rules', ${categoryId}, ${idA}, 'completed', 0)`).join(',')}`);
        const comps = d1query<{ id: number; title: string }>(
            `SELECT id, title FROM competitions WHERE category_id = ${categoryId} ORDER BY id ASC`,
        );
        expect(comps.length).toBe(8);

        // Eight saved rows: newest first is 8..1, more than one page at limit 6.
        d1(`INSERT INTO watch_later (user_id, competition_id, added_at) VALUES
            ${comps.map((c, i) => `(${idA}, ${c.id}, '2026-08-0${i + 1} 10:00:00')`).join(',')}`);
        // Newest history is the highest competition id, with truthful durations.
        d1(`INSERT INTO watch_history (user_id, competition_id, watch_duration_seconds, completed, watched_at) VALUES
            (${idA}, ${comps[0].id}, 0, 0, '2026-09-01 10:00:00'),
            (${idA}, ${comps[1].id}, 125, 0, '2026-09-02 10:00:00'),
            (${idA}, ${comps[2].id}, 300, 1, '2026-09-03 10:00:00')`);

        const ctxA = await browser.newContext();
        const ctxB = await browser.newContext();
        const guest = await browser.newContext();
        await ctxA.addCookies(seededAuthCookies(actorA.session, ORIGIN));
        await ctxB.addCookies(seededAuthCookies(actorB.session, ORIGIN));
        const pageA = await ctxA.newPage();
        const pageB = await ctxB.newPage();
        const pageGuest = await guest.newPage();
        const pageErrors: string[] = [];
        pageA.on('pageerror', (e) => pageErrors.push(String(e)));

        try {
            await pageA.goto(`/profile/${encodeURIComponent(actorA.username)}?lang=${locale}`, { waitUntil: 'domcontentloaded' });
            await expect(pageA.locator('html')).toHaveAttribute('dir', dir);

            const section = pageA.locator('#profileCollections');
            await expect(section, 'the owner must see the collections section').toBeVisible();
            await expect(section).toHaveAttribute('data-owner-id', String(idA));
            await expect(pageA.locator('#collectionsTab-later')).toHaveAttribute('aria-selected', 'true');

            const laterCards = pageA.locator('#collectionLaterList .duel-card');
            await expect(laterCards).toHaveCount(6);
            const loadMore = pageA.locator('#collectionLaterMore');
            await expect(loadMore).toBeVisible();
            await loadMore.click();
            await expect(laterCards).toHaveCount(8);
            await expect(loadMore).toBeHidden();

            // Newest first: the first rendered card is competition 8.
            await expect(laterCards.first()).toHaveAttribute('data-competition-id', String(comps[7].id));

            // Viewing History is lazy, newest-first, and honest about duration.
            await pageA.locator('#collectionsTab-history').click();
            await expect(pageA.locator('#collectionPanel-history')).toBeVisible();
            const historyCards = pageA.locator('#collectionHistoryList .duel-card');
            await expect(historyCards).toHaveCount(3);
            await expect(historyCards.first()).toHaveAttribute('data-competition-id', String(comps[2].id));
            await expect(historyCards.nth(1)).toHaveAttribute('data-competition-id', String(comps[1].id));
            await expect(pageA.locator('#collectionHistoryList')).toContainText(
                locale === 'ar' ? 'مدة المشاهدة' : 'Watched for',
            );

            // Remove from Watch Later through the card bookmark; the list
            // reloads from the server instead of trusting local state.
            await pageA.locator('#collectionsTab-later').click();
            await expect(laterCards).toHaveCount(8);
            const removeRes = pageA.waitForResponse(
                (r) => r.url().includes(`/api/watch/later/${comps[7].id}`) && r.request().method() === 'DELETE',
            );
            await pageA.locator(`#collectionLaterList [data-watch-later-toggle="${comps[7].id}"]`).click();
            expect((await removeRes).ok()).toBeTruthy();
            // The server is authoritative: the list reloads at page one.
            await expect(laterCards).toHaveCount(6);
            await expect(pageA.locator(`#collectionLaterList [data-watch-later-toggle="${comps[7].id}"]`)).toHaveCount(0);
            await pageA.locator('#collectionLaterMore').click();
            await expect(laterCards).toHaveCount(7);

            // Competition page agrees; saving there restores the profile card
            // and survives reload (state is server-persisted, not in memory).
            await pageA.goto(`/competition/${comps[7].id}?lang=${locale}`, { waitUntil: 'domcontentloaded' });
            const compToggle = pageA.locator('#competitionWatchLaterBtn');
            await expect(compToggle).toHaveAttribute('data-wl-hydrated', '1');
            await expect(compToggle).toHaveAttribute('aria-pressed', 'false');
            const addRes = pageA.waitForResponse(
                (r) => r.url().includes(`/api/watch/later/${comps[7].id}`) && r.request().method() === 'POST',
            );
            await compToggle.click();
            expect((await addRes).ok()).toBeTruthy();
            await expect(compToggle).toHaveAttribute('aria-pressed', 'true');
            await pageA.reload({ waitUntil: 'domcontentloaded' });
            await expect(pageA.locator('#competitionWatchLaterBtn')).toHaveAttribute('aria-pressed', 'true');

            await pageA.goto(`/profile/${encodeURIComponent(actorA.username)}?lang=${locale}`, { waitUntil: 'domcontentloaded' });
            await expect(pageA.locator('#collectionLaterList .duel-card')).toHaveCount(6);
            await pageA.locator('#collectionLaterMore').click();
            await expect(pageA.locator('#collectionLaterList .duel-card')).toHaveCount(8);

            // Another user's session and a visitor never receive the section.
            await pageB.goto(`/profile/${encodeURIComponent(actorA.username)}?lang=${locale}`, { waitUntil: 'domcontentloaded' });
            await expect(pageB.locator('#profileCollections')).toHaveCount(0);
            await pageGuest.goto(`/profile/${encodeURIComponent(actorA.username)}?lang=${locale}`, { waitUntil: 'domcontentloaded' });
            await expect(pageGuest.locator('#profileCollections')).toHaveCount(0);

            // One phone leg: the section and both tabs remain reachable.
            await pageA.setViewportSize({ width: 390, height: 844 });
            await pageA.goto(`/profile/${encodeURIComponent(actorA.username)}?lang=${locale}`, { waitUntil: 'domcontentloaded' });
            await expect(pageA.locator('#profileCollections')).toBeVisible();
            await expect(pageA.locator('#collectionsTab-later')).toBeVisible();
            await expect(pageA.locator('#collectionsTab-history')).toBeVisible();

            expect(pageErrors, 'the owner profile must not raise page errors').toEqual([]);
        } finally {
            await ctxA.close();
            await ctxB.close();
            await guest.close();
        }
    });
});
