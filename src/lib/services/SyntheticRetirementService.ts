/**
 * SyntheticRetirementService — C7 synthetic-data lifecycle (docs/12, C7 runbook),
 * extended in UNIT41.1 to the owner's mandate:
 *
 * Policy (documented, no heuristics):
 * - Synthetic rows are `is_fake = 1` (`COALESCE(is_fake, 0) = 0` is real). Real
 *   rows are NEVER touched, deleted, unlinked or nulled by this service.
 * - After a REAL user signup (or OAuth creation), retire at most ONE synthetic
 *   user; after a REAL competition creation, at most ONE synthetic competition —
 *   the OLDEST `is_fake = 1` row (non-admin for users).
 * - Retirement covers the synthetic subtree ONLY: the candidate plus every
 *   dependent row whose referenced users are ALL synthetic (and which is not
 *   money-bearing or audit/config evidence — see HARD_BLOCK_TABLES).
 * - HARD_BLOCK_TABLES hold money, ad billing, audit and admin evidence and
 *   global configuration. ANY row there referencing the candidate blocks that
 *   row from retirement forever (no delete, no null, no update) — an evidence
 *   trail is never auto-destroyed.
 * - A REAL link — a dependent row involving any `is_fake = 0` user, or a REAL
 *   competition (is_fake = 0) in any way linked to the candidate — blocks THAT
 *   ROW forever. Deterministic re-checks mean it is never retried into a
 *   different outcome; the row is simply never retired.
 * - Every DELETE/UPDATE statement carries its own all-synthetic guard in SQL,
 *   so even a partial failure can never remove real data. Failures abort the
 *   remaining statements and are logged; the host signup/creation flow is
 *   never broken (callers wrap in try/catch).
 * - `users.current_competition_id` is never written: the column is
 *   `ON DELETE SET NULL`, so removing a synthetic competition already unlinks
 *   any current watcher automatically (pointer cleanup only, no data loss).
 *
 * Verification of the row deletion order: synthetic children (comments,
 * ratings, …) first, then synthetic competitions, then the synthetic user —
 * so NO ACTION foreign keys are never violated mid-run.
 */

type Dependent = { table: string; column: string };

/** Every (table, column) with an FK to users(id) in the final schema. */
export const USER_DEPENDENTS: Dependent[] = [
    { table: 'competitions', column: 'creator_id' },
    { table: 'competitions', column: 'opponent_id' },
    { table: 'competitions', column: 'winner_id' },
    // UNIT30.4: the confirmed early-end actor and the separate result-credit
    // ledger both reference users; synthetic retirement must see them.
    { table: 'competitions', column: 'ended_by_user_id' },
    { table: 'competition_result_credits', column: 'competitor_id' },
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
    // R2-M: independent admin-messaging FKs to users (0037). Users with
    // support rows are never retirement candidates, so support data is
    // never auto-destroyed and deletes can never fail on these FKs.
    { table: 'support_threads', column: 'user_id' },
    { table: 'support_messages', column: 'sender_id' },
    // UNIT36.1: competitor ad-control policy + manual-approval grants
    // reference users (0044). A user with ad-control rows is never a
    // retirement candidate, so those rows are never auto-destroyed.
    { table: 'user_ad_policy', column: 'user_id' },
    { table: 'user_ad_grants', column: 'user_id' },
];

/** Every (table, column) with an FK to competitions(id) in the final schema. */
export const COMPETITION_DEPENDENTS: Dependent[] = [
    { table: 'competition_invites', column: 'competition_id' },
    { table: 'competition_requests', column: 'competition_id' },
    // UNIT30.4: result credits are competition-owned audit rows.
    { table: 'competition_result_credits', column: 'competition_id' },
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
    // R2-L1: qualified daily views reference their competition (0034).
    { table: 'competition_views', column: 'competition_id' },
    // R4-CHUNK-INDEX-1 (row 27): chunk metadata + final markers reference
    // their competition (0041, cascade on delete). Missing tables are
    // skipped by hasDependent, so this is safe before 0041 is applied.
    { table: 'recording_chunks', column: 'competition_id' },
    { table: 'recording_finals', column: 'competition_id' },
    // R4-CHUNK-UPLOAD-SAFE-1: recorder lease rows reference their
    // competition (0040, cascade on delete; extracted lifecycle, PR110/HOLD
    // preserved for row 30). Missing tables are skipped by hasDependent.
    { table: 'recording_leases', column: 'competition_id' },
];

