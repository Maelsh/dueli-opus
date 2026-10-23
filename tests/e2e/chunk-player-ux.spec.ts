import { expect, test, chromium } from '@playwright/test';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { clearRequestCookies, sessionTokenFromApiResponse } from './helpers/session';

// Page globals (script-scope bindings of the competition inline script,
// same access pattern as the row-26 p2p probe).
declare const embeddedCurrentPlayer: { rewindTo(i: number): Promise<void> } | null | undefined;

/**
 * R4-CHUNK-PLAYER-UX-1 — targeted browser S (single bounded attempt).
 *
 * Seeds REAL decodable media (in-browser canvas+oscillator recording →
 * stub bytes) plus D1 index rows (ready + measured durations, one
 * uploaded-unready gap slot), then drives the production unified page as
 * an unauthenticated GUEST: live join at the newest confirmed-ready chunk,
 * rewind ×2 (incl. an unready skip), return-to-live, VOD + seek, audio
 * track presence, guest access. No P2P/recording path is exercised here
 * (transport covered by row 24/26 evidence); every assert below is
 * player-UX-only.
 *
 * GATING (same honesty contract as prior S): needs the dual ffmpeg stub
 * (http for the platform proxy, https publicBase for the browser CSP) with
 * .dev.vars pointing the proxy at it. Without the stub → BLOCKED + skip.
 * Audio honesty: element-analyser energy is immeasurable in headless
 * (row-25 proven BLOCKED) — presence (audioTracks) is asserted instead.
 */
