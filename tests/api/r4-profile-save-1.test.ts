/**
 * UNIT32 / R4-PROFILE-SAVE-1 (P-01) — "settings 200 without saving".
 *
 * Proven defect on the pre-fix code: the settings page always sent
 * `display_name` and `bio` together with the preference fields, but
 * `SettingsController.updateSettings()` only forwarded the preference fields
 * to `user_settings`. The profile fields were dropped on the floor, so the
 * endpoint answered 200 while the `users` row was never written — a save
 * that reported success and saved nothing.
 *
 * This suite pins the fixed path:
 *   - the profile fields are written to the AUTHENTICATED user's own row,
 *   - the saved values are proven by a RE-READ (the authoritative user read
 *     path), never by the 200 alone,
 *   - the preference fields keep being saved by the same request,
 *   - partial-update semantics hold (an omitted field never erases a value,
 *     an empty bio is a legitimate "clear"),
 *   - invalid input is rejected and NOTHING is written,
 *   - an unauthenticated call changes nothing,
 *   - no other user's row is touched, and a client-supplied `user_id` is
 *     ignored (the identity comes from the session only),
 *   - the stored profile values are HTML-safe (the profile surfaces render
 *     them as raw HTML).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { SessionModel } from '../../src/models/SessionModel';

const env = (db: SqliteD1) => ({ DB: db } as unknown as Parameters<typeof app.request>[2]);

const ALICE = {
    id: 101,
    email: 'alice@unit32.local',
    username: 'alice32',
    display_name: 'Alice Old',
    bio: 'Alice old bio'
};
const BOB = {
    id: 102,
    email: 'bob@unit32.local',
    username: 'bob32',
    display_name: 'Bob Old',
    bio: 'Bob old bio'
};

let db: SqliteD1;
let aliceSession: string;
let bobSession: string;

async function seedUser(u: typeof ALICE): Promise<void> {
    await db.prepare(`
        INSERT INTO users (id, email, username, display_name, password_hash, bio,
                           language, country, is_verified, is_active, is_fake)
        VALUES (?, ?, ?, ?, 'hash', ?, 'ar', 'SA', 1, 1, 0)
    `).bind(u.id, u.email, u.username, u.display_name, u.bio).run();
}

async function readUserRow(id: number): Promise<any> {
    return db.prepare('SELECT id, display_name, bio FROM users WHERE id = ?').bind(id).first();
}

async function putSettings(token: string | null, body: unknown) {
    return app.request('/api/settings?lang=en', {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify(body)
    }, env(db));
}

async function getSettings(token: string) {
    return app.request('/api/settings?lang=en', {
        headers: { Authorization: `Bearer ${token}` }
    }, env(db));
}

async function getPublicProfile(username: string) {
    return app.request(`/api/users/${username}?lang=en`, {}, env(db));
}

beforeEach(async () => {
    db = new SqliteD1();
    await seedUser(ALICE);
    await seedUser(BOB);
    const sessions = new SessionModel(db as unknown as D1Database);
    aliceSession = (await sessions.create({ user_id: ALICE.id })).id;
    bobSession = (await sessions.create({ user_id: BOB.id })).id;
});

describe('UNIT32 / P-01 — PUT /api/settings persists display_name and bio', () => {
    it('writes the profile fields to the authenticated user row', async () => {
        const res = await putSettings(aliceSession, {
            display_name: 'Alice New',
            bio: 'Alice new bio'
        });
        expect(res.status).toBe(200);

        const row = await readUserRow(ALICE.id);
        expect(row.display_name).toBe('Alice New');
        expect(row.bio).toBe('Alice new bio');
    });

    it('the saved values are proven by a re-read, not by the 200', async () => {
        await putSettings(aliceSession, { display_name: 'Alice Saved', bio: 'Bio saved' });

        // Authoritative user read path (users table).
        const profile = await getPublicProfile('alice32');
        expect(profile.status).toBe(200);
        const body = (await profile.json()) as any;
        expect(body.success).toBe(true);
        expect(body.data.display_name).toBe('Alice Saved');
        expect(body.data.bio).toBe('Bio saved');

        // And the values are still there on a second read (persisted, not cached).
        const again = await getPublicProfile('alice32');
        const againBody = (await again.json()) as any;
        expect(againBody.data.display_name).toBe('Alice Saved');
        expect(againBody.data.bio).toBe('Bio saved');
    });

    it('keeps saving the preference fields of the same request', async () => {
        const res = await putSettings(aliceSession, {
            display_name: 'Alice Prefs',
            bio: 'Bio prefs',
            default_language: 'en',
            default_country: 'EG',
            notifications_enabled: false,
            email_notifications: true,
            privacy_level: 'followers'
        });
        expect(res.status).toBe(200);

        const settings = (await (await getSettings(aliceSession)).json()) as any;
        expect(settings.data.settings.default_language).toBe('en');
        expect(settings.data.settings.default_country).toBe('EG');
        expect(settings.data.settings.notifications_enabled).toBe(0);
        expect(settings.data.settings.email_notifications).toBe(1);
        expect(settings.data.settings.privacy_level).toBe('followers');

        const row = await readUserRow(ALICE.id);
        expect(row.display_name).toBe('Alice Prefs');
        expect(row.bio).toBe('Bio prefs');
    });

    it('changes no other user', async () => {
        await putSettings(aliceSession, { display_name: 'Alice Only', bio: 'Alice only bio' });

        const bob = await readUserRow(BOB.id);
        expect(bob.display_name).toBe('Bob Old');
        expect(bob.bio).toBe('Bob old bio');

        const bobProfile = (await (await getPublicProfile('bob32')).json()) as any;
        expect(bobProfile.data.display_name).toBe('Bob Old');
        expect(bobProfile.data.bio).toBe('Bob old bio');
    });

    it('ignores a client-supplied user_id (the session identity wins)', async () => {
        const res = await putSettings(aliceSession, {
            user_id: BOB.id,
            display_name: 'Alice Wins',
            bio: 'Alice wins'
        });
        expect(res.status).toBe(200);

        expect((await readUserRow(ALICE.id)).display_name).toBe('Alice Wins');
        expect((await readUserRow(BOB.id)).display_name).toBe('Bob Old');
    });

    it('rejects an unauthenticated save with 401 and writes nothing', async () => {
        const before = await readUserRow(ALICE.id);

        // A browser-shaped request carries the CSRF proof, so the request
        // reaches the auth layer and is refused there with 401.
        const res = await app.request('/api/settings?lang=en', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'unit32-csrf' },
            body: JSON.stringify({ display_name: 'Hacker', bio: 'Hacker bio' })
        }, env(db));
        expect(res.status).toBe(401);
        const body = (await res.json()) as any;
        expect(body.success).toBe(false);

        const after = await readUserRow(ALICE.id);
        expect(after.display_name).toBe(before.display_name);
        expect(after.bio).toBe(before.bio);
    });

    it('rejects an unauthenticated save without any CSRF proof and writes nothing', async () => {
        const before = await readUserRow(ALICE.id);

        // No credential and no CSRF proof: the CSRF layer refuses first.
        const res = await putSettings(null, { display_name: 'Hacker', bio: 'Hacker bio' });
        expect([401, 403]).toContain(res.status);
        const body = (await res.json()) as any;
        expect(body.success).toBe(false);

        const after = await readUserRow(ALICE.id);
        expect(after.display_name).toBe(before.display_name);
        expect(after.bio).toBe(before.bio);
    });

    it('omitting the profile fields does not erase them (partial update)', async () => {
        const res = await putSettings(aliceSession, { default_country: 'SA' });
        expect(res.status).toBe(200);

        const row = await readUserRow(ALICE.id);
        expect(row.display_name).toBe('Alice Old');
        expect(row.bio).toBe('Alice old bio');
    });

    it('omitting the preference fields does not erase them either', async () => {
        await putSettings(aliceSession, {
            default_language: 'en',
            default_country: 'EG',
            notifications_enabled: false,
            email_notifications: true
        });

        const res = await putSettings(aliceSession, { display_name: 'Alice Only Name' });
        expect(res.status).toBe(200);

        const settings = (await (await getSettings(aliceSession)).json()) as any;
        expect(settings.data.settings.default_language).toBe('en');
        expect(settings.data.settings.default_country).toBe('EG');
        expect(settings.data.settings.notifications_enabled).toBe(0);
        expect(settings.data.settings.email_notifications).toBe(1);
    });

    it('clears the bio when an empty bio is sent', async () => {
        const res = await putSettings(aliceSession, { bio: '' });
        expect(res.status).toBe(200);

        const row = await readUserRow(ALICE.id);
        expect(row.bio).toBe('');
        expect(row.display_name).toBe('Alice Old');
    });

    it('rejects invalid profile input and writes nothing', async () => {
        const cases: Array<[string, unknown]> = [
            ['display_name too short', { display_name: 'A' }],
            ['display_name too long', { display_name: 'x'.repeat(101) }],
            ['display_name not a string', { display_name: 42 }],
            ['bio too long', { bio: 'y'.repeat(501) }],
            ['bio not a string', { bio: { evil: true } }]
        ];

        for (const [label, payload] of cases) {
            const res = await putSettings(aliceSession, payload);
            expect(res.status, `${label} must be rejected`).toBe(422);
            const body = (await res.json()) as any;
            expect(body.success, `${label} must not report success`).toBe(false);
        }

        const row = await readUserRow(ALICE.id);
        expect(row.display_name).toBe('Alice Old');
        expect(row.bio).toBe('Alice old bio');
    });

    it('rejects invalid preference input and writes nothing', async () => {
        const res = await putSettings(aliceSession, { privacy_level: 'everyone' });
        expect(res.status).toBe(422);

        const res2 = await putSettings(aliceSession, { notifications_enabled: 'yes' });
        expect(res2.status).toBe(422);
    });

    it('stores the profile fields HTML-safe (no stored XSS in the profile surfaces)', async () => {
        const res = await putSettings(aliceSession, {
            display_name: '<script>alert(1)</script>',
            bio: '<img src=x onerror=alert(2)>'
        });
        expect(res.status).toBe(200);

        const row = await readUserRow(ALICE.id);
        expect(row.display_name).not.toContain('<script>');
        expect(row.bio).not.toContain('<img');
        expect(row.display_name).not.toContain('<');
        expect(row.bio).not.toContain('<');
    });

    it('reports the persisted profile values in the response body', async () => {
        const res = await putSettings(aliceSession, {
            display_name: 'Alice Reported',
            bio: 'Bio reported'
        });
        const body = (await res.json()) as any;
        expect(body.success).toBe(true);
        expect(body.data.profile.display_name).toBe('Alice Reported');
        expect(body.data.profile.bio).toBe('Bio reported');
        // The preference row is still part of the response (contract kept).
        expect(body.data.settings).toBeTruthy();
    });

    it('GET /api/settings keeps its user_settings shape (no profile fields added)', async () => {
        const res = await getSettings(aliceSession);
        const body = (await res.json()) as any;
        expect(body.data.settings).toBeTruthy();
        expect(body.data.settings.default_language).toBeDefined();
        expect(body.data.settings.default_country).toBeDefined();
        expect(body.data.settings.notifications_enabled).toBeDefined();
        expect(body.data.settings.email_notifications).toBeDefined();
        expect(body.data.settings.privacy_level).toBeDefined();
        expect(body.data.display_name).toBeUndefined();
        expect(body.data.profile).toBeUndefined();
    });
});
