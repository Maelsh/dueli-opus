/**
 * UNIT33.1 — production audit gate script (full path via env fixtures).
 */
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const fixtures = join(root, 'tests/fixtures/npm-audit');
const checker = join(root, 'dev-tools/check-audit-exceptions.mjs');
const validExceptions = join(fixtures, 'exceptions-valid.json');

function loadValidEntry() {
    return JSON.parse(readFileSync(validExceptions, 'utf8')).exceptions[0] as Record<string, string>;
}

function runGate(
    env: Record<string, string | undefined>,
    expectCode: 0 | 1 = 0
): { stdout: string; stderr: string; code: number } {
    try {
        const stdout = execSync(`node "${checker}"`, {
            cwd: root,
            encoding: 'utf8',
            env: { ...process.env, ...env },
        });
        if (expectCode !== 0) {
            throw new Error(`expected exit ${expectCode} but succeeded: ${stdout}`);
        }
        return { stdout, stderr: '', code: 0 };
    } catch (err: unknown) {
        const e = err as { status?: number; stdout?: string; stderr?: string };
        const code = typeof e.status === 'number' ? e.status : 1;
        if (code !== expectCode) {
            throw err;
        }
        return {
            stdout: e.stdout?.toString() || '',
            stderr: e.stderr?.toString() || '',
            code,
        };
    }
}

function writeTempExceptions(body: Record<string, unknown>): string {
    const dir = mkdtempSync(join(tmpdir(), 'dueli-audit-ex-'));
    const path = join(dir, 'exceptions.json');
    writeFileSync(path, JSON.stringify(body), 'utf8');
    return path;
}

