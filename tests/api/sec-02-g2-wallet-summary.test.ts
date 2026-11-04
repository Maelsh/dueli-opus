import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerService } from '../../src/lib/services/LedgerService';
import { WithdrawalRequestModel, type WalletSummary } from '../../src/models/WithdrawalRequestModel';

/**
 * SEC-02-G2 — on_hold/withdrawn مشتقان من ledger_entries حصراً.
 *
 * الحالات الثلاث الملزمة: requested (حجز نشط) → rejected (تحرير كامل)
 * → paid (خصم نهائي مرة واحدة). ولا قراءة من user_earnings الميتة.
 * كل القيم بالسنت، وtotal = available + pending + on_hold + withdrawn.
 */

function d1(db: SqliteD1): D1Database {
    return db as unknown as D1Database;
}

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function authed(token: string) {
    return { headers: { Authorization: `Bearer ${token}`, 'X-CSRF-Token': 'sec02-g2' } };
}

async function seed(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active)
         VALUES (1, 'g2@t.local', 'g2_user', 'x', 'G2', 0, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active)
         VALUES (2, 'g2a@t.local', 'g2_admin', 'x', 'G2A', 1, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-g2', 1, datetime('now', '+1 day'))`
    ).run();

    const ledger = new LedgerService(d1(db));
    await ledger.post({
        txId: 'test:g2:fund',
        createdBy: 'system:test',
        ref: { ref_type: 'test', ref_id: null },
        entries: [
            { account: 'user:1', direction: 'debit', amountCents: 10_000 },
            { account: 'reserve:payouts', direction: 'credit', amountCents: 10_000 },
        ],
    });
}

async function request(db: SqliteD1, cents: number): Promise<number> {
    const model = new WithdrawalRequestModel(d1(db));
    const result = await model.requestWithdrawal({
        user_id: 1,
        amount: cents / 100,
        payment_method: 'bank',
        payment_details: 'IBAN-G2',
    });
    if (!('request' in result)) throw new Error(`request failed: ${result.error}`);
    return result.request.id;
}

function expectIdentity(w: WalletSummary): void {
    expect(w.pending).toBe(0);
    expect(w.total).toBe(w.available + w.pending + w.on_hold + w.withdrawn);
}

describe('SEC-02-G2 — wallet summary derives on_hold/withdrawn from the ledger', () => {
    let db: SqliteD1;

    beforeEach(async () => {
        db = new SqliteD1();
        await seed(db);
    });

    it('1. stale user_earnings values are ignored entirely', async () => {
        await db.prepare(
            `INSERT INTO user_earnings (user_id, available, pending, on_hold, withdrawn, total)
             VALUES (1, 123, 456, 789, 321, 1600)`
        ).run();

        const w = await new WithdrawalRequestModel(d1(db)).getWalletSummary(1);
        expect(w).toEqual({
            available: 10_000,
            pending: 0,
            on_hold: 0,
            withdrawn: 0,
            total: 10_000,
        });
        expectIdentity(w);
    });

    it('2. requested ⇒ on_hold reflects the live hold; approved keeps it held', async () => {
        const id = await request(db, 6000);
        const model = new WithdrawalRequestModel(d1(db));

        const requested = await model.getWalletSummary(1);
        expect(requested.available).toBe(4_000);
        expect(requested.on_hold).toBe(6_000);
        expect(requested.withdrawn).toBe(0);
        expectIdentity(requested);

        await db.prepare(`UPDATE withdrawal_requests SET status = 'approved' WHERE id = ?`).bind(id).run();
        const approved = await model.getWalletSummary(1);
        expect(approved.available).toBe(4_000);
        expect(approved.on_hold).toBe(6_000);
        expect(approved.withdrawn).toBe(0);
        expectIdentity(approved);
    });

    it('3. rejected ⇒ on_hold returns to zero and the balance is restored', async () => {
        const id = await request(db, 6000);
        const model = new WithdrawalRequestModel(d1(db));

        const rejected = await model.reject(id, 2, 'g2 reject');
        expect(rejected?.status).toBe('rejected');

        const w = await model.getWalletSummary(1);
        expect(w).toEqual({
            available: 10_000,
            pending: 0,
            on_hold: 0,
            withdrawn: 0,
            total: 10_000,
        });
        expectIdentity(w);
    });

    it('4. paid ⇒ withdrawn increases exactly once and on_hold drops to zero', async () => {
        const id = await request(db, 6000);
        const model = new WithdrawalRequestModel(d1(db));

        const paid = await model.approve(id, 2, 'TXN-G2');
        expect(paid?.status).toBe('paid');

        const first = await model.getWalletSummary(1);
        expect(first.available).toBe(4_000);
        expect(first.on_hold).toBe(0);
        expect(first.withdrawn).toBe(6_000);
        expectIdentity(first);

        // إعادة الموافقة ⇒ 409/لا تغيير، والملخص لا يتضاعف.
        expect(await model.approve(id, 2, 'TXN-G2')).toBeNull();
        const second = await model.getWalletSummary(1);
        expect(second).toEqual(first);
    });

    it('5. rejected before the release posts still shows the money as on_hold (honest crash state)', async () => {
        const id = await request(db, 6000);
        const model = new WithdrawalRequestModel(d1(db));

        // نافذة انهيار: الحالة rejected لكن قيد التحرير لم يُكتب بعد.
        await db.prepare(`UPDATE withdrawal_requests SET status = 'rejected' WHERE id = ?`).bind(id).run();

        const crashed = await model.getWalletSummary(1);
        expect(crashed.available).toBe(4_000);
        expect(crashed.on_hold).toBe(6_000);
        expect(crashed.withdrawn).toBe(0);
        expectIdentity(crashed);

        // مسار الاستشفاء يعيد التحرير ثم يصبح الصافي صفراً.
        const recovered = await model.reject(id, 2, 'recovery');
        expect(recovered?.status).toBe('rejected');
        const healed = await model.getWalletSummary(1);
        expect(healed.available).toBe(10_000);
        expect(healed.on_hold).toBe(0);
        expectIdentity(healed);
    });

    it('6. GET /api/withdrawals serves the same ledger-derived wallet (controller has no earnings SQL)', async () => {
        const id = await request(db, 6000);
        const model = new WithdrawalRequestModel(d1(db));
        await model.approve(id, 2, 'TXN-G2-ROUTE');

        const res = await app.request('/api/withdrawals', authed('sess-g2'), env(db));
        expect(res.status).toBe(200);
        const body = (await res.json()) as { data: { wallet: WalletSummary } };
        expect(body.data.wallet).toEqual(await model.getWalletSummary(1));
        expectIdentity(body.data.wallet);
    });
});
