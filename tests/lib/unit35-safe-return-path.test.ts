/**
 * UNIT35 — safe returnTo / redirect query handling.
 */
import { describe, expect, it } from 'vitest';
import {
    appendLangQuery,
    readReturnToFromSearch,
    resolvePostLoginHref,
    sanitizeLocalReturnPath,
} from '../../src/lib/safeReturnPath';

describe('UNIT35 safeReturnPath', () => {
    it('accepts same-origin relative paths only', () => {
        expect(sanitizeLocalReturnPath('/competition/5')).toBe('/competition/5');
        expect(sanitizeLocalReturnPath('/explore?search=x')).toBe('/explore?search=x');
    });

    it('rejects external and dangerous targets', () => {
        expect(sanitizeLocalReturnPath('https://evil.test/x')).toBeNull();
        expect(sanitizeLocalReturnPath('//evil.test/x')).toBeNull();
        expect(sanitizeLocalReturnPath('javascript:alert(1)')).toBeNull();
        expect(sanitizeLocalReturnPath('/ok\\evil')).toBeNull();
    });

    it('reads returnTo and redirect from search', () => {
        expect(readReturnToFromSearch('?returnTo=%2Fcreate')).toBe('/create');
        expect(readReturnToFromSearch('?redirect=%2Fcompetition%2F1')).toBe('/competition/1');
    });

    it('appends lang when missing', () => {
        expect(appendLangQuery('/create', 'en')).toBe('/create?lang=en');
        expect(resolvePostLoginHref('ar', '?returnTo=/donate')).toBe('/donate?lang=ar');
    });
});
