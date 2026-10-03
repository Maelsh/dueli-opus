/**
 * Production schema-readiness gate (R-RELEASE-1). DEFAULT READ-ONLY.
 *
 * Evaluates a release against dev-tools/release-schema-manifest.json using
 * ONLY read-collected inputs (target identity, applied migration names,
 * raw `migrations list` text, schema snapshot). It NEVER applies migrations,
 * writes remote state, or reads secrets — inputs contain none by construction.
 *
 * Any of these FAILS the gate (before pages deploy, no "warn-only" deploy):
 *   - unknown target (project/database mismatch with the manifest)
 *   - malformed release SHA (expected 40-hex, recorded in the result)
 *   - unreadable inputs (non-array applied, non-object schema, non-string
 *     pending text) or incomplete repo (manifest history file missing)
 *   - required migration not in applied           → required-pending
 *   - required migration pending in list text      → required-pending
 *   - required file hash != manifest hash         → changed-applied
 *   - applied name outside manifest history       → unexpected (recorded)
 *   - pending name outside manifest history       → unexpected (recorded,
 *     NEVER auto-applied — no apply path exists in this tool)
 *   - required table/column/index absent           → missing-schema
 *
 * Result JSON is printed to stdout: target/database/sha/manifest_version,
 * per-check outcomes and unexpected lists. No secrets, no user data.
 *
 * Usage:
 *   node dev-tools/check-release-readiness.mjs \
 *     --manifest=dev-tools/release-schema-manifest.json \
 *     --target=<pages project> --database=<d1 name> --sha=<40-hex commit> \
 *     --migrations-dir=migrations \
 *     --applied='["0001_....sql", ...]' \
 *     --pending-text="$(cat list.txt)" \
 *     --schema='{"tables": {"t": ["col"]}, "indexes": ["i"]}'
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SHA_RE = /^[0-9a-f]{40}$/i;
const MIGRATION_NAME_RE = /\b\d{4}_[\w-]+\.sql\b/g;

export function sha256File(path) {
    return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function parsePendingNames(listText) {
    const names = new Set();
    let m;
    MIGRATION_NAME_RE.lastIndex = 0;
    while ((m = MIGRATION_NAME_RE.exec(listText)) !== null) names.add(m[0]);
    return [...names];
}

export function evaluateReadiness({ manifest, target, database, sha, migrationsDir, applied, pendingText, schema }) {
    const checks = [];
    const unexpected = { applied: [], pending: [] };
    const fail = (name, detail) => checks.push({ name, ok: false, detail });
    const pass = (name, detail = '') => checks.push({ name, ok: true, detail });

    // 1. target identity
    if (!manifest?.target || target !== manifest.target.pages_project || database !== manifest.target.database_name) {
        fail('target-identity', `unknown target project=${target} database=${database}`);
    } else {
        pass('target-identity', `${target}/${database}`);
    }

    // 2. sha format (recorded, never executed)
    if (typeof sha !== 'string' || !SHA_RE.test(sha)) {
        fail('release-sha', 'expected 40-hex commit sha');
    } else {
        pass('release-sha', sha);
    }

    // 3. input readability (read failure => FAIL, never assume ready)
    const appliedOk = Array.isArray(applied);
    const schemaOk = !!schema && typeof schema === 'object' && !!schema.tables && typeof schema.tables === 'object';
    const pendingTextOk = typeof pendingText === 'string';
    if (!appliedOk || !schemaOk || !pendingTextOk) {
        fail(
            'inputs-readable',
            `applied-array=${appliedOk} schema-tables=${schemaOk} pending-text=${pendingTextOk}`
        );
    } else {
        pass('inputs-readable', `applied=${applied.length}`);
    }

    const known = new Set([...(manifest?.known_history || []), ...(manifest?.required_migrations || []).map((m) => m.file)]);
    const required = manifest?.required_migrations || [];

    // 4. repo completeness (manifest history must exist locally to verify)
    if (typeof migrationsDir === 'string' && existsSync(migrationsDir)) {
        const missing = (manifest?.known_history || []).filter((f) => !existsSync(join(migrationsDir, f)));
        if (missing.length > 0) fail('repo-completeness', `missing: ${missing.join(', ')}`);
        else pass('repo-completeness', `${(manifest?.known_history || []).length} files present`);
    } else {
        fail('repo-completeness', `migrations dir unreadable: ${migrationsDir}`);
    }

    // 5/8. required applied + required pending (list text)
    const appliedSet = new Set(appliedOk ? applied : []);
    const pendingNames = pendingTextOk ? parsePendingNames(pendingText) : [];
    for (const req of required) {
        if (!appliedSet.has(req.file)) {
            fail('required-pending', `${req.file} not in applied list`);
        } else if (pendingNames.includes(req.file)) {
            fail('required-pending', `${req.file} still reported pending`);
        } else {
            pass('required-pending', req.file);
        }
    }

    // 6. required integrity (post-apply rewrite detection)
    for (const req of required) {
        const local = typeof migrationsDir === 'string' ? join(migrationsDir, req.file) : '';
        if (!local || !existsSync(local)) {
            fail('required-integrity', `${req.file} missing locally, cannot verify hash`);
        } else if (sha256File(local).toLowerCase() !== String(req.sha256).toLowerCase()) {
            fail('required-integrity', `${req.file} hash differs from manifest (history rewritten?)`);
        } else {
            pass('required-integrity', `${req.file} hash matches`);
        }
    }

    // 7. unexpected applied (out-of-band) — recorded, never auto-anything
    if (appliedOk) {
        unexpected.applied = applied.filter((n) => !known.has(n));
        if (unexpected.applied.length > 0) fail('unexpected-applied', unexpected.applied.join(', '));
        else pass('unexpected-applied', 'none');
    }

    // 8b. unexpected pending — recorded, NEVER auto-applied (no apply path exists)
    unexpected.pending = pendingNames.filter((n) => !known.has(n));
    if (unexpected.pending.length > 0) fail('unexpected-pending', `${unexpected.pending.join(', ')} (recorded only)`);
    else pass('unexpected-pending', 'none');

    // 9. required schema (subset: extra tables/columns/indexes are fine)
    if (schemaOk) {
        const tables = schema.tables;
        const indexes = Array.isArray(schema.indexes) ? schema.indexes : [];
        for (const [table, cols] of Object.entries(manifest?.required_schema?.tables || {})) {
            if (!Array.isArray(tables[table])) {
                fail('required-schema', `missing table: ${table}`);
                continue;
            }
            const absent = cols.filter((c) => !tables[table].includes(c));
            if (absent.length > 0) fail('required-schema', `${table} missing columns: ${absent.join(', ')}`);
            else pass('required-schema', `${table} columns ok`);
        }
        for (const idx of manifest?.required_schema?.indexes || []) {
            if (!indexes.includes(idx)) fail('required-schema', `missing index: ${idx}`);
            else pass('required-schema', `${idx} ok`);
        }
    } else {
        fail('required-schema', 'no schema snapshot to check');
    }

    const ok = checks.every((c) => c.ok);
    return {
        ok,
        target,
        database,
        sha,
        manifest_version: manifest?.manifest_version || '',
        checks,
        unexpected,
    };
}

function argValue(name) {
    const arg = process.argv.find((a) => a.startsWith(`--${name}=`));
    return arg ? arg.slice(name.length + 3) : '';
}

function argJson(name) {
    const raw = argValue(name);
    try {
        return raw ? JSON.parse(raw) : undefined;
    } catch {
        return Symbol.for('invalid-json');
    }
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    const manifestPath = argValue('manifest') || 'dev-tools/release-schema-manifest.json';
    let manifest;
    try {
        manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (err) {
        console.log(`::error::readiness gate failed (fail-closed): cannot read manifest: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
    const result = evaluateReadiness({
        manifest,
        target: argValue('target'),
        database: argValue('database'),
        sha: argValue('sha'),
        migrationsDir: argValue('migrations-dir') || 'migrations',
        applied: argJson('applied'),
        pendingText: (() => {
            const found = process.argv.find((a) => a.startsWith('--pending-text='));
            return found === undefined ? undefined : found.slice('--pending-text='.length);
        })(),
        schema: argJson('schema'),
    });
    console.log(JSON.stringify(result, null, 1));
    if (!result.ok) {
        for (const c of result.checks.filter((c) => !c.ok)) {
            console.log(`::error::readiness ${c.name}: ${c.detail}`);
        }
        console.log('READINESS GATE FAIL (fail-closed) — deploy blocked before pages deploy');
        process.exit(1);
    }
    console.log('READINESS GATE PASS');
}
