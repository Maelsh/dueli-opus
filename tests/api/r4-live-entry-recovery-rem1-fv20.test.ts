/**
 * R4-LIVE-ENTRY-RECOVERY-REM1 (unit 28.3.1) — FV20-SIG / FV20-REPLAY.
 *
 * FV20-SIG: the signaling poll contract must expose a cursor over EVERY
 * scanned event, not only the peer-visible ones. A full 50-row page of
 * presence/other-peer events used to pin the client to the same `since`
 * forever, so a later offer/answer could never be read.
 *
 * FV20-REPLAY: a fresh SSE subscription must start at the channel's current
 * high-water mark (no old invite replay), while Last-Event-Id reconnect must
 * still deliver the missed window exactly once. The persisted log is recovery
 * support, never a page-load history feed.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';
import { SqliteD1 } from '../helpers/sqlite-d1';

describe('FV20-SIG — signaling cursor over filtered pages', () => {
    const db = new FakeD1();
    const COMP = 7301;
    const env = () => ({ DB: db } as any);
    let hostId: number, guestId: number, viewerId: number;
    let hostSid: string, guestSid: string, viewerSid: string;

    const headers = (sid?: string) => {
        const h: Record<string, string> = {
            'Content-Type': 'application/json',
            'X-CSRF-Token': 'test',
            'X-Forwarded-For': '10.7.3.11',
        };
        if (sid) h['Authorization'] = `Bearer ${sid}`;
        return h;
    };
    const get = (path: string, sid?: string) => app.request(path, { headers: headers(sid) }, env());
    const post = (path: string, sid: string | undefined, body: unknown) =>
        app.request(path, { method: 'POST', headers: headers(sid), body: JSON.stringify(body) }, env());
    const poll = (sid: string, since: number) =>
        get(`/api/signaling/poll?competition_id=${COMP}&since=${since}`, sid);
    const viewerPoll = (sid: string, since: number) =>
        get(`/api/signaling/viewer/poll?competition_id=${COMP}&since=${since}`, sid);
    const channel = `signaling:${COMP}`;

    const row = (id: number, eventType: string, payload: Record<string, unknown>) => ({
        id,
        channel,
        event_type: eventType,
        payload: JSON.stringify(payload),
        created_at: new Date().toISOString(),
    });

    beforeEach(async () => {
        Object.assign(db, { users: [], sessions: [], competitions: [], sseEvents: [], userSeq: 0, sseSeq: 0 });
        const users = new UserModel(db as any);
        hostId = (await users.create({ email: 'h@fv20.test', username: 'h_fv20', display_name: 'H' })).id;
        guestId = (await users.create({ email: 'g@fv20.test', username: 'g_fv20', display_name: 'G' })).id;
        viewerId = (await users.create({ email: 'v@fv20.test', username: 'v_fv20', display_name: 'V' })).id;
        const sessions = new SessionModel(db as any);
        hostSid = (await sessions.create({ user_id: hostId })).id;
        guestSid = (await sessions.create({ user_id: guestId })).id;
        viewerSid = (await sessions.create({ user_id: viewerId })).id;
        db.competitions.push({
            id: COMP, title: 'FV20 live', creator_id: hostId, opponent_id: guestId,
            status: 'live', started_at: '2026-10-20 09:00:00', category_id: 1,
        });
    });

    it('participant poll advances past 50 filtered presence events and then reads the real offer', async () => {
        for (let i = 1; i <= 50; i++) {
            db.sseEvents.push(row(++db.sseSeq, 'session_join', {
                peer: `viewer:${1000 + i}`, role: 'viewer', at: new Date().toISOString(),
            }));
        }

        const first: any = await (await poll(hostSid, 0)).json();
        expect(first.success).toBe(true);
        expect(first.data.signals).toEqual([]);
        // The cursor is the highest SCANNED id, not the highest visible signal.
        expect(first.data.cursor).toBe(50);

        expect((await post('/api/signaling/offer', guestSid, {
            competition_id: COMP, payload: { sdp: 'guest-offer-after-filtered-page' },
        })).status).toBe(403); // guest is not the offerer

        expect((await post('/api/signaling/offer', hostSid, {
            competition_id: COMP, payload: { sdp: 'host-offer-after-filtered-page' },
        })).status).toBe(200);

        const second: any = await (await poll(guestSid, first.data.cursor)).json();
        expect(second.data.cursor).toBe(51);
        expect(second.data.signals.map((s: any) => s.payload.sdp)).toContain('host-offer-after-filtered-page');
    });

    it('viewer poll advances over signals addressed to another viewer and reaches its own', async () => {
        const otherViewer = 'viewer:9999';
        for (let i = 1; i <= 50; i++) {
            db.sseEvents.push(row(++db.sseSeq, 'signal_offer', {
                competition_id: COMP, from: 'host', peer: 'host', to: otherViewer,
                payload: { sdp: `to-other-${i}` },
            }));
        }

        const first: any = await (await viewerPoll(viewerSid, 0)).json();
        expect(first.success).toBe(true);
        expect(first.data.signals).toEqual([]);
        expect(first.data.cursor).toBe(50);

        const ownPeer = `viewer:${viewerId}`;
        db.sseEvents.push(row(++db.sseSeq, 'signal_offer', {
            competition_id: COMP, from: 'host', peer: 'host', to: ownPeer,
            payload: { sdp: 'to-me' },
        }));

        const second: any = await (await viewerPoll(viewerSid, first.data.cursor)).json();
        expect(second.data.cursor).toBe(51);
        expect(second.data.signals).toHaveLength(1);
        expect(second.data.signals[0].payload).toEqual({ sdp: 'to-me' });
    });

    it('empty reads keep the supplied cursor; auth boundaries are unchanged', async () => {
        const empty: any = await (await poll(hostSid, 77)).json();
        expect(empty.data.signals).toEqual([]);
        expect(empty.data.cursor).toBe(77);

        // Participants still cannot read the viewer stream, viewers cannot read
        // the participant stream (unchanged SEC/role contract).
        expect((await viewerPoll(hostSid, 0)).status).toBe(403);
        expect((await poll(viewerSid, 0)).status).toBe(403);
    });
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function readSse(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<string> {
    const next = await reader.read();
    return next.done ? '' : new TextDecoder().decode(next.value);
}

describe('FV20-REPLAY — fresh subscription vs Last-Event-Id recovery', () => {
    let db: SqliteD1;
    const env = () => ({ DB: db } as any);
    const auth = () => ({
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'fv20-replay',
        Authorization: 'Bearer sess-fv20',
    });

    const insertEvent = (eventType: string, payload: Record<string, unknown>) =>
        db.prepare(
            `INSERT INTO sse_event_log (channel, event_type, payload, created_at)
             VALUES ('user:31', ?, ?, datetime('now'))`
        ).bind(eventType, JSON.stringify(payload)).run();

    beforeEach(async () => {
        db = new SqliteD1();
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name, is_active)
             VALUES (31, 'fv20@example.com', 'fv20', 'x', 'FV20', 1)`
        ).run();
        await db.prepare(
            `INSERT INTO sessions (id, user_id, expires_at)
             VALUES ('sess-fv20', 31, datetime('now', '+1 day'))`
        ).run();
        await db.prepare(
            `INSERT INTO notifications (user_id, type, title, message, is_read)
             VALUES (31, 'invitation', 'old invite', 'old invite', 0)`
        ).run();
    });

    it('fresh load starts at the high-water mark: no old invite toast, new event arrives, unread history preserved', async () => {
        await insertEvent('invite_sent', { competition_id: 1, inviter_username: 'old-invite' });

        const res = await app.request('/api/sse?channel=user:31', { headers: auth() }, env());
        expect(res.status).toBe(200);
        const reader = res.body!.getReader();
        expect(await readSse(reader)).toContain('connected');

        // Published after the subscription is established.
        await insertEvent('invite_sent', { competition_id: 2, inviter_username: 'new-invite' });
        await sleep(700);
        const delivered = await readSse(reader);
        expect(delivered).toContain('new-invite');
        expect(delivered).not.toContain('old-invite');
        expect(delivered).not.toContain('id: 1\n');

        // The notification inbox is separate: replay/stream delivery never
        // marks old rows read and never deletes history.
        const notification: any = await db.prepare(
            `SELECT is_read FROM notifications WHERE user_id = 31`
        ).first();
        expect(notification.is_read).toBe(0);
        const count: any = await db.prepare(
            `SELECT COUNT(*) AS n FROM notifications WHERE user_id = 31`
        ).first();
        expect(count.n).toBe(1);

        await reader.cancel();
    });

    it('reconnect with Last-Event-Id delivers the missed window exactly once', async () => {
        await insertEvent('notification', { title: 'seen-before' });
        await insertEvent('invite_sent', { competition_id: 2, inviter_username: 'missed-two' });
        await insertEvent('invite_sent', { competition_id: 3, inviter_username: 'missed-three' });

        const res = await app.request('/api/sse?channel=user:31', {
            headers: { ...auth(), 'Last-Event-Id': '1' },
        }, env());
        expect(res.status).toBe(200);
        const reader = res.body!.getReader();
        expect(await readSse(reader)).toContain('connected');
        const catchUp = await readSse(reader);
        expect(catchUp).toContain('missed-two');
        expect(catchUp).toContain('missed-three');

        // Published while the stream is open: the next poll must start after
        // the catch-up cursor, not replay 2–3 again.
        await insertEvent('invite_sent', { competition_id: 4, inviter_username: 'live-four' });
        await sleep(700);
        const next = await readSse(reader);

        const all = catchUp + next;
        expect(next).toContain('live-four');
        expect(all.match(/id: 2\n/g)?.length ?? 0).toBe(1);
        expect(all.match(/id: 3\n/g)?.length ?? 0).toBe(1);
        expect(all.match(/id: 4\n/g)?.length ?? 0).toBe(1);

        await reader.cancel();
    });
});
