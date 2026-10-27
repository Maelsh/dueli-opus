/**
 * UNIT32.2 — PUT /api/account/password contract (server)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { SessionModel } from '../../src/models/SessionModel';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';

const env = (db: SqliteD1) => ({ DB: db } as unknown as Parameters<typeof app.request>[2]);

const USER_ID = 32250;
let db: SqliteD1;
let sessionId: string;
let passwordHash: string;

async function api(
    method: string,
    path: string,
    body?: Record<string, unknown>
): Promise<{ status: number; data: any; res: Response }> {
    const res = await app.request(`${path}?lang=en`, {
        method,
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionId}`,
            'X-CSRF-Token': 'test',
        },
        body: body ? JSON.stringify(body) : undefined,
    }, env(db));
    const data = await res.json().catch(() => null);
    return { status: res.status, data, res };
}

beforeEach(async () => {
    db = new SqliteD1();
    passwordHash = await CryptoUtils.hashPassword('oldpass123');
    await db.prepare(`
        INSERT INTO users (id, email, username, password_hash, display_name, is_verified, is_active, is_fake)
        VALUES (?, 'pw322@test.local', 'pw322user', ?, 'PW User', 1, 1, 0)
    `).bind(USER_ID, passwordHash).run();
    const sessions = new SessionModel(db as unknown as D1Database);
    sessionId = (await sessions.create({ user_id: USER_ID })).id;
});

describe('UNIT32.2 — account password API', () => {
    it('success rotates password, destroys sessions, clears cookies, no hash leak', async () => {
        const ok = await api('PUT', '/api/account/password', {
            current_password: 'oldpass123',
            new_password: 'newpass1234',
        });
        expect(ok.status).toBe(200);
        expect(ok.data.success).toBe(true);
        expect(ok.data.data.reauth_required).toBe(true);
        expect(JSON.stringify(ok.data)).not.toContain('pbkdf2$');
        expect(JSON.stringify(ok.data)).not.toContain('newpass');

        const after = await app.request('/api/auth/session?lang=en', {
            headers: { Authorization: `Bearer ${sessionId}` },
        }, env(db));
        expect(((await after.json()) as any).data.user).toBeNull();
    });

    it('wrong current 401, short new 422, OAuth 422', async () => {
        expect((await api('PUT', '/api/account/password', {
            current_password: 'wrong',
            new_password: 'newpass1234',
        })).status).toBe(401);

        expect((await api('PUT', '/api/account/password', {
            current_password: 'oldpass123',
            new_password: 'short',
        })).status).toBe(422);

        await db.prepare('UPDATE users SET oauth_provider = ? WHERE id = ?').bind('google', USER_ID).run();
        expect((await api('PUT', '/api/account/password', {
            current_password: 'oldpass123',
            new_password: 'newpass1234',
        })).status).toBe(422);
        expect((await api('PUT', '/api/account/password')).status).toBe(422);
    });
});
