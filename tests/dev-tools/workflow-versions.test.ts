import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// R-RELEASE-MAINT-1: GitHub Actions emitted two warnings on green runs:
// (1) actions/checkout@v4 + actions/setup-node@v4 run on deprecated Node 20
// (forced onto Node 24); (2) ubuntu-latest migrates to Ubuntu 26 on
// 2026-10-19. Both active release workflows (deploy.yml, quality-gate.yml)
// must stay on supported runtimes with a pinned runner. The disabled
// deploy-streaming.yml placeholder is out of scope by design.

const ACTIVE = [
    '.github/workflows/deploy.yml',
    '.github/workflows/quality-gate.yml',
].map((f) => ({ file: f, text: readFileSync(resolve(f), 'utf8') }));

describe('release workflow versions + runner (no deprecation warnings)', () => {
    for (const { file, text } of ACTIVE) {
        describe(file, () => {
            it('actions run on node24 (checkout v7 + setup-node v7, no v4)', () => {
                expect(text).toContain('actions/checkout@v7');
                expect(text).toContain('actions/setup-node@v7');
                expect(text).not.toContain('actions/checkout@v4');
                expect(text).not.toContain('actions/setup-node@v4');
            });

            it('runner pinned to ubuntu-24.04 (no floating ubuntu-latest)', () => {
                expect(text).toContain('runs-on: ubuntu-24.04');
                expect(text).not.toContain('ubuntu-latest');
            });

            it('app runtime unchanged (Node 22 via setup-node, no logic change)', () => {
                expect(text).toMatch(/node-version:\s*['"]?22['"]?/);
            });
        });
    }
});
