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

            // Real-browser VOD playback through the shipped inline hook. This
            // generates a short local video, wires the competition page's
            // actual `embeddedWireVodWatch`, and proves that five seconds of
            // non-paused playback reaches the authenticated history endpoint
            // once. It does not claim the full recording/chunk pipeline; that
            // path is covered separately by the chunk-player browser suite.
            await pageA.setViewportSize({ width: 1280, height: 800 });
            const vodComp = comps[7];
            let historyPosts = 0;
            const onHistoryRequest = (request: import('@playwright/test').Request) => {
                if (request.method() === 'POST' && request.url().includes(`/api/watch/history/${vodComp.id}`)) {
                    historyPosts += 1;
                }
            };
            pageA.on('request', onHistoryRequest);

            const competitionLoaded = pageA.waitForResponse(
                (r) => r.request().method() === 'GET'
                    && r.url().includes(`/api/competitions/${vodComp.id}`),
                { timeout: 30000 },
            );
            await pageA.goto(`/competition/${vodComp.id}?lang=${locale}`, { waitUntil: 'domcontentloaded' });
            await competitionLoaded;
            await expect.poll(
                () => pageA.evaluate(() => (window as any).__mediaState || null),
                { timeout: 30000 },
            ).not.toBeNull();

            const historyResponse = pageA.waitForResponse(
                (r) => r.request().method() === 'POST'
                    && r.url().includes(`/api/watch/history/${vodComp.id}`),
                { timeout: 60000 },
            );
            const media = await pageA.evaluate(async () => {
                const hook = (window as any).embeddedWireVodWatch;
                if (typeof hook !== 'function') return { error: 'embeddedWireVodWatch missing' };

                const canvas = document.createElement('canvas');
                canvas.width = 160;
                canvas.height = 120;
                canvas.style.cssText = 'position:fixed;left:0;top:0;width:160px;height:120px;z-index:9999;';
                document.body.appendChild(canvas);
                const context = canvas.getContext('2d');
                let frame = 0;
                let animationFrame = 0;
                const draw = () => {
                    if (context) {
                        context.fillStyle = `hsl(${(frame * 17) % 360}, 80%, 50%)`;
                        context.fillRect(0, 0, 160, 120);
                        context.fillStyle = '#fff';
                        context.fillRect((frame * 3) % 160, 40, 24, 24);
                    }
                    frame += 1;
                    animationFrame = requestAnimationFrame(draw);
                };
                animationFrame = requestAnimationFrame(draw);

                const stream = canvas.captureStream(15);
                const candidates = [
                    'video/webm;codecs=vp9',
                    'video/webm;codecs=vp8',
                    'video/webm',
                ];
                const mime = candidates.find((candidate) => {
                    try { return MediaRecorder.isTypeSupported(candidate); } catch { return false; }
                }) || '';
                const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
                const chunks: Blob[] = [];
                recorder.ondataavailable = (event) => {
                    if (event.data && event.data.size > 0) chunks.push(event.data);
                };
                recorder.start();
                await new Promise((resolve) => setTimeout(resolve, 6500));
                await new Promise<void>((resolve) => {
                    recorder.onstop = () => resolve();
                    recorder.stop();
                });
                cancelAnimationFrame(animationFrame);
                canvas.remove();

                const video = document.createElement('video');
                video.id = 'e2eVodVideo';
                video.muted = true;
                video.playsInline = true;
                video.style.cssText = 'position:fixed;left:0;top:0;width:320px;height:240px;z-index:9999;';
                const blob = new Blob(chunks, { type: mime || 'video/webm' });
                const loaded = new Promise<void>((resolve, reject) => {
                    video.onloadedmetadata = () => resolve();
                    video.onerror = () => reject(new Error('synthetic VOD failed to load'));
                });
                video.src = URL.createObjectURL(blob);
                document.body.appendChild(video);
                await loaded;
                hook(video);
                await video.play();
                return { mime, duration: video.duration };
            }).catch((error) => ({ error: String((error as Error)?.message || error) }));

            expect(media.error, `synthetic VOD setup: ${JSON.stringify(media)}`).toBeUndefined();
            expect(Number((media as { duration?: number }).duration)).toBeGreaterThan(5);
            expect((await historyResponse).ok(), 'the VOD history POST succeeds').toBeTruthy();

            // Exactly one report, and the server stored only the history touch:
            // no seconds and no completion claim from the player.
            await pageA.waitForTimeout(500);
            expect(historyPosts, 'one history POST per page load').toBe(1);
            const historyRow = d1query<{ rows: number; seconds: number; completed: number }>(
                `SELECT COUNT(*) AS rows, MAX(watch_duration_seconds) AS seconds, MAX(completed) AS completed
                 FROM watch_history WHERE user_id = ${idA} AND competition_id = ${vodComp.id}`,
            )[0];
            expect(historyRow.rows).toBe(1);
            expect(historyRow.seconds).toBe(0);
            expect(historyRow.completed).toBe(0);
            pageA.off('request', onHistoryRequest);

            expect(pageErrors, 'the owner profile must not raise page errors').toEqual([]);
        } finally {
            await ctxA.close();
            await ctxB.close();
            await guest.close();
        }
    });
});
