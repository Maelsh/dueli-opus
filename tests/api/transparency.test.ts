import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerService } from '../../src/lib/services/LedgerService';

/**
 * 8.F — شفافية الأموال من دفتر الأستاذ (RED-FIRST).
 *
 * المصدر الوحيد للحقيقة: `ledger_entries` عبر `LedgerService`.
 * التعريفات (مشتقة من semantics الحالية — بلا سياسة مخترعة):
 * - total_in_cents      = مجموع الأرجل الدائنة على حسابات reserve:* (كل تدفق
 *   إجمالي يكتب ساق reserve دائنة واحدة بالمبلغ الكامل: capture ‏8.C/8.E ←
 *   ‏reserve:gateway، وتوزيع 8.B ← ‏reserve:payouts).
 * - total_out_cents     = مجموع الأرجل المدينة على حسابات user:* (كل كسب
 *   مستخدم هو ساق user مدينة واحدة: حصص 8.B + صافي تبرع 8.E).
 * - platform_share_cents = صافي أرصدة platform:* (مدين − دائن: رسوم/حصص
 *   platform:revenue مطروحاً منها المردودات + صافي حجوزات platform:withdrawals).
 */

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

async function seedLedger(db: SqliteD1): Promise<void> {
    const ledger = new LedgerService(db as unknown as D1Database);
    // تدفق 8.C/8.E: تبرع منصة $25 (2500 سنت) — رسوم/إيراد + نقد البوابة.
    await ledger.post({
        txId: 't8f:platform-donation',
        createdBy: 'system:stripe',
        ref: { ref_type: 'donation', ref_id: 1 },
        entries: [
            { account: 'platform:revenue', direction: 'debit', amountCents: 2500 },
            { account: 'reserve:gateway', direction: 'credit', amountCents: 2500 },
        ],
    });
    // تدفق 8.E: تبرع لمتنافس $10 برسوم 20% (fee=200, net=800).
    await ledger.post({
        txId: 't8f:recipient-donation',
        createdBy: 'system:stripe',
        ref: { ref_type: 'donation', ref_id: 2 },
        entries: [
            { account: 'platform:revenue', direction: 'debit', amountCents: 200 },
            { account: 'user:7', direction: 'debit', amountCents: 800 },
            { account: 'reserve:gateway', direction: 'credit', amountCents: 1000 },
        ],
    });
    // تدفق 8.B: توزيع منافسة $30 (منصة 600 + منشئ 1200 + خصم 1200).
    await ledger.post({
        txId: 't8f:payout',
        createdBy: 'system:payouts',
        ref: { ref_type: 'competition', ref_id: 9 },
        entries: [
            { account: 'user:11', direction: 'debit', amountCents: 1200 },
            { account: 'user:12', direction: 'debit', amountCents: 1200 },
            { account: 'platform:revenue', direction: 'debit', amountCents: 600 },
            { account: 'reserve:payouts', direction: 'credit', amountCents: 3000 },
        ],
    });
}

// القيم المتوقعة من البذرة أعلاه (integer cents فقط):
// reserve credits: 2500 + 1000 + 3000 = 6500 (total_in)
// user debits: 800 + 1200 + 1200 = 3200 (total_out)
// platform net: (2500 + 200 + 600) − 0 = 3300 (platform_share)
const EXPECTED_IN = 6500;
const EXPECTED_OUT = 3200;
const EXPECTED_PLATFORM = 3300;

