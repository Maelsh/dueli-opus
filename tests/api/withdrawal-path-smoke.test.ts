import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerService } from '../../src/lib/services/LedgerService';
import { t } from '../../src/i18n';

/**
 * SEC-02 — withdrawal-path smoke (اختبار بيئة فقط، لا إنتاج ولا مال حقيقي).
 *
 * المسار الكامل عبر Hono الحقيقي:
 *   طلب ⇒ حجز صحيح في المحفظة ⇒ رفض يعيد كل المال
 *   طلب ثانٍ ⇒ موافقة ⇒ paid مرة واحدة (idempotency) ⇒ المحفظة صحيحة
 *   تجاوز الرصيد ⇒ 422 بلا أثر مالي.
 * أي فشل هنا عيب يوقف التسليم.
 */

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function authed(token: string, method = 'GET', body?: unknown) {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'X-CSRF-Token': 'sec02-smoke',
    };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        return { method, headers, body: JSON.stringify(body) };
    }
    return { method, headers };
}

const USER = 'sess-smoke-user';
const ADMIN = 'sess-smoke-admin';

interface Wallet {
    available: number;
    pending: number;
    on_hold: number;
    withdrawn: number;
    total: number;
}

async function seed(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active)
         VALUES (1, 'smoke@t.local', 'smoke_user', 'x', 'S', 0, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active)
         VALUES (2, 'smokea@t.local', 'smoke_admin', 'x', 'SA', 1, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, 1, datetime('now', '+1 day'))`
    ).bind(USER).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, 2, datetime('now', '+1 day'))`
    ).bind(ADMIN).run();

    await new LedgerService(db as unknown as D1Database).post({
        txId: 'test:smoke:fund',
        createdBy: 'system:test',
        ref: { ref_type: 'test', ref_id: null },
        entries: [
            { account: 'user:1', direction: 'debit', amountCents: 10_000 },
            { account: 'reserve:payouts', direction: 'credit', amountCents: 10_000 },
        ],
    });
}

async function wallet(db: SqliteD1): Promise<Wallet> {
    const res = await app.request('/api/withdrawals', authed(USER), env(db));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { wallet: Wallet } };
    return body.data.wallet;
}

async function create(db: SqliteD1, amount: number) {
    return app.request('/api/withdrawals', authed(USER, 'POST', {
        amount,
        payment_method: 'bank',
        payment_details: 'IBAN-SMOKE',
    }), env(db));
}

describe('SEC-02 smoke — withdrawal path end-to-end (Vitest only)', () => {
    let db: SqliteD1;
    let ledger: LedgerService;

    beforeEach(async () => {
        db = new SqliteD1();
        ledger = new LedgerService(db as unknown as D1Database);
        await seed(db);
    });

    it('request → hold → reject/refund → approve/paid once → over-balance refused', async () => {
        // 1) طلب أول: الحجز والمحفظة المعلّقة صحيحان.
        const first = await create(db, 60);
        expect(first.status).toBe(201);
        const firstBody = (await first.json()) as { data: { request: { id: number; status: string; hold_tx_id: string | null } } };
        const firstReq = firstBody.data.request;
        expect(firstReq.status).toBe('requested');
        expect(firstReq.hold_tx_id).toBe(`withdrawal:hold:${firstReq.id}`);
        expect(await wallet(db)).toEqual({
            available: 4_000,
            pending: 0,
            on_hold: 6_000,
            withdrawn: 0,
            total: 10_000,
        });

        // 2) رفض: عودة كاملة للرصيد.
        const rejected = await app.request(`/api/admin/withdrawals/${firstReq.id}/reject`, authed(ADMIN, 'PUT', {
            reason: 'smoke reject',
        }), env(db));
        expect(rejected.status).toBe(200);
        expect(await wallet(db)).toEqual({
            available: 10_000,
            pending: 0,
            on_hold: 0,
            withdrawn: 0,
            total: 10_000,
        });

        // 3) طلب ثانٍ ثم موافقة: paid مرة واحدة فقط.
        const second = await create(db, 60);
        expect(second.status).toBe(201);
        const secondReq = ((await second.json()) as { data: { request: { id: number } } }).data.request;

        const paid = await app.request(`/api/admin/withdrawals/${secondReq.id}/approve`, authed(ADMIN, 'PUT', {
            transaction_id: 'TXN-SMOKE-1',
            note: 'smoke pay',
        }), env(db));
        expect(paid.status).toBe(200);

        const afterPay = await wallet(db);
        expect(afterPay).toEqual({
            available: 4_000,
            pending: 0,
            on_hold: 0,
            withdrawn: 6_000,
            total: 10_000,
        });

        const duplicate = await app.request(`/api/admin/withdrawals/${secondReq.id}/approve`, authed(ADMIN, 'PUT', {
            transaction_id: 'TXN-SMOKE-2',
            note: 'smoke pay twice',
        }), env(db));
        expect(duplicate.status).toBe(409);
        expect(await wallet(db)).toEqual(afterPay);

        const paidEntries = await db.prepare(
            `SELECT COUNT(*) AS c FROM ledger_entries WHERE tx_id = ?`
        ).bind(`withdrawal:hold:${secondReq.id}`).first<{ c: number }>();
        expect(paidEntries?.c).toBe(2);

        // 4) تجاوز الرصيد: 422 بلا حجز ولا تغيير في المحفظة.
        const over = await create(db, 150);
        expect(over.status).toBe(422);
        const overBody = (await over.json()) as { success: boolean; error: string };
        expect(overBody.success).toBe(false);
        expect(overBody.error).toBe(t('withdrawals.insufficient_balance', 'en'));

        expect(await wallet(db)).toEqual(afterPay);
        const overRow = await db.prepare(
            `SELECT id, status FROM withdrawal_requests WHERE user_id = 1 ORDER BY id DESC LIMIT 1`
        ).first<{ id: number; status: string }>();
        expect(overRow?.status).toBe('rejected');
        const overHolds = await db.prepare(
            `SELECT COUNT(*) AS c FROM ledger_entries WHERE tx_id = ?`
        ).bind(`withdrawal:hold:${overRow!.id}`).first<{ c: number }>();
        expect(overHolds?.c).toBe(0);

        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });
});
