/**
 * Withdrawal System API
 * API نظام السحب
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';

const withdrawalRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
withdrawalRoutes.use('*', authMiddleware({ required: true }));

/**
 * Withdrawal Request Model (inline)
 */
class WithdrawalRequestModel {
    constructor(private db: D1Database) {}

    async create(userId: number, amount: number, method: string, accountInfo: string): Promise<{ id: number }> {
        const result = await this.db.prepare(`
            INSERT INTO withdrawal_requests (user_id, amount, method, account_info, status, created_at)
            VALUES (?, ?, ?, ?, 'pending', datetime('now'))
        `).bind(userId, amount, method, accountInfo).run();
        return { id: result.meta.last_row_id as number };
    }

    async findByUser(userId: number, limit: number = 50): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT * FROM withdrawal_requests 
            WHERE user_id = ? 
            ORDER BY created_at DESC 
            LIMIT ?
        `).bind(userId, limit).all();
        return result.results;
    }

    async findById(id: number): Promise<any> {
        return await this.db.prepare('SELECT * FROM withdrawal_requests WHERE id = ?').bind(id).first();
    }

    async getPendingForAdmin(limit: number = 50): Promise<any[]> {
        const result = await this.db.prepare(`
            SELECT w.*, u.username, u.display_name, u.email
            FROM withdrawal_requests w
            JOIN users u ON w.user_id = u.id
            WHERE w.status = 'pending'
            ORDER BY w.created_at ASC
            LIMIT ?
        `).bind(limit).all();
        return result.results;
    }

    async updateStatus(id: number, status: string, adminId: number, notes?: string): Promise<boolean> {
        const result = await this.db.prepare(`
            UPDATE withdrawal_requests 
            SET status = ?, processed_by = ?, processed_at = datetime('now'), notes = ?
            WHERE id = ?
        `).bind(status, adminId, notes || null, id).run();
        return result.meta.changes > 0;
    }

    async getTotalPending(userId: number): Promise<number> {
        const result = await this.db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total 
            FROM withdrawal_requests 
            WHERE user_id = ? AND status = 'pending'
        `).bind(userId).first<{ total: number }>();
        return result?.total || 0;
    }
}

/**
 * POST /api/earnings/withdrawal/request
 * Create withdrawal request
 */
