/**
 * R2-P — earnings withdrawal UI contract (saved methods in the modal).
 *
 * Pins (string-level on the server-rendered template):
 * - The modal offers saved methods first (`saved:<id>` options built from
 *   GET /api/payment-methods) with the legacy manual pair as fallback.
 * - submitWithdrawal posts {amount, payout_method_id} for saved picks and
 *   the legacy {amount, payment_method, payment_details} otherwise.
 * - No new CSP entry points (helpers run inside the existing allowlisted
 *   openWithdrawalModal/submitWithdrawal handlers).
 * - payout.* i18n keys exist in ar+en and differ.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ar } from '../../src/i18n/ar';
import { en } from '../../src/i18n/en';

const PAGE = readFileSync(resolve(__dirname, '../../src/modules/pages/earnings-page.ts'), 'utf-8');
const CSP = readFileSync(resolve(__dirname, '../../src/client/csp-delegate.ts'), 'utf-8');

describe('R2-P earnings payout UI contract', () => {
    it('1. saved methods offered first, manual fallback preserved', () => {
        expect(PAGE).toContain('loadSavedPayoutMethods');
        expect(PAGE).toContain('/api/payment-methods');
        expect(PAGE).toContain("'saved:' + m.id");
        expect(PAGE).toContain('bank_transfer');
        expect(PAGE).toContain('crypto_usdt');
        expect(PAGE).toContain('withdrawSavedHint');
    });

    it('2. submit posts method id for saved picks, legacy pair otherwise', () => {
        expect(PAGE).toContain('payout_method_id: methodId');
        expect(PAGE).toContain('payment_method: method, payment_details: details');
        expect(PAGE).toContain("method.indexOf('saved:') === 0");
    });

    it('3. no new CSP entry points for the payout helpers', () => {
        expect(PAGE).not.toContain('data-csp-fn="loadSavedPayoutMethods"');
        expect(PAGE).not.toContain('data-csp-fn="payoutMethodLabel"');
        expect(CSP).toContain("'openWithdrawalModal'");
        expect(CSP).toContain("'submitWithdrawal'");
    });

    it.each(['ar', 'en'] as const)('4. payout i18n keys exist and differ (%s)', (lang) => {
        void lang;
        const a = ar as any, e = en as any;
        for (const k of ['type_invalid', 'bank_fields_required', 'email_required', 'method_not_found', 'saved_methods', 'use_saved_method', 'manual_entry', 'no_saved_methods']) {
            expect(a.payout?.[k], `ar.payout.${k}`).toBeTruthy();
            expect(e.payout?.[k], `en.payout.${k}`).toBeTruthy();
            expect(a.payout[k]).not.toBe(e.payout[k]);
        }
    });
});
