import { UserBlockModel } from './UserBlockModel';
import { BlockedInteractionError } from '../lib/errors/AppError';

/** Follow relationships. Extracted unchanged from UserController (F-5B). */
export class FollowModel {
    constructor(private db: D1Database) { }

    async follow(followerId: number, followingId: number): Promise<boolean> {
        // B6: cannot follow a user you're blocked by or have blocked.
        const blocked = await new UserBlockModel(this.db).isBlockedBetween(followerId, followingId);
        if (blocked) {
            throw new BlockedInteractionError();
        }
        try {
            // R2-F: INSERT OR IGNORE is idempotent — report whether this call
            // created the row so callers can skip duplicate side-effects
            // (e.g. a second follow notification for an existing follow).
            const result = await this.db.prepare(
                'INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, datetime("now"))'
            ).bind(followerId, followingId).run();
            return (result.meta.changes ?? 0) > 0;
        } catch {
            return false;
        }
    }

    async unfollow(followerId: number, followingId: number): Promise<boolean> {
        const result = await this.db.prepare(
            'DELETE FROM follows WHERE follower_id = ? AND following_id = ?'
        ).bind(followerId, followingId).run();
        return result.meta.changes > 0;
    }

    async isFollowing(followerId: number, followingId: number): Promise<boolean> {
        const result = await this.db.prepare(
            'SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?'
        ).bind(followerId, followingId).first();
        return result !== null;
    }

    async getFollowersCount(userId: number): Promise<number> {
        const result = await this.db.prepare(
            'SELECT COUNT(*) as count FROM follows WHERE following_id = ?'
        ).bind(userId).first() as { count: number } | null;
        return result?.count || 0;
    }

    async getFollowingCount(userId: number): Promise<number> {
        const result = await this.db.prepare(
            'SELECT COUNT(*) as count FROM follows WHERE follower_id = ?'
        ).bind(userId).first() as { count: number } | null;
        return result?.count || 0;
    }
}