test.describe('R4-CHUNK-PLAYER-UX-1 player UX in a real browser', () => {
  test.setTimeout(600000);

  test('live edge, rewind, return-live, VOD seek, gaps, audio, guest', async ({ request }, testInfo) => {
    if (testInfo.project.name !== 'en') test.skip(true, 'runs once (en)');
    const stubHttp = process.env.FFMPEG_STUB_HTTP || '';
    const stubBase = process.env.FFMPEG_STUB_URL || '';
    const evidence: Record<string, unknown> = {
      startedAt: new Date().toISOString(), project: testInfo.project.name,
      stubHttp: stubHttp || null, stubBase: stubBase || null, legs: {},
    };
    const leg = (name: string, v: unknown) => { (evidence.legs as any)[name] = v; };
    const finish = (verdict: string, reason?: string) => {
      evidence.verdict = verdict;
      if (reason) evidence.reason = reason;
      writeFileSync(join(process.cwd(), 'tests/e2e/chunk-player-ux.evidence.json'), JSON.stringify(evidence, null, 2));
    };
    const blocked = (reason: string) => {
      finish('BLOCKED', reason);
      test.skip(true, `BLOCKED: ${reason}`);
    };
    if (!stubHttp || !stubBase) return blocked('need FFMPEG_STUB_HTTP + FFMPEG_STUB_URL (dual local double)');
    try {
      const h = await fetch(`${stubBase}/health`);
      if (!h.ok) return blocked('ffmpeg stub unreachable');
    } catch {
      return blocked('ffmpeg stub unreachable');
    }

    const baseURL = 'http://127.0.0.1:4173';
    const TAG = `pux-${Date.now().toString(36)}`;
    const apiPost = async (url: string, data?: unknown, token?: string) => {
      const headers: Record<string, string> = { 'X-CSRF-Token': '1', Origin: baseURL };
      if (token) headers['Authorization'] = `Bearer ${token}`;
      return request.post(url, { data, headers });
    };
    const d1 = (sql: string) =>
      execSync(`npx wrangler d1 execute dueli-db --local --command "${sql}" --json`, { stdio: 'pipe', cwd: process.cwd() });

    // --- users + live competition (API only) ---
    for (const [name, email] of [['Ux Host', `${TAG}-h@example.test`], ['Ux Opp', `${TAG}-o@example.test`]] as const) {
      const res = await apiPost('/api/auth/register', { name, email, password: 'PlayerUx123!', country: 'EG' });
      expect(res.status(), `register ${email}`).toBe(201);
    }
    d1(`UPDATE users SET is_verified = 1 WHERE email LIKE '${TAG}-%@example.test'`);
    const login = async (email: string) => {
      await clearRequestCookies(request);
      const res = await apiPost('/api/auth/login', { email, password: 'PlayerUx123!' });
      const data = ((await res.json()) as any)?.data ?? {};
      const token = sessionTokenFromApiResponse(res);
      await clearRequestCookies(request);
      return { id: data.user.id as number, token };
    };
    const host = await login(`${TAG}-h@example.test`);
    const opp = await login(`${TAG}-o@example.test`);
    const createRes = await apiPost('/api/competitions', { title: 'PLAYER media', rules: 'be kind', category_id: 1 }, host.token);
    expect(createRes.status(), 'competition create').toBe(201);
    const compId = (((await createRes.json()) as any)?.data?.id) as number;
    evidence.competitionId = compId;
    expect((await apiPost(`/api/competitions/${compId}/invite`, { invitee_id: opp.id }, host.token)).status()).toBe(200);
    expect((await apiPost(`/api/competitions/${compId}/accept-invite`, {}, opp.token)).status()).toBe(200);
    expect((await apiPost(`/api/competitions/${compId}/start`, {}, host.token)).status()).toBe(200);

    const browser = await chromium.launch({
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
    });
    const notes: string[] = [];
    try {
      // --- 1. record REAL media in-browser (canvas video + oscillator audio) ---
      const seedCtx = await browser.newContext({ ignoreHTTPSErrors: true });
      const seedPage = await seedCtx.newPage();
      seedPage.on('pageerror', (e: any) => notes.push(`[seed pageerror] ${String(e).slice(0, 160)}`));
      await seedPage.goto('about:blank');
      // One start/stop cycle per chunk: every blob carries its own headers
      // (standalone-decodable — probe-proven; raw timeslices are fragments).
      const blobs: { bytes: number[]; mime: string; durationMs: number }[] = [];
      const recInfo = await seedPage.evaluate(async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 320; canvas.height = 240;
        document.body.appendChild(canvas);
        const ctx2d = canvas.getContext('2d')!;
        let hue = 0;
        const drawTimer: any = setInterval(() => {
          hue = (hue + 30) % 360;
          (ctx2d as any).fillStyle = `hsl(${hue},80%,50%)`;
          ctx2d.fillRect(0, 0, 320, 240);
        }, 100);
        const vStream = (canvas as any).captureStream(15);
        const AC: any = window.AudioContext || (window as any).webkitAudioContext;
        const ac = new AC();
        await ac.resume().catch(() => undefined);
        const osc = ac.createOscillator();
        osc.frequency.value = 440;
        const dest = ac.createMediaStreamDestination();
        osc.connect(dest);
        osc.start();
        const stream = new MediaStream([...vStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        const candidates = ['video/mp4;codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm'];
        const mime = candidates.find((m) => { try { return (window as any).MediaRecorder.isTypeSupported(m); } catch { return false; } }) || '';
        const out: { bytes: number[]; durationMs: number }[] = [];
        for (let c = 0; c < 5; c++) {
          const part: Blob = await new Promise((resolve) => {
            const chunks: Blob[] = [];
            const rec = new (window as any).MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
            rec.ondataavailable = (e: any) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
            rec.onstop = () => resolve(new Blob(chunks, { type: mime || 'video/webm' }));
            rec.start();
            setTimeout(() => { try { rec.stop(); } catch {} }, 1500);
          });
          const buf = new Uint8Array(await part.arrayBuffer());
          const v = document.createElement('video');
          v.muted = true;
          document.body.appendChild(v);
          v.src = URL.createObjectURL(part);
          const dur: number = await new Promise((resolve) => {
            const to = setTimeout(() => resolve(0), 8000);
            v.onloadedmetadata = () => { clearTimeout(to); resolve(v.duration || 0); };
            v.onerror = () => { clearTimeout(to); resolve(0); };
          });
          URL.revokeObjectURL(v.src);
          v.remove();
          out.push({ bytes: Array.from(buf), durationMs: Math.round(dur * 1000) });
        }
        clearInterval(drawTimer);
        try { osc.stop(); } catch {}
        try { await ac.close(); } catch {}
        return { mime, blobs: out };
      });
      expect(recInfo.blobs.length, 'recorded blobs').toBeGreaterThanOrEqual(3);
      expect(recInfo.blobs.every((b) => b.bytes.length > 1000 && b.durationMs > 0), 'decodable with duration').toBe(true);
      const ext = recInfo.mime.includes('mp4') ? 'mp4' : 'webm';
      leg('seedMedia', { mime: recInfo.mime, ext, chunks: recInfo.blobs.length });

      // --- 2. push bytes to the stub + seed D1 index (gap at seq 3) ---
      const seqs = [1, 2, 3, 4, 5];
      for (let i = 0; i < seqs.length; i++) {
        const b = recInfo.blobs[i % recInfo.blobs.length];
        const form = new FormData();
        form.append('competition_id', String(compId));
        form.append('chunk_number', String(seqs[i]));
        form.append('extension', ext);
        form.append('chunk', new Blob([new Uint8Array(b.bytes)]), `chunk_${String(seqs[i]).padStart(4, '0')}.${ext}`);
        const up = await fetch(`${stubHttp}/upload.php`, { method: 'POST', body: form as any });
        expect(up.ok, `stub upload ${seqs[i]}`).toBe(true);
      }
      for (const seq of [1, 2, 4, 5]) {
        const b = recInfo.blobs[(seq - 1) % recInfo.blobs.length];
        d1(`INSERT INTO recording_chunks (competition_id, generation, sequence, object_path, container, bytes, duration_ms, state, created_at, updated_at) VALUES (${compId}, 1, ${seq}, 'live/match_${compId}/chunk_${String(seq).padStart(4, '0')}.${ext}', '${ext}', ${b.bytes.length}, ${b.durationMs}, 'ready', datetime('now'), datetime('now'))`);
      }
      d1(`INSERT INTO recording_chunks (competition_id, generation, sequence, object_path, container, state, created_at, updated_at) VALUES (${compId}, 1, 3, 'live/match_${compId}/chunk_0003.${ext}', '${ext}', 'uploaded', datetime('now'), datetime('now'))`);
      await seedCtx.close();

      // --- 3. guest audience on the unified page (no login) ---
      const gctx = await browser.newContext({ ignoreHTTPSErrors: true });
      const vp = await gctx.newPage();
      vp.on('pageerror', (e: any) => notes.push(`[guest pageerror] ${String(e).slice(0, 160)}`));
      await vp.goto(`/competition/${compId}?lang=en`);
      const mediaState = () => (window as any).__mediaState;
      await expect.poll(async () => vp.evaluate(mediaState), { timeout: 90000 }).toBe('playing');
      const liveProbe = await vp.evaluate(() => {
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
        const info = (document.getElementById('embeddedChunkInfo')?.textContent || '').trim();
        return { frames, width, info };
      });
      leg('liveJoin', liveProbe);
      expect(liveProbe.frames, 'live decoded frames').toBeGreaterThan(0);
      expect(liveProbe.width, 'live video width').toBeGreaterThan(0);

      // --- 4. rewind (UI wiring) + deterministic behind-state + return-to-live ---
      const liveTimeline = () => vp.evaluate(() => {
        const p: any = typeof embeddedCurrentPlayer !== 'undefined' ? embeddedCurrentPlayer : null;
        return {
          display: (document.getElementById('embeddedLiveTimeDisplay')?.textContent || '').trim(),
          globalTime: p && typeof p.getGlobalTime === 'function' ? p.getGlobalTime() : null,
          available: p && typeof p.getAvailableDuration === 'function' ? p.getAvailableDuration() : null,
          behind: p && typeof p.isBehindLive === 'function' ? p.isBehindLive() : null,
          chip: (document.getElementById('embeddedLiveChip')?.textContent || '').trim(),
        };
      });
      const isVisible = (id: string) => vp.evaluate((sel) => {
        const el = document.getElementById(sel);
        return !!el && !el.classList.contains('hidden');
      }, id);
      expect(await isVisible('embeddedRewindBtn'), 'rewind visible while playing').toBe(true);
      // UI click proves wiring (no throw); the live loop pulls forward fast,
      // so record whatever transient position follows without asserting it.
      await vp.click('#embeddedRewindBtn');
      await vp.waitForTimeout(400);
      leg('rewindUiClick', await liveTimeline());
      // Deterministic behind-state via the player API (same call the button
      // makes): rewind to 0, the loop replays 0→1→(skip 2)→3→4, and the
      // return-to-live button must appear while behind.
      await vp.evaluate(() => {
        try {
          if (typeof embeddedCurrentPlayer !== 'undefined' && embeddedCurrentPlayer) {
            return (embeddedCurrentPlayer as any).rewindTo(0);
          }
        } catch { /* surfaced by the visibility poll below */ }
        return null;
      });
      await expect.poll(async () => isVisible('embeddedLiveBtn'), { timeout: 10000 }).toBe(true);
      const behind = await liveTimeline();
      expect(behind.behind, 'player reports behind the live edge').toBe(true);
      leg('behindState', { liveBtnVisible: true, ...behind });
      await vp.click('#embeddedLiveBtn');
      await expect.poll(async () => (await liveTimeline()).behind, { timeout: 30000 }).toBe(false);
      const returned = await liveTimeline();
      expect(returned.display, 'live timeline display').toMatch(/^\d+:\d\d \/ \d+:\d\d$/);
      expect(returned.globalTime, 'global position after return').not.toBeNull();
      leg('returnToLive', returned);

      // --- 5. end → VOD + seek + audio presence + guest still fine ---
      expect((await apiPost(`/api/competitions/${compId}/end`, {}, host.token)).status()).toBe(200);
      await vp.goto(`/competition/${compId}?lang=en`);
      await expect.poll(async () => vp.evaluate(mediaState), { timeout: 90000 }).toBe('ready');
      const vodProbe = await vp.evaluate(async () => {
        const v = document.getElementById('embeddedVideoPlayer1') as HTMLVideoElement | null;
        const p: any = typeof embeddedCurrentPlayer !== 'undefined' ? embeddedCurrentPlayer : null;
        if (!v) return null;
        await new Promise((r) => setTimeout(r, 2000));
        const q = (v as any).getVideoPlaybackQuality ? (v as any).getVideoPlaybackQuality() : {};
        const audioTracks = (v as any).audioTracks ? (v as any).audioTracks.length : -1;
        const before = q.totalVideoFrames || 0;
        // Global recording length from the index timeline — never the loaded
        // chunk element's own duration.
        const globalDuration = p && typeof p.getGlobalDuration === 'function' ? p.getGlobalDuration() : 0;
        let seekOk = false;
        if (globalDuration > 2 && p && typeof p.seekTo === 'function') {
          p.seekTo(globalDuration / 2);
          await new Promise((r) => setTimeout(r, 2500));
          const q2 = (v as any).getVideoPlaybackQuality ? (v as any).getVideoPlaybackQuality() : {};
          seekOk = (q2.totalVideoFrames || 0) > before
            && typeof p.getGlobalTime === 'function' && p.getGlobalTime() > 0;
        }
        const mem = (performance as any).memory ? Math.round((performance as any).memory.usedJSHeapSize / 1048576) : -1;
        return {
          duration: v.duration, globalDuration,
          globalTime: p && typeof p.getGlobalTime === 'function' ? p.getGlobalTime() : null,
          width: v.videoWidth, frames: before, audioTracks, seekOk, heapMB: mem,
        };
      });
      leg('vod', vodProbe);
      expect(vodProbe && vodProbe.duration > 0, 'VOD element duration').toBe(true);
      expect(vodProbe && vodProbe.globalDuration > 0, 'VOD global duration').toBe(true);
      expect(vodProbe && vodProbe.frames > 0, 'VOD frames').toBe(true);
      expect(vodProbe && vodProbe.audioTracks > 0, 'VOD audio track present').toBe(true);
      expect(vodProbe && vodProbe.seekOk, 'VOD global seek works').toBe(true);

      evidence.notes = notes.slice(-20);
      finish('PASS');
      await gctx.close();
    } catch (e) {
      evidence.notes = notes.slice(-20);
      if (!evidence.verdict) finish('FAIL-throw', String((e as Error)?.message || e).slice(0, 300));
      throw e;
    } finally {
      await browser.close();
    }
  });
});
