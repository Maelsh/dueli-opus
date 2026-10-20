/**
 * R4-LIVE-ENTRY-RECOVERY-REM1 (unit 28.3.1) — local preview vs publish consent.
 *
 * The adapter is the ONLY place local tracks can become RTCRtpSenders.
 * These tests drive the real adapter against a mocked peer connection and
 * pin the consent contract that the competition page relies on:
 *  - installing/replacing a preview stream creates NO sender;
 *  - publish requires a non-empty stream and is idempotent;
 *  - same-kind source swaps replace the existing sender (no renegotiation);
 *  - a new kind adds exactly one sender and asks for one renegotiation;
 *  - null detaches an existing sender instead of leaving a hidden fallback;
 *  - device stop/disconnect clears preview state and the consent flag.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { P2PConnection } from '../../src/client/services/P2PConnection';
import { setupClientHarness, okJson, setFetchHandler, MockPC, posted } from './signaling-harness';

setupClientHarness();

const clients: P2PConnection[] = [];
afterEach(async () => {
    for (const c of clients.splice(0)) {
        try { await c.disconnect(); } catch { /* ignore */ }
    }
});

interface FakeTrack {
    kind: 'audio' | 'video';
    enabled: boolean;
    stops: number;
    stop: () => void;
}

function track(kind: 'audio' | 'video'): FakeTrack {
    const t: FakeTrack = {
        kind,
        enabled: true,
        stops: 0,
        stop() { t.stops += 1; },
    };
    return t;
}

function stream(tracks: FakeTrack[]): MediaStream {
    const s = {
        getTracks: () => tracks.slice(),
        getVideoTracks: () => tracks.filter((t) => t.kind === 'video'),
        getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
        addTrack: (t: FakeTrack) => { tracks.push(t); },
        removeTrack: (t: FakeTrack) => {
            const i = tracks.indexOf(t);
            if (i >= 0) tracks.splice(i, 1);
        },
    };
    return s as unknown as MediaStream;
}

function makeClient(role: 'host' | 'opponent'): P2PConnection {
    const c = new P2PConnection({
        roomId: 'comp_7601',
        role,
        userId: role === 'host' ? 1 : 2,
        onError: () => { /* asserted via return values */ },
    });
    clients.push(c);
    return c;
}

async function joined(role: 'host' | 'opponent'): Promise<{ client: P2PConnection; pc: any }> {
    const client = makeClient(role);
    setFetchHandler(async (url) => {
        if (url.includes('/ice-servers')) return okJson({ success: true, data: { iceServers: [] } });
        if (url.includes('/api/signaling/verify')) return okJson({ valid: true });
        if (url.includes('/session/join')) return okJson({ success: true, data: { role, peer: role } });
        if (url.includes('/poll')) return okJson({ success: true, data: { role, peer: role, signals: [] } });
        return okJson({ success: true, data: {} });
    });
    await client.initialize();
    expect(await client.joinRoom()).toBe(true);
    const pc = MockPC.instances[MockPC.instances.length - 1];
    expect(pc).toBeTruthy();
    return { client, pc };
}

