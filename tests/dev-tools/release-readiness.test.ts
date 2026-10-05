import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { evaluateReadiness, parsePendingNames } from '../../dev-tools/check-release-readiness.mjs';

// R-RELEASE-1 production schema-readiness gate (§7.4): fixtures only, never remote.

const MANIFEST_PATH = resolve('dev-tools/release-schema-manifest.json');
const MIGRATIONS_DIR = resolve('migrations');

function manifest() {
    return JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'));
}

function goodInput(m = manifest()) {
    return {
        manifest: m,
        target: 'project-8e7c178d',
        database: 'dueli-db',
        sha: 'b23cfe2a9202136f47da08d55fecee74e259f979',
        migrationsDir: MIGRATIONS_DIR,
        applied: [...m.known_history],
        pendingText: 'No migrations to apply!\n',
        schema: {
            tables: {
                explore_result_sessions: [
                    'id', 'surface', 'identity_kind', 'identity_key', 'filters_canonical',
                    'lang', 'status', 'total_count', 'chunk_size', 'created_at', 'expires_at',
                ],
                explore_result_chunks: ['session_id', 'chunk_index', 'ids_json'],
                competition_views: [
                    'id', 'competition_id', 'identity_kind', 'identity_key', 'view_day', 'created_at',
                ],
            },
            indexes: ['idx_explore_sessions_identity', 'idx_explore_sessions_expiry', 'idx_competition_views_day'],
        },
    };
}

