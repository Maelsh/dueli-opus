/**
 * UNIT33.1 — blocking production npm audit gate with optional exceptions.
 *
 * Runs `npm audit --omit=dev --json` and fails on any advisory at or above
 * `high` unless a matching, non-expired entry exists in audit-exceptions.json.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const EXCEPTIONS_PATH = join(__dirname, 'audit-exceptions.json');

function loadExceptions() {
    const raw = JSON.parse(readFileSync(EXCEPTIONS_PATH, 'utf8'));
    const list = Array.isArray(raw.exceptions) ? raw.exceptions : [];
    const today = new Date().toISOString().slice(0, 10);
    return list.filter((e) => {
        if (!e?.ghsa || !e?.package || !e?.expires) return false;
        return String(e.expires) >= today;
    });
}

function runAuditJson() {
    try {
        const out = execSync('npm audit --omit=dev --json', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        return JSON.parse(out);
    } catch (err) {
        const stdout = err?.stdout?.toString?.() || '';
        if (stdout.trim()) {
            try {
                return JSON.parse(stdout);
            } catch {
                // fall through
            }
        }
        console.error('npm audit failed to run or parse JSON output');
        process.exit(1);
    }
}

function severityRank(sev) {
    const order = { low: 1, moderate: 2, high: 3, critical: 4 };
    return order[String(sev).toLowerCase()] || 0;
}

function matchesException(advisory, exception) {
    return (
        advisory.ghsa === exception.ghsa
        && advisory.package === exception.package
        && (!exception.severity || advisory.severity === exception.severity)
    );
}

const exceptions = loadExceptions();
const report = runAuditJson();
const vulns = Object.values(report.vulnerabilities || {});
const threshold = severityRank('high');
const unmatched = [];

for (const v of vulns) {
    const sev = v.severity || 'unknown';
    if (severityRank(sev) < threshold) continue;
    const ghsa = (v.via || []).find((x) => typeof x === 'object' && x.source)?.source
        || (Array.isArray(v.via) ? v.via.find((x) => typeof x === 'string') : null)
        || v.name;
    const entry = {
        ghsa: typeof ghsa === 'number' ? String(ghsa) : String(ghsa || ''),
        package: v.name,
        severity: sev,
    };
    if (!exceptions.some((ex) => matchesException(entry, ex))) {
        unmatched.push(entry);
    }
}

if (unmatched.length > 0) {
    console.error('Blocking production advisories without approved exceptions:');
    for (const u of unmatched) {
        console.error(`  - ${u.package} (${u.severity}) ${u.ghsa}`);
    }
    process.exit(1);
}

console.log(`npm audit production gate PASS (${exceptions.length} active exception(s) on file)`);
