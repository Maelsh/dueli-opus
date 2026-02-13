/**
 * Account Deletion API
 * API حذف الحساب
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';

const deleteAccountRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// Apply auth middleware
deleteAccountRoutes.use('*', authMiddleware({ required: true }));

/**
 * POST /api/users/delete-account
 * Request account deletion with confirmation
 */
deleteAccountRoutes.post('/', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json<{ confirm: boolean; reason?: string }>();
        
        if (!body?.confirm) {
            return c.json({ success: false, error: 'Confirmation required' }, 400);
        }

        const db = c.env.DB;

        // Start deletion process
        // 1. Anonymize user data (GDPR compliant)
        await db.prepare(`
            UPDATE users 
            SET 
                email = 'deleted_' || id || '@deleted.dueli',
                username = 'deleted_' || id,
                display_name = 'Deleted User',
                password_hash = 'deleted',
                avatar_url = NULL,
                bio = NULL,
                is_verified = 0,
                is_active = 0,
                deleted_at = datetime('now'),
                deletion_reason = ?
            WHERE id = ?
        `).bind(body.reason || null, user.id).run();

        // 2. Delete sensitive data
        await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
        await db.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(user.id).run();
        await db.prepare('DELETE FROM user_posts WHERE user_id = ?').bind(user.id).run();
        await db.prepare('DELETE FROM notifications WHERE user_id = ?').bind(user.id).run();
        await db.prepare('DELETE FROM follows WHERE follower_id = ? OR following_id = ?').bind(user.id, user.id).run();

        // 3. Anonymize user's competitions
        await db.prepare(`
            UPDATE competitions 
            SET 
                creator_id = NULL,
                creator_anonymized = 1
            WHERE creator_id = ? AND status = 'completed'
        `).bind(user.id).run();

        // Delete pending competitions
        await db.prepare(`
            DELETE FROM competitions 
            WHERE creator_id = ? AND status IN ('pending', 'live')
        `).bind(user.id).run();

        // 4. Anonymize comments
        await db.prepare(`
            UPDATE comments 
            SET 
                user_id = NULL,
                user_anonymized = 1,
                content = '[deleted]'
            WHERE user_id = ?
        `).bind(user.id).run();

        // 5. Delete messages
        await db.prepare(`
            DELETE FROM messages 
            WHERE sender_id = ?
        `).bind(user.id).run();

        // 6. Delete from conversations
        await db.prepare(`
            DELETE FROM conversation_participants 
            WHERE user_id = ?
        `).bind(user.id).run();

        // 7. Anonymize ratings
        await db.prepare(`
            UPDATE ratings 
            SET user_id = NULL 
            WHERE user_id = ?
        `).bind(user.id).run();

        // 8. Delete reports by user
        await db.prepare(`
            DELETE FROM reports 
            WHERE reporter_id = ?
        `).bind(user.id).run();

        // 9. Delete earnings records
        await db.prepare(`
            DELETE FROM user_earnings 
            WHERE user_id = ?
        `).bind(user.id).run();

        // 10. Delete ad impressions
        await db.prepare(`
            DELETE FROM ad_impressions 
            WHERE user_id = ?
        `).bind(user.id).run();

        // 11. Delete competition requests
        await db.prepare(`
            DELETE FROM competition_requests 
            WHERE requester_id = ?
        `).bind(user.id).run();

        // 12. Delete invitations
        await db.prepare(`
            DELETE FROM competition_invitations 
            WHERE inviter_id = ? OR invitee_id = ?
        `).bind(user.id, user.id).run();

        // 13. Delete reminders
        await db.prepare(`
            DELETE FROM competition_reminders 
            WHERE user_id = ?
        `).bind(user.id).run();

        // 14. Delete likes/dislikes
        await db.prepare(`
            DELETE FROM likes WHERE user_id = ?
        `).bind(user.id).run();
        
        await db.prepare(`
            DELETE FROM dislikes WHERE user_id = ?
        `).bind(user.id).run();

        // Log deletion for audit
        console.log(`[ACCOUNT DELETION] User ${user.id} deleted at ${new Date().toISOString()}`);

        return c.json({
            success: true,
            message: 'Account deleted successfully',
            deleted_at: new Date().toISOString()
        });

    } catch (error) {
        console.error('Account deletion error:', error);
        return c.json({ 
            success: false, 
            error: 'Failed to delete account',
            details: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
    }
});

/**
 * POST /api/users/delete-account/verify
 * Verify deletion with password
 */
deleteAccountRoutes.post('/verify', async (c) => {
    try {
        const user = c.get('user');
        if (!user) {
            return c.json({ success: false, error: 'Unauthorized' }, 401);
        }

        const body = await c.req.json<{ password: string }>();
        
        if (!body?.password) {
            return c.json({ success: false, error: 'Password required' }, 400);
        }

        const db = c.env.DB;

        // Verify password
        const userRecord = await db.prepare(`
            SELECT password_hash FROM users WHERE id = ? AND is_active = 1
        `).bind(user.id).first<{ password_hash: string }>();

        if (!userRecord) {
            return c.json({ success: false, error: 'User not found' }, 404);
        }

        // Use Web Crypto API for password hashing (Cloudflare Workers compatible)
        const encoder = new TextEncoder();
        const data = encoder.encode(body.password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashedInput = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        if (hashedInput !== userRecord.password_hash) {

            return c.json({ success: false, error: 'Invalid password' }, 401);
        }

        return c.json({ success: true, verified: true });

    } catch (error) {
        console.error('Account deletion verification error:', error);
        return c.json({ 
            success: false, 
            error: 'Verification failed' 
        }, 500);
    }
});

export default deleteAccountRoutes;
