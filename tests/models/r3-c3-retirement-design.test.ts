/**
 * R3-C3 — synthetic-retirement future design (documentation only).
 *
 * This suite pins the documentation deliverable WITHOUT changing runtime:
 * 1. docs/20-SYNTHETIC-RETIREMENT-DESIGN.md exists with every required
 *    section (current reality, scope, threshold, triggers, protected
 *    dependencies, dry-run, fail-closed, observability/recovery).
 * 2. No runtime synthetic-deletion path exists outside the pinned
 *    C7 call sites (UserModel.create + CompetitionModel.create + the OAuth
 *    signup path, all single best-effort retires after a real creation) —
 *    any new destructive endpoint/route/cron fails here first.
 * 3. The design stays honest: it must keep stating what is NOT implemented
 *    (no dry-run tool, no batch sweep, no admin trigger, no cron).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const DOC = resolve(__dirname, '../../docs/20-SYNTHETIC-RETIREMENT-DESIGN.md');

function readDoc(): string {
    return readFileSync(DOC, 'utf-8');
}

function srcFiles(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'client') continue; // server-side deletion surface only
            srcFiles(full, out);
        } else if (entry.name.endsWith('.ts')) {
            out.push(full);
        }
    }
    return out;
}

describe('R3-C3 retirement design document', () => {
    it('1. design doc exists with all eight required sections', () => {
        const doc = readDoc();
        for (const section of [
            '## 0.',
            '## 1.',
            '## 2.',
            '## 3.',
            '## 4.',
            '## 5.',
            '## 6.',
            '## 7.',
            '## 8.',
        ]) {
            expect(doc, `section ${section}`).toContain(section);
        }
        for (const keyword of [
            'KEEP NOW',
            'is_fake',
            'dry-run',
            'DRY-RUN',
            'FAIL-CLOSED',
            'admin_audit_logs',
        ]) {
            expect(doc, `keyword ${keyword}`).toContain(keyword);
        }
    });

    it('2. no runtime synthetic-deletion path outside the two pinned call sites', () => {
        const callers: string[] = [];
        for (const file of srcFiles(resolve(__dirname, '../../src'))) {
            const text = readFileSync(file, 'utf-8');
            if (text.includes('retireOneSyntheticUser') || text.includes('retireOneSyntheticCompetition')) {
                // The service definition itself is not a call site.
                if (file.endsWith('SyntheticRetirementService.ts')) continue;
                callers.push(file);
            }
        }
        const names = callers.map((f) => f.split(/[/\\]/).slice(-2).join('/')).sort();
        expect(names).toEqual([
            'auth/oauth-routes.ts',
            'models/CompetitionModel.ts',
            'models/UserModel.ts',
        ]);
    });

    it('3. design stays honest about what is NOT implemented', () => {
        const doc = readDoc();
        expect(doc).toContain('غير موجود');
        expect(doc).toContain('DESIGN ONLY');
        // The future dry-run/admin-trigger/cron must stay undesigned-as-built.
        expect(doc).not.toMatch(/dry-run (tool|endpoint|button) (shipped|implemented|موجود)/i);
    });
});
