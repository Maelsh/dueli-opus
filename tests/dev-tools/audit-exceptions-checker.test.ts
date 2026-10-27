/**
 * UNIT33.1 — production audit gate script smoke test.
 */
import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');

describe('UNIT33.1 audit exceptions gate', () => {
    it('passes when production npm audit has no high+ advisories', () => {
        const out = execSync('node dev-tools/check-audit-exceptions.mjs', {
            cwd: root,
            encoding: 'utf8',
        });
        expect(out).toContain('PASS');
    });
});
