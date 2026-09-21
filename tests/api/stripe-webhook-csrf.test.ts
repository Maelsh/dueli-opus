import { describe, expect, it } from 'vitest';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

/**
 * 8.C — Stripe يرسل webhooks من خوادمه WITHOUT Origin/Referer/CSRF headers.
 * إذا حظرها csrfProtection العام قبل التحقق من التوقيع، فلن يصل أي حدث
 * أبداً ⇒ الدفع لا يكتمل. التوقيع (HMAC) هو مصادقة هذا المسار.
 */
const WEBHOOK_SECRET = 'whsec_test_local_only_plain';

describe('8.C webhook reachability without browser headers', () => {
    it('a Stripe-style request (no Origin/Referer/CSRF) reaches signature verification', async () => {
        const db = new SqliteD1();
        // لا نرسل أي ترويسة متصفح — تماماً مثل Stripe.
        const res = await app.request(
            '/api/donations/webhook',
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: 'evt_x', type: 'unknown' }),
            },
            { DB: db, STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET } as unknown as Parameters<typeof app.request>[2]
        );
        // يجب أن يكون 400 (توقيع مفقود) — وليس 403 (CSRF) — أي أنه وصل
        // لمنطق التحقق من التوقيع.
        expect(res.status).toBe(400);
        const body = (await res.json()) as { error?: { message?: string } };
        expect(body.error?.message).toBe('Invalid signature');
    });
});
