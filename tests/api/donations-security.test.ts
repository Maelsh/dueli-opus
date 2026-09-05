import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';

/**
 * SEC-01: POST /api/donations/:id/complete must not be publicly completable,
 * and paypal must stay hidden until a real integration exists.
 */
function env(db: FakeD1) {
    return { DB: db } as any;
}

let ipSeq = 500;
function headers(sessionId?: string) {
    ipSeq += 1;
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'sec01',
        'X-Forwarded-For': `10.7.7.${(ipSeq % 250) + 1}`,
        ...(sessionId ? { Authorization: `Bearer ${sessionId}` } : {})
    };
}

describe('donations payment methods', () => {
    let db: FakeD1;
    beforeEach(() => {
        db = new FakeD1();
    });

    it("rejects paypal until a real integration exists", async () => {
        const res = await app.request(
            '/api/donations',
            {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ amount: 5, payment_method: 'paypal' })
            },
            env(db)
        );
        expect(res.status).toBe(400);
    });

    it('still accepts stripe/card', async () => {
        for (const method of ['stripe', 'card']) {
            const res = await app.request(
                '/api/donations',
                {
                    method: 'POST',
                    headers: headers(),
                    body: JSON.stringify({ amount: 5, payment_method: method })
                },
                env(db)
            );
            expect(res.status).toBe(200);
        }
    });
});

describe('POST /api/donations/:id/complete (SEC-01)', () => {
    let db: FakeD1;
    let ownerSession: string;
    let strangerSession: string;
    let donationId: number;

    beforeEach(async () => {
        db = new FakeD1();
        const users = new UserModel(db as unknown as D1Database);
        const sessions = new SessionModel(db as unknown as D1Database);

        const owner = await users.create({
            email: 'owner@test.com',
            username: 'donorowner',
            display_name: 'Owner'
        });
        const stranger = await users.create({
            email: 'stranger@test.com',
            username: 'donorstranger',
            display_name: 'Stranger'
        });
        ownerSession = (await sessions.create({ user_id: owner.id })).id;
        strangerSession = (await sessions.create({ user_id: stranger.id })).id;

        const created = await app.request(
            '/api/donations',
            {
                method: 'POST',
                headers: headers(ownerSession),
                body: JSON.stringify({ amount: 10, payment_method: 'stripe' })
            },
            env(db)
        );
        expect(created.status).toBe(200);
        donationId = ((await created.json()) as any).data.donation_id;
        expect(donationId).toBeGreaterThan(0);
    });

    function complete(sessionId: string | undefined, tx: string) {
        return app.request(
            `/api/donations/${donationId}/complete`,
            {
                method: 'POST',
                headers: headers(sessionId),
                body: JSON.stringify({ transaction_id: tx })
            },
            env(db)
        );
    }

    it('returns 401 without authentication (no longer public)', async () => {
        const res = await complete(undefined, 'tx-public');
        expect(res.status).toBe(401);
    });

    it("returns 403 when the caller doesn't own the donation", async () => {
        const res = await complete(strangerSession, 'tx-evil');
        expect(res.status).toBe(403);
        // donation must still be pending
        expect(db.donations[0].payment_status).toBe('pending');
    });

    it('lets the owner complete with a transaction id', async () => {
        const res = await complete(ownerSession, 'tx-legit');
        expect(res.status).toBe(200);
        expect(db.donations[0].payment_status).toBe('completed');
        expect(db.donations[0].transaction_id).toBe('tx-legit');
    });

    it('returns 400 without a transaction id', async () => {
        const res = await app.request(
            `/api/donations/${donationId}/complete`,
            {
                method: 'POST',
                headers: headers(ownerSession),
                body: JSON.stringify({})
            },
            env(db)
        );
        expect(res.status).toBe(400);
    });
});
