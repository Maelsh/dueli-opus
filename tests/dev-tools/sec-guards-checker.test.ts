/**
 * UNIT30.3 — controls for the AST-based SEC-05/07/08/10/11 guards.
 *
 * Each control proves both directions of the gate:
 *   - a real prohibited construct is flagged;
 *   - comments, string examples and inactive preparation are never flagged;
 *   - the real repository sources pass, so the gate is not a blanket ban.
 *
 * The same file pins the Quality Gate wiring: the SEC steps must call the
 * AST checker (blocking, no grace period) and must not regress to the old
 * grep patterns that matched documentation.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
    MODE_INPUTS,
    analyzeBrowserSessionStorage,
    analyzeCors,
    analyzeInMemorySockets,
    analyzeLegacySessionKeys,
    analyzeQuerySessionToken,
} from '../../dev-tools/check-sec-guards.mjs';

const GATE = readFileSync(resolve('.github/workflows/quality-gate.yml'), 'utf8');

function read(relative: string): string {
    return readFileSync(resolve(relative), 'utf-8');
}

describe('SEC-05 CORS guard controls', () => {
    it('flags an executable zero-argument cors()', () => {
        const result = analyzeCors("app.use('/api/*', (c, next) => cors()(c, next));\n");
        expect(result.hits).toHaveLength(1);
        expect(result.hits[0].kind).toBe('cors-no-options');
    });

    it('flags a wildcard origin in cors({ origin: "*" })', () => {
        expect(analyzeCors("app.use('/api/*', cors({ origin: '*' }));\n").hits).toHaveLength(1);
        expect(analyzeCors("app.use('/api/*', cors({ origin: \"*\" }));\n").hits).toHaveLength(1);
        expect(analyzeCors("app.use('/api/*', cors({ origin: ['https://ok', '*'], credentials: true }));\n").hits)
            .toHaveLength(1);
    });

    it('ignores comments and string examples that mention cors()', () => {
        const src = [
            '// SEC-05: cors() with no options sends Access-Control-Allow-Origin: *',
            '/* cors() is banned; never call cors() without an allow-list. */',
            'export const note = "cors()";',
            "app.use('/api/*', cors({ origin: allowList, credentials: true }));",
            '',
        ].join('\n');
        const result = analyzeCors(src);
        expect(result.hits).toEqual([]);
        expect(result.configured).toBe(1);
    });

    it('ignores unrelated functions named cors() and configured calls', () => {
        const src = [
            'function cors(options?: unknown) { return options; }',
            'cors({ origin: allowList, credentials: true });',
            '',
        ].join('\n');
        // The configured call is what the real middleware uses; a local helper
        // is not the production CORS middleware and must not be double-counted.
        expect(analyzeCors(src).hits).toEqual([]);
    });

    it('passes the real allow-listed src/main.ts, including its explanatory comment', () => {
        const result = analyzeCors(read('src/main.ts'));
        expect(result.hits).toEqual([]);
        expect(result.configured).toBe(1);
    });
});

describe('SEC-10 Durable Object socket guard controls', () => {
    it('flags executable this.sockets reads/writes', () => {
        expect(analyzeInMemorySockets('this.sockets.add(ws);\n').hits).toHaveLength(1);
        expect(analyzeInMemorySockets("this['sockets'] = new Set();\n").hits).toHaveLength(1);
        expect(analyzeInMemorySockets('for (const ws of this.sockets) ws.send(m);\n').hits).toHaveLength(1);
    });

    it('ignores comments, strings and the historical defect description', () => {
        const src = [
            '// SEC-10: this.sockets must never be used after hibernation.',
            '/* The old this.sockets set is deleted; see this.sockets in docs. */',
            'export const note = "this.sockets";',
            'for (const ws of this.state.getWebSockets()) ws.send(m);',
            '',
        ].join('\n');
        const result = analyzeInMemorySockets(src);
        expect(result.hits).toEqual([]);
        expect(result.usesGetWebSockets).toBe(true);
    });

    it('passes the real worker and confirms the intended hibernation path', () => {
        const result = analyzeInMemorySockets(read('workers/dueli-realtime/src/index.ts'));
        expect(result.hits).toEqual([]);
        expect(result.usesGetWebSockets).toBe(true);
        expect(result.acceptsWebSockets).toBe(true);
    });
});

describe('SEC-07 legacy session key guard controls', () => {
    it('flags executable legacy session_id key reads', () => {
        expect(analyzeLegacySessionKeys("getCookie(c, 'session_id');\n").hits).toHaveLength(1);
        expect(analyzeLegacySessionKeys("localStorage.getItem('session_id');\n").hits).toHaveLength(1);
        expect(analyzeLegacySessionKeys("const id = req.query['session_id'];\n").hits).toHaveLength(1);
    });

    it('ignores comments, docs and unrelated database columns', () => {
        const src = [
            '// legacy session_id is ignored; use sessionId only',
            '/* see the removed `session_id` cookie */',
            "export const note = 'the legacy session_id cookie';",
            "const rows = await db.prepare('SELECT session_id FROM explore_result_chunks').all();",
            '',
        ].join('\n');
        expect(analyzeLegacySessionKeys(src).hits).toEqual([]);
    });

    it('passes every real page/middleware/auth source', () => {
        const files = [
            'src/middleware/auth.ts',
            'src/modules/pages/profile-page.ts',
            'src/modules/pages/verify-page.ts',
            'src/controllers/AuthController.ts',
            'src/modules/api/auth/oauth-routes.ts',
        ];
        for (const file of files) {
            expect(analyzeLegacySessionKeys(read(file)).hits, file).toEqual([]);
        }
    });
});

