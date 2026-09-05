import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { UserModel } from '../../src/models/UserModel';
import { SessionModel } from '../../src/models/SessionModel';
import { FakeD1 } from '../helpers/fake-d1';

function env(db: FakeD1) {
    return { DB: db } as any;
}

describe('profile page', () => {
    let db: FakeD1;

    beforeEach(async () => {
        db = new FakeD1();
        const users = new UserModel(db as unknown as D1Database);
        await users.create({
            email: 'sara@test.com',
            username: 'sara',
            display_name: 'Sara',
            country: 'SA',
            language: 'ar'
        });
    });

    it('renders an existing user profile (/profile/:username)', async () => {
        const res = await app.request('/profile/sara?lang=ar', {}, env(db));
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('sara');
    });

    it('returns explicit 404 for an unknown username', async () => {
        const res = await app.request('/profile/no_such_user_xyz?lang=en', {}, env(db));
        expect(res.status).toBe(404);
        const html = await res.text();
        expect(html).toContain('no_such_user_xyz');
    });

    it('/profile without a session shows the login page (not "User Not Found")', async () => {
        const res = await app.request('/profile?lang=en', {}, env(db));
        expect(res.status).toBe(401);
        const html = await res.text();
        expect(html.toLowerCase()).toContain('login');
    });

    it('/profile with a valid session renders the owner profile', async () => {
        const users = new UserModel(db as unknown as D1Database);
        const me = await users.findByUsername('sara');
        const sessions = new SessionModel(db as unknown as D1Database);
        const session = await sessions.create({ user_id: me!.id });

        const res = await app.request(
            '/profile?lang=en',
            { headers: { Authorization: `Bearer ${session.id}` } },
            env(db)
        );
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('sara');
    });
});
