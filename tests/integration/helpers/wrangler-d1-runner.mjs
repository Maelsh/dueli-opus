import { execFileSync } from 'child_process';
import { readdirSync, rmSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(__dirname, '..', '..', '..');
const TEST_PERSIST_DIR = join(PROJECT_ROOT, '.wrangler-test');
const WRANGLER_BIN = join(PROJECT_ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
const DATABASE_NAME = 'dueli-db';
const CHILD_ENV = { ...process.env, CI: '1', NO_COLOR: '1', WRANGLER_SEND_METRICS: 'false' };

/**
 * Run the locally installed Wrangler CLI with an arguments array (no shell
 * string interpolation). On failure, throws an error carrying the exact
 * command, exit code, stderr and stdout.
 */
function runWrangler(args, { expectJson = false } = {}) {
    const commandName = `wrangler ${args.join(' ')}`;
    try {
        const stdout = execFileSync(process.execPath, [WRANGLER_BIN, ...args], {
            cwd: PROJECT_ROOT,
            env: CHILD_ENV,
            encoding: 'utf-8',
            maxBuffer: 64 * 1024 * 1024,
        });
        if (!expectJson) {
            return { stdout, stderr: '' };
        }
        return parseWranglerJson(commandName, stdout);
    } catch (error) {
        throw new Error(
            `Wrangler command failed: ${commandName}\n` +
                `exit code: ${error.status}\n` +
                `stderr: ${error.stderr}\n` +
                `stdout: ${error.stdout}`,
        );
    }
}

function parseWranglerJson(commandName, stdout) {
    const trimmed = stdout.trim();
    try {
        return JSON.parse(trimmed);
    } catch {
        // Some Wrangler versions prepend informational lines; locate the JSON payload.
        const start = trimmed.search(/[[{]/);
        if (start === -1) {
            throw new Error(
                `Wrangler command did not return JSON: ${commandName}\nstdout: ${trimmed}`,
            );
        }
        try {
            return JSON.parse(trimmed.slice(start));
        } catch (parseError) {
            throw new Error(
                `Wrangler JSON parse failed: ${commandName}\n` +
                    `parse error: ${parseError.message}\n` +
                    `stdout: ${trimmed}`,
            );
        }
    }
}

/**
 * Apply the real migrations/*.sql files as-is via the official Wrangler CLI
 * against a fresh, isolated local D1 state directory. No SQL content is ever
 * read, parsed, transformed, or executed by this runner.
 */
export function applyMigrationsViaWrangler() {
    // Every integration run starts from an empty isolated state.
    rmSync(TEST_PERSIST_DIR, { recursive: true, force: true });

    const { stdout } = runWrangler([
        'd1',
        'migrations',
        'apply',
        DATABASE_NAME,
        '--local',
        `--persist-to=${TEST_PERSIST_DIR}`,
    ]);
    return stdout;
}

/**
 * Execute a read-only query through the Wrangler CLI against the same
 * isolated local D1 and return clean rows.
 */
export function queryD1(command) {
    const payload = runWrangler(
        [
            'd1',
            'execute',
            DATABASE_NAME,
            '--local',
            `--persist-to=${TEST_PERSIST_DIR}`,
            '--json',
            '--command',
            command,
        ],
        { expectJson: true },
    );

    if (Array.isArray(payload)) {
        const first = payload[0] ?? {};
        return first.results ?? [];
    }
    if (payload && Array.isArray(payload.results)) {
        return payload.results;
    }
    throw new Error(`Unexpected Wrangler JSON shape for: ${command}\n${JSON.stringify(payload)}`);
}

/**
 * List migration file NAMES only (never their contents) to assert the
 * expected migration set.
 */
export function listMigrationFileNames() {
    return readdirSync(join(PROJECT_ROOT, 'migrations'))
        .filter((f) => f.startsWith('00') && f.endsWith('.sql'))
        .sort();
}

/**
 * Remove the isolated local D1 state directory without applying anything.
 * Used by tests that need to drive a custom migration sequence
 * (e.g. legacy-data fixture on pre-0014 schema, then apply 0014 only).
 */
export function wipeTestState() {
    rmSync(TEST_PERSIST_DIR, { recursive: true, force: true });
}

/**
 * Execute real migration files as-is, in the given order, via the official
 * Wrangler CLI (`wrangler d1 execute --file`). No SQL content is ever read,
 * parsed, transformed, or copied by this runner. Does NOT wipe state —
 * callers control the sequence explicitly.
 */
export function applyMigrationFiles(fileNames) {
    for (const name of fileNames) {
        runWrangler([
            'd1',
            'execute',
            DATABASE_NAME,
            '--local',
            `--persist-to=${TEST_PERSIST_DIR}`,
            '--file',
            join(PROJECT_ROOT, 'migrations', name),
        ]);
    }
}

/**
 * Execute a write/DDL statement through the Wrangler CLI against the same
 * isolated local D1. Results are parsed (to surface SQL errors) but discarded.
 */
export function execD1(command) {
    runWrangler(
        [
            'd1',
            'execute',
            DATABASE_NAME,
            '--local',
            `--persist-to=${TEST_PERSIST_DIR}`,
            '--json',
            '--command',
            command,
        ],
        { expectJson: true },
    );
}
