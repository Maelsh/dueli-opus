/**
 * @file src/client/core/SessionAccess.ts
 * @description SEC-08 browser session transport.
 *
 * The browser session lives only in a server-issued HttpOnly cookie. This
 * module never reads, writes or exposes that secret. Its jobs are:
 *   1. synchronously install the CSRF double-submit header / credentials shim
 *      before inline page scripts run;
 *   2. remove legacy JS-readable session state after the bounded migration;
 *   3. keep a no-secret `window.DueliSession` compatibility surface for page
 *      scripts that still ask for headers.
 *
 * Legacy localStorage keys are read only by AuthService's one-time migration
 * path (`readLegacySessionToken`), never by pages.
 */

export const SESSION_STORAGE_KEY = 'sessionId';
export const LEGACY_SESSION_STORAGE_KEY = 'session_id';
export const CSRF_COOKIE_NAME = 'csrfToken';

export interface DueliSessionGlobal {
    /** Always empty: there is no JS-readable session secret after SEC-08. */
    token(): string;
    /** Extra headers plus the CSRF token; Authorization is never emitted. */
    headers(extra?: Record<string, string>): Record<string, string>;
    /** Non-secret hint for UI only; the server remains the authority. */
    hasToken(): boolean;
    /** Remove legacy JS-readable keys and a stale window resident. */
    clearLocal(): void;
    csrfToken(): string;
}

export function readCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0) continue;
        const key = part.slice(0, separator).trim();
        if (key !== name) continue;
        const raw = part.slice(separator + 1).trim();
        try {
            return decodeURIComponent(raw);
        } catch {
            return raw;
        }
    }
    return null;
}

function documentCookie(): string {
    try {
        return typeof document !== 'undefined' ? document.cookie : '';
    } catch {
        return '';
    }
}

export function getCsrfToken(): string {
    return readCookieValue(documentCookie(), CSRF_COOKIE_NAME) || '';
}

export function readLegacySessionToken(): string | null {
    try {
        if (typeof localStorage === 'undefined') return null;
        const raw = localStorage.getItem(SESSION_STORAGE_KEY)
            || localStorage.getItem(LEGACY_SESSION_STORAGE_KEY)
            || '';
        const token = raw.trim();
        // Legacy sessions are UUIDs. Reject placeholders/injected whitespace
        // before they can become an invalid Authorization header.
        if (!token || token.length > 64 || /\s/.test(token)) return null;
        return token;
    } catch {
        return null;
    }
}

export function clearLegacySessionStorage(): void {
    try {
        localStorage?.removeItem(SESSION_STORAGE_KEY);
        localStorage?.removeItem(LEGACY_SESSION_STORAGE_KEY);
    } catch {
        // Storage unavailable: nothing to migrate.
    }
    try {
        const win = typeof window !== 'undefined' ? window as unknown as { sessionId?: unknown } : null;
        if (win && 'sessionId' in win) delete win.sessionId;
    } catch {
        // Ignore non-configurable windows.
    }
}

function installFetchShim(win: Window & typeof globalThis): void {
    const anyWin = win as any;
    if (typeof anyWin.fetch !== 'function' || anyWin.__dueliSec08Fetch) return;

    const originalFetch = anyWin.fetch.bind(win);
    const wrapped = (input: any, init: RequestInit = {}) => {
        try {
            const rawUrl = typeof input === 'string'
                ? input
                : (input && typeof input.url === 'string' ? input.url : '');
            const origin = anyWin.location?.origin || (typeof location !== 'undefined' ? location.origin : '');
            const url = new URL(rawUrl, origin || undefined);
            const sameOrigin = !origin || url.origin === origin;
            const isApi = url.pathname.startsWith('/api/');
            if (!sameOrigin || !isApi) return originalFetch(input, init);

            const method = String(init.method || (input && input.method) || 'GET').toUpperCase();
            const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
            const auth = headers.get('Authorization');
            // Empty/legacy placeholders from pre-SEC08 page code must never
            // become a credential. A real legacy token is allowed only for
            // AuthService's one-shot migration request.
            if (auth !== null && !/^Bearer\s+\S+/.test(auth)) headers.delete('Authorization');

            if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
                const csrf = getCsrfToken();
                if (csrf) headers.set('X-CSRF-Token', csrf);
            }

            if (typeof Request !== 'undefined' && input instanceof Request) {
                return originalFetch(new Request(input, {
                    ...init,
                    headers,
                    credentials: 'include',
                }));
            }
            return originalFetch(input, {
                ...init,
                headers,
                credentials: 'include',
            });
        } catch {
            return originalFetch(input, init);
        }
    };

    anyWin.fetch = wrapped;
    try {
        Object.defineProperty(anyWin, '__dueliSec08Fetch', { value: true });
    } catch {
        anyWin.__dueliSec08Fetch = true;
    }
}

export function installSessionAccessGlobal(target: Window | (Window & typeof globalThis)): DueliSessionGlobal {
    const win = target as Window & typeof globalThis;
    try {
        if ('sessionId' in win) delete (win as any).sessionId;
    } catch {
        // Ignore.
    }
    installFetchShim(win);

    const api: DueliSessionGlobal = {
        token(): string {
            return '';
        },
        headers(extra: Record<string, string> = {}): Record<string, string> {
            const headers: Record<string, string> = { ...extra };
            delete headers.Authorization;
            delete headers.authorization;
            const csrf = getCsrfToken();
            if (csrf) headers['X-CSRF-Token'] = csrf;
            return headers;
        },
        hasToken(): boolean {
            const current = (win as any).currentUser;
            return !!(current && current.id);
        },
        clearLocal(): void {
            clearLegacySessionStorage();
        },
        csrfToken(): string {
            return getCsrfToken();
        },
    };
    (win as unknown as { DueliSession: DueliSessionGlobal }).DueliSession = api;
    return api;
}
