import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerService } from '../../src/lib/services/LedgerService';
import { WithdrawalRequestModel } from '../../src/models/WithdrawalRequestModel';

/**
 * SEC-02-G3 — نوافذ انهيار السحب المالية (fail-closed).
 *
 * نافذة أ: صف requested أُنشئ ثم انهار الطلب قبل كتابة قيد الحجز ⇒
 *   approve يجب أن يفشل (409) بلا دفع وبلا أثر مالي، لكن reject/cancel
 *   يجب أن يغلقا الصف بأمان.
 * نافذة ب: قيد الحجز كُتب ثم انهار الطلب قبل حفظ hold_tx_id ⇒
 *   releaseHold يجب أن يشتق الحجز من الدفتر ويعيد المبلغ كاملاً مرة واحدة
 *   (idempotent)، لا أن يعود مبكراً ويترك المال محجوزاً للأبد.
 */

function d1(db: SqliteD1): D1Database {
    return db as unknown as D1Database;
}

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function authed(token: string, method = 'GET', body?: unknown) {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${token}`,
        'X-CSRF-Token': 'sec02-g3',
    };
    if (body !== undefined) {
        headers['Content-Type'] = 'application/json';
        return { method, headers, body: JSON.stringify(body) };
    }
    return { method, headers };
}

const USER = 'sess-g3-user';
const ADMIN = 'sess-g3-admin';

async function seed(db: SqliteD1): Promise<void> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active)
         VALUES (1, 'g3@t.local', 'g3_user', 'x', 'G3', 0, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active)
         VALUES (2, 'g3a@t.local', 'g3_admin', 'x', 'G3A', 1, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, 1, datetime('now', '+1 day'))`
    ).bind(USER).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES (?, 2, datetime('now', '+1 day'))`
    ).bind(ADMIN).run();

    await new LedgerService(d1(db)).post({
        txId: 'test:g3:fund',
        createdBy: 'system:test',
        ref: { ref_type: 'test', ref_id: null },
        entries: [
            { account: 'user:1', direction: 'debit', amountCents: 10_000 },
            { account: 'reserve:payouts', direction: 'credit', amountCents: 10_000 },
        ],
    });
}

/** صف requested خام يحاكي انهيار ما قبل الحجز (hold_tx_id = NULL). */
async function insertRequested(db: SqliteD1, cents: number, feeCents = 0): Promise<number> {
    const res = await db.prepare(
        `INSERT INTO withdrawal_requests
             (user_id, amount, amount_cents, fee_cents, status, payment_method,
              payment_details, hold_tx_id, created_at)
         VALUES (1, ?, ?, ?, 'requested', 'bank', 'IBAN-G3', NULL, datetime('now'))`
    ).bind(cents / 100, cents, feeCents).run();
    return res.meta.last_row_id as number;
}

/** يحاكي نافذة ب: قيد الحجز مكتوب في الدفتر بينما العمود hold_tx_id بقي NULL. */
async function postHoldButLeaveColumnNull(db: SqliteD1, id: number, cents: number): Promise<void> {
    await new LedgerService(d1(db)).withdraw({
        userId: 1,
        amountCents: cents,
        txId: `withdrawal:hold:${id}`,
        createdBy: 'user:1',
        ref: { ref_type: 'withdrawal_request', ref_id: id },
    });
}

async function row(db: SqliteD1, id: number) {
    return db.prepare(`SELECT * FROM withdrawal_requests WHERE id = ?`).bind(id)
        .first<{ status: string; transaction_id: string | null; approved_by: number | null; hold_tx_id: string | null }>();
}

async function txEntries(db: SqliteD1, txId: string) {
    const res = await db.prepare(
        `SELECT account, direction, amount_cents FROM ledger_entries WHERE tx_id = ? ORDER BY id`
    ).bind(txId).all<{ account: string; direction: string; amount_cents: number }>();
    return res.results ?? [];
}

async function auditActions(db: SqliteD1, id: number): Promise<string[]> {
    const res = await db.prepare(
        `SELECT action_type FROM admin_audit_logs
         WHERE target_entity = 'withdrawal_request' AND target_id = ? ORDER BY id`
    ).bind(id).all<{ action_type: string }>();
    return (res.results ?? []).map((r) => r.action_type);
}

function approve(db: SqliteD1, id: number, token = ADMIN, txn = 'TXN-G3') {
    return app.request(`/api/admin/withdrawals/${id}/approve`, authed(token, 'PUT', {
        transaction_id: txn,
        note: 'g3 approval',
    }), env(db));
}

function reject(db: SqliteD1, id: number, token = ADMIN) {
    return app.request(`/api/admin/withdrawals/${id}/reject`, authed(token, 'PUT', {
        reason: 'g3 reject',
    }), env(db));
}

function cancel(db: SqliteD1, id: number) {
    return app.request(`/api/withdrawals/${id}`, authed(USER, 'DELETE'), env(db));
}

describe('SEC-02-G3 — withdrawal crash windows fail closed and release idempotently', () => {
    let db: SqliteD1;
    let ledger: LedgerService;

    beforeEach(async () => {
        db = new SqliteD1();
        // UNIT41.1: open the money/ads gate (closed by default in 0045).
        await db.prepare(`UPDATE platform_settings SET setting_value = '1' WHERE setting_key = 'public_monetization_enabled'`).run();
        ledger = new LedgerService(d1(db));
        await seed(db);
    });

    it('1. window A: approve without a ledger hold ⇒ 409, status/balance unchanged, no pay audit', async () => {
        const id = await insertRequested(db, 6000);

        const res = await approve(db, id);
        expect(res.status).toBe(409);

        const after = await row(db, id);
        expect(after?.status).toBe('requested');
        expect(after?.transaction_id).toBeNull();
        expect(after?.approved_by).toBeNull();
        expect(await ledger.balance('user:1')).toBe(10_000);
        expect(await txEntries(db, `withdrawal:hold:${id}`)).toEqual([]);
        expect(await auditActions(db, id)).toEqual([]);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('2. window A: reject without a hold closes the row safely and forever', async () => {
        const id = await insertRequested(db, 6000);

        const res = await reject(db, id);
        expect(res.status).toBe(200);
        expect((await row(db, id))?.status).toBe('rejected');

        expect(await ledger.balance('user:1')).toBe(10_000);
        expect(await txEntries(db, `withdrawal:release:${id}`)).toEqual([]);
        expect((await ledger.verifyInvariant()).difference).toBe(0);

        // لا يمكن دفع صف مرفوض بأي حال.
        expect((await approve(db, id)).status).toBe(409);
        expect(await auditActions(db, id)).toEqual(['reject_withdrawal']);
    });

    it('3. window A: user cancel without a hold is safe and moves no money', async () => {
        const id = await insertRequested(db, 6000);

        const res = await cancel(db, id);
        expect(res.status).toBe(200);
        expect((await res.json()) as { data: { cancelled: boolean } }).toEqual({
            success: true,
            data: { cancelled: true },
        });
        expect((await row(db, id))?.status).toBe('rejected');
        expect(await ledger.balance('user:1')).toBe(10_000);
        expect(await txEntries(db, `withdrawal:release:${id}`)).toEqual([]);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('4. window B: hold posted with hold_tx_id NULL ⇒ reject restores the full balance exactly once', async () => {
        const id = await insertRequested(db, 6000);
        await postHoldButLeaveColumnNull(db, id, 6000);
        expect((await row(db, id))?.hold_tx_id).toBeNull();
        expect(await ledger.balance('user:1')).toBe(4_000);

        const first = await reject(db, id);
        expect(first.status).toBe(200);
        expect((await row(db, id))?.status).toBe('rejected');
        expect(await ledger.balance('user:1')).toBe(10_000);

        const release = await txEntries(db, `withdrawal:release:${id}`);
        expect(release).toHaveLength(2);
        expect(release).toEqual(expect.arrayContaining([
            { account: 'user:1', direction: 'debit', amount_cents: 6000 },
            { account: 'platform:withdrawals', direction: 'credit', amount_cents: 6000 },
        ]));

        // إعادة reject (مسار الاستشفاء) ⇒ نفس tx_id ⇒ لا تحرير مزدوج.
        const second = await reject(db, id);
        expect(second.status).toBe(200);
        expect(await ledger.balance('user:1')).toBe(10_000);
        expect(await txEntries(db, `withdrawal:release:${id}`)).toHaveLength(2);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('5. window B: release uses the ledger hold amount (amount + fee), not row.amount_cents', async () => {
        const id = await insertRequested(db, 6000, 250);
        await postHoldButLeaveColumnNull(db, id, 6250);
        expect(await ledger.balance('user:1')).toBe(3_750);

        const res = await cancel(db, id);
        expect(res.status).toBe(200);
        expect(await ledger.balance('user:1')).toBe(10_000);

        const release = await txEntries(db, `withdrawal:release:${id}`);
        expect(release).toHaveLength(2);
        expect(release.reduce((sum, e) => sum + e.amount_cents, 0)).toBe(12_500);
        expect(release).toEqual(expect.arrayContaining([
            { account: 'user:1', direction: 'debit', amount_cents: 6250 },
            { account: 'platform:withdrawals', direction: 'credit', amount_cents: 6250 },
        ]));

        // إعادة الإلغاء ⇒ 400 ولا قيد ثانٍ.
        expect((await cancel(db, id)).status).toBe(400);
        expect(await txEntries(db, `withdrawal:release:${id}`)).toHaveLength(2);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('6. window B: a live ledger hold with hold_tx_id NULL is still payable', async () => {
        const id = await insertRequested(db, 6000);
        await postHoldButLeaveColumnNull(db, id, 6000);

        const res = await approve(db, id);
        expect(res.status).toBe(200);
        const after = await row(db, id);
        expect(after?.status).toBe('paid');
        expect(await ledger.balance('user:1')).toBe(4_000);

        const model = new WithdrawalRequestModel(d1(db));
        const wallet = await model.getWalletSummary(1);
        expect(wallet.available).toBe(4_000);
        expect(wallet.on_hold).toBe(0);
        expect(wallet.withdrawn).toBe(6_000);
        expect(wallet.total).toBe(10_000);
    });

    it('7. a hold that was already released can never be approved later', async () => {
        const id = await insertRequested(db, 6000);
        await postHoldButLeaveColumnNull(db, id, 6000);

        const model = new WithdrawalRequestModel(d1(db));
        expect((await model.reject(id, 2, 'release first'))?.status).toBe('rejected');
        // نافذة شاذة: إعادة الصف إلى requested يدوياً بينما قيد التحرير موجود.
        await db.prepare(
            `UPDATE withdrawal_requests
             SET status = 'requested', processed_at = NULL, approved_by = NULL, admin_note = NULL
             WHERE id = ?`
        ).bind(id).run();

        const res = await approve(db, id);
        expect(res.status).toBe(409);
        expect((await row(db, id))?.status).toBe('requested');
        expect((await row(db, id))?.transaction_id).toBeNull();
        expect(await ledger.balance('user:1')).toBe(10_000);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });
});
