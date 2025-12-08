/**
 * @file api/auth.ts
 * @description نقاط نهاية API للمصادقة وإدارة الحسابات
 * @description_en API endpoints for authentication and account management
 * @module api/auth
 * @version 1.0.0
 * @author Dueli Team
 */

import { Hono } from 'hono';
import type { Bindings, Variables, User, Session, OAuthUser, ApiResponse } from '../types';
import { t } from '../i18n';
import { GoogleOAuth } from '../lib/oauth/google';
import { FacebookOAuth } from '../lib/oauth/facebook';
import { MicrosoftOAuth } from '../lib/oauth/microsoft';
import { TikTokOAuth } from '../lib/oauth/tiktok';
import { isEmailAllowed, generateState } from '../lib/oauth/utils';

/**
 * تطبيق Hono للمصادقة
 */
const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ============================================
// دوال مساعدة - Helper Functions
// ============================================

/**
 * تشفير كلمة المرور باستخدام SHA-256
 * @param password - كلمة المرور الأصلية
 * @returns الهاش المشفر
 */
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * إرسال بريد التحقق
 * @param email - البريد الإلكتروني
 * @param token - رمز التحقق
 * @param name - اسم المستخدم
 * @param lang - اللغة
 * @param resendApiKey - مفتاح API للبريد
 * @param origin - رابط الموقع
 */
async function sendVerificationEmail(
  email: string,
  token: string,
  name: string,
  lang: string,
  resendApiKey: string,
  origin: string
): Promise<any> {
  const baseUrl = origin || 'https://project-8e7c178d.pages.dev';
  const verifyUrl = `${baseUrl}/verify?token=${token}&lang=${lang}`;

  const isAr = lang === 'ar';
  const subject = t('emails.verification_subject', lang as any);
  
  const htmlContent = isAr ? `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">${t('general.app_title', 'ar')}</h1>
      </div>
      <h2 style="color: #1f2937;">${t('emails.verification_greeting', 'ar')} ${name}!</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        ${t('emails.verification_message', 'ar')}
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background: linear-gradient(135deg, #7c3aed 0%, #f59e0b 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
          ${t('emails.verification_button', 'ar')}
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        ${t('emails.verification_link_text', 'ar')}
        <br>
        <a href="${verifyUrl}" style="color: #7c3aed;">${verifyUrl}</a>
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 40px">
        ${t('emails.verification_ignore', 'ar')}
      </p>
    </div>
  ` : `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">${t('general.app_title', 'en')}</h1>
      </div>
      <h2 style="color: #1f2937;">${t('emails.verification_greeting', 'en')} ${name}!</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        ${t('emails.verification_message', 'en')}
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background: linear-gradient(135deg, #7c3aed 0%, #f59e0b 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
          ${t('emails.verification_button', 'en')}
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        ${t('emails.verification_link_text', 'en')}
        <br>
        <a href="${verifyUrl}" style="color: #7c3aed;">${verifyUrl}</a>
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 40px;">
        ${t('emails.verification_ignore', 'en')}
      </p>
    </div>
  `;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Dueli <onboarding@resend.dev>',
      to: [email],
      subject,
      html: htmlContent
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('[Auth] Resend API Error:', errorText);
    throw new Error(`Failed to send verification email: ${errorText}`);
  }

  return await response.json();
}

/**
 * الحصول على مزود OAuth
 * @param provider - اسم المزود
 * @param env - متغيرات البيئة
 * @param redirectBase - رابط الموقع الأساسي
 */
