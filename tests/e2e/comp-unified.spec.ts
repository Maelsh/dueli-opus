import { expect, test, chromium } from '@playwright/test';
import type { Cookie } from '@playwright/test';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addRequestCookies,
  clearRequestCookies,
  requestCookies,
  sessionTokenFromApiResponse,
} from './helpers/session';

// Page globals (global lexical bindings of the competition inline script).
declare const p2p: { isP2PConnected(): boolean } | null | undefined;

/**
 * R4-COMP-UNIFIED-1 — unified-page acceptance (bounded, single attempt).
 *
 * Host + guest run the COMPETITOR flow on /competition/:id itself (P2P via
 * the shared bundle classes, host-only original-design recording), while a
 * third user watches the same page (PR108 chunk player). Then the host ends
 * from the same page (single finalize) and the audience replays VOD.
 *
 * GATING (same honesty contract as row 25): needs the local ffmpeg double
 * (FFMPEG_STUB_URL) with .dev.vars pointing the proxy at it. Without the
 * stub → BLOCKED evidence + skip. One attempt only; env flakes are absorbed
 * once via reload, then reported.
 */
test.describe('R4-COMP-UNIFIED-1 unified competition page', () => {
  test.setTimeout(300000);

  test('competitors live + audience watches + end + VOD on /competition/:id', async ({ request }, testInfo) => {
    if (testInfo.project.name !== 'en') test.skip(true, 'locale-independent; runs once (en)');
    const stubBase = process.env.FFMPEG_STUB_URL || '';
    const evidence: Record<string, unknown> = {
      startedAt: new Date().toISOString(), project: testInfo.project.name, stubBase: stubBase || null,
    };
    const blocked = (reason: string) => {
      evidence.verdict = 'BLOCKED';
      evidence.reason = reason;
      writeFileSync(join(process.cwd(), 'tests/e2e/comp-unified.evidence.json'), JSON.stringify(evidence, null, 2));
      test.skip(true, `BLOCKED: ${reason}`);
    };
    if (!stubBase) return blocked('no FFMPEG_STUB_URL — local ffmpeg double required');
    try {
      const h = await fetch(`${stubBase}/health`);
      if (!h.ok) return blocked('ffmpeg stub unreachable');
    } catch {
      return blocked('ffmpeg stub unreachable');
    }

    const baseURL = 'http://127.0.0.1:4173';
    const TAG = `compun-${Date.now().toString(36)}`;
    const H = { name: 'Unified Host', email: `${TAG}-h@example.test`, password: 'CompUni123!' };
    const G = { name: 'Unified Guest', email: `${TAG}-g@example.test`, password: 'CompUni123!' };
    const V = { name: 'Unified Viewer', email: `${TAG}-v@example.test`, password: 'CompUni123!' };

    const d1 = (sql: string) =>
      execSync(`npx wrangler d1 execute dueli-db --local --command "${sql}" --json`, { stdio: 'pipe', cwd: process.cwd() });
    const apiPost = async (url: string, data?: unknown, token?: string, retries = 1): Promise<any> => {
      const headers: Record<string, string> = { 'X-CSRF-Token': '1', Origin: baseURL };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      try {
        return await request.post(url, { data, headers });
      } catch (e) {
        // Cold dev-server socket flakes during boot — one bounded retry.
        if (retries <= 0) throw e;
        await new Promise((r) => setTimeout(r, 5000));
        return apiPost(url, data, token, retries - 1);
      }
    };
    for (const u of [H, G, V]) {
      const res = await apiPost('/api/auth/register', { name: u.name, email: u.email, password: u.password, country: 'EG' });
      expect(res.status(), `register ${u.email}`).toBe(201);
    }
    d1(`UPDATE users SET is_verified = 1 WHERE email LIKE '${TAG}-%@example.test'`);
    const login = async (u: typeof H) => {
      await clearRequestCookies(request);
      const res = await apiPost('/api/auth/login', { email: u.email, password: u.password });
      expect(res.ok(), `login ${u.email}`).toBeTruthy();
      const data = ((await res.json()) as any)?.data ?? {};
      const cookies = await requestCookies(request);
      await clearRequestCookies(request);
      return {
        id: data.user.id as number,
        token: sessionTokenFromApiResponse(res),
        cookies,
      };
    };
    const host = await login(H);
    const guest = await login(G);
    const viewer = await login(V);

    const createRes = await apiPost('/api/competitions', { title: 'UNIFIED media', rules: 'be kind', category_id: 1 }, host.token);
    expect(createRes.status(), 'competition create').toBe(201);
    const compId = (((await createRes.json()) as any)?.data?.id) as number;
    evidence.competitionId = compId;
    expect((await apiPost(`/api/competitions/${compId}/invite`, { invitee_id: guest.id }, host.token)).status()).toBe(200);
    expect((await apiPost(`/api/competitions/${compId}/accept-invite`, {}, guest.token)).status()).toBe(200);
    expect((await apiPost(`/api/competitions/${compId}/start`, {}, host.token)).status()).toBe(200);

    const stubState = async () => ((await (await fetch(`${stubBase}/state?comp=${compId}`)).json()) as any);

    const browser = await chromium.launch({
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    });
    try {
      const ctxFor = async (cookies: Cookie[]) => {
        const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], ignoreHTTPSErrors: true });
        await addRequestCookies(ctx, cookies);
        return ctx;
      };
      const forwardUploads = async (page: any) => {
        await page.route('https://maelshpro.com/ffmpeg/**', async (route: any) => {
          const req = route.request();
          const target = stubBase + req.url().slice('https://maelshpro.com/ffmpeg'.length);
          const headers: Record<string, string> = {};
          const ct = req.headers()['content-type'];
          if (ct) headers['content-type'] = ct;
          const resp = await fetch(target, {
            method: req.method(), headers,
            body: req.method() === 'POST' ? req.postDataBuffer() : undefined,
          });
          const buf = Buffer.from(await resp.arrayBuffer());
          await route.fulfill({
            status: resp.status,
            headers: { 'content-type': resp.headers.get('content-type') || 'application/json' },
            body: buf,
          });
        });
      };

      const hctx = await ctxFor(host.cookies);
      const gctx = await ctxFor(guest.cookies);
      const hp = await hctx.newPage();
      const gp = await gctx.newPage();
      const notes: string[] = [];
      for (const [label, p] of [['host', hp], ['guest', gp]] as const) {
        p.on('pageerror', (e: any) => notes.push(`[${label} pageerror] ${String(e).slice(0, 200)}`));
      }
      await forwardUploads(hp);
      // Competitors stay on the UNIFIED page (compat /live link untouched).
      await hp.goto(`/competition/${compId}?lang=en`);
      await gp.goto(`/competition/${compId}?lang=en`);

      const connected = () => typeof p2p !== 'undefined' && p2p !== null && (p2p as any).isP2PConnected() === true;
      const waitConnected = async () => {
        await expect.poll(async () => hp.evaluate(connected), { timeout: 90000 }).toBe(true);
        await expect.poll(async () => gp.evaluate(connected), { timeout: 90000 }).toBe(true);
      };
      try {
        await waitConnected();
      } catch (e) {
        evidence.notes = notes.slice(-20);
        evidence.verdict = 'FAIL-connect';
        writeFileSync(join(process.cwd(), 'tests/e2e/comp-unified.evidence.json'), JSON.stringify(evidence, null, 2));
        throw e;
      }

      // Host records on the unified page; wait for ≥2 uploaded chunks.
      await expect.poll(async () => ((await stubState()).chunks as number[]).length, { timeout: 90000 }).toBeGreaterThanOrEqual(2);

      // Viewer watches the SAME unified page (PR108 chunk player).
      const vctx = await ctxFor(viewer.cookies);
      const vp = await vctx.newPage();
      await vp.goto(`/competition/${compId}?lang=en`);
      const mediaState = () => (window as any).__mediaState;
      await expect.poll(async () => vp.evaluate(mediaState), { timeout: 90000 }).toBe('playing');
      const seen = await vp.evaluate(() => {
        const vs = ['embeddedVideoPlayer1', 'embeddedVideoPlayer2']
          .map((id) => document.getElementById(id) as HTMLVideoElement | null)
          .filter((v) => !!v) as HTMLVideoElement[];
        let frames = 0;
        let width = 0;
        for (const v of vs) {
          const q = (v as any).getVideoPlaybackQuality ? (v as any).getVideoPlaybackQuality() : {};
          frames = Math.max(frames, q.totalVideoFrames || 0);
          width = Math.max(width, v.videoWidth || 0);
        }
        return { frames, width };
      });
      evidence.liveAudience = seen;
      expect(seen.frames, 'audience decoded frames').toBeGreaterThan(0);
      expect(seen.width, 'composite width (both competitors)').toBe(1280);

      // Host ends from the unified page: single finalize → completed → VOD.
      const finBefore = ((await stubState()).finalizeCalls as number) || 0;
      hp.on('dialog', (d: any) => d.accept());
      await hp.evaluate(() => (window as any).endStream());
      await expect.poll(async () => {
        const c = (((await (await request.get(`/api/competitions/${compId}`)).json()) as any)?.data ?? {}) as any;
        return c.status;
      }, { timeout: 30000 }).toBe('completed');
      await vp.waitForTimeout(4000);
      expect(((await stubState()).finalizeCalls as number) - finBefore, 'finalize exactly once').toBe(1);

      await vp.goto(`/competition/${compId}?lang=en`);
      await expect.poll(async () => vp.evaluate(mediaState), { timeout: 60000 }).toBe('ready');
      // 'ready' fires when playback starts — wait for actual decoded frames.
      const vodFrames = () => vp.evaluate(() => {
        const v = document.getElementById('embeddedVideoPlayer1') as HTMLVideoElement | null;
        const q = v && (v as any).getVideoPlaybackQuality ? (v as any).getVideoPlaybackQuality() : {};
        return q.totalVideoFrames || 0;
      });
      await expect.poll(vodFrames, { timeout: 30000 }).toBeGreaterThan(0);
      const vod = { frames: await vodFrames() };
      evidence.vod = vod;
      expect(vod.frames, 'VOD decoded frames').toBeGreaterThan(0);

      evidence.verdict = 'PASS';
      writeFileSync(join(process.cwd(), 'tests/e2e/comp-unified.evidence.json'), JSON.stringify(evidence, null, 2));

      await hctx.close();
      await gctx.close();
      await vctx.close();
    } finally {
      await browser.close();
    }
  });
});