/**
 * Money, billing, audit and global-config evidence. A single row in any of
 * these referencing the candidate blocks ITS retirement forever — never a
 * delete, never a null, never an update. (All of them are also present in
 * the dependent lists above, which is what the pin test enforces.)
 */
export const HARD_BLOCK_TABLES: ReadonlySet<string> = new Set([
    // Money: earnings, withdrawals, payout methods, donations, ledgers.
    'user_earnings',
    'withdrawal_requests',
    'payment_methods',
    'donations',
    'platform_financial_logs',
    'competition_revenue_logs',
    'competition_result_credits',
    // Ad billing evidence (impressions/clicks were charged, or gate spend).
    'advertisements',
    'ad_impressions',
    'ad_clicks',
    'ad_click_tokens',
    'ad_impression_dedup',
    'user_ad_grants',
    // Admin / audit / moderation evidence.
    'admin_audit_logs',
    'admin_roles',
    'reports',
    'report_state_transitions',
    'competition_suspensions',
    // Global platform configuration (shared, never owned by one row).
    'platform_settings',
    // Support evidence (admin<->user threads).
    'support_threads',
    'support_messages',
]);

/** user-id columns per table, derived from the pin list (single source). */
const USER_COLUMNS: Readonly<Record<string, readonly string[]>> = (() => {
    const map: Record<string, string[]> = {};
    for (const dep of USER_DEPENDENTS) {
        (map[dep.table] ??= []).push(dep.column);
    }
    return map;
})();

const BATCH_CHUNK = 200;

async function existingTables(db: D1Database): Promise<Set<string>> {
    const out = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
    const rows = Array.isArray(out) ? out : (out as { results: { name: string }[] }).results;
    return new Set((rows ?? []).map((r) => r.name));
}

type Row = Record<string, unknown> & { rowid: number };

async function selectDependentRows(
    db: D1Database,
    table: string,
    column: string,
    id: number,
): Promise<Row[]> {
    const stmt = db.prepare(`SELECT rowid AS rowid, * FROM ${table} WHERE ${column} = ?`).bind(id);
    const out = await stmt.all<Row>();
    return Array.isArray(out) ? out : (out as { results: Row[] }).results ?? [];
}

/** Resolve is_fake for a set of user ids; unknown ids count as REAL (fail closed). */
class FakeResolver {
    private readonly cache = new Map<number, boolean>();

    constructor(private readonly db: D1Database) {}

    async isFake(id: number): Promise<boolean> {
        const cached = this.cache.get(id);
        if (cached !== undefined) return cached;
        const row = await this.db.prepare(
            'SELECT COALESCE(is_fake, 0) AS fake FROM users WHERE id = ?'
        ).bind(id).first<{ fake: number }>();
        const fake = row ? Number(row.fake) === 1 : false;
        this.cache.set(id, fake);
        return fake;
    }

    async allFake(ids: Array<number | null | undefined>): Promise<boolean> {
        for (const raw of ids) {
            if (raw === null || raw === undefined) continue;
            if (!Number.isInteger(raw) || raw <= 0) continue;
            if (!(await this.isFake(raw))) return false;
        }
        return true;
    }
}

interface RetirementPlan {
    /** table -> rowids to delete (never includes 'users' / 'competitions'). */
    deletes: Map<string, Set<number>>;
    /** Synthetic competition ids to delete (after their children). */
    competitions: Set<number>;
    /** The synthetic user id to delete, or null for competition-only plans. */
    userId: number | null;
}

class Planner {
    private readonly deletes = new Map<string, Set<number>>();
    private readonly competitions = new Set<number>();
    private readonly visitedCompetitions = new Set<number>();
    private blocked = false;

    constructor(
        private readonly db: D1Database,
        private readonly tables: Set<string>,
        private readonly fakes: FakeResolver,
    ) {}

