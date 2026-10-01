/**
 * SEC-06 checker — no executable Math.random() in security-sensitive code.
 *
 * Replaces the old `grep -rn "Math.random" ...` gate, which false-positived on
 * documentation (e.g. ExploreSessionService.ts states it uses WebCrypto and
 * explicitly says "never Math.random" — inside a comment).
 *
 * Method: strip // line comments and block comments (newlines preserved so
 * reported line numbers match the source), then look for an executable
 * `Math.random(` call on the remaining code. String-aware so comment markers
 * inside string literals don't corrupt stripping.
 *
 * A real `Math.random()` call in a scanned file still fails the gate.
 *
 * Usage: node dev-tools/check-sec06-math-random.mjs [dir ...]
 * Defaults: src/middleware src/lib src/modules/api
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DEFAULT_DIRS = ['src/middleware', 'src/lib', 'src/modules/api'];
const CALL_RE = /Math\s*\.\s*random\s*\(/;

function collectTsFiles(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) collectTsFiles(full, out);
        else if (entry.endsWith('.ts')) out.push(full);
    }
    return out;
}

/** Strip comments, preserving newlines and string contents. */
export function stripComments(src) {
    let out = '';
    let i = 0;
    const n = src.length;
    let str = null; // quote char when inside a string: ', ", `
    while (i < n) {
        const c = src[i];
        const next = i + 1 < n ? src[i + 1] : '';
        if (str) {
            out += c;
            if (c === '\\' && i + 1 < n) {
                out += src[i + 1];
                i += 2;
                continue;
            }
            if (c === str) str = null;
            i += 1;
            continue;
        }
        if (c === '"' || c === "'" || c === '`') {
            str = c;
            out += c;
            i += 1;
            continue;
        }
        if (c === '/' && next === '/') {
            // line comment: skip to (not including) newline
            while (i < n && src[i] !== '\n') i += 1;
            continue;
        }
        if (c === '/' && next === '*') {
            // block comment: blank out, keep newlines for line numbers
            i += 2;
            while (i < n && !(src[i] === '*' && i + 1 < n && src[i + 1] === '/')) {
                if (src[i] === '\n') out += '\n';
                i += 1;
            }
            i += 2; // skip */
            continue;
        }
        out += c;
        i += 1;
    }
    return out;
}

function checkFile(path) {
    const code = stripComments(readFileSync(path, 'utf8'));
    const hits = [];
    const lines = code.split('\n');
    lines.forEach((line, idx) => {
        if (CALL_RE.test(line)) hits.push({ path, line: idx + 1, text: line.trim() });
    });
    return hits;
}

const dirs = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_DIRS;
let allHits = [];
for (const dir of dirs) {
    if (!existsSync(dir)) continue;
    for (const file of collectTsFiles(dir)) {
        allHits = allHits.concat(checkFile(file));
    }
}

if (allHits.length > 0) {
    for (const h of allHits) {
        console.log(`::error file=${h.path},line=${h.line}::SEC-06 executable Math.random() in security-sensitive code: ${h.text}`);
    }
    console.log(`SEC-06 FAIL: ${allHits.length} executable Math.random() call(s) — see docs/12-SECURITY-REMEDIATION.md SEC-06`);
    process.exit(1);
} else {
    console.log(`SEC-06 PASS: no executable Math.random() in [${dirs.join(', ')}] (comments excluded)`);
}
