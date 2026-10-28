import { Sanitize } from './services/Sanitize';

/** Attributes for truncated dynamic user/content text with native title + tooltip hook. */
export function dueliTruncateAttrs(fullText: string): string {
    const safe = Sanitize.escapeHtml(String(fullText ?? ''));
    return `data-dueli-truncate="1" title="${safe}" data-full-text="${safe}"`;
}