describe('release readiness gate', () => {
    it('happy path passes and records target/sha/manifest (no secrets)', () => {
        const r = evaluateReadiness(goodInput());
        expect(r.ok).toBe(true);
        expect(r.target).toBe('project-8e7c178d');
        expect(r.database).toBe('dueli-db');
        expect(r.sha).toBe('b23cfe2a9202136f47da08d55fecee74e259f979');
        expect(r.manifest_version).toBe(manifest().manifest_version);
        expect(JSON.stringify(r)).not.toMatch(/token|secret|password/i);
    });

    it('manifest baseline requires 0033 with a hash matching the repo file', () => {
        const m = manifest();
        const req = m.required_migrations.find((x) => x.file === '0033_explore_result_sessions.sql');
        expect(req).toBeTruthy();
        const actual = createHash('sha256').update(readFileSync(resolve('migrations', req.file))).digest('hex');
        expect(actual.toLowerCase()).toBe(String(req.sha256).toLowerCase());
        expect(m.known_history).toContain(req.file);
    });

    it('manifest baseline-0034 requires 0034 with a hash matching the repo file', () => {
        const m = manifest();
        expect(m.manifest_version).toBe('R-RELEASE-1.baseline-0034');
        const req = m.required_migrations.find((x) => x.file === '0034_competition_views.sql');
        expect(req).toBeTruthy();
        const actual = createHash('sha256').update(readFileSync(resolve('migrations', req.file))).digest('hex');
        expect(actual.toLowerCase()).toBe(String(req.sha256).toLowerCase());
        expect(m.known_history).toContain(req.file);
        // Minimum required-schema checks for the 0034 surface.
        expect(m.required_schema.tables.competition_views).toEqual(
            expect.arrayContaining(['id', 'competition_id', 'identity_kind', 'identity_key', 'view_day', 'created_at'])
        );
        expect(m.required_schema.indexes).toContain('idx_competition_views_day');
    });

    it('production state (0034 applied, no pending) passes the gate', () => {
        // Mirrors production after the authorized 0034 apply: the full known
        // history applied, empty pending, full required schema present.
        const r = evaluateReadiness(goodInput());
        expect(r.ok).toBe(true);
        expect(r.unexpected.applied).toEqual([]);
        expect(r.unexpected.pending).toEqual([]);
        expect(r.manifest_version).toBe('R-RELEASE-1.baseline-0034');
    });

    it('pre-0034 production (0034 missing) still fails closed', () => {
        // The exact Deploy #456 block: 0034 applied remotely but unknown to a
        // baseline-0033 manifest. Here from the other side — a baseline-0034
        // gate must refuse a target that has not applied 0034 yet.
        const input = goodInput();
        input.applied = input.applied.filter((f) => f !== '0034_competition_views.sql');
        const r = evaluateReadiness(input);
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok).map((c) => c.name)).toContain('required-pending');
    });

    it('manifest history is complete locally (every file exists)', () => {
        const m = manifest();
        for (const f of m.known_history) {
            expect(() => readFileSync(resolve('migrations', f))).not.toThrow();
        }
    });

    it('required migration missing from applied => FAIL (required-pending)', () => {
        const input = goodInput();
        input.applied = input.applied.filter((f) => f !== '0033_explore_result_sessions.sql');
        const r = evaluateReadiness(input);
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok).map((c) => c.name)).toContain('required-pending');
    });

    it('required migration still reported pending => FAIL', () => {
        const input = goodInput();
        input.pendingText = 'Migrations to be applied:\n0033_explore_result_sessions.sql\n';
        const r = evaluateReadiness(input);
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok).map((c) => c.name)).toContain('required-pending');
    });

    it('changed required file (hash mismatch) => FAIL (changed-applied)', () => {
        const m = manifest();
        m.required_migrations = m.required_migrations.map((x) => ({ ...x, sha256: '0'.repeat(64) }));
        const r = evaluateReadiness(goodInput(m));
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok).map((c) => c.name)).toContain('required-integrity');
    });

    it('missing required table/column/index => FAIL (missing-schema)', () => {
        const noTable = goodInput();
        delete noTable.schema.tables.explore_result_chunks;
        expect(evaluateReadiness(noTable).ok).toBe(false);

        const noCol = goodInput();
        noCol.schema.tables.explore_result_sessions = noCol.schema.tables.explore_result_sessions.filter(
            (c) => c !== 'expires_at'
        );
        const rCol = evaluateReadiness(noCol);
        expect(rCol.ok).toBe(false);
        expect(rCol.checks.filter((c) => !c.ok && c.name === 'required-schema').length).toBeGreaterThan(0);

        const noIdx = goodInput();
        noIdx.schema.indexes = ['idx_explore_sessions_identity'];
        expect(evaluateReadiness(noIdx).ok).toBe(false);
    });

    it('unexpected applied migration => FAIL and recorded (never auto-anything)', () => {
        const input = goodInput();
        input.applied = [...input.applied, '0035_out_of_band.sql'];
        const r = evaluateReadiness(input);
        expect(r.ok).toBe(false);
        expect(r.unexpected.applied).toEqual(['0035_out_of_band.sql']);
    });

    it('unexpected pending => FAIL and recorded, no apply path exists', () => {
        const input = goodInput();
        input.pendingText = 'Migrations to be applied:\n0035_surprise.sql\n';
        const r = evaluateReadiness(input);
        expect(r.ok).toBe(false);
        expect(r.unexpected.pending).toEqual(['0035_surprise.sql']);
        const src = readFileSync(resolve('dev-tools/check-release-readiness.mjs'), 'utf8');
        expect(src).not.toContain('wrangler d1');
        expect(src).not.toContain('child_process');
    });

    it('unknown target / bad sha / unreadable inputs => FAIL (fail-closed)', () => {
        expect(evaluateReadiness({ ...goodInput(), target: 'other-project' }).ok).toBe(false);
        expect(evaluateReadiness({ ...goodInput(), database: 'other-db' }).ok).toBe(false);
        expect(evaluateReadiness({ ...goodInput(), sha: 'not-a-sha' }).ok).toBe(false);
        expect(evaluateReadiness({ ...goodInput(), sha: '' }).ok).toBe(false);
        expect(evaluateReadiness({ ...goodInput(), applied: 'oops' }).ok).toBe(false);
        expect(evaluateReadiness({ ...goodInput(), schema: null }).ok).toBe(false);
        const { pendingText, ...noPending } = goodInput();
        expect(pendingText).toBeDefined();
        expect(evaluateReadiness({ ...noPending, pendingText: undefined }).ok).toBe(false);
        expect(evaluateReadiness({ ...goodInput(), migrationsDir: 'does/not/exist' }).ok).toBe(false);
    });

    it('parses pending names from migrations-list-style text', () => {
        expect(parsePendingNames('No migrations to apply!\n')).toEqual([]);
        expect(parsePendingNames('Migrations to be applied:\n0033_explore_result_sessions.sql\n0035_x.sql\n')).toEqual([
            '0033_explore_result_sessions.sql',
            '0035_x.sql',
        ]);
    });
});
