/**
 * UNIT35 — safe same-origin return paths after login (no open redirect).
 */
import type { Language } from '../config/types';

export function sanitizeLocalReturnPath(raw: unknown, _lang?: Language): string | null {
    if (typeof raw !== 'string') return null;
    const trimmed = raw.trim();
    if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return null;
    if (trimmed.includes('\\') || /[\0\r\n]/.test(trimmed)) return null;
    if (/^\s*javascript:/i.test(trimmed) || /^\s*data:/i.test(trimmed)) return null;
    if (trimmed.length > 512) return null;
    try {
        const parsed = new URL(trimmed, 'https://dueli.local');
        if (parsed.origin !== 'https://dueli.local') return null;
        if (!parsed.pathname.startsWith('/')) return null;
    } catch {
        return null;
    }
    return trimmed;
}

export function appendLangQuery(path: string, lang: string): string {
    if (/([?&])lang=/.test(path)) return path;
    const sep = path.includes('?') ? '&' : '?';
    return `${path}${sep}lang=${encodeURIComponent(lang)}`;
}

export function readReturnToFromSearch(search: string): string | null {
    const params = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
    return (
        sanitizeLocalReturnPath(params.get('returnTo'))
        ?? sanitizeLocalReturnPath(params.get('redirect'))
    );
}

export function resolvePostLoginHref(lang: string, search?: string): string {
    const fromQuery =
        typeof search === 'string'
            ? readReturnToFromSearch(search)
            : typeof window !== 'undefined'
                ? readReturnToFromSearch(window.location.search)
                : null;
    if (fromQuery) return appendLangQuery(fromQuery, lang);
    return `/?lang=${encodeURIComponent(lang)}`;
}
