/**
 * R2-P — saved payout methods + withdrawal snapshots (TDD on BASE-ec27f72).
 *
 * Contract under test (R2-P only; money movement stays out of scope):
 * - Method CRUD: create (bank/paypal/wise + per-type validation 422),
 *   list scoped to owner, update owned, delete owned; cross-user and
 *   anonymous access rejected (404/401); invalid type 422.
 * - Default: set/switch atomic (exactly one default); deleting the
 *   default promotes the oldest remaining (or none left).
 * - Withdrawal with owned payout_method_id snapshots method data at
 *   creation (type/details frozen); other-user or missing id is 404.
 * - Snapshot frozen: editing/deleting the method afterwards leaves the
 *   old request (snapshot + display pair) byte-identical; deleting the
 *   method NULLs only the link. Legacy free-text withdrawals keep working
 *   (including pre-existing rows through approve→paid).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import app from '../../src/main';
import { createSqliteD1, SqliteD1 } from '../helpers/sqlite-d1';
import { LedgerService } from '../../src/lib/services/LedgerService';
import type { D1Database } from '@cloudflare/workers-types';

type Env = Parameters<typeof app.request>[2];
const env = (db: SqliteD1): Env => ({ DB: db }) as unknown as Env;

function authed(token: string | undefined, method = 'GET', body?: unknown) {
    const h: Record<string, string> = { 'X-CSRF-Token': 'r2p-test' };
    if (token !== undefined) h['Authorization'] = `Bearer ${token}`;
    if (body !== undefined) {
        h['Content-Type'] = 'application/json';
        return { method, headers: h, body: JSON.stringify(body) };
    }
    return { method, headers: h };
}

async function seed(db: SqliteD1) {
    await db.prepare(
        `INSERT INTO users (id, email, username, password_hash, display_name, is_admin, is_active)
         VALUES (1, 'u1@r2p.local', 'r2p_one', 'x', 'R2P One', 0, 1),
                (2, 'u2@r2p.local', 'r2p_two', 'x', 'R2P Two', 0, 1),
                (3, 'adm@r2p.local', 'r2p_admin', 'x', 'R2P Admin', 1, 1)`
    ).run();
    await db.prepare(
        `INSERT INTO sessions (id, user_id, expires_at) VALUES
         ('sess-r2p-1', 1, datetime('now', '+1 day')),
         ('sess-r2p-2', 2, datetime('now', '+1 day')),
         ('sess-r2p-admin', 3, datetime('now', '+1 day'))`
    ).run();
}

async function fund(db: SqliteD1, userId: number, cents: number, tag: string) {
    const ledger = new LedgerService(db as unknown as D1Database);
    await ledger.post({
        txId: `test:r2p:${tag}`,
        createdBy: 'system:test',
        ref: { ref_type: 'test', ref_id: null },
        entries: [
            { account: `user:${userId}`, direction: 'debit', amountCents: cents },
            { account: 'reserve:payouts', direction: 'credit', amountCents: cents },
        ],
    });
}

async function req(db: SqliteD1, method: string, path: string, token?: string, body?: unknown) {
    const res = await app.request(`${path}?lang=en`, authed(token, method, body), env(db));
    return { status: res.status, data: await res.json() as any };
}

const BANK = { type: 'bank', bank_name: 'Test Bank', iban: 'IBAN-OLD-1', swift_code: 'SW1', account_holder: 'R2P One' };
const PAYPAL = { type: 'paypal', email: 'one@r2p.local' };

describe('R2-P saved payout methods + snapshots', () => {
    let db: SqliteD1;
    beforeEach(async () => {
        db = await createSqliteD1();
        await seed(db);
        await fund(db, 1, 20000, 'u1');
        await fund(db, 2, 20000, 'u2');
    });

    it('1. method CRUD with per-type validation; scoped lists; 404/401 guards', async () => {
        const created = await req(db, 'POST', '/api/payment-methods', 'sess-r2p-1', BANK);
        expect(created.status).toBe(201);
        expect(created.data.data.method.type).toBe('bank');

        expect((await req(db, 'POST', '/api/payment-methods', 'sess-r2p-1', { type: 'crypto' })).status).toBe(422);
        expect((await req(db, 'POST', '/api/payment-methods', 'sess-r2p-1', { type: 'bank', iban: 'X' })).status).toBe(422);
        expect((await req(db, 'POST', '/api/payment-methods', 'sess-r2p-1', { type: 'paypal' })).status).toBe(422);

        const mine = await req(db, 'GET', '/api/payment-methods', 'sess-r2p-1');
        expect((mine.data.data.methods as any[]).length).toBe(1);
        const others = await req(db, 'GET', '/api/payment-methods', 'sess-r2p-2');
        expect(others.data.data.methods).toEqual([]);
        expect((await req(db, 'GET', '/api/payment-methods')).status).toBe(401);

        const id = created.data.data.method.id as number;
        // Cross-user read/update/delete/use are invisible (404, no oracle).
        expect((await req(db, 'PUT', `/api/payment-methods/${id}`, 'sess-r2p-2', { iban: 'HACK' })).status).toBe(404);
        expect((await req(db, 'DELETE', `/api/payment-methods/${id}`, 'sess-r2p-2')).status).toBe(404);
        expect((await req(db, 'POST', `/api/payment-methods/${id}/default`, 'sess-r2p-2')).status).toBe(404);

        const updated = await req(db, 'PUT', `/api/payment-methods/${id}`, 'sess-r2p-1', { iban: 'IBAN-NEW-9' });
        expect(updated.status).toBe(200);
        expect(updated.data.data.method.iban).toBe('IBAN-NEW-9');
        // Type change re-validates the merged row.
        expect((await req(db, 'PUT', `/api/payment-methods/${id}`, 'sess-r2p-1', { type: 'paypal' })).status).toBe(422);
    });

    it('2. default is single; deleting it promotes the oldest remaining', async () => {
        const a = (await req(db, 'POST', '/api/payment-methods', 'sess-r2p-1', BANK)).data.data.method.id as number;
        const b = (await req(db, 'POST', '/api/payment-methods', 'sess-r2p-1', PAYPAL)).data.data.method.id as number;

        expect((await req(db, 'POST', `/api/payment-methods/${b}/default`, 'sess-r2p-1')).status).toBe(200);
        let list = (await req(db, 'GET', '/api/payment-methods', 'sess-r2p-1')).data.data.methods as any[];
        expect(list.filter((m) => m.is_default).map((m) => m.id)).toEqual([b]);

        // Switch back: exactly one default again.
        await req(db, 'POST', `/api/payment-methods/${a}/default`, 'sess-r2p-1');
        list = (await req(db, 'GET', '/api/payment-methods', 'sess-r2p-1')).data.data.methods as any[];
        expect(list.filter((m) => m.is_default).map((m) => m.id)).toEqual([a]);

        // Delete the default: oldest remaining (b) is promoted.
        const del = await req(db, 'DELETE', `/api/payment-methods/${a}`, 'sess-r2p-1');
        expect(del.status).toBe(200);
        expect(del.data.data.new_default_id).toBe(b);
        list = (await req(db, 'GET', '/api/payment-methods', 'sess-r2p-1')).data.data.methods as any[];
        expect(list.filter((m) => m.is_default).map((m) => m.id)).toEqual([b]);

        // Delete the last one: no default left, honest null.
        const last = await req(db, 'DELETE', `/api/payment-methods/${b}`, 'sess-r2p-1');
        expect(last.data.data.new_default_id).toBeNull();
        expect((await req(db, 'GET', '/api/payment-methods', 'sess-r2p-1')).data.data.methods).toEqual([]);
    });

    it('3. withdrawal with owned method snapshots; foreign/missing rejected', async () => {
        const methodId = (await req(db, 'POST', '/api/payment-methods', 'sess-r2p-1', BANK)).data.data.method.id as number;

        const ok = await req(db, 'POST', '/api/withdrawals', 'sess-r2p-1', { amount: 60, payout_method_id: methodId });
        expect(ok.status).toBe(201);
        const w = ok.data.data.request;
        expect(w.payout_method_id).toBe(methodId);
        const snap = JSON.parse(w.payout_snapshot);
        expect(snap).toMatchObject({ type: 'bank', iban: 'IBAN-OLD-1', bank_name: 'Test Bank' });
        // Legacy display columns keep working for old readers.
        expect(w.payment_method).toBe('bank');
        expect(w.payment_details).toContain('IBAN-OLD-1');

        // Another user's method and a missing id are both 404.
        const foreign = (await req(db, 'POST', '/api/payment-methods', 'sess-r2p-2', PAYPAL)).data.data.method.id as number;
        expect((await req(db, 'POST', '/api/withdrawals', 'sess-r2p-1', { amount: 60, payout_method_id: foreign })).status).toBe(404);
        expect((await req(db, 'POST', '/api/withdrawals', 'sess-r2p-1', { amount: 60, payout_method_id: 99999 })).status).toBe(404);
        // Legacy free-text path still works.
        const legacy = await req(db, 'POST', '/api/withdrawals', 'sess-r2p-1', {
            amount: 60, payment_method: 'bank_transfer', payment_details: 'manual details',
        });
        expect(legacy.status).toBe(201);
        expect(legacy.data.data.request.payout_snapshot).toBe('{}');
    });

    it('4. snapshot frozen: method edit/delete never rewrites the old request', async () => {
        const methodId = (await req(db, 'POST', '/api/payment-methods', 'sess-r2p-1', BANK)).data.data.method.id as number;
        const created = await req(db, 'POST', '/api/withdrawals', 'sess-r2p-1', { amount: 60, payout_method_id: methodId });
        const wid = created.data.data.request.id as number;
        const before = JSON.stringify({
            snapshot: created.data.data.request.payout_snapshot,
            details: created.data.data.request.payment_details,
        });

        // Edit the method afterwards...
        await req(db, 'PUT', `/api/payment-methods/${methodId}`, 'sess-r2p-1', { iban: 'IBAN-CHANGED' });
        // ...and delete it entirely.
        expect((await req(db, 'DELETE', `/api/payment-methods/${methodId}`, 'sess-r2p-1')).status).toBe(200);

        const after = await req(db, 'GET', `/api/withdrawals/${wid}`, 'sess-r2p-1');
        expect(after.status).toBe(200);
        expect(JSON.stringify({
            snapshot: after.data.data.request.payout_snapshot,
            details: after.data.data.request.payment_details,
        })).toBe(before);
        // Only the link NULLs; the execution data survives.
        expect(after.data.data.request.payout_method_id).toBeNull();
    });

    it('5. legacy rows pay through approve unchanged (pre-existing compat)', async () => {
        // A legacy row as stored before R2-P (no link, empty snapshot).
        await db.prepare(
            `INSERT INTO withdrawal_requests (user_id, amount, amount_cents, fee_cents, status, payment_method, payment_details, hold_tx_id, created_at)
             VALUES (1, 60, 6000, 0, 'requested', 'bank_transfer', 'legacy details', 'test:hold:legacy1', datetime('now'))`,
        ).run();
        const row = await db.prepare(`SELECT id FROM withdrawal_requests WHERE hold_tx_id = 'test:hold:legacy1'`).first<{ id: number }>();

        const approve = await req(db, 'PUT', `/api/admin/withdrawals/${row!.id}/approve`, 'sess-r2p-admin', {
            transaction_id: 'TXN-LEGACY-1', note: 'manual payout',
        });
        expect(approve.status).toBe(200);
        expect(approve.data.data.request ?? approve.data.data).toBeTruthy();
        const paid = await db.prepare(`SELECT status, payout_snapshot FROM withdrawal_requests WHERE id = ?`).bind(row!.id).first<{ status: string; payout_snapshot: string }>();
        expect(paid?.status).toBe('paid');
        expect(paid?.payout_snapshot).toBe('{}');
    });
});