    isBlocked(): boolean {
        return this.blocked;
    }

    private addDelete(table: string, rowid: number): void {
        const set = this.deletes.get(table) ?? new Set<number>();
        set.add(rowid);
        this.deletes.set(table, set);
    }

    /** Merge another plan's deletes/competitions into this one. */
    private absorb(other: RetirementPlan): void {
        for (const [table, ids] of other.deletes) {
            for (const id of ids) this.addDelete(table, id);
        }
        for (const id of other.competitions) this.competitions.add(id);
    }

    /**
     * Plan the retirement of one synthetic competition and its synthetic
     * subtree. Returns null when ANY row linked to it is real/money/audit
     * (fail closed — nothing is retired).
     */
    async planCompetition(id: number): Promise<RetirementPlan | null> {
        if (this.visitedCompetitions.has(id)) {
            return { deletes: new Map(), competitions: new Set(), userId: null };
        }
        this.visitedCompetitions.add(id);

        // The candidate row itself: creator_id is seeding/provisioning (all
        // user-facing creates set is_fake = 0, so a synthetic competition is
        // never an organic real user's content) and does NOT block. A REAL
        // opponent / winner / early-end actor means a real person actually
        // PARTICIPATED in this synthetic fixture — that link protects it
        // forever (their participation rows would be destroyed otherwise).
        const candidateRow = await this.db.prepare(
            'SELECT opponent_id, winner_id, ended_by_user_id FROM competitions WHERE id = ?'
        ).bind(id).first<{ opponent_id: number | null; winner_id: number | null; ended_by_user_id: number | null }>();
        if (candidateRow) {
            if (!(await this.fakes.allFake([candidateRow.opponent_id, candidateRow.winner_id, candidateRow.ended_by_user_id]))) {
                console.info(`[SyntheticRetirement] competition ${id} blocked: real opponent/winner/actor on the candidate row`);
                this.blocked = true;
                return null;
            }
        }

        const local = new Planner(this.db, this.tables, this.fakes);
        const deps = COMPETITION_DEPENDENTS;
        for (const dep of deps) {
            if (!this.tables.has(dep.table)) continue;
            const rows = await selectDependentRows(this.db, dep.table, dep.column, id);
            if (rows.length === 0) continue;
            if (HARD_BLOCK_TABLES.has(dep.table)) {
                console.info(`[SyntheticRetirement] competition ${id} blocked: money/audit rows in ${dep.table}`);
                this.blocked = true;
                return null;
            }
            if (dep.table === 'users') {
                // current_competition_id: ON DELETE SET NULL cleans the pointer
                // automatically. A REAL user parked on a synthetic competition
                // is a real link — fail closed.
                for (const row of rows) {
                    if (!(await this.fakes.isFake(Number(row.id)))) {
                        console.info(`[SyntheticRetirement] competition ${id} blocked: real user ${String(row.id)} current_competition_id`);
                        this.blocked = true;
                        return null;
                    }
                }
                continue; // no statement needed; schema unlinks on delete
            }
            const userCols = USER_COLUMNS[dep.table] ?? [];
            for (const row of rows) {
                const involved = userCols.map((c) => row[c] as number | null);
                if (!(await this.fakes.allFake(involved))) {
                    console.info(`[SyntheticRetirement] competition ${id} blocked: real user involved in ${dep.table} row ${row.rowid}`);
                    this.blocked = true;
                    return null;
                }
                local.addDelete(dep.table, row.rowid);
            }
        }

        local.competitions.add(id);
        this.absorb({ deletes: local.deletes, competitions: local.competitions, userId: null });
        return { deletes: this.deletes, competitions: this.competitions, userId: null };
    }