withdrawalRoutes.post('/request', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json<{
            amount: number;
            method: string;
            account_info: string;
        }>();

        // Validation
        if (!body?.amount || body.amount < 10) {
            return c.json({ success: false, error: 'Minimum withdrawal amount is $10' }, 400);
        }

        if (!body?.method || !body?.account_info) {
            return c.json({ success: false, error: 'Payment method and account info required' }, 400);
        }

        const db = c.env.DB;
        const withdrawalModel = new WithdrawalRequestModel(db);

        // Check user's available balance
        const earningsResult = await db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total_earnings 
            FROM user_earnings 
            WHERE user_id = ?
        `).bind(user.id).first<{ total_earnings: number }>();

        const totalEarnings = earningsResult?.total_earnings || 0;

        // Get total pending withdrawals
        const pendingWithdrawals = await withdrawalModel.getTotalPending(user.id);

        // Calculate available balance
        const availableBalance = totalEarnings - pendingWithdrawals;

        if (body.amount > availableBalance) {
            return c.json({ 
                success: false, 
                error: 'Insufficient balance',
                available_balance: availableBalance,
                pending_withdrawals: pendingWithdrawals
            }, 400);
        }

        // Create withdrawal request
        const request = await withdrawalModel.create(
            user.id,
            body.amount,
            body.method,
            body.account_info
        );

        // Create notification for user
        await db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
            VALUES (?, 'system', ?, ?, 'withdrawal', ?, datetime('now'))
        `).bind(
            user.id,
            'Withdrawal Request Submitted',
            `Your withdrawal request for $${body.amount} has been submitted and is pending review.`
        , request.id).run();

        return c.json({
            success: true,
            message: 'Withdrawal request submitted successfully',
            request_id: request.id,
            amount: body.amount,
            status: 'pending',
            available_balance: availableBalance - body.amount
        });

    } catch (error) {
        console.error('Withdrawal request error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to process withdrawal request',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

/**
 * GET /api/earnings/withdrawal/history
 * Get user's withdrawal history
 */
withdrawalRoutes.get('/history', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const db = c.env.DB;
        const withdrawalModel = new WithdrawalRequestModel(db);

        const history = await withdrawalModel.findByUser(user.id);

        // Get current balance
        const earningsResult = await db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total_earnings 
            FROM user_earnings 
            WHERE user_id = ?
        `).bind(user.id).first<{ total_earnings: number }>();

        const totalEarnings = earningsResult?.total_earnings || 0;
        const pendingWithdrawals = await withdrawalModel.getTotalPending(user.id);
        const availableBalance = totalEarnings - pendingWithdrawals;

        return c.json({
            success: true,
            history: history,
            summary: {
                total_earnings: totalEarnings,
                pending_withdrawals: pendingWithdrawals,
                available_balance: availableBalance
            }
        });

    } catch (error) {
        console.error('Withdrawal history error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to fetch withdrawal history' 
        }, 500);
    }
});

/**
 * GET /api/earnings/withdrawal/admin/pending
 * Get pending withdrawals for admin (admin only)
 */
withdrawalRoutes.get('/admin/pending', async (c) => {
    try {
        const user = c.get('user');
        if (!user || !user.is_admin) {
            return c.json({ success: false, error: 'Forbidden' }, 403);
        }

        const db = c.env.DB;
        const withdrawalModel = new WithdrawalRequestModel(db);

        const pending = await withdrawalModel.getPendingForAdmin();

        return c.json({
            success: true,
            pending_withdrawals: pending,
            count: pending.length
        });

    } catch (error) {
        console.error('Admin pending withdrawals error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to fetch pending withdrawals' 
        }, 500);
    }
});

/**
 * POST /api/earnings/withdrawal/admin/process
 * Process (approve/reject) withdrawal request (admin only)
 */
withdrawalRoutes.post('/admin/process', async (c) => {
    try {
        const user = c.get('user');
        if (!user || !user.is_admin) {
            return c.json({ success: false, error: 'Forbidden' }, 403);
        }

        const body = await c.req.json<{
            request_id: number;
            action: 'approved' | 'rejected';
            notes?: string;
        }>();

        if (!body?.request_id || !body?.action) {
            return c.json({ success: false, error: 'Request ID and action required' }, 400);
        }

        const db = c.env.DB;
        const withdrawalModel = new WithdrawalRequestModel(db);

        // Get the withdrawal request
        const request = await withdrawalModel.findById(body.request_id);
        if (!request) {
            return c.json({ success: false, error: 'Withdrawal request not found' }, 404);
        }

        if (request.status !== 'pending') {
            return c.json({ success: false, error: 'Request already processed' }, 400);
        }

        // Update status
        await withdrawalModel.updateStatus(body.request_id, body.action, user.id, body.notes);

        // Notify user
        const statusMessage = body.action === 'approved' 
            ? `Your withdrawal request for $${request.amount} has been approved and is being processed.`
            : `Your withdrawal request for $${request.amount} has been rejected. Reason: ${body.notes || 'No reason provided'}`;

        await db.prepare(`
            INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id, created_at)
            VALUES (?, 'system', ?, ?, 'withdrawal', ?, datetime('now'))
        `).bind(
            request.user_id,
            `Withdrawal ${body.action === 'approved' ? 'Approved' : 'Rejected'}`,
            statusMessage
        , body.request_id).run();

        return c.json({
            success: true,
            message: `Withdrawal request ${body.action} successfully`,
            request_id: body.request_id,
            status: body.action
        });

    } catch (error) {
        console.error('Process withdrawal error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to process withdrawal request' 
        }, 500);
    }
});

/**
 * GET /api/earnings/balance
 * Get current earnings balance
 */
withdrawalRoutes.get('/balance', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const db = c.env.DB;
        const withdrawalModel = new WithdrawalRequestModel(db);

        // Get total earnings
        const earningsResult = await db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total_earnings 
            FROM user_earnings 
            WHERE user_id = ?
        `).bind(user.id).first<{ total_earnings: number }>();

        const totalEarnings = earningsResult?.total_earnings || 0;

        // Get total pending withdrawals
        const pendingWithdrawals = await withdrawalModel.getTotalPending(user.id);

        // Get total approved withdrawals
        const approvedResult = await db.prepare(`
            SELECT COALESCE(SUM(amount), 0) as total_approved 
            FROM withdrawal_requests 
            WHERE user_id = ? AND status = 'approved'
        `).bind(user.id).first<{ total_approved: number }>();

        const totalApproved = approvedResult?.total_approved || 0;

        // Calculate available balance
        const availableBalance = totalEarnings - pendingWithdrawals - totalApproved;

        return c.json({
            success: true,
            balance: {
                total_earnings: totalEarnings,
                pending_withdrawals: pendingWithdrawals,
                total_approved: totalApproved,
                available_balance: availableBalance
            }
        });

    } catch (error) {
        console.error('Balance check error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to fetch balance' 
        }, 500);
    }
});

export default withdrawalRoutes;
