/**
 * @file tests/helpers/sqlite-d1.ts
 * @description Minimal D1Database-compatible shim backed by node:sqlite that
 * loads the project's REAL migrations, so tests execute production SQL
 * (scoring arithmetic, ORDER BY, datetime() buckets) instead of a
 * hand-rolled approximation.
 *
 * Test-only helper (B14). No application code imports this file, and no
 * runtime dependency is added: node:sqlite is a Node.js builtin (Node 22+),
 * and vitest already runs with `environment: 'node'`.
 *
 * Why this exists: tests/api/recommendations-ranking.test.ts must pin the
 * RANKING produced by RecommendationEngine, not merely the presence of rows.
 * Ranking is computed inside SQL, so the assertions are only meaningful when
 * the real SQL actually runs.
 */

import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

/** Directory holding the numbered migration files. */
const MIGRATIONS_DIR = join(process.cwd(), 'migrations');

/**
 * D1-like prepared statement. Mirrors the subset of the D1 API used by the
 * models/services under test: bind() -> all() / first() / run().
 */
class SqliteStatement {
    constructor(
        private readonly raw: any,
        private readonly sql: string,
        private readonly params: unknown[] = []
    ) { }

    bind(...params: unknown[]): SqliteStatement {
        return new SqliteStatement(this.raw, this.sql, params);
    }

    /** Raw SQL text — SqliteD1.batch() needs it to tell reads from writes. */
    get sqlText(): string {
        return this.sql;
    }

    /**
     * node:sqlite only accepts null, number, bigint, string and Uint8Array.
     * D1 rejects undefined as well, so normalise it to null like D1 does not
     * silently coerce — we fail loudly instead if a param is unusable.
     */
    private safeParams(): any[] {
        return this.params.map((value) => (value === undefined ? null : value as any));
    }

    private normalizedSql(): string {
        // D1 tolerates datetime("now") (double-quoted string); node:sqlite treats
        // "now" as an identifier and throws `no such column: "now"`. Production
        // code (SessionModel) uses the double-quoted form, so normalize it here
        // in the TEST SHIM ONLY — no application SQL is touched (F-5A scope).
        return this.sql.replace(/datetime\("now"\)/g, "datetime('now')");
    }

    private rows(): any[] {
        return this.raw.prepare(this.normalizedSql()).all(...this.safeParams());
    }

    async first<T = any>(): Promise<T | null> {
        const rows = this.rows();
        return rows.length > 0 ? (rows[0] as T) : null;
    }

    async all<T = any>(): Promise<{ results: T[]; success: boolean; meta: Record<string, unknown> }> {
        const results = this.rows();
        return { results: results as T[], success: true, meta: {} };
    }

    async run(): Promise<{
        success: boolean;
        meta: { last_row_id: number | null; changes: number };
    }> {
        const outcome = this.raw.prepare(this.normalizedSql()).run(...this.safeParams());
        return {
            success: true,
            meta: {
                last_row_id: outcome.lastInsertRowid == null ? null : Number(outcome.lastInsertRowid),
                changes: Number(outcome.changes)
            }
        };
    }
}

/**
 * In-memory SQLite database wrapped in the D1 API surface.
 */
export class SqliteD1 {
    private readonly db: any;

    constructor() {
        this.db = new DatabaseSync(':memory:');
        this.db.exec('PRAGMA foreign_keys = ON');
        for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort()) {
            this.db.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
        }
    }

    prepare(sql: string): SqliteStatement {
        return new SqliteStatement(this.db, sql);
    }

    /**
     * Execute a batch of prepared statements the way D1 does: one serialized
     * write transaction, statements run in order, and NO short-circuit when a
     * statement reports changes = 0. SELECTs come back with their rows so a
     * caller can read a value back out of the batch (RateLimitService does
     * exactly that), which is what makes guard-based batch logic testable.
     */
    async batch(
        statements: SqliteStatement[]
    ): Promise<Array<{ success: boolean; meta: { changes: number; last_row_id: number | null }; results?: unknown[] }>> {
        const results: Array<{ success: boolean; meta: { changes: number; last_row_id: number | null }; results?: unknown[] }> = [];
        this.db.exec('BEGIN');
        try {
            for (const statement of statements) {
                if (statement.sqlText.trim().toLowerCase().startsWith('select')) {
                    const rows = await statement.all();
                    results.push({ success: true, meta: { changes: 0, last_row_id: null }, results: rows.results });
                } else {
                    results.push(await statement.run());
                }
            }
            this.db.exec('COMMIT');
        } catch (error) {
            this.db.exec('ROLLBACK');
            throw error;
        }
        return results;
    }

    /** Raw statement execution for fixture setup (multiple rows, no bindings). */
    exec(sql: string): void {
        this.db.exec(sql);
    }

    close(): void {
        this.db.close();
    }
}

/**
 * Create a fresh in-memory database carrying the full production schema.
 */
export function createSqliteD1(): SqliteD1 {
    return new SqliteD1();
}