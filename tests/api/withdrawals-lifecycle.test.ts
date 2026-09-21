import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerService } from '../../src/lib/services/LedgerService';
import { t } from '../../src/i18n';

/**
 * 8.D — دورة حياة السحوبات (RED-FIRST).
 *
 * الدورة المطلوبة: requested → approved → paid | rejected
 * - الحجز لحظة الطلب عبر LedgerService فقط (لا رصيد مباشر).
 * - الانتقالات محروسة في SQL (UPDATE مشروط + changes===1).
 * - الموافقة/Dفع/الرفض بأدمن (M6) ومسجلة في admin_audit_log.
 *
 * الاختبارات على مستوى المسار عبر تطبيق Hono الحقيقي (إثبات رموز HTTP الفعلية).
 */

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function authed(token: string | undefined, method = 'GET', body?: unknown) {
    const h: Record<string, string> = { 'X-CSRF-Token': 'withdrawal-lifecycle-test' };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) {
        h['Content-Type'] = 'application/json';
        return { method, headers: h, body: JSON.stringify(body) };
    }
    return { method, headers: h };
}

async function seedActors(db: SqliteD1): Promise<{ userToken: string; adminToken: string }> {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active)
         VALUES (1, 'w@t.local', 'w_user', 'x', 'W', 0, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active)
         VALUES (2, 'a@t.local', 'w_admin', 'x', 'A', 1, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-w-user', 1, datetime('now', '+1 day'))`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES ('sess-w-admin', 2, datetime('now', '+1 day'))`
    ).run();
    return { userToken: 'sess-w-user', adminToken: 'sess-w-admin' };
}

/** تمويل رصيد المستخدم في ledger (محاكاة أرباح مستحقة — $100 = 10000 سنت). */
async function fundUser(db: SqliteD1, userId: number, cents: number, tag: string): Promise<void> {
    const ledger = new LedgerService(db as unknown as D1Database);
    const r = await ledger.post({
        txId: `test:fund:${tag}`,
        createdBy: 'system:test',
        ref: { ref_type: 'test', ref_id: null },
        entries: [
            { account: `user:${userId}`, direction: 'debit', amountCents: cents },
            { account: 'reserve:payouts', direction: 'credit', amountCents: cents },
        ],
    });
    expect(r.applied).toBe(true);
}

async function requestWithdrawal(db: SqliteD1, token: string, amount: number) {
    return app.request('/api/withdrawals', authed(token, 'POST', {
        amount,
        payment_method: 'bank',
        payment_details: 'IBAN-TEST-8D',
    }), env(db));
}

async function adminApprove(db: SqliteD1, token: string | undefined, id: number, txn = 'TXN-8D-1') {
    return app.request(`/api/admin/withdrawals/${id}/approve`, authed(token, 'PUT', {
        transaction_id: txn,
        note: 'paid via bank transfer',
    }), env(db));
}

async function adminReject(db: SqliteD1, token: string | undefined, id: number) {
    return app.request(`/api/admin/withdrawals/${id}/reject`, authed(token, 'PUT', {
        reason: 'suspicious activity',
    }), env(db));
}

async function auditActions(db: SqliteD1, requestId: number): Promise<string[]> {
    const res = await db.prepare(
        `SELECT action_type FROM admin_audit_logs
         WHERE target_entity = 'withdrawal_request' AND target_id = ?
         ORDER BY id`
    ).bind(requestId).all<{ action_type: string }>();
    return (res.results ?? []).map((r) => r.action_type);
}

