/**
 * @file modules/auth/AuthController.ts
 * @description متحكم المصادقة - معالجة طلبات HTTP
 * @description_en Authentication Controller - HTTP request handling
 * @module modules/auth
 * @version 1.0.0
 * @author Dueli Team
 */

import { BaseController, ControllerContext, Validator, ValidationSchema } from '../../core';
import { AuthService, RegisterData, LoginData } from './AuthService';
import { GoogleOAuth } from '../../lib/oauth/google';
import { FacebookOAuth } from '../../lib/oauth/facebook';
import { MicrosoftOAuth } from '../../lib/oauth/microsoft';
import { TikTokOAuth } from '../../lib/oauth/tiktok';
import { isEmailAllowed, generateState } from '../../lib/oauth/utils';

/**
 * مخطط التسجيل
 * Registration schema
 */
const registerSchema: ValidationSchema<RegisterData> = {
  email: ['required', 'email'],
  username: ['required', 'string', { minLength: 3 }, { maxLength: 30 }],
  password: ['required', 'string', { minLength: 8 }],
  displayName: ['string', { maxLength: 100 }],
  countryCode: ['string', { maxLength: 2 }],
  preferredLanguage: [{ enum: ['ar', 'en'] as const }]
};

/**
 * مخطط تسجيل الدخول
 * Login schema
 */
const loginSchema: ValidationSchema<LoginData> = {
  email: ['required', 'email'],
  password: ['required', 'string']
};

/**
 * متحكم المصادقة
 * Authentication Controller
 * 
 * يتعامل مع جميع طلبات HTTP المتعلقة بالمصادقة
 */
export class AuthController extends BaseController {
  constructor() {
    super('AuthController');
  }

  /**
   * الحصول على خدمة المصادقة
   * Get auth service instance
   */
  private getService(c: ControllerContext): AuthService {
    return new AuthService(this.getDB(c), this.getEnv(c, 'RESEND_API_KEY'));
  }

  // ============================================
  // Registration - التسجيل
  // ============================================

  /**
   * تسجيل مستخدم جديد
   * POST /api/auth/register
   */
  async register(c: ControllerContext) {
    const result = await this.parseAndValidate<RegisterData>(c, registerSchema);
    
    if (!result.success) {
      return this.validationError(c, result.errors);
    }

    const service = this.getService(c);
    const origin = this.getOrigin(c);
    
    const authResult = await service.register(result.data!, origin);
    
    if (!authResult.success) {
      return this.badRequest(c, authResult.error || 'Registration failed');
    }

    return this.created(c, {
      message: 'Registration successful. Please check your email to verify your account.',
      user: authResult.user
    });
  }

  // ============================================
  // Login - تسجيل الدخول
  // ============================================

  /**
   * تسجيل الدخول
   * POST /api/auth/login
   */
  async login(c: ControllerContext) {
    const result = await this.parseAndValidate<LoginData>(c, loginSchema);
    
    if (!result.success) {
      return this.validationError(c, result.errors);
    }

    const service = this.getService(c);
    const lang = this.getLang(c);
    
    const authResult = await service.login(result.data!, lang);
    
    if (!authResult.success) {
      return this.badRequest(c, authResult.error || 'Login failed');
    }

    // تعيين كوكي الجلسة
    this.setCookie(c, 'session_token', authResult.token!, {
      maxAge: 30 * 24 * 60 * 60, // 30 days
      httpOnly: true,
      secure: true,
      sameSite: 'Lax'
    });

    return this.ok(c, {
      user: authResult.user,
      token: authResult.token
    });
  }

  // ============================================
  // Session - الجلسة
  // ============================================

  /**
   * الحصول على الجلسة الحالية
   * GET /api/auth/session
   */
  async getSession(c: ControllerContext) {
    const token = this.getCookie(c, 'session_token');
    
    if (!token) {
      return this.ok(c, { user: null });
    }

    const service = this.getService(c);
    const user = await service.validateSession(token);

    return this.ok(c, { user });
  }

  /**
   * تسجيل الخروج
   * POST /api/auth/logout
   */
  async logout(c: ControllerContext) {
    const token = this.getCookie(c, 'session_token');
    
    if (token) {
      const service = this.getService(c);
      await service.logout(token);
    }

    this.deleteCookie(c, 'session_token');
    
    return this.ok(c, { message: 'Logged out successfully' });
  }

  // ============================================
  // Email Verification - التحقق من البريد
  // ============================================

  /**
   * التحقق من البريد
   * GET /api/auth/verify?token=xxx
   */
  async verifyEmail(c: ControllerContext) {
    const token = this.getQuery(c, 'token');
    
    if (!token) {
      return this.badRequest(c, 'Verification token is required');
    }

    const service = this.getService(c);
    const result = await service.verifyEmail(token);
    
    if (!result.success) {
      return this.badRequest(c, result.error || 'Verification failed');
    }

    return this.ok(c, { message: 'Email verified successfully' });
  }

