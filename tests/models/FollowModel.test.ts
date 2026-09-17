import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FollowModel } from '../../src/models/FollowModel';
import { UserBlockModel } from '../../src/models/UserBlockModel';
import { BlockedInteractionError } from '../../src/lib/errors/AppError';
import { createSqliteD1, type SqliteD1 } from '../helpers/sqlite-d1';
import { readFileSync } from 'node:fs';

describe('F-5B FollowModel', () => {
    let db: SqliteD1;
    let model: FollowModel;
    beforeEach(() => {
        db = createSqliteD1();
        db.exec(`INSERT INTO users (id, email, username, password_hash, display_name) VALUES
            (1, 'a@test.local', 'a', 'x', 'A'), (2, 'b@test.local', 'b', 'x', 'B'), (3, 'c@test.local', 'c', 'x', 'C')`);
        model = new FollowModel(db as unknown as D1Database);
    });
    afterEach(() => { vi.restoreAllMocks(); db.close(); });

    it('owns the five methods outside the HTTP layer', () => {
        const controller = readFileSync('src/controllers/UserController.ts', 'utf8');
        const source = readFileSync('src/models/FollowModel.ts', 'utf8');
        expect(controller).not.toContain('class FollowModel');
        expect(controller).toContain("import { FollowModel } from '../models/FollowModel'");
        expect(source).not.toMatch(/AppContext|from ['"]hono/);
    });

    it('preserves directional relations, duplicate inserts, counts and deletion return values', async () => {
        expect(await model.isFollowing(1, 2)).toBe(false);
        expect(await model.getFollowersCount(2)).toBe(0);
        expect(await model.getFollowingCount(1)).toBe(0);
        expect(await model.follow(1, 2)).toBe(true);
        expect(await model.follow(1, 2)).toBe(true);
        expect(await model.follow(3, 2)).toBe(true);
        expect(await model.follow(2, 1)).toBe(true);
        expect(await model.isFollowing(1, 2)).toBe(true);
        expect(await model.isFollowing(2, 3)).toBe(false);
        expect(await model.getFollowersCount(2)).toBe(2);
        expect(await model.getFollowingCount(2)).toBe(1);
        const row = await db.prepare('SELECT created_at FROM follows WHERE follower_id = 1 AND following_id = 2').first();
        expect(row.created_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
        expect(await model.unfollow(1, 2)).toBe(true);
        expect(await model.unfollow(1, 2)).toBe(false);
        expect(await model.isFollowing(2, 1)).toBe(true);
        expect(await model.getFollowersCount(2)).toBe(1);
    });

    it.each([[1, 2], [2, 1]])('preserves central block guard for %s -> %s without writes', async (a, b) => {
        db.exec(`INSERT INTO user_blocks (blocker_id, blocked_id) VALUES (${a}, ${b})`);
        const guard = vi.spyOn(UserBlockModel.prototype, 'isBlockedBetween');
        await expect(model.follow(1, 2)).rejects.toBeInstanceOf(BlockedInteractionError);
        expect(guard).toHaveBeenCalledExactlyOnceWith(1, 2);
        expect(await model.isFollowing(1, 2)).toBe(false);
    });

    it('returns false on insertion failure but propagates guard failures', async () => {
        db.exec(`CREATE TRIGGER fail_follow BEFORE INSERT ON follows BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
        expect(await model.follow(1, 2)).toBe(false);
        expect(await model.isFollowing(1, 2)).toBe(false);
        const failure = new Error('guard unavailable');
        vi.spyOn(UserBlockModel.prototype, 'isBlockedBetween').mockRejectedValueOnce(failure);
        await expect(model.follow(1, 2)).rejects.toBe(failure);
    });

    it('propagates delete and read failures without converting them to false or zero', async () => {
        db.exec('DROP TABLE follows');
        await expect(model.unfollow(1, 2)).rejects.toThrow();
        await expect(model.isFollowing(1, 2)).rejects.toThrow();
        await expect(model.getFollowersCount(2)).rejects.toThrow();
        await expect(model.getFollowingCount(1)).rejects.toThrow();
    });

    it('preserves null count fallback and exact SQL/bindings', async () => {
        const first = vi.fn().mockResolvedValue(null);
        const bind = vi.fn().mockReturnValue({ first });
        const prepare = vi.fn().mockReturnValue({ bind });
        const empty = new FollowModel({ prepare } as unknown as D1Database);
        expect(await empty.getFollowersCount(7)).toBe(0);
        expect(await empty.getFollowingCount(8)).toBe(0);
        expect(await empty.isFollowing(7, 8)).toBe(false);
        expect(prepare.mock.calls).toEqual([
            ['SELECT COUNT(*) as count FROM follows WHERE following_id = ?'],
            ['SELECT COUNT(*) as count FROM follows WHERE follower_id = ?'],
            ['SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?'],
        ]);
        expect(bind.mock.calls).toEqual([[7], [8], [7, 8]]);
    });
});
