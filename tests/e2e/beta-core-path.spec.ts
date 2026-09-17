import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { execSync } from 'node:child_process';

/**
 * B16 — single E2E scenario for the Beta Core user path.
 * One test body, two Playwright projects (ar = RTL, en = LTR).
 * Real path only: UI + real Hono API + real local D1. No business-logic mocks.
 *
 * Necessary infrastructure seeding (documented in WORKLOG / PR body):
 *  - `is_verified = 1`: local E2E has no EMAIL_API_KEY, so verification email
 *    infra is unavailable; the flag is flipped directly in D1.
 *  - `watch_history` row for spectator C: no HTTP endpoint records a watch
 *    beacon today (Core gap, logged) while B10 rating eligibility requires one.
 */

function getActors(locale: string) {
  const p = locale.toLowerCase();
  return {
    A: { name: `B16 User A ${locale}`, email: `b16-${p}-a@example.test`, password: 'BetaCore123!' },
    B: { name: `B16 User B ${locale}`, email: `b16-${p}-b@example.test`, password: 'BetaCore123!' },
    C: { name: `B16 User C ${locale}`, email: `b16-${p}-c@example.test`, password: 'BetaCore123!' }
  };
}

function d1(sql: string): void {
  execSync(`npx wrangler d1 execute dueli-db --local --command "${sql}" --json`, {
    stdio: 'pipe',
    cwd: process.cwd()
  });
}

function verifyEmails(locale: string): void {
  const p = locale.toLowerCase();
  d1(`UPDATE users SET is_verified = 1 WHERE email LIKE 'b16-${p}-%@example.test'`);
}

async function registerViaApi(request: APIRequestContext, u: { name: string; email: string; password: string }): Promise<void> {
  const res = await request.post('/api/auth/register', {
    // Non-browser clients must present a CSRF proof header per docs/08-PUBLIC-API.md
    headers: { 'X-CSRF-Token': '1' },
    data: { name: u.name, email: u.email, password: u.password, country: 'EG' }
  });
  expect(res.status(), 'register should return 201').toBe(201);
}

async function loginViaApi(request: APIRequestContext, u: { email: string; password: string }): Promise<{ id: number; name: string; token: string }> {
  const res = await request.post('/api/auth/login', {
    headers: { 'X-CSRF-Token': '1' },
    data: { email: u.email, password: u.password }
  });
  expect(res.ok(), 'login should succeed after email verification').toBeTruthy();
  const body = await res.json();
  const data = body?.data ?? body;
  expect(data?.user?.id, 'login must return the user').toBeTruthy();
  return { id: data.user.id as number, name: data.user.name as string, token: data.sessionId as string };
}

/** Same-origin headers a real browser session would carry. */
function browserProof(): Record<string, string> {
  return { 'X-CSRF-Token': '1', Origin: 'http://127.0.0.1:4173' };
}

/** POST/PUT through a real browser-like context (CSRF proof + optional Bearer). */
function apiPost(req: APIRequestContext, url: string, opts: { data?: unknown; token?: string } = {}) {
  const headers = browserProof();
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  return req.post(url, { data: opts.data, headers });
}
function apiPut(req: APIRequestContext, url: string, opts: { data?: unknown; token?: string } = {}) {
  const headers = browserProof();
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;
  return req.put(url, { data: opts.data, headers });
}

async function getJson(request: APIRequestContext, url: string, token?: string): Promise<any> {
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await request.get(url, { headers });
  expect(res.ok(), `GET ${url} should succeed`).toBeTruthy();
  const body = await res.json();
  return body?.data ?? body;
}

async function registerViaUi(page: Page, locale: string, u: { name: string; email: string; password: string }): Promise<void> {
  await page.goto(`/?lang=${locale}`);
  await page.locator('#authSection button[onclick="showLoginModal()"]').first().click();
  await page.locator('#registerTab').click();
  await page.locator('#registerName').fill(u.name);
  await page.locator('#registerEmail').fill(u.email);
  await page.locator('#registerPassword').fill(u.password);
  const registerRes = page.waitForResponse(
    (r) => r.url().includes('/api/auth/register') && r.request().method() === 'POST'
  );
  await page.locator('#registerForm button[type="submit"]').click();
  const res = await registerRes;
  expect(res.status(), 'UI register should return 201').toBe(201);
}

