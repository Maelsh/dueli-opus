/**
 * SEC-06 checker — no executable Math.random() in security-sensitive code.
 *
 * Replaces the old `grep -rn "Math.random" ...` gate, which false-positived on
 * documentation (e.g. ExploreSessionService.ts states it uses WebCrypto and
 * explicitly says "never Math.random" — inside a comment).
 *
 * Method: parse each file with the TypeScript compiler API and flag only
 * EXECUTABLE value-uses of Math.random:
 *   - direct / multi-line calls:        Math.random() / Math \n .random()
 *   - parenthesized callee:             (Math.random)()
 *   - static element access:            Math['random']() / Math["random"]()
 *   - alias reference + later call:     const r = Math.random; r()
 *   - destructured alias:               const { random } = Math; random()
 *   - deferred executable reference:   setTimeout(Math.random, t) etc.
 * Comments, string literals and TYPE positions (typeof Math.random in a type,
 * interfaces) are never expressions/calls, so they can never false-positive.
 * Dynamic access (Math[k]()), .bind/.call indirection and cross-file aliases
 * are out of scope — no general-obfuscation claim is made.
 *
 * Fail-closed: a missing required scan dir, an unreadable file, or an
 * explicitly passed path that does not exist FAILS the gate (never PASS).
 * Scanned extensions: .ts — verified as the only source extension present
 * under the required dirs.
 *
 * Usage: node dev-tools/check-sec06-math-random.mjs [dir-or-file ...]
 * Defaults: src/middleware src/lib src/modules/api
 */

import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

export const DEFAULT_DIRS = ['src/middleware', 'src/lib', 'src/modules/api'];
const SOURCE_EXTENSIONS = ['.ts'];
const SCAN_EXTENSIONS = new Set(SOURCE_EXTENSIONS);

function collectSourceFiles(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) collectSourceFiles(full, out);
        else if ([...SCAN_EXTENSIONS].some((ext) => entry.endsWith(ext))) out.push(full);
    }
    return out;
}

/** Unwrap ( ... ) around an expression. */
function stripParens(expr) {
    while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
    return expr;
}

/**
 * True for a value-position reference to the Math.random function itself:
 * Math.random, (Math.random), Math['random'], Math["random"] (any parens).
 * Dynamic keys (Math[k]) are NOT static and return false (documented limit).
 */
export function isMathRandomRef(expr) {
    const e = stripParens(expr);
    if (ts.isPropertyAccessExpression(e)) {
        return (
            e.name.text === 'random' &&
            ts.isIdentifier(e.expression) &&
            e.expression.text === 'Math'
        );
    }
    if (ts.isElementAccessExpression(e)) {
        const arg = e.argumentExpression;
        return (
            !!arg &&
            ts.isStringLiteral(arg) &&
            arg.text === 'random' &&
            ts.isIdentifier(e.expression) &&
            e.expression.text === 'Math'
        );
    }
    return false;
}

const SCOPE_NODES = new Set([
    ts.SyntaxKind.SourceFile,
    ts.SyntaxKind.Block,
    ts.SyntaxKind.ModuleBlock,
    ts.SyntaxKind.CatchClause,
    ts.SyntaxKind.FunctionDeclaration,
    ts.SyntaxKind.FunctionExpression,
    ts.SyntaxKind.ArrowFunction,
    ts.SyntaxKind.MethodDeclaration,
    ts.SyntaxKind.GetAccessor,
    ts.SyntaxKind.SetAccessor,
    ts.SyntaxKind.Constructor,
]);

/**
 * Return executable Math.random() uses in a TS source string.
 * Each hit: { line (1-based), text (single-line, truncated), kind }.
 */