describe('UNIT33.1 audit exceptions gate', () => {
    const baseEnv = {
        DUELI_AUDIT_FIXTURE: join(fixtures, 'clean.json'),
        DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
        DUELI_AUDIT_EXCEPTIONS: join(root, 'dev-tools/audit-exceptions.json'),
    };

    it('passes when production npm audit has no high+ advisories', () => {
        const env = { ...process.env };
        delete env.DUELI_AUDIT_FIXTURE;
        delete env.DUELI_LOCKFILE;
        delete env.DUELI_AUDIT_EXCEPTIONS;
        const { stdout } = runGate(env);
        expect(stdout).toContain('PASS');
    });

    it('passes with empty exceptions and clean audit fixture', () => {
        const exPath = writeTempExceptions({ exceptions: [] });
        const { stdout } = runGate({
            ...baseEnv,
            DUELI_AUDIT_EXCEPTIONS: exPath,
        });
        expect(stdout).toContain('PASS');
    });

    it('passes when a fully documented exception matches advisory GHSA from via url', () => {
        const { stdout } = runGate({
            DUELI_AUDIT_FIXTURE: join(fixtures, 'one-high.json'),
            DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
            DUELI_AUDIT_EXCEPTIONS: validExceptions,
        });
        expect(stdout).toContain('PASS');
        expect(stdout).toContain('GHSA-ABCD-1234-EFGH');
    });

    it('fails when exception GHSA does not match any advisory', () => {
        const entry = { ...loadValidEntry(), ghsa: 'GHSA-zzzz-zzzz-zzzz' };
        const exPath = writeTempExceptions({ exceptions: [entry] });
        const { stderr, stdout } = runGate(
            {
                DUELI_AUDIT_FIXTURE: join(fixtures, 'one-high.json'),
                DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                DUELI_AUDIT_EXCEPTIONS: exPath,
            },
            1
        );
        expect(stderr + stdout).toMatch(/orphan|Blocking|without approved/i);
    });

    it('fails on orphan exception with no matching advisory', () => {
        const { stderr, stdout } = runGate(
            {
                ...baseEnv,
                DUELI_AUDIT_EXCEPTIONS: validExceptions,
            },
            1
        );
        expect(stderr + stdout).toContain('orphan exception');
    });

    it('rejects exception missing a required field', () => {
        const entry = { ...loadValidEntry() };
        delete entry.tracking;
        const exPath = writeTempExceptions({ exceptions: [entry] });
        const { stderr, stdout } = runGate(
            {
                DUELI_AUDIT_FIXTURE: join(fixtures, 'one-high.json'),
                DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                DUELI_AUDIT_EXCEPTIONS: exPath,
            },
            1
        );
        expect(stderr + stdout).toContain('missing required field');
    });

    it('rejects when installed version is outside affected_range', () => {
        const entry = { ...loadValidEntry(), affected_range: '9.9.9' };
        const exPath = writeTempExceptions({ exceptions: [entry] });
        const { stderr, stdout } = runGate(
            {
                DUELI_AUDIT_FIXTURE: join(fixtures, 'one-high.json'),
                DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                DUELI_AUDIT_EXCEPTIONS: exPath,
            },
            1
        );
        expect(stderr + stdout).toContain('orphan exception');
    });

    it('rejects expired exception', () => {
        const entry = { ...loadValidEntry(), expires: '2020-01-01' };
        const exPath = writeTempExceptions({ exceptions: [entry] });
        const { stderr, stdout } = runGate(
            {
                DUELI_AUDIT_FIXTURE: join(fixtures, 'one-high.json'),
                DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                DUELI_AUDIT_EXCEPTIONS: exPath,
            },
            1
        );
        expect(stderr + stdout).toContain('expired exception');
    });

    it('rejects invalid exceptions JSON', () => {
        const dir = mkdtempSync(join(tmpdir(), 'dueli-audit-bad-'));
        const badPath = join(dir, 'bad.json');
        writeFileSync(badPath, '{ not json', 'utf8');
        const { stderr, stdout } = runGate(
            {
                ...baseEnv,
                DUELI_AUDIT_EXCEPTIONS: badPath,
            },
            1
        );
        expect(stderr + stdout).toContain('invalid or unreadable exceptions file');
    });

    it('fails closed on unreadable audit fixture', () => {
        const { stderr, stdout } = runGate(
            {
                DUELI_AUDIT_FIXTURE: join(fixtures, 'no-such-audit.json'),
                DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                DUELI_AUDIT_EXCEPTIONS: writeTempExceptions({ exceptions: [] }),
            },
            1
        );
        expect(stderr + stdout).toContain('invalid audit fixture');
    });

    it('extracts GHSA from string via entries', () => {
        const { stdout } = runGate({
            DUELI_AUDIT_FIXTURE: join(fixtures, 'via-string.json'),
            DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
            DUELI_AUDIT_EXCEPTIONS: validExceptions,
        });
        expect(stdout).toContain('PASS');
    });

    describe('F-1 — audit report shape (fail-closed)', () => {
        const emptyEx = () => writeTempExceptions({ exceptions: [] });

        it('rejects npm-style network/registry error JSON without vulnerabilities (F-1)', () => {
            const { stderr, stdout } = runGate(
                {
                    DUELI_AUDIT_FIXTURE: join(fixtures, 'network-error.json'),
                    DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                    DUELI_AUDIT_EXCEPTIONS: emptyEx(),
                },
                1
            );
            const out = stderr + stdout;
            expect(out).not.toContain('PASS');
            expect(out).toMatch(/vulnerability report|vulnerabilities/i);
        });

        it('accepts a clean report with vulnerabilities: {}', () => {
            const { stdout } = runGate({
                DUELI_AUDIT_FIXTURE: join(fixtures, 'clean.json'),
                DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                DUELI_AUDIT_EXCEPTIONS: emptyEx(),
            });
            expect(stdout).toContain('PASS');
        });

        it('processes blocking vulns from a valid report (non-zero exit shape via fixture)', () => {
            const { stderr, stdout } = runGate(
                {
                    DUELI_AUDIT_FIXTURE: join(fixtures, 'one-high.json'),
                    DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                    DUELI_AUDIT_EXCEPTIONS: emptyEx(),
                },
                1
            );
            expect(stderr + stdout).toContain('Blocking production advisories');
            expect(stdout).not.toContain('PASS');
        });

        it('rejects audit JSON missing vulnerabilities field', () => {
            const { stderr, stdout } = runGate(
                {
                    DUELI_AUDIT_FIXTURE: join(fixtures, 'missing-vulnerabilities.json'),
                    DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                    DUELI_AUDIT_EXCEPTIONS: emptyEx(),
                },
                1
            );
            expect(stderr + stdout).toContain('missing required vulnerabilities');
            expect(stdout).not.toContain('PASS');
        });

        it('rejects malformed audit JSON fixture', () => {
            const { stderr, stdout } = runGate(
                {
                    DUELI_AUDIT_FIXTURE: join(fixtures, 'broken-audit.json'),
                    DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                    DUELI_AUDIT_EXCEPTIONS: emptyEx(),
                },
                1
            );
            expect(stderr + stdout).toContain('invalid JSON');
        });

        it('fails when npm audit cannot reach registry (live npm, F-1)', () => {
            const env = { ...process.env };
            delete env.DUELI_AUDIT_FIXTURE;
            delete env.DUELI_LOCKFILE;
            env.DUELI_AUDIT_EXCEPTIONS = join(root, 'dev-tools/audit-exceptions.json');
            env.npm_config_registry = 'http://127.0.0.1:9/';
            const { stderr, stdout, code } = runGate(env, 1);
            expect(code).toBe(1);
            expect(stdout).not.toContain('PASS');
            expect(stderr + stdout).toMatch(/vulnerability report|ECONNREFUSED|request failed/i);
        }, 120_000);
    });

    describe('F-2 — invalid vulnerability severity', () => {
        it('does not silently ignore entries with invalid severity', () => {
            const { stderr, stdout } = runGate(
                {
                    DUELI_AUDIT_FIXTURE: join(fixtures, 'invalid-severity.json'),
                    DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                    DUELI_AUDIT_EXCEPTIONS: writeTempExceptions({ exceptions: [] }),
                },
                1
            );
            expect(stderr + stdout).toContain('invalid or missing severity');
            expect(stdout).not.toContain('PASS');
        });
    });

    describe('P3 — review follow-ups', () => {
        const emptyEx = () => writeTempExceptions({ exceptions: [] });
        const shimNonZero = `node "${join(fixtures, 'shim-nonzero-one-high.mjs')}"`;

        it('P3-1: parses valid JSON from non-zero exit and blocks high vuln without exception', () => {
            const env = { ...process.env };
            delete env.DUELI_AUDIT_FIXTURE;
            env.DUELI_AUDIT_CMD = shimNonZero;
            env.DUELI_LOCKFILE = join(fixtures, 'mini-lock.json');
            env.DUELI_AUDIT_EXCEPTIONS = emptyEx();
            const { stderr, stdout, code } = runGate(env, 1);
            expect(code).toBe(1);
            expect(stderr + stdout).toContain('Blocking production advisories');
            expect(stdout).not.toContain('PASS');
        });

        it('P3-1: same shim passes when a valid exception matches the advisory', () => {
            const env = { ...process.env };
            delete env.DUELI_AUDIT_FIXTURE;
            env.DUELI_AUDIT_CMD = shimNonZero;
            env.DUELI_LOCKFILE = join(fixtures, 'mini-lock.json');
            env.DUELI_AUDIT_EXCEPTIONS = validExceptions;
            const { stdout } = runGate(env);
            expect(stdout).toContain('PASS');
        });

        it('P3-2: rejects report that combines error with vulnerabilities', () => {
            const { stderr, stdout } = runGate(
                {
                    DUELI_AUDIT_FIXTURE: join(fixtures, 'error-plus-vulnerabilities.json'),
                    DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                    DUELI_AUDIT_EXCEPTIONS: emptyEx(),
                },
                1
            );
            expect(stderr + stdout).toContain('combines error with vulnerabilities');
            expect(stdout).not.toContain('PASS');
        });

        it('P3-3: rejects vulnerability entry with no severity field', () => {
            const { stderr, stdout } = runGate(
                {
                    DUELI_AUDIT_FIXTURE: join(fixtures, 'missing-severity-field.json'),
                    DUELI_LOCKFILE: join(fixtures, 'mini-lock.json'),
                    DUELI_AUDIT_EXCEPTIONS: emptyEx(),
                },
                1
            );
            expect(stderr + stdout).toContain('invalid or missing severity');
            expect(stdout).not.toContain('PASS');
        });
    });
});
