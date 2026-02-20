/**
 * User Blocks API Routes
 * مسارات API لحظر المستخدمين
 * Plan Solution 6: الحذف المتبادل + الحظر
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';
import { UserStatusService } from '../../../lib/services/UserStatusService';

const blocksRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

blocksRoutes.use('*', authMiddleware({ required: true }));

/**
 * Get blocked users list
 * GET /api/blocks
 */
blocksRoutes.get('/', async (c) => {
    const user = c.get('user') as any;
    const service = new UserStatusService(c.env.DB);
    const blocked = await service.getBlockedUsers(user.id);
    return c.json({ success: true, data: blocked });
});

/**
 * Block a user
 * POST /api/blocks
 */
blocksRoutes.post('/', async (c) => {
    const user = c.get('user') as any;
    const { user_id, reason } = await c.req.json();

    if (!user_id) {
        return c.json({ success: false, error: 'user_id is required' }, 422);
    }

    if (user_id === user.id) {
        return c.json({ success: false, error: 'Cannot block yourself' }, 400);
    }

    const service = new UserStatusService(c.env.DB);
    await service.blockUser(user.id, user_id, reason);
    return c.json({ success: true, data: { blocked: true } });
});

/**
 * Unblock a user
 * DELETE /api/blocks/:userId
 */
blocksRoutes.delete('/:userId', async (c) => {
    const user = c.get('user') as any;
    const blockedId = parseInt(c.req.param('userId'));

    const service = new UserStatusService(c.env.DB);
    const unblocked = await service.unblockUser(user.id, blockedId);

    if (!unblocked) {
        return c.json({ success: false, error: 'Block not found' }, 404);
    }

    return c.json({ success: true, data: { unblocked: true } });
});

export default blocksRoutes;
