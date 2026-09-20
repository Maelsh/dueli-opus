/**
 * Phase 7.C — Live WebRTC reconnect / resilience.
 *
 * Proves:
 *  1. connection failure triggers the intended reconnect path (policy mapping);
 *  2. retry behavior is bounded and deterministic;
 *  3. ICE restart / reconnect does not bypass authorization;
 *  4. signaling interruption can recover (resume point + catch-up);
 *  5. session state remains valid during reconnect;
 *  6. reconnect cannot change host/guest/viewer role;
 *  7. existing 7.B viewer / late-join behavior remains unaffected.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { SignalingReconnectPolicy, SignalingReconnectService } from '../../src/lib/services/SignalingReconnectService';
import { FakeD1 } from '../helpers/fake-d1';

const db = new FakeD1();
function env() {
    return { DB: db } as any;
}

const IP = '10.7.3.11';

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
const reconnect = (compId: number | string, sid: string, claim?: string) =>
    req('/api/signaling/reconnect', 'POST', sid, { competition_id: compId, claimed_role: claim });

describe('7.C reconnect policy (pure, bounded, deterministic)', () => {
    it('1. connection failure maps to the intended recovery action', () => {
        expect(SignalingReconnectPolicy.actionForPeerState('disconnected')).toBe('ice_restart');
        expect(SignalingReconnectPolicy.actionForPeerState('failed')).toBe('reconnect');
        expect(SignalingReconnectPolicy.actionForPeerState('closed')).toBe('reconnect');
        expect(SignalingReconnectPolicy.actionForPeerState('connected')).toBe('none');
        expect(SignalingReconnectPolicy.actionForPeerState('new')).toBe('none');
        expect(SignalingReconnectPolicy.actionForPeerState('checking')).toBe('none');
        expect(SignalingReconnectPolicy.actionForPeerState('completed')).toBe('none');
        expect(SignalingReconnectPolicy.actionForPeerState('garbage')).toBe('none');
    });

    it('2. retry schedule is bounded and deterministic (no jitter, no clock)', () => {
        const policy = new SignalingReconnectPolicy();
        expect(policy.schedule()).toEqual([1000, 2000, 4000, 8000, 15000]); // capped at maxDelayMs
        expect(policy.shouldRetry(1)).toBe(true);
        expect(policy.shouldRetry(5)).toBe(true);
        expect(policy.shouldRetry(6)).toBe(false); // bounded: stop after 5 attempts
        expect(policy.shouldRetry(0)).toBe(false);
        expect(policy.delayForAttempt(6)).toBe(0);
        // Deterministic: two instances produce identical schedules.
        expect(new SignalingReconnectPolicy().schedule()).toEqual(policy.schedule());
    });

    it('3. server-side service returns the same bounded policy to the client', async () => {
        const result = await new SignalingReconnectService(db as any).reconnect(
            { userId: 1, role: 'host', peer: 'host', competitionId: 1, competitionStatus: 'live', competitionStartedAt: null } as any,
            Date.now()
        );
        expect(result.policy).toEqual({ maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 15000 });
    });
});

describe('7.C reconnect route (authorization + recovery)', () => {
    let hostId: number, guestId: number, viewerId: number, outsiderId: number;
    let hostSid: string, guestSid: string, viewerSid: string, outsiderSid: string;
    const LIVE = 7301;
    const PENDING = 7302;

    beforeEach(async () => {
        Object.assign(db, { users: [], sessions: [], competitions: [], sseEvents: [], userSeq: 0, sseSeq: 0 });
        const users = new UserModel(db as any);
        hostId = (await users.create({ email: 'h@7c.test', username: 'h7c', display_name: 'H' })).id;
        guestId = (await users.create({ email: 'g@7c.test', username: 'g7c', display_name: 'G' })).id;
        viewerId = (await users.create({ email: 'v@7c.test', username: 'v7c', display_name: 'V' })).id;
        outsiderId = (await users.create({ email: 'o@7c.test', username: 'o7c', display_name: 'O' })).id;
        const sessions = new SessionModel(db as any);
        hostSid = (await sessions.create({ user_id: hostId })).id;
        guestSid = (await sessions.create({ user_id: guestId })).id;
        viewerSid = (await sessions.create({ user_id: viewerId })).id;
        outsiderSid = (await sessions.create({ user_id: outsiderId })).id;
        db.competitions.push(
            { id: LIVE, title: '7C live', creator_id: hostId, opponent_id: guestId, status: 'live', started_at: '2026-09-20 09:00:00', category_id: 1 },
            { id: PENDING, title: '7C pending', creator_id: hostId, opponent_id: guestId, status: 'pending', category_id: 1 },
        );
    });

    it('4. reconnect does not bypass authorization (401/403/spoofing)', async () => {
        // Unauthenticated → 401.
        expect((await reconnect(LIVE, undefined as any)).status).toBe(401);

        // Role spoofing is rejected: a viewer claiming 'host' → 403 role_mismatch.
        const spoof = await reconnect(LIVE, viewerSid, 'host');
        expect(spoof.status).toBe(403);
        expect((await spoof.json()).code).toBe('role_mismatch');

        // Host claiming 'guest' is equally rejected.
        expect((await reconnect(LIVE, hostSid, 'guest')).status).toBe(403);

        // Not eligible (pending) → 409; unknown competition → 403.
        expect((await reconnect(PENDING, hostSid)).status).toBe(409);
        expect((await reconnect(99999, hostSid)).status).toBe(403);
    });

    it('5. a failed host connection recovers: reconnect re-announces presence and returns valid state', async () => {
        // Host joins, then "drops" (presence would expire) and reconnects.
        await req('/api/signaling/session/join', 'POST', hostSid, { competition_id: LIVE });
        const res = await reconnect(LIVE, hostSid);
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.data.action).toBe('reconnect');
        // Session state stays valid: still host, still live, presence refreshed.
        expect(body.data.role).toBe('host');
        expect(body.data.peer).toBe('host');
        expect(body.data.live).toBe(true);
        expect(body.data.presence.host).toBe(true);
        expect(body.data.presence.guest).toBe(false);
        // Resume point + bounded retry contract for the client.
        expect(body.data.resumed_at_event_id).toBeGreaterThan(0);
        expect(body.data.retry_policy).toEqual({ maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 15000 });
    });

    it('6. signaling interruption can recover: signals published during the outage are still readable after reconnect', async () => {
        await req('/api/signaling/session/join', 'POST', hostSid, { competition_id: LIVE });
        await req('/api/signaling/session/join', 'POST', guestSid, { competition_id: LIVE });

        // Pre-interruption state: the guest knows the resume point.
        const before: any = await (await session(LIVE, guestSid)).json();
        const resumeAt = before.data.last_event_id;

        // Host publishes signals while the guest's signaling is "interrupted".
        await req('/api/signaling/offer', 'POST', hostSid, { competition_id: LIVE, payload: { sdp: 'pre-recovery' } });

        // Guest recovers: reconnect re-announces presence WITHOUT dropping state.
        const rec = await reconnect(LIVE, guestSid);
        expect(rec.status).toBe(200);
        const recBody: any = await rec.json();
        expect(recBody.data.role).toBe('guest');
        expect(recBody.data.peer).toBe('guest');
        expect(recBody.data.presence.host).toBe(true);
        expect(recBody.data.presence.guest).toBe(true);

        // Missed signals are still there and readable from the resume point.
        const after: any = await (await get(`/api/signaling/poll?competition_id=${LIVE}&since=${resumeAt}`, guestSid)).json();
        const kinds = after.data.signals.map((s: any) => s.type);
        expect(kinds).toContain('offer');
    });

    it('7. reconnect cannot change the host/guest/viewer role (server re-derives)', async () => {
        const hostRec: any = await (await reconnect(LIVE, hostSid)).json();
        expect(hostRec.data.role).toBe('host');
        expect(hostRec.data.peer).toBe('host');

        const guestRec: any = await (await reconnect(LIVE, guestSid)).json();
        expect(guestRec.data.role).toBe('guest');
        expect(guestRec.data.peer).toBe('guest');

        // A viewer reconnects into exactly the same derived viewer identity.
        await req('/api/signaling/session/join', 'POST', viewerSid, { competition_id: LIVE });
        const viewerRec: any = await (await reconnect(LIVE, viewerSid)).json();
        expect(viewerRec.data.role).toBe('viewer');
        expect(viewerRec.data.peer).toBe(`viewer:${viewerId}`);

        // And a role claim is only a claim — it never changes the derivation.
        const viewerClaimHost = await reconnect(LIVE, viewerSid, 'host');
        expect(viewerClaimHost.status).toBe(403);
    });

    it('8. 7.B viewer / late-join behavior remains intact after reconnect', async () => {
        // Late-joining viewer announces presence, reconnects, and the host can
        // still target it with a fresh offer visible only to that viewer peer.
        await req('/api/signaling/session/join', 'POST', viewerSid, { competition_id: LIVE });
        await reconnect(LIVE, viewerSid);
        await reconnect(LIVE, hostSid);

        const targeted = await req('/api/signaling/offer', 'POST', hostSid, { competition_id: LIVE, to: `viewer:${viewerId}`, payload: { sdp: 'after-reconnect' } });
        expect(targeted.status).toBe(200);

        const vPoll: any = await (await viewerPoll(LIVE, viewerSid)).json();
        expect(vPoll.data.role).toBe('viewer');
        expect(vPoll.data.peer).toBe(`viewer:${viewerId}`);
        expect(vPoll.data.signals.map((s: any) => s.type)).toEqual(['offer']);
        expect(vPoll.data.signals[0].from).toBe('host');

        // A guest reconnect cannot read viewer traffic, and vice versa.
        expect((await viewerPoll(LIVE, guestSid)).status).toBe(403);
        const guestView: any = await (await poll(LIVE, guestSid)).json();
        expect(guestView.data.signals).toEqual([]);

        // Late-join request_offer still reaches the host only.
        expect((await req('/api/signaling/request-offer', 'POST', guestSid, { competition_id: LIVE })).status).toBe(200);
        const hostPollJson: any = await (await poll(LIVE, hostSid)).json();
        expect(hostPollJson.data.signals.filter((s: any) => s.type === 'request_offer').length).toBe(1);
    });
});