    /**
     * Plan the retirement of one synthetic user and its synthetic subtree.
     * Synthetic competitions the user is linked to are retired with it;
     * one real competition link blocks everything (fail closed).
     */
    async planUser(id: number): Promise<RetirementPlan | null> {
        const plannedCompetitions = new Set<number>();
        const deps = USER_DEPENDENTS;
        for (const dep of deps) {
            if (!this.tables.has(dep.table)) continue;
            const rows = await selectDependentRows(this.db, dep.table, dep.column, id);
            if (rows.length === 0) continue;
            if (HARD_BLOCK_TABLES.has(dep.table)) {
                console.info(`[SyntheticRetirement] user ${id} blocked: money/audit rows in ${dep.table}`);
                this.blocked = true;
                return null;
            }
            if (dep.table === 'competitions') {
                for (const row of rows) {
                    const isFakeCompetition = Number(row.is_fake ?? 0) === 1;
                    if (!isFakeCompetition) {
                        console.info(`[SyntheticRetirement] user ${id} blocked: link to REAL competition ${String(row.id)}`);
                        this.blocked = true;
                        return null;
                    }
                    const competitionId = Number(row.id);
                    if (plannedCompetitions.has(competitionId)) continue;
                    plannedCompetitions.add(competitionId);
                    const sub = await new Planner(this.db, this.tables, this.fakes)
                        .planCompetition(competitionId);
                    if (!sub) {
                        this.blocked = true;
                        return null;
                    }
                    this.absorb(sub);
                }
                continue;
            }
            const userCols = USER_COLUMNS[dep.table] ?? [];
            for (const row of rows) {
                const involved = userCols.map((c) => row[c] as number | null);
                if (!(await this.fakes.allFake(involved))) {
                    console.info(`[SyntheticRetirement] user ${id} blocked: real user involved in ${dep.table} row ${row.rowid}`);
                    this.blocked = true;
                    return null;
                }
                this.addDelete(dep.table, row.rowid);
            }
        }

        return { deletes: this.deletes, competitions: this.competitions, userId: id };
    }
}

/**
 * All-synthetic guard for a table's user columns: every user reference must
 * either be NULL or point at a synthetic user. Defense in depth — the rows
 * were verified at plan time; this re-verifies at delete time.
 */
function syntheticGuard(table: string): string {
    const cols = USER_COLUMNS[table] ?? [];
    return cols
        .map((c) => `(${c} IS NULL OR ${c} IN (SELECT id FROM users WHERE COALESCE(is_fake, 0) = 1))`)
        .join(' AND ');
}

interface SqlStatement {
    sql: string;
    binds: Array<number | string | null>;
}

function buildStatements(plan: RetirementPlan): SqlStatement[] {
    const statements: SqlStatement[] = [];

    const sortedTables = [...plan.deletes.keys()].sort((a, b) => {
        // comments carry a self FK (parent_id) — deepest nesting first by id DESC.
        if (a === 'comments') return -1;
        if (b === 'comments') return 1;
        return a.localeCompare(b);
    });

    for (const table of sortedTables) {
        const guard = syntheticGuard(table);
        let ids = [...plan.deletes.get(table)!];
        if (table === 'comments') ids = ids.sort((a, b) => b - a);
        const guardSql = guard ? ` AND ${guard}` : '';
        for (let i = 0; i < ids.length; i += 90) {
            const chunk = ids.slice(i, i + 90);
            const placeholders = chunk.map(() => '?').join(',');
            statements.push({
                sql: `DELETE FROM ${table} WHERE rowid IN (${placeholders})${guardSql}`,
                binds: chunk,
            });
        }
    }

    if (plan.competitions.size > 0) {
        const ids = [...plan.competitions];
        const placeholders = ids.map(() => '?').join(',');
        // Never delete a real competition. The opponent/winner/ended_by
        // links were verified all-synthetic at plan time AND are re-checked
        // here; the creator link is seeding/provisioning and is not gated.
        statements.push({
            sql: `DELETE FROM competitions WHERE id IN (${placeholders}) AND is_fake = 1
                    AND (opponent_id IS NULL OR opponent_id IN (SELECT id FROM users WHERE COALESCE(is_fake, 0) = 1))
                    AND (winner_id IS NULL OR winner_id IN (SELECT id FROM users WHERE COALESCE(is_fake, 0) = 1))
                    AND (ended_by_user_id IS NULL OR ended_by_user_id IN (SELECT id FROM users WHERE COALESCE(is_fake, 0) = 1))
                    -- Defense in depth: zero money/audit rows may exist either (plan-time
                    -- already proved this; re-proven here at delete time).
                    AND NOT EXISTS (SELECT 1 FROM donations d WHERE d.competition_id = competitions.id)
                    AND NOT EXISTS (SELECT 1 FROM platform_financial_logs p WHERE p.competition_id = competitions.id)
                    AND NOT EXISTS (SELECT 1 FROM competition_revenue_logs r WHERE r.competition_id = competitions.id)
                    AND NOT EXISTS (SELECT 1 FROM competition_result_credits c WHERE c.competition_id = competitions.id)
                    AND NOT EXISTS (SELECT 1 FROM ad_impressions a WHERE a.competition_id = competitions.id)`,
            binds: ids,
        });
    }

    if (plan.userId !== null) {
        statements.push({
            sql: `DELETE FROM users WHERE id = ? AND is_fake = 1 AND (is_admin IS NULL OR is_admin = 0)
                    AND NOT EXISTS (SELECT 1 FROM admin_roles WHERE user_id = ?)
                    -- Defense in depth: zero money/audit rows (plan-time proved it).
                    AND NOT EXISTS (SELECT 1 FROM user_earnings WHERE user_id = ?)
                    AND NOT EXISTS (SELECT 1 FROM withdrawal_requests WHERE user_id = ? OR approved_by = ?)
                    AND NOT EXISTS (SELECT 1 FROM payment_methods WHERE user_id = ?)
                    AND NOT EXISTS (SELECT 1 FROM donations WHERE user_id = ? OR recipient_user_id = ?)`,
            binds: [plan.userId, plan.userId, plan.userId, plan.userId, plan.userId, plan.userId, plan.userId, plan.userId],
        });
    }

    return statements;
}

