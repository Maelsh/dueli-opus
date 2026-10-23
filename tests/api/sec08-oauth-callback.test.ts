/**
 * SEC-08 — real OAuth callback cookie contract.
 *
 * The provider network is stubbed; everything else (user upsert, session row,
 * Set-Cookie, success page) is the production route. This proves OAuth does not
 * occupy a second, token-in-JSON browser path.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { cookieHeader, cookieValue, csrfTokenFromResponse, sessionTokenFromResponse, setCookieHeaders } from '../helpers/session-cookie';

const ORIGIN = 'http://dueli.test';

function env(db: SqliteD1) {
    return {
        DB: db,
        GOOGLE_CLIENT_ID: 'sec08-google-id',
        GOOGLE_CLIENT_SECRET: 'sec08-google-secret',
    } as unknown as Parameters<typeof app.request>[2];
}

describe('SEC-08 OAuth callback', () => {
    let db: SqliteD1;
    const realFetch = globalThis.fetch;

    beforeEach(async () => {
        db = await createSqliteD1();
        (globalThis as any).__sec08Db = db;
        vi.stubGlobal('fetch', vi.fn(async (input: any) => {
            const url = String(typeof input === 'string' ? input : input?.url ?? input);
            if (url.includes('oauth2.googleapis.com/token')) {
                return new Response(JSON.stringify({
                    access_token: 'provider-access-token',
                    token_type: 'Bearer',
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            if (url.includes('googleapis.com/oauth2/v2/userinfo')) {
                return new Response(JSON.stringify({
                    id: 'google-sec08-1',
                    email: 'oauth.sec08@example.com',
                    name: 'OAuth SEC08',
                    picture: 'https://example.com/avatar.png',
                }), { status: 200, headers: { 'Content-Type': 'application/json' } });
            }
            throw new Error(`Unexpected OAuth fetch: ${url}`);
        }));
    });

    afterEach(() => {
        vi.stubGlobal('fetch', realFetch);
    });

    it('sets the same HttpOnly session cookie as password login and returns no secret in the success page', async () => {
        const init = await app.request(`${ORIGIN}/api/auth/oauth/google?lang=en`, {
            headers: { 'CF-Connecting-IP': '10.89.0.1' },
        }, env(db));
        expect(init.status).toBe(302);

        const stateCookieHeader = setCookieHeaders(init).find((h) => h.startsWith('oauthState='));
        expect(stateCookieHeader).toBeTruthy();
        expect(stateCookieHeader).toContain('HttpOnly');
        expect(stateCookieHeader).toContain('SameSite=Lax');
        const oauthStateCookie = cookieValue(init, 'oauthState');
        expect(oauthStateCookie).toBeTruthy();

        const location = new URL(init.headers.get('Location')!);
        const state = location.searchParams.get('state');
        expect(state).toBeTruthy();

        const res = await app.request(
            `${ORIGIN}/api/auth/oauth/google/callback?code=code-sec08&state=${encodeURIComponent(state!)}`,
            {
                headers: {
                    Cookie: `oauthState=${oauthStateCookie}`,
                    'CF-Connecting-IP': '10.89.0.2',
                },
            },
            env(db),
        );

        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain("type: 'oauth_success'");
        expect(html).not.toContain('sessionId');
        expect(html).not.toContain('provider-access-token');
        expect(html).not.toContain('code-sec08');

        const cookies = setCookieHeaders(res);
        const sessionCookie = cookies.find((h) => h.startsWith('sessionId='));
        expect(sessionCookie).toBeTruthy();
        expect(sessionCookie).toContain('HttpOnly');
        expect(sessionCookie).toContain('SameSite=Lax');
        expect(sessionCookie).toContain('Path=/');
        expect(sessionCookie).toMatch(/Max-Age=\d+/);
        expect(cookies.find((h) => h.startsWith('csrfToken='))).toBeTruthy();
        expect(cookies.find((h) => h.startsWith('oauthState='))).toMatch(/Max-Age=0/i);

        const session = sessionTokenFromResponse(res);
        const csrf = csrfTokenFromResponse(res);
        const userRes = await app.request(`${ORIGIN}/api/auth/session`, {
            headers: {
                'X-CSRF-Token': csrf,
                Cookie: cookieHeader(session, csrf),
                'CF-Connecting-IP': '10.89.0.3',
            },
        }, env(db));
        expect(userRes.status).toBe(200);
        const body = (await userRes.json()) as any;
        expect(body.data.user.email).toBe('oauth.sec08@example.com');
    });

    it('rejects a callback whose state does not match the HttpOnly state cookie', async () => {
        const state = encodeURIComponent(JSON.stringify({ state: 'attacker-state', lang: 'en' }));
        const res = await app.request(
            `${ORIGIN}/api/auth/oauth/google/callback?code=code-sec08&state=${state}`,
            {
                headers: {
                    Cookie: `oauthState=${encodeURIComponent(JSON.stringify({ state: 'victim-state', lang: 'en' }))}`,
                    'CF-Connecting-IP': '10.89.0.4',
                },
            },
            env(db),
        );
        expect(res.status).toBe(200);
        expect(setCookieHeaders(res).some((h) => h.startsWith('sessionId='))).toBe(false);
        expect(await res.text()).toContain('OAuth Error');
    });
});
