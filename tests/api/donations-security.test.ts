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
                    body: JSON.stringify({ amount: 5, payment_method: method, non_refundable_accepted: true, amount_confirmed: true })
                },
                env(db)
            );
            expect(res.status).toBe(200);
        }
    });

    it('rejects creation without the non-refundable consent (8.G-F3)', async () => {
        const res = await app.request(
            '/api/donations',
            {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ amount: 5, payment_method: 'stripe', amount_confirmed: true })
            },
            env(db)
        );
        expect(res.status).toBe(400);
    });

    it('rejects creation without the amount confirmation (8.G-F3)', async () => {
        const res = await app.request(
            '/api/donations',
            {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify({ amount: 5, payment_method: 'stripe', non_refundable_accepted: true })
            },
            env(db)
        );
        expect(res.status).toBe(400);
    });
});

describe('POST /api/donations/:id/complete (SEC-01 — route deleted)', () => {
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
                body: JSON.stringify({ amount: 10, payment_method: 'stripe', non_refundable_accepted: true, amount_confirmed: true })
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

    // SEC-01 acceptance criterion (docs/12): the manual completion route no
    // longer exists. The Stripe webhook is the only completion authority.
    // Every variant — anonymous, stranger, owner, missing tx — must 404,
    // and the donation must stay pending (no client-driven state change).
    it('returns 404 without authentication (route gone, not merely guarded)', async () => {
        const res = await complete(undefined, 'tx-public');
        expect(res.status).toBe(404);
        expect(db.donations[0].payment_status).toBe('pending');
    });

    it('returns 404 for a stranger (no ownership path exists anymore)', async () => {
        const res = await complete(strangerSession, 'tx-evil');
        expect(res.status).toBe(404);
        expect(db.donations[0].payment_status).toBe('pending');
    });

    it('returns 404 even for the owner with a transaction id (no manual completion)', async () => {
        const res = await complete(ownerSession, 'tx-legit');
        expect(res.status).toBe(404);
        expect(db.donations[0].payment_status).toBe('pending');
        expect(db.donations[0].transaction_id).toBeNull();
    });

    it('returns 404 without a transaction id (no validation path — no route)', async () => {
        const res = await app.request(
            `/api/donations/${donationId}/complete`,
            {
                method: 'POST',
                headers: headers(ownerSession),
                body: JSON.stringify({})
            },
            env(db)
        );
        expect(res.status).toBe(404);
    });
});
