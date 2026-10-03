import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// R-RELEASE-1 release-gate wiring pins (§7): deploy is bound to the Quality
// Gate result for the SAME SHA (API check only, no suite rerun), bindings +
// readiness gates run before their deploys, and no apply path exists.
// Structural text pins (no YAML dependency); full YAML validity is verified
// separately during development, not on every run.

const DEPLOY = readFileSync(resolve('.github/workflows/deploy.yml'), 'utf8');
const GATE = readFileSync(resolve('.github/workflows/quality-gate.yml'), 'utf8');

function runLines(yaml: string): string[] {
    return yaml.split('\n').filter((l) => l.trim().startsWith('run:'));
}

function ifLines(yaml: string): string[] {
    return yaml.split('\n').filter((l) => l.trim().startsWith('if:'));
}

describe('deploy workflow release wiring', () => {
    it('deploy waits for a same-SHA+event Quality Gate result (poll to completed, no rerun)', () => {
        expect(DEPLOY).toContain('quality-gate-check');
        expect(DEPLOY).toContain('needs: [quality-gate-check]');
        expect(DEPLOY).toContain('gh run list');
        expect(DEPLOY).toContain('--commit');
        expect(DEPLOY).toContain('pull_request.head.sha');
        // R-RELEASE-1-REM1: explicit repo + event, wait until completed, then
        // require conclusion success; timeout fails closed. A single immediate
        // poll is the Quality/deploy race — it must not return.
        expect(DEPLOY).toContain('--repo');
        expect(DEPLOY).toContain('--event');
        expect(DEPLOY).toContain('completed');
        expect(DEPLOY).toContain('TIMEOUT_SECONDS');
        expect(DEPLOY).not.toMatch(/\.conclusion \/\/ "none"/);
        // no test suite rerun inside deploy (it ran in Quality Gate)
        expect(DEPLOY).not.toMatch(/vitest run|npm test|npm run test/);
    });

    it('no secrets context in any if: — presence projected via job env (P1)', () => {
        for (const line of ifLines(DEPLOY)) {
            expect(line).not.toContain('secrets.');
        }
        for (const line of ifLines(GATE)) {
            expect(line).not.toContain('secrets.');
        }
        // Documented safe mechanism: presence bit mapped once in job env,
        // steps test env. instead. Value never interpolated into run:.
        expect(DEPLOY).toContain("HAS_CLOUDFLARE_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN != '' }}");
        expect(DEPLOY).toContain("env.HAS_CLOUDFLARE_TOKEN == 'true'");
    });

    it('no shell interpolation of GitHub expressions in run: lines (P1)', () => {
        for (const line of runLines(DEPLOY)) {
            expect(line).not.toContain('${{');
        }
        expect(DEPLOY).toContain('--branch="$BRANCH"');
        expect(DEPLOY).toContain('BRANCH:');
    });

    it('bindings + readiness gates run before their deploys', () => {
        const order = (s: string) => DEPLOY.indexOf(s);
        expect(order('check-pages-bindings.mjs --target=production')).toBeGreaterThan(-1);
        expect(order('check-pages-bindings.mjs --target=preview')).toBeGreaterThan(-1);
        expect(order('check-pages-bindings.mjs --target=production')).toBeLessThan(order('Deploy to Cloudflare Pages (production)'));
        expect(order('check-release-readiness.mjs')).toBeGreaterThan(-1);
        expect(order('check-release-readiness.mjs')).toBeLessThan(order('Deploy to Cloudflare Pages (production)'));
    });

    it('production deploys only on push to main; preview stops safely without secrets', () => {
        expect(DEPLOY).toContain("github.ref == 'refs/heads/main'");
        expect(DEPLOY).toContain("env.HAS_CLOUDFLARE_TOKEN == 'true'");
    });

    it('same Cloudflare secrets, no new names; Wrangler mechanism kept', () => {
        expect(DEPLOY).toContain('CLOUDFLARE_API_TOKEN');
        expect(DEPLOY).toContain('CLOUDFLARE_ACCOUNT_ID');
        expect(DEPLOY).toContain('wrangler pages deploy dist --project-name=project-8e7c178d');
        expect(DEPLOY).not.toMatch(/uses:\s*\S*pages-action/);
    });

    it('no migration apply path anywhere in CI', () => {
        expect(DEPLOY).not.toContain('migrations apply');
        expect(GATE).not.toContain('migrations apply');
    });

    it('quality gate still runs the AST SEC-06 checker', () => {
        expect(GATE).toContain('node dev-tools/check-sec06-math-random.mjs');
    });
});