  /**
   * إعادة إرسال رمز التحقق
   * POST /api/auth/resend-verification
   */
  async resendVerification(c: ControllerContext) {
    const body = await this.parseBody<{ email: string }>(c);
    
    if (!body?.email || !Validator.isEmail(body.email)) {
      return this.badRequest(c, 'Valid email is required');
    }

    const service = this.getService(c);
    const origin = this.getOrigin(c);
    const lang = this.getLang(c);
    
    const result = await service.resendVerification(body.email, origin, lang);
    
    if (!result.success) {
      return this.badRequest(c, result.error || 'Failed to resend verification');
    }

    return this.ok(c, { message: 'Verification email sent' });
  }

  // ============================================
  // Password Reset - إعادة تعيين كلمة المرور
  // ============================================

  /**
   * طلب إعادة تعيين كلمة المرور
   * POST /api/auth/forgot-password
   */
  async forgotPassword(c: ControllerContext) {
    const body = await this.parseBody<{ email: string }>(c);
    
    if (!body?.email || !Validator.isEmail(body.email)) {
      return this.badRequest(c, 'Valid email is required');
    }

    const service = this.getService(c);
    const lang = this.getLang(c);
    
    await service.forgotPassword(body.email, lang);
    
    // دائماً نرجع نجاح لأسباب أمنية
    return this.ok(c, { message: 'If the email exists, a reset code has been sent' });
  }

  /**
   * التحقق من رمز إعادة التعيين
   * POST /api/auth/verify-reset-code
   */
  async verifyResetCode(c: ControllerContext) {
    const body = await this.parseBody<{ email: string; code: string }>(c);
    
    if (!body?.email || !body?.code) {
      return this.badRequest(c, 'Email and code are required');
    }

    const service = this.getService(c);
    const result = await service.verifyResetCode(body.email, body.code);
    
    if (!result.success) {
      return this.badRequest(c, result.error || 'Invalid code');
    }

    return this.ok(c, { valid: true });
  }

  /**
   * إعادة تعيين كلمة المرور
   * POST /api/auth/reset-password
   */
  async resetPassword(c: ControllerContext) {
    const body = await this.parseBody<{ email: string; code: string; password: string }>(c);
    
    if (!body?.email || !body?.code || !body?.password) {
      return this.badRequest(c, 'Email, code, and new password are required');
    }

    if (body.password.length < 8) {
      return this.badRequest(c, 'Password must be at least 8 characters');
    }

    const service = this.getService(c);
    const result = await service.resetPassword(body.email, body.code, body.password);
    
    if (!result.success) {
      return this.badRequest(c, result.error || 'Failed to reset password');
    }

    return this.ok(c, { message: 'Password reset successfully' });
  }

  // ============================================
  // OAuth - المصادقة الخارجية
  // ============================================

  /**
   * بدء OAuth
   * GET /api/auth/oauth/:provider
   */
  async startOAuth(c: ControllerContext) {
    const provider = this.getParam(c, 'provider');
    const redirectUri = `${this.getOrigin(c)}/api/auth/oauth/${provider}/callback`;
    const state = generateState();
    const lang = this.getLang(c);
    
    let authUrl: string;

    switch (provider) {
      case 'google': {
        const oauth = new GoogleOAuth(
          this.getEnv(c, 'GOOGLE_CLIENT_ID'),
          this.getEnv(c, 'GOOGLE_CLIENT_SECRET'),
          redirectUri
        );
        authUrl = oauth.getAuthUrl(state, lang);
        break;
      }
      case 'facebook': {
        const oauth = new FacebookOAuth(
          this.getEnv(c, 'FACEBOOK_CLIENT_ID'),
          this.getEnv(c, 'FACEBOOK_CLIENT_SECRET'),
          redirectUri
        );
        authUrl = oauth.getAuthUrl(state, lang);
        break;
      }
      case 'microsoft': {
        const oauth = new MicrosoftOAuth(
          this.getEnv(c, 'MICROSOFT_CLIENT_ID'),
          this.getEnv(c, 'MICROSOFT_CLIENT_SECRET'),
          this.getEnv(c, 'MICROSOFT_TENANT_ID'),
          redirectUri
        );
        authUrl = oauth.getAuthUrl(state, lang);
        break;
      }
      case 'tiktok': {
        const oauth = new TikTokOAuth(
          this.getEnv(c, 'TIKTOK_CLIENT_KEY'),
          this.getEnv(c, 'TIKTOK_CLIENT_SECRET'),
          redirectUri
        );
        authUrl = oauth.getAuthUrl(state, lang);
        break;
      }
      default:
        return this.badRequest(c, 'Invalid OAuth provider');
    }

    // حفظ الـ state في كوكي
    this.setCookie(c, 'oauth_state', state, {
      maxAge: 600, // 10 minutes
      httpOnly: true,
      secure: true,
      sameSite: 'Lax'
    });

    return c.redirect(authUrl);
  }