async function independentTotals(db: SqliteD1): Promise<{ totalIn: number; totalOut: number; platformShare: number }> {
    const totalIn = (await db.prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS s FROM ledger_entries WHERE direction = 'credit' AND account LIKE 'reserve:%'`
    ).first<{ s: number }>())?.s ?? 0;
    const totalOut = (await db.prepare(
        `SELECT COALESCE(SUM(amount_cents), 0) AS s FROM ledger_entries WHERE direction = 'debit' AND account LIKE 'user:%'`
    ).first<{ s: number }>())?.s ?? 0;
    const platformShare = (await db.prepare(
        `SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0) AS s FROM ledger_entries WHERE account LIKE 'platform:%'`
    ).first<{ s: number }>())?.s ?? 0;
    return { totalIn, totalOut, platformShare };
}

function rawText(value: unknown): string {
    return JSON.stringify(value ?? null);
}

describe('8.F money transparency (RED-FIRST) — ledger-backed public totals', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    it('1. الأرقام = التجميع المستقل من ledger بالسنت تماماً', async () => {
        await seedLedger(db);
        const expected = await independentTotals(db);
        expect(expected.totalIn).toBe(EXPECTED_IN);
        expect(expected.totalOut).toBe(EXPECTED_OUT);
        expect(expected.platformShare).toBe(EXPECTED_PLATFORM);

        const res = await app.request('/api/transparency/summary', { method: 'GET' }, env(db));
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            success: boolean;
            data: { total_in_cents: number; total_out_cents: number; platform_share_cents: number };
        };
        expect(body.success).toBe(true);
        expect(body.data.total_in_cents).toBe(expected.totalIn);
        expect(body.data.total_out_cents).toBe(expected.totalOut);
        expect(body.data.platform_share_cents).toBe(expected.platformShare);
        expect(Number.isInteger(body.data.total_in_cents)).toBe(true);
        expect(Number.isInteger(body.data.total_out_cents)).toBe(true);
        expect(Number.isInteger(body.data.platform_share_cents)).toBe(true);
        // الفرق بين المعروض والمشتق مباشرة = صفر سنت.
        expect(body.data.total_in_cents - expected.totalIn).toBe(0);
        expect(body.data.total_out_cents - expected.totalOut).toBe(0);
        expect(body.data.platform_share_cents - expected.platformShare).toBe(0);
    });

    it('2. لا هوية شخصية في الاستجابة العامة', async () => {
        await seedLedger(db);
        const res = await app.request('/api/transparency/summary', { method: 'GET' }, env(db));
        expect(res.status).toBe(200);
        const body = (await res.json()) as unknown;
        const text = rawText(body).toLowerCase();
        for (const needle of ['user_id', 'userid', 'user:', 'email', 'username', 'display_name', 'avatar', 'session']) {
            expect(text, `leaked identity marker: ${needle}`).not.toContain(needle);
        }
        // لا أرقام هوية مستخدم ظاهرة (user:11 / user:12 / user:7 من البذرة).
        expect(text).not.toContain('user:11');
        expect(text).not.toContain('user:12');
        expect(text).not.toContain(':7');
    });

    it('3. GET /api/transparency/verify يعيد verifyInvariant() مع difference === 0', async () => {
        await seedLedger(db);
        const res = await app.request('/api/transparency/verify', { method: 'GET' }, env(db));
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            success: boolean;
            data: { totalDebitCents: number; totalCreditCents: number; difference: number; balanced: boolean };
        };
        expect(body.success).toBe(true);
        expect(body.data.difference).toBe(0);
        expect(body.data.balanced).toBe(true);
        expect(body.data.totalDebitCents).toBe(body.data.totalCreditCents);
    });

    it('4. cache يعمل + القيمة القديمة لا تستمر بعد انتهاء الصلاحية', async () => {
        await seedLedger(db);
        const first = (await (await app.request('/api/transparency/summary', { method: 'GET' }, env(db))).json()) as {
            success: boolean;
            data: { total_in_cents: number; fingerprint: string; cached: boolean };
        };
        expect(first.success).toBe(true);
        expect(typeof first.data.fingerprint).toBe('string');
        expect(first.data.fingerprint.length).toBeGreaterThan(0);

        // حركة جديدة في ledger بعد التخزين.
        const ledger = new LedgerService(db as unknown as D1Database);
        await ledger.post({
            txId: 't8f:after-cache',
            createdBy: 'system:stripe',
            ref: { ref_type: 'donation', ref_id: 3 },
            entries: [
                { account: 'platform:revenue', direction: 'debit', amountCents: 500 },
                { account: 'reserve:gateway', direction: 'credit', amountCents: 500 },
            ],
        });

        // إبطال الـcache (محاكاة انتهاء TTL) ⇒ إعادة الحساب من ledger بالرقم الصحيح.
        const { MoneyTransparencyService } = await import('../../src/lib/services/MoneyTransparencyService');
        MoneyTransparencyService.clearCache();
        const second = (await (await app.request('/api/transparency/summary', { method: 'GET' }, env(db))).json()) as {
            success: boolean;
            data: { total_in_cents: number; fingerprint: string; cached: boolean };
        };
        expect(second.success).toBe(true);
        expect(second.data.total_in_cents).toBe(EXPECTED_IN + 500);
        expect(second.data.fingerprint).not.toBe(first.data.fingerprint);

        // إصابة cache صحيحة: نفس البصمة والقيم دون إعادة حساب.
        const third = (await (await app.request('/api/transparency/summary', { method: 'GET' }, env(db))).json()) as {
            success: boolean;
            data: { total_in_cents: number; fingerprint: string; cached: boolean };
        };
        expect(third.data.total_in_cents).toBe(second.data.total_in_cents);
        expect(third.data.fingerprint).toBe(second.data.fingerprint);
        expect(third.data.cached).toBe(true);
    });

    it('5. لا مصدر مالي موازٍ: صف ضخم في platform_financial_logs لا يغيّر الأرقام', async () => {
        await seedLedger(db);
        await db.prepare(
            `INSERT INTO platform_financial_logs (entry_type, amount, period_date, public_description)
             VALUES ('ad_revenue', 999999.99, '2026-09-21', 'parallel-table decoy')`
        ).run();
        const res = await app.request('/api/transparency/summary', { method: 'GET' }, env(db));
        expect(res.status).toBe(200);
        const body = (await res.json()) as {
            success: boolean;
            data: { total_in_cents: number; total_out_cents: number; platform_share_cents: number };
        };
        expect(body.data.total_in_cents).toBe(EXPECTED_IN);
        expect(body.data.total_out_cents).toBe(EXPECTED_OUT);
        expect(body.data.platform_share_cents).toBe(EXPECTED_PLATFORM);
    });

    it('6. مفاتيح i18n الأربعة موجودة في ar/en وغير منسوخة', async () => {
        const { ar } = await import('../../src/i18n/ar');
        const { en } = await import('../../src/i18n/en');
        for (const k of ['total_in', 'total_out', 'platform_share', 'verified_at'] as const) {
            const arv = (ar as Record<string, Record<string, unknown>>).transparency?.[k];
            const env_ = (en as Record<string, Record<string, unknown>>).transparency?.[k];
            expect(arv, `ar transparency.${k}`).toBeTruthy();
            expect(env_, `en transparency.${k}`).toBeTruthy();
            expect(typeof arv).toBe('string');
            expect(typeof env_).toBe('string');
            expect(arv).not.toBe(env_);
        }
    });

    it('7. regression: الملخص لا يكتب في ledger والثابت يبقى صفراً', async () => {
        await seedLedger(db);
        const countBefore = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        await app.request('/api/transparency/summary', { method: 'GET' }, env(db));
        await app.request('/api/transparency/verify', { method: 'GET' }, env(db));
        const countAfter = (await db.prepare('SELECT COUNT(*) AS c FROM ledger_entries').first<{ c: number }>())?.c ?? 0;
        expect(countAfter).toBe(countBefore);
        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
        expect(await ledger.balance('platform:revenue')).toBe(EXPECTED_PLATFORM);
    });
});
