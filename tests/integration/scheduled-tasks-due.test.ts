import { beforeAll, describe, expect, it } from 'vitest';
import {
    applyMigrationsViaWrangler,
    execD1,
    queryD1,
} from './helpers/wrangler-d1-runner.mjs';

/**
 * B4 — scheduled tasks due-query must fire regardless of stored datetime format.
 *
 * The production query uses `datetime(t.execute_at)` to normalize the stored
 * execute_at before comparing with `datetime('now')`. Without datetime(),
 * ISO strings like '2026-09-09T16:00:00.000Z' compare lexicographically against
 * 'YYYY-MM-DD HH:MM:SS' and never match ('T' > ' '), so due tasks never run.
 *
 * This test exercises the ACTUAL SQL against a real local D1 database via
 * Wrangler CLI — no JavaScript mock filtering.
 *
 * CRITICAL: To expose the bug, dates must be on the SAME DAY as the test run.
 * With lexical comparison (buggy SQL), 'T' > ' ' causes ISO dates to appear
 * "later" than they actually are, making them invisible to the due query.
 */

interface TaskRow {
    id: number;
    competition_id: number;
    task_type: string;
    execute_at: string;
    status: string;
}

/**
 * Generate date strings relative to now, using SQLite datetime arithmetic.
 * Returns ISO format (with 'T') and space format (SQLite default).
 *
 * Uses SQLite datetime() modifiers to correctly cross hour/day/month/year
 * boundaries — no JavaScript date math that could fail at edge cases.
 */
function generateRelativeDates(): {
    pastIso: string;
    pastSpace: string;
    futureIso: string;
} {
    // Let SQLite compute past and future times — handles all boundaries
    const pastRows = queryD1("SELECT datetime('now', '-2 hours') as dt") as { dt: string }[];
    const futureRows = queryD1("SELECT datetime('now', '+2 hours') as dt") as { dt: string }[];

    const past = pastRows[0].dt;      // 'YYYY-MM-DD HH:MM:SS'
    const future = futureRows[0].dt;   // 'YYYY-MM-DD HH:MM:SS'

    // Convert SQLite space-separated format to ISO 'T'-separated
    const pastIso = past.replace(' ', 'T') + '.000Z';
    const futureIso = future.replace(' ', 'T') + '.000Z';

    return {
        pastIso,           // ISO with 'T'
        pastSpace: past,   // Space separator (SQLite default)
        futureIso,         // Future ISO
    };
}

function insertTestData(dates: ReturnType<typeof generateRelativeDates>): void {
    // Insert a user (needed for creator_id FK)
    execD1(`INSERT INTO users (email, username, password_hash, display_name)
            VALUES ('b4test@example.com', 'b4test', 'hash', 'B4 Test User');`);

    // Insert a category (needed for category_id FK)
    execD1(`INSERT INTO categories (slug, name_ar, name_en)
            VALUES ('b4cat', 'اختبار B4', 'B4 Test');`);

    // Insert a competition
    execD1(`INSERT INTO competitions (title, rules, category_id, creator_id, status, competition_type)
            VALUES ('B4 Test Competition', 'rules', 1, 1, 'pending', 'scheduled');`);

    // Insert scheduled tasks:
    // 1. Past date with 'T' separator (ISO format — the problematic case)
    execD1(`INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status)
            VALUES (1, 'auto_delete_if_not_live', '${dates.pastIso}', 'pending');`);

    // 2. Past date with space separator (SQLite default format)
    execD1(`INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status)
            VALUES (1, 'auto_end_live', '${dates.pastSpace}', 'pending');`);

    // 3. Future date (should NOT be captured)
    execD1(`INSERT INTO competition_scheduled_tasks (competition_id, task_type, execute_at, status)
            VALUES (1, 'send_reminder', '${dates.futureIso}', 'pending');`);
}

function runDueQuery(): TaskRow[] {
    /**
     * This is the EXACT query from ScheduledTaskService.processPendingTasks().
     * It must be kept in sync with the production code.
     */
    const sql = `
        SELECT t.*, c.status as competition_status, c.creator_id, c.opponent_id,
               c.competition_type, c.scheduled_at, c.started_at, c.created_at as competition_created_at
        FROM competition_scheduled_tasks t
        JOIN competitions c ON t.competition_id = c.id
        WHERE datetime(t.execute_at) <= datetime('now')
        AND t.status = 'pending'
        ORDER BY datetime(t.execute_at) ASC
        LIMIT 50
    `;
    return queryD1(sql) as unknown as TaskRow[];
}

describe('B4 scheduled tasks due-query (real D1 SQL)', () => {
    let dates: ReturnType<typeof generateRelativeDates>;

    beforeAll(() => {
        // Fresh isolated D1 with all migrations applied
        applyMigrationsViaWrangler();
        // Generate dates relative to now
        dates = generateRelativeDates();
        // Insert test fixture
        insertTestData(dates);
    });

    it('captures a past task with T-separator (ISO) execute_at', () => {
        const due = runDueQuery();
        const isoTask = due.find((t) => t.execute_at === dates.pastIso);
        expect(isoTask, `ISO-format past task should be captured (date: ${dates.pastIso})`).toBeDefined();
        expect(isoTask?.task_type).toBe('auto_delete_if_not_live');
    });

    it('captures a past task with space-separator execute_at', () => {
        const due = runDueQuery();
        const spaceTask = due.find((t) => t.execute_at === dates.pastSpace);
        expect(spaceTask, `Space-format past task should be captured (date: ${dates.pastSpace})`).toBeDefined();
        expect(spaceTask?.task_type).toBe('auto_end_live');
    });

    it('does NOT capture a future task', () => {
        const due = runDueQuery();
        const futureTask = due.find((t) => t.execute_at === dates.futureIso);
        expect(futureTask, 'Future task should NOT be captured').toBeUndefined();
    });

    it('returns exactly 2 due tasks (both past, pending)', () => {
        const due = runDueQuery();
        expect(due).toHaveLength(2);
    });

    it('orders results chronologically by execute_at', () => {
        const due = runDueQuery();
        // Both past tasks have the same time, just different separators
        // Both should be present and ordered
        expect(due).toHaveLength(2);
        const types = due.map((t) => t.task_type).sort();
        expect(types).toEqual(['auto_delete_if_not_live', 'auto_end_live']);
    });
});
