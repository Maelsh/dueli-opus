/**
 * Authentication API Routes
 * مسارات API للمصادقة
 */

import { Hono } from 'hono';
import type { Bindings, Variables, ApiResponse, Language } from '../../../config/types';
import { hashPassword, sendVerificationEmail, sendPasswordResetEmail, generateState, isEmailAllowed } from './helpers';
import { GoogleOAuth } from '../../../lib/oauth/google';
import { FacebookOAuth } from '../../../lib/oauth/facebook';
import { MicrosoftOAuth } from '../../../lib/oauth/microsoft';
import { TikTokOAuth } from '../../../lib/oauth/tiktok';
import { translations } from '../../../i18n';

const authRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Register new user - تسجيل مستخدم جديد
 * POST /api/auth/register
 */
authRoutes.post('/register', async (c) => {
  const { DB, RESEND_API_KEY } = c.env;
  const lang = (c.req.query('lang') || 'ar') as Language;
  const tr = translations[lang];

  if (!RESEND_API_KEY) {
    console.error('Missing RESEND_API_KEY');
    return c.json<ApiResponse>({
      success: false,
      error: 'Server configuration error: Missing Email API Key'
    }, 500);
  }

  try {
    const body = await c.req.json();
    const { name, email, password, country, language } = body;

    if (!name || !email || !password) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_all_fields_required
      }, 400);
    }

    // Check if email already exists
    const existingUser = await DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first();
    if (existingUser) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_email_exists
      }, 400);
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate verification token
    const verificationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Generate username from email
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    // Use provided country/language or defaults
    const userCountry = country || 'SA';
    const userLanguage = language || 'ar';

    // Create user
    await DB.prepare(`
      INSERT INTO users (username, email, password_hash, display_name, country, language, verification_token, verification_expires, email_verified, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `).bind(username, email, passwordHash, name, userCountry, userLanguage, verificationToken, expiresAt).run();

    // Get origin from request
    const origin = c.req.header('origin') || `http://${c.req.header('host')}`;

    // Send verification email
    await sendVerificationEmail(email, verificationToken, name, lang, RESEND_API_KEY, origin);

    return c.json<ApiResponse>({
      success: true,
      message: tr.auth_register_success
    });
  } catch (error) {
    console.error('Registration error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: tr.auth_register_failed
    }, 500);
  }
});

/**
 * Verify email - التحقق من البريد
 * GET /api/auth/verify
 */
authRoutes.get('/verify', async (c) => {
  const { DB } = c.env;
  const token = c.req.query('token');
  const lang = (c.req.query('lang') || 'ar') as Language;
  const tr = translations[lang];

  if (!token) {
    return c.json<ApiResponse>({
      success: false,
      error: 'Invalid token'
    }, 400);
  }

  try {
    const user = await DB.prepare(`
      SELECT id, email FROM users 
      WHERE verification_token = ? 
      AND verification_expires > datetime('now')
      AND email_verified = 0
    `).bind(token).first();

    if (!user) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_invalid_link
      }, 400);
    }

    await DB.prepare(`
      UPDATE users 
      SET email_verified = 1, verification_token = NULL, verification_expires = NULL
      WHERE id = ?
    `).bind((user as any).id).run();

    return c.json<ApiResponse>({
      success: true,
      message: tr.auth_account_activated
    });
  } catch (error) {
    console.error('Verification error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Verification failed'
    }, 500);
  }
});

/**
 * Login - تسجيل الدخول
 * POST /api/auth/login
 */
authRoutes.post('/login', async (c) => {
  const { DB } = c.env;
  const lang = (c.req.query('lang') || 'ar') as Language;
  const tr = translations[lang];

  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_email_password_required
      }, 400);
    }

    const user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_invalid_credentials
      }, 401);
    }

    if (!(user as any).email_verified) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_verify_email_first
      }, 403);
    }

    const passwordHash = await hashPassword(password);
    if ((user as any).password_hash !== passwordHash) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_invalid_credentials
      }, 401);
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await DB.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(sessionId, (user as any).id, expiresAt).run();

    return c.json<ApiResponse>({
      success: true,
      data: {
        sessionId,
        user: {
          id: (user as any).id,
          name: (user as any).display_name,
          email: (user as any).email,
          avatar: (user as any).avatar_url
        }
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Login failed'
    }, 500);
  }
});

/**
 * Validate session - التحقق من الجلسة
 * GET /api/auth/session
 */
authRoutes.get('/session', async (c) => {
  const { DB } = c.env;
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '');

  if (!sessionId) {
    return c.json<ApiResponse>({ success: false, data: { user: null } });
  }

  try {
    const session = await DB.prepare(`
      SELECT s.*, u.id as user_id, u.email, u.username, u.display_name, u.avatar_url, u.country, u.language, u.is_admin
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now')
    `).bind(sessionId).first();

    if (!session) {
      return c.json<ApiResponse>({ success: false, data: { user: null } });
    }

    return c.json<ApiResponse>({
      success: true,
      data: {
        user: {
          id: (session as any).user_id,
          email: (session as any).email,
          username: (session as any).username,
          display_name: (session as any).display_name,
          avatar_url: (session as any).avatar_url,
          country: (session as any).country,
          language: (session as any).language,
          is_admin: (session as any).is_admin
        }
      }
    });
  } catch (error) {
    return c.json<ApiResponse>({ success: false, data: { user: null } });
  }
});

/**
 * Logout - تسجيل الخروج
 * POST /api/auth/logout
 */
authRoutes.post('/logout', async (c) => {
  const { DB } = c.env;
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '');

  if (sessionId) {
    try {
      await DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    } catch (error) { }
  }

  return c.json<ApiResponse>({ success: true });
});

