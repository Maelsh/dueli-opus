/**
 * @file src/lib/services/StripeService.ts
 * @description Stripe integration - T4.1
 *
 * - createCheckoutSession: hosted payment session on Stripe
 * - verifyWebhookSignature: Stripe-Signature HMAC-SHA256 verification (WebCrypto)
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY     = sk_live_... / sk_test_...
 *   STRIPE_WEBHOOK_SECRET = whsec_...
 */

const STRIPE_API = 'https://api.stripe.com/v1';

export interface CheckoutParams {
    amount: number;            // dollars (converted to cents)
    currency?: string;
    donationId: number;
    donorEmail?: string | null;
    donorName?: string | null;
    message?: string | null;
    successUrl: string;
    cancelUrl: string;
}

export class StripeService {

    /**
     * Create a hosted Checkout session and return the payment URL
     */
    static async createCheckoutSession(secretKey: string, p: CheckoutParams): Promise<{ url: string; sessionId: string }> {
        const body = new URLSearchParams();
        body.set('mode', 'payment');
        body.set('success_url', p.successUrl);
        body.set('cancel_url', p.cancelUrl);
        body.set('line_items[0][quantity]', '1');
        body.set('line_items[0][price_data][currency]', (p.currency || 'usd').toLowerCase());
        body.set('line_items[0][price_data][unit_amount]', String(Math.round(p.amount * 100)));
        body.set('line_items[0][price_data][product_data][name]', 'Dueli Platform Donation');
        if (p.message) {
            body.set('line_items[0][price_data][product_data][description]', p.message.slice(0, 200));
        }
        if (p.donorEmail) body.set('customer_email', p.donorEmail);
        body.set('metadata[donation_id]', String(p.donationId));
        body.set('client_reference_id', String(p.donationId));

        const res = await fetch(STRIPE_API + '/checkout/sessions', {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + secretKey,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        });

        const data: any = await res.json();
        if (!res.ok || !data?.url) {
            throw new Error(data?.error?.message || ('Stripe error (' + res.status + ')'));
        }
        return { url: data.url, sessionId: data.id };
    }

    /**
     * Verify a webhook signature (Stripe scheme v1):
     *   signature = HMAC-SHA256(secret, `${timestamp}.${rawPayload}`)
     * Header format: `t=<ts>,v1=<sig>,...`
     */
    static async verifyWebhookSignature(
        rawPayload: string,
        sigHeader: string,
        secret: string,
        toleranceSeconds: number = 300
    ): Promise<{ valid: boolean; reason?: string }> {
        try {
            const parts = sigHeader.split(',').reduce<Record<string, string>>((acc, kv) => {
                const [k, v] = kv.split('=');
                if (k && v) acc[k.trim()] = v.trim();
                return acc;
            }, {});

            const timestamp = parts['t'];
            const signature = parts['v1'];
            if (!timestamp || !signature) {
                return { valid: false, reason: 'Malformed Stripe-Signature header' };
            }

            // Replay protection
            const age = Math.abs(Math.floor(Date.now() / 1000) - parseInt(timestamp, 10));
            if (isNaN(age) || age > toleranceSeconds) {
                return { valid: false, reason: 'Timestamp outside tolerance window' };
            }

            const signedPayload = timestamp + '.' + rawPayload;
            const encoder = new TextEncoder();
            const key = await crypto.subtle.importKey(
                'raw',
                encoder.encode(secret),
                { name: 'HMAC', hash: 'SHA-256' },
                false,
                ['sign']
            );
            const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
            const expected = Array.from(new Uint8Array(mac))
                .map(b => b.toString(16).padStart(2, '0'))
                .join('');

            // Constant-time-ish comparison
            let diff = 0;
            const a = expected;
            const b = signature.toLowerCase();
            if (a.length !== b.length) return { valid: false, reason: 'Signature mismatch' };
            for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
            if (diff !== 0) return { valid: false, reason: 'Signature mismatch' };

            return { valid: true };
        } catch (e) {
            return { valid: false, reason: (e as Error).message };
        }
    }
}

export default StripeService;
