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

        // In a real implementation, you would integrate with Stripe/PayPal here
        // For now, we'll return a mock payment URL
        const paymentUrl = `#payment-${donation.id}`;

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
