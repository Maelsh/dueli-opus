/**
 * UNIT32.2-REM1 — OAuth vs local password distinction
 */
import { beforeEach, describe, expect, it } from 'vitest';
import type { D1Database } from '@cloudflare/workers-types';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { SessionModel } from '../../src/models/SessionModel';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';

const env = (db: SqliteD1) => ({ DB: db } as unknown as Parameters<typeof app.request>[2]);

let db: SqliteD1;
let sessionId: string;

beforeEach(async () => {
    db = new SqliteD1();
    const hash = await CryptoUtils.hashPassword('knownpass1');
    await db.prepare(`
        INSERT INTO users (id, email, username, password_hash, display_name, oauth_provider, is_verified, is_active, is_fake)
        VALUES (32310, 'oauth@test.local', 'oauth_user', ?, 'OAuth', 'google', 1, 1, 0)
    `).bind(hash).run();
    const sessions = new SessionModel(db as unknown as D1Database);
    sessionId = (await sessions.create({ user_id: 32310 })).id;
});

describe('UNIT32.2-REM1 OAuth password API', () => {
    it('OAuth without user-chosen password: settings has_password false and PUT 422', async () => {
        const settings = await app.request('/api/settings?lang=en', {
            headers: { Authorization: `Bearer ${sessionId}` },
        }, env(db));
        const body = (await settings.json()) as any;
        expect(body.data.account.has_password).toBe(false);

        const put = await app.request('/api/settings?lang=en', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${sessionId}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ display_name: 'OAuth' }),
        }, env(db));
        expect(put.status).toBe(200);

        const pwd = await app.request('/api/account/password?lang=en', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${sessionId}`, 'Content-Type': 'application/json', 'X-CSRF-Token': 'test' },
            body: JSON.stringify({ current_password: 'knownpass1', new_password: 'newpass1234' }),
        }, env(db));
        expect(pwd.status).toBe(422);
    });

    it('OAuth with audit trail for password change: has_password true and PUT succeeds', async () => {
        await db.prepare(`
            INSERT INTO admin_audit_logs (admin_id, action_type, target_entity, target_id, details, created_at)
            VALUES (32310, 'account_password_changed', 'user', 32310, 'test seed', datetime('now'))
        `).run();

        const settings = await app.request('/api/settings?lang=en', {
            headers: { Authorization: `Bearer ${sessionId}` },
        }, env(db));
        expect(((await settings.json()) as any).data.account.has_password).toBe(true);

        const pwd = await app.request('/api/account/password?lang=en', {
            method: 'PUT',
            headers: { Authorization: `Bearer ${sessionId}`, 'Content-Type': 'application/json', 'X-CSRF-Token': 'test' },
            body: JSON.stringify({ current_password: 'knownpass1', new_password: 'newpass5678' }),
        }, env(db));
        expect(pwd.status).toBe(200);
    });
});
