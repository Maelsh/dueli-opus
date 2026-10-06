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
                // Baseline-0035 surface: comments gains video_offset (0035).
                comments: [
                    'id', 'competition_id', 'user_id', 'content', 'parent_id', 'is_live',
                    'likes_count', 'created_at', 'user_anonymized', 'deleted_at', 'video_offset',
                ],
                // Baseline-0036 surface: managed_documents (0036, R2-A only).
                managed_documents: [
                    'id', 'slug', 'title_ar', 'title_en', 'body_ar', 'body_en',
                    'status', 'visibility', 'version', 'is_seed',
                    'created_by', 'updated_by', 'created_at', 'updated_at',
                ],
                // Baseline-0037 surface: support_threads + support_messages (0037, R2-M only).
                support_threads: [
                    'id', 'user_id', 'subject', 'status', 'created_at', 'updated_at',
                ],
                support_messages: [
                    'id', 'thread_id', 'sender_kind', 'sender_id', 'content', 'is_read', 'created_at',
                ],
            },
            indexes: ['idx_explore_sessions_identity', 'idx_explore_sessions_expiry', 'idx_competition_views_day', 'idx_managed_documents_slug', 'idx_managed_documents_status', 'idx_support_threads_user', 'idx_support_threads_status', 'idx_support_messages_thread', 'idx_support_messages_unread'],
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

    it('manifest baseline-0037 requires 0034 with a hash matching the repo file', () => {
        const m = manifest();
        expect(m.manifest_version).toBe('R-RELEASE-1.baseline-0037');
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

    it('manifest baseline-0037 requires 0035 with a hash matching the repo file', () => {
        const m = manifest();
        expect(m.manifest_version).toBe('R-RELEASE-1.baseline-0037');
        const req = m.required_migrations.find((x) => x.file === '0035_comments_video_offset.sql');
        expect(req).toBeTruthy();
        const actual = createHash('sha256').update(readFileSync(resolve('migrations', req.file))).digest('hex');
        expect(actual.toLowerCase()).toBe(String(req.sha256).toLowerCase());
        expect(m.known_history).toContain(req.file);
        // Minimum required-schema checks for the 0035 surface.
        expect(m.required_schema.tables.comments).toEqual(expect.arrayContaining(['video_offset']));
    });

    it('manifest baseline-0037 requires 0036 with a hash matching the repo file', () => {
        const m = manifest();
        expect(m.manifest_version).toBe('R-RELEASE-1.baseline-0037');
        const req = m.required_migrations.find((x) => x.file === '0036_managed_documents.sql');
        expect(req).toBeTruthy();
        const actual = createHash('sha256').update(readFileSync(resolve('migrations', req.file))).digest('hex');
        expect(actual.toLowerCase()).toBe(String(req.sha256).toLowerCase());
        expect(m.known_history).toContain(req.file);
        // Minimum required-schema checks for the 0036 (R2-A) surface.
        expect(m.required_schema.tables.managed_documents).toEqual(
            expect.arrayContaining(['id', 'slug', 'title_ar', 'title_en', 'status', 'visibility', 'version', 'is_seed'])
        );
        expect(m.required_schema.indexes).toContain('idx_managed_documents_slug');
        expect(m.required_schema.indexes).toContain('idx_managed_documents_status');
    });

    it('manifest baseline-0037 requires 0037 with a hash matching the repo file', () => {
        const m = manifest();
        expect(m.manifest_version).toBe('R-RELEASE-1.baseline-0037');
        const req = m.required_migrations.find((x) => x.file === '0037_support_messaging.sql');
        expect(req).toBeTruthy();
        const actual = createHash('sha256').update(readFileSync(resolve('migrations', req.file))).digest('hex');
        expect(actual.toLowerCase()).toBe(String(req.sha256).toLowerCase());
        expect(m.known_history).toContain(req.file);
        // Minimum required-schema checks for the 0037 (R2-M) surface.
        expect(m.required_schema.tables.support_threads).toEqual(
            expect.arrayContaining(['id', 'user_id', 'subject', 'status'])
        );
        expect(m.required_schema.tables.support_messages).toEqual(
            expect.arrayContaining(['id', 'thread_id', 'sender_kind', 'sender_id', 'content', 'is_read'])
        );
        expect(m.required_schema.indexes).toContain('idx_support_threads_user');
        expect(m.required_schema.indexes).toContain('idx_support_messages_thread');
    });

    it('production state (0037 applied, no pending) passes the gate', () => {
        // Mirrors production after a future authorized 0037 apply: the full
        // known history applied, empty pending, full required schema present.
        const r = evaluateReadiness(goodInput());
        expect(r.ok).toBe(true);
        expect(r.unexpected.applied).toEqual([]);
        expect(r.unexpected.pending).toEqual([]);
        expect(r.manifest_version).toBe('R-RELEASE-1.baseline-0037');
    });

    it('production-shape 0036 + manifest 0037 => required-pending FAIL (0037 not yet applied)', () => {
        // Production still on the 0036 shape while the manifest already
        // requires 0037: applied history stops at 0036, the pending list
        // names 0037, and the schema snapshot lacks the support tables.
        const input = goodInput();
        input.applied = input.applied.filter((f) => f !== '0037_support_messaging.sql');
        input.pendingText = 'Migrations to be applied:\n0037_support_messaging.sql\n';
        delete input.schema.tables.support_threads;
        delete input.schema.tables.support_messages;
        const r = evaluateReadiness(input);
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok).map((c) => c.name)).toContain('required-pending');
    });

    it('production-shape 0037 + manifest 0037 => readiness PASS', () => {
        const r = evaluateReadiness(goodInput());
        expect(r.ok).toBe(true);
        expect(r.checks.every((c) => c.ok)).toBe(true);
    });

    it('production-shape 0035 + manifest 0037 => required-pending FAIL (0036/0037 not yet applied)', () => {
        // Production still on the 0035 shape while the manifest already
        // requires 0037: applied history stops at 0035, the pending list
        // names 0036, and the schema snapshot lacks managed_documents.
        const input = goodInput();
        input.applied = input.applied.filter((f) => f !== '0036_managed_documents.sql');
        input.pendingText = 'Migrations to be applied:\n0036_managed_documents.sql\n';
        delete input.schema.tables.managed_documents;
        const r = evaluateReadiness(input);
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok).map((c) => c.name)).toContain('required-pending');
    });

    it('production-shape 0034 + manifest 0035 => required-pending FAIL (0035 not yet applied)', () => {
        // Production still on the 0034 shape while the manifest already
        // requires 0035: applied history stops at 0034, the pending list
        // names 0035, and the schema snapshot lacks comments.video_offset.
        const input = goodInput();
        input.applied = input.applied.filter((f) => f !== '0035_comments_video_offset.sql');
        input.pendingText = 'Migrations to be applied:\n0035_comments_video_offset.sql\n';
        delete input.schema.tables.comments;
        const r = evaluateReadiness(input);
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok).map((c) => c.name)).toContain('required-pending');
    });

    it('Deploy #458 exact scenario: stale snapshot missing the 0034 index FAILS', () => {
        // The old collector hardcoded two tables, so a healthy production
        // (index present in D1) still evaluated with the index absent. The
        // gate must refuse that snapshot — and pass once collected properly.
        const stale = goodInput();
        stale.schema.indexes = stale.schema.indexes.filter((i) => i !== 'idx_competition_views_day');
        const r = evaluateReadiness(stale);
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok && c.name === 'required-schema').length).toBeGreaterThan(0);
        expect(evaluateReadiness(goodInput()).ok).toBe(true);
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
