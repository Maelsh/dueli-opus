/**
 * Donations API
 * API التبرعات والدعم المالي
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';

const donationRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply optional auth middleware
donationRoutes.use('*', authMiddleware({ required: false }));

/**
 * Donation Model (inline)
 */
class DonationModel {
    constructor(private db: D1Database) {}

    async create(userId: number | null, amount: number, currency: string, method: string, 
                 status: string, transactionId?: string, message?: string, isAnonymous: boolean = false): Promise<{ id: number }> {
        const result = await this.db.prepare(`
            INSERT INTO donations (user_id, amount, currency, method, status, transaction_id, message, is_anonymous, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
        `).bind(userId, amount, currency, method, status, transactionId || null, message || null, isAnonymous ? 1 : 0).run();
        return { id: result.meta.last_row_id as number };
    }

    async updateStatus(id: number, status: string, transactionId?: string): Promise<boolean> {
        const result = await this.db.prepare(`
            UPDATE donations SET status = ?, transaction_id = ?, updated_at = datetime('now') WHERE id = ?
        `).bind(status, transactionId || null, id).run();
        return result.meta.changes > 0;
    }

    async getTopSupporters(limit: number = 10): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT d.*, u.username, u.display_name, u.avatar_url
            FROM donations d
            LEFT JOIN users u ON d.user_id = u.id
            WHERE d.status = 'completed' AND d.is_anonymous = 0
            ORDER BY d.amount DESC
            LIMIT ?
        `).bind(limit).all();
        return result.results;
    }

    async getTotalDonations(): Promise<number> {
        const result = await this.db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total FROM donations WHERE status = 'completed'
        `).first<{ total: number }>();
        return result?.total || 0;
    }

    async getUserDonations(userId: number): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT * FROM donations WHERE user_id = ? ORDER BY created_at DESC
        `).bind(userId).all();
        return result.results;
    }
}

/**
 * POST /api/donations/create-intent
 * Create a payment intent for donation
 */
donationRoutes.post('/create-intent', async (c) => {
    try {
        const body = await c.req.json<{
            amount: number;
            currency?: string;
            message?: string;
            is_anonymous?: boolean;
        }>();

        if (!body?.amount || body.amount < 1) {
            return c.json({ success: false, error: 'Minimum donation amount is $1' }, 400);
        }

        const user = c.get('user');
        const db = c.env.DB;
        const donationModel = new DonationModel(db);

        // Create pending donation record
        const donation = await donationModel.create(
            user?.id || null,
            body.amount,
            body.currency || 'USD',
            'stripe',
            'pending',
            undefined,
            body.message,
            body.is_anonymous || false
        );


        // In production, you would integrate with Stripe here
        // For now, we'll simulate the payment intent creation
        const mockClientSecret = `pi_${Date.now()}_secret_${Math.random().toString(36).substring(7)}`;

        return c.json({
            success: true,
            donation_id: donation.id,
            client_secret: mockClientSecret,
            amount: body.amount,
            currency: body.currency || 'USD',
            message: 'Payment intent created. In production, this will redirect to Stripe checkout.'
        });

    } catch (error) {
        console.error('Create donation intent error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to create payment intent',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

/**
 * POST /api/donations/confirm
 * Confirm a donation payment (webhook simulation)
 */
donationRoutes.post('/confirm', async (c) => {
    try {
        const body = await c.req.json<{
            donation_id: number;
            payment_intent_id: string;
        }>();

        if (!body?.donation_id || !body?.payment_intent_id) {
            return c.json({ success: false, error: 'Donation ID and payment intent ID required' }, 400);
        }

        const db = c.env.DB;
        const donationModel = new DonationModel(db);

        // Update donation status
        await donationModel.updateStatus(body.donation_id, 'completed', body.payment_intent_id);

        // Get donation details for notification
        const donation = await db.prepare('SELECT * FROM donations WHERE id = ?').bind(body.donation_id).first();

        if (donation && donation.user_id) {
            // Notify user of successful donation
            await db.prepare(`
                INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
                VALUES (?, 'system', ?, ?, 'donation', ?, datetime('now'))
            `).bind(
                donation.user_id,
                'Thank You for Your Donation!',
                `Your donation of $${donation.amount} has been received. Thank you for supporting Dueli!`
            , body.donation_id).run();
        }

        return c.json({
            success: true,
            message: 'Donation confirmed successfully',
            donation_id: body.donation_id
        });

    } catch (error) {
        console.error('Confirm donation error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to confirm donation' 
        }, 500);
    }
});

/**
 * GET /api/donations/top-supporters
 * Get top supporters list
 */
donationRoutes.get('/top-supporters', async (c) => {
    try {
        const db = c.env.DB;
        const donationModel = new DonationModel(db);
        
        const supporters = await donationModel.getTopSupporters(10);
        const totalDonations = await donationModel.getTotalDonations();

        return c.json({
            success: true,
            supporters: supporters.map(s => ({
                name: s.is_anonymous ? 'Anonymous' : (s.display_name || s.username || 'Anonymous'),
                amount: s.amount,
                avatar: s.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${s.id}`,
                message: s.message,
                date: s.created_at
            })),
            total_donations: totalDonations
        });

    } catch (error) {
        console.error('Get top supporters error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to fetch supporters' 
        }, 500);
    }
});

/**
 * GET /api/donations/my-donations
 * Get current user's donation history
 */
donationRoutes.get('/my-donations', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const db = c.env.DB;
        const donationModel = new DonationModel(db);
        
        const donations = await donationModel.getUserDonations(user.id);

        return c.json({
            success: true,
            donations: donations
        });

    } catch (error) {
        console.error('Get my donations error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to fetch donations' 
        }, 500);
    }
});

/**
 * POST /api/donations/stripe-webhook
 * Stripe webhook handler for payment events
 */
donationRoutes.post('/stripe-webhook', async (c) => {
    try {
        // In production, verify Stripe signature
        // const signature = c.req.header('stripe-signature');
        // const event = stripe.webhooks.constructEvent(body, signature, webhookSecret);

        const body = await c.req.json();
        
        // Handle different event types
        switch (body.type) {
            case 'payment_intent.succeeded':
                // Update donation status
                const donationId = body.data?.object?.metadata?.donation_id;
                if (donationId) {
                    const db = c.env.DB;
                    await db.prepare(`
                        UPDATE donations SET status = 'completed', updated_at = datetime('now') WHERE id = ?
                    `).bind(donationId).run();
                }
                break;
                
            case 'payment_intent.payment_failed':
                const failedDonationId = body.data?.object?.metadata?.donation_id;
                if (failedDonationId) {
                    const db = c.env.DB;
                    await db.prepare(`
                        UPDATE donations SET status = 'failed', updated_at = datetime('now') WHERE id = ?
                    `).bind(failedDonationId).run();
                }
                break;
        }

        return c.json({ received: true });

    } catch (error) {
        console.error('Stripe webhook error:', error);
        return c.json({ error: 'Webhook processing failed' }, 400);
    }
});

export default donationRoutes;
