/**
 * SEC-07 — /api/auth/session must distinguish authoritative guest from a
 * temporary server failure.
 *
 * Proven defect: AuthController.getSession caught every error and returned
 * 200 {success:true,data:{user:null}}. The client correctly treats that shape
 * as authoritative expiry, so a transient D1/network error destroyed a valid
 * client session. A 5xx must stay transient; only a real invalid/missing
 * session may answer 200 with user:null.
 */
import { describe, it, expect, vi } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

describe('SEC-07 /api/auth/session failure classification', () => {
    it('returns 5xx, not guest-shaped 200, when the session store is unavailable', async () => {
        const db = new SqliteD1();
        await db.prepare('DROP TABLE sessions').run();
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const res = await app.request('/api/auth/session', {
                headers: { Authorization: 'Bearer sec07-secret-token' },
            }, env(db));
            expect(res.status).toBe(500);
            const body = (await res.json()) as any;
            expect(body.success).toBe(false);
            expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('sec07-secret-token');
        } finally {
            errorSpy.mockRestore();
        }
    });

    it('missing or invalid sessions remain authoritative 200 user:null', async () => {
        const db = new SqliteD1();
        const missing = await app.request('/api/auth/session', {}, env(db));
        expect(missing.status).toBe(200);
        expect(((await missing.json()) as any)?.data?.user).toBeNull();

        const invalid = await app.request('/api/auth/session', {
            headers: { Authorization: 'Bearer not-a-real-session' },
        }, env(db));
        expect(invalid.status).toBe(200);
        expect(((await invalid.json()) as any)?.data?.user).toBeNull();
    });
});
