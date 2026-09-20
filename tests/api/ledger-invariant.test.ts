import { beforeAll, describe, expect, it } from 'vitest';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerError, LedgerService } from '../../src/lib/services/LedgerService';

/**
 * 8.A — دفتر الأستاذ والثابت المحاسبي (M1–M5).
 *
 * يعمل على SqliteD1 الذي يحمّل migrations الحقيقية كما هي — فالقيود
 * (CHECK / UNIQUE) والمشغلات (append-only) تُنفَّذ فعلياً بمحرك SQLite،
 * لا بمحاكاة يدوية.
 */

const deposit = (svc: LedgerService, userId: number, amountCents: number, txId: string) =>
    svc.post({
        txId,
        createdBy: 'system:treasury',
        entries: [
            { account: `user:${userId}`, direction: 'debit', amountCents },
            { account: 'platform:revenue', direction: 'credit', amountCents },
        ],
    });

describe('8.A ledger invariant (M1–M5) — real SQL via SqliteD1', () => {
    let db: SqliteD1;
    let svc: LedgerService;

    beforeAll(() => {
        db = new SqliteD1();
        svc = new LedgerService(db as unknown as D1Database);
    });

    it('1. every movement writes a balanced pair ⇒ debit = credit', async () => {
        await deposit(svc, 1, 100_00, 'tx-1');
        await svc.post({
            txId: 'tx-2',
            createdBy: 'user:1',
            entries: [
                { account: 'platform:revenue', direction: 'debit', amountCents: 40_00 },
                { account: 'user:2', direction: 'credit', amountCents: 40_00 },
            ],
        });
        const inv = await svc.verifyInvariant();
        expect(inv.difference).toBe(0);
        expect(inv.totalDebitCents).toBe(inv.totalCreditCents);
    });

    it('2. verifyInvariant() = 0 after 100 random movements', async () => {
        // PRNG محلي بذرة ثابتة — نفس السلسلة كل تشغيل (لا عشوائية أمنية).
        let seed = 20260920;
        const rnd = () => {
            seed = (seed * 1103515245 + 12345) % 2147483648;
            return seed / 2147483648;
        };
        const balances = new Map<number, number>([[5, 100_00]]);
        await deposit(svc, 5, 100_00, 'tx-r-init');
        for (let i = 0; i < 100; i++) {
            const u = 5;
            const isDeposit = rnd() < 0.5 || (balances.get(u) ?? 0) < 100;
            if (isDeposit) {
                const amount = 100 + Math.floor(rnd() * 9900);
                await deposit(svc, u, amount, `tx-r-${i}`);
                balances.set(u, (balances.get(u) ?? 0) + amount);
            } else {
                // السحب لا يتجاوز الرصيد الحالي أبداً — الرصيد لا يقبل السالبية.
                const balance = balances.get(u) ?? 0;
                const amount = 100 + Math.floor(rnd() * (balance - 100));
                await svc.withdraw({
                    userId: u,
                    amountCents: amount,
                    txId: `tx-w-${i}`,
                    createdBy: `user:${u}`,
                    ref: { ref_type: 'withdrawal', ref_id: i },
                });
                balances.set(u, balance - amount);
            }
        }
        // الرصيد المُشتق من ledger يطابق المفكرة المحلية (لا رصيد في مكانين).
        for (const [u, expected] of balances) {
            expect(await svc.balance(`user:${u}`)).toBe(expected);
        }
        const inv = await svc.verifyInvariant();
        expect(inv.difference).toBe(0);
    });

    it('3. withdrawal exceeding balance ⇒ rejected (SQL guard), balance untouched', async () => {
        const before = await svc.balance('user:1');
        await expect(
            svc.withdraw({
                userId: 1,
                amountCents: before + 1,
                txId: 'tx-over',
                createdBy: 'user:1',
            })
        ).rejects.toMatchObject({ code: 'insufficient_funds' } as Partial<LedgerError>);
        expect(await svc.balance('user:1')).toBe(before);
        // لا قيود ظهرت للحركة المرفوضة — الثابت سليم.
        expect(await svc.entriesForTx('tx-over')).toHaveLength(0);
        const inv = await svc.verifyInvariant();
        expect(inv.difference).toBe(0);
    });

    it('4. same tx_id twice ⇒ one transaction, no second entry (M4)', async () => {
        const first = await deposit(svc, 4, 25_00, 'tx-idem');
        const balanceAfterFirst = await svc.balance('user:4');
        expect(first.applied).toBe(true);

        const second = await deposit(svc, 4, 25_00, 'tx-idem');
        expect(second.applied).toBe(false);
        // قيد واحد لكل طرف (صفّان: مدين ودائن) — لا تكرار.
        const rows = await svc.entriesForTx('tx-idem');
        expect(rows).toHaveLength(2);
        expect(await svc.balance('user:4')).toBe(balanceAfterFirst);
        const inv = await svc.verifyInvariant();
        expect(inv.difference).toBe(0);
    });

    it('5. 20 concurrent movements ⇒ invariant preserved, no negative balance', async () => {
        // 10 إيداعات و10 عمليات سحب متزامنة على مستخدم معزول (رصيده 100.00$).
        await deposit(svc, 7, 100_00, 'tx-c0');
        const ops: Promise<unknown>[] = [];
        for (let i = 1; i <= 10; i++) {
            ops.push(deposit(svc, 7, 1_00, `tx-cd-${i}`));
            ops.push(svc.withdraw({
                userId: 7,
                amountCents: 1_00,
                txId: `tx-cw-${i}`,
                createdBy: 'user:7',
            }));
        }
        await Promise.all(ops);
        // الرصيد = 100$ بالضبط — لا زيادة ولا نقص.
        expect(await svc.balance('user:7')).toBe(100_00);
        const inv = await svc.verifyInvariant();
        expect(inv.difference).toBe(0);
        // منع السلبية (M3): سحب يمنع الرصيد من النزول تحت الصفر مرفوض.
        await expect(
            svc.withdraw({ userId: 7, amountCents: 100_01, txId: 'tx-neg', createdBy: 'user:7' })
        ).rejects.toMatchObject({ code: 'insufficient_funds' });
    });

    it('6. UPDATE/DELETE on a ledger entry ⇒ rejected (append-only trigger, M5)', async () => {
        await deposit(svc, 9, 5_00, 'tx-append');
        await expect(
            db.prepare('UPDATE ledger_entries SET amount_cents = 1 WHERE tx_id = ?').bind('tx-append').run()
        ).rejects.toThrow(/append-only: UPDATE denied/);
        await expect(
            db.prepare('DELETE FROM ledger_entries WHERE tx_id = ?').bind('tx-append').run()
        ).rejects.toThrow(/append-only: DELETE denied/);
    });

    it('6b. entry intact after tamper attempts (M5)', async () => {
        // القيد سليم بعد محاولتي التلاعب — لم يُعدَّل ولم يُحذف.
        const rows = await svc.entriesForTx('tx-append');
        expect(rows).toHaveLength(2);
        expect(await svc.balance('user:9')).toBe(5_00);
        const inv = await svc.verifyInvariant();
        expect(inv.difference).toBe(0);
    });

    it('7. schema-level money constraints (M3/M4): CHECK amount>0 + UNIQUE(tx_id, account)', async () => {
        await deposit(svc, 10, 1_00, 'tx-schema');
        // مبلغ صفر أو سالب مرفوض بمحرك القاعدة (CHECK)، لا بفحص JS.
        await expect(
            db.prepare(
                `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                 VALUES (?, 'user:10', 'debit', 0, 'USD', NULL, NULL, 'system:test')`
            ).bind('tx-zero').run()
        ).rejects.toThrow(/constraint failed/);
        // نفس (tx_id, account) مرة ثانية مرفوض (UNIQUE) — إعادة الإرسال لا تكرر.
        await expect(
            db.prepare(
                `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                 VALUES (?, 'user:10', 'debit', 100, 'USD', NULL, NULL, 'system:test')`
            ).bind('tx-schema').run()
        ).rejects.toThrow(/constraint failed/);
    });

    it('8. i18n wallet keys exist in ar + en (wallet.balance / insufficient_funds / transaction_failed)', async () => {
        const { ar } = await import('../../src/i18n/ar');
        const { en } = await import('../../src/i18n/en');
        for (const k of ['balance', 'insufficient_funds', 'transaction_failed'] as const) {
            expect((ar as Record<string, any>).wallet?.[k]).toBeTruthy();
            expect((en as Record<string, any>).wallet?.[k]).toBeTruthy();
            expect((ar as Record<string, any>).wallet[k]).not.toBe((en as Record<string, any>).wallet[k]);
        }
    });
});
