/**
 * UNIT33.1 — blocking production npm audit gate with optional exceptions.
 *
 * Env overrides (tests only):
 *   DUELI_AUDIT_FIXTURE — path to npm audit JSON fixture
 *   DUELI_AUDIT_EXCEPTIONS — path to audit-exceptions.json
 *   DUELI_LOCKFILE — path to package-lock.json for installed versions
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const EXCEPTIONS_PATH = process.env.DUELI_AUDIT_EXCEPTIONS || join(__dirname, 'audit-exceptions.json');
const LOCKFILE_PATH = process.env.DUELI_LOCKFILE || join(ROOT, 'package-lock.json');
const FIXTURE_PATH = process.env.DUELI_AUDIT_FIXTURE;

const GHSA_RE = /^GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}$/i;
const REQUIRED_EXCEPTION_FIELDS = [
    'ghsa',
    'package',
    'affected_range',
    'severity',
    'no_fix_evidence',
    'reachability_evidence',
    'owner',
    'approval_ref',
    'created',
    'expires',
    'reevaluate_on',
    'tracking',
];

function fail(message) {
    console.error(message);
    process.exit(1);
}

function parseVersion(version) {
    const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(version).trim());
    if (!m) return null;
    return [Number(m[1]), Number(m[2]), Number(m[3])];
}

function compareVersions(a, b) {
    for (let i = 0; i < 3; i += 1) {
        if (a[i] !== b[i]) return a[i] - b[i];
    }
    return 0;
}

function satisfiesRange(installedVersion, rangeExpr) {
    const v = parseVersion(installedVersion);
    if (!v) return false;
    const expr = String(rangeExpr).trim();
    if (!expr) return false;
    if (!/[<>]/.test(expr) && !expr.includes(' ')) {
        const exact = parseVersion(expr);
        return exact !== null && compareVersions(v, exact) === 0;
    }
    const clauses = expr.split(/\s+/).filter(Boolean);
    for (const clause of clauses) {
        const ltEq = /^<=(.+)$/.exec(clause);
        const lt = /^<(.+)$/.exec(clause);
        const gtEq = /^>=(.+)$/.exec(clause);
        const gt = /^>(.+)$/.exec(clause);
        if (ltEq) {
            const bound = parseVersion(ltEq[1]);
            if (!bound || compareVersions(v, bound) > 0) return false;
        } else if (lt) {
            const bound = parseVersion(lt[1]);
            if (!bound || compareVersions(v, bound) >= 0) return false;
        } else if (gtEq) {
            const bound = parseVersion(gtEq[1]);
            if (!bound || compareVersions(v, bound) < 0) return false;
        } else if (gt) {
            const bound = parseVersion(gt[1]);
            if (!bound || compareVersions(v, bound) <= 0) return false;
        } else {
            return false;
        }
    }
    return true;
}

function isIsoDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value));
}

function daysUntil(dateStr) {
    const today = new Date();
    const end = new Date(`${dateStr}T00:00:00Z`);
    const diff = end.getTime() - today.getTime();
    return Math.ceil(diff / (24 * 60 * 60 * 1000));
}

function readInstalledVersion(packageName) {
    if (!existsSync(LOCKFILE_PATH)) fail(`lockfile missing: ${LOCKFILE_PATH}`);
    const lock = JSON.parse(readFileSync(LOCKFILE_PATH, 'utf8'));
    const direct = lock.packages?.[`node_modules/${packageName}`]?.version;
    if (direct) return direct;
    const legacy = lock.dependencies?.[packageName]?.version;
    if (legacy) return legacy;
    return null;
}

function extractGhsaFromViaEntry(entry) {
    if (typeof entry === 'string') {
        const m = entry.match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i);
        return m ? m[0].toUpperCase() : null;
    }
    if (entry && typeof entry === 'object') {
        if (entry.url) {
            const m = String(entry.url).match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i);
            if (m) return m[0].toUpperCase();
        }
        if (typeof entry.source === 'string') {
            const m = entry.source.match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/i);
            if (m) return m[0].toUpperCase();
        }
    }
    return null;
}

function loadExceptionsFile() {
    let raw;
    try {
        raw = JSON.parse(readFileSync(EXCEPTIONS_PATH, 'utf8'));
    } catch {
        fail(`invalid or unreadable exceptions file: ${EXCEPTIONS_PATH}`);
    }
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.exceptions)) {
        fail('audit-exceptions.json must be { "exceptions": [] }');
    }
    const today = new Date().toISOString().slice(0, 10);
    const validated = [];
    for (const ex of raw.exceptions) {
        if (!ex || typeof ex !== 'object') fail('exception entry must be an object');
        for (const field of REQUIRED_EXCEPTION_FIELDS) {
            if (ex[field] === undefined || ex[field] === null || String(ex[field]).trim() === '') {
                fail(`exception missing required field: ${field}`);
            }
        }
        const ghsa = String(ex.ghsa).toUpperCase();
        if (!GHSA_RE.test(ghsa)) fail(`invalid GHSA id: ${ex.ghsa}`);
        if (!isIsoDate(ex.created) || !isIsoDate(ex.expires) || !isIsoDate(ex.reevaluate_on)) {
            fail(`invalid ISO date on exception ${ghsa}`);
        }
        if (ex.expires < today) fail(`expired exception ${ghsa} (expires ${ex.expires})`);
        if (ex.created > today) fail(`exception ${ghsa} created date is in the future`);
        if (ex.reevaluate_on < ex.created) {
            fail(`exception ${ghsa} reevaluate_on precedes created`);
        }
        const remaining = daysUntil(ex.expires);
        console.log(
            `active exception ${ghsa} (${ex.package}): ${remaining} day(s) until expiry; reevaluate_on=${ex.reevaluate_on}`
        );
        validated.push({ ...ex, ghsa });
    }
    return validated;
}

function runAuditJson() {
    if (FIXTURE_PATH) {
        try {
            return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8'));
        } catch {
            fail(`invalid audit fixture: ${FIXTURE_PATH}`);
        }
    }
    try {
        const out = execSync('npm audit --omit=dev --json', {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            cwd: ROOT,
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
        fail('npm audit failed to run or parse JSON output');
    }
}

function severityRank(sev) {
    const order = { low: 1, moderate: 2, high: 3, critical: 4 };
    return order[String(sev).toLowerCase()] || 0;
}

function collectBlockingAdvisories(report) {
    const vulns = Object.values(report.vulnerabilities || {});
    const threshold = severityRank('high');
    const advisories = [];
    for (const v of vulns) {
        const sev = v.severity || 'unknown';
        if (severityRank(sev) < threshold) continue;
        const pkg = v.name;
        if (!pkg) fail('audit entry missing package name');
        const installed = readInstalledVersion(pkg);
        if (!installed) fail(`cannot determine installed version for ${pkg}`);
        const via = Array.isArray(v.via) ? v.via : [];
        const ghsaIds = new Set();
        for (const entry of via) {
            const id = extractGhsaFromViaEntry(entry);
            if (id) ghsaIds.add(id);
        }
        if (ghsaIds.size === 0) {
            advisories.push({
                ghsa: null,
                package: pkg,
                severity: sev,
                installed,
            });
            continue;
        }
        for (const ghsa of ghsaIds) {
            advisories.push({ ghsa, package: pkg, severity: sev, installed });
        }
    }
    return advisories;
}

function exceptionMatchesAdvisory(exception, advisory) {
    if (exception.ghsa !== advisory.ghsa) return false;
    if (exception.package !== advisory.package) return false;
    if (String(exception.severity).toLowerCase() !== String(advisory.severity).toLowerCase()) return false;
    if (!satisfiesRange(advisory.installed, exception.affected_range)) return false;
    return true;
}

function main() {
    const exceptions = loadExceptionsFile();
    const report = runAuditJson();
    const advisories = collectBlockingAdvisories(report);
    const unmatched = [];
    const matchedExceptionKeys = new Set();

    for (const advisory of advisories) {
        if (!advisory.ghsa) {
            unmatched.push(advisory);
            continue;
        }
        const match = exceptions.find((ex) => {
            if (matchedExceptionKeys.has(`${ex.ghsa}:${ex.package}:${ex.affected_range}`)) return false;
            return exceptionMatchesAdvisory(ex, advisory);
        });
        if (!match) {
            unmatched.push(advisory);
            continue;
        }
        matchedExceptionKeys.add(`${match.ghsa}:${match.package}:${match.affected_range}`);
    }

    for (const ex of exceptions) {
        const key = `${ex.ghsa}:${ex.package}:${ex.affected_range}`;
        if (!matchedExceptionKeys.has(key)) {
            fail(`orphan exception (no matching advisory): ${ex.ghsa} ${ex.package}`);
        }
    }

    if (unmatched.length > 0) {
        console.error('Blocking production advisories without approved exceptions:');
        for (const u of unmatched) {
            console.error(`  - ${u.package} (${u.severity}) ${u.ghsa || 'NO-GHSA'}`);
        }
        process.exit(1);
    }

    console.log(`npm audit production gate PASS (${exceptions.length} active exception(s) on file)`);
}

main();
