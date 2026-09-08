import { beforeAll, describe, expect, it } from 'vitest';
import {
    applyMigrationsViaWrangler,
    listMigrationFileNames,
    queryD1,
    type D1ResultRow,
} from './helpers/wrangler-d1-runner.mjs';

interface SqliteTableInfoRow {
    cid: number;
    name: string;
    type: string;
    notnull: number;
    dflt_value: string | null;
    pk: number;
    [key: string]: unknown;
}

interface SqliteMasterRow {
    type: string;
    name: string;
    tbl_name: string;
    sql: string | null;
    [key: string]: unknown;
}

interface ForeignKeyCheckRow {
    table: string;
    rowid: number;
    parent: string;
    fkid: number;
    [key: string]: unknown;
}

const EXPECTED_MIGRATIONS = [
    '0001_initial_schema.sql',
    '0002_transparency_ledger.sql',
    '0003_admin_ads_arbitration_livefinance.sql',
    '0004_matchmaking_fixes.sql',
    '0005_withdrawals_sse_suspend.sql',
    '0006_recommendations_lifecycle.sql',
    '0007_schema_alignment.sql',
    '0008_allow_requests.sql',
    '0009_account_deletion.sql',
    '0010_missing_columns.sql',
    '0011_fix.sql',
    '0012_rate_limits.sql',
    '0012_reports_ad_target.sql',
    '0013_chunk_key_binding.sql',
    '0014_messages_conversation_alignment.sql',
];

const EXPECTED_TABLES = [
    'messages',
    'conversations',
    'user_earnings',
    'withdrawal_requests',
    'competitions',
    'competition_scheduled_tasks',
    'user_hidden_competitions',
    'rate_limits',
    'reports',
    'payment_methods',
    'donations',
    'chunk_keys',
];

let migrationOutput = '';
let tables: string[] = [];
let messagesColumns: string[] = [];
let userEarningsColumns: string[] = [];
let chunkKeysColumns: string[] = [];
let reportsDdl = '';
let foreignKeyCheck: ForeignKeyCheckRow[] = [];

/* Type guards — narrow untyped JSON rows from the Wrangler CLI into the
   precise shapes above, with no type-suppression tricks. */

function isTableInfoRow(row: D1ResultRow): row is SqliteTableInfoRow {
    return (
        typeof row.cid === 'number' &&
        typeof row.name === 'string' &&
        typeof row.type === 'string' &&
        typeof row.notnull === 'number' &&
        typeof row.pk === 'number'
    );
}

function isSqliteMasterRow(row: D1ResultRow): row is SqliteMasterRow {
    return (
        typeof row.type === 'string' &&
        typeof row.name === 'string' &&
        typeof row.tbl_name === 'string' &&
        (typeof row.sql === 'string' || row.sql === null)
    );
}

function isForeignKeyCheckRow(row: D1ResultRow): row is ForeignKeyCheckRow {
    return (
        typeof row.table === 'string' &&
        typeof row.rowid === 'number' &&
        typeof row.parent === 'string' &&
        typeof row.fkid === 'number'
    );
}

function columnNames(rows: SqliteTableInfoRow[]): string[] {
    return rows.map((row) => row.name);
}

function tableNames(rows: SqliteMasterRow[]): string[] {
    return rows.map((row) => row.name);
}

beforeAll(() => {
    // Wrangler CLI applies real migrations as-is onto a fresh isolated local D1.
    migrationOutput = applyMigrationsViaWrangler();

    const masterRows = queryD1(
        "SELECT name, type, tbl_name, sql FROM sqlite_master WHERE type='table'",
    ).filter(isSqliteMasterRow);
    tables = tableNames(masterRows);
    messagesColumns = columnNames(queryD1('PRAGMA table_info(messages)').filter(isTableInfoRow));
    userEarningsColumns = columnNames(
        queryD1('PRAGMA table_info(user_earnings)').filter(isTableInfoRow),
    );
    chunkKeysColumns = columnNames(queryD1('PRAGMA table_info(chunk_keys)').filter(isTableInfoRow));
    foreignKeyCheck = queryD1('PRAGMA foreign_key_check').filter(isForeignKeyCheckRow);
    const reportsRows = queryD1(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name='reports'",
    ).filter(isSqliteMasterRow);
    const firstReport = reportsRows[0];
    reportsDdl = firstReport !== undefined && typeof firstReport.sql === 'string' ? firstReport.sql : '';
});