describe('SEC-08 browser-readable session secret guard controls', () => {
    it('flags executable localStorage session keys and window/session cookie writes', () => {
        expect(analyzeBrowserSessionStorage("localStorage.setItem('sessionId', token);\n").hits).toHaveLength(1);
        expect(analyzeBrowserSessionStorage("const KEY = 'session_id';\nlocalStorage.getItem(KEY);\n").hits).toHaveLength(1);
        expect(analyzeBrowserSessionStorage('window.sessionId = token;\n').hits).toHaveLength(1);
        expect(analyzeBrowserSessionStorage("document.cookie = 'sessionId=' + token;\n").hits).toHaveLength(1);
        expect(analyzeBrowserSessionStorage('document.cookie = `sessionId=${token}; path=/`;\n').hits).toHaveLength(1);
    });

    it('ignores comments, string examples and non-session storage', () => {
        const src = [
            '// never localStorage.setItem("sessionId", token)',
            '/* document.cookie = "session_id=" + token */',
            'export const note = "localStorage.getItem(\'sessionId\')";',
            "localStorage.setItem('darkMode', '1');",
            "document.cookie = 'csrfToken=' + csrf;",
            '',
        ].join('\n');
        expect(analyzeBrowserSessionStorage(src).hits).toEqual([]);
    });

    it('allows only the bounded legacy read/cleanup in SessionAccess', () => {
        const source = read('src/client/core/SessionAccess.ts');
        expect(analyzeBrowserSessionStorage(source).hits.length).toBeGreaterThan(0);
        expect(analyzeBrowserSessionStorage(source, { allowLegacyRead: true }).hits).toEqual([]);
    });

    it('passes every real client/page source under the migration policy', () => {
        const files = [
            'src/client/core/SessionAccess.ts',
            'src/client/services/AuthService.ts',
            'src/modules/pages/profile-page.ts',
            'src/modules/pages/competition-page.ts',
        ];
        for (const file of files) {
            // Mirror the CLI: only SessionAccess.ts may read/remove legacy keys.
            const allowLegacyRead = file === 'src/client/core/SessionAccess.ts';
            expect(
                analyzeBrowserSessionStorage(read(file), { allowLegacyRead }).hits,
                file,
            ).toEqual([]);
        }
    });
});

describe('SEC-11 query-string session token guard controls', () => {
    it('flags executable c.req.query("token")', () => {
        expect(analyzeQuerySessionToken("const token = c.req.query('token');\n").hits).toHaveLength(1);
        expect(analyzeQuerySessionToken('const token = c.req.query("token");\n').hits).toHaveLength(1);
    });

    it('ignores comments and scopes out the legitimate email-verification token', () => {
        const src = [
            "// c.req.query('token') was removed from authMiddleware (SEC-11)",
            "export const note = \"c.req.query('token')\";",
            '',
        ].join('\n');
        expect(analyzeQuerySessionToken(src).hits).toEqual([]);
        // verify-page.ts uses ?token= for a one-shot email verification link;
        // it is not a session credential, so SEC-11's scan inputs deliberately
        // exclude it. Scoping (not a broad analyzer exemption) keeps it working.
        expect(MODE_INPUTS.sec11).not.toContain('src/modules/pages/verify-page.ts');
        expect(MODE_INPUTS.sec11).toContain('src/modules/pages/profile-page.ts');
        expect(analyzeQuerySessionToken(read('src/modules/pages/verify-page.ts')).hits.length)
            .toBeGreaterThan(0);
    });

    it('passes the real auth middleware', () => {
        expect(analyzeQuerySessionToken(read('src/middleware/auth.ts')).hits).toEqual([]);
    });
});

describe('Quality Gate wiring for UNIT30.3', () => {
    function stepBlockFor(needle: string): string {
        const at = GATE.indexOf(needle);
        expect(at, `missing step command: ${needle}`).toBeGreaterThan(-1);
        const start = GATE.lastIndexOf('\n      - name:', at);
        expect(start, `step has no name: ${needle}`).toBeGreaterThan(-1);
        const next = GATE.indexOf('\n      - name:', at + 1);
        return GATE.slice(start, next === -1 ? GATE.length : next);
    }

    it('runs every AST guard as a blocking step', () => {
        for (const mode of ['sec05', 'sec07', 'sec08', 'sec10', 'sec11']) {
            const block = stepBlockFor(`node dev-tools/check-sec-guards.mjs ${mode}`);
            expect(block).toContain(`node dev-tools/check-sec-guards.mjs ${mode}`);
            expect(block).not.toContain('continue-on-error');
        }
    });

    it('no longer uses the comment-matching grep patterns', () => {
        expect(GATE).not.toContain('grep -n "cors()"');
        expect(GATE).not.toContain('grep -n "this.sockets"');
        expect(GATE).not.toContain('grep -rn "session_id\'"');
        expect(GATE).not.toContain('grep -rn "localStorage.*[sS]ession"');
        expect(GATE).not.toContain("grep -rn \"query('token')\"");
    });

    it('runs the blocking SEC-07/08/10 regression suites by name', () => {
        const block = stepBlockFor('tests/api/sec-guards.test.ts');
        for (const file of [
            'tests/api/sec-guards.test.ts',
            'tests/api/sec08-httponly-session.test.ts',
            'tests/api/auth-session-transient.test.ts',
            'tests/api/sse-user-auth.test.ts',
            'tests/ui/sec07-session-consumers.test.ts',
            'tests/ui/sec08-no-js-session.test.ts',
            'tests/client/session-access.test.ts',
            'tests/ui/auth-session-lifecycle.test.ts',
            'tests/workers/sec10-realtime.test.ts',
        ]) {
            expect(block, file).toContain(file);
        }
        expect(block).not.toContain('continue-on-error');
    });
});
