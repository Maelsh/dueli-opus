/**
 * Browser session transport (SEC-08).
 *
 * The browser session is a server-managed HttpOnly cookie. Bearer remains
 * supported for non-browser API clients; it is never written to browser
 * storage. CSRF uses a separate, non-secret double-submit token cookie whose
 * value is echoed in `X-CSRF-Token` by the browser fetch shim.
 */

import { getCookie, setCookie } from 'hono/cookie';
import type { Context } from 'hono';
import { SessionModel } from '../../models/SessionModel';

export const SESSION_COOKIE_NAME = 'sessionId';
export const CSRF_COOKIE_NAME = 'csrfToken';
export const OAUTH_STATE_COOKIE_NAME = 'oauthState';
export const SESSION_COOKIE_MAX_AGE_SECONDS = SessionModel.TTL_DAYS * 24 * 60 * 60;
export const OAUTH_STATE_MAX_AGE_SECONDS = 10 * 60;

type AppContextLike = Context<any>;

function requestIsHttps(c: AppContextLike): boolean {
    // The request URL is authoritative when it already says HTTPS. Only fall
    // back to the proxy header for deployments that terminate TLS upstream;
    // never let a client-supplied `http` downgrade an HTTPS request.
    try {
        if (new URL(c.req.url).protocol === 'https:') return true;
    } catch {
        // Fall through to the proxy header.
    }
    const forwarded = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();
    return forwarded === 'https';
}

export function readBearerToken(c: AppContextLike): string | null {
    const header = c.req.header('Authorization');
    const match = header?.match(/^Bearer\s+(.+)$/i);
    const token = match?.[1]?.trim();
    return token ? token : null;
}

/** Names of every presented credential, de-duplicated and cookie-first.
 *
 * The browser's HttpOnly cookie is authoritative for browser requests; a
 * Bearer credential is the non-browser contract (and the bounded legacy
 * migration path). Cookie-first prevents a stale/foreign Authorization header
 * from overriding a valid browser session. */
export function readSessionCandidates(c: AppContextLike): string[] {
    const values = [getCookie(c, SESSION_COOKIE_NAME) || null, readBearerToken(c)];
    return [...new Set(values.filter((v): v is string => !!v))];
}

export function setSessionCookie(c: AppContextLike, sessionId: string): void {
    setCookie(c, SESSION_COOKIE_NAME, sessionId, {
        httpOnly: true,
        secure: requestIsHttps(c),
        sameSite: 'Lax',
        path: '/',
        maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
        expires: new Date(Date.now() + SESSION_COOKIE_MAX_AGE_SECONDS * 1000),
    });
}

export function clearSessionCookie(c: AppContextLike): void {
    setCookie(c, SESSION_COOKIE_NAME, '', {
        httpOnly: true,
        secure: requestIsHttps(c),
        sameSite: 'Lax',
        path: '/',
        maxAge: 0,
        expires: new Date(0),
    });
}

export function generateCsrfToken(): string {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function setCsrfCookie(c: AppContextLike, token: string = generateCsrfToken()): string {
    setCookie(c, CSRF_COOKIE_NAME, token, {
        httpOnly: false,
        secure: requestIsHttps(c),
        sameSite: 'Lax',
        path: '/',
        maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
        expires: new Date(Date.now() + SESSION_COOKIE_MAX_AGE_SECONDS * 1000),
    });
    return token;
}

export function clearCsrfCookie(c: AppContextLike): void {
    setCookie(c, CSRF_COOKIE_NAME, '', {
        httpOnly: false,
        secure: requestIsHttps(c),
        sameSite: 'Lax',
        path: '/',
        maxAge: 0,
        expires: new Date(0),
    });
}

/** Issue a token once per browser; login rotates it explicitly. */
export function ensureCsrfCookie(c: AppContextLike): string {
    return getCookie(c, CSRF_COOKIE_NAME) || setCsrfCookie(c);
}

/**
 * OAuth `state` (random nonce + lang) is bound to this browser with an
 * HttpOnly one-time cookie. The callback must present the exact same state
 * parameter, which prevents login CSRF and code injection from another origin.
 */
export function setOAuthStateCookie(c: AppContextLike, statePayload: string): void {
    setCookie(c, OAUTH_STATE_COOKIE_NAME, statePayload, {
        httpOnly: true,
        secure: requestIsHttps(c),
        sameSite: 'Lax',
        path: '/api/auth/oauth',
        maxAge: OAUTH_STATE_MAX_AGE_SECONDS,
        expires: new Date(Date.now() + OAUTH_STATE_MAX_AGE_SECONDS * 1000),
    });
}

export function readOAuthStateCookie(c: AppContextLike): string | null {
    return getCookie(c, OAUTH_STATE_COOKIE_NAME) || null;
}

export function clearOAuthStateCookie(c: AppContextLike): void {
    setCookie(c, OAUTH_STATE_COOKIE_NAME, '', {
        httpOnly: true,
        secure: requestIsHttps(c),
        sameSite: 'Lax',
        path: '/api/auth/oauth',
        maxAge: 0,
        expires: new Date(0),
    });
}
