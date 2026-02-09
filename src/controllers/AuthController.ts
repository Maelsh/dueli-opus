/**
 * Auth Controller
 * متحكم المصادقة
 * 
 * MVC-compliant controller for all authentication operations.
 * Gets dependencies from Hono context.
 */

import { BaseController, AppContext } from './base/BaseController';
import { UserModel, SessionModel } from '../models';
import { EmailService } from '../lib/services/EmailService';
import { CryptoUtils } from '../lib/services/CryptoUtils';

/**
 * Auth Controller Class
 * متحكم المصادقة
 */
export class AuthController extends BaseController {

    /**
     * Register new user
     * POST /api/auth/register
     */
    async register(c: AppContext) {
        try {
            const { DB, EMAIL_API_KEY, EMAIL_API_URL, EMAIL_FROM } = c.env;

            if (!EMAIL_API_KEY || !EMAIL_API_URL) {
                console.error('Missing EMAIL_API_KEY or EMAIL_API_URL');
                return this.error(c, 'Server configuration error', 500);
            }

            const body = await this.getBody<{
                name: string;
                email: string;
                password: string;
                country?: string;
                language?: string;
            }>(c);

            // Debug logging
            console.log('[Register] Received body:', JSON.stringify(body));

            if (!body?.name || !body?.email || !body?.password) {
                console.log('[Register] Validation failed - missing fields');
                return this.validationError(c, this.t('auth_all_fields_required', c));
            }

            if (body.password.length < 8) {
                return this.validationError(c, this.t('password_min_length', c));
            }

            const userModel = new UserModel(DB);

            // Check existing
            if (await userModel.emailExists(body.email)) {
                return this.error(c, this.t('auth_email_exists', c));
            }

            // Generate username from name
            const baseUsername = body.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            let username = baseUsername;
            let counter = 1;
            while (await userModel.usernameExists(username)) {
                username = `${baseUsername}${counter++}`;
            }

            // Create user
            const passwordHash = await CryptoUtils.hashPassword(body.password);
            const verificationToken = CryptoUtils.generateToken();
            const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            const user = await userModel.create({
                email: body.email,
                username,
                display_name: body.name,
                password_hash: passwordHash,
                country: body.country || 'SA',
                language: body.language || this.getLanguage(c),
                verification_token: verificationToken,
                verification_token_expires: tokenExpiry
            });

            // Send verification email
            const origin = c.req.header('origin') || `https://${c.req.header('host')}`;
            const emailService = new EmailService(EMAIL_API_KEY, EMAIL_API_URL, EMAIL_FROM);
            await emailService.sendVerificationEmail(
                body.email,
                verificationToken,
                body.name,
                this.getLanguage(c),
                origin
            );

            return this.success(c, {
                message: this.t('auth_register_success', c)
            }, 201);
        } catch (error) {
            console.error('[Register] Error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Verify email
     * GET /api/auth/verify
     */
    async verifyEmail(c: AppContext) {
        try {
            const { DB } = c.env;
            const token = this.getQuery(c, 'token');

            if (!token) {
                return this.validationError(c, this.t('auth_invalid_token', c));
            }

            const userModel = new UserModel(DB);
            const user = await userModel.findByVerificationToken(token);

            if (!user) {
                return this.error(c, this.t('auth_invalid_token', c));
            }

            await userModel.verifyEmail(user.id);

            return this.success(c, {
                message: this.t('auth_email_verified', c)
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Resend verification email
     * POST /api/auth/resend-verification
     */
    async resendVerification(c: AppContext) {
        try {
            const { DB, EMAIL_API_KEY, EMAIL_API_URL, EMAIL_FROM } = c.env;

            if (!EMAIL_API_KEY || !EMAIL_API_URL) {
                return this.error(c, 'Server configuration error', 500);
            }

            const body = await this.getBody<{ email: string }>(c);
            if (!body?.email) {
                return this.validationError(c, this.t('auth_email_required', c));
            }

            const userModel = new UserModel(DB);
            const user = await userModel.findByEmail(body.email);

            if (!user || (user as any).is_verified) {
                // Don't reveal if user exists
                return this.success(c, { message: this.t('auth_verification_resent', c) });
            }

            const verificationToken = CryptoUtils.generateToken();
            const tokenExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            await userModel.setVerificationToken(user.id, verificationToken, tokenExpiry);

            const origin = c.req.header('origin') || `https://${c.req.header('host')}`;
            const emailService = new EmailService(EMAIL_API_KEY, EMAIL_API_URL, EMAIL_FROM);
            await emailService.sendVerificationEmail(
                body.email,
                verificationToken,
                user.display_name || user.username,
                this.getLanguage(c),
                origin
            );

            return this.success(c, { message: this.t('auth_verification_resent', c) });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Login
     * POST /api/auth/login
     */
    async login(c: AppContext) {
        try {
            const { DB } = c.env;

            const body = await this.getBody<{
                email: string;
                password: string;
            }>(c);

            if (!body?.email || !body?.password) {
                return this.validationError(c, this.t('auth_email_password_required', c));
            }

            const userModel = new UserModel(DB);
            const user = await userModel.findByEmail(body.email);

            if (!user) {
                return this.error(c, this.t('auth_invalid_credentials', c), 401);
            }

            // Check password
            const passwordHash = await CryptoUtils.hashPassword(body.password);
            if (passwordHash !== (user as any).password_hash) {
                return this.error(c, this.t('auth_invalid_credentials', c), 401);
            }

            // Check verified
            if (!(user as any).is_verified) {
                return this.error(c, this.t('auth_email_not_verified', c));
            }

            // Create session
            const sessionModel = new SessionModel(DB);
            const session = await sessionModel.create({ user_id: user.id });

            return this.success(c, {
                sessionId: session.id,
                user: {
                    id: user.id,
                    name: user.display_name,
                    email: user.email,
                    avatar: user.avatar_url,
                    is_admin: (user as any).is_admin
                }
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Check session / Get current user
     * GET /api/auth/session
     */
    async getSession(c: AppContext) {
        try {
            const { DB } = c.env;
            const sessionId = c.req.header('Authorization')?.replace('Bearer ', '');

            if (!sessionId) {
                return this.success(c, { user: null });
            }

            const sessionModel = new SessionModel(DB);
            const result = await sessionModel.findValidSession(sessionId);

            if (!result) {
                return this.success(c, { user: null });
            }

            return this.success(c, {
                user: {
                    id: result.user.id,
                    name: result.user.display_name,
                    email: result.user.email,
                    avatar: result.user.avatar_url,
                    username: result.user.username,
                    is_admin: (result.user as any).is_admin
                }
            });
        } catch (error) {
            return this.success(c, { user: null });
        }
    }

    /**
     * Logout
     * POST /api/auth/logout
     */
    async logout(c: AppContext) {
        try {
            const { DB } = c.env;
            const sessionId = c.req.header('Authorization')?.replace('Bearer ', '');

            if (sessionId) {
                const sessionModel = new SessionModel(DB);
                await sessionModel.deleteBySessionId(sessionId);
            }

            return this.success(c, { success: true });
        } catch (error) {
            return this.success(c, { success: true });
        }
    }

    /**
     * Forgot password - Send reset code
     * POST /api/auth/forgot-password
     */
    async forgotPassword(c: AppContext) {
        try {
            const { DB, EMAIL_API_KEY, EMAIL_API_URL, EMAIL_FROM } = c.env;

            if (!EMAIL_API_KEY || !EMAIL_API_URL) {
                return this.error(c, 'Server configuration error', 500);
            }

            const body = await this.getBody<{ email: string }>(c);
            if (!body?.email) {
                return this.validationError(c, this.t('auth_email_required', c));
            }

            const userModel = new UserModel(DB);
            const user = await userModel.findByEmail(body.email);

            // Always return success to not reveal if email exists
            if (!user) {
                return this.success(c, { message: this.t('auth_reset_code_sent', c) });
            }

            const resetCode = CryptoUtils.generateNumericCode(6);
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

            await userModel.setResetToken(user.id, resetCode, expiresAt);

            const emailService = new EmailService(EMAIL_API_KEY, EMAIL_API_URL, EMAIL_FROM);
            await emailService.sendPasswordResetEmail(
                body.email,
                resetCode,
                this.getLanguage(c)
            );

            return this.success(c, { message: this.t('auth_reset_code_sent', c) });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Verify reset code
     * POST /api/auth/verify-reset-code
     */
    async verifyResetCode(c: AppContext) {
        try {
            const { DB } = c.env;

            const body = await this.getBody<{ email: string; code: string }>(c);
            if (!body?.email || !body?.code) {
                return this.validationError(c, this.t('auth_email_code_required', c));
            }

            const userModel = new UserModel(DB);
            const user = await userModel.findByEmail(body.email);

            if (!user) {
                return this.error(c, this.t('auth_invalid_code', c));
            }

            const storedCode = (user as any).reset_token;
            const expiresAt = (user as any).reset_token_expires;

            if (storedCode !== body.code || new Date(expiresAt) < new Date()) {
                return this.error(c, this.t('auth_invalid_code', c));
            }

            return this.success(c, {
                valid: true,
                message: this.t('auth_code_verified', c)
            });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Reset password
     * POST /api/auth/reset-password
     */
    async resetPassword(c: AppContext) {
        try {
            const { DB } = c.env;

            const body = await this.getBody<{
                email: string;
                code: string;
                newPassword: string;
            }>(c);

            if (!body?.email || !body?.code || !body?.newPassword) {
                return this.validationError(c, this.t('auth_password_required', c));
            }

            if (body.newPassword.length < 8) {
                return this.validationError(c, this.t('password_min_length', c));
            }

            const userModel = new UserModel(DB);
            const user = await userModel.findByEmail(body.email);

            if (!user) {
                return this.error(c, this.t('auth_invalid_code', c));
            }

            const storedCode = (user as any).reset_token;
            const expiresAt = (user as any).reset_token_expires;

            if (storedCode !== body.code || new Date(expiresAt) < new Date()) {
                return this.error(c, this.t('auth_invalid_code', c));
            }

            const passwordHash = await CryptoUtils.hashPassword(body.newPassword);
            await userModel.updatePassword(user.id, passwordHash);

            return this.success(c, { message: this.t('auth_password_changed', c) });
        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default AuthController;
