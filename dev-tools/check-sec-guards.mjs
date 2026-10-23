/**
 * UNIT30.3 — executable/structural SEC guards (SEC-05/07/08/10/11).
 *
 * These replace the old `grep` steps that matched documentation:
 *   - SEC-05 matched the comment `cors() with no options...` in main.ts;
 *   - SEC-10 matched the comment that documents why `this.sockets` is banned.
 *
 * Method: parse each file with the TypeScript compiler API and inspect only
 * executable syntax. Comments and string examples can never match; type-only
 * positions are not value uses. The guards are intentionally narrow:
 *
 *   SEC-05  no executable zero-argument cors(); no wildcard origin; at least
 *           one allow-listed cors({ origin, credentials: true }) call.
 *   SEC-07  no executable legacy `session_id` session key in auth/page code.
 *           Database columns such as explore_result_chunks.session_id are a
 *           different string and are not flagged.
 *   SEC-08  no JS-readable session secret in client/page code. The only
 *           allowance is read/remove of the two legacy keys inside the
 *           bounded SessionAccess migration helper; writes are never allowed.
 *   SEC-10  no executable `this.sockets` reference; the worker must keep the
 *           intended hibernation path (`acceptWebSocket` + `getWebSockets`).
 *           Deploying/activating the realtime worker remains an opt-in
 *           operational decision — this guard neither activates nor requires
 *           REALTIME_WS_URL.
 *   SEC-11  no `?token=` session credential in middleware or the own-profile
 *           page. The email-verification token in verify-page.ts is a
 *           different, one-shot purpose and is intentionally out of scope.
 *
 * Fail-closed: a missing required input, an unreadable file or an
 * unverifiable `cors(variable)` call fails the gate (never PASS).
 *
 * Usage: node dev-tools/check-sec-guards.mjs [sec05|sec07|sec08|sec10|sec11 ...]
 * Defaults to every mode.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const ts = require('typescript');

const SESSION_KEYS = new Set(['sessionId', 'session_id']);

export const MODE_INPUTS = {
    sec05: ['src/main.ts'],
    sec07: [
        'src/middleware',
        'src/controllers',
        'src/modules/api/auth',
        'src/modules/pages',
    ],
    sec08: ['src/client', 'src/modules/pages'],
    sec10: ['workers/dueli-realtime/src'],
    sec11: ['src/middleware', 'src/modules/pages/profile-page.ts'],
};

const SCAN_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts']);

function collectSourceFiles(dir, out = []) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) collectSourceFiles(full, out);
        else if ([...SCAN_EXTENSIONS].some((ext) => entry.endsWith(ext))) out.push(full);
    }
    return out;
}

function parse(sourceText) {
    return ts.createSourceFile(
        'sec-guards.ts',
        sourceText,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TS,
    );
}

function lineOf(sf, node) {
    return sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
}

function textOf(node, sf) {
    return node.getText(sf).replace(/\s+/g, ' ').slice(0, 140);
}

function hit(sf, node, kind, message) {
    return { line: lineOf(sf, node), kind, message, text: textOf(node, sf) };
}

function stripParens(expr) {
    while (ts.isParenthesizedExpression(expr)) expr = expr.expression;
    return expr;
}

function isIdentifier(node, name) {
    return !!node && ts.isIdentifier(node) && node.text === name;
}

function propertyNameOf(node) {
    if (!node) return null;
    if (ts.isIdentifier(node)) return node.text;
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
    return null;
}

/** `localStorage`, `sessionStorage`, `window.localStorage`, `window.sessionStorage`. */
function isWebStorage(node) {
    if (isIdentifier(node, 'localStorage') || isIdentifier(node, 'sessionStorage')) return true;
    if (ts.isPropertyAccessExpression(node)) {
        return (
            (node.name.text === 'localStorage' || node.name.text === 'sessionStorage') &&
            isIdentifier(stripParens(node.expression), 'window')
        );
    }
    return false;
}

