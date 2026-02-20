/**
 * @file src/modules/api/withdrawals/routes.ts
 * @description Routes for withdrawal requests
 * @module api/withdrawals
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';

const withdrawalsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply optional auth middleware
withdrawalsRoutes.use('*', authMiddleware({ required: false }));

/**
 * Get user's withdrawal requests
 * GET /api/withdrawals
 */
withdrawalsRoutes.get('/', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const result = await c.env.DB.prepare(`
            SELECT * FROM withdrawal_requests 
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 20
        `).bind(user.id).all();

        return c.json({
            success: true,
            data: result.results || []
        });
    } catch (error) {
        console.error('Error fetching withdrawals:', error);
        return c.json({ error: 'Failed to fetch withdrawals' }, 500);
    }
});

/**
 * Create withdrawal request
 * POST /api/withdrawals
 */
withdrawalsRoutes.post('/', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json<{
            amount: number;
            payment_method: string;
            payment_details: string;
        }>();

        if (!body.amount || !body.payment_method || !body.payment_details) {
            return c.json({ error: 'Missing required fields' }, 400);
        }

        // Check minimum withdrawal amount
        if (body.amount < 10) {
            return c.json({ error: 'Minimum withdrawal amount is 10' }, 400);
        }

        // Check user has enough earnings
        const earnings = await c.env.DB.prepare(`
            SELECT SUM(amount) as total 
            FROM user_earnings 
            WHERE user_id = ? AND status = 'pending'
        `).bind(user.id).first<{ total: number }>();

        const pendingEarnings = earnings?.total || 0;

        if (body.amount > pendingEarnings) {
            return c.json({ error: 'Insufficient earnings' }, 400);
        }

        // Create withdrawal request
        const result = await c.env.DB.prepare(`
            INSERT INTO withdrawal_requests 
            (user_id, amount, payment_method, payment_details, status, created_at)
            VALUES (?, ?, ?, ?, 'pending', datetime('now'))
        `).bind(user.id, body.amount, body.payment_method, body.payment_details).run();

        return c.json({
            success: true,
            data: { id: result.meta.last_row_id, status: 'pending' }
        }, 201);
    } catch (error) {
        console.error('Error creating withdrawal:', error);
        return c.json({ error: 'Failed to create withdrawal request' }, 500);
    }
});

/**
 * Get withdrawal request by ID
 * GET /api/withdrawals/:id
 */
withdrawalsRoutes.get('/:id', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const id = parseInt(c.req.param('id'));

        const result = await c.env.DB.prepare(`
            SELECT * FROM withdrawal_requests 
            WHERE id = ? AND user_id = ?
        `).bind(id, user.id).first();

        if (!result) {
            return c.json({ error: 'Withdrawal request not found' }, 404);
        }

        return c.json({
            success: true,
            data: result
        });
    } catch (error) {
        console.error('Error fetching withdrawal:', error);
        return c.json({ error: 'Failed to fetch withdrawal request' }, 500);
    }
});

/**
 * Cancel pending withdrawal request
 * DELETE /api/withdrawals/:id
 */
withdrawalsRoutes.delete('/:id', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ error: 'Unauthorized' }, 401);
        }

        const id = parseInt(c.req.param('id'));

        // Only allow cancelling pending requests
        const result = await c.env.DB.prepare(`
            UPDATE withdrawal_requests 
            SET status = 'cancelled'
            WHERE id = ? AND user_id = ? AND status = 'pending'
        `).bind(id, user.id).run();

        if (result.meta.changes === 0) {
            return c.json({ error: 'Cannot cancel this withdrawal request' }, 400);
        }

        return c.json({
            success: true,
            data: { cancelled: true }
        });
    } catch (error) {
        console.error('Error cancelling withdrawal:', error);
        return c.json({ error: 'Failed to cancel withdrawal request' }, 500);
    }
});

export default withdrawalsRoutes;
