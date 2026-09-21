/**
 * @file src/modules/api/donations/routes.ts
 * @description مسارات التبرعات
 * @module api/donations/routes
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { DonationModel } from '../../../models/DonationModel';
import { authMiddleware } from '../../../middleware/auth';
import { t } from '../../../i18n';
import type { Language } from '../../../config/types';
import type { StripeEventShape } from '../../../lib/services/StripeWebhookService';

const donationsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Optional auth on every route in this router: donations can be made
// anonymously, but when a session is present we attach the user so
// /:id/complete can check ownership (SEC-01).
donationsRoutes.use('*', authMiddleware({ required: false }));

/**
 * GET /api/donations/top-supporters
 * Get top supporters list
 */
donationsRoutes.get('/top-supporters', async (c) => {
    try {
        const donationModel = new DonationModel(c.env.DB);
        const supporters = await donationModel.getTopSupporters(10);

        return c.json({
            success: true,
            data: supporters
        });
    } catch (error) {
        console.error('Get top supporters error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to get top supporters' }
        }, 500);
    }
});

/**
 * GET /api/donations/total
 * Get total donations amount
 */
donationsRoutes.get('/total', async (c) => {
    try {
        const donationModel = new DonationModel(c.env.DB);
        const total = await donationModel.getTotalDonations();

        return c.json({
            success: true,
            data: { total }
        });
    } catch (error) {
        console.error('Get total donations error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to get total donations' }
        }, 500);
    }
});

/**
 * POST /api/donations
 * Create a new donation (initiates payment)
 */
donationsRoutes.post('/', async (c) => {
    try {
        const body = await c.req.json();
        const { amount, payment_method, donor_name, donor_email, message, is_anonymous } = body;
        const lang = (c.get('lang') || 'en') as Language;

        // Validate amount
        if (!amount || amount < 1) {
            return c.json({
                success: false,
                error: { message: t('payment_min_amount', lang) }
            }, 400);
        }

        // Validate payment method (paypal hidden until a real integration exists)
        const validMethods = ['stripe', 'card'];
        if (!payment_method || !validMethods.includes(payment_method)) {
            return c.json({
                success: false,
                error: { message: t('payment_method_invalid', lang) }
            }, 400);
        }

        const donationModel = new DonationModel(c.env.DB);

        // Get user if logged in
        const user = c.get('user');

        // Create donation record
        const donation = await donationModel.createDonation({
            user_id: user?.id,
            amount,
            payment_method,
            donor_name: is_anonymous ? null : donor_name,
            donor_email,
            message,
            is_anonymous
        });

        // T4.1: Real Stripe Checkout when configured; mock URL otherwise (dev)
        let paymentUrl = `#payment-${donation.id}`;
        const stripeKey = c.env.STRIPE_SECRET_KEY;
        if ((payment_method === 'stripe' || payment_method === 'card') && stripeKey) {
            try {
                const { StripeService } = await import('../../../lib/services/StripeService');
                const origin = c.req.header('origin') || 'https://dueli.maelshpro.com';
                const session = await StripeService.createCheckoutSession(stripeKey, {
                    amount,
                    donationId: donation.id,
                    donorEmail: donor_email || null,
                    donorName: is_anonymous ? null : (donor_name || null),
                    message: message || null,
                    successUrl: `${origin}/donate?paid=1&session_id={CHECKOUT_SESSION_ID}`,
                    cancelUrl: `${origin}/donate?cancelled=1`
                });
                paymentUrl = session.url;
            } catch (stripeError: any) {
                console.error('[Donations] Stripe checkout failed:', stripeError);
                return c.json({
                    success: false,
                    error: { message: t('payment_failed', lang) }
                }, 502);
            }
        }

        return c.json({
            success: true,
            data: {
                donation_id: donation.id,
                amount: donation.amount,
                currency: donation.currency,
                payment_url: paymentUrl,
                message: 'Donation created. Complete payment to finalize.'
            }
        });
    } catch (error) {
        console.error('Create donation error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to create donation' }
        }, 500);
    }
});

/**
 * POST /api/donations/:id/complete
 * SEC-01 (docs/12-SECURITY-REMEDIATION.md): legacy manual completion.
 * NO LONGER PUBLIC — requires auth and the caller must own the donation.
 * The supported path is the Stripe webhook (POST /api/donations/webhook);
 * this route stays for non-Stripe methods (e.g. manual bank transfer) where
 * there is no webhook, but it can never complete someone else's donation.
 */
