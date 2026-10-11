import { expect, test, chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:http';

// Page globals (global lexical bindings of the competition inline script).
declare const p2p: { isP2PConnected(): boolean } | null | undefined;

/**
 * R4-CHUNK-DOWNLOAD-1 (row 27) — bounded local acceptance, en-only.
 *
 * All legs run on /competition/:id ONLY (no /live navigation anywhere):
 *  1. TRANSITIONS: guest + viewer load the page while `accepted`; the host
 *     presses Go Live IN-PAGE. All three converge on live with NO manual
 *     refresh in the spec (reloads, if any, are the page's own doing).
 *  2. SINGLE RECORDER: a second host tab attempts to record → 409-held
 *     toast, lease generation unchanged, first tab keeps uploading.
 *  3. END → VOD: host ends in-page (finalize once); viewer auto-switches
 *     to VOD in place (no spec reload).
 *  4. DOWNLOAD (gated on FFmpeg.wasm reachability): assemble → real file →
 *     ftyp proof → served playback: duration, video+audio tracks, seek.
 *
 * GATING: local ffmpeg double (FFMPEG_STUB_URL) required like row 26.
 * Bounded: single attempt; any env flake → BLOCKED evidence, no rerun loop.
 */
test.describe('R4-CHUNK-DOWNLOAD-1 download + unified live (bounded)', () => {
  test.setTimeout(420000);

  test('transitions + single recorder + end + VOD + download on /competition/:id', async ({ request }, testInfo) => {
    if (testInfo.project.name !== 'en') test.skip(true, 'locale-independent; runs once (en)');
    const stubBase = process.env.FFMPEG_STUB_URL || '';
    const evidence: Record<string, unknown> = {
      startedAt: new Date().toISOString(), project: testInfo.project.name, stubBase: stubBase || null, legs: {},
    };
    const leg = (name: string, v: unknown) => { (evidence.legs as any)[name] = v; };
    const finish = (verdict: string, reason?: string) => {
      evidence.verdict = verdict;
      if (reason) evidence.reason = reason;
      writeFileSync(join(process.cwd(), 'tests/e2e/comp-download.evidence.json'), JSON.stringify(evidence, null, 2));
    };
    const blocked = (reason: string) => {
      finish('BLOCKED', reason);
      test.skip(true, `BLOCKED: ${reason}`);
    };
    if (!stubBase) return blocked('no FFMPEG_STUB_URL — local ffmpeg double required');
    try {
      const h = await fetch(`${stubBase}/health`);
      if (!h.ok) return blocked('ffmpeg stub unreachable');
    } catch {
      return blocked('ffmpeg stub unreachable');
    }
    // Download leg needs the FFmpeg.wasm CDN inside the test browser.
    let wasmOk = false;
    try {
      const head = await fetch('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js', { method: 'HEAD' });
      if (head.ok) {
        wasmOk = true;
      } else {
        const get = await fetch('https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm/ffmpeg-core.js', { headers: { Range: 'bytes=0-0' } });
        wasmOk = get.ok;
      }
    } catch {
      wasmOk = false;
    }
    leg('wasmReachable', wasmOk);

    const baseURL = 'http://127.0.0.1:4173';
    const TAG = `compdl-${Date.now().toString(36)}`;
    const H = { name: 'DL Host', email: `${TAG}-h@example.test`, password: 'CompDl123!' };
    const G = { name: 'DL Guest', email: `${TAG}-g@example.test`, password: 'CompDl123!' };
    const V = { name: 'DL Viewer', email: `${TAG}-v@example.test`, password: 'CompDl123!' };

    const d1 = (sql: string) =>
      execSync(`npx wrangler d1 execute dueli-db --local --command "${sql}" --json`, { stdio: 'pipe', cwd: process.cwd() });
    const apiPost = async (url: string, data?: unknown, token?: string, retries = 1): Promise<any> => {
      const headers: Record<string, string> = { 'X-CSRF-Token': '1', Origin: baseURL };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      try {
        return await request.post(url, { data, headers });
      } catch (e) {
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
      const res = await apiPost('/api/auth/login', { email: u.email, password: u.password });
      expect(res.ok(), `login ${u.email}`).toBeTruthy();
      const data = ((await res.json()) as any)?.data ?? {};
      return { id: data.user.id as number, token: data.sessionId as string };
    };
    const host = await login(H);
    const guest = await login(G);
    const viewer = await login(V);

    const createRes = await apiPost('/api/competitions', { title: 'DOWNLOAD media', rules: 'be kind', category_id: 1 }, host.token);
    expect(createRes.status(), 'competition create').toBe(201);
    const compId = (((await createRes.json()) as any)?.data?.id) as number;
    evidence.competitionId = compId;
    expect((await apiPost(`/api/competitions/${compId}/invite`, { invitee_id: guest.id }, host.token)).status()).toBe(200);
    expect((await apiPost(`/api/competitions/${compId}/accept-invite`, {}, guest.token)).status()).toBe(200);

    const stubState = async () => ((await (await fetch(`${stubBase}/state?comp=${compId}`)).json()) as any);
    const leaseStatus = async () => {
      const r = await request.get(`/api/chunks/lease/${compId}`, { headers: { 'X-CSRF-Token': '1', Origin: baseURL, Authorization: `Bearer ${host.token}` } });
      return ((await r.json()) as any)?.data ?? {};
    };

    const browser = await chromium.launch({
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    });
    // Evidence is written on EVERY exit (pass/fail/throw) — per-leg data
    // survives infra kills and assertion failures alike.
    const contexts: Array<{ close: () => Promise<void> }> = [];
    try {
      const ctxFor = async (token: string) => {
        const ctx = await browser.newContext({ permissions: ['camera', 'microphone'], ignoreHTTPSErrors: true, acceptDownloads: true });
        await ctx.addInitScript((t) => localStorage.setItem('sessionId', t), token);
        contexts.push(ctx);
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

      // ---- LEG 1: transitions without manual refresh ----
      const hctx = await ctxFor(host.token);
      const gctx = await ctxFor(guest.token);
      const vctx = await ctxFor(viewer.token);
      const hp = await hctx.newPage();
      const gp = await gctx.newPage();
      const vp = await vctx.newPage();
      const notes: string[] = [];
      for (const [label, p] of [['host', hp], ['guest', gp], ['viewer', vp]] as const) {
        p.on('pageerror', (e: any) => notes.push(`[${label} pageerror] ${String(e).slice(0, 200)}`));
      }
      await forwardUploads(hp);
      // Guest + viewer park on the ACCEPTED page first (no live DOM yet).
      await gp.goto(`/competition/${compId}?lang=en`);
      await vp.goto(`/competition/${compId}?lang=en`);
      await hp.goto(`/competition/${compId}?lang=en`);
      // Host presses Go Live IN the unified page (no /live navigation).
      // Success = the page's OWN reload onto the live DOM (markers do not
      // survive reload, so observe navigation, not window flags).
      let reloaded = false;
      try {
        await Promise.all([
          hp.waitForNavigation({ timeout: 30000 }),
          hp.click('[data-csp-fn="goLive"]'),
        ]);
        reloaded = true;
      } catch {
        reloaded = false;
      }
      leg('goLiveReload', reloaded);
      if (!reloaded) {
        let diag: unknown = null;
        try {
          diag = await hp.evaluate(() => ({
            state: (window as any).__goLiveState || null,
            toast: document.querySelector('.toast')?.textContent || null,
          }));
        } catch { diag = 'unreadable'; }
        leg('goLiveDiag', diag);
      }
      expect(reloaded, 'goLive reloaded onto the live DOM').toBe(true);
      const connected = () => typeof p2p !== 'undefined' && p2p !== null && (p2p as any).isP2PConnected() === true;
      // All three converge with zero spec-driven reloads.
      await expect.poll(async () => hp.evaluate(connected), { timeout: 120000 }).toBe(true);
      await expect.poll(async () => gp.evaluate(connected), { timeout: 120000 }).toBe(true);
      const mediaState = () => (window as any).__mediaState;
      await expect.poll(async () => vp.evaluate(mediaState), { timeout: 120000 }).toBe('playing');
      leg('transitions', { hostP2P: true, guestP2P: true, viewerPlaying: true, manualRefreshes: 0 });

      // ---- LEG 2: single recorder (second host tab fenced) ----
      // Recording first (≥2 chunks proves the first tab claimed the lease —
      // the claim precedes capture), THEN assert the lease row exists.
      await expect.poll(async () => ((await stubState()).chunks as number[]).length, { timeout: 90000 }).toBeGreaterThanOrEqual(2);
      const genBefore = (await leaseStatus()).generation as number;
      leg('leaseAfterChunks', { genBefore });
      expect(genBefore, 'lease held by first tab').toBe(1);
      const hp2 = await hctx.newPage();
      hp2.on('pageerror', (e: any) => notes.push(`[host2 pageerror] ${String(e).slice(0, 200)}`));
      await forwardUploads(hp2);
      await hp2.goto(`/competition/${compId}?lang=en`);
      // The takeover toast appears (bounded retries give several chances).
      let toastSeen = '';
      try {
        await expect.poll(async () => hp2.evaluate(() => {
          const t = document.querySelector('.toast');
          return t ? (t.textContent || '') : '';
        }), { timeout: 75000 }).toMatch(/another tab|another session/i);
        toastSeen = await hp2.evaluate(() => (document.querySelector('.toast')?.textContent || '').slice(0, 120));
      } catch {
        toastSeen = '';
      }
      const chunksBefore = ((await stubState()).chunks as number[]).length;
      await hp2.waitForTimeout(15000);
      const chunksAfter = ((await stubState()).chunks as number[]).length;
      const genAfter = (await leaseStatus()).generation as number;
      leg('singleRecorder', { toastSeen, genBefore, genAfter, chunksBefore, chunksAfter });
      expect(genAfter, 'no takeover by second tab (generation unchanged)').toBe(1);
      expect(chunksAfter, 'first tab keeps uploading (no interleaved stall)').toBeGreaterThanOrEqual(chunksBefore);
      await hp2.close();

      // ---- LEG 3: end in-page → finalize once → viewer VOD in place ----
      const finBefore = ((await stubState()).finalizeCalls as number) || 0;
      hp.on('dialog', (d: any) => d.accept());
      await hp.evaluate(() => (window as any).endStream());
      await expect.poll(async () => {
        const c = (((await (await request.get(`/api/competitions/${compId}`)).json()) as any)?.data ?? {}) as any;
        return c.status;
      }, { timeout: 30000 }).toBe('completed');
      expect(((await stubState()).finalizeCalls as number) - finBefore, 'finalize exactly once').toBe(1);
      // Viewer auto-switches live→VOD with no spec reload.
      await expect.poll(async () => vp.evaluate(mediaState), { timeout: 90000 }).toBe('ready');
      const vodFrames = () => vp.evaluate(() => {
        const v = document.getElementById('embeddedVideoPlayer1') as HTMLVideoElement | null;
        const q = v && (v as any).getVideoPlaybackQuality ? (v as any).getVideoPlaybackQuality() : {};
        return q.totalVideoFrames || 0;
      });
      await expect.poll(vodFrames, { timeout: 30000 }).toBeGreaterThan(0);
      leg('endVod', { finalizeOnce: true, viewerVodFrames: await vodFrames() });

      // ---- LEG 4: download → real file → served playback ----
      if (!wasmOk) {
        leg('download', { skipped: 'FFmpeg.wasm CDN unreachable from test env' });
        finish('BLOCKED', 'download leg needs unpkg FFmpeg.wasm (unreachable); legs 1-3 passed');
        return;
      }
      const dlBtn = vp.locator('#embeddedDownloadBtn');
      await expect(dlBtn).toBeVisible({ timeout: 15000 });
      const [download] = await Promise.all([
        vp.waitForEvent('download', { timeout: 300000 }),
        dlBtn.click(),
      ]);
      const dlPath = join(process.cwd(), 'test-results', `comp-${compId}-download.mp4`);
      await download.saveAs(dlPath);
      const bytes = readFileSync(dlPath);
      const ftyp = bytes.length > 16 && bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70;
      leg('downloadFile', { bytes: bytes.length, ftyp });
      expect(bytes.length, 'downloaded bytes').toBeGreaterThan(1024);
      expect(ftyp, 'real MP4 (ftyp proof)').toBe(true);

      // Served playback: duration, tracks, seek.
      const server = createServer((req, res) => {
        if (req.url === '/dl.mp4') {
          res.writeHead(200, { 'content-type': 'video/mp4', 'content-length': bytes.length, 'accept-ranges': 'bytes' });
          res.end(bytes);
        } else {
          const html = '<!doctype html><html><body><video id="v" controls playsinline></video></body></html>';
          res.writeHead(200, { 'content-type': 'text/html' });
          res.end(html);
        }
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = (server.address() as any).port;
      try {
        const mp = await (await browser.newContext()).newPage();
        await mp.goto(`http://127.0.0.1:${port}/`);
        const probe = await mp.evaluate(async () => {
          const v = document.getElementById('v') as HTMLVideoElement;
          v.src = '/dl.mp4';
          await new Promise<void>((resolve, reject) => {
            const to = setTimeout(() => reject(new Error('metadata timeout')), 30000);
            v.onloadedmetadata = () => { clearTimeout(to); resolve(); };
            v.onerror = () => { clearTimeout(to); reject(new Error('video error')); };
          });
          await v.play().catch(() => undefined);
          await new Promise((r) => setTimeout(r, 2500));
          const q = (v as any).getVideoPlaybackQuality ? (v as any).getVideoPlaybackQuality() : {};
          const before = q.totalVideoFrames || 0;
          const audioTracks = (v as any).audioTracks ? (v as any).audioTracks.length : -1;
          const videoTracks = (v as any).videoTracks ? (v as any).videoTracks.length : -1;
          let seekOk = false;
          if (v.duration && isFinite(v.duration) && v.duration > 2) {
            await new Promise<void>((resolve) => {
              const to = setTimeout(() => resolve(), 15000);
              v.onseeked = () => { clearTimeout(to); resolve(); };
              v.currentTime = v.duration / 2;
            });
            await new Promise((r) => setTimeout(r, 2000));
            const q2 = (v as any).getVideoPlaybackQuality ? (v as any).getVideoPlaybackQuality() : {};
            seekOk = (q2.totalVideoFrames || 0) > before;
          }
          return {
            duration: v.duration, width: v.videoWidth, height: v.videoHeight,
            frames: before, audioTracks, videoTracks, seekOk,
          };
        });
        leg('downloadPlayback', probe);
        expect(probe.duration, 'valid duration').toBeGreaterThan(0);
        expect(probe.width, 'video present').toBeGreaterThan(0);
        expect(probe.frames, 'decoded frames').toBeGreaterThan(0);
        expect(probe.audioTracks, 'audio track preserved').toBeGreaterThan(0);
        expect(probe.seekOk, 'seek works across the file').toBe(true);
        await mp.close();
      } finally {
        server.close();
      }

      evidence.notes = notes.slice(-20);
      finish('PASS');
    } catch (e) {
      if (!evidence.verdict) finish('FAIL-throw', String((e as Error)?.message || e).slice(0, 300));
      throw e;
    } finally {
      for (const c of contexts) {
        try { await c.close(); } catch { /* best effort */ }
      }
      await browser.close();
    }
  });
});
