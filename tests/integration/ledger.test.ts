import { beforeAll, describe, expect, it } from 'vitest';
import {
    applyMigrationsViaWrangler,
    execD1,
    queryD1,
    type D1ResultRow,
} from './helpers/wrangler-d1-runner.mjs';

/**
 * 8.A — اختبار تكاملي لدفتر الأستاذ على D1 حقيقية محلية.
 *
 * الـ migrations تُطبَّق من قاعدة فارغة عبر Wrangler CLI كما هي، ثم تُفحص
 * قيود المخطط (CHECK / UNIQUE / append-only triggers / لا REAL) على محرك
 * القاعدة الفعلي — لا mocks ولا تحليل SQL يدوي.
 *
 * ثابت محاسبي (M1): كل إدراج هنا قيدان متوازنان، وΣ(debit) − Σ(credit) = 0.
 */

let tables: string[] = [];
let ledgerDdl = '';
let triggers: string[] = [];
let columns: Array<{ name: string; type: string }> = [];

beforeAll(() => {
    applyMigrationsViaWrangler();

    const master = queryD1(
        `SELECT name, type, sql FROM sqlite_master
         WHERE tbl_name = 'ledger_entries' ORDER BY type, name`
    ) as Array<{ name: string; type: string; sql: string | null }>;

    tables = master.map((r) => r.name);
    ledgerDdl = master.find((r) => r.type === 'table')?.sql ?? '';
    triggers = master.filter((r) => r.type === 'trigger').map((r) => r.name);

    const info = queryD1('PRAGMA table_info(ledger_entries)') as Array<Record<string, unknown>>;
    columns = info.map((r) => ({ name: String(r.name), type: String(r.type) }));
});

describe('ledger_entries schema — real D1 via Wrangler CLI (8.A)', () => {
    it('ledger_entries table exists (0019_ledger_entries.sql)', () => {
        expect(tables).toContain('ledger_entries');
    });

    it('has the exact required columns', () => {
        const names = columns.map((c) => c.name);
        for (const col of [
            'id', 'tx_id', 'account', 'direction', 'amount_cents',
            'currency', 'ref_type', 'ref_id', 'created_at', 'created_by',
        ]) {
            expect(names, `missing column ledger_entries.${col}`).toContain(col);
        }
    });

    it('money columns are INTEGER — no REAL/FLOAT anywhere in the DDL', () => {
        expect(ledgerDdl.toLowerCase()).not.toContain('real');
        expect(ledgerDdl.toLowerCase()).not.toContain('float');
        const amountCol = columns.find((c) => c.name === 'amount_cents');
        expect(amountCol?.type.toLowerCase()).toBe('integer');
    });

    it('declares UNIQUE(tx_id, account) for idempotency (M4)', () => {
        expect(ledgerDdl).toContain('UNIQUE');
        expect(ledgerDdl).toContain('tx_id');
        expect(ledgerDdl).toContain('account');
    });

    it('append-only triggers exist (M5)', () => {
        expect(triggers).toContain('trg_ledger_entries_append_only_update');
        expect(triggers).toContain('trg_ledger_entries_append_only_delete');
    });

    it('CHECK constraints on direction and amount_cents exist (M3)', () => {
        expect(ledgerDdl).toContain("direction IN ('debit', 'credit')");
        expect(ledgerDdl).toContain('amount_cents > 0');
    });

    it('audit columns are NOT NULL (M5): created_by', () => {
        // sqlite_master يحفظ المسافات الأصلية — نطبّعها قبل المطابقة.
        expect(ledgerDdl.replace(/\s+/g, ' ')).toContain('created_by TEXT NOT NULL');
    });
});

