/**
 * Post-R1 acceptance (B) — normalized authenticated-user DTO.
 *
 * Proven mismatch on previous main: the login/session payloads used
 * {name, avatar} (and login omitted username) while header/profile/messages
 * consumers read {display_name, avatar_url, username}, so the same user
 * showed different (or placeholder) identity per surface.
 *
 * Pins: both POST /api/auth/login and GET /api/auth/session return the
 * canonical {id, username, display_name, avatar_url, email} shape, keep the
 * legacy {name, avatar} aliases, and never substitute a random avatar.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';

const AVATAR = 'https://cdn.test/avatar-b.png';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

async function seed(db: SqliteD1) {
    const hash = await CryptoUtils.hashPassword('secret123');
    await db.prepare(
        `INSERT INTO users (id, email, username, display_name, avatar_url, password_hash,
                            language, country, is_verified, is_active)
         VALUES (71, 'dto@local', 'dtouser', 'DTO User', ?, ?, 'ar', 'SA', 1, 1)`
    ).bind(AVATAR, hash).run();
}

function csrf() {
    return { 'Content-Type': 'application/json', 'X-CSRF-Token': 'dto-test' };
}

describe('post-R1: normalized auth user DTO', () => {
    let db: SqliteD1;
    let sessionId: string;

    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
        const login = await app.request('/api/auth/login?lang=en', {
            method: 'POST',
            headers: csrf(),
            body: JSON.stringify({ email: 'dto@local', password: 'secret123' }),
        }, env(db));
        expect(login.status).toBe(200);
        const loginBody = (await login.json()) as any;
        sessionId = loginBody?.data?.sessionId;
        expect(sessionId).toBeTruthy();
    });

    it('login returns the canonical identity fields', async () => {
        const res = await app.request('/api/auth/login?lang=en', {
            method: 'POST',
            headers: csrf(),
            body: JSON.stringify({ email: 'dto@local', password: 'secret123' }),
        }, env(db));
        expect(res.status).toBe(200);
        const user = ((await res.json()) as any)?.data?.user;
        expect(user.id).toBe(71);
        expect(user.username).toBe('dtouser');
        expect(user.display_name).toBe('DTO User');
        expect(user.avatar_url).toBe(AVATAR);
        expect(user.email).toBe('dto@local');
    });

    it('login keeps legacy aliases consistent with the canonical fields', async () => {
        const res = await app.request('/api/auth/login?lang=en', {
            method: 'POST',
            headers: csrf(),
            body: JSON.stringify({ email: 'dto@local', password: 'secret123' }),
        }, env(db));
        const user = ((await res.json()) as any)?.data?.user;
        expect(user.name).toBe(user.display_name);
        expect(user.avatar).toBe(user.avatar_url);
    });

    it('session returns the same canonical identity as login', async () => {
        const res = await app.request('/api/auth/session', {
            headers: { Authorization: `Bearer ${sessionId}` },
        }, env(db));
        expect(res.status).toBe(200);
        const user = ((await res.json()) as any)?.data?.user;
        expect(user.username).toBe('dtouser');
        expect(user.display_name).toBe('DTO User');
        expect(user.avatar_url).toBe(AVATAR);
        expect(user.name).toBe('DTO User');
        expect(user.avatar).toBe(AVATAR);
    });

    it('stored avatar is the canonical DB value, never a generated fallback', async () => {
        const res = await app.request('/api/auth/session', {
            headers: { Authorization: `Bearer ${sessionId}` },
        }, env(db));
        const user = ((await res.json()) as any)?.data?.user;
        expect(user.avatar_url).not.toContain('dicebear');
        expect(user.avatar).not.toContain('dicebear');
    });
});
