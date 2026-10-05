#!/usr/bin/env node
/**
 * R2-A (H8) — bootstrap the TEMPORARY DEV admin identity (admin/admin).
 *
 *   node dev-tools/bootstrap-admin.mjs              # dry-run (default): print SQL, write nothing
 *   node dev-tools/bootstrap-admin.mjs --apply --local
 *     # execute the SQL against the LOCAL D1 only (dev machine)
 *
 * Safety rules (by design, do not weaken):
 * - There is NO remote/production path here. Any `--remote` (or env that
 *   implies it) is refused with a non-zero exit. Creating or upgrading a
 *   production admin stays H8/owner-gated (see docs/07-ONBOARDING.md).
 * - This is a dev tool, NOT a migration: nothing here runs on deploy,
 *   on seed, or on any schedule. `admin/admin` must never exist in
 *   production; treat it as a local throwaway credential.
 * - The password hash uses the SAME PBKDF2-SHA256 parameters as
 *   CryptoUtils (100k iterations, 16-byte salt, 32-byte key) so login
 *   verifies it through the normal path (incl. no legacy upgrade).
 */

import { randomBytes, pbkdf2Sync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const DEV_USERNAME = 'admin';
const DEV_EMAIL = 'admin@dueli.local';
const DEV_PASSWORD = 'admin';
const DEV_DISPLAY = 'Administrator';

function devPasswordHash() {
    const salt = randomBytes(16);
    const key = pbkdf2Sync(DEV_PASSWORD, salt, 100_000, 32, 'sha256');
    return `pbkdf2$100000$${salt.toString('hex')}$${key.toString('hex')}`;
}

function buildSql(hash) {
    const esc = (s) => s.replace(/'/g, "''");
    return [
        '-- R2-A dev bootstrap (LOCAL ONLY): temporary admin identity + SuperAdmin role.',
        `-- Re-running resets the TEMP password of ${DEV_USERNAME} (documented dev behavior).`,
        `INSERT INTO users (email, username, display_name, password_hash, country, language, is_verified, is_admin, is_fake, created_at)`,
        `VALUES ('${esc(DEV_EMAIL)}', '${esc(DEV_USERNAME)}', '${esc(DEV_DISPLAY)}', '${hash}', 'SA', 'ar', 1, 1, 0, datetime('now'))`,
        `ON CONFLICT(email) DO UPDATE SET password_hash = excluded.password_hash, is_verified = 1, is_admin = 1, is_fake = 0;`,
        `INSERT INTO admin_roles (user_id, role, granted_by)`,
        `SELECT id, 'SuperAdmin', id FROM users WHERE username = '${esc(DEV_USERNAME)}'`,
        `ON CONFLICT(user_id) DO UPDATE SET role = 'SuperAdmin';`,
        '',
    ].join('\n');
}

function usage() {
    console.log([
        'Usage:',
        '  node dev-tools/bootstrap-admin.mjs                 # dry-run: print SQL only',
        '  node dev-tools/bootstrap-admin.mjs --apply --local # run SQL on LOCAL D1',
        '',
        'Remote/production admin creation is REFUSED here (H8/owner-gated).',
    ].join('\n'));
}

function main() {
    const args = new Set(process.argv.slice(2));
    if (args.has('--help') || args.has('-h')) {
        usage();
        return;
    }
    if (args.has('--remote') || process.env.BOOTSTRAP_TARGET === 'remote') {
        console.error(
            'REFUSED: production admin creation is H8/owner-gated and never runs from this script. ' +
            'See docs/07-ONBOARDING.md (owner-gated production path). No writes performed.'
        );
        process.exitCode = 2;
        return;
    }
    const apply = args.has('--apply');
    const local = args.has('--local');
    if (apply && !local) {
        console.error('REFUSED: --apply requires --local. Remote apply does not exist in this script.');
        process.exitCode = 2;
        return;
    }
    const hash = devPasswordHash();
    const sql = buildSql(hash);
    if (!apply) {
        console.log(sql);
        console.log('-- DRY-RUN: no writes performed. Re-run with --apply --local for local D1.');
        return;
    }
    const dir = mkdtempSync(join(tmpdir(), 'dueli-admin-'));
    const file = join(dir, 'bootstrap-admin.sql');
    try {
        writeFileSync(file, sql, 'utf8');
        const run = spawnSync('npx', ['wrangler', 'd1', 'execute', 'dueli-db', '--local', `--file=${file}`], {
            encoding: 'utf8',
            shell: process.platform === 'win32',
        });
        if (run.stdout) process.stdout.write(run.stdout);
        if (run.stderr) process.stderr.write(run.stderr);
        if (run.status !== 0) {
            console.error('Local bootstrap failed (no remote touched).');
            process.exitCode = 1;
            return;
        }
        console.log(`Local admin ready: ${DEV_USERNAME}/${DEV_PASSWORD} (DEV ONLY — never a production credential).`);
    } finally {
        rmSync(dir, { recursive: true, force: true });
    }
}

main();
