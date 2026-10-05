/**
 * R2-L1 — shared comments + qualified views, real-browser journey (B evidence).
 *
 * - A posts from the competition page UI; B sees it live via SSE with the
 *   correct author and count; C posts via API; all three converge on the
 *   same list/total after refresh; owner delete syncs live + persists.
 * - total_views counts each identity once (watch intent) and never moves on
 *   GET/refresh/polling; forged heartbeat bodies change nothing.
 * - ar/en (RTL/LTR), desktop + a mobile leg, keyboard submit, zero page or
 *   console errors, zero failed comment/watch API calls.
 *
 * Server matrices (>2 pages, 299/300 boundary, caps, races, day grain) live
 * in tests/api/r2-l1-watch-comments.test.ts (T evidence).
 */
import { test, expect, type APIRequestContext, type Browser, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

let actorSeq = 0;
function getActors(locale: string) {
    // Unique per worker attempt: a Playwright retry reuses the same local D1.
    const p = locale.toLowerCase();
    actorSeq += 1;
    const stamp = `${Date.now().toString(36)}${actorSeq}`;
    return {
        A: { name: `L1 User A ${locale}`, email: `l1-${p}-a-${stamp}@example.test`, username: `l1${p}a${stamp}`, session: `sess-l1-${p}-a-${stamp}` },
        B: { name: `L1 User B ${locale}`, email: `l1-${p}-b-${stamp}@example.test`, username: `l1${p}b${stamp}`, session: `sess-l1-${p}-b-${stamp}` },
        C: { name: `L1 User C ${locale}`, email: `l1-${p}-c-${stamp}@example.test`, username: `l1${p}c${stamp}`, session: `sess-l1-${p}-c-${stamp}` },
    };
}

function d1exec(sql: string): string {
    // The running miniflare holds the same sqlite file: a seeding write can
    // lose a lock race (SQLITE_BUSY). Retry briefly instead of failing the run.
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            return execSync(`npx wrangler d1 execute dueli-db --local --command "${sql}" --json`, {
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
    return parsed.flatMap((b) => b.results ?? []);
}

type Actor = { name: string; email: string; username: string; session: string; id?: number };

/**
 * Seed actors straight into D1 (verified, active, with sessions) instead of
 * register/login POSTs: auth flows are untouched by L1, and the strict
 * auth rate limit (5/15min) would 429 a retried run. All L1 contracts
 * (create/invite/comments/watch/heartbeat) still go through the real API
 * with these Bearer sessions.
 */
function seedActors(actors: { A: Actor; B: Actor; C: Actor }): void {
    // No cleanup: every attempt stamps its actors, so retried attempts never
    // collide on UNIQUE emails/sessions (deleting would fight FK graphs).
    const q = (s: string) => s.replace(/'/g, "''");
    for (const u of [actors.A, actors.B, actors.C]) {
        d1(`INSERT INTO users (email, username, password_hash, display_name, is_active, is_verified, language, country) VALUES ('${q(u.email)}', '${q(u.username)}', 'x', '${q(u.name)}', 1, 1, 'ar', 'SA')`);
        d1(`INSERT INTO sessions (id, user_id, expires_at) VALUES ('${q(u.session)}', (SELECT id FROM users WHERE email = '${q(u.email)}'), datetime('now', '+1 day'))`);
    }
}

function browserProof(token?: string): Record<string, string> {
    const h: Record<string, string> = { 'X-CSRF-Token': '1', Origin: 'http://127.0.0.1:4173' };
    if (token) h['Authorization'] = `Bearer ${token}`;
    return h;
}

async function commentTexts(page: Page): Promise<string[]> {
    return page.locator('#chatMessages').evaluate((box) =>
        (box?.textContent ?? '').split('\n').map((s) => s.trim()).filter(Boolean),
    );
}

/** Server render and client repaint may use different digit shapes (ar). */
function normDigits(s: string | null): string {
    return (s ?? '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
}

test.describe('R2-L1 shared comments + qualified views (browser)', () => {
    // One retry absorbs the known transient miniflare loopback drops
    // ("Network connection lost" with no app stack); actors are unique per
    // attempt so a retry never collides on email.
    test.describe.configure({ retries: 1 });
    test(
        'A/B/C converge on the same comments, counts and one-counted views',
        // Generous budget: two browsers + SSE + a mobile leg run long even
        // when healthy (config default is 120s).
        { timeout: 300000 },
        async ({ browser }, testInfo) => {
        const locale = testInfo.project.name;
        const dir = locale === 'ar' ? 'rtl' : 'ltr';
        const actors = getActors(locale);
        const errors: string[] = [];
        const consoleErrors: string[] = [];
        const badApi: string[] = [];

        const ctxA = await browser.newContext();
        const ctxB = await browser.newContext();
        const ctxC = await browser.newContext();
        const pageA = await ctxA.newPage();
        const pageB = await ctxB.newPage();
        for (const pg of [pageA, pageB]) {
            pg.on('pageerror', (e) => errors.push(String(e)));
            pg.on('console', (m) => {
                if (m.type() === 'error') consoleErrors.push(m.text());
            });
            pg.on('response', (r) => {
                if ((r.url().includes('/comments') || r.url().includes('/watch')) && !r.ok()) {
                    badApi.push(`${r.status()} ${r.url()}`);
                }
            });
        }
        try {
            // Seeded actors: no register/login POSTs (auth rate limits would
            // 429 a retried run); every L1 contract still goes over the API.
            seedActors(actors);
            const ids = d1query<{ id: number; email: string }>(
                `SELECT id, email FROM users WHERE email LIKE 'l1-%@example.test'`,
            );
            const idOf = (email: string): number => {
                const found = ids.find((r) => r.email === email)?.id;
                expect(found, `seeded user ${email} must exist`).toBeTruthy();
                return found as number;
            };
            const tokenA = actors.A.session;
            const tokenB = actors.B.session;
            const tokenC = actors.C.session;
            await pageA.goto(`/?lang=${locale}`, { waitUntil: 'load' });
            await pageA.evaluate((t) => localStorage.setItem('sessionId', t), tokenA);
            await pageB.goto(`/?lang=${locale}`, { waitUntil: 'load' });
            await pageB.evaluate((t) => localStorage.setItem('sessionId', t), tokenB);
            await expect(pageA.locator('html')).toHaveAttribute('dir', dir);

            // A creates a competition via the real create contract, then both
            // browsers drive the competition page (the L1-changed surface).
            const created = await ctxA.request.post(`/api/competitions?lang=${locale}`, {
                data: { title: 'L1 E2E Watch Finals', rules: '1. Be fair\n2. Be kind', category_id: 1, language: locale },
                headers: browserProof(tokenA),
            });
            expect(created.ok(), 'competition create should succeed').toBeTruthy();
            const competitionId = (await created.json())?.data?.id as number;
            expect(competitionId).toBeTruthy();
            await pageA.goto(`/competition/${competitionId}?lang=${locale}`, { waitUntil: 'load' });

            // Take the competition live (invite → accept → start) so posts
            // carry is_live and heartbeats accumulate for real.
            const tokenAX = tokenA;
            const inviteRes = await ctxA.request.post(`/api/competitions/${competitionId}/invite?lang=${locale}`, {
                data: { invitee_id: idOf(actors.B.email), message: 'Join L1' },
                headers: browserProof(tokenAX),
            });
            expect(inviteRes.ok(), 'invite should succeed').toBeTruthy();
            const tokenBX = tokenB;
            const acceptRes = await ctxB.request.post(
                `/api/competitions/${competitionId}/accept-invite?lang=${locale}`,
                { data: {}, headers: browserProof(tokenBX) },
            );
            expect(acceptRes.ok(), 'B accepting should succeed').toBeTruthy();
            const startRes = await ctxA.request.post(`/api/competitions/${competitionId}/start?lang=${locale}`, {
                data: { live_url: 'https://example.com/live' },
                headers: browserProof(tokenAX),
            });
            expect(startRes.ok(), 'start should succeed').toBeTruthy();
            await pageB.goto(`/?lang=${locale}`, { waitUntil: 'load' });
            await pageB.evaluate((t) => localStorage.setItem('sessionId', t), tokenB);
            await pageB.goto(`/competition/${competitionId}?lang=${locale}`, { waitUntil: 'load' });

            // A posts from the UI (keyboard: focus + Enter submits the form).
            const commentA = `L1 comment from A (${locale})`;
            await pageA.bringToFront();
            await pageA.locator('#commentInput').click();
            await pageA.locator('#commentInput').pressSequentially(commentA.slice(0, 12));
            await pageA.locator('#commentInput').fill(commentA);
            await expect(pageA.locator('#commentInput')).toBeFocused();
            const posted = pageA.waitForResponse(
                (r) => r.url().includes(`/api/competitions/${competitionId}/comments`) && r.request().method() === 'POST',
                { timeout: 60000 },
            );
            await pageA.keyboard.press('Enter');
            expect((await posted).status(), 'comment POST should return 201').toBe(201);
            await expect(pageA.locator('#chatMessages')).toContainText(commentA, { timeout: 15000 });
            await expect(pageA.locator('#chatMessages')).toContainText(actors.A.name);

            // B sees A's comment live over SSE — no reload.
            await expect(pageB.locator('#chatMessages')).toContainText(commentA, { timeout: 20000 });
            await expect(pageB.locator('#chatMessages')).toContainText(actors.A.name);

            // B replies from the UI; A sees it live.
            const commentB = `L1 reply from B (${locale})`;
            await pageB.bringToFront();
            await pageB.locator('#commentInput').fill(commentB);
            const postedB = pageB.waitForResponse(
                (r) => r.url().includes(`/api/competitions/${competitionId}/comments`) && r.request().method() === 'POST',
                { timeout: 60000 },
            );
            await pageB.locator('form[data-csp-fn="sendComment"] button[type="submit"]').click();
            expect((await postedB).status()).toBe(201);
            await expect(pageA.locator('#chatMessages')).toContainText(commentB, { timeout: 20000 });

            // C posts via API; both browsers converge after refresh.
            const commentC = `L1 comment from C (${locale})`;
            const cRes = await ctxC.request.post(`/api/competitions/${competitionId}/comments?lang=${locale}`, {
                data: { content: commentC },
                headers: browserProof(tokenC),
            });
            expect(cRes.status(), 'C comment should return 201').toBe(201);

            for (const pg of [pageA, pageB]) {
                await pg.reload({ waitUntil: 'load' });
                await expect(pg.locator('#chatMessages')).toContainText(commentA, { timeout: 20000 });
                await expect(pg.locator('#chatMessages')).toContainText(commentB, { timeout: 20000 });
                await expect(pg.locator('#chatMessages')).toContainText(commentC, { timeout: 20000 });
            }
            const textsA = await commentTexts(pageA);
            const textsB = await commentTexts(pageB);
            expect(textsA.join('|')).toBe(textsB.join('|'));

            // One-counted views: reloads never move the counter.
            const viewsOf = async (pg: Page): Promise<string> =>
                normDigits((await pg.locator('#statViews').textContent()) ?? '').replace(/[^\d]/g, '');
            const vA1 = await viewsOf(pageA);
            const vB1 = await viewsOf(pageB);
            expect(vA1).toBe(vB1);
            await pageA.reload({ waitUntil: 'load' });
            await pageA.reload({ waitUntil: 'load' });
            expect(await viewsOf(pageA)).toBe(vA1);

            // Owner (B) delete syncs live on the other browser and persists.
            const delRes = await ctxB.request.delete(
                `/api/competitions/${competitionId}/comments/${await commentIdOf(ctxA.request, competitionId, commentB, tokenC)}?lang=${locale}`,
                { headers: browserProof(tokenB) },
            );
            expect(delRes.ok(), 'owner delete should succeed').toBeTruthy();
            await expect(pageB.locator('#chatMessages')).not.toContainText(commentB, { timeout: 20000 });
            await pageA.reload({ waitUntil: 'load' });
            await expect(pageA.locator('#chatMessages')).not.toContainText(commentB, { timeout: 20000 });

            expect(errors).toEqual([]);
            expect(consoleErrors).toEqual([]);
            expect(badApi).toEqual([]);

            // Phase 2 (same DB, same test): forged/repeated heartbeats never
            // inflate duration or count — mobile viewport leg with an
            // anonymous viewer (guest issuance + day-dedup over the UI).
            await test.step('heartbeat forgeries and repeats never inflate (mobile)', async () => {
                const ctxM = await browser.newContext({ viewport: { width: 390, height: 844 } });
                const pageM = await ctxM.newPage();
                pageM.on('pageerror', (e) => errors.push(String(e)));
                try {
                    const hb = (body: unknown, token?: string) =>
                        ctxM.request.post(`/api/competitions/${competitionId}/watch-heartbeat?lang=${locale}`, {
                            data: body,
                            headers: browserProof(token),
                        });
                    const forged = await hb({ seconds: 99999, user_id: 1, live: true }, tokenB);
                    expect(forged.ok()).toBeTruthy();
                    const fBody = await forged.json();
                    expect(fBody?.data?.watch_seconds ?? 0).toBeLessThan(300);
                    expect(fBody?.data?.watch_eligible).toBe(false);
                    const before = fBody?.data?.watch_seconds ?? 0;
                    const replay = await hb({ seconds: 99999 }, tokenB);
                    const rBody = await replay.json();
                    // Real server seconds may tick between the two calls —
                    // the invariant is no doubling and no forgery landing.
                    expect((rBody?.data?.watch_seconds ?? 0) - before).toBeLessThanOrEqual(5);
                    expect(rBody?.data?.watch_seconds ?? 0).toBeLessThan(300);
                    expect(rBody?.data?.counted).toBe(false);

                    // Anonymous page view: the FIRST successful intent fixes
                    // the counter; the reload replays the same day-row.
                    const firstWatch = pageM.waitForResponse(
                        (r) => r.url().includes(`/api/competitions/${competitionId}/watch`) && r.request().method() === 'POST',
                        { timeout: 60000 },
                    );
                    await pageM.goto(`/competition/${competitionId}?lang=${locale}`, { waitUntil: 'load' });
                    const firstTotal = ((await (await firstWatch).json())?.data?.total_views) as number;
                    expect(firstTotal).toBeGreaterThan(0);
                    await expect(pageM.locator('#statViews')).toBeVisible({ timeout: 20000 });
                    const digits = (s: string | null) => normDigits(s).replace(/[^\d]/g, '');
                    expect(digits(await pageM.locator('#statViews').textContent())).toBe(String(firstTotal));
                    // The intent fires strictly before the heartbeat, so the
                    // first watch POST after reload is the dedup replay.
                    const secondWatch = pageM.waitForResponse(
                        (r) => r.url().includes('/watch') && r.request().method() === 'POST',
                        { timeout: 60000 },
                    );
                    await pageM.reload({ waitUntil: 'load' });
                    const secondBody = await (await secondWatch).json();
                    expect(secondBody?.data?.total_views).toBe(firstTotal);
                    expect(secondBody?.data?.counted).toBe(false);
                    expect(digits(await pageM.locator('#statViews').textContent())).toBe(String(firstTotal));
                } finally {
                    await ctxM.close();
                }
            });

            expect(errors).toEqual([]);
            expect(consoleErrors).toEqual([]);
            expect(badApi).toEqual([]);
        } finally {
            await ctxA.close();
            await ctxB.close();
            await ctxC.close();
        }

        async function commentIdOf(
            request: APIRequestContext, compId: number, content: string, token: string,
        ): Promise<number> {
            const res = await request.get(`/api/competitions/${compId}/comments?limit=100&offset=0&lang=${locale}`, {
                headers: browserProof(token),
            });
            const body = await res.json();
            const items = body?.data?.items ?? [];
            const found = items.find((c: any) => c.content === content);
            expect(found?.id, 'comment id must resolve').toBeTruthy();
            return found.id as number;
        }
        },
    );

});
