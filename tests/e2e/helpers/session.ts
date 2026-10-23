/**
 * SEC-08 test-only helpers for Playwright API clients.
 *
 * Browser sessions are Set-Cookie HttpOnly values. E2E API contexts may still
 * use the non-browser Bearer contract, but they must read the token from the
 * response cookie — never from JSON (the login body no longer contains it).
 */
import type { APIRequestContext, APIResponse, BrowserContext, Cookie } from '@playwright/test';

/** Extract the session secret from one login/OAuth response's Set-Cookie. */
export function sessionTokenFromApiResponse(response: APIResponse): string {
    const setCookies = response.headersArray()
        .filter((header) => header.name.toLowerCase() === 'set-cookie')
        .map((header) => header.value);
    for (const header of setCookies) {
        const match = /^sessionId=([^;]*)/.exec(header);
        if (match?.[1]) return decodeURIComponent(match[1]);
    }
    throw new Error('response did not set a sessionId cookie');
}

/** Cookies currently held by a Playwright APIRequestContext. */
export async function requestCookies(request: APIRequestContext): Promise<Cookie[]> {
    return (await request.storageState()).cookies;
}

/** Start a login from a clean jar so it cannot rotate another actor's session. */
export async function clearRequestCookies(request: APIRequestContext): Promise<void> {
    await request.clearCookies();
}

/** Give a browser context the same cookie session captured after API login. */
export async function addRequestCookies(context: BrowserContext, cookies: Cookie[]): Promise<void> {
    if (cookies.length > 0) await context.addCookies(cookies);
}

/**
 * Cookies for a session row seeded directly in D1 (no login response). The
 * non-secret CSRF companion is fixed so same-origin test API calls can echo it.
 */
export function seededAuthCookies(token: string, origin: string, csrf = 'e2e-csrf'): Cookie[] {
    return [
        { name: 'sessionId', value: token, url: origin, httpOnly: true, sameSite: 'Lax' },
        { name: 'csrfToken', value: csrf, url: origin, httpOnly: false, sameSite: 'Lax' },
    ];
}
