/**
 * R4-LIVE-INT-1 — Production signaling integration recovery.
 *
 * The production live room (/live/:id via src/client/services/P2PConnection)
 * used to speak a DEAD contract (room_id + room/join + signal + room/leave +
 * room/:id/status → 404 on every call). It now speaks the CURRENT platform
 * contract (competition_id + offer/answer/ice/poll + session join/leave +
 * reconnect), the same contract the live test pages' SignalingManager uses.
 *
 * This suite pins that recovery:
 *  A. happy path: session join → offer → poll → answer → ice → poll →
 *     request-offer → reconnect → leave, competition stays live throughout
 *     (host interruption never ends the competition, never touches
 *     started_at), refresh re-join resumes from the same session;
 *  B. role authorization: guest/viewer publish matrix, spoof rejection,
 *     401/403/409 boundaries;
 *  C. legacy-contract regression: the four dead endpoints MUST stay 404 so
 *     an old client can never silently "succeed";
 *  D. production-client source contract: the shipped P2PConnection and
 *     live-room-page must not reference the dead endpoints, must use the
 *     current ones with Bearer auth, and the client reconnect bounds must
 *     match the server SSOT (SignalingReconnectPolicy.DEFAULT).
 *
 * Out of scope here (CHUNK-PLAY-1 owns them): audience chunk playback, VOD
 * readiness, download/merge output. No real media is captured here — media
 * exchange is covered by manual S-checks with trusted devices (BLOCKED when
 * headless), never by faking a PASS from API success.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { SignalingReconnectPolicy } from '../../src/lib/services/SignalingReconnectService';
import { FakeD1 } from '../helpers/fake-d1';

const db = new FakeD1();
function env() {
    return { DB: db } as any;
}

const IP = '10.9.1.11';
function headers(sid?: string): Record<string, string> {
    const h: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'test',
        'X-Forwarded-For': IP,
    };
    if (sid) h['Authorization'] = `Bearer ${sid}`;
    return h;
}
function post(path: string, sid: string | undefined, body?: unknown) {
    return app.request(
        path,
        { method: 'POST', headers: headers(sid), body: body === undefined ? undefined : JSON.stringify(body) },
        env(),
    );
}
function get(path: string, sid?: string) {
    return app.request(path, { headers: headers(sid) }, env());
}

const COMP = 7201;
const PENDING = 7202;

describe('R4-LIVE-INT-1 production signaling integration', () => {
    let hostId: number, guestId: number, viewerId: number;
    let hostSid: string, guestSid: string, viewerSid: string;

    beforeEach(async () => {
        Object.assign(db, { users: [], sessions: [], competitions: [], sseEvents: [], userSeq: 0, sseSeq: 0 });
        const users = new UserModel(db as any);
        hostId = (await users.create({ email: 'h@live.test', username: 'hlive', display_name: 'H' })).id;
        guestId = (await users.create({ email: 'g@live.test', username: 'glive', display_name: 'G' })).id;
        viewerId = (await users.create({ email: 'v@live.test', username: 'vlive', display_name: 'V' })).id;
        const sessions = new SessionModel(db as any);
        hostSid = (await sessions.create({ user_id: hostId })).id;
        guestSid = (await sessions.create({ user_id: guestId })).id;
        viewerSid = (await sessions.create({ user_id: viewerId })).id;
        db.competitions.push(
            { id: COMP, title: 'LIVE-INT', creator_id: hostId, opponent_id: guestId, status: 'live', category_id: 1, started_at: '2026-10-09T00:00:00Z' },
            { id: PENDING, title: 'LIVE-INT-pend', creator_id: hostId, opponent_id: guestId, status: 'pending', category_id: 1 },
        );
    });

    describe('A. production join/offer/answer/ice/poll/reconnect/leave', () => {
        it('1. host + guest join the session with server-derived roles', async () => {
            const hj = await post('/api/signaling/session/join', hostSid, { competition_id: COMP, claimed_role: 'host' });
            expect(hj.status).toBe(200);
            const hjj: any = await hj.json();
            expect(hjj.data.role).toBe('host');
            expect(hjj.data.peer).toBe('host');
            const gj = await post('/api/signaling/session/join', guestSid, { competition_id: COMP, claimed_role: 'guest' });
            expect(gj.status).toBe(200);
            const gjj: any = await gj.json();
            expect(gjj.data.role).toBe('guest');
            expect(gjj.data.peer).toBe('guest');
        });

        it('2. full P2P handshake over the current endpoints (no 403/404)', async () => {
            await post('/api/signaling/session/join', hostSid, { competition_id: COMP, claimed_role: 'host' });
            await post('/api/signaling/session/join', guestSid, { competition_id: COMP, claimed_role: 'guest' });
            expect((await post('/api/signaling/offer', hostSid, { competition_id: COMP, payload: { sdp: 'host-offer' } })).status).toBe(200);
            expect((await post('/api/signaling/ice', hostSid, { competition_id: COMP, payload: { c: 'h1' } })).status).toBe(200);
            expect((await post('/api/signaling/answer', guestSid, { competition_id: COMP, payload: { sdp: 'guest-answer' } })).status).toBe(200);
            expect((await post('/api/signaling/ice', guestSid, { competition_id: COMP, payload: { c: 'g1' } })).status).toBe(200);
            // Late-join hint (guest asks host for a fresh offer) is allowed.
            expect((await post('/api/signaling/request-offer', guestSid, { competition_id: COMP })).status).toBe(200);

            const gpoll = await get(`/api/signaling/poll?competition_id=${COMP}&since=0`, guestSid);
            expect(gpoll.status).toBe(200);
            const gj: any = await gpoll.json();
            const gtypes = gj.data.signals.map((s: any) => `${s.from}:${s.type}`);
            expect(gtypes).toContain('host:offer');
            expect(gtypes).toContain('host:ice');

            const hpoll = await get(`/api/signaling/poll?competition_id=${COMP}&since=0`, hostSid);
            const hj: any = await hpoll.json();
            expect(hj.data.signals.map((s: any) => `${s.from}:${s.type}`)).toContain('guest:answer');
        });

        it('3. interruption → bounded reconnect resumes the SAME session (role/peer preserved)', async () => {
            await post('/api/signaling/session/join', hostSid, { competition_id: COMP, claimed_role: 'host' });
            await post('/api/signaling/session/join', guestSid, { competition_id: COMP, claimed_role: 'guest' });
            const rec = await post('/api/signaling/reconnect', guestSid, { competition_id: COMP, claimed_role: 'guest' });
            expect(rec.status).toBe(200);
            const rj: any = await rec.json();
            expect(rj.data.role).toBe('guest');
            expect(rj.data.peer).toBe('guest');
            expect(rj.data.retry_policy).toEqual({ maxAttempts: 5, baseDelayMs: 1000, maxDelayMs: 15000 });
            // Poll catch-up still works after the interruption (resume point).
            const poll = await get(`/api/signaling/poll?competition_id=${COMP}&since=0`, guestSid);
            expect(poll.status).toBe(200);
        });

        it('4. host leave withdraws presence but NEVER ends the competition', async () => {
            await post('/api/signaling/session/join', hostSid, { competition_id: COMP, claimed_role: 'host' });
            await post('/api/signaling/session/join', guestSid, { competition_id: COMP, claimed_role: 'guest' });
            const leave = await post('/api/signaling/session/leave', hostSid, { competition_id: COMP });
            expect(leave.status).toBe(200);
            const desc = await get(`/api/signaling/session?competition_id=${COMP}`, guestSid);
            expect(desc.status).toBe(200);
            const dj: any = await desc.json();
            expect(dj.data.presence.host).toBe(false);
            expect(dj.data.presence.guest).toBe(true);
            // Competition row untouched: still live, started_at never rewritten.
            const comp = db.competitions.find((c: any) => c.id === COMP);
            expect(comp.status).toBe('live');
            expect(comp.started_at).toBe('2026-10-09T00:00:00Z');
        });

        it('5. refresh re-join is idempotent and resumes from the same session', async () => {
            await post('/api/signaling/session/join', hostSid, { competition_id: COMP, claimed_role: 'host' });
            await post('/api/signaling/offer', hostSid, { competition_id: COMP, payload: { sdp: 'o1' } });
            // "Refresh": same user joins again — allowed, same server identity.
            const again = await post('/api/signaling/session/join', hostSid, { competition_id: COMP, claimed_role: 'host' });
            expect(again.status).toBe(200);
            const aj: any = await again.json();
            expect(aj.data.role).toBe('host');
            expect(aj.data.peer).toBe('host');
            const comp = db.competitions.find((c: any) => c.id === COMP);
            expect(comp.status).toBe('live');
            expect(comp.started_at).toBe('2026-10-09T00:00:00Z');
        });
    });

    describe('B. role authorization on the current contract', () => {
        it('6. publish matrix: guest can never offer, viewer is receive-only', async () => {
            await post('/api/signaling/session/join', hostSid, { competition_id: COMP, claimed_role: 'host' });
            await post('/api/signaling/session/join', guestSid, { competition_id: COMP, claimed_role: 'guest' });
            const vj = await post('/api/signaling/session/join', viewerSid, { competition_id: COMP });
            expect(vj.status).toBe(200);
            expect(((await vj.json()) as any).data.role).toBe('viewer');

            expect((await post('/api/signaling/offer', guestSid, { competition_id: COMP, payload: 'x' })).status).toBe(403);
            expect((await post('/api/signaling/offer', viewerSid, { competition_id: COMP, payload: 'x', to: 'host' })).status).toBe(403);
            // Viewer answers + ICE are allowed (receive-only peer), offer never.
            expect((await post('/api/signaling/ice', viewerSid, { competition_id: COMP, payload: { c: 'v' }, to: 'host' })).status).toBe(200);
            // Viewers can never read participant traffic on the participant poll.
            expect((await get(`/api/signaling/poll?competition_id=${COMP}&since=0`, viewerSid)).status).toBe(403);
            // ...but their own scoped read works.
            expect((await get(`/api/signaling/viewer/poll?competition_id=${COMP}&since=0`, viewerSid)).status).toBe(200);
        });

        it('7. role spoofing is rejected; auth boundaries are 401/403/409', async () => {
            expect((await post('/api/signaling/offer', guestSid, { competition_id: COMP, role: 'host', payload: 'x' })).status).toBe(403);
            expect((await post('/api/signaling/session/join', guestSid, { competition_id: COMP, claimed_role: 'host' })).status).toBe(403);
            expect((await post('/api/signaling/reconnect', hostSid, { competition_id: COMP, claimed_role: 'guest' })).status).toBe(403);
            expect((await post('/api/signaling/offer', undefined, { competition_id: COMP, payload: 'x' })).status).toBe(401);
            expect((await post('/api/signaling/session/join', undefined, { competition_id: COMP })).status).toBe(401);
            expect((await post('/api/signaling/offer', hostSid, { competition_id: PENDING, payload: 'x' })).status).toBe(409);
            expect(db.sseEvents.length).toBe(0);
        });
    });

    describe('C. legacy-contract regression (dead endpoints stay dead)', () => {
        it('8. the old room/signal contract is 404 — an old client can never silently succeed', async () => {
            expect((await post('/api/signaling/room/join', hostSid, { room_id: `comp_${COMP}`, user_id: hostId, role: 'host' })).status).toBe(404);
            expect((await post('/api/signaling/signal', hostSid, { room_id: `comp_${COMP}`, from_role: 'host', signal_type: 'offer', signal_data: {} })).status).toBe(404);
            expect((await post('/api/signaling/room/leave', hostSid, { room_id: `comp_${COMP}`, user_id: hostId, role: 'host' })).status).toBe(404);
            expect((await get(`/api/signaling/room/comp_${COMP}/status`, hostSid)).status).toBe(404);
            expect(db.sseEvents.length).toBe(0);
        });
    });

    describe('D. production-client source contract', () => {
        const p2p = readFileSync(join(process.cwd(), 'src/client/services/P2PConnection.ts'), 'utf8');
        const room = readFileSync(join(process.cwd(), 'src/modules/pages/live-room-page.ts'), 'utf8');

        it('9. shipped P2PConnection never calls the dead contract', () => {
            expect(p2p).not.toMatch(/\/api\/signaling\/room\/join/);
            expect(p2p).not.toMatch(/\/api\/signaling\/signal/);
            expect(p2p).not.toMatch(/\/api\/signaling\/room\/leave/);
            expect(p2p).not.toMatch(/\/api\/signaling\/room\//);
            expect(p2p).not.toMatch(/from_role/);
            expect(p2p).not.toMatch(/signal_type/);
            expect(p2p).not.toMatch(/signal_data/);
        });

        it('10. shipped P2PConnection uses the current contract with Bearer auth', () => {
            for (const ep of [
                '/api/signaling/session/join',
                '/api/signaling/session/leave',
                '/api/signaling/offer',
                '/api/signaling/answer',
                '/api/signaling/ice',
                '/api/signaling/poll',
                '/api/signaling/reconnect',
                '/api/signaling/ice-servers',
            ]) {
                expect(p2p, `missing ${ep}`).toContain(ep);
            }
            expect(p2p).toContain('competition_id');
            expect(p2p).toContain("'Bearer '");
            // No secret in the URL: no fetch() builds a query string carrying a token.
            expect(p2p).not.toMatch(/fetch\([^;]*\?(.*&)?token=/);
        });

        it('11. production live room page uses session leave + authed room/create', () => {
            expect(room).not.toMatch(/\/api\/signaling\/room\/leave/);
            expect(room).not.toMatch(/\/api\/signaling\/room\/join/);
            expect(room).not.toMatch(/\/api\/signaling\/signal/);
            expect(room).toContain('/api/signaling/session/leave');
            // room/create (host-only gate) must carry the session Bearer token.
            const createCall = room.match(/fetch\('\/api\/signaling\/room\/create'[\s\S]{0,600}/);
            expect(createCall, 'room/create call must exist').toBeTruthy();
            expect(createCall![0]).toMatch(/Authorization/);
        });

        it('12. client reconnect bounds match the server SSOT policy', () => {
            expect(new SignalingReconnectPolicy().schedule()).toEqual([1000, 2000, 4000, 8000, 15000]);
            expect(p2p).toMatch(/attempt <= 5/);
            expect(p2p).toContain('15000');
        });
    });
});
