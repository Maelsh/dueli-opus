/**
 * R1 micro-fix — Earnings palette final acceptance (owner evidence post-#73).
 *
 * - Withdrawn card continues the Dueli progression (purple → lighter
 *   purple/fuchsia → lighter pink/fuchsia/purple), NOT purple → fuchsia → blue.
 * - The marked green DECORATIVE icons (title wallet, withdrawal money, modal
 *   bank) use canonical Dueli purple; semantic success indicators stay green.
 * - No finance behavior change (amounts, rules, API, ledger untouched).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DUELI_EARNINGS_WITHDRAWN } from '../../src/shared/constants';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

describe('earnings withdrawn card continues the Dueli progression', () => {
    it('uses the accepted lighter pink/fuchsia/purple gradient, never blue-heavy', () => {
        expect(DUELI_EARNINGS_WITHDRAWN).toBe(
            'bg-gradient-to-br from-pink-500 via-fuchsia-400 to-purple-400',
        );
        expect(DUELI_EARNINGS_WITHDRAWN).not.toMatch(/blue/);
    });

    it('earnings page renders the withdrawn token (no blue-heavy literal)', () => {
        const src = readSrc('src/modules/pages/earnings-page.ts');
        expect(src).toContain('EARN_WITHDRAWN');
        expect(src).not.toMatch(/from-indigo-700 via-indigo-600 to-blue-600/);
    });
});

describe('earnings decorative icons are Dueli purple, not green', () => {
    it('title wallet, modal bank and withdrawal money icons use purple', () => {
        const src = readSrc('src/modules/pages/earnings-page.ts');
        expect(src).toMatch(/fa-wallet \$\{rtl \? 'ml-3' : 'mr-3'\} text-purple-500/);
        expect(src).toMatch(/fa-university \$\{rtl \? 'ml-2' : 'mr-2'\} text-purple-500/);
        expect(src).toMatch(/fa-money-bill-wave \\\$\{isRTL \? 'ml-2' : 'mr-2'\} text-purple-500/);
    });

    it('exactly one green text usage remains: the semantic completed status', () => {
        const src = readSrc('src/modules/pages/earnings-page.ts');
        const greens = src.match(/text-emerald-500/g) || [];
        expect(greens.length).toBe(1);
        expect(src).toContain(`completed: 'text-emerald-500'`);
    });
});

describe('no finance behavior changed by the palette micro-fix', () => {
    it('amounts, rules and contracts are untouched', () => {
        const src = readSrc('src/modules/pages/earnings-page.ts');
        expect(src).toContain('available < 50');
        expect(src).toContain('amount < 50');
        expect(src).toContain("min=\"50\"");
        expect(src).toContain('/api/withdrawals');
    });
});
