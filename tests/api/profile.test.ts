import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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

    // R4-PROFILE-SEC11-1 (ROW28.2) — negative regression pins for the own-profile
    // session resolution. Canonical source is src/middleware/auth.ts (Bearer
    // header OR `sessionId` cookie ONLY). Before the fix, profile-page.ts also
    // accepted `?token=<session>` (SEC-11: leaks into logs/history/Referer) and
    // the legacy `session_id` cookie (SEC-07). Both must now fail closed.
    async function makeSession() {
        const users = new UserModel(db as unknown as D1Database);
        const me = await users.findByUsername('sara');
        const sessions = new SessionModel(db as unknown as D1Database);
        const session = await sessions.create({ user_id: me!.id });
        return session.id;
    }

    it('/profile rejects a session presented via ?token= (SEC-11)', async () => {
        const sid = await makeSession();
        const res = await app.request(`/profile?token=${sid}&lang=en`, {}, env(db));
        expect(res.status).toBe(401);
        const html = await res.text();
        expect(html.toLowerCase()).toContain('login');
        // Must NOT have rendered the owner profile through the query token.
        expect(html).not.toContain('@sara');
    });

    it('/profile rejects the legacy session_id cookie (SEC-07)', async () => {
        const sid = await makeSession();
        const res = await app.request(
            '/profile?lang=en',
            { headers: { Cookie: `session_id=${sid}` } },
            env(db)
        );
        expect(res.status).toBe(401);
        const html = await res.text();
        expect(html.toLowerCase()).toContain('login');
    });

    it('/profile still renders the owner profile via the canonical sessionId cookie', async () => {
        const sid = await makeSession();
        const res = await app.request(
            '/profile?lang=en',
            { headers: { Cookie: `sessionId=${sid}` } },
            env(db)
        );
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('sara');
    });

    it('public /profile/:username stays accessible with no session at all', async () => {
        const res = await app.request('/profile/sara?lang=en', {}, env(db));
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain('sara');
    });

    it('source pin: profile-page.ts no longer accepts query token or legacy session_id cookie', async () => {
        const src = readFileSync(resolve('src/modules/pages/profile-page.ts'), 'utf8');
        expect(src).not.toContain("query('token')");
        expect(src).not.toContain("session_id'");
    });

    it('source pin: verify-page.ts keeps its legitimate email-verification token', async () => {
        // Task item 5 — the ?token= here is a one-shot email-verification token,
        // NOT a session, and must be preserved.
        const src = readFileSync(resolve('src/modules/pages/verify-page.ts'), 'utf8');
        expect(src).toContain("query('token')");
    });
});