function getOAuthProvider(provider: string, env: Bindings, redirectBase: string) {
  const redirectUri = `${redirectBase}/api/auth/oauth/${provider}/callback`;

  switch (provider) {
    case 'google':
      return new GoogleOAuth(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
    case 'facebook':
      return new FacebookOAuth(env.FACEBOOK_CLIENT_ID, env.FACEBOOK_CLIENT_SECRET, redirectUri);
    case 'microsoft':
      return new MicrosoftOAuth(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET, env.MICROSOFT_TENANT_ID, redirectUri);
    case 'tiktok':
      return new TikTokOAuth(env.TIKTOK_CLIENT_KEY, env.TIKTOK_CLIENT_SECRET, redirectUri);
    default:
      return null;
  }
}

// ============================================
// التسجيل - Registration
// ============================================

/**
 * @api {post} /api/auth/register تسجيل مستخدم جديد
 * @apiName Register
 * @apiGroup Auth
 */
app.post('/register', async (c) => {
  const { DB, RESEND_API_KEY } = c.env;
  const lang = (c.req.query('lang') || 'ar') as 'ar' | 'en';

  if (!RESEND_API_KEY) {
    console.error('[Auth] Missing RESEND_API_KEY');
    return c.json({
      success: false,
      error: 'Server configuration error: Missing Email API Key',
    }, 500);
  }

  try {
    const body = await c.req.json();
    const { name, email, password, country, language } = body;

    // التحقق من الحقول المطلوبة
    if (!name || !email || !password) {
      return c.json({
        success: false,
        error: t('auth.all_fields_required', lang),
      }, 400);
    }

    // التحقق من عدم وجود المستخدم
    const existingUser = await DB.prepare(
      'SELECT id FROM users WHERE email = ?'
    ).bind(email).first();

    if (existingUser) {
      return c.json({
        success: false,
        error: t('auth.email_exists', lang),
      }, 400);
    }

    // تشفير كلمة المرور
    const passwordHash = await hashPassword(password);

    // إنشاء رمز التحقق
    const verificationToken = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // إنشاء اسم المستخدم من البريد
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '');

    // إدراج المستخدم
    await DB.prepare(`
      INSERT INTO users (
        username, email, password_hash, display_name, country, language,
        verification_token, verification_expires, email_verified, created_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `).bind(
      username,
      email,
      passwordHash,
      name,
      country || 'SA',
      language || 'ar',
      verificationToken,
      expiresAt
    ).run();

    // إرسال بريد التحقق
    const origin = c.req.header('origin') || `http://${c.req.header('host')}`;
    await sendVerificationEmail(email, verificationToken, name, lang, RESEND_API_KEY, origin);

    return c.json({
      success: true,
      message: t('auth.register_success', lang),
    });
  } catch (error) {
    console.error('[Auth] Registration error:', error);
    return c.json({
      success: false,
      error: t('auth.connection_failed', lang),
    }, 500);
  }
});

// ============================================
// تسجيل الدخول - Login
// ============================================

/**
 * @api {post} /api/auth/login تسجيل الدخول
 * @apiName Login
 * @apiGroup Auth
 */
app.post('/login', async (c) => {
  const { DB } = c.env;
  const lang = (c.req.query('lang') || 'ar') as 'ar' | 'en';

  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({
        success: false,
        error: t('auth.all_fields_required', lang),
      }, 400);
    }

    // جلب المستخدم
    const user = await DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first() as User | null;

    if (!user) {
      return c.json({
        success: false,
        error: t('auth.invalid_credentials', lang),
      }, 401);
    }

    // التحقق من التفعيل
    if (!user.email_verified) {
      return c.json({
        success: false,
        error: t('auth.email_not_verified', lang),
      }, 403);
    }

    // التحقق من كلمة المرور
    const passwordHash = await hashPassword(password);
    if (user.password_hash !== passwordHash) {
      return c.json({
        success: false,
        error: t('auth.invalid_credentials', lang),
      }, 401);
    }

    // إنشاء الجلسة
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await DB.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(sessionId, user.id, expiresAt).run();

    return c.json({
      success: true,
      sessionId,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        avatar_url: user.avatar_url,
      },
    });
  } catch (error) {
    console.error('[Auth] Login error:', error);
    return c.json({
      success: false,
      error: t('auth.connection_failed', lang),
    }, 500);
  }
});

// ============================================
// تحقق من الجلسة - Session Validation
// ============================================

/**
 * @api {get} /api/auth/session التحقق من الجلسة
 * @apiName GetSession
 * @apiGroup Auth
 */
app.get('/session', async (c) => {
  const { DB } = c.env;
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '');

  if (!sessionId) {
    return c.json({ success: false, user: null });
  }

  try {
    const session = await DB.prepare(`
      SELECT s.*, u.id as user_id, u.email, u.username, u.display_name, 
             u.avatar_url, u.country, u.language, u.is_admin
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now')
    `).bind(sessionId).first() as any;

    if (!session) {
      return c.json({ success: false, user: null });
    }

    return c.json({
      success: true,
      user: {
        id: session.user_id,
        email: session.email,
        username: session.username,
        display_name: session.display_name,
        avatar_url: session.avatar_url,
        country: session.country,
        language: session.language,
        is_admin: session.is_admin,
      },
    });
  } catch (error) {
    console.error('[Auth] Session check error:', error);
    return c.json({ success: false, user: null });
  }
});

// ============================================
// تسجيل الخروج - Logout
// ============================================

