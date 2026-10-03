/**
 * Pages bindings isolation gate (R-RELEASE-1, fail-closed).
 *
 * Resolves the effective D1 bindings per Pages environment the way Wrangler
 * does: top-level bindings apply unless the env overrides the same key
 * (an explicit env array — even empty — replaces the top-level one).
 *
 * Rules:
 *   - unknown --target (only `production` | `preview`)            → FAIL
 *   - unreadable/invalid wrangler.jsonc                           → FAIL
 *   - `preview` resolving ANY d1_databases                         → FAIL
 *     (no authorized preview D1 exists; a preview inheriting production
 *     D1 must never deploy — fail closed, create nothing, copy nothing)
 *   - `preview` resolving a database_id equal to production's      → FAIL
 *   - `production` resolving anything other than exactly the
 *     manifest production D1 (dueli-db + pinned id)               → FAIL
 *
 * Read-only: parses the local config file only. Never contacts Cloudflare,
 * never creates resources, never reads secrets.
 *
 * Usage: node dev-tools/check-pages-bindings.mjs --target=production|preview
 *        [--config=wrangler.jsonc]
 */

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const PRODUCTION_D1 = {
    binding: 'DB',
    database_name: 'dueli-db',
    database_id: 'f877f573-e31f-452a-8991-8e5035539d56',
};

const KNOWN_TARGETS = new Set(['production', 'preview']);

/** Parse JSONC (JSON with // and block comments) without dependencies. */
export function parseJsonc(text) {
    let out = '';
    let i = 0;
    const n = text.length;
    let str = null;
    while (i < n) {
        const c = text[i];
        const next = i + 1 < n ? text[i + 1] : '';
        if (str) {
            out += c;
            if (c === '\\' && i + 1 < n) {
                out += text[i + 1];
                i += 2;
                continue;
            }
            if (c === str) str = null;
            i += 1;
            continue;
        }
        if (c === '"' || c === "'") {
            str = c;
            out += c;
            i += 1;
            continue;
        }
        if (c === '/' && next === '/') {
            while (i < n && text[i] !== '\n') i += 1;
            continue;
        }
        if (c === '/' && next === '*') {
            i += 2;
            while (i < n && !(text[i] === '*' && i + 1 < n && text[i + 1] === '/')) i += 1;
            i += 2;
            continue;
        }
        out += c;
        i += 1;
    }
    return JSON.parse(out);
}

export function loadConfig(configPath) {
    if (!existsSync(configPath)) {
        throw new Error(`wrangler config not found: ${configPath}`);
    }
    const parsed = parseJsonc(readFileSync(configPath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') {
        throw new Error(`wrangler config is not an object: ${configPath}`);
    }
    return parsed;
}

/** Effective d1_databases for an env: env override wins when present. */
export function resolveD1Databases(config, envName) {
    const top = Array.isArray(config.d1_databases) ? config.d1_databases : [];
    const env = config.env && config.env[envName];
    if (env && Object.prototype.hasOwnProperty.call(env, 'd1_databases')) {
        if (!Array.isArray(env.d1_databases)) {
            throw new Error(`env.${envName}.d1_databases is not an array`);
        }
        return env.d1_databases;
    }
    return top;
}

/**
 * Evaluate bindings for a target. Returns { ok, failures[], info }.
 * Never throws for rule violations (only for unreadable config).
 */
export function checkBindings(config, target) {
    const failures = [];
    if (!KNOWN_TARGETS.has(target)) {
        return { ok: false, failures: [`unknown target: ${target} (expected production|preview)`], info: {} };
    }
    let resolved;
    try {
        resolved = resolveD1Databases(config, target === 'production' ? 'production' : 'preview');
    } catch (err) {
        return { ok: false, failures: [err instanceof Error ? err.message : String(err)], info: {} };
    }
    const info = { target, d1_count: resolved.length, databases: resolved.map((d) => d.database_name) };

    if (target === 'preview') {
        if (resolved.length > 0) {
            failures.push(`preview resolves ${resolved.length} D1 binding(s) — must be zero (no authorized preview D1)`);
        }
        for (const db of resolved) {
            if (db.database_id === PRODUCTION_D1.database_id) {
                failures.push(`preview resolves production database_id ${db.database_id}`);
            }
        }
    } else {
        if (resolved.length !== 1) {
            failures.push(`production must resolve exactly 1 D1 binding, got ${resolved.length}`);
        } else {
            const db = resolved[0];
            for (const key of ['binding', 'database_name', 'database_id']) {
                if (db[key] !== PRODUCTION_D1[key]) {
                    failures.push(`production D1 ${key} mismatch: ${db[key]} (expected ${PRODUCTION_D1[key]})`);
                }
            }
        }
    }
    return { ok: failures.length === 0, failures, info };
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    const targetArg = process.argv.find((a) => a.startsWith('--target='));
    const configArg = process.argv.find((a) => a.startsWith('--config='));
    const target = targetArg ? targetArg.slice('--target='.length) : '';
    const configPath = configArg ? configArg.slice('--config='.length) : 'wrangler.jsonc';
    let result;
    try {
        result = checkBindings(loadConfig(configPath), target);
    } catch (err) {
        console.log(`::error::bindings gate failed (fail-closed): ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
    }
    console.log(`bindings gate [${target}]: ${JSON.stringify(result.info)}`);
    if (!result.ok) {
        for (const f of result.failures) console.log(`::error::${f}`);
        console.log('BINDINGS GATE FAIL (fail-closed) — preview must not inherit production D1');
        process.exit(1);
    }
    console.log('BINDINGS GATE PASS');
}