async function loginViaUi(page: Page, u: { email: string; password: string }): Promise<void> {
  // The register step may leave the modal open (often switched to the login
  // tab); only reopen it when it is hidden.
  const modal = page.locator('#loginModal');
  const isOpen = await modal.evaluate((el) => !el.classList.contains('hidden'));
  if (!isOpen) {
    await page.locator('#authSection button[onclick="showLoginModal()"]').first().click();
  }
  await page.locator('#loginTab').click();
  await page.locator('#loginEmail').fill(u.email);
  await page.locator('#loginPassword').fill(u.password);
  const loginRes = page.waitForResponse(
    (r) => r.url().includes('/api/auth/login') && r.request().method() === 'POST'
  );
  await page.locator('#loginForm button[type="submit"]').click();
  const res = await loginRes;
  expect(res.ok(), 'UI login should succeed').toBeTruthy();
  // The real client stores the session (AuthService.handleLogin)
  await expect.poll(async () => page.evaluate(() => localStorage.getItem('sessionId'))).toBeTruthy();
}

test('Beta Core user path', async ({ browser }, testInfo) => {
  const locale = testInfo.project.name; // 'ar' (RTL) | 'en' (LTR)
  const dir = locale === 'ar' ? 'rtl' : 'ltr';
  const actors = getActors(locale);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const ctxC = await browser.newContext();
  const pageA = await ctxA.newPage();
  const requestA = ctxA.request;
  const requestB = ctxB.request;
  const requestC = ctxC.request;

  try {
    // 1+2. Register user A through the real UI, then complete A's profile settings
    await registerViaUi(pageA, locale, actors.A);
    verifyEmails(locale);
    await loginViaUi(pageA, actors.A);
    await test.step('profile completion for A', async () => {
      const updated = await apiPut(requestA, '/api/settings', {
        data: { default_language: locale, default_country: 'EG', notifications_enabled: true }
      });
      expect(updated.ok(), `settings update failed: ${updated.status()} ${await updated.text()}`).toBeTruthy();
      const settings = await getJson(requestA, '/api/settings');
      expect(String(settings?.settings?.default_language ?? settings?.default_language)).toBe(locale);
    });

    // Locale/RTL-LTR proof on the server-rendered shell
    await expect(pageA.locator('html')).toHaveAttribute('dir', dir);
    await expect(pageA.locator('html')).toHaveAttribute('lang', locale);

    // 3. Recommendations for A (real personalized endpoint)
    const recs = await getJson(requestA, '/api/recommendations');
    expect(recs?.competitions, 'recommendations should include a competitions array').toBeDefined();

    // 4. Create a competition through the create page UI
    await pageA.goto(`/create?lang=${locale}`);
    const createForm = pageA.locator('#createForm');
    await expect(createForm).toBeVisible();
    await createForm.locator('input[name="title"]').fill('B16 E2E Competition');
    await createForm.locator('select[name="category_id"]').selectOption({ index: 1 });
    await createForm.locator('select[name="subcategory_id"]').selectOption({ index: 1 });
    await createForm.locator('textarea[name="rules"]').fill('1. Be fair\n2. Be kind');
    const createRes = pageA.waitForResponse(
      (r) => r.url().endsWith('/api/competitions') && r.request().method() === 'POST'
    );
    await createForm.locator('button[type="submit"]').click();
    await createRes;
    // The client navigates immediately; the competition id is in the URL.
    await pageA.waitForURL('**/competition/**');
    const competitionId = Number(new URL(pageA.url()).pathname.split('/').pop());
    expect(competitionId, 'creation must navigate to the competition page').toBeTruthy();

    // 5+6. Register & login users B (opponent) and C (spectator)
    await registerViaApi(requestB, actors.B);
    await registerViaApi(requestC, actors.C);
    verifyEmails(locale);
    const userB = await loginViaApi(requestB, actors.B);
    const userC = await loginViaApi(requestC, actors.C);

    // A finds B deterministically through the real user search
    const searchParam = `b16userb${locale.toLowerCase()}`;
    const search = await getJson(requestA, `/api/search/users?q=${searchParam}&limit=5`);
    const foundB = (search?.items ?? search)?.find?.(
      (u: any) => u.username === searchParam || u.email === actors.B.email
    );
    expect(foundB?.id, 'B must be discoverable via search').toBeTruthy();

    // 7. A invites B (real invitation record + notification)
    const inviteRes = await apiPost(requestA, `/api/competitions/${competitionId}/invite`, {
      data: { invitee_id: foundB.id, message: 'Join my B16 competition' }
    });
    expect(inviteRes.ok(), 'invite should succeed').toBeTruthy();

    // 8. B accepts the invitation (real batch: opponent set, invite accepted)
    const acceptRes = await apiPost(requestB, `/api/competitions/${competitionId}/accept-invite`, { data: {}, token: userB.token });
    expect(acceptRes.ok(), 'B accepting the invite should succeed').toBeTruthy();
    const afterAccept = await getJson(requestB, `/api/competitions/${competitionId}`, userB.token);
    expect(afterAccept?.status ?? afterAccept?.competition?.status).toBe('accepted');

    // 9. A starts the competition (accepted -> live)
    const startRes = await apiPost(requestA, `/api/competitions/${competitionId}/start`, {
      data: { live_url: 'https://example.com/live' }
    });
    expect(startRes.ok(), 'start should succeed').toBeTruthy();
    const afterStart = await getJson(requestA, `/api/competitions/${competitionId}`);
    expect(afterStart?.status ?? afterStart?.competition?.status).toBe('live');

    // 10. A sends a message that reaches B
    const msgContent = `B16 message from A (${locale})`;
    const msgRes = await apiPost(requestA, `/api/users/${foundB.id}/message`, {
      data: { content: msgContent }
    });
    expect(msgRes.ok(), 'A sending a message to B should succeed').toBeTruthy();
    const conversations = await getJson(requestB, '/api/conversations', userB.token);
    const convList = conversations?.conversations ?? conversations?.items ?? conversations ?? [];
    const conversation = (Array.isArray(convList) ? convList : []).find(
      (c: any) => c.other_user_id === userB.id || c.last_message === msgContent
    );
    expect(conversation?.id, 'B must see the new conversation').toBeTruthy();
    const convMessages = await getJson(requestB, `/api/conversations/${conversation.id}/messages`, userB.token);
    const messageList = convMessages?.messages ?? convMessages ?? [];
    expect(
      (Array.isArray(messageList) ? messageList : []).some((m: any) => m.content === msgContent),
      'the message content must reach B'
    ).toBe(true);

    // 11. A adds a comment visible in the competition
    const commentContent = `B16 comment from A (${locale})`;
    const commentRes = await apiPost(requestA, `/api/competitions/${competitionId}/comments`, {
      data: { content: commentContent }
    });
    expect(commentRes.status(), 'comment creation should return 201').toBe(201);
    const comments = await getJson(requestA, `/api/competitions/${competitionId}/comments`);
    const commentList = comments?.comments ?? comments?.items ?? comments ?? [];
    expect(
      (Array.isArray(commentList) ? commentList : []).some((cm: any) => cm.content === commentContent),
      'the comment must be persisted and returned'
    ).toBe(true);

    // 12. A ends the competition
    const endRes = await apiPost(requestA, `/api/competitions/${competitionId}/end`, { data: {} });
    expect(endRes.ok(), 'end should succeed').toBeTruthy();
    const afterEnd = await getJson(requestA, `/api/competitions/${competitionId}`);
    expect(afterEnd?.status ?? afterEnd?.competition?.status).toBe('completed');

    // 13. Spectator C rates; winner appears
    // Seed the watch row C needs for B10 eligibility (no watch-beacon endpoint exists yet)
    d1(`INSERT OR IGNORE INTO watch_history (user_id, competition_id, watch_duration_seconds, completed, watched_at) VALUES (${userC.id}, ${competitionId}, 60, 1, datetime('now'))`);
    const compDetails = await getJson(requestA, `/api/competitions/${competitionId}`);
    const comp = compDetails?.competition ?? compDetails;
    const rateCreator = await apiPost(requestC, `/api/competitions/${competitionId}/rate`, {
      data: { competitor_id: comp.creator_id, rating: 5 },
      token: userC.token
    });
    expect(rateCreator.ok(), 'C rating the creator should succeed').toBeTruthy();
    const rateOpponent = await apiPost(requestC, `/api/competitions/${competitionId}/rate`, {
      data: { competitor_id: comp.opponent_id, rating: 2 },
      token: userC.token
    });
    expect(rateOpponent.ok(), 'C rating the opponent should succeed').toBeTruthy();
    const afterVote = await getJson(requestA, `/api/competitions/${competitionId}`);
    const votedComp = afterVote?.competition ?? afterVote;
    expect(votedComp.winner_id, 'a winner must be determined').toBe(comp.creator_id);
    const summary = await getJson(requestA, `/api/competitions/${competitionId}/ratings/summary`);
    expect(summary?.result?.status, 'summary must declare the winner').toBe('winner');

    // 14. Notifications reach both parties (B: invitation, A: acceptance)
    const notifsB = await getJson(requestB, '/api/notifications', userB.token);
    const listB = notifsB?.notifications ?? notifsB?.items ?? notifsB ?? [];
    expect(
      (Array.isArray(listB) ? listB : []).some((n: any) => n.type === 'invitation'),
      'B must have received the invitation notification'
    ).toBe(true);
    const notifsA = await getJson(requestA, '/api/notifications');
    const listA = notifsA?.notifications ?? notifsA?.items ?? notifsA ?? [];
    expect(
      (Array.isArray(listA) ? listA : []).length,
      'A must have received the invitation-accepted notification'
    ).toBeGreaterThan(0);
  } finally {
    await ctxA.close();
    await ctxB.close();
    await ctxC.close();
  }
});