/**
 * @api {post} /api/auth/logout تسجيل الخروج
 * @apiName Logout
 * @apiGroup Auth
 */
app.post('/logout', async (c) => {
  const { DB } = c.env;
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '');

  if (sessionId) {
    try {
      await DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run();
    } catch (error) {
      console.error('[Auth] Logout error:', error);
    }
  }

  return c.json({ success: true });
});

// ============================================
// تحقق البريد الإلكتروني - Email Verification
// ============================================

/**
 * @api {get} /api/auth/verify تحقق من البريد الإلكتروني
 * @apiName VerifyEmail
 * @apiGroup Auth
 */
app.get('/verify', async (c) => {
  const { DB } = c.env;
  const token = c.req.query('token');
  const lang = (c.req.query('lang') || 'ar') as 'ar' | 'en';

  if (!token) {
    return c.json({
      success: false,
      error: t('auth.invalid_token', lang),
    }, 400);
  }

  try {
    const user = await DB.prepare(`
      SELECT id, email FROM users 
      WHERE verification_token = ? 
      AND verification_expires > datetime('now')
      AND email_verified = 0
    `).bind(token).first() as User | null;

    if (!user) {
      return c.json({
        success: false,
        error: t('auth.invalid_token', lang),
      }, 400);
    }

    await DB.prepare(`
      UPDATE users 
      SET email_verified = 1, verification_token = NULL, verification_expires = NULL
      WHERE id = ?
    `).bind(user.id).run();

    return c.json({
      success: true,
      message: t('auth.verification_success', lang),
    });
  } catch (error) {
    console.error('[Auth] Verification error:', error);
    return c.json({
      success: false,
      error: t('auth.connection_failed', lang),
    }, 500);
  }
});

// ============================================
// نسيت كلمة المرور - Forgot Password
// ============================================

/**
 * @api {post} /api/auth/forgot-password طلب إعادة تعيين كلمة المرور
 * @apiName ForgotPassword
 * @apiGroup Auth
 */
app.post('/forgot-password', async (c) => {
  const { DB, RESEND_API_KEY } = c.env;
  const lang = (c.req.query('lang') || 'ar') as 'ar' | 'en';

  try {
    const body = await c.req.json();
    const { email } = body;

    if (!email) {
      return c.json({
        success: false,
        error: t('auth.email_required', lang),
      }, 400);
    }

    const user = await DB.prepare(
      'SELECT * FROM users WHERE email = ?'
    ).bind(email).first() as User | null;

    // لا نكشف إذا كان البريد موجوداً أم لا لأسباب أمنية
    if (!user) {
      return c.json({
        success: true,
        message: lang === 'ar'
          ? 'إذا كان هذا البريد مسجلاً، ستصلك رسالة إعادة تعيين'
          : 'If this email is registered, you will receive a reset link',
      });
    }

    // إنشاء رمز إعادة التعيين
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await DB.prepare(`
      UPDATE users SET reset_token = ?, reset_expires = ? WHERE id = ?
    `).bind(resetCode, expiresAt, user.id).run();

    // إرسال بريد إعادة التعيين
    const isAr = lang === 'ar';
    const subject = t('emails.reset_subject', lang);
    const htmlContent = isAr ? `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">ديولي</h1>
        </div>
        <h2 style="color: #1f2937;">${t('emails.reset_greeting', 'ar')}</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          ${t('emails.reset_message', 'ar')}
        </p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 10px; text-align: center; margin: 30px 0;">
          <div style="font-size: 32px; font-weight: bold; color: #7c3aed; letter-spacing: 8px;">${resetCode}</div>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          ${t('emails.reset_code_validity', 'ar')}
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 40px">
          ${t('emails.reset_ignore', 'ar')}
        </p>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Dueli</h1>
        </div>
        <h2 style="color: #1f2937;">${t('emails.reset_greeting', 'en')}</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          ${t('emails.reset_message', 'en')}
        </p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 10px; text-align: center; margin: 30px 0;">
          <div style="font-size: 32px; font-weight: bold; color: #7c3aed; letter-spacing: 8px;">${resetCode}</div>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          ${t('emails.reset_code_validity', 'en')}
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 40px;">
          ${t('emails.reset_ignore', 'en')}
        </p>
      </div>
    `;

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Dueli <onboarding@resend.dev>',
        to: [email],
        subject,
        html: htmlContent
      })
    });

    return c.json({
      success: true,
      message: t('auth.code_sent', lang),
    });
  } catch (error) {
    console.error('[Auth] Forgot password error:', error);
    return c.json({
      success: false,
      error: t('auth.connection_failed', lang),
    }, 500);
  }
});

