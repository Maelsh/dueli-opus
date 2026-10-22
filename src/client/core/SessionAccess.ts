/**
 * @file src/client/core/SessionAccess.ts
 * @description R4-SESSION-KEY-SEC07-1 — one client-side session access path.
 *
 * Server contract: `Authorization: Bearer <session>` or the canonical
 * `sessionId` cookie. The client mirrors the canonical value in localStorage
 * until SEC-08 moves the web session to an HttpOnly cookie.
 *
 * Precedence is deliberate:
 *   1. in-memory token already validated on this page (State/window.sessionId)
 *   2. canonical localStorage `sessionId`
 *   3. canonical `sessionId` cookie
 *   4. legacy localStorage `session_id` — compatibility only, never first
 *
 * The legacy key is never written by current code. It is read last so a stale
 * old value can never override a newer canonical session. `AuthService`
 * validates canonical candidates in order and consults the legacy key only
 * when no canonical value exists; a valid legacy token is then migrated to the
 * canonical keys.
 */

export const SESSION_STORAGE_KEY = 'sessionId';
export const LEGACY_SESSION_STORAGE_KEY = 'session_id';

export interface SessionCandidates {
    /** In-memory value already validated by AuthService. */
    runtime?: unknown;
    /** Canonical localStorage value. */
    stored?: unknown;
    /** Canonical `sessionId` cookie value. */
    cookie?: unknown;
    /** Legacy localStorage `session_id` value (compatibility only). */
    legacy?: unknown;
}

export interface DueliSessionGlobal {
    token(): string;
    headers(extra?: Record<string, string>): Record<string, string>;
    hasToken(): boolean;
    /** Remove the two client session keys after a server-side account deletion. */
    clearLocal(): void;
}

/**
 * Normalize one stored value. Empty strings and values that would produce a
 * useless/injectable Authorization header are treated as absent.
 */
export function normalizeSessionToken(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const token = value.trim();
    if (!token) return null;
    if (/\s/.test(token)) return null;
    const lower = token.toLowerCase();
    if (lower === 'null' || lower === 'undefined' || lower === 'bearer') return null;
    if (lower === 'bearer null' || lower === 'bearer undefined') return null;
    return token;
}

/** Return all non-empty candidates in the one authoritative precedence order. */
export function listSessionCandidates(candidates: SessionCandidates): string[] {
    const ordered = [
        candidates.runtime,
        candidates.stored,
        candidates.cookie,
        candidates.legacy,
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const raw of ordered) {
        const token = normalizeSessionToken(raw);
        if (token && !seen.has(token)) {
            seen.add(token);
            out.push(token);
        }
    }
    return out;
}

/** Select the preferred token from the precedence list. */
export function selectSessionToken(candidates: SessionCandidates): string | null {
    return listSessionCandidates(candidates)[0] ?? null;
}

/** Read one cookie value from a document.cookie-style string. */
export function readCookieValue(cookieHeader: string | null | undefined, name: string): string | null {
    if (!cookieHeader) return null;
    for (const part of cookieHeader.split(';')) {
        const separator = part.indexOf('=');
        if (separator < 0) continue;
        if (part.slice(0, separator).trim() !== name) continue;
        const raw = part.slice(separator + 1).trim();
        try {
            return decodeURIComponent(raw);
        } catch {
            return raw;
        }
    }
    return null;
}

function safeStorageGet(storage: Storage | undefined, key: string): string | null {
    try {
        return storage ? storage.getItem(key) : null;
    } catch {
        return null;
    }
}

function browserStorage(): Storage | undefined {
    try {
        const win = typeof window !== 'undefined'
            ? window as unknown as { localStorage?: Storage }
            : undefined;
        if (win?.localStorage) return win.localStorage;
    } catch {
        // Access can throw when storage is blocked by the browser.
    }
    try {
        return typeof localStorage !== 'undefined' ? localStorage : undefined;
    } catch {
        return undefined;
    }
}

/** Read the current browser candidates without ever writing or logging them. */
export function readBrowserSessionCandidates(): SessionCandidates {
    const win = typeof window !== 'undefined'
        ? window as unknown as { sessionId?: string | null; localStorage?: Storage }
        : undefined;
    const docCookie = typeof document !== 'undefined' ? document.cookie : '';
    const storage = browserStorage();
    return {
        runtime: win?.sessionId,
        stored: safeStorageGet(storage, SESSION_STORAGE_KEY),
        cookie: readCookieValue(docCookie, SESSION_STORAGE_KEY),
        legacy: safeStorageGet(storage, LEGACY_SESSION_STORAGE_KEY),
    };
}

/** Preferred token for a page/bundle request. */
export function getBrowserSessionToken(): string | null {
    return selectSessionToken(readBrowserSessionCandidates());
}

/** Authorization headers for callers that need the canonical session. */
export function getSessionAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
    const headers = { ...extra };
    const token = getBrowserSessionToken();
    if (token) headers['Authorization'] = 'Bearer ' + token;
    return headers;
}

/**
 * Install the global helper used by server-rendered inline page scripts.
 * The external `/static/session-access.js` loads synchronously before page
 * scripts, so every inline consumer calls one implementation.
 */
export function installSessionAccessGlobal(target: Window | (Window & typeof globalThis)): DueliSessionGlobal {
    const api: DueliSessionGlobal = {
        token(): string {
            return getBrowserSessionToken() ?? '';
        },
        headers(extra: Record<string, string> = {}): Record<string, string> {
            return getSessionAuthHeaders(extra);
        },
        hasToken(): boolean {
            return getBrowserSessionToken() !== null;
        },
        clearLocal(): void {
            try {
                const storage = browserStorage();
                storage?.removeItem(SESSION_STORAGE_KEY);
                storage?.removeItem(LEGACY_SESSION_STORAGE_KEY);
            } catch {
                // Storage blocked — nothing else to clear here.
            }
            const win = typeof window !== 'undefined'
                ? window as unknown as { sessionId?: string | null }
                : undefined;
            if (win) win.sessionId = null;
        },
    };
    (target as unknown as { DueliSession: DueliSessionGlobal }).DueliSession = api;
    return api;
}
