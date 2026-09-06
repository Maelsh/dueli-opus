import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';

function env(db: FakeD1) {
    return { DB: db } as any;
}

describe('SSE user channel authentication regression test (SEC-11 fallback protection)', () => {
    let db: FakeD1;

    beforeEach(() => {
        db = new FakeD1();
    });

    it('GET /api/sse?channel=user:1 with valid session token accepts connection', async () => {
        const userModel = new UserModel(db as any);
        const sessionModel = new SessionModel(db as any);

        const user = await userModel.create({
            username: 'sse_user',
            display_name: 'SSE User',
            email: 'sse@example.com',
            password_hash: 'hash',
        });
        const session = await sessionModel.create({ user_id: user.id });

        const res = await app.request(`/api/sse?channel=user:${user.id}&token=${session.id}`, {}, env(db));
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/event-stream');
        await res.body?.cancel();
    });

    it('GET /api/sse?channel=user:1 without token returns 401', async () => {
        const res = await app.request('/api/sse?channel=user:1', {}, env(db));
        expect(res.status).toBe(401);
    });
});
