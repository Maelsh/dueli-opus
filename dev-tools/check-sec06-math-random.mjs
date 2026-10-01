/**
 * SEC-06 checker — no executable Math.random() in security-sensitive code.
 *
 * Replaces the old `grep -rn "Math.random" ...` gate, which false-positived on
 * documentation (e.g. ExploreSessionService.ts states it uses WebCrypto and
 * explicitly says "never Math.random" — inside a comment).
 *
 * Method: parse each file with the TypeScript compiler API and flag only real
 * `Math.random(...)` CALL nodes. Comments and string literals are never AST
 * call nodes, so neither can false-positive; multi-line
 * `Math\n  .random()` calls still parse as one call node, so they cannot
 * false-negative either. A real call in a scanned file fails the gate.
 *
 * Usage: node dev-tools/check-sec06-math-random.mjs [dir ...]
 * Defaults: src/middleware src/lib src/modules/api
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

export const DEFAULT_DIRS = ['src/middleware', 'src/lib', 'src/modules/api'];

function collectTsFiles(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) collectTsFiles(full, out);
        else if (entry.endsWith('.ts')) out.push(full);
    }
    return out;
}

/**
 * Return executable Math.random() calls in a TS source string.
 * Each hit: { line (1-based), text (single-line, truncated) }.
 * Comments and string literals can never match — they are not call nodes.
 */
export function findMathRandomCalls(sourceText) {
    const sf = ts.createSourceFile('sec06-check.ts', sourceText, ts.ScriptTarget.Latest, true);
    const hits = [];
    function visit(node) {
        if (
            ts.isCallExpression(node) &&
            ts.isPropertyAccessExpression(node.expression) &&
            node.expression.name.text === 'random' &&
            ts.isIdentifier(node.expression.expression) &&
            node.expression.expression.text === 'Math'
        ) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
            const text = node.getText(sf).replace(/\s+/g, ' ').slice(0, 120);
            hits.push({ line: line + 1, text });
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    return hits;
}

export function checkFile(path) {
    return findMathRandomCalls(readFileSync(path, 'utf8')).map((h) => ({ path, ...h }));
}

export function checkDirs(dirs) {
    let hits = [];
    for (const dir of dirs) {
        if (!existsSync(dir)) continue;
        if (statSync(dir).isFile()) {
            if (dir.endsWith('.ts')) hits = hits.concat(checkFile(dir));
            continue;
        }
        for (const file of collectTsFiles(dir)) {
            hits = hits.concat(checkFile(file));
        }
    }
    return hits;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    const dirs = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_DIRS;
    const hits = checkDirs(dirs);
    if (hits.length > 0) {
        for (const h of hits) {
            console.log(`::error file=${h.path},line=${h.line}::SEC-06 executable Math.random() in security-sensitive code: ${h.text}`);
        }
        console.log(`SEC-06 FAIL: ${hits.length} executable Math.random() call(s) — see docs/12-SECURITY-REMEDIATION.md SEC-06`);
        process.exit(1);
    } else {
        console.log(`SEC-06 PASS: no executable Math.random() in [${dirs.join(', ')}] (AST-based, comments/strings excluded)`);
    }
}
