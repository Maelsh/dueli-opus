/**
 * Earnings API Routes
 * مسارات API للأرباح
 * Plan: Monetization - نظام الأرباح
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';

const earningsRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

earningsRoutes.use('*', authMiddleware({ required: true }));

/**
 * Get user's earnings summary
 * GET /api/earnings
 */
earningsRoutes.get('/', async (c) => {
    const user = c.get('user') as any;

    const summary = await c.env.DB.prepare(`
        SELECT 
            COALESCE(SUM(CASE WHEN status = 'available' THEN amount ELSE 0 END), 0) as available,
            COALESCE(SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END), 0) as pending,
            COALESCE(SUM(CASE WHEN status = 'withdrawn' THEN amount ELSE 0 END), 0) as withdrawn,
            COALESCE(SUM(amount), 0) as total
        FROM user_earnings WHERE user_id = ?
    `).bind(user.id).first();

    return c.json({ success: true, data: summary });
});

/**
 * Get earnings history
 * GET /api/earnings/history
 */
earningsRoutes.get('/history', async (c) => {
    const user = c.get('user') as any;
    const limit = parseInt(c.req.query('limit') || '20');
    const offset = parseInt(c.req.query('offset') || '0');

    const history = await c.env.DB.prepare(`
        SELECT e.*, c.title as competition_title
        FROM user_earnings e
        LEFT JOIN competitions c ON e.competition_id = c.id
        WHERE e.user_id = ?
        ORDER BY e.created_at DESC
        LIMIT ? OFFSET ?
    `).bind(user.id, limit, offset).all();

    return c.json({ success: true, data: history.results });
});

/**
 * Request withdrawal
 * POST /api/earnings/withdraw
 */
earningsRoutes.post('/withdraw', async (c) => {
    const user = c.get('user') as any;
    const { amount, payment_method_id } = await c.req.json();

    if (!amount || amount <= 0) {
        return c.json({ success: false, error: 'Invalid amount' }, 422);
    }

    // Check available balance
    const balance = await c.env.DB.prepare(`
        SELECT COALESCE(SUM(amount), 0) as available 
        FROM user_earnings 
        WHERE user_id = ? AND status = 'available'
    `).bind(user.id).first() as any;

    if (balance.available < amount) {
        return c.json({ success: false, error: 'Insufficient balance' }, 400);
    }

    // Check payment method exists
    if (payment_method_id) {
        const method = await c.env.DB.prepare(`
            SELECT id FROM payment_methods WHERE id = ? AND user_id = ?
        `).bind(payment_method_id, user.id).first();

        if (!method) {
            return c.json({ success: false, error: 'Payment method not found' }, 404);
        }
    }

    // Mark earnings as withdrawn (FIFO)
    let remaining = amount;
    const available = await c.env.DB.prepare(`
        SELECT id, amount FROM user_earnings 
        WHERE user_id = ? AND status = 'available'
        ORDER BY created_at ASC
    `).bind(user.id).all();

    for (const earning of available.results as any[]) {
        if (remaining <= 0) break;

        if (earning.amount <= remaining) {
            await c.env.DB.prepare(`
                UPDATE user_earnings SET status = 'withdrawn', withdrawn_at = datetime('now')
                WHERE id = ?
            `).bind(earning.id).run();
            remaining -= earning.amount;
        } else {
            // Split: partially withdraw
            await c.env.DB.prepare(`
                UPDATE user_earnings SET amount = ?, status = 'withdrawn', withdrawn_at = datetime('now')
                WHERE id = ?
            `).bind(remaining, earning.id).run();

            // Create remainder record
            await c.env.DB.prepare(`
                INSERT INTO user_earnings (user_id, competition_id, amount, earning_type, status, created_at)
                SELECT user_id, competition_id, ?, earning_type, 'available', created_at
                FROM user_earnings WHERE id = ?
            `).bind(earning.amount - remaining, earning.id).run();

            remaining = 0;
        }
    }

    // Create notification
    await c.env.DB.prepare(`
        INSERT INTO notifications (user_id, type, title, message, created_at)
        VALUES (?, 'system', 'طلب سحب', 'تم استلام طلب سحب بمبلغ ${amount}', datetime('now'))
    `).bind(user.id).run();

    return c.json({ success: true, data: { withdrawn: amount } });
});

export default earningsRoutes;