/** `document` or `window.document`. */
function isDocument(node) {
    if (isIdentifier(node, 'document')) return true;
    if (ts.isPropertyAccessExpression(node)) {
        return node.name.text === 'document' && isIdentifier(stripParens(node.expression), 'window');
    }
    return false;
}

function isWindow(node) {
    const e = stripParens(node);
    return isIdentifier(e, 'window') || isIdentifier(e, 'globalThis');
}

/** Collect `const KEY = 'sessionId' | 'session_id'` aliases in a file. */
function collectSessionKeyAliases(sf) {
    const aliases = new Map();
    function visit(node) {
        if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.initializer) {
            const init = stripParens(node.initializer);
            if (
                (ts.isStringLiteral(init) || ts.isNoSubstitutionTemplateLiteral(init)) &&
                SESSION_KEYS.has(init.text)
            ) {
                aliases.set(node.name.text, init.text);
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    return aliases;
}

function sessionKeyArgument(node, aliases) {
    if (!node) return null;
    const expr = stripParens(node);
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
        return SESSION_KEYS.has(expr.text) ? expr.text : null;
    }
    if (ts.isIdentifier(expr) && aliases.has(expr.text)) return aliases.get(expr.text);
    return null;
}

/* ------------------------------------------------------------------ */
/* SEC-05 — CORS                                                       */
/* ------------------------------------------------------------------ */

function originIsWildcard(node, sf) {
    const expr = stripParens(node);
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) {
        return expr.text.trim() === '*';
    }
    // `origin: ['https://app', '*']` is a wildcard too.
    if (ts.isArrayLiteralExpression(expr)) {
        return expr.elements.some((element) => {
            const item = stripParens(element);
            return (
                (ts.isStringLiteral(item) || ts.isNoSubstitutionTemplateLiteral(item)) &&
                item.text.trim() === '*'
            );
        });
    }
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
    // `origin: () => '*'` is equally a wildcard.
    if (ts.isArrowFunction(expr) || ts.isFunctionExpression(expr)) {
        const body = expr.body;
        if (body && (ts.isStringLiteral(body) || ts.isNoSubstitutionTemplateLiteral(body))) {
            return body.text.trim() === '*';
        }
    }
    return false;
}

/**
 * @returns {{ hits: Array<{line:number,kind:string,message:string,text:string}>,
 *             configured:number }}
 */
