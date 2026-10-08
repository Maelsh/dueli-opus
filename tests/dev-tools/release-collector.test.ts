import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SqliteD1 } from '../helpers/sqlite-d1';

// Release-collector regression (Deploy #37771438709): the deploy.yml index
// snapshot must surface baseline-0039's six indexes even though their tables
// (ratings/competitions/users/user_blocks/sse_event_log) are OUTSIDE
// required_schema.tables. Proven here against the REAL migrations by
// executing the exact snapshot SQL shipped in deploy.yml — not a copy of it.

const DEPLOY = readFileSync(resolve('.github/workflows/deploy.yml'), 'utf8');
const MANIFEST = JSON.parse(readFileSync(resolve('dev-tools/release-schema-manifest.json'), 'utf8')) as {
    required_schema: { tables: Record<string, string[]>; indexes: string[] };
};

const OPT1_TABLES = ['ratings', 'competitions', 'users', 'user_blocks', 'sse_event_log'];

/** The literal snapshot query, extracted from the deployed collector. */
function collectorSql(): string {
    const m = DEPLOY.match(/SELECT name FROM sqlite_master WHERE type='index'[^";]*/);
    expect(m, 'deploy.yml must contain the sqlite_master index snapshot query').toBeTruthy();
    return (m as RegExpMatchArray)[0].trim().replace(/;$/, '');
}

async function collectIndexes(db: SqliteD1, sql: string): Promise<string[]> {
    const res = await db.prepare(sql).all<{ name: string }>();
    return (res.results ?? []).map((r) => r.name);
}

describe('release collector: unrestricted index snapshot', () => {
    it('the shipped snapshot SQL carries no tbl_name restriction', () => {
        const sql = collectorSql();
        expect(sql).toContain("type='index'");
        expect(sql).not.toContain('tbl_name');
    });

    it('0039 tables are outside required_schema.tables (the trap premise)', () => {
        const requiredTables = Object.keys(MANIFEST.required_schema.tables);
        for (const t of OPT1_TABLES) {
            expect(requiredTables, `${t} must stay outside required_schema.tables`).not.toContain(t);
        }
    });

    it('the shipped snapshot surfaces all six 0039 indexes on the real schema', async () => {
        const db = new SqliteD1();
        const names = await collectIndexes(db, collectorSql());
        for (const idx of [
            'idx_ratings_competitor',
            'idx_competitions_creator',
            'idx_competitions_opponent',
            'idx_users_active',
            'idx_user_blocks_blocked',
            'idx_sse_channel_id',
        ]) {
            expect(names, `snapshot misses required index ${idx}`).toContain(idx);
        }
        // The collected set covers every manifest-required index (the exact
        // subset operation the gate performs at check 9).
        for (const idx of MANIFEST.required_schema.indexes as string[]) {
            expect(names, `snapshot misses manifest-required index ${idx}`).toContain(idx);
        }
    });

    it('the old manifest-derived tbl_name form misses exactly those six (bug reproduced)', async () => {
        const db = new SqliteD1();
        const tables = Object.keys(MANIFEST.required_schema.tables)
            .map((t) => `'${t}'`)
            .join(',');
        const names = await collectIndexes(
            db,
            `SELECT name FROM sqlite_master WHERE type='index' AND tbl_name IN (${tables})`
        );
        const missing = (MANIFEST.required_schema.indexes as string[]).filter((i) => !names.includes(i));
        expect(missing.sort()).toEqual(
            [
                'idx_competitions_creator',
                'idx_competitions_opponent',
                'idx_ratings_competitor',
                'idx_sse_channel_id',
                'idx_user_blocks_blocked',
                'idx_users_active',
            ].sort()
        );
    });

    it('a dropped index disappears from the snapshot (missing still fails closed downstream)', async () => {
        const db = new SqliteD1();
        db.exec('DROP INDEX idx_sse_channel_id');
        const names = await collectIndexes(db, collectorSql());
        expect(names).not.toContain('idx_sse_channel_id');
        // Gate subset semantics: every required index must be present.
        const missing = (MANIFEST.required_schema.indexes as string[]).filter((i) => !names.includes(i));
        expect(missing).toEqual(['idx_sse_channel_id']);
    });
});