export function findMathRandomCalls(sourceText) {
    const sf = ts.createSourceFile('sec06-check.ts', sourceText, ts.ScriptTarget.Latest, true);
    const hits = [];
    const scopes = [new Map()];

    function lookup(name) {
        for (let i = scopes.length - 1; i >= 0; i--) {
            if (scopes[i].has(name)) return true;
        }
        return false;
    }

    function flag(node, kind) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        const text = node.getText(sf).replace(/\s+/g, ' ').slice(0, 120);
        hits.push({ line: line + 1, text, kind });
    }

    /** Record `name` as a Math.random alias in the current scope. */
    function recordAlias(name) {
        scopes[scopes.length - 1].set(name, true);
    }

    /**
     * True when `node` sits in a call's callee position (through any paren
     * chain): (Math.random)(), ((Math.random))() — flagged once as
     * direct-call, so the generic value-use rule below must skip every link
     * of that chain to avoid double counting.
     */
    function isCalleePosition(node) {
        let cur = node;
        let p = cur.parent;
        while (p && ts.isParenthesizedExpression(p)) {
            cur = p;
            p = cur.parent;
        }
        return (
            !!p &&
            ts.isCallExpression(p) &&
            stripParens(p.expression) === stripParens(cur)
        );
    }

    function visit(node) {
        const pushesScope = SCOPE_NODES.has(node.kind);
        if (pushesScope) scopes.push(new Map());

        // const r = <Math.random-ref>  /  const { random [: r] } = Math
        if (ts.isVariableDeclaration(node) && node.initializer) {
            if (ts.isIdentifier(node.name) && isMathRandomRef(node.initializer)) {
                recordAlias(node.name.text);
                flag(node.initializer, 'alias-ref');
            } else if (
                ts.isObjectBindingPattern(node.name) &&
                ts.isIdentifier(node.initializer) &&
                node.initializer.text === 'Math'
            ) {
                for (const el of node.name.elements) {
                    if (!ts.isBindingElement(el) || el.dotDotDotToken) continue;
                    const prop = el.propertyName;
                    const bound = el.name;
                    if (!ts.isIdentifier(bound)) continue;
                    const key = prop
                        ? ts.isIdentifier(prop)
                            ? prop.text
                            : ts.isStringLiteral(prop)
                              ? prop.text
                              : null
                        : bound.text;
                    if (key === 'random') {
                        recordAlias(bound.text);
                        flag(node.initializer, 'alias-ref');
                        break;
                    }
                }
            }
        }

        // r = <Math.random-ref>
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
            ts.isIdentifier(node.left) &&
            isMathRandomRef(node.right)
        ) {
            recordAlias(node.left.text);
            flag(node.right, 'alias-ref');
        }

        // Direct executable call (any covered callee form).
        if (ts.isCallExpression(node)) {
            const callee = stripParens(node.expression);
            if (isMathRandomRef(callee)) {
                flag(callee, 'direct-call');
            } else if (ts.isIdentifier(callee) && lookup(callee.text)) {
                flag(callee, 'alias-call');
            }
            // Deferred executable reference as a call argument is handled by
            // the generic value-use rule below (parent = CallExpression arg).
        }

        // Any other value-position Math.random reference (call argument,
        // return value, array literal, export, ...) is a deferred executable
        // use — except alias-capture positions handled above, and except the
        // callee of a call already flagged as direct-call (same node).
        if (
            isMathRandomRef(node) &&
            node.parent &&
            !isCalleePosition(node) &&
            !(
                ts.isVariableDeclaration(node.parent) &&
                node.parent.initializer === node
            ) &&
            !(
                ts.isBinaryExpression(node.parent) &&
                node.parent.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
                node.parent.right === node
            )
        ) {
            flag(node, 'deferred-ref');
        }

        ts.forEachChild(node, visit);
        if (pushesScope) scopes.pop();
    }

    visit(sf);
    return hits;
}

export function checkFile(path) {
    return findMathRandomCalls(readFileSync(path, 'utf8')).map((h) => ({ path, ...h }));
}

export function checkInputs(inputs) {
    let hits = [];
    for (const input of inputs) {
        if (!existsSync(input)) {
            throw new Error(`SEC-06 input does not exist: ${input}`);
        }
        if (statSync(input).isFile()) {
            if ([...SCAN_EXTENSIONS].some((ext) => input.endsWith(ext))) {
                hits = hits.concat(checkFile(input));
            }
            continue;
        }
        for (const file of collectSourceFiles(input)) {
            hits = hits.concat(checkFile(file));
        }
    }
    return hits;
}

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    const inputs = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_DIRS;
    let hits;
    try {
        hits = checkInputs(inputs);
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.log(`::error::SEC-06 scan failed (fail-closed): ${message}`);
        process.exit(1);
    }
    if (hits.length > 0) {
        for (const h of hits) {
            console.log(
                `::error file=${h.path},line=${h.line}::SEC-06 executable Math.random() [${h.kind}] in security-sensitive code: ${h.text}`
            );
        }
        console.log(`SEC-06 FAIL: ${hits.length} executable Math.random() use(s) — see docs/12-SECURITY-REMEDIATION.md SEC-06`);
        process.exit(1);
    } else {
        console.log(`SEC-06 PASS: no executable Math.random() in [${inputs.join(', ')}] (AST-based, comments/strings/types excluded)`);
    }
}