async function executePlan(db: D1Database, plan: RetirementPlan): Promise<void> {
    const statements = buildStatements(plan);
    if (statements.length === 0) return;
    const prepared = statements.map((s) => db.prepare(s.sql).bind(...s.binds));
    // Small plans run in ONE atomic batch; huge ones run in sequential,
    // self-guarding chunks (a failure aborts the rest; real rows are never
    // at risk because every statement carries its own synthetic guard).
    if (prepared.length <= BATCH_CHUNK) {
        await db.batch(prepared);
        return;
    }
    for (let i = 0; i < prepared.length; i += BATCH_CHUNK) {
        await db.batch(prepared.slice(i, i + BATCH_CHUNK));
    }
}

export class SyntheticRetirementService {
    constructor(private readonly db: D1Database) {}

    /**
     * Retire the oldest dependency-safe synthetic user (and its synthetic
     * subtree). Returns the retired user id, or null when nothing is safely
     * retireable. Throws on unexpected failure — callers wrap in try/catch.
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
            const fakes = new FakeResolver(this.db);
            const planner = new Planner(this.db, tables, fakes);
            const plan = await planner.planUser(candidate.id);
            if (!plan || planner.isBlocked()) {
                console.info(`[SyntheticRetirement] synthetic user ${candidate.id} permanently blocked (real money/interaction link)`);
                continue;
            }
            await executePlan(this.db, plan);
            console.info(`[SyntheticRetirement] retired synthetic user ${candidate.id} (+${plan.competitions.size} competition(s), ${[...plan.deletes.values()].reduce((n, s) => n + s.size, 0)} dependent row(s))`);
            return candidate.id;
        }
        return null;
    }

    /**
     * Retire the oldest dependency-safe synthetic competition (and its
     * synthetic subtree). Returns the retired competition id, or null.
     * Throws on unexpected failure — callers wrap in try/catch.
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
            const fakes = new FakeResolver(this.db);
            const planner = new Planner(this.db, tables, fakes);
            const plan = await planner.planCompetition(candidate.id);
            if (!plan || planner.isBlocked()) {
                console.info(`[SyntheticRetirement] synthetic competition ${candidate.id} permanently blocked (real money/interaction link)`);
                continue;
            }
            await executePlan(this.db, plan);
            console.info(`[SyntheticRetirement] retired synthetic competition ${candidate.id} (+${[...plan.deletes.values()].reduce((n, s) => n + s.size, 0)} dependent row(s))`);
            return candidate.id;
        }
        return null;
    }
}