// ============================================
// التحقق من رمز إعادة التعيين - Verify Reset Code
// ============================================

/**
 * @api {post} /api/auth/verify-reset-code التحقق من رمز إعادة التعيين
 * @apiName VerifyResetCode
 * @apiGroup Auth
 */
app.post('/verify-reset-code', async (c) => {
  const { DB } = c.env;
  const lang = (c.req.query('lang') || 'ar') as 'ar' | 'en';

  try {
    const body = await c.req.json();
    const { email, code } = body;

    if (!email || !code) {
      return c.json({
        success: false,
        error: t('auth.all_fields_required', lang),
      }, 400);
    }

    const user = await DB.prepare(`
      SELECT id FROM users 
      WHERE email = ? AND reset_token = ? AND reset_expires > datetime('now')
    `).bind(email, code).first();

    if (!user) {
      return c.json({
        success: false,
        error: t('auth.invalid_code', lang),
      }, 400);
    }

    return c.json({
      success: true,
      message: t('auth.code_verified', lang),
    });
  } catch (error) {
    console.error('[Auth] Verify code error:', error);
    return c.json({
      success: false,
      error: t('auth.connection_failed', lang),
    }, 500);
  }
});

// ============================================
// إعادة تعيين كلمة المرور - Reset Password
// ============================================

/**
 * @api {post} /api/auth/reset-password إعادة تعيين كلمة المرور
 * @apiName ResetPassword
 * @apiGroup Auth
 */
app.post('/reset-password', async (c) => {
  const { DB } = c.env;
  const lang = (c.req.query('lang') || 'ar') as 'ar' | 'en';

  try {
    const body = await c.req.json();
    const { email, code, newPassword } = body;

    if (!email || !code || !newPassword) {
      return c.json({
        success: false,
        error: t('auth.all_fields_required', lang),
      }, 400);
    }

    const user = await DB.prepare(`
      SELECT id FROM users 
      WHERE email = ? AND reset_token = ? AND reset_expires > datetime('now')
    `).bind(email, code).first() as User | null;

    if (!user) {
      return c.json({
        success: false,
        error: t('auth.invalid_code', lang),
      }, 400);
    }

    const passwordHash = await hashPassword(newPassword);

    await DB.prepare(`
      UPDATE users 
      SET password_hash = ?, reset_token = NULL, reset_expires = NULL
      WHERE id = ?
    `).bind(passwordHash, user.id).run();

    return c.json({
      success: true,
      message: t('auth.password_reset_success', lang),
    });
  } catch (error) {
    console.error('[Auth] Reset password error:', error);
    return c.json({
      success: false,
      error: t('auth.connection_failed', lang),
    }, 500);
  }
});

// ============================================
// OAuth - بدء عملية المصادقة
// ============================================

/**
 * @api {get} /api/auth/oauth/:provider بدء OAuth
 * @apiName OAuthStart
 * @apiGroup Auth
 */
app.get('/oauth/:provider', async (c) => {
  const provider = c.req.param('provider');
  const lang = c.req.query('lang') || 'ar';
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;

  const oauth = getOAuthProvider(provider, c.env, origin);
  if (!oauth) {
    return c.json({ success: false, error: 'Invalid provider' }, 400);
  }

  const state = generateState();
  const authUrl = oauth.getAuthUrl(state, lang);
  return c.redirect(authUrl);
});

// ============================================
// OAuth - معالجة الـ Callback
// ============================================

/**
 * @api {get} /api/auth/oauth/:provider/callback معالجة OAuth callback
 * @apiName OAuthCallback
 * @apiGroup Auth
 */