/**
 * Resend verification email - إعادة إرسال بريد التحقق
 * POST /api/auth/resend-verification
 */
authRoutes.post('/resend-verification', async (c) => {
  const { DB, RESEND_API_KEY } = c.env;
  const lang = (c.req.query('lang') || 'ar') as Language;
  const tr = translations[lang];

  try {
    const body = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_email_required
      }, 400);
    }

    const user = await DB.prepare('SELECT * FROM users WHERE email = ? AND email_verified = 0').bind(email).first();
    if (!user) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_user_not_found
      }, 404);
    }

    const verificationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await DB.prepare(`
      UPDATE users 
      SET verification_token = ?, verification_expires = ?
      WHERE id = ?
    `).bind(verificationToken, expiresAt, (user as any).id).run();

    const origin = c.req.header('origin') || `http://${c.req.header('host')}`;
    await sendVerificationEmail(email, verificationToken, (user as any).display_name, lang, RESEND_API_KEY, origin);

    return c.json<ApiResponse>({
      success: true,
      message: tr.auth_verification_resent
    });
  } catch (error) {
    console.error('Resend verification error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to resend verification'
    }, 500);
  }
});

/**
 * Request password reset - طلب إعادة تعيين كلمة المرور
 * POST /api/auth/forgot-password
 */
authRoutes.post('/forgot-password', async (c) => {
  const { DB, RESEND_API_KEY } = c.env;
  const lang = (c.req.query('lang') || 'ar') as Language;
  const tr = translations[lang];

  try {
    const body = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_email_required
      }, 400);
    }

    const user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
    if (!user) {
      return c.json<ApiResponse>({
        success: true,
        message: tr.auth_reset_if_exists
      });
    }

    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await DB.prepare(`
      UPDATE users 
      SET reset_token = ?, reset_expires = ?
      WHERE id = ?
    `).bind(resetCode, expiresAt, (user as any).id).run();

    await sendPasswordResetEmail(email, resetCode, lang, RESEND_API_KEY);

    return c.json<ApiResponse>({
      success: true,
      message: tr.auth_reset_code_sent
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to process request'
    }, 500);
  }
});

/**
 * Verify reset code - التحقق من رمز إعادة التعيين
 * POST /api/auth/verify-reset-code
 */
authRoutes.post('/verify-reset-code', async (c) => {
  const { DB } = c.env;
  const lang = (c.req.query('lang') || 'ar') as Language;
  const tr = translations[lang];

  try {
    const body = await c.req.json();
    const { email, code } = body;

    if (!email || !code) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_email_code_required
      }, 400);
    }

    const user = await DB.prepare(`
      SELECT id FROM users 
      WHERE email = ? 
      AND reset_token = ?
      AND reset_expires > datetime('now')
    `).bind(email, code).first();

    if (!user) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_invalid_code
      }, 400);
    }

    return c.json<ApiResponse>({
      success: true,
      message: tr.auth_code_verified
    });
  } catch (error) {
    console.error('Verify code error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Verification failed'
    }, 500);
  }
});

/**
 * Reset password - إعادة تعيين كلمة المرور
 * POST /api/auth/reset-password
 */
authRoutes.post('/reset-password', async (c) => {
  const { DB } = c.env;
  const lang = (c.req.query('lang') || 'ar') as Language;
  const tr = translations[lang];

  try {
    const body = await c.req.json();
    const { email, code, newPassword } = body;

    if (!email || !code || !newPassword) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_all_fields_required
      }, 400);
    }

    const user = await DB.prepare(`
      SELECT id FROM users 
      WHERE email = ? 
      AND reset_token = ?
      AND reset_expires > datetime('now')
    `).bind(email, code).first();

    if (!user) {
      return c.json<ApiResponse>({
        success: false,
        error: tr.auth_invalid_code
      }, 400);
    }

    const passwordHash = await hashPassword(newPassword);

    await DB.prepare(`
      UPDATE users 
      SET password_hash = ?, reset_token = NULL, reset_expires = NULL
      WHERE id = ?
    `).bind(passwordHash, (user as any).id).run();

    return c.json<ApiResponse>({
      success: true,
      message: tr.auth_password_changed
    });
  } catch (error) {
    console.error('Reset password error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to reset password'
    }, 500);
  }
});

/**
 * OAuth simulation - محاكاة OAuth
 * POST /api/auth/oauth
 */
authRoutes.post('/oauth', async (c) => {
  const { DB } = c.env;

  try {
    const body = await c.req.json();
    const { provider, email, name, avatar } = body;

    if (!provider || !email) {
      return c.json<ApiResponse>({
        success: false,
        error: 'Missing provider or email'
      }, 400);
    }

    let user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();

    if (!user) {
      const username = email.split('@')[0] + '_' + Math.random().toString(36).substring(7);
      const result = await DB.prepare(`
        INSERT INTO users (email, username, password_hash, display_name, avatar_url)
        VALUES (?, ?, ?, ?, ?)
      `).bind(email, username, 'oauth_' + provider, name || username, avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`).run();

      user = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(result.meta.last_row_id).first();
    }

    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await DB.prepare(`
      INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)
    `).bind(sessionId, (user as any).id, expiresAt).run();

    return c.json<ApiResponse>({
      success: true,
      data: {
        user: {
          id: (user as any).id,
          email: (user as any).email,
          username: (user as any).username,
          display_name: (user as any).display_name,
          avatar_url: (user as any).avatar_url,
          country: (user as any).country,
          language: (user as any).language
        },
        sessionId
      }
    });
  } catch (error) {
    console.error('OAuth error:', error);
    return c.json<ApiResponse>({
      success: false,
      error: 'Failed to authenticate'
    }, 500);
  }
});

export default authRoutes;