describe('ledger_entries constraints enforced by the engine — real D1 (8.A)', () => {
    const insertPair = (txId: string, amount: number) => {
        execD1(
            `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
             VALUES ('${txId}', 'user:501', 'debit', ${amount}, 'USD', 'test', NULL, 'system:test')`
        );
        execD1(
            `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
             VALUES ('${txId}', 'platform:revenue', 'credit', ${amount}, 'USD', 'test', NULL, 'system:test')`
        );
    };

    it('balanced pair inserts fine and the system invariant holds (M1)', () => {
        insertPair('itx-1', 12_34);
        const rows = queryD1(
            `SELECT
                 COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0) AS diff,
                 COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE 0 END), 0) AS debit,
                 COALESCE(SUM(CASE WHEN direction = 'credit' THEN amount_cents ELSE 0 END), 0) AS credit
             FROM ledger_entries`
        ) as Array<{ diff: number; debit: number; credit: number }>;
        expect(rows[0].diff).toBe(0);
        expect(rows[0].debit).toBe(rows[0].credit);
    });

    it('duplicate (tx_id, account) ⇒ rejected by UNIQUE (M4)', () => {
        insertPair('itx-idem', 5_00);
        expect(() =>
            execD1(
                `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                 VALUES ('itx-idem', 'user:501', 'debit', 5_00, 'USD', 'test', NULL, 'system:test')`
            )
        ).toThrow();
    });

    it('zero / negative amount and bad direction ⇒ rejected by CHECK (M3)', () => {
        expect(() =>
            execD1(
                `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                 VALUES ('itx-zero', 'user:501', 'debit', 0, 'USD', 'test', NULL, 'system:test')`
            )
        ).toThrow();
        expect(() =>
            execD1(
                `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                 VALUES ('itx-neg', 'user:501', 'debit', -100, 'USD', 'test', NULL, 'system:test')`
            )
        ).toThrow();
        expect(() =>
            execD1(
                `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
                 VALUES ('itx-dir', 'user:501', 'sideways', 100, 'USD', 'test', NULL, 'system:test')`
            )
        ).toThrow();
    });

    it('UPDATE on a ledger entry ⇒ rejected by trigger (M5)', () => {
        expect(() =>
            execD1(`UPDATE ledger_entries SET amount_cents = 1 WHERE tx_id = 'itx-1'`)
        ).toThrow(/append-only: UPDATE denied/);
    });

    it('DELETE on a ledger entry ⇒ rejected by trigger (M5)', () => {
        expect(() =>
            execD1(`DELETE FROM ledger_entries WHERE tx_id = 'itx-1'`)
        ).toThrow(/append-only: DELETE denied/);
    });

    it('SQL balance guard: conditional withdraw beyond balance inserts nothing (M3)', () => {
        // مستخدم user:602 بلا رصيد — السحب الشرطي (نفس نمط LedgerService)
        // يجب ألا يُدرج أي صف، ولا يفسد الثابت.
        execD1(
            `INSERT INTO ledger_entries (tx_id, account, direction, amount_cents, currency, ref_type, ref_id, created_by)
             SELECT 'itx-guard', 'platform:withdrawals', 'debit', 99_00, 'USD', 'test', NULL, 'system:test'
             WHERE (
                 SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0)
                 FROM ledger_entries WHERE account = 'user:602'
             ) >= 99_00`
        );
        const rows = queryD1(`SELECT COUNT(*) AS n FROM ledger_entries WHERE tx_id = 'itx-guard'`) as Array<{ n: number }>;
        expect(rows[0].n).toBe(0);
    });

    it('invariant still zero after all constraint attempts', () => {
        const rows = queryD1(
            `SELECT COALESCE(SUM(CASE WHEN direction = 'debit' THEN amount_cents ELSE -amount_cents END), 0) AS diff
             FROM ledger_entries`
        ) as Array<{ diff: number }>;
        expect(rows[0].diff).toBe(0);
    });

    it('PRAGMA foreign_key_check returns an empty array', () => {
        const rows = queryD1('PRAGMA foreign_key_check') as D1ResultRow[];
        expect(rows).toEqual([]);
    });
});

