import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { t } from '../../src/i18n';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';

// Behavioral pins run against the inline model before extraction and the
// relocated model afterwards, through the real app and migration-backed SQL.
describe('F-5B follow controller behavior', () => {
    let db: SqliteD1;
    let requestId = 0;
    beforeEach(() => {
        db = createSqliteD1();
        db.exec(`
            INSERT INTO users (id, email, username, password_hash, display_name, is_verified)
            VALUES (1, 'f5b-a@test.local', 'f5b_a', 'x', 'F5B A', 1),
                   (2, 'f5b-b@test.local', 'f5b_b', 'x', 'F5B B', 1);
            INSERT INTO sessions (id, user_id, expires_at)
            VALUES ('f5b-session', 1, datetime('now', '+1 day'));
        `);
    });
    afterEach(() => db.close());

    function call(method: string, path: string, authenticated = true, lang: 'ar' | 'en' = 'en') {
        return app.request(`${path}?lang=${lang}`, {
            method,
            headers: {
                ...(authenticated ? { Authorization: 'Bearer f5b-session' } : {}),
                'X-CSRF-Token': 'test',
                'X-Forwarded-For': `10.55.0.${++requestId}`,
            },
        }, { DB: db as unknown as D1Database } as never);
    }

    it('preserves duplicate follow success, one relation, and one notification per call', async () => {
        for (let i = 0; i < 2; i++) {
            const res = await call('POST', '/api/users/2/follow');
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ success: true, data: { followed: true } });
        }
        expect((await db.prepare('SELECT * FROM follows').all()).results).toHaveLength(1);
        const notifications = (await db.prepare('SELECT * FROM notifications ORDER BY id').all()).results;
        expect(notifications).toHaveLength(2);
        for (const row of notifications) {
            expect(row).toMatchObject({ user_id: 2, type: 'follow', reference_type: 'user', reference_id: 1 });
            expect(JSON.parse(row.message)).toEqual({ actor: 'F5B A' });
        }
        const profile = await call('GET', '/api/users/f5b_b');
        expect(profile.status).toBe(200);
        expect(await profile.json()).toMatchObject({ success: true, data: {
            followers_count: 1, following_count: 0, is_following: true,
        } });
        const guest = await call('GET', '/api/users/f5b_b', false);
        expect(await guest.json()).toMatchObject({ data: { followers_count: 1, is_following: false } });
    });

    it('preserves successful and repeated unfollow responses without notifications', async () => {
        db.exec('INSERT INTO follows (follower_id, following_id) VALUES (1, 2)');
        for (let i = 0; i < 2; i++) {
            const res = await call('DELETE', '/api/users/2/follow');
            expect(res.status).toBe(200);
            expect(await res.json()).toEqual({ success: true, data: { unfollowed: true } });
        }
        expect((await db.prepare('SELECT * FROM follows').all()).results).toEqual([]);
        expect((await db.prepare('SELECT * FROM notifications').all()).results).toEqual([]);
    });

    it.each(['ar', 'en'] as const)('preserves auth, self-follow and bidirectional block errors in %s', async (lang) => {
        for (const method of ['POST', 'DELETE']) {
            const res = await call(method, '/api/users/2/follow', false, lang);
            expect(res.status).toBe(401);
        }
        const self = await call('POST', '/api/users/1/follow', true, lang);
        expect(self.status).toBe(400);
        expect(await self.json()).toEqual({ success: false, error: t('user_errors.cannot_follow_self', lang) });
        for (const pair of ['(1, 2)', '(2, 1)']) {
            db.exec(`DELETE FROM user_blocks; INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ${pair}`);
            const res = await call('POST', '/api/users/2/follow', true, lang);
            expect(res.status).toBe(403);
            expect(await res.json()).toEqual({ success: false, error: t('errors.blocked_interaction', lang) });
        }
        expect((await db.prepare('SELECT * FROM follows').all()).results).toEqual([]);
        expect((await db.prepare('SELECT * FROM notifications').all()).results).toEqual([]);
    });

    it('preserves ignored insert failure: controller still sends notification and reports success', async () => {
        db.exec(`CREATE TRIGGER fail_follow BEFORE INSERT ON follows BEGIN SELECT RAISE(ABORT, 'test insert failure'); END`);
        const res = await call('POST', '/api/users/2/follow');
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ success: true, data: { followed: true } });
        expect((await db.prepare('SELECT * FROM follows').all()).results).toEqual([]);
        expect((await db.prepare('SELECT * FROM notifications').all()).results).toHaveLength(1);
    });
});