donationsRoutes.post('/:id/complete', authMiddleware({ required: true }), async (c) => {
    try {
        const user = c.get('user') as any;
        const donationId = parseInt(c.req.param('id') || '0');
        const body = await c.req.json();
        const { transaction_id } = body;

        if (!transaction_id) {
            return c.json({
                success: false,
                error: { message: 'Transaction ID is required' }
            }, 400);
        }

        const donationModel = new DonationModel(c.env.DB);
        const existing = await donationModel.findById(donationId);

        if (!existing) {
            return c.json({
                success: false,
                error: { message: 'Donation not found' }
            }, 404);
        }

        // Ownership check: only the donor (when the donation has an owner)
        // may complete it manually.
        if (existing.user_id != null && existing.user_id !== user?.id) {
            console.warn(`[Donations] forbidden manual complete: user=${user?.id} donation=${donationId} owner=${existing.user_id}`);
            return c.json({
                success: false,
                error: { message: 'Forbidden' }
            }, 403);
        }

        console.warn(`[Donations] manual complete: user=${user?.id} donation=${donationId} (prefer Stripe webhook for stripe/card)`);
        const donation = await donationModel.markCompleted(donationId, transaction_id);

        if (!donation) {
            return c.json({
                success: false,
                error: { message: 'Donation not found' }
            }, 404);
        }

        return c.json({
            success: true,
            data: donation
        });
    } catch (error) {
        console.error('Complete donation error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to complete donation' }
        }, 500);
    }
});

/**
 * POST /api/donations/webhook
 * T4.1 / 8.C: Stripe webhook — verifies the Stripe-Signature (HMAC-SHA256)
 * FIRST, then delegates every financial effect to StripeWebhookService which
 * writes balanced ledger entries through LedgerService only.
 *
 * Idempotency: the same `event.id` processed 10 times produces exactly ONE
 * financial effect (UNIQUE(event_id) + ledger tx_id guard). Unsupported event
 * types return 200 with NO financial effect. A missing or forged signature
 * returns 400 before any DB write.
 *
 * Configure in Stripe Dashboard with STRIPE_WEBHOOK_SECRET env var.
 */
donationsRoutes.post('/webhook', async (c) => {
    try {
        const secret = c.env.STRIPE_WEBHOOK_SECRET;
        if (!secret) {
            return c.json({ success: false, error: { message: 'Webhook not configured' } }, 503);
        }

        const rawBody = await c.req.text();
        const sigHeader = c.req.header('Stripe-Signature') || '';

        // 8.C §2: signature verified BEFORE any processing or DB write.
        const { StripeService } = await import('../../../lib/services/StripeService');
        const check = await StripeService.verifyWebhookSignature(rawBody, sigHeader, secret);
        if (!check.valid) {
            console.error('[Donations] Webhook signature invalid:', check.reason);
            return c.json({ success: false, error: { message: 'Invalid signature' } }, 400);
        }

        // Only now is the payload trusted enough to parse.
        const event: StripeEventShape = JSON.parse(rawBody);

        const { StripeWebhookService } = await import('../../../lib/services/StripeWebhookService');
        const service = new StripeWebhookService(c.env.DB);
        const result = await service.processEvent(c.env.DB, event);

        if (!result.eventId) {
            return c.json({ success: false, error: { message: 'Malformed event' } }, 400);
        }

        // 8.C §7: every outcome returns 200 so Stripe stops retrying, EXCEPT
        // malformed events (no event.id) which are rejected above. Financial
        // effects happen only for `applied: true`.
        return c.json({ received: true, event_id: result.eventId, applied: result.applied });
    } catch (error) {
        console.error('Stripe webhook error:', error);
        return c.json({ success: false, error: { message: 'Webhook processing failed' } }, 500);
    }
});

/**
 * GET /api/donations/my
 * Get current user's donations
 */
donationsRoutes.get('/my', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({
                success: false,
                error: { message: 'Unauthorized' }
            }, 401);
        }

        const donationModel = new DonationModel(c.env.DB);
        const donations = await donationModel.getDonationsByUser(user.id);

        return c.json({
            success: true,
            data: donations
        });
    } catch (error) {
        console.error('Get my donations error:', error);
        return c.json({
            success: false,
            error: { message: 'Failed to get donations' }
        }, 500);
    }
});

export default donationsRoutes;
