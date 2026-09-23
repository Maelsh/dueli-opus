/**
 * SyntheticRetirementService — C7 synthetic-data lifecycle (docs/12, C7 runbook).
 *
 * Policy (documented, no heuristics):
 * - Synthetic rows are `is_fake = 1`. Real rows are NEVER touched.
 * - After a REAL user signup (or OAuth creation), retire at most ONE synthetic
 *   user; after a REAL competition creation, at most ONE synthetic competition.
 * - A candidate is retired only if it is the OLDEST `is_fake = 1` row (non-admin
 *   for users) with ZERO referencing rows in EVERY table that holds an FK to
 *   it (see USER_DEPENDENTS / COMPETITION_DEPENDENTS, derived from
 *   migrations/*.sql and pinned by tests/models/SyntheticRetirement.test.ts
 *   via PRAGMA foreign_key_list coverage).
 * - Deletion uses plain DELETE; ON DELETE CASCADE/SET NULL actions defined in
 *   the schema apply. RESTRICT tables are all in the check lists, so the
 *   DELETE cannot fail on dependents — and can never orphan or destroy real data.
 */

type Dependent = { table: string; column: string };

/** Every (table, column) with an FK to users(id) in the final schema. */
export const USER_DEPENDENTS: Dependent[] = [
    { table: 'competitions', column: 'creator_id' },
    { table: 'competitions', column: 'opponent_id' },
    { table: 'competitions', column: 'winner_id' },
    { table: 'competition_invites', column: 'inviter_id' },
    { table: 'competition_invites', column: 'invitee_id' },
    { table: 'competition_requests', column: 'requester_id' },
    { table: 'ratings', column: 'user_id' },
    { table: 'ratings', column: 'competitor_id' },
    { table: 'comments', column: 'user_id' },
    { table: 'follows', column: 'follower_id' },
    { table: 'follows', column: 'following_id' },
    { table: 'notifications', column: 'user_id' },
    { table: 'messages', column: 'sender_id' },
    { table: 'messages', column: 'receiver_id' },
    { table: 'scheduled_competitions', column: 'user_id' },
    { table: 'sessions', column: 'user_id' },
    { table: 'likes', column: 'user_id' },
    { table: 'reports', column: 'reporter_id' },
    { table: 'reports', column: 'reviewed_by' },
    { table: 'reports', column: 'assigned_admin_id' },
    { table: 'conversations', column: 'user1_id' },
    { table: 'conversations', column: 'user2_id' },
    { table: 'advertisements', column: 'created_by' },
    { table: 'advertisements', column: 'advertiser_id' },
    { table: 'ad_impressions', column: 'user_id' },
    { table: 'user_earnings', column: 'user_id' },
    { table: 'user_settings', column: 'user_id' },
    { table: 'user_posts', column: 'user_id' },
    { table: 'competition_reminders', column: 'user_id' },
    { table: 'dislikes', column: 'user_id' },
    { table: 'competition_invitations', column: 'inviter_id' },
    { table: 'competition_invitations', column: 'invitee_id' },
    { table: 'ad_blocks', column: 'user_id' },
    { table: 'donations', column: 'user_id' },
    { table: 'donations', column: 'recipient_user_id' },
    { table: 'withdrawal_requests', column: 'user_id' },
    { table: 'withdrawal_requests', column: 'approved_by' },
    { table: 'payment_methods', column: 'user_id' },
    { table: 'user_blocks', column: 'blocker_id' },
    { table: 'user_blocks', column: 'blocked_id' },
    { table: 'watch_history', column: 'user_id' },
    { table: 'user_keywords', column: 'user_id' },
    { table: 'watch_later', column: 'user_id' },
    { table: 'admin_audit_logs', column: 'admin_id' },
    { table: 'admin_roles', column: 'user_id' },
    { table: 'admin_roles', column: 'granted_by' },
    { table: 'platform_settings', column: 'updated_by' },
    { table: 'report_state_transitions', column: 'admin_id' },
    { table: 'competition_suspensions', column: 'admin_id' },
    { table: 'competition_suspensions', column: 'restored_by' },
    { table: 'user_hidden_competitions', column: 'user_id' },
    { table: 'competition_heartbeats', column: 'user_id' },
    { table: 'chunk_keys', column: 'user_id' },
    { table: 'realtime_tickets', column: 'user_id' },
    { table: 'ad_click_tokens', column: 'user_id' },
    { table: 'ad_clicks', column: 'user_id' },
    { table: 'ad_impression_dedup', column: 'user_id' },
];