export function analyzeCors(sourceText) {
    const sf = parse(sourceText);
    const hits = [];
    let configured = 0;

    function visit(node) {
        if (ts.isCallExpression(node) && isIdentifier(stripParens(node.expression), 'cors')) {
            if (node.arguments.length === 0) {
                hits.push(hit(sf, node, 'cors-no-options',
                    'cors() with no options allows every origin (SEC-05)'));
            } else if (node.arguments.length === 1 && ts.isObjectLiteralExpression(node.arguments[0])) {
                const obj = node.arguments[0];
                let origin = null;
                let credentials = false;
                for (const prop of obj.properties) {
                    if (!ts.isPropertyAssignment(prop)) continue;
                    const name = propertyNameOf(prop.name);
                    if (name === 'origin') origin = prop.initializer;
                    if (name === 'credentials' && prop.initializer.kind === ts.SyntaxKind.TrueKeyword) {
                        credentials = true;
                    }
                }
                if (origin && originIsWildcard(origin, sf)) {
                    hits.push(hit(sf, origin, 'cors-wildcard-origin',
                        "cors origin '*' allows every origin (SEC-05)"));
                } else if (origin && credentials) {
                    configured += 1;
                } else if (origin) {
                    // An allow-list without credentials silently breaks cookie
                    // authentication in the browser; fail closed as a regression.
                    hits.push(hit(sf, obj, 'cors-missing-credentials',
                        'cors() has an origin list but no credentials: true (SEC-08 cookie contract)'));
                } else {
                    hits.push(hit(sf, obj, 'cors-missing-origin',
                        'cors() options have no origin allow-list (SEC-05)'));
                }
            } else {
                hits.push(hit(sf, node, 'cors-unverifiable',
                    'cors() options are not a literal object; the allow-list cannot be verified (SEC-05)'));
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    return { hits, configured };
}

/* ------------------------------------------------------------------ */
/* SEC-07 — legacy session key                                         */
/* ------------------------------------------------------------------ */

export function analyzeLegacySessionKeys(sourceText) {
    const sf = parse(sourceText);
    const hits = [];
    function visit(node) {
        if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
            if (node.text === 'session_id') {
                hits.push(hit(sf, node, 'legacy-session-key',
                    "legacy 'session_id' session key is executable here (SEC-07)"));
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    return { hits };
}

/* ------------------------------------------------------------------ */
/* SEC-08 — JS-readable browser session secret                         */
/* ------------------------------------------------------------------ */

function expressionMentionsSessionKey(node, sf) {
    const text = node.getText(sf);
    return /(?:^|[^A-Za-z0-9_])(sessionId|session_id)(?:[^A-Za-z0-9_]|$)/.test(text);
}

/**
 * @param {string} sourceText
 * @param {{allowLegacyRead?: boolean}} [options]
 *   `allowLegacyRead` permits getItem/removeItem of the legacy keys — used
 *   only for src/client/core/SessionAccess.ts. Writes always fail.
 */
export function analyzeBrowserSessionStorage(sourceText, options = {}) {
    const allowLegacyRead = options.allowLegacyRead === true;
    const sf = parse(sourceText);
    const aliases = collectSessionKeyAliases(sf);
    const hits = [];

    function visit(node) {
        // localStorage/sessionStorage get/set/remove with a session key.
        if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
            const method = node.expression.name.text;
            const receiver = stripParens(node.expression.expression);
            if (isWebStorage(receiver) && ['getItem', 'setItem', 'removeItem'].includes(method)) {
                const key = sessionKeyArgument(node.arguments[0], aliases);
                if (key) {
                    const readLike = method === 'getItem' || method === 'removeItem';
                    if (!(allowLegacyRead && readLike)) {
                        hits.push(hit(sf, node, 'web-storage-session-secret',
                            `${method}(${key}) exposes a session secret to JavaScript (SEC-08)`));
                    }
                }
            }
        }

        // localStorage['setItem'](...) / sessionStorage['getItem'](...)
        if (ts.isCallExpression(node) && ts.isElementAccessExpression(node.expression)) {
            const method = propertyNameOf(node.expression.argumentExpression);
            const receiver = stripParens(node.expression.expression);
            if (
                method &&
                ['getItem', 'setItem', 'removeItem'].includes(method) &&
                isWebStorage(receiver)
            ) {
                const key = sessionKeyArgument(node.arguments[0], aliases);
                if (key) {
                    const readLike = method === 'getItem' || method === 'removeItem';
                    if (!(allowLegacyRead && readLike)) {
                        hits.push(hit(sf, node, 'web-storage-session-secret',
                            `${method}(${key}) exposes a session secret to JavaScript (SEC-08)`));
                    }
                }
            }
        }

        // window.sessionId = ... / globalThis['sessionId'] = ...
        if (
            ts.isBinaryExpression(node) &&
            node.operatorToken.kind === ts.SyntaxKind.EqualsToken
        ) {
            const left = stripParens(node.left);
            const prop = ts.isPropertyAccessExpression(left)
                ? left.name.text
                : ts.isElementAccessExpression(left)
                  ? propertyNameOf(left.argumentExpression)
                  : null;
            const object = ts.isPropertyAccessExpression(left)
                ? left.expression
                : ts.isElementAccessExpression(left)
                  ? left.expression
                  : null;
            if (prop && SESSION_KEYS.has(prop) && object && isWindow(object)) {
                hits.push(hit(sf, left, 'window-session-secret',
                    `window.${prop} exposes a session secret globally (SEC-08)`));
            }

            // document.cookie = ... with a session key in the written value.
            if (
                ts.isPropertyAccessExpression(left) &&
                left.name.text === 'cookie' &&
                isDocument(left.expression) &&
                expressionMentionsSessionKey(node.right, sf)
            ) {
                hits.push(hit(sf, node, 'document-cookie-session-secret',
                    'document.cookie writes a session secret (SEC-08)'));
            }
        }

        ts.forEachChild(node, visit);
    }
    visit(sf);
    return { hits };
}

/* ------------------------------------------------------------------ */
/* SEC-10 — Durable Object socket state                                */
/* ------------------------------------------------------------------ */

function isThis(node) {
    return !!node && ts.isThis(node);
}

export function analyzeInMemorySockets(sourceText) {
    const sf = parse(sourceText);
    const hits = [];
    let usesGetWebSockets = false;
    let acceptsWebSockets = false;

    function visit(node) {
        if (ts.isPropertyAccessExpression(node)) {
            if (node.name.text === 'sockets' && isThis(stripParens(node.expression))) {
                hits.push(hit(sf, node, 'this-sockets',
                    'this.sockets is in-memory state that is empty after hibernation (SEC-10)'));
            }
            if (node.name.text === 'getWebSockets') {
                const parent = node.parent;
                if (parent && ts.isCallExpression(parent) && parent.expression === node) {
                    usesGetWebSockets = true;
                }
            }
            if (node.name.text === 'acceptWebSocket') {
                const parent = node.parent;
                if (parent && ts.isCallExpression(parent) && parent.expression === node) {
                    acceptsWebSockets = true;
                }
            }
        }
        if (
            ts.isElementAccessExpression(node) &&
            propertyNameOf(node.argumentExpression) === 'sockets' &&
            isThis(stripParens(node.expression))
        ) {
            hits.push(hit(sf, node, 'this-sockets',
                "this['sockets'] is in-memory state that is empty after hibernation (SEC-10)"));
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    return { hits, usesGetWebSockets, acceptsWebSockets };
}

/* ------------------------------------------------------------------ */
/* SEC-11 — query-string session token                                 */
/* ------------------------------------------------------------------ */

function isRequestObject(node) {
    const e = stripParens(node);
    if (isIdentifier(e, 'req') || isIdentifier(e, 'request')) return true;
    if (ts.isPropertyAccessExpression(e) && e.name.text === 'req') return true;
    return false;
}

export function analyzeQuerySessionToken(sourceText) {
    const sf = parse(sourceText);
    const hits = [];
    function visit(node) {
        if (ts.isCallExpression(node)) {
            let method = null;
            let receiver = null;
            if (ts.isPropertyAccessExpression(node.expression)) {
                method = node.expression.name.text;
                receiver = node.expression.expression;
            } else if (ts.isElementAccessExpression(node.expression)) {
                method = propertyNameOf(node.expression.argumentExpression);
                receiver = node.expression.expression;
            }
            const arg = node.arguments[0] && stripParens(node.arguments[0]);
            if (
                method === 'query' &&
                receiver &&
                isRequestObject(receiver) &&
                arg &&
                (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg)) &&
                arg.text === 'token'
            ) {
                hits.push(hit(sf, node, 'query-session-token',
                    "session token accepted via ?token= (SEC-11)"));
            }
        }
        ts.forEachChild(node, visit);
    }
    visit(sf);
    return { hits };
}

/* ------------------------------------------------------------------ */
/* Input traversal + CLI                                               */
/* ------------------------------------------------------------------ */

function collectInputFiles(inputs) {
    const files = [];
    for (const input of inputs) {
        if (!existsSync(input)) {
            throw new Error(`SEC guard input does not exist: ${input}`);
        }
        if (statSync(input).isFile()) {
            if ([...SCAN_EXTENSIONS].some((ext) => input.endsWith(ext))) files.push(input);
            continue;
        }
        files.push(...collectSourceFiles(input));
    }
    return files;
}

export function checkMode(mode, inputs = MODE_INPUTS[mode]) {
    if (!inputs) throw new Error(`unknown SEC guard mode: ${mode}`);
    const files = collectInputFiles(inputs);
    if (files.length === 0) throw new Error(`SEC guard mode ${mode} found no source files`);
    const hits = [];
    let configuredCors = 0;
    let usesGetWebSockets = false;
    let acceptsWebSockets = false;

    for (const file of files) {
        const source = readFileSync(file, 'utf8');
        let fileHits = [];
        if (mode === 'sec05') {
            const result = analyzeCors(source);
            fileHits = result.hits;
            configuredCors += result.configured;
        } else if (mode === 'sec07') {
            fileHits = analyzeLegacySessionKeys(source).hits;
        } else if (mode === 'sec08') {
            const allowLegacyRead = file.replace(/\\/g, '/').endsWith('src/client/core/SessionAccess.ts');
            fileHits = analyzeBrowserSessionStorage(source, { allowLegacyRead }).hits;
        } else if (mode === 'sec10') {
            const result = analyzeInMemorySockets(source);
            fileHits = result.hits;
            usesGetWebSockets = usesGetWebSockets || result.usesGetWebSockets;
            acceptsWebSockets = acceptsWebSockets || result.acceptsWebSockets;
        } else if (mode === 'sec11') {
            fileHits = analyzeQuerySessionToken(source).hits;
        } else {
            throw new Error(`unknown SEC guard mode: ${mode}`);
        }
        hits.push(...fileHits.map((h) => ({ path: file, ...h })));
    }

    if (mode === 'sec05' && configuredCors === 0) {
        hits.push({
            path: inputs.join(','),
            line: 1,
            kind: 'cors-missing-allowlist',
            message: 'no allow-listed cors({ origin, credentials: true }) call found (SEC-05)',
            text: '',
        });
    }

    if (mode === 'sec10') {
        if (!usesGetWebSockets) {
            hits.push({
                path: inputs.join(','),
                line: 1,
                kind: 'missing-getwebsockets',
                message: 'Durable Object broadcast no longer uses getWebSockets() (SEC-10)',
                text: '',
            });
        }
        if (!acceptsWebSockets) {
            hits.push({
                path: inputs.join(','),
                line: 1,
                kind: 'missing-acceptwebsocket',
                message: 'Durable Object no longer uses acceptWebSocket() (SEC-10)',
                text: '',
            });
        }
    }

    return { mode, files: files.length, hits };
}

const MODE_TITLES = {
    sec05: 'SEC-05 CORS allow-list',
    sec07: 'SEC-07 canonical session key',
    sec08: 'SEC-08 no JS-readable session secret',
    sec10: 'SEC-10 Durable Object hibernation sockets',
    sec11: 'SEC-11 no query-string session token',
};

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
    const requested = process.argv.slice(2);
    const modes = requested.length > 0 ? requested : Object.keys(MODE_INPUTS);
    let failed = false;

    for (const mode of modes) {
        if (!MODE_INPUTS[mode]) {
            console.log(`::error::unknown SEC guard mode: ${mode}`);
            failed = true;
            continue;
        }
        let result;
        try {
            result = checkMode(mode);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            console.log(`::error::${mode.toUpperCase()} scan failed (fail-closed): ${message}`);
            failed = true;
            continue;
        }
        if (result.hits.length > 0) {
            for (const h of result.hits) {
                console.log(`::error file=${h.path},line=${h.line}::${MODE_TITLES[mode]} [${h.kind}]: ${h.message} — ${h.text}`);
            }
            console.log(`${mode.toUpperCase()} FAIL: ${result.hits.length} executable violation(s) — see docs/12-SECURITY-REMEDIATION.md`);
            failed = true;
        } else {
            console.log(`${mode.toUpperCase()} PASS: ${MODE_TITLES[mode]} (AST-based; comments/strings/inactive prep excluded; ${result.files} file(s))`);
        }
    }

    if (failed) process.exit(1);
}
