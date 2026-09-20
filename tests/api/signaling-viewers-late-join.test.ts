/**
 * Phase 7.B — Live WebRTC viewership + late join.
 *
 * Authority stays server-side (SignalingAuthService):
 *   authenticated → participant (host/guest) or viewer (live session only)
 * Viewers are receive-only peers; a late join never drops the host↔guest link.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';

const db = new FakeD1();
function env() {
    return { DB: db } as any;
}

const IP = '10.7.2.11';

function req(path: string, method: string, sid?: string, body?: unknown) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'test',
        'X-Forwarded-For': IP,
    };
    if (sid) headers['Authorization'] = `Bearer ${sid}`;
    return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, env());
}

function get(path: string, sid?: string) {
    const headers: Record<string, string> = { 'X-CSRF-Token': 'test', 'X-Forwarded-For': IP };
    if (sid) headers['Authorization'] = `Bearer ${sid}`;
    return app.request(path, { headers }, env());
}

const session = (compId: number | string, sid: string) => get(`/api/signaling/session?competition_id=${compId}`, sid);
const poll = (compId: number | string, sid: string) => get(`/api/signaling/poll?competition_id=${compId}&since=0`, sid);
const viewerPoll = (compId: number | string, sid: string) => get(`/api/signaling/viewer/poll?competition_id=${compId}&since=0`, sid);

describe('7.B viewers / late join', () => {
    let hostId: number, guestId: number, viewerAId: number, viewerBId: number;
    let hostSid: string, guestSid: string, viewerASid: string, viewerBSid: string;
    const LIVE = 7201;
    const PENDING = 7202;

    beforeEach(async () => {
        Object.assign(db, { users: [], sessions: [], competitions: [], sseEvents: [], userSeq: 0, sseSeq: 0 });
        const users = new UserModel(db as any);
        hostId = (await users.create({ email: 'h@7b.test', username: 'h7b', display_name: 'H' })).id;
        guestId = (await users.create({ email: 'g@7b.test', username: 'g7b', display_name: 'G' })).id;
        viewerAId = (await users.create({ email: 'v1@7b.test', username: 'v1_7b', display_name: 'V1' })).id;
        viewerBId = (await users.create({ email: 'v2@7b.test', username: 'v2_7b', display_name: 'V2' })).id;
        const sessions = new SessionModel(db as any);
        hostSid = (await sessions.create({ user_id: hostId })).id;
        guestSid = (await sessions.create({ user_id: guestId })).id;
        viewerASid = (await sessions.create({ user_id: viewerAId })).id;
        viewerBSid = (await sessions.create({ user_id: viewerBId })).id;
        db.competitions.push(
            { id: LIVE, title: '7B live', creator_id: hostId, opponent_id: guestId, status: 'live', started_at: '2026-09-20 09:00:00', category_id: 1 },
            { id: PENDING, title: '7B pending', creator_id: hostId, opponent_id: guestId, status: 'pending', category_id: 1 },
        );
    });

    const viewerPeer = (id: number) => `viewer:${id}`;

    it('1. unauthenticated viewer surfaces → 401', async () => {
        expect((await session(LIVE, undefined as any)).status).toBe(401);
        expect((await req('/api/signaling/session/join', 'POST', undefined, { competition_id: LIVE })).status).toBe(401);
        expect((await viewerPoll(LIVE, undefined as any)).status).toBe(401);
    });

    it('2. authenticated unauthorized viewer (session not live) → 403 without state', async () => {
        const join = await req('/api/signaling/session/join', 'POST', viewerASid, { competition_id: PENDING });
        expect(join.status).toBe(403);
        expect((await session(PENDING, viewerASid)).status).toBe(403);
        expect((await viewerPoll(PENDING, viewerASid)).status).toBe(403);
        const body: any = await join.json();
        expect(body.success).toBe(false);
        expect(body.data).toBeUndefined();
        expect(db.sseEvents.length).toBe(0);
    });

    it('3. authorized viewer discovers the live session (role + presence + resume point)', async () => {
        const join = await req('/api/signaling/session/join', 'POST', viewerASid, { competition_id: LIVE });
        expect(join.status).toBe(200);
        const j: any = await join.json();
        expect(j.data.role).toBe('viewer');
        expect(j.data.peer).toBe(viewerPeer(viewerAId));
        expect(j.data.live).toBe(true);
        expect(j.data.competition_status).toBe('live');
        expect(j.data.presence.viewer_count).toBe(1);
        // viewer peer ids are never exposed to other viewers
        expect(j.data.presence.viewers).toEqual([]);
        expect(j.data.last_event_id).toBeGreaterThan(0);

        const state: any = await (await session(LIVE, viewerBSid)).json();
        expect(state.success).toBe(true);
        expect(state.data.role).toBe('viewer');
        expect(state.data.peer).toBe(viewerPeer(viewerBId));
        expect(state.data.presence.viewer_count).toBe(1);
        expect(state.data.presence_ttl_seconds).toBeGreaterThan(0);
    });

    it('4. viewer cannot use participant signaling privileges', async () => {
        expect((await req('/api/signaling/offer', 'POST', viewerASid, { competition_id: LIVE, payload: { sdp: 'o' } })).status).toBe(403);
        expect((await poll(LIVE, viewerASid)).status).toBe(403);
        expect(db.sseEvents.length).toBe(0);

        // A viewer answer must address a participant, never another viewer.
        const noTarget = await req('/api/signaling/answer', 'POST', viewerASid, { competition_id: LIVE, payload: { sdp: 'a' } });
        expect(noTarget.status).toBe(400);
        const badTarget = await req('/api/signaling/answer', 'POST', viewerASid, { competition_id: LIVE, to: viewerPeer(viewerBId), payload: { sdp: 'a' } });
        expect(badTarget.status).toBe(403);

        // Role claims are never authoritative: a viewer can never claim a participant role.
        expect((await req('/api/signaling/session/join', 'POST', viewerASid, { competition_id: LIVE, claimed_role: 'host' })).status).toBe(403);
        expect((await req('/api/signaling/session/join', 'POST', viewerASid, { competition_id: LIVE, claimed_role: 'guest' })).status).toBe(403);
        const verify = await req('/api/signaling/verify', 'POST', viewerASid, { session_token: viewerASid, competition_id: LIVE, claimed_role: 'guest' });
        expect(verify.status).toBe(403);
    });

    it('5. late participant discovers session + peer state without dropping the live link', async () => {
        // Host already live and connected (offer + answer exchanged).
        expect((await req('/api/signaling/session/join', 'POST', hostSid, { competition_id: LIVE })).status).toBe(200);
        expect((await req('/api/signaling/offer', 'POST', hostSid, { competition_id: LIVE, payload: { sdp: 'host-offer' } })).status).toBe(200);
        expect((await req('/api/signaling/answer', 'POST', guestSid, { competition_id: LIVE, payload: { sdp: 'guest-answer' } })).status).toBe(200);
        const eventsBefore = db.sseEvents.length;

        // Late participant joins afterwards.
        const join = await req('/api/signaling/session/join', 'POST', guestSid, { competition_id: LIVE, claimed_role: 'opponent' });
        expect(join.status).toBe(200);
        const j: any = await join.json();
        expect(j.data.role).toBe('guest');
        expect(j.data.peer).toBe('guest');
        expect(j.data.presence.host).toBe(true);
        expect(j.data.presence.guest).toBe(true);
        expect(j.data.last_event_id).toBeGreaterThan(0);

        // The existing exchange still reads back untouched, and nothing tore it down.
        const gpoll: any = await (await poll(LIVE, guestSid)).json();
        expect(gpoll.data.signals.map((s: any) => `${s.from}:${s.type}`)).toContain('host:offer');
        const hpoll: any = await (await poll(LIVE, hostSid)).json();
        expect(hpoll.data.signals.map((s: any) => `${s.from}:${s.type}`)).toContain('guest:answer');
        expect(db.sseEvents.length).toBeGreaterThan(eventsBefore);
        expect(db.sseEvents.filter((e) => e.event_type === 'session_leave').length).toBe(0);
    });

    it('6. late join never changes the server-derived role', async () => {
        // Guest claiming host → rejected, no presence written.
        expect((await req('/api/signaling/session/join', 'POST', guestSid, { competition_id: LIVE, claimed_role: 'host' })).status).toBe(403);
        expect(db.sseEvents.length).toBe(0);

        const guestJson: any = await (await req('/api/signaling/session/join', 'POST', guestSid, { competition_id: LIVE })).json();
        expect(guestJson.data.role).toBe('guest');
        expect(guestJson.data.peer).toBe('guest');

        const viewerJson: any = await (await req('/api/signaling/session/join', 'POST', viewerASid, { competition_id: LIVE })).json();
        expect(viewerJson.data.role).toBe('viewer');
        expect(viewerJson.data.peer).toBe(viewerPeer(viewerAId));

        // Signals always carry the server-derived peer, never a client-supplied one.
        const answer = await req('/api/signaling/answer', 'POST', viewerASid, { competition_id: LIVE, to: 'host', role: 'viewer', payload: { sdp: 'viewer-answer' } });
        expect(answer.status).toBe(200);
        expect((await answer.json()).data.peer).toBe(viewerPeer(viewerAId));

        const hostPollJson: any = await (await poll(LIVE, hostSid)).json();
        const viewerAnswer = hostPollJson.data.signals.find((s: any) => s.type === 'answer');
        expect(viewerAnswer.peer).toBe(viewerPeer(viewerAId));
        expect(viewerAnswer.from).toBe('viewer');
    });

    it('7. guessed / foreign competition id never reveals session state', async () => {
        const missing = await session(999999, viewerASid);
        expect(missing.status).toBe(403);
        const body: any = await missing.json();
        expect(body.data).toBeUndefined();
        expect(JSON.stringify(body)).not.toContain('presence');
        expect((await req('/api/signaling/session/join', 'POST', viewerASid, { competition_id: 'not-a-number' })).status).toBe(403);
        expect((await viewerPoll(999999, viewerASid)).status).toBe(403);
        expect((await req('/api/signaling/session/join', 'POST', viewerASid, {})).status).toBe(403);
        expect(db.sseEvents.length).toBe(0);
    });

    it('8. presence is TTL-bounded, participant-visible and cleared on leave', async () => {
        await req('/api/signaling/session/join', 'POST', viewerASid, { competition_id: LIVE });
        const second: any = await (await req('/api/signaling/session/join', 'POST', viewerBSid, { competition_id: LIVE })).json();
        expect(second.data.presence.viewer_count).toBe(2);

        const hostState: any = await (await session(LIVE, hostSid)).json();
        expect(hostState.data.presence.viewers.sort()).toEqual([viewerPeer(viewerAId), viewerPeer(viewerBId)].sort());

        const left: any = await (await req('/api/signaling/session/leave', 'POST', viewerBSid, { competition_id: LIVE })).json();
        expect(left.data.presence.viewer_count).toBe(1);

        // A stale announcement (older than the TTL) stops counting as presence.
        db.sseEvents.push({
            id: ++db.sseSeq,
            channel: `signaling:${LIVE}`,
            event_type: 'session_join',
            payload: JSON.stringify({ peer: viewerPeer(viewerBId), role: 'viewer', at: new Date(Date.now() - 120000).toISOString() }),
            created_at: new Date().toISOString(),
        });
        const afterStale: any = await (await session(LIVE, viewerASid)).json();
        expect(afterStale.data.presence.viewer_count).toBe(1);
    });

    it('9. a host offer is visible only to the viewer peer it targets', async () => {
        await req('/api/signaling/session/join', 'POST', viewerASid, { competition_id: LIVE });
        await req('/api/signaling/session/join', 'POST', viewerBSid, { competition_id: LIVE });

        const absent = await req('/api/signaling/offer', 'POST', hostSid, { competition_id: LIVE, to: viewerPeer(4242), payload: { sdp: 'to-nobody' } });
        expect(absent.status).toBe(403);

        const targeted = await req('/api/signaling/offer', 'POST', hostSid, { competition_id: LIVE, to: viewerPeer(viewerAId), payload: { sdp: 'to-a' } });
        expect(targeted.status).toBe(200);
        expect((await targeted.json()).data.to).toBe(viewerPeer(viewerAId));

        const aPoll: any = await (await viewerPoll(LIVE, viewerASid)).json();
        expect(aPoll.data.role).toBe('viewer');
        expect(aPoll.data.peer).toBe(viewerPeer(viewerAId));
        expect(aPoll.data.signals.map((s: any) => s.type)).toEqual(['offer']);
        expect(aPoll.data.signals[0].to).toBe(viewerPeer(viewerAId));
        expect(aPoll.data.signals[0].from).toBe('host');

        const bPoll: any = await (await viewerPoll(LIVE, viewerBSid)).json();
        expect(bPoll.data.signals).toEqual([]);

        // Participants do not see the viewer-addressed offer either.
        const guestPoll: any = await (await poll(LIVE, guestSid)).json();
        expect(guestPoll.data.signals).toEqual([]);
        const hostPoll: any = await (await poll(LIVE, hostSid)).json();
        expect(hostPoll.data.signals).toEqual([]);

        // Participants cannot read the viewer stream.
        expect((await viewerPoll(LIVE, guestSid)).status).toBe(403);
    });

    it('10. presence announcements never leak into the participant signal list', async () => {
        await req('/api/signaling/session/join', 'POST', hostSid, { competition_id: LIVE });
        await req('/api/signaling/session/join', 'POST', viewerASid, { competition_id: LIVE });
        const hostPollJson: any = await (await poll(LIVE, hostSid)).json();
        expect(hostPollJson.data.signals).toEqual([]);
    });

    it('11. late-join request_offer: guest and viewer ask the host, host cannot ask itself', async () => {
        await req('/api/signaling/session/join', 'POST', hostSid, { competition_id: LIVE });
        await req('/api/signaling/session/join', 'POST', viewerASid, { competition_id: LIVE });

        expect((await req('/api/signaling/request-offer', 'POST', guestSid, { competition_id: LIVE })).status).toBe(200);
        expect((await req('/api/signaling/request-offer', 'POST', viewerASid, { competition_id: LIVE, to: 'host' })).status).toBe(200);

        const hostPollJson: any = await (await poll(LIVE, hostSid)).json();
        const requests = hostPollJson.data.signals.filter((s: any) => s.type === 'request_offer');
        expect(requests.map((s: any) => s.peer)).toEqual(['guest', viewerPeer(viewerAId)]);

        // The host is the offerer — it never requests offers.
        expect((await req('/api/signaling/request-offer', 'POST', hostSid, { competition_id: LIVE })).status).toBe(403);
    });
});

