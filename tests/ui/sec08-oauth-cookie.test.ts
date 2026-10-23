/**
 * SEC-08 — OAuth success never carries a browser-readable session.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getOAuthSuccessHTML } from '../../src/modules/api/auth/oauth-routes';

const ROOT = resolve(__dirname, '../..');
const read = (relative: string) => readFileSync(resolve(ROOT, relative), 'utf-8');

describe('SEC-08 OAuth cookie contract', () => {
    it('success HTML signals completion with a same-origin postMessage and no token', () => {
        const html = getOAuthSuccessHTML('en', 'nonce-sec08');
        expect(html).toContain("type: 'oauth_success'");
        expect(html).toContain('window.location.origin');
        expect(html).not.toContain('sessionId');
        expect(html).not.toContain('session_id');
        expect(html).not.toContain('sessionToken');
        expect(html).not.toContain('access_token');
    });

    it('the OAuth callback issues the same HttpOnly session + CSRF cookies', () => {
        const source = read('src/modules/api/auth/oauth-routes.ts');
        expect(source).toContain('setSessionCookie(c, session.id)');
        expect(source).toContain('setCsrfCookie(c)');
        expect(source).not.toContain('sessionId: session.id');
        expect(source).not.toContain('postMessage({ type: \'oauth_success\', session');
    });
});
