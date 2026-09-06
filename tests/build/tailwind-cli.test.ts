import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * P1 regression (2026-09-05): package.json's build:css used
 * `npx @tailwindcss/cli ...` while @tailwindcss/cli was not a locked
 * dependency, so npx silently fetched whatever version was newest on the
 * registry at build time — a different Tailwind CLI version than the
 * locked `tailwindcss` core, with no reproducibility guarantee and a
 * network dependency on every fresh `npm ci`.
 *
 * This test needs no network access: it only reads package.json and checks
 * that npm ci would have produced a local binary.
 */
const root = resolve(__dirname, '../..');

describe('P1: Tailwind CLI is a locked local dependency', () => {
    it('@tailwindcss/cli is a locked devDependency', () => {
        const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
        expect(pkg.devDependencies).toHaveProperty('@tailwindcss/cli');
    });

    it('build:css does not shell out to npx @tailwindcss/cli', () => {
        const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
        expect(pkg.scripts['build:css']).not.toMatch(/npx\s+@tailwindcss\/cli/);
    });

    it('node_modules/.bin/tailwindcss exists after install (no network needed to check)', () => {
        // Windows produces tailwindcss.CMD/.ps1 shims; POSIX produces a plain
        // executable named tailwindcss. Accept either so this test doesn't
        // become OS-specific.
        const candidates = [
            resolve(root, 'node_modules/.bin/tailwindcss'),
            resolve(root, 'node_modules/.bin/tailwindcss.CMD'),
            resolve(root, 'node_modules/.bin/tailwindcss.cmd'),
            resolve(root, 'node_modules/.bin/tailwindcss.ps1'),
        ];
        expect(candidates.some((p) => existsSync(p))).toBe(true);
    });
});
