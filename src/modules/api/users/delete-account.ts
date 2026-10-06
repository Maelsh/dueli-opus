/**
 * Account Deletion API
 * API حذف الحساب
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { authMiddleware } from '../../../middleware/auth';
import { CryptoUtils } from '../../../lib/services/CryptoUtils';

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

        // R2-F: the whole deletion runs as ONE db.batch() — D1 executes the
        // batch serially, so a mid-way failure cannot leave a half-deleted
        // account (sessions gone but data kept). Order: anonymize the users
        // row first (the row itself is never deleted — FKs keep pointing at
        // it), then scrub/delete every user-owned row, including sensitive
        // leftovers the first version missed (saved payout/bank details,
        // watch history, blocks, role grants, upload keys, realtime tickets)
        // and PII columns on rows that must persist (donations ledger rows).
        const uid = user.id;
        const reason = body.reason || null;
        await db.batch([
            db.prepare(`
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
            `).bind(reason, uid),
            // 2. Sessions + settings + posts + notifications + follows
            db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(uid),
            db.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(uid),
            db.prepare('DELETE FROM user_posts WHERE user_id = ?').bind(uid),
            db.prepare('DELETE FROM notifications WHERE user_id = ?').bind(uid),
            db.prepare('DELETE FROM follows WHERE follower_id = ? OR following_id = ?').bind(uid, uid),
            // 3. Competitions: anonymize completed, drop pending/live drafts
            // (creator_id is NOT NULL — the anonymized row stays referenced).
            db.prepare(`
                UPDATE competitions
                SET
                    title = '[deleted]',
                    description = NULL,
                    creator_anonymized = 1
                WHERE creator_id = ? AND status = 'completed'
            `).bind(uid),
            // R2-F FK safety: children WITHOUT ON DELETE CASCADE must go
            // before their pending/live competition (else the batch aborts
            // on FK violation and nothing is deleted).
            db.prepare(`DELETE FROM competition_invites WHERE competition_id IN (SELECT id FROM competitions WHERE creator_id = ? AND status IN ('pending', 'live'))`).bind(uid),
            db.prepare(`DELETE FROM competition_requests WHERE competition_id IN (SELECT id FROM competitions WHERE creator_id = ? AND status IN ('pending', 'live'))`).bind(uid),
            db.prepare(`DELETE FROM ratings WHERE competition_id IN (SELECT id FROM competitions WHERE creator_id = ? AND status IN ('pending', 'live'))`).bind(uid),
            db.prepare(`DELETE FROM comments WHERE competition_id IN (SELECT id FROM competitions WHERE creator_id = ? AND status IN ('pending', 'live'))`).bind(uid),
            db.prepare(`DELETE FROM scheduled_competitions WHERE competition_id IN (SELECT id FROM competitions WHERE creator_id = ? AND status IN ('pending', 'live'))`).bind(uid),
            db.prepare(`DELETE FROM competition_scheduled_tasks WHERE competition_id IN (SELECT id FROM competitions WHERE creator_id = ? AND status IN ('pending', 'live'))`).bind(uid),
            db.prepare(`DELETE FROM user_hidden_competitions WHERE user_id = ? OR competition_id IN (SELECT id FROM competitions WHERE creator_id = ? AND status IN ('pending', 'live'))`).bind(uid, uid),
            db.prepare('DELETE FROM user_keywords WHERE user_id = ?').bind(uid),
            db.prepare(`
                DELETE FROM competitions
                WHERE creator_id = ? AND status IN ('pending', 'live')
            `).bind(uid),
            // 4. Comments: user_id is NOT NULL — scrub content, keep the row.
            db.prepare(`
                UPDATE comments
                SET
                    user_anonymized = 1,
                    content = '[deleted]'
                WHERE user_id = ?
            `).bind(uid),
            // 5. Direct messages + conversations (user1_id/user2_id columns).
            db.prepare('DELETE FROM messages WHERE sender_id = ?').bind(uid),
            db.prepare('DELETE FROM conversations WHERE user1_id = ? OR user2_id = ?').bind(uid, uid),
            // 7. Ratings rows stay for result integrity (rater identity lives
            // in the anonymized users row; user_id is NOT NULL).
            // 8. Reports filed by the user.
            db.prepare('DELETE FROM reports WHERE reporter_id = ?').bind(uid),
            // 9. Earnings records.
            db.prepare('DELETE FROM user_earnings WHERE user_id = ?').bind(uid),
            // 10. Ad impressions.
            db.prepare('DELETE FROM ad_impressions WHERE user_id = ?').bind(uid),
            // 11-14. Requests, invitations, reminders, reactions.
            db.prepare('DELETE FROM competition_requests WHERE requester_id = ?').bind(uid),
            db.prepare('DELETE FROM competition_invitations WHERE inviter_id = ? OR invitee_id = ?').bind(uid, uid),
            db.prepare('DELETE FROM competition_reminders WHERE user_id = ?').bind(uid),
            db.prepare('DELETE FROM likes WHERE user_id = ?').bind(uid),
            db.prepare('DELETE FROM dislikes WHERE user_id = ?').bind(uid),
            // R2-F leftovers: sensitive/identifying rows the old sequential
            // version never cleaned (user row persists, so no CASCADE fires).
            db.prepare('DELETE FROM payment_methods WHERE user_id = ?').bind(uid),
            db.prepare('DELETE FROM watch_history WHERE user_id = ?').bind(uid),
            db.prepare('DELETE FROM user_blocks WHERE blocker_id = ? OR blocked_id = ?').bind(uid, uid),
            db.prepare('DELETE FROM admin_roles WHERE user_id = ?').bind(uid),
            db.prepare('DELETE FROM chunk_keys WHERE user_id = ?').bind(uid),
            db.prepare('DELETE FROM realtime_tickets WHERE user_id = ?').bind(uid),
            // Donation ledger rows persist (finance history) — scrub PII only.
            db.prepare('UPDATE donations SET donor_name = NULL, donor_email = NULL, message = NULL WHERE user_id = ?').bind(uid),
        ]);

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

        // R2-F: passwords are PBKDF2 (CryptoUtils) with a legacy SHA-256
        // fallback — the old inline SHA-256 compare rejected every modern
        // hash, so verification always failed for real accounts.
        if (!(await CryptoUtils.verifyPassword(body.password, userRecord.password_hash))) {

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