app.get('/oauth/:provider/callback', async (c) => {
  const provider = c.req.param('provider');
  const code = c.req.query('code');
  const stateParam = c.req.query('state');
  const { DB } = c.env;
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;

  // استخراج اللغة من الـ state
  let lang: 'ar' | 'en' = 'ar';
  try {
    if (stateParam) {
      const stateObj = JSON.parse(stateParam);
      lang = stateObj.lang || 'ar';
    }
  } catch (e) {
    // تجاهل خطأ التحليل
  }

  if (!code) {
    return c.html(getOAuthErrorHTML(lang, 'PROVIDER_ERROR'));
  }

  const oauth = getOAuthProvider(provider, c.env, origin);
  if (!oauth) {
    return c.html(getOAuthErrorHTML(lang, 'PROVIDER_ERROR'));
  }

  try {
    const oauthUser = await oauth.getUser(code);

    // التحقق من نطاق البريد
    if (oauthUser.email && !isEmailAllowed(oauthUser.email)) {
      return c.html(getOAuthErrorHTML(lang, 'INVALID_EMAIL_DOMAIN'));
    }

    // البحث عن المستخدم أو إنشاءه
    let user: User | null = null;
    if (oauthUser.email) {
      user = await DB.prepare(
        'SELECT * FROM users WHERE email = ?'
      ).bind(oauthUser.email).first() as User | null;
    } else if (oauthUser.id) {
      user = await DB.prepare(
        'SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?'
      ).bind(provider, oauthUser.id).first() as User | null;
    }

    if (user) {
      // تحديث معلومات OAuth
      await DB.prepare(`
        UPDATE users 
        SET oauth_provider = ?, oauth_id = ?, avatar_url = COALESCE(avatar_url, ?)
        WHERE id = ?
      `).bind(provider, oauthUser.id, oauthUser.picture, user.id).run();
    } else {
      // إنشاء مستخدم جديد
      const password = crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      const baseUsername = oauthUser.email
        ? oauthUser.email.split('@')[0].replace(/[^a-z0-9]/g, '').substring(0, 10)
        : 'user';
      const username = `${baseUsername}_${Date.now().toString(36)}`;

      const result = await DB.prepare(`
        INSERT INTO users (
          username, email, password_hash, display_name, country, language,
          oauth_provider, oauth_id, avatar_url, is_active, created_at
        )
        VALUES (?, ?, ?, ?, 'SA', ?, ?, ?, ?, 1, datetime('now'))
      `).bind(
        username,
        oauthUser.email || '',
        passwordHash,
        oauthUser.name || username,
        lang,
        provider,
        oauthUser.id,
        oauthUser.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
      ).run();

      user = await DB.prepare(
        'SELECT * FROM users WHERE id = ?'
      ).bind(result.meta.last_row_id).first() as User;
    }

    // إنشاء الجلسة
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await DB.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(sessionId, user!.id, expiresAt).run();

    return c.html(getOAuthSuccessHTML(lang, sessionId));

  } catch (error: any) {
    console.error('[Auth] OAuth Error:', error);
    return c.html(getOAuthErrorHTML(lang, 'PROVIDER_ERROR', error.message));
  }
});

// ============================================
// دوال HTML للـ OAuth - OAuth HTML Helpers
// ============================================

function getOAuthSuccessHTML(lang: 'ar' | 'en', sessionId: string): string {
  const isAr = lang === 'ar';
  return `
    <!DOCTYPE html>
    <html>
    <head><title>OAuth Success</title></head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 40px; background: #f0fdf4;">
      <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto;">
        <h2 style="color: #22c55e; margin: 0 0 20px 0;">✓ ${isAr ? 'تم التسجيل بنجاح!' : 'Login Successful!'}</h2>
        <p style="color: #666; margin: 0 0 20px 0;">${isAr ? 'جاري إغلاق النافذة...' : 'Closing window...'}</p>
        <button onclick="window.close()" style="background: #22c55e; color: white; border: none; padding: 10px 30px; border-radius: 6px; cursor: pointer; font-size: 16px;">
          ${isAr ? 'إغلاق' : 'Close'}
        </button>
      </div>
      <script>
        setTimeout(function() {
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth_success',
              session: '${sessionId}'
            }, '*');
            setTimeout(function() {
              window.close();
            }, 300);
          }
        }, 100);
      </script>
    </body>
    </html>
  `;
}

function getOAuthErrorHTML(lang: 'ar' | 'en', errorCode: string, errorMessage?: string): string {
  const isAr = lang === 'ar';
  return `
    <!DOCTYPE html>
    <html>
    <head><title>OAuth Error</title></head>
    <body>
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth_error', error: '${errorCode}' }, window.location.origin);
          window.close();
        } else {
          window.location.href = '/?error=${errorCode}&lang=${lang}';
        }
      </script>
      <p style="text-align:center;padding:20px;font-family:Arial;color:red;">
        ${isAr ? 'حدث خطأ! جاري الإغلاق...' : 'Error! Closing...'}
        ${errorMessage ? `<br><small>${errorMessage}</small>` : ''}
      </p>
    </body>
    </html>
  `;
}

export default app;
