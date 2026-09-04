/**
 * @file src/modules/api/donations/routes.ts
 * @description مسارات التبرعات
 * @module api/donations/routes
 */

import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { DonationModel } from '../../../models/DonationModel';

const donationsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

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

        // Validate amount
        if (!amount || amount < 1) {
            return c.json({
                success: false,
                error: { message: 'Minimum donation amount is $1' }
            }, 400);
        }

        // Validate payment method
        const validMethods = ['stripe', 'paypal', 'card'];
        if (!payment_method || !validMethods.includes(payment_method)) {
            return c.json({
                success: false,
                error: { message: 'Invalid payment method' }
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
                    error: { message: 'Payment initialization failed: ' + (stripeError?.message || 'unknown') }
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
 * Mark donation as completed (webhook from payment processor)
 */
donationsRoutes.post('/:id/complete', async (c) => {
    try {
        const donationId = parseInt(c.req.param('id'));
        const body = await c.req.json();
        const { transaction_id } = body;

        if (!transaction_id) {
            return c.json({
                success: false,
                error: { message: 'Transaction ID is required' }
            }, 400);
        }

        const donationModel = new DonationModel(c.env.DB);
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
 * T4.1: Stripe webhook — verifies the Stripe-Signature (HMAC-SHA256) then
 * marks the donation completed on checkout.session.completed.
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

        const { StripeService } = await import('../../../lib/services/StripeService');
        const check = await StripeService.verifyWebhookSignature(rawBody, sigHeader, secret);
        if (!check.valid) {
            console.error('[Donations] Webhook signature invalid:', check.reason);
            return c.json({ success: false, error: { message: 'Invalid signature' } }, 400);
        }

        const event = JSON.parse(rawBody);
        if (event.type === 'checkout.session.completed') {
            const session = event.data?.object;
            const donationId = parseInt(
                session?.metadata?.donation_id || session?.client_reference_id || '0',
                10
            );
            if (donationId > 0) {
                const donationModel = new DonationModel(c.env.DB);
                await donationModel.markCompleted(donationId, session.payment_intent || session.id);
                console.log(`[Donations] Donation ${donationId} completed via Stripe webhook`);
            }
        }

        return c.json({ received: true });
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
