/**
 * Authentication API Routes
 * مسارات API للمصادقة
 * 
 * MVC-compliant: Routes delegate to AuthController
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { AuthController } from '../../../controllers';

const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new AuthController();

// ============================================
// Authentication Routes
// ============================================

/**
 * Register new user
 * POST /api/auth/register
 */
authRoutes.post('/register', (c) => controller.register(c));

/**
 * Verify email
 * GET /api/auth/verify
 */
authRoutes.get('/verify', (c) => controller.verifyEmail(c));

/**
 * Resend verification email
 * POST /api/auth/resend-verification
 */
authRoutes.post('/resend-verification', (c) => controller.resendVerification(c));

/**
 * Login
 * POST /api/auth/login
 */
authRoutes.post('/login', (c) => controller.login(c));

/**
 * Get session / current user
 * GET /api/auth/session
 */
authRoutes.get('/session', (c) => controller.getSession(c));

/**
 * Logout
 * POST /api/auth/logout
 */
authRoutes.post('/logout', (c) => controller.logout(c));

/**
 * Forgot password
 * POST /api/auth/forgot-password
 */
authRoutes.post('/forgot-password', (c) => controller.forgotPassword(c));

/**
 * Verify reset code
 * POST /api/auth/verify-reset-code
 */
authRoutes.post('/verify-reset-code', (c) => controller.verifyResetCode(c));

/**
 * Reset password
 * POST /api/auth/reset-password
 */
authRoutes.post('/reset-password', (c) => controller.resetPassword(c));

export default authRoutes;
