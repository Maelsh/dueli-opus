/**
 * R1.5 — Earnings / Withdrawals / Donations UI contract repair.
 *
 * Live contracts (read-only backend evidence):
 *   - App session key is `sessionId` (State.ts/AuthService/ApiClient).
 *     `localStorage.getItem('session_id')` returns null -> `Bearer null`.
 *   - GET /api/withdrawals -> {success, data:{wallet:{available,pending,
 *     on_hold,withdrawn,total}, requests, meta}} (WithdrawalController).
 *   - POST /api/withdrawals body {amount,payment_method,payment_details};
 *     minimum enforced at $50 (EarningsModel: amount < 50 rejected;
 *     i18n min_withdrawal = $50). Errors are {success:false, error:string}.
 *   - GET /api/donations/top-supporters -> {success, data:[{donor_name,
 *     total_amount, avatar}]} (donations routes + DonationModel).
 *   - POST /api/donations -> {success, data:{payment_url,...}},
 *     errors {success:false, error:{message}}; cents handled server-side
 *     (Math.round(amount*100)) so fractional dollars are legal input.
 *   - Only toast API is window.dueli.showToast(message, type).
 *
 * Proven page defects (all UI-only):
 *   E1 earnings session key: 4x getItem('session_id') -> every authed
 *       earnings/withdrawal request goes out unauthenticated (P15-001).
 *   E2 withdrawal minimum contradiction: form advertises $10 (input min,
 *       hint, available<10 gate) while $50 is enforced -> align form to 50.
 *   D1 supporter card reads s.amount (API: total_amount) -> "$undefined".
 *   D2 parseInt truncates cents the backend accepts -> parseFloat.
 *   D3 five dead dueli?.toast calls -> window.dueli?.showToast (donation
 *       success/failure states never display).
 *   D4 supporters empty-state uses window.translations?.be_first (wrong
 *       object + missing key) -> tr.donations?.be_first (new key, ar+en).
 *
 * Verified CORRECT, untouched: withdrawals paths/envelopes, donations POST
 * envelope + error shape + guest-safe alerts, top-supporters envelope,
 * Stripe redirect guard, local earnings showToast shim, CSP/RTL/dark markup.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from '../../src/i18n';
import { donatePage } from '../../src/modules/pages/donate-page';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

const EARNINGS = 'src/modules/pages/earnings-page.ts';
const DONATE = 'src/modules/pages/donate-page.ts';

describe('R1.5 earnings session key (P15-001)', () => {
    it('uses the sessionId key in every earnings/withdrawal request', () => {
        const src = readSrc(EARNINGS);
        expect(src, "wrong session_id key must be gone").not.toContain("getItem('session_id')");
        expect(src.match(/getItem\('sessionId'\)/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    });
});

describe('R1.5 withdrawal $50 minimum alignment', () => {
    it('gates the form, input, hints and submit check on the enforced $50', () => {
        const src = readSrc(EARNINGS);
        expect(src).toContain('min="50"');
        expect(src).toContain('available < 50');
        expect(src).toContain('amount < 50');
        expect(src, '$10 form remnants must be gone').not.toContain('available < 10');
        expect(src).not.toContain('min="10"');
        expect(src).not.toContain('$10.00');
    });
});

describe('R1.5 donation supporters + amount (P15-004)', () => {
    it('maps the top-supporters contract fields (donor_name/total_amount)', () => {
        const src = readSrc(DONATE);
        expect(src).toContain('s.total_amount');
        expect(src, 's.amount (never returned) must be gone').not.toContain('s.amount');
    });

    it('keeps fractional dollars the backend accepts (no silent truncation)', () => {
        const src = readSrc(DONATE);
        expect(src).toContain('parseFloat(document.getElementById(\'customAmount\').value)');
        expect(src, 'parseInt truncation must be gone').not.toContain(
            'parseInt(document.getElementById(\'customAmount\')',
        );
    });

    it('renders the supporters empty-state from the donations i18n scope', () => {
        const src = readSrc(DONATE);
        expect(src).toContain('tr.donations?.be_first');
        expect(src, 'wrong window.translations object must be gone').not.toContain('window.translations?.');
        for (const lang of ['ar', 'en'] as const) {
            expect(
                (translations[lang].donations as Record<string, unknown>).be_first,
                `donations.be_first missing in ${lang}`,
            ).toBeTruthy();
        }
    });
});

describe('R1.5 donation success/failure display', () => {
    it('reports donation outcomes via window.dueli.showToast (the real toast API)', () => {
        const src = readSrc(DONATE);
        expect(src, 'dead dueli.toast chain must be gone').not.toContain('dueli?.toast?.');
        expect(src.match(/window\.dueli\?\.showToast\(/g)?.length ?? 0).toBeGreaterThanOrEqual(5);
    });
});

describe('R1.5 B1 supporter amount reaches the card (behavioral)', () => {
    // Real top-supporters API row (DonationModel.getTopSupporters).
    const apiRow = {
        donor_name: 'Karim',
        total_amount: 125.5,
        avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Karim',
    };

    /** Run the page's OWN loadSupporters mapper against a real API row. */
    function runPageMapper(src: string, row: Record<string, unknown>): Record<string, unknown> {
        const m = src.match(/data\.data\.map\(function\(s, i\) \{\s*return (\{[^}]+\});?\s*\}\)\)/);
        expect(m, 'page must map top-supporters rows through its own mapper').toBeTruthy();
        return new Function('s', 'i', `return (${(m as RegExpMatchArray)[1]});`)(row, 0) as Record<
            string,
            unknown
        >;
    }

    /** Run the page's OWN renderSupporters (extracted from rendered HTML) on view objects. */
    async function renderPageCards(viewObjects: Record<string, unknown>[]): Promise<string> {
        const ctx = {
            get: (k: string) => (k === 'lang' ? 'en' : k === 'cspNonce' ? 'test-nonce' : null),
            html: (s: string) => s,
        } as never;
        const html = (await (donatePage as (c: never) => Promise<string>)(ctx)) as string;
        const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((x) => x[1]);
        const pageScript = scripts.find((s) => s.includes('function renderSupporters'));
        expect(pageScript, 'rendered page must ship its own renderSupporters').toBeTruthy();
        const fakeEl = { innerHTML: '' };
        const factory = new Function(
            'document',
            'window',
            `${pageScript as string}\nreturn renderSupporters;`,
        );
        const renderSupporters = factory(
            { addEventListener() {}, getElementById: () => fakeEl },
            {},
        ) as (v: Record<string, unknown>[]) => void;
        renderSupporters(viewObjects);
        return fakeEl.innerHTML;
    }

    it('a 125.5 supporter renders $125.5 with no $undefined (mapper -> card)', async () => {
        const src = readSrc(DONATE);
        const viewObject = runPageMapper(src, apiRow);
        const cardHtml = await renderPageCards([viewObject]);
        expect(cardHtml, 'card must show the real amount').toContain('125.5');
        expect(cardHtml, 'card must not leak undefined amounts').not.toContain('undefined');
        expect(cardHtml, 'card must show the donor name').toContain('Karim');
    });
});

describe('R1.5 finance shells stay clean', () => {
    it('server-rendered shells leak no raw placeholders', () => {
        for (const f of [EARNINGS, DONATE]) {
            const src = readSrc(f);
            expect(src.slice(0, src.indexOf('<script nonce')), `raw placeholder in ${f}`).not.toContain('\\${');
        }
    });
});