  /**
   * معالجة callback الـ OAuth
   * GET /api/auth/oauth/:provider/callback
   */
  async handleOAuthCallback(c: ControllerContext) {
    const provider = this.getParam(c, 'provider');
    const code = this.getQuery(c, 'code');
    const state = this.getQuery(c, 'state');
    const error = this.getQuery(c, 'error');
    const savedState = this.getCookie(c, 'oauth_state');
    const lang = this.getLang(c);
    const origin = this.getOrigin(c);

    // حذف state cookie
    this.deleteCookie(c, 'oauth_state');

    // التحقق من الأخطاء
    if (error) {
      return c.redirect(`${origin}/?error=oauth_denied`);
    }

    if (!code) {
      return c.redirect(`${origin}/?error=oauth_no_code`);
    }

    if (state !== savedState) {
      return c.redirect(`${origin}/?error=oauth_invalid_state`);
    }

    const redirectUri = `${origin}/api/auth/oauth/${provider}/callback`;
    
    try {
      let oauthUser;

      switch (provider) {
        case 'google': {
          const oauth = new GoogleOAuth(
            this.getEnv(c, 'GOOGLE_CLIENT_ID'),
            this.getEnv(c, 'GOOGLE_CLIENT_SECRET'),
            redirectUri
          );
          oauthUser = await oauth.getUser(code);
          break;
        }
        case 'facebook': {
          const oauth = new FacebookOAuth(
            this.getEnv(c, 'FACEBOOK_CLIENT_ID'),
            this.getEnv(c, 'FACEBOOK_CLIENT_SECRET'),
            redirectUri
          );
          oauthUser = await oauth.getUser(code);
          break;
        }
        case 'microsoft': {
          const oauth = new MicrosoftOAuth(
            this.getEnv(c, 'MICROSOFT_CLIENT_ID'),
            this.getEnv(c, 'MICROSOFT_CLIENT_SECRET'),
            this.getEnv(c, 'MICROSOFT_TENANT_ID'),
            redirectUri
          );
          oauthUser = await oauth.getUser(code);
          break;
        }
        case 'tiktok': {
          const oauth = new TikTokOAuth(
            this.getEnv(c, 'TIKTOK_CLIENT_KEY'),
            this.getEnv(c, 'TIKTOK_CLIENT_SECRET'),
            redirectUri
          );
          oauthUser = await oauth.getUser(code);
          break;
        }
        default:
          return c.redirect(`${origin}/?error=oauth_invalid_provider`);
      }

      // التحقق من البريد المسموح
      if (!isEmailAllowed(oauthUser.email)) {
        return c.redirect(`${origin}/?error=oauth_email_not_allowed`);
      }

      // معالجة OAuth - تحويل النوع
      const service = this.getService(c);
      const normalizedOAuthUser = {
        ...oauthUser,
        provider: oauthUser.provider as 'google' | 'facebook' | 'microsoft' | 'tiktok'
      };
      const result = await service.handleOAuth(normalizedOAuthUser, lang);

      if (!result.success) {
        return c.redirect(`${origin}/?error=oauth_failed`);
      }

      // تعيين كوكي الجلسة
      this.setCookie(c, 'session_token', result.token!, {
        maxAge: 30 * 24 * 60 * 60,
        httpOnly: true,
        secure: true,
        sameSite: 'Lax'
      });

      return c.redirect(`${origin}/?oauth=success`);

    } catch (error) {
      this.error('OAuth callback error', error);
      return c.redirect(`${origin}/?error=oauth_error`);
    }
  }

  // ============================================
  // Debug Endpoints - للتطوير فقط
  // ============================================

  /**
   * عرض إعدادات OAuth (للتطوير)
   * GET /api/auth/debug/oauth
   */
  async debugOAuth(c: ControllerContext) {
    const origin = this.getOrigin(c);
    
    return this.ok(c, {
      google: {
        clientId: this.getEnv(c, 'GOOGLE_CLIENT_ID') ? 'configured' : 'not configured',
        redirectUri: `${origin}/api/auth/oauth/google/callback`
      },
      facebook: {
        clientId: this.getEnv(c, 'FACEBOOK_CLIENT_ID') ? 'configured' : 'not configured',
        redirectUri: `${origin}/api/auth/oauth/facebook/callback`
      },
      microsoft: {
        clientId: this.getEnv(c, 'MICROSOFT_CLIENT_ID') ? 'configured' : 'not configured',
        redirectUri: `${origin}/api/auth/oauth/microsoft/callback`
      },
      tiktok: {
        clientKey: this.getEnv(c, 'TIKTOK_CLIENT_KEY') ? 'configured' : 'not configured',
        redirectUri: `${origin}/api/auth/oauth/tiktok/callback`
      }
    });
  }
}

// تصدير نسخة واحدة
export const authController = new AuthController();
export default AuthController;
