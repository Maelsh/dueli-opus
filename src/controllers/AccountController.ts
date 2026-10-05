/**
 * @file src/controllers/AccountController.ts
 * @description Self-service account settings (R2-A): authenticated
 * username / password / email change with validation, correct session
 * lifecycle and an audit row per sensitive change. Never returns
 * password hashes or secrets.
 * @module controllers/AccountController
 */

import { BaseController, AppContext } from './base/BaseController';
import { UserModel } from '../models/UserModel';
import { SessionModel } from '../models/SessionModel';
import { AdminAuditLogModel } from '../models/AdminAuditLogModel';
import { CryptoUtils } from '../lib/services/CryptoUtils';

/** Mirrors register's implicit rule (lowercased alphanumerics), made explicit. */
const USERNAME_RE = /^[a-z0-9][a-z0-9_.]{1,28}[a-z0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function safeAccountDTO(user: any) {
    return {
        id: user.id,
        username: user.username ?? null,
        display_name: user.display_name ?? user.username ?? null,
        avatar_url: user.avatar_url ?? null,
        email: user.email,
        language: user.language ?? null,
        country: user.country ?? null,
        is_admin: user.is_admin ?? 0,
        is_verified: user.is_verified ?? 0,
    };
}

export class AccountController extends BaseController {

    /**
     * Change own username.
     * PUT /api/account/username { username }
     * Sessions are kept (identity token unaffected by a rename).
     */
    async updateUsername(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const me = this.getCurrentUser(c);
            const body = await this.getBody<{ username: string }>(c);
            const username = (body?.username || '').trim().toLowerCase();
            if (!username) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }
            if (!USERNAME_RE.test(username)) {
                return this.validationError(c, this.t('account.username_invalid', c));
            }
            const userModel = new UserModel(c.env.DB);
            if (username !== me.username) {
                if (await userModel.usernameExists(username)) {
                    return this.error(c, this.t('account.username_taken', c), 409);
                }
            }
            const updated = await userModel.update(me.id, { username });
            if (!updated) return this.notFound(c);

            try {
                await new AdminAuditLogModel(c.env.DB).log(
                    me.id, 'account_username_changed', 'user', me.id,
                    `Username changed to ${username}`
                );
            } catch (auditError) {
                console.error('[AccountController] audit failed:', auditError);
            }
            return this.success(c, { user: safeAccountDTO(updated), message: this.t('account.username_updated', c) });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Change own password.
     * PUT /api/account/password { current_password, new_password }
     * Requires the current password; destroys ALL sessions (including the
     * caller — same lifecycle as the reset-password precedent) so the
     * client must re-authenticate.
     */
    async updatePassword(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const me = this.getCurrentUser(c);
            const body = await this.getBody<{ current_password: string; new_password: string }>(c);
            if (!body?.current_password || !body?.new_password) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }
            if (body.new_password.length < 8) {
                return this.validationError(c, this.t('password_min_length', c));
            }
            const userModel = new UserModel(c.env.DB);
            const fresh = await userModel.findById(me.id);
            if (!fresh) return this.notFound(c);
            if (!(await CryptoUtils.verifyPassword(body.current_password, (fresh as any).password_hash))) {
                return this.error(c, this.t('account.current_password_incorrect', c), 401);
            }
            const hash = await CryptoUtils.hashPassword(body.new_password);
            await userModel.updatePassword(me.id, hash);
            const killed = await new SessionModel(c.env.DB).deleteByUser(me.id);

            try {
                await new AdminAuditLogModel(c.env.DB).log(
                    me.id, 'account_password_changed', 'user', me.id,
                    `Password changed; ${killed} session(s) destroyed`
                );
            } catch (auditError) {
                console.error('[AccountController] audit failed:', auditError);
            }
            return this.success(c, {
                updated: true,
                reauth_required: true,
                sessions_destroyed: killed,
                message: this.t('account.password_updated', c),
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Change own email.
     * PUT /api/account/email { email }
     * Normalized (trim + lowercase, R2-AUTH-1 rule); resets verification
     * with a fresh token — the caller completes via the resend-verification
     * flow. Sessions are kept (no credential compromise).
     */
    async updateEmail(c: AppContext) {
        try {
            if (!this.requireAuth(c)) return this.unauthorized(c);
            const me = this.getCurrentUser(c);
            const body = await this.getBody<{ email: string }>(c);
            const email = (body?.email || '').trim().toLowerCase();
            if (!email) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }
            if (!EMAIL_RE.test(email)) {
                return this.validationError(c, this.t('account.email_invalid', c));
            }
            const userModel = new UserModel(c.env.DB);
            if (email !== (me.email || '').toLowerCase()) {
                if (await userModel.emailExists(email)) {
                    return this.error(c, this.t('account.email_taken', c), 409);
                }
            } else {
                return this.success(c, {
                    user: safeAccountDTO(await userModel.findById(me.id)),
                    reverify_required: false,
                    message: this.t('account.email_updated', c),
                });
            }
            const token = CryptoUtils.generateToken();
            const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
            // No Sanitize here: the address already passed the strict format
            // check, and HTML-escaping would corrupt valid local-parts.
            await userModel.update(me.id, { email });
            await userModel.update(me.id, { is_verified: false });
            await userModel.setVerificationToken(me.id, token, expires);
            const updated = await userModel.findById(me.id);

            try {
                await new AdminAuditLogModel(c.env.DB).log(
                    me.id, 'account_email_changed', 'user', me.id,
                    'Email changed; verification reset'
                );
            } catch (auditError) {
                console.error('[AccountController] audit failed:', auditError);
            }
            return this.success(c, {
                user: safeAccountDTO(updated),
                reverify_required: true,
                message: this.t('account.email_updated', c),
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default AccountController;
