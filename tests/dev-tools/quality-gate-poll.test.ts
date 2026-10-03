import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

// R-RELEASE-1-REM1 follow-up: the Quality-Gate poll shipped an invalid jq
// terminator (`fi` instead of `end`), which fails the whole deploy workflow
// at startup with no jobs. String-presence pins cannot catch this class of
// bug — so this test extracts the REAL `--jq` filter from deploy.yml and
// evaluates it with a REAL jq engine against fixture run-lists covering
// every poll state. A future syntax regression fails here, not in prod CI.
//
// jq resolution: `jq` on PATH (ubuntu CI runners preinstall it), or JQ_PATH.

const DEPLOY = readFileSync(resolve('.github/workflows/deploy.yml'), 'utf8');
const URL = 'https://github.com/Maelsh/dueli-opus/actions/runs/1';

function extractJqFilter(): string {
    const matches = [...DEPLOY.matchAll(/--jq '([^']+)'/g)];
    expect(matches.length, 'expected exactly one --jq filter in deploy.yml').toBe(1);
    return matches[0][1];
}

function jqBinary(): string {
    if (process.env.JQ_PATH) return process.env.JQ_PATH;
    try {
        execFileSync('jq', ['--version'], { stdio: 'pipe' });
        return 'jq';
    } catch {
        throw new Error('no jq binary found: install jq or set JQ_PATH (ubuntu CI has jq preinstalled)');
    }
}

function runFilter(input: unknown): string {
    const out = execFileSync(jqBinary(), ['-r', extractJqFilter()], {
        input: JSON.stringify(input),
        encoding: 'utf8',
    });
    return String(out).trim();
}

describe('quality-gate poll filter (functional jq evaluation)', () => {
    it('filter terminates with `end` (the `fi` regression must not return)', () => {
        expect(extractJqFilter().trim().endsWith('end')).toBe(true);
    });

    it('no run yet => NO_RUN (deploy waits, does not fail)', () => {
        expect(runFilter([])).toBe('NO_RUN');
    });

    it('queued / in_progress with null conclusion => wait states', () => {
        expect(runFilter([{ status: 'queued', conclusion: null, url: URL }])).toBe(`queued - ${URL}`);
        expect(runFilter([{ status: 'in_progress', conclusion: null, url: URL }])).toBe(`in_progress - ${URL}`);
        expect(runFilter([{ status: 'waiting', conclusion: null, url: URL }])).toBe(`waiting - ${URL}`);
    });

    it('missing conclusion key degrades to `-`, never to success', () => {
        expect(runFilter([{ status: 'in_progress', url: URL }])).toBe(`in_progress - ${URL}`);
        expect(runFilter([{ status: 'completed', url: URL }])).toBe(`completed - ${URL}`);
    });

    it('completed success => exact PASS verdict string', () => {
        expect(runFilter([{ status: 'completed', conclusion: 'success', url: URL }]))
            .toBe(`completed success ${URL}`);
    });

    it('completed failure / cancelled / timed_out => exact BLOCK verdict strings', () => {
        expect(runFilter([{ status: 'completed', conclusion: 'failure', url: URL }]))
            .toBe(`completed failure ${URL}`);
        expect(runFilter([{ status: 'completed', conclusion: 'cancelled', url: URL }]))
            .toBe(`completed cancelled ${URL}`);
        expect(runFilter([{ status: 'completed', conclusion: 'timed_out', url: URL }]))
            .toBe(`completed timed_out ${URL}`);
    });

    it('latest run wins ([0]) when several runs exist for the SHA', () => {
        expect(runFilter([
            { status: 'completed', conclusion: 'failure', url: `${URL}-new` },
            { status: 'completed', conclusion: 'success', url: `${URL}-old` },
        ])).toBe(`completed failure ${URL}-new`);
    });
});

describe('quality-gate poll hardening (shell control flow)', () => {
    it('transient gh/API failure is guarded (no bare unguarded gh call kills the step)', () => {
        expect(DEPLOY).toContain('if STATE=$(gh run list');
        // The verdict strings above drive completed=>pass/block; anything
        // else (NO_RUN / non-completed / GH_ERROR) falls through to wait-or-timeout.
        expect(DEPLOY).toContain('GH_ERROR:');
        expect(DEPLOY).toContain('Timed out after');
    });
});
