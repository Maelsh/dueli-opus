/**
 * @file modules/auth/routes.ts
 * @description مسارات المصادقة
 * @description_en Authentication routes
 * @module modules/auth
 * @version 1.0.0
 * @author Dueli Team
 */

import { Hono } from 'hono';
import { authController } from './AuthController';
import type { Bindings, Variables } from '../../core/http/types';

/**
 * مسارات المصادقة
 * Authentication routes
 */
const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// التسجيل وتسجيل الدخول
authRoutes.post('/register', (c) => authController.register(c));
authRoutes.post('/login', (c) => authController.login(c));

// الجلسة
authRoutes.get('/session', (c) => authController.getSession(c));
authRoutes.post('/logout', (c) => authController.logout(c));

// التحقق من البريد
authRoutes.get('/verify', (c) => authController.verifyEmail(c));
authRoutes.post('/resend-verification', (c) => authController.resendVerification(c));

// إعادة تعيين كلمة المرور
authRoutes.post('/forgot-password', (c) => authController.forgotPassword(c));
authRoutes.post('/verify-reset-code', (c) => authController.verifyResetCode(c));
authRoutes.post('/reset-password', (c) => authController.resetPassword(c));

// OAuth
authRoutes.get('/oauth/:provider', (c) => authController.startOAuth(c));
authRoutes.get('/oauth/:provider/callback', (c) => authController.handleOAuthCallback(c));

// Debug (للتطوير فقط)
authRoutes.get('/debug/oauth', (c) => authController.debugOAuth(c));

export default authRoutes;
