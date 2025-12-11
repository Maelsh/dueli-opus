/**
 * Auth Controller
 * متحكم المصادقة
 * 
 * Handles all authentication operations.
 */

import { BaseController, AppContext } from './base/BaseController';
import { UserModel, SessionModel } from '../models';
import { EmailService } from '../lib/services/EmailService';
import { CryptoUtils } from '../lib/services/CryptoUtils';
import type { Bindings } from '../config/types';

/**
 * Auth Controller Class
 */
export class AuthController extends BaseController {
    private userModel: UserModel;
    private sessionModel: SessionModel;
    private emailService: EmailService;

    constructor(db: D1Database, resendApiKey: string) {
        super();
        this.userModel = new UserModel(db);
        this.sessionModel = new SessionModel(db);
        this.emailService = new EmailService(resendApiKey);
    }

    /**
     * Register new user
     * POST /api/auth/register
     */
    async register(c: AppContext) {
        try {
            const body = await this.getBody<{
                email: string;
                username: string;
                displayName: string;
                password: string;
                country?: string;
                language?: string;
            }>(c);

            if (!body) {
                return this.validationError(c, this.t('error_invalid_request', c));
            }

            const { email, username, displayName, password, country, language } = body;

            // Validation
            if (!email || !username || !displayName || !password) {
                return this.validationError(c, this.t('error_required_fields', c));
            }

            if (password.length < 8) {
                return this.validationError(c, this.t('password_min_length', c));
            }

            // Check existing
            if (await this.userModel.emailExists(email)) {
                return this.error(c, this.t('error_email_exists', c));
            }

            if (await this.userModel.usernameExists(username)) {
                return this.error(c, this.t('error_username_exists', c));
            }

            // Create user
            const passwordHash = await CryptoUtils.hashPassword(password);
            const verificationToken = CryptoUtils.generateToken();

            const user = await this.userModel.create({
                email,
                username,
                display_name: displayName,
                password_hash: passwordHash,
                country: country || 'US',
                language: language || this.getLanguage(c),
                verification_token: verificationToken
            });

            // Send verification email
            const origin = c.req.header('origin') || c.req.url;
            await this.emailService.sendVerificationEmail(
                email,
                verificationToken,
                displayName,
                this.getLanguage(c),
                origin
            );

            return this.success(c, {
                message: this.t('auth_register_success', c),
                userId: user.id
            }, 201);

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Verify email
     * GET /api/auth/verify
     */
    async verifyEmail(c: AppContext) {
        try {
            const token = this.getQuery(c, 'token');

            if (!token) {
                return this.validationError(c, this.t('error_invalid_token', c));
            }

            const user = await this.userModel.findByVerificationToken(token);

            if (!user) {
                return this.error(c, this.t('error_invalid_token', c));
            }

            await this.userModel.verifyEmail(user.id);

            return this.success(c, {
                message: this.t('auth_email_verified', c)
            });

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
            const body = await this.getBody<{
                email: string;
                password: string;
            }>(c);

            if (!body || !body.email || !body.password) {
                return this.validationError(c, this.t('error_email_password_required', c));
            }

            const user = await this.userModel.findByEmail(body.email);

            if (!user) {
                return this.error(c, this.t('error_invalid_credentials', c), 401);
            }

            // Check password
            const passwordHash = await CryptoUtils.hashPassword(body.password);
            const storedHash = (user as any).password_hash;

            if (passwordHash !== storedHash) {
                return this.error(c, this.t('error_invalid_credentials', c), 401);
            }

            // Check verified
            if (!(user as any).is_verified) {
                return this.error(c, this.t('error_email_not_verified', c));
            }

            // Create session
            const session = await this.sessionModel.create({ user_id: user.id });

            return this.success(c, {
                user: {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    display_name: user.display_name,
                    avatar_url: user.avatar_url,
                    country: user.country,
                    language: user.language
                },
                sessionId: session.id
            });

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Logout
     * POST /api/auth/logout
     */
    async logout(c: AppContext) {
        try {
            const authHeader = c.req.header('Authorization');
            const sessionId = authHeader?.replace('Bearer ', '');

            if (sessionId) {
                await this.sessionModel.deleteBySessionId(sessionId);
            }

            return this.success(c, { message: 'Logged out' });

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Forgot password - Step 1: Send code
     * POST /api/auth/forgot-password
     */
    async forgotPassword(c: AppContext) {
        try {
            const body = await this.getBody<{ email: string }>(c);

            if (!body?.email) {
                return this.validationError(c, this.t('error_email_required', c));
            }

            const user = await this.userModel.findByEmail(body.email);

            if (!user) {
                // Don't reveal if email exists
                return this.success(c, { message: this.t('reset_code_sent', c) });
            }

            // Generate reset code
            const resetCode = CryptoUtils.generateNumericCode(6);
            const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 minutes

            await this.userModel.setResetToken(user.id, resetCode, expiresAt);

            // Send email
            await this.emailService.sendPasswordResetEmail(
                body.email,
                resetCode,
                this.getLanguage(c)
            );

            return this.success(c, { message: this.t('reset_code_sent', c) });

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Reset password - Step 2: Verify code and set new password
     * POST /api/auth/reset-password
     */
    async resetPassword(c: AppContext) {
        try {
            const body = await this.getBody<{
                email: string;
                code: string;
                newPassword: string;
            }>(c);

            if (!body?.email || !body?.code || !body?.newPassword) {
                return this.validationError(c, this.t('error_required_fields', c));
            }

            if (body.newPassword.length < 8) {
                return this.validationError(c, this.t('password_min_length', c));
            }

            const user = await this.userModel.findByEmail(body.email);

            if (!user) {
                return this.error(c, this.t('error_invalid_code', c));
            }

            // Verify code (stored in reset_token)
            const storedCode = (user as any).reset_token;
            const expiresAt = (user as any).reset_token_expires;

            if (storedCode !== body.code || new Date(expiresAt) < new Date()) {
                return this.error(c, this.t('error_invalid_code', c));
            }

            // Update password
            const passwordHash = await CryptoUtils.hashPassword(body.newPassword);
            await this.userModel.updatePassword(user.id, passwordHash);

            return this.success(c, { message: this.t('password_reset_success', c) });

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }

    /**
     * Check auth status
     * GET /api/auth/me
     */
    async me(c: AppContext) {
        try {
            const authHeader = c.req.header('Authorization');
            const sessionId = authHeader?.replace('Bearer ', '');

            if (!sessionId) {
                return this.unauthorized(c);
            }

            const result = await this.sessionModel.findValidSession(sessionId);

            if (!result) {
                return this.unauthorized(c);
            }

            return this.success(c, { user: result.user });

        } catch (error) {
            return this.serverError(c, error as Error);
        }
    }
}

export default AuthController;