/** Every (table, column) with an FK to competitions(id) in the final schema. */
export const COMPETITION_DEPENDENTS: Dependent[] = [
    { table: 'competition_invites', column: 'competition_id' },
    { table: 'competition_requests', column: 'competition_id' },
    { table: 'ratings', column: 'competition_id' },
    { table: 'comments', column: 'competition_id' },
    { table: 'scheduled_competitions', column: 'competition_id' },
    { table: 'likes', column: 'competition_id' },
    { table: 'ad_impressions', column: 'competition_id' },
    { table: 'competition_reminders', column: 'competition_id' },
    { table: 'dislikes', column: 'competition_id' },
    { table: 'competition_invitations', column: 'competition_id' },
    { table: 'chunk_keys', column: 'competition_id' },
    { table: 'watch_history', column: 'competition_id' },
    { table: 'watch_later', column: 'competition_id' },
    { table: 'platform_financial_logs', column: 'competition_id' },
    { table: 'competition_revenue_logs', column: 'competition_id' },
    { table: 'competition_suspensions', column: 'competition_id' },
    { table: 'user_hidden_competitions', column: 'competition_id' },
    { table: 'competition_scheduled_tasks', column: 'competition_id' },
    { table: 'competition_heartbeats', column: 'competition_id' },
    { table: 'donations', column: 'competition_id' },
    { table: 'users', column: 'current_competition_id' },
];

async function existingTables(db: D1Database): Promise<Set<string>> {
    const out = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
    const rows = Array.isArray(out) ? out : (out as { results: { name: string }[] }).results;
    return new Set((rows ?? []).map((r) => r.name));
}

async function hasDependent(
    db: D1Database,
    deps: Dependent[],
    id: number,
    tables: Set<string>,
): Promise<boolean> {
    for (const dep of deps) {
        // A table that does not exist in this schema cannot hold dependents.
        if (!tables.has(dep.table)) continue;
        const row = await db.prepare(
            `SELECT 1 AS hit FROM ${dep.table} WHERE ${dep.column} = ? LIMIT 1`
        ).bind(id).first<{ hit: number }>().catch(() => ({ hit: 1 as number }));
        if (row) return true;
    }
    return false;
}

export class SyntheticRetirementService {
    constructor(private readonly db: D1Database) {}

    /**
     * Retire the oldest dependency-free synthetic user.
     * @returns retired user id, or null when nothing was safely retireable.
     */
    async retireOneSyntheticUser(): Promise<number | null> {
        const tables = await existingTables(this.db);
        const candidates = await this.db.prepare(
            'SELECT id FROM users WHERE is_fake = 1 AND (is_admin IS NULL OR is_admin = 0) ORDER BY id ASC LIMIT 10'
        ).all<{ id: number }>();
        const rows = Array.isArray(candidates)
            ? candidates
            : (candidates as { results: { id: number }[] }).results;
        for (const candidate of rows ?? []) {
            if (await hasDependent(this.db, USER_DEPENDENTS, candidate.id, tables)) continue;
            await this.db.prepare('DELETE FROM users WHERE id = ? AND is_fake = 1').bind(candidate.id).run();
            return candidate.id;
        }
        return null;
    }

    /**
     * Retire the oldest dependency-free synthetic competition.
     * @returns retired competition id, or null when nothing was safely retireable.
     */
    async retireOneSyntheticCompetition(): Promise<number | null> {
        const tables = await existingTables(this.db);
        const candidates = await this.db.prepare(
            'SELECT id FROM competitions WHERE is_fake = 1 ORDER BY id ASC LIMIT 10'
        ).all<{ id: number }>();
        const rows = Array.isArray(candidates)
            ? candidates
            : (candidates as { results: { id: number }[] }).results;
        for (const candidate of rows ?? []) {
            if (await hasDependent(this.db, COMPETITION_DEPENDENTS, candidate.id, tables)) continue;
            await this.db.prepare('DELETE FROM competitions WHERE id = ? AND is_fake = 1').bind(candidate.id).run();
            return candidate.id;
        }
        return null;
    }
}
