import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';

function env(db: FakeD1) {
    return { DB: db } as any;
}

const sharedDb = new FakeD1();

async function authedPost(path: string, sid: string, lang: string, body?: unknown) {
    const sep = path.includes('?') ? '&' : '?';
    return app.request(`${path}${sep}lang=${lang}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sid}`,
            'X-CSRF-Token': 'test',
            'X-Forwarded-For': `10.54.0.${Math.floor(Math.random() * 200) + 10}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    }, env(sharedDb));
}

function resetDb() {
    Object.assign(sharedDb, {
        users: [], blocks: [], sessions: [], donations: [],
        competitions: [], requests: [], ratings: [],
        invitations: [], notifications: [],
        userSeq: 0, blockSeq: 0, donationSeq: 0, competitionSeq: 0,
        ratingSeq: 0, invitationSeq: 0, notificationSeq: 0,
    });
}

describe('B5-4 invite/accept loop', () => {
    let aId: number, bId: number, cId: number;
    let aSession: string, bSession: string, cSession: string;

    beforeEach(async () => {
        resetDb();
        const users = new UserModel(sharedDb as any);
        aId = (await users.create({ email: 'a@b54.test', username: 'a54', display_name: 'A' })).id;
        bId = (await users.create({ email: 'b@b54.test', username: 'b54', display_name: 'B' })).id;
        cId = (await users.create({ email: 'c@b54.test', username: 'c54', display_name: 'C' })).id;
        const sessions = new SessionModel(sharedDb as any);
        aSession = (await sessions.create({ user_id: aId })).id;
        bSession = (await sessions.create({ user_id: bId })).id;
        cSession = (await sessions.create({ user_id: cId })).id;
        sharedDb.competitions.push({
            id: 1001,
            title: 'B54',
            creator_id: aId,
            opponent_id: null,
            status: 'pending',
            category_id: null,
        });
    });

    it('1. invite→accept: opponent_id=B, status=accepted', async () => {
        const inv = await authedPost('/api/competitions/1001/invite', aSession, 'en', { invitee_id: bId });
        expect([200, 201]).toContain(inv.status);
        const acc = await authedPost('/api/competitions/1001/accept-invite', bSession, 'en');
        expect(acc.status).toBe(200);
        // SELECT * (same shape as model.findById) — fake-d1 handles the full-row form
        const row: any = await sharedDb.prepare('SELECT * FROM competitions WHERE id = ?').bind(1001).first();
        expect(row.opponent_id).toBe(bId);
        expect(row.status).toBe('accepted');
    });

    it('2. Race: B and C accept concurrently, only one wins', async () => {
        await authedPost('/api/competitions/1001/invite', aSession, 'en', { invitee_id: bId });
        await authedPost('/api/competitions/1001/invite', aSession, 'en', { invitee_id: cId });
        const [rB, rC] = await Promise.all([
            authedPost('/api/competitions/1001/accept-invite', bSession, 'en'),
            authedPost('/api/competitions/1001/accept-invite', cSession, 'en'),
        ]);
        expect([rB.status, rC.status].sort()).toEqual([200, 409]);
        const row: any = await sharedDb.prepare('SELECT * FROM competitions WHERE id = ?').bind(1001).first();
        expect([bId, cId]).toContain(row.opponent_id);
    });

    it('3. After B accepts, no pending invitations remain', async () => {
        await authedPost('/api/competitions/1001/invite', aSession, 'en', { invitee_id: bId });
        await authedPost('/api/competitions/1001/invite', aSession, 'en', { invitee_id: cId });
        await authedPost('/api/competitions/1001/accept-invite', bSession, 'en');
        const pending: any = await sharedDb.prepare(
            "SELECT COUNT(*) as count FROM competition_invitations WHERE competition_id = ? AND status = 'pending'"
        ).bind(1001).first();
        expect(pending.count).toBe(0);
    });

    it('4. Invite blocked user: 403 with i18n ar', async () => {
        await sharedDb.prepare(
            `INSERT INTO user_blocks (blocker_id, blocked_id, reason, created_at) VALUES (?, ?, ?, datetime('now'))`
        ).bind(bId, aId, 'spam').run();
        const inv = await authedPost('/api/competitions/1001/invite', aSession, 'ar', { invitee_id: bId });
        expect(inv.status).toBe(403);
        const json: any = await inv.json();
        expect(json.error).toBe('لا يمكن التفاعل مع هذا المستخدم');
    });

    it('5. Accept non-existent invitation: 409 with i18n ar', async () => {
        // Existing competition, but B has NO pending invitation for it.
        const acc = await authedPost('/api/competitions/1001/accept-invite', bSession, 'ar');
        expect([404, 409]).toContain(acc.status);
        const json: any = await acc.json();
        expect(json.error).toBe('الدعوة غير موجودة أو منتهية');
    });

    it('6. Notifications: invite→B, accept→A', async () => {
        await authedPost('/api/competitions/1001/invite', aSession, 'en', { invitee_id: bId });
        const invNotif: any = await sharedDb.prepare(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND type = ?'
        ).bind(bId, 'invitation').first();
        expect(invNotif.count).toBe(1);
        await authedPost('/api/competitions/1001/accept-invite', bSession, 'en');
        const accNotif: any = await sharedDb.prepare(
            'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND type = ?'
        ).bind(aId, 'request').first();
        expect(accNotif.count).toBe(1);
    });
});