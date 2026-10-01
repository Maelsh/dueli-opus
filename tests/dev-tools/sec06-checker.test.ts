import { describe, it, expect } from 'vitest';
import { findMathRandomCalls } from '../../dev-tools/check-sec06-math-random.mjs';

// PR #79 remediation controls (Codex): the SEC-06 gate must catch executable
// Math.random() however it is wrapped, and must ignore comments/strings.

describe('SEC-06 checker controls', () => {
    it('flags a single-line executable call', () => {
        const hits = findMathRandomCalls('export const x = Math.random();\n');
        expect(hits).toHaveLength(1);
        expect(hits[0].line).toBe(1);
    });

    it('flags a multi-line executable call (Math newline .random())', () => {
        const hits = findMathRandomCalls('export const x = Math\n  .random();\n');
        expect(hits).toHaveLength(1);
        expect(hits[0].line).toBe(1);
    });

    it('ignores Math.random() inside a string literal', () => {
        const hits = findMathRandomCalls('export const s = "never use Math.random()";\n');
        expect(hits).toHaveLength(0);
    });

    it('ignores line and block comments', () => {
        const src = [
            '// never Math.random() here',
            '/* Math.random() in a block comment */',
            'export const y = 1;',
            '',
        ].join('\n');
        expect(findMathRandomCalls(src)).toHaveLength(0);
    });

    it('ignores the real ExploreSessionService doc comment', () => {
        const src = [
            '/*',
            ' *   eligible set + one Fisher–Yates pass with WebCrypto randomness (never',
            ' *   Math.random in this security-adjacent context, never ORDER BY RANDOM()',
            ' *   per batch).',
            ' */',
            'export const x = 1;',
            '',
        ].join('\n');
        expect(findMathRandomCalls(src)).toHaveLength(0);
    });

    it('flags the real call while ignoring adjacent comment/string noise', () => {
        const src = [
            '// Math.random() is banned',
            'export const note = "Math.random()";',
            'export const x = Math.random();',
            '',
        ].join('\n');
        const hits = findMathRandomCalls(src);
        expect(hits).toHaveLength(1);
        expect(hits[0].line).toBe(3);
    });
});
