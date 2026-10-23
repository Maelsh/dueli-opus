/**
 * Test-only helpers for the SEC-08 cookie contract.
 *
 * Production responses never expose the session secret in JSON. Server tests
 * that still exercise the non-browser Bearer contract can read it from the
 * login response's `Set-Cookie` header, exactly as a real non-browser client
 * would have to.
 */

export function setCookieHeaders(response: Response): string[] {
    const headers = response.headers as unknown as { getSetCookie?: () => string[] };
    if (typeof headers.getSetCookie === 'function') return headers.getSetCookie();
    const combined = response.headers.get('set-cookie');
    return combined ? [combined] : [];
}

export function cookieValue(response: Response, name: string): string | null {
    const prefix = `${name}=`;
    for (const header of setCookieHeaders(response)) {
        // A single Set-Cookie value: name=value; attributes...
        if (header.startsWith(prefix)) {
            return header.slice(prefix.length).split(';', 1)[0];
        }
    }
    return null;
}

export function sessionTokenFromResponse(response: Response): string {
    const token = cookieValue(response, 'sessionId');
    if (!token) throw new Error('login response did not set a sessionId cookie');
    return token;
}

export function csrfTokenFromResponse(response: Response): string {
    const token = cookieValue(response, 'csrfToken');
    if (!token) throw new Error('response did not set a csrfToken cookie');
    return token;
}

/** Browser-style `Cookie` request header for a session + its CSRF token. */
export function cookieHeader(sessionToken: string, csrfToken?: string): string {
    return csrfToken
        ? `sessionId=${sessionToken}; csrfToken=${csrfToken}`
        : `sessionId=${sessionToken}`;
}