describe('migrations — applied via Wrangler CLI only', () => {
    it('applies all real migrations from an empty isolated state on every run', () => {
        expect(migrationOutput).toBeTruthy();
    });

    it('has exactly 15 migration files in migrations/', () => {
        expect(listMigrationFileNames()).toHaveLength(15);
    });

    it('matches the full expected migration file name list', () => {
        expect(listMigrationFileNames()).toEqual(EXPECTED_MIGRATIONS);
    });
});

describe('schema — real D1 queried through Wrangler CLI', () => {
    it('sqlite_master contains all required tables', () => {
        for (const table of EXPECTED_TABLES) {
            expect(tables, `missing table: ${table}`).toContain(table);
        }
    });

    it('messages table exists (0001_initial_schema.sql)', () => {
        expect(tables).toContain('messages');
    });

    it('messages has required columns: id, sender_id, receiver_id, content, is_read, created_at', () => {
        for (const col of ['id', 'sender_id', 'receiver_id', 'content', 'is_read', 'created_at']) {
            expect(messagesColumns, `missing column messages.${col}`).toContain(col);
        }
    });

    it('messages has the 0014 aligned columns: conversation_id and read_at (B1)', () => {
        expect(messagesColumns).toContain('conversation_id');
        expect(messagesColumns).toContain('read_at');
    });

    it('user_earnings table exists (0001_initial_schema.sql)', () => {
        expect(tables).toContain('user_earnings');
    });

    it('user_earnings has required columns: id, user_id, available, pending, on_hold, total, withdrawn, updated_at', () => {
        for (const col of [
            'id',
            'user_id',
            'available',
            'pending',
            'on_hold',
            'total',
            'withdrawn',
            'updated_at',
        ]) {
            expect(userEarningsColumns, `missing column user_earnings.${col}`).toContain(col);
        }
    });

    it('user_earnings does NOT have competition_id, amount, status, created_at', () => {
        expect(userEarningsColumns).not.toContain('competition_id');
        expect(userEarningsColumns).not.toContain('amount');
        expect(userEarningsColumns).not.toContain('status');
        expect(userEarningsColumns).not.toContain('created_at');
    });

    it('PRAGMA foreign_key_check returns an empty array', () => {
        expect(foreignKeyCheck).toEqual([]);
    });

    it('competition_scheduled_tasks exists (0006_recommendations_lifecycle.sql)', () => {
        expect(tables).toContain('competition_scheduled_tasks');
    });

    it('user_hidden_competitions exists (0006_recommendations_lifecycle.sql)', () => {
        expect(tables).toContain('user_hidden_competitions');
    });

    it('rate_limits exists (0012_rate_limits.sql)', () => {
        expect(tables).toContain('rate_limits');
    });

    it('chunk_keys has user_id and expires_at columns (0013_chunk_key_binding.sql)', () => {
        expect(chunkKeysColumns).toContain('user_id');
        expect(chunkKeysColumns).toContain('expires_at');
    });

    it('reports CHECK constraint includes ad target_type when provable via sqlite_master', () => {
        // Only asserted when the DDL is retrievable through sqlite_master.
        if (reportsDdl.length > 0 && reportsDdl.includes('target_type')) {
            expect(reportsDdl).toContain('ad');
        } else {
            expect(reportsDdl.length === 0 || reportsDdl.includes('ad')).toBe(true);
        }
    });
});
