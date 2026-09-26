import { describe, expect, it } from 'vitest';
import app from '../../src/main';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * C5 (SEC-09): CSP fully hardened — no 'unsafe-inline', no 'unsafe-eval'.
 *
 * - Inline handlers were converted to data-csp-* delegation (external bundle).
 * - Page <script>/<style> blocks carry the per-request nonce.
 * - Dynamic values use data-csp-style (applied by the bundle) or classes.
 * - Email templates (EmailService) are exempt BY ARCHITECTURE: they are sent
 *   as email, never served with a CSP header.
 */

function servedCsp(path: string): Promise<string> {
    return app.request(path).then((res) => res.headers.get('content-security-policy') ?? '');
}

function walkTs(dir: string, out: string[] = []): string[] {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) {
            if (entry === 'node_modules') continue;
            walkTs(full, out);
        } else if (entry.endsWith('.ts')) {
            out.push(full);
        }
    }
    return out;
}

const HANDLER_ATTR = /\son(click|submit|change|error|input|keyup|keydown|mouseover|mouseout|mouseenter|mouseleave|focus|blur|dblclick|contextmenu)\s*=/;
const EVAL_CALL = /(^|[^\w$])eval\s*\(|new\s+Function\s*\(|setTimeout\s*\(\s*['"`]|setInterval\s*\(\s*['"`]/;

describe('C5 — served policy has no unsafe directives', () => {
    it.each(['/','/about', '/explore'])('1. %s serves CSP without unsafe-inline/unsafe-eval', async (path) => {
        const res = await app.request(path);
        expect(res.status).toBe(200);
        const csp = res.headers.get('content-security-policy') ?? '';
        expect(csp).toContain('script-src');
        expect(csp).not.toContain('unsafe-inline');
        expect(csp).not.toContain('unsafe-eval');
        expect(csp).toMatch(/script-src[^;]*'nonce-[A-Za-z0-9+/=]+'/);
    });
});

describe('C5 — no inline executable markup in served render code', () => {
    const files = walkTs('src');

    it('2. zero inline event-handler attributes in src (outside email templates)', () => {
        const offenders = files
            .filter((f) => !f.includes('EmailService'))
            .filter((f) => HANDLER_ATTR.test(readFileSync(f, 'utf8')));
        expect(offenders).toEqual([]);
    });

    it('3. zero eval-style execution in src', () => {
        const offenders = files.filter((f) => {
            if (f.includes('EmailService')) return false;
            const text = readFileSync(f, 'utf8');
            return EVAL_CALL.test(text);
        });
        expect(offenders).toEqual([]);
    });

    it('4. zero style="" attributes in served render code (email exempt)', () => {
        const offenders = files
            .filter((f) => !f.includes('EmailService'))
            .filter((f) => /\sstyle\s*=/.test(readFileSync(f, 'utf8')));
        expect(offenders).toEqual([]);
    });

    it('5. every data-csp-fn is allowlisted in the dispatcher (or a __builtin)', async () => {
        const delegate = readFileSync('src/client/csp-delegate.ts', 'utf8');
        const builtins = new Set([
            '__fallbackSrc', '__closestRemove', '__byIdRemove', '__byIdClass',
            '__byIdScroll', '__oauthDone', '__winClose', '__ancestorDisplayNone',
            '__navigateProfile',
        ]);
        for (const b of builtins) expect(delegate).toContain(`    ${b}:`);
        const allow = new Set([
            ...builtins,
            ...[...delegate.matchAll(/'([A-Za-z_$][\w$.]*)',/g)].map((m) => m[1]),
        ]);
        const missing = new Set<string>();
        for (const f of files) {
            if (f.includes('EmailService')) continue;
            const text = readFileSync(f, 'utf8');
            for (const m of text.matchAll(/data-csp-fn="([^"]+)"/g)) {
                if (!allow.has(m[1])) missing.add(`${f} :: ${m[1]}`);
            }
        }
        expect([...missing]).toEqual([]);
    });

    it('6. every data-csp-on uses a delegated event type', () => {
        const known = new Set([
            'click', 'submit', 'change', 'input', 'keyup', 'keydown',
            'mouseover', 'mouseout', 'mouseenter', 'mouseleave',
            'focus', 'blur', 'error',
        ]);
        const bad = new Set<string>();
        for (const f of files) {
            if (f.includes('EmailService')) continue;
            const text = readFileSync(f, 'utf8');
            for (const m of text.matchAll(/data-csp-on="([^"]+)"/g)) {
                if (!known.has(m[1])) bad.add(`${f} :: ${m[1]}`);
            }
        }
        expect([...bad]).toEqual([]);
    });
});
