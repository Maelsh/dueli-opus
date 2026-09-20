/**
 * Phase 7.A — Live WebRTC Signaling Authorization + Offer/Answer/ICE.
 * Authority is server-side: session → user → competition → host/guest.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';
import { t } from '../../src/i18n';

const db = new FakeD1();
function env() {
    return { DB: db } as any;
}

function req(path: string, method: string, sid?: string, body?: unknown) {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'test',
        'X-Forwarded-For': '10.7.0.11',
    };
    if (sid) headers['Authorization'] = `Bearer ${sid}`;
    return app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, env());
}

function pollGet(compId: number | string, sid: string) {
    return app.request(
        `/api/signaling/poll?competition_id=${compId}&since=0`,
        { headers: { Authorization: `Bearer ${sid}`, 'X-CSRF-Token': 'test', 'X-Forwarded-For': '10.7.0.11' } },
        env(),
    );
}

describe('7.A signaling auth + offer/answer/ICE', () => {
    let hostId: number, guestId: number, thirdId: number;
    let hostSid: string, guestSid: string, thirdSid: string;
    const COMP = 7101;
    const PENDING = 7102;

    beforeEach(async () => {
        Object.assign(db, { users: [], sessions: [], competitions: [], sseEvents: [], userSeq: 0, sseSeq: 0 });
        const users = new UserModel(db as any);
        hostId = (await users.create({ email: 'h@7a.test', username: 'h7a', display_name: 'H' })).id;
        guestId = (await users.create({ email: 'g@7a.test', username: 'g7a', display_name: 'G' })).id;
        thirdId = (await users.create({ email: 't@7a.test', username: 't7a', display_name: 'T' })).id;
        const sessions = new SessionModel(db as any);
        hostSid = (await sessions.create({ user_id: hostId })).id;
        guestSid = (await sessions.create({ user_id: guestId })).id;
        thirdSid = (await sessions.create({ user_id: thirdId })).id;
        db.competitions.push(
            { id: COMP, title: '7A', creator_id: hostId, opponent_id: guestId, status: 'live', category_id: 1 },
            { id: PENDING, title: '7A-pend', creator_id: hostId, opponent_id: guestId, status: 'pending', category_id: 1 },
        );
    });

    it('1. unauthenticated signaling → 401', async () => {
        const res = await req('/api/signaling/offer', 'POST', undefined, { competition_id: COMP, payload: 'sdp' });
        expect(res.status).toBe(401);
    });

    it('2. authenticated non-participant → 403', async () => {
        const res = await req('/api/signaling/offer', 'POST', thirdSid, { competition_id: COMP, payload: 'sdp' });
        expect(res.status).toBe(403);
        expect(db.sseEvents.length).toBe(0);
    });

    it('3. host sends offer → guest receives it (poll)', async () => {
        expect((await req('/api/signaling/offer', 'POST', hostSid, { competition_id: COMP, payload: { sdp: 'o' } })).status).toBe(200);
        expect((await req('/api/signaling/ice', 'POST', hostSid, { competition_id: COMP, payload: { c: 'c1' } })).status).toBe(200);
        expect((await req('/api/signaling/answer', 'POST', guestSid, { competition_id: COMP, payload: { sdp: 'a' } })).status).toBe(200);
        const poll = await pollGet(COMP, guestSid);
        expect(poll.status).toBe(200);
        const json: any = await poll.json();
        const types = json.data.signals.map((s: any) => `${s.from}:${s.type}`);
        expect(types).toContain('host:offer');
        expect(types).toContain('host:ice');
        const hpoll = await pollGet(COMP, hostSid);
        const hj: any = await hpoll.json();
        expect(hj.data.signals.map((s: any) => `${s.from}:${s.type}`)).toContain('guest:answer');
    });

    it('4. pending competition → 409', async () => {
        const res = await req('/api/signaling/offer', 'POST', hostSid, { competition_id: PENDING, payload: 'sdp' });
        expect(res.status).toBe(409);
        expect(db.sseEvents.length).toBe(0);
    });

    it('5. guessed/third-party competition room → 403', async () => {
        const cross = await pollGet(COMP, thirdSid);
        expect(cross.status).toBe(403);
        const missing = await pollGet(999999, thirdSid);
        expect([403, 404]).toContain(missing.status);
    });

    it('6. client role spoofing is rejected', async () => {
        const spoof = await req('/api/signaling/offer', 'POST', guestSid, { competition_id: COMP, role: 'host', payload: 'sdp' });
        expect(spoof.status).toBe(403);
        const wrongDir = await req('/api/signaling/offer', 'POST', guestSid, { competition_id: COMP, role: 'guest', payload: 'sdp' });
        expect(wrongDir.status).toBe(403);
        expect(db.sseEvents.length).toBe(0);
        const verify = await req('/api/signaling/verify', 'POST', guestSid, {
            session_token: guestSid, competition_id: COMP, claimed_role: 'host',
        });
        expect(verify.status).toBe(403);
        const vj: any = await verify.json();
        expect(vj.valid).toBe(false);
        expect(vj.error).toBe('role_mismatch');
    });

    it('7. transport failure never becomes auth success', async () => {
        const { SignalingAuthService } = await import('../../src/lib/services/SignalingAuthService');
        const svc = new SignalingAuthService({ prepare: () => { throw new Error('d1 down'); } } as any);
        await expect(svc.authorize(hostId, COMP)).rejects.toThrow('signaling_auth_transport_failed');
        const origPrepare = (db as any).prepare.bind(db);
        (db as any).prepare = (sql: string) => {
            if (sql.includes('sse_event_log')) throw new Error('d1 down');
            return origPrepare(sql);
        };
        try {
            const res = await req('/api/signaling/offer', 'POST', hostSid, { competition_id: COMP, payload: 'sdp' });
            expect(res.status).toBe(502);
        } finally {
            (db as any).prepare = origPrepare;
        }
    });

    it('i18n live.* signaling keys exist in ar+en', () => {
        for (const lang of ['ar', 'en'] as const) {
            for (const key of ['live.connecting', 'live.connected', 'live.connection_failed', 'live.permission_denied']) {
                expect(typeof t(key, lang)).toBe('string');
                expect(t(key, lang)).not.toBe(key);
            }
        }
        expect(t('live.connecting', 'ar')).not.toBe(t('live.connecting', 'en'));
    });
});