describe('R4-LIVE-ENTRY-RECOVERY-REM1 local preview never publishes', () => {
    it('1. installing a preview (camera, screen, or mix) creates zero senders', async () => {
        const { client, pc } = await joined('host');
        const video = track('video');
        const audio = track('audio');

        client.setLocalPreviewStream(stream([video, audio]), { source: 'camera' });
        expect(pc.senders.length).toBe(0);
        expect(client.isLocalPublished()).toBe(false);
        expect(client.getLocalSource()).toBe('camera');
        expect(client.hasPublishedTrack()).toBe(false);

        // Screen swap is still preview-only.
        const screen = track('video');
        client.setLocalPreviewStream(stream([screen]), { stopPrevious: false, source: 'screen' });
        expect(pc.senders.length).toBe(0);
        expect(client.getLocalSource()).toBe('screen');
        expect(client.isLocalPublished()).toBe(false);
    });

    it('2. replacing a preview stops the previous tracks only by default', async () => {
        const { client } = await joined('host');
        const first = track('video');
        client.setLocalPreviewStream(stream([first]), { source: 'camera' });

        const second = track('video');
        client.setLocalPreviewStream(stream([second]), { stopPrevious: false, source: 'screen' });
        expect(first.stops, 'stopPrevious:false keeps the prepared track').toBe(0);

        const third = track('video');
        client.setLocalPreviewStream(stream([third]), { source: 'camera' });
        expect(second.stops, 'default replacement releases the old preview').toBe(1);

        client.setLocalPreviewStream(null);
        expect(client.getLocalSource()).toBe('none');
        expect(third.stops).toBe(1);
    });

    it('3. publish refuses an empty/absent stream (honest "nothing to publish")', async () => {
        const { client, pc } = await joined('host');
        expect(client.publishLocalStream()).toBe(false);
        expect(pc.senders.length).toBe(0);

        client.setLocalPreviewStream(stream([]), { stopPrevious: false });
        expect(client.publishLocalStream()).toBe(false);
        expect(pc.senders.length).toBe(0);
        expect(client.isLocalPublished()).toBe(false);
    });

    it('4. publish attaches each track once and is idempotent', async () => {
        const { client, pc } = await joined('host');
        const video = track('video');
        const audio = track('audio');
        client.setLocalPreviewStream(stream([audio, video]), { source: 'camera' });

        expect(client.publishLocalStream()).toBe(true);
        expect(pc.senders.map((s: any) => s.track.kind).sort()).toEqual(['audio', 'video']);
        expect(client.isLocalPublished()).toBe(true);
        expect(client.hasPublishedTrack()).toBe(true);
        expect(client.hasPublishedTrack('video')).toBe(true);

        expect(client.publishLocalStream()).toBe(true);
        expect(pc.senders.length).toBe(2);
    });

    it('5. setPublishedTrack before consent is a no-op (no hidden sender)', async () => {
        const { client, pc } = await joined('host');
        client.setLocalPreviewStream(stream([track('video')]), { source: 'camera' });
        expect(await client.setPublishedTrack('video', track('video') as any)).toBe('none');
        expect(await client.setPublishedTrack('audio', track('audio') as any)).toBe('none');
        expect(pc.senders.length).toBe(0);
    });

    it('6. same-kind swap replaces the sender without adding a second one', async () => {
        const { client, pc } = await joined('host');
        client.setLocalPreviewStream(stream([track('video')]), { source: 'camera' });
        expect(client.publishLocalStream()).toBe(true);
        const sender = pc.senders[0];

        const screen = track('video');
        expect(await client.setPublishedTrack('video', screen as any)).toBe('replaced');
        expect(pc.senders.length).toBe(1);
        expect(sender.track).toBe(screen);
    });

    it('7. a new kind adds exactly one sender; null detaches instead of adding', async () => {
        const { client, pc } = await joined('host');
        client.setLocalPreviewStream(stream([track('video')]), { source: 'camera' });
        expect(client.publishLocalStream()).toBe(true);

        expect(await client.setPublishedTrack('audio', track('audio') as any)).toBe('added');
        expect(pc.senders.length).toBe(2);

        // Detaching an unknown kind adds nothing.
        expect(await client.setPublishedTrack('audio', null)).toBe('replaced');
        expect(pc.senders.length).toBe(2);
        expect(pc.senders.find((s: any) => s.track === null || s.track === undefined)).toBeTruthy();
    });

    it('8. renegotiation follows the single-offerer rule (host offers, guest requests)', async () => {
        const host = await joined('host');
        host.client.setLocalPreviewStream(stream([track('video')]), { source: 'camera' });
        expect(host.client.publishLocalStream()).toBe(true);
        const beforeOffers = host.pc.createdOffers;
        await host.client.negotiateMediaChange();
        expect(host.pc.createdOffers).toBe(beforeOffers + 1);
        expect(posted('/api/signaling/offer').length).toBe(1);

        const guest = await joined('opponent');
        await guest.client.negotiateMediaChange();
        expect(posted('/api/signaling/request-offer').length).toBe(1);
        expect(guest.pc.createdOffers, 'guest never offers').toBe(0);
    });

    it('9. stop/disconnect releases devices and re-arms the consent gate', async () => {
        const { client, pc } = await joined('host');
        const video = track('video');
        const audio = track('audio');
        client.setLocalPreviewStream(stream([video, audio]), { source: 'camera' });
        expect(client.publishLocalStream()).toBe(true);

        client.stopLocalMedia();
        expect(video.stops).toBe(1);
        expect(audio.stops).toBe(1);
        expect(client.getLocalStream()).toBeNull();
        expect(client.getLocalSource()).toBe('none');
        expect(client.isLocalPublished(), 'stopping local media re-arms consent').toBe(false);

        // Disconnect also clears consent and closes the PC.
        await client.disconnect();
        expect(client.isLocalPublished()).toBe(false);
        expect(client.getLocalSource()).toBe('none');
        expect(pc.closed).toBe(true);
    });
});