describe('8.D withdrawals lifecycle (RED-FIRST) — route-level via real Hono app', () => {
    let db: SqliteD1;

    beforeEach(() => {
        db = new SqliteD1();
    });

    it('1. withdraw more than balance ⇒ rejected (422 + insufficient_balance), no hold, invariant 0', async () => {
        const { userToken } = await seedActors(db);
        await fundUser(db, 1, 10_000, 'over');

        const res = await requestWithdrawal(db, userToken, 150);
        expect(res.status).toBe(422);
        const body = (await res.json()) as { success: boolean; error: string };
        expect(body.success).toBe(false);
        expect(body.error).toBe(t('withdrawals.insufficient_balance', 'en'));

        // الطلب مرفوض (لا صف requested معلّق بلا حجز) ولا أثر مالي.
        const row = await db.prepare(
            `SELECT status FROM withdrawal_requests WHERE user_id = 1 ORDER BY id DESC LIMIT 1`
        ).first<{ status: string }>();
        expect(row?.status).toBe('rejected');
        const holds = (await db.prepare(
            `SELECT COUNT(*) AS c FROM ledger_entries WHERE tx_id LIKE 'withdrawal:hold:%'`
        ).first<{ c: number }>())?.c ?? -1;
        expect(holds).toBe(0);

        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
        expect(await ledger.balance('user:1')).toBe(10_000);
    });

    it('2. two concurrent full-balance withdrawals ⇒ exactly one succeeds', async () => {
        const { userToken } = await seedActors(db);
        await fundUser(db, 1, 10_000, 'race');

        const [r1, r2] = await Promise.all([
            requestWithdrawal(db, userToken, 100),
            requestWithdrawal(db, userToken, 100),
        ]);
        const statuses = [r1.status, r2.status].sort();
        expect(statuses).toEqual([201, 422]);

        // طلب واحد فقط بحالة requested (حجز واحد ناجح).
        const requested = (await db.prepare(
            `SELECT COUNT(*) AS c FROM withdrawal_requests WHERE user_id = 1 AND status = 'requested'`
        ).first<{ c: number }>())?.c ?? -1;
        expect(requested).toBe(1);

        // حجز واحد فقط: قيدان (debit + credit) — لا سحب مزدوج.
        const holds = (await db.prepare(
            `SELECT COUNT(*) AS c FROM ledger_entries WHERE tx_id LIKE 'withdrawal:hold:%'`
        ).first<{ c: number }>())?.c ?? -1;
        expect(holds).toBe(2);

        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:1')).toBe(0);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('3. approve without admin permission ⇒ 403', async () => {
        const { userToken } = await seedActors(db);
        await fundUser(db, 1, 10_000, 'authz');
        const created = await requestWithdrawal(db, userToken, 60);
        expect(created.status).toBe(201);
        const { request } = ((await created.json()) as { data: { request: { id: number } } }).data;

        const res = await adminApprove(db, userToken, request.id);
        expect(res.status).toBe(403);

        // الحالة لم تتغير — ما زالت requested والحجز قائم.
        const row = await db.prepare(`SELECT status FROM withdrawal_requests WHERE id = ?`)
            .bind(request.id).first<{ status: string }>();
        expect(row?.status).toBe('requested');
        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:1')).toBe(10_000 - 6_000);
    });

    it('4. approve twice ⇒ single payment only (second is 409, one hold posting)', async () => {
        const { userToken, adminToken } = await seedActors(db);
        await fundUser(db, 1, 10_000, 'double');
        const created = await requestWithdrawal(db, userToken, 60);
        expect(created.status).toBe(201);
        const { request } = ((await created.json()) as { data: { request: { id: number } } }).data;

        const first = await adminApprove(db, adminToken, request.id);
        expect(first.status).toBe(200);
        const firstBody = ((await first.json()) as { data: { request: { status: string } } }).data;
        expect(firstBody.request.status).toBe('paid');

        const second = await adminApprove(db, adminToken, request.id);
        expect(second.status).toBe(409);

        // دفع واحد فقط: حجز واحد (قيدان) ولا قيود مالية مكررة.
        const holds = (await db.prepare(
            `SELECT COUNT(*) AS c FROM ledger_entries WHERE tx_id = ?`
        ).bind(`withdrawal:hold:${request.id}`).first<{ c: number }>())?.c ?? -1;
        expect(holds).toBe(2);
        const total = (await db.prepare(`SELECT COUNT(*) AS c FROM ledger_entries`)
            .first<{ c: number }>())?.c ?? -1;
        // التمويل (2) + الحجز (2) — لا شيء غيرهما.
        expect(total).toBe(4);

        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('5. reject ⇒ full balance restored and verifyInvariant() = 0', async () => {
        const { userToken, adminToken } = await seedActors(db);
        await fundUser(db, 1, 10_000, 'reject');
        const created = await requestWithdrawal(db, userToken, 60);
        expect(created.status).toBe(201);
        const { request } = ((await created.json()) as { data: { request: { id: number } } }).data;

        const ledger = new LedgerService(db as unknown as D1Database);
        expect(await ledger.balance('user:1')).toBe(4_000);

        const res = await adminReject(db, adminToken, request.id);
        expect(res.status).toBe(200);

        // الرصيد يعود كاملاً والثابت صفر.
        expect(await ledger.balance('user:1')).toBe(10_000);
        expect((await ledger.verifyInvariant()).difference).toBe(0);

        // قيد التحرير العكسي موجود (debit للمستخدم + credit للمنصة).
        const release = (await db.prepare(
            `SELECT COUNT(*) AS c FROM ledger_entries WHERE tx_id = ?`
        ).bind(`withdrawal:release:${request.id}`).first<{ c: number }>())?.c ?? -1;
        expect(release).toBe(2);
    });

    it('6. every lifecycle transition is recorded in admin_audit_log', async () => {
        const { userToken, adminToken } = await seedActors(db);
        await fundUser(db, 1, 20_000, 'audit');

        // المسار السعيد: requested → approved → paid
        const created = await requestWithdrawal(db, userToken, 60);
        const { request: paid } = ((await created.json()) as { data: { request: { id: number } } }).data;
        expect((await adminApprove(db, adminToken, paid.id)).status).toBe(200);
        expect(await auditActions(db, paid.id)).toEqual([
            'request_withdrawal',
            'approve_withdrawal',
            'pay_withdrawal',
        ]);

        // مسار الرفض: requested → rejected
        const created2 = await requestWithdrawal(db, userToken, 70);
        const { request: rej } = ((await created2.json()) as { data: { request: { id: number } } }).data;
        expect((await adminReject(db, adminToken, rej.id)).status).toBe(200);
        expect(await auditActions(db, rej.id)).toEqual([
            'request_withdrawal',
            'reject_withdrawal',
        ]);

        const ledger = new LedgerService(db as unknown as D1Database);
        expect((await ledger.verifyInvariant()).difference).toBe(0);
    });

    it('i18n withdrawals keys exist in ar + en and differ', async () => {
        const { ar } = await import('../../src/i18n/ar');
        const { en } = await import('../../src/i18n/en');
        for (const k of ['requested', 'approved', 'rejected', 'min_amount', 'insufficient_balance'] as const) {
            const a = (ar as Record<string, Record<string, string>>).withdrawals?.[k];
            const e = (en as Record<string, Record<string, string>>).withdrawals?.[k];
            expect(a, `ar.withdrawals.${k}`).toBeTruthy();
            expect(e, `en.withdrawals.${k}`).toBeTruthy();
            expect(a, `ar/en differ for ${k}`).not.toBe(e);
        }
    });
});
