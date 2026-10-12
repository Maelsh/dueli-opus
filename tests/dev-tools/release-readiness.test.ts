import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { evaluateReadiness, parsePendingNames } from '../../dev-tools/check-release-readiness.mjs';

// R-RELEASE-1 production schema-readiness gate (§7.4): fixtures only, never remote.

const MANIFEST_PATH = resolve('dev-tools/release-schema-manifest.json');
const MIGRATIONS_DIR = resolve('migrations');

function repoFileHash(file: string): string {
    // Raw working-tree bytes, matching check-release-readiness.sha256File().
    // `.gitattributes` pins `migrations/** eol=lf`, so the working tree equals
    // the committed blob on every platform; hashing raw bytes here is therefore
    // correct cross-platform AND catches a line-ending-only rewrite (which the
    // old CRLF→LF normalization would have silently accepted).
    return createHash('sha256').update(readFileSync(resolve('migrations', file))).digest('hex');
}

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
                // Baseline-0038 surface: support_threads + support_messages (0037, R2-M only).
                support_threads: [
                    'id', 'user_id', 'subject', 'status', 'created_at', 'updated_at',
                ],
                support_messages: [
                    'id', 'thread_id', 'sender_kind', 'sender_id', 'content', 'is_read', 'created_at',
                ],
                // Baseline-0038 surface: withdrawal_requests gains the payout
                // link + immutable snapshot (0038, R2-P only).
                withdrawal_requests: [
                    'payout_method_id', 'payout_snapshot',
                ],
                // Baseline-0042 surface: ROW28 cutover (lease + index + key binding).
                recording_leases: [
                    'competition_id', 'holder_hash', 'generation', 'acquired_at',
                    'last_heartbeat_at', 'ttl_seconds', 'released_at',
                ],
                recording_chunks: [
                    'id', 'competition_id', 'generation', 'sequence', 'object_path',
                    'object_hash', 'container', 'codec_video', 'codec_audio', 'bytes',
                    'declared_duration_ms', 'duration_ms', 'state', 'created_at', 'updated_at',
                ],
                recording_finals: [
                    'competition_id', 'finalized_at', 'uploaded_count', 'ready_count',
                    'total_ready_ms', 'marker_generation',
                ],
                chunk_keys: [
                    'id', 'competition_id', 'chunk_index', 'chunk_key', 'created_at',
                    'user_id', 'expires_at', 'lease_generation', 'object_path', 'max_bytes',
                ],
            },
            indexes: ['idx_explore_sessions_identity', 'idx_explore_sessions_expiry', 'idx_competition_views_day', 'idx_managed_documents_slug', 'idx_managed_documents_status', 'idx_support_threads_user', 'idx_support_threads_status', 'idx_support_messages_thread', 'idx_support_messages_unread', 'idx_withdrawal_requests_payout_method', 'idx_ratings_competitor', 'idx_competitions_creator', 'idx_competitions_opponent', 'idx_users_active', 'idx_user_blocks_blocked', 'idx_sse_channel_id', 'idx_recording_leases_holder', 'idx_recording_chunks_order', 'idx_recording_chunks_state', 'idx_chunk_keys_lookup', 'idx_chunk_keys_owner', 'idx_chunk_keys_bound'],
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
        expect(repoFileHash(req.file).toLowerCase()).toBe(String(req.sha256).toLowerCase());
        expect(m.known_history).toContain(req.file);
    });

    it('manifest baseline-0042 requires 0034 with a hash matching the repo file', () => {
        const m = manifest();
        expect(m.manifest_version).toBe('R-RELEASE-1.baseline-0042');
        const req = m.required_migrations.find((x) => x.file === '0034_competition_views.sql');
        expect(req).toBeTruthy();
        expect(repoFileHash(req.file).toLowerCase()).toBe(String(req.sha256).toLowerCase());
        expect(m.known_history).toContain(req.file);
        // Minimum required-schema checks for the 0034 surface.
        expect(m.required_schema.tables.competition_views).toEqual(
            expect.arrayContaining(['id', 'competition_id', 'identity_kind', 'identity_key', 'view_day', 'created_at'])
        );
        expect(m.required_schema.indexes).toContain('idx_competition_views_day');
    });

    it('manifest baseline-0042 requires 0035 with a hash matching the repo file', () => {
        const m = manifest();
        expect(m.manifest_version).toBe('R-RELEASE-1.baseline-0042');
        const req = m.required_migrations.find((x) => x.file === '0035_comments_video_offset.sql');
        expect(req).toBeTruthy();
        expect(repoFileHash(req.file).toLowerCase()).toBe(String(req.sha256).toLowerCase());
        expect(m.known_history).toContain(req.file);
        // Minimum required-schema checks for the 0035 surface.
        expect(m.required_schema.tables.comments).toEqual(expect.arrayContaining(['video_offset']));
    });

    it('manifest baseline-0039 requires 0036 with a hash matching the repo file', () => {
        const m = manifest();
        expect(m.manifest_version).toBe('R-RELEASE-1.baseline-0042');
        const req = m.required_migrations.find((x) => x.file === '0036_managed_documents.sql');
        expect(req).toBeTruthy();
        expect(repoFileHash(req.file).toLowerCase()).toBe(String(req.sha256).toLowerCase());
        expect(m.known_history).toContain(req.file);
        // Minimum required-schema checks for the 0036 (R2-A) surface.
        expect(m.required_schema.tables.managed_documents).toEqual(
            expect.arrayContaining(['id', 'slug', 'title_ar', 'title_en', 'status', 'visibility', 'version', 'is_seed'])
        );
        expect(m.required_schema.indexes).toContain('idx_managed_documents_slug');
        expect(m.required_schema.indexes).toContain('idx_managed_documents_status');
    });

    it('manifest baseline-0042 requires 0037 with a hash matching the repo file', () => {
        const m = manifest();
        expect(m.manifest_version).toBe('R-RELEASE-1.baseline-0042');
        const req = m.required_migrations.find((x) => x.file === '0037_support_messaging.sql');
        expect(req).toBeTruthy();
        expect(repoFileHash(req.file).toLowerCase()).toBe(String(req.sha256).toLowerCase());
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

    it('manifest baseline-0042 requires 0038 with a hash matching the repo file', () => {
        const m = manifest();
        expect(m.manifest_version).toBe('R-RELEASE-1.baseline-0042');
        const req = m.required_migrations.find((x) => x.file === '0038_withdrawal_payout_snapshot.sql');
        expect(req).toBeTruthy();
        expect(repoFileHash(req.file).toLowerCase()).toBe(String(req.sha256).toLowerCase());
        expect(m.known_history).toContain(req.file);
        // Minimum required-schema checks for the 0038 (R2-P) surface.
        expect(m.required_schema.tables.withdrawal_requests).toEqual(
            expect.arrayContaining(['payout_method_id', 'payout_snapshot'])
        );
        expect(m.required_schema.indexes).toContain('idx_withdrawal_requests_payout_method');
    });

    it('manifest baseline-0042 requires 0039 with a hash matching the repo file', () => {
        const m = manifest();
        expect(m.manifest_version).toBe('R-RELEASE-1.baseline-0042');
        const req = m.required_migrations.find((x) => x.file === '0039_r4_db_opt1_indexes.sql');
        expect(req).toBeTruthy();
        expect(repoFileHash(req.file).toLowerCase()).toBe(String(req.sha256).toLowerCase());
        expect(m.known_history).toContain(req.file);
        // Minimum required-schema checks for the 0039 (R4-DB-OPT-1) surface:
        // indexes only — no new tables or columns.
        for (const idx of [
            'idx_ratings_competitor',
            'idx_competitions_creator',
            'idx_competitions_opponent',
            'idx_users_active',
            'idx_user_blocks_blocked',
            'idx_sse_channel_id',
        ]) {
            expect(m.required_schema.indexes).toContain(idx);
        }
    });

    it('manifest baseline-0042 requires 0040/0041/0042 with hashes matching the repo files', () => {
        const m = manifest();
        expect(m.manifest_version).toBe('R-RELEASE-1.baseline-0042');
        for (const file of ['0040_recording_leases.sql', '0041_chunk_index.sql', '0042_chunk_key_binding.sql']) {
            const req = m.required_migrations.find((x) => x.file === file);
            expect(req).toBeTruthy();
            expect(repoFileHash(req.file).toLowerCase()).toBe(String(req.sha256).toLowerCase());
            expect(m.known_history).toContain(req.file);
        }
        // Minimum required-schema surface for the ROW28 cutover.
        expect(m.required_schema.tables.recording_leases).toEqual(
            expect.arrayContaining(['competition_id', 'holder_hash', 'generation', 'last_heartbeat_at', 'ttl_seconds', 'released_at'])
        );
        expect(m.required_schema.tables.recording_chunks).toEqual(
            expect.arrayContaining(['competition_id', 'generation', 'sequence', 'object_path', 'state'])
        );
        expect(m.required_schema.tables.recording_finals).toEqual(
            expect.arrayContaining(['competition_id', 'finalized_at', 'ready_count'])
        );
        expect(m.required_schema.tables.chunk_keys).toEqual(
            expect.arrayContaining(['lease_generation', 'object_path', 'max_bytes'])
        );
        for (const idx of ['idx_recording_leases_holder', 'idx_recording_chunks_order', 'idx_recording_chunks_state', 'idx_chunk_keys_bound']) {
            expect(m.required_schema.indexes).toContain(idx);
        }
    });

    it('production-shape 0039 + manifest 0042 => required-pending FAIL (0040→0042 not yet applied)', () => {
        // ROW28 post-merge deploy blocker: code merged but production still
        // on the 0039 shape — 0040/0041/0042 pending, lease/index/binding
        // surfaces absent. The gate must FAIL until the ordered apply lands.
        const input = goodInput();
        input.applied = input.applied.filter((f) => !['0040_recording_leases.sql', '0041_chunk_index.sql', '0042_chunk_key_binding.sql'].includes(f));
        input.pendingText = 'Migrations to be applied:\n0040_recording_leases.sql\n0041_chunk_index.sql\n0042_chunk_key_binding.sql\n';
        delete input.schema.tables.recording_leases;
        const r = evaluateReadiness(input);
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok).map((c) => c.name)).toContain('required-pending');
    });

    it('production state (0042 applied, no pending) passes the gate', () => {
        // Mirrors production after the authorized 0040→0042 apply: the full
        // known history applied, empty pending, full required schema present.
        const r = evaluateReadiness(goodInput());
        expect(r.unexpected.applied).toEqual([]);
        expect(r.unexpected.pending).toEqual([]);
        expect(r.manifest_version).toBe('R-RELEASE-1.baseline-0042');
    });

    it('production-shape 0037 + manifest 0042 => required-pending FAIL (0038 not yet applied)', () => {
        // Production still on the 0037 shape while the manifest already
        // requires 0038: applied history stops at 0037, the pending list
        // names 0038, and the schema snapshot lacks the payout columns.
        const input = goodInput();
        input.applied = input.applied.filter((f) => f !== '0038_withdrawal_payout_snapshot.sql');
        input.pendingText = 'Migrations to be applied:\n0038_withdrawal_payout_snapshot.sql\n';
        delete input.schema.tables.withdrawal_requests;
        const r = evaluateReadiness(input);
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok).map((c) => c.name)).toContain('required-pending');
    });

    it('production-shape 0039 + manifest 0042 => readiness PASS', () => {
        const r = evaluateReadiness(goodInput());
        expect(r.ok).toBe(true);
        expect(r.checks.every((c) => c.ok)).toBe(true);
    });

    it('0042 applied but binding column missing => required-schema FAIL (no silent pass)', () => {
        // Partial-0042 state: journal lists 0042 but the snapshot lacks a
        // binding column — the gate must fail closed on the schema check.
        const partial = goodInput();
        partial.schema.tables.chunk_keys = partial.schema.tables.chunk_keys.filter(
            (c) => c !== 'lease_generation'
        );
        const r = evaluateReadiness(partial);
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok && c.name === 'required-schema').length).toBeGreaterThan(0);
        expect(evaluateReadiness(goodInput()).ok).toBe(true);
    });

    it('production-shape 0038 + manifest 0042 => required-pending FAIL (0039 not yet applied)', () => {
        // Production still on the 0038 shape while the manifest already
        // requires 0039: applied history stops at 0038, the pending list
        // names 0039, and the schema snapshot lacks the six OPT-1 indexes.
        // This is the exact Codex-P1 block on PR104: the coordinated
        // owner-gated 0039 apply must precede any deploy, never a bypass.
        const input = goodInput();
        input.applied = input.applied.filter((f) => f !== '0039_r4_db_opt1_indexes.sql');
        input.pendingText = 'Migrations to be applied:\n0039_r4_db_opt1_indexes.sql\n';
        const opt1 = [
            'idx_ratings_competitor',
            'idx_competitions_creator',
            'idx_competitions_opponent',
            'idx_users_active',
            'idx_user_blocks_blocked',
            'idx_sse_channel_id',
        ];
        input.schema.indexes = input.schema.indexes.filter((i) => !opt1.includes(i));
        const r = evaluateReadiness(input);
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok).map((c) => c.name)).toContain('required-pending');
    });

    it('0039 applied but index missing from snapshot => required-schema FAIL (no silent pass)', () => {
        // Mirrors the Deploy #458 class for the new surface: 0039 applied
        // (journal + pending clean) yet the collector snapshot omits one of
        // the six indexes — the gate must refuse the stale snapshot.
        const stale = goodInput();
        stale.schema.indexes = stale.schema.indexes.filter((i) => i !== 'idx_sse_channel_id');
        const r = evaluateReadiness(stale);
        expect(r.ok).toBe(false);
        expect(r.checks.filter((c) => !c.ok && c.name === 'required-schema').length).toBeGreaterThan(0);
        expect(evaluateReadiness(goodInput()).ok).toBe(true);
    });

    it('production-shape 0036 + manifest 0042 => required-pending FAIL (0037 not yet applied)', () => {
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

    it('production-shape 0035 + manifest 0042 => required-pending FAIL (0036/0037 not yet applied)', () => {
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

    it('production-shape 0034 + manifest 0039 => required-pending FAIL (0035 not yet applied)', () => {
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

    it('gate verifies RAW bytes and migrations are pinned to LF by .gitattributes', () => {
        // R-RELEASE-1 integrity must be a true byte pin: no CRLF→LF normalization
        // in sha256File(), and `.gitattributes` must pin `migrations/** eol=lf` so
        // the working tree equals the committed blob on every platform. Together
        // they make raw-byte hashing both correct and cross-platform reproducible.
        const gateSrc = readFileSync(resolve('dev-tools/check-release-readiness.mjs'), 'utf8');
        expect(gateSrc).not.toMatch(/createHash\('sha256'\)\.update\([^)]*\.replace\(/);
        expect(gateSrc).toContain("createHash('sha256').update(readFileSync(path))");

        const attr = readFileSync(resolve('.gitattributes'), 'utf8');
        expect(attr).toMatch(/migrations\/\*\*[ \t]+eol=lf/);

        // Working tree must actually be LF right now (no CRLF), or raw-byte
        // pins could not hold — proves the attribute took effect locally.
        for (const file of ['0040_recording_leases.sql', '0041_chunk_index.sql', '0042_chunk_key_binding.sql']) {
            const buf = readFileSync(resolve('migrations', file));
            expect(buf.includes(0x0d)).toBe(false);
        }
    });

    it('raw-byte hash catches a line-ending-only rewrite that CRLF-normalization hid', () => {
        // Regression guard for the earlier weakening: a pinned migration whose
        // only change is CRLF↔LF must FAIL the gate. With raw-byte hashing +
        // eol=lf pinning, a CRLF working copy of an LF-pinned file is a real diff.
        const m = manifest();
        const pin = m.required_migrations.find((x) => x.file === '0041_chunk_index.sql');
        const crlfHash = createHash('sha256')
            .update(readFileSync(resolve('migrations', '0041_chunk_index.sql')).toString('utf8').replace(/\n/g, '\r\n'), 'utf8')
            .digest('hex');
        expect(crlfHash).not.toBe(String(pin.sha256).toLowerCase());
        expect(repoFileHash('0041_chunk_index.sql')).toBe(String(pin.sha256).toLowerCase());
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
