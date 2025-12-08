/**
 * @file modules/auth/AuthService.ts
 * @description خدمة المصادقة - المنطق التجاري
 * @description_en Authentication Service - Business Logic
 * @module modules/auth
 * @version 1.0.0
 * @author Dueli Team
 */

import { UserRepository, SessionRepository, CreateUserData, CreateOAuthUserData } from './AuthRepository';
import { t } from '../../core/i18n';
import type { User, OAuthUser, Language } from '../../core/http/types';

/**
 * بيانات التسجيل
 * Registration data
 */
export interface RegisterData {
  email: string;
  username: string;
  password: string;
  displayName?: string;
  countryCode?: string;
  preferredLanguage?: Language;
}

/**
 * بيانات تسجيل الدخول
 * Login data
 */
export interface LoginData {
  email: string;
  password: string;
}

/**
 * نتيجة المصادقة
 * Authentication result
 */
export interface AuthResult {
  success: boolean;
  user?: User;
  token?: string;
  error?: string;
}

/**
 * خدمة المصادقة
 * Authentication Service
 * 
 * تحتوي على المنطق التجاري للمصادقة وإدارة الحسابات
 */
export class AuthService {
  private userRepo: UserRepository;
  private sessionRepo: SessionRepository;
  private resendApiKey: string;

  constructor(db: D1Database, resendApiKey: string) {
    this.userRepo = new UserRepository(db);
    this.sessionRepo = new SessionRepository(db);
    this.resendApiKey = resendApiKey;
  }

  // ============================================
  // Password Helpers - دوال كلمة المرور
  // ============================================

  /**
   * تشفير كلمة المرور
   * Hash password using SHA-256
   */
  async hashPassword(password: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * التحقق من كلمة المرور
   * Verify password
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    const inputHash = await this.hashPassword(password);
    return inputHash === hash;
  }

  /**
   * توليد رمز عشوائي
   * Generate random token
   */
  generateToken(length: number = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      token += chars[randomValues[i] % chars.length];
    }
    return token;
  }

  /**
   * توليد رمز رقمي
   * Generate numeric code
   */
  generateCode(length: number = 6): string {
    const digits = '0123456789';
    let code = '';
    const randomValues = new Uint8Array(length);
    crypto.getRandomValues(randomValues);
    for (let i = 0; i < length; i++) {
      code += digits[randomValues[i] % 10];
    }
    return code;
  }

  // ============================================
  // Registration - التسجيل
  // ============================================

  /**
   * تسجيل مستخدم جديد
   * Register new user
   */
  async register(data: RegisterData, origin: string): Promise<AuthResult> {
    // التحقق من تفرد البريد
    if (!(await this.userRepo.isEmailUnique(data.email))) {
      return { success: false, error: t('auth.email_exists', data.preferredLanguage) };
    }

    // التحقق من تفرد اسم المستخدم
    if (!(await this.userRepo.isUsernameUnique(data.username))) {
      return { success: false, error: t('auth.username_exists', data.preferredLanguage) };
    }

    // تشفير كلمة المرور
    const passwordHash = await this.hashPassword(data.password);
    
    // توليد رمز التحقق
    const verificationToken = this.generateToken(32);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // إنشاء المستخدم
    const userData: CreateUserData = {
      email: data.email,
      username: data.username,
      password_hash: passwordHash,
      display_name: data.displayName,
      country_code: data.countryCode,
      preferred_language: data.preferredLanguage || 'ar',
      verification_token: verificationToken,
      verification_expires: verificationExpires
    };

    const result = await this.userRepo.createUser(userData);
    
    if (!result.success) {
      return { success: false, error: t('errors.server_error', data.preferredLanguage) };
    }

    // إرسال بريد التحقق
    await this.sendVerificationEmail(
      data.email,
      verificationToken,
      data.displayName || data.username,
      data.preferredLanguage || 'ar',
      origin
    );

    // جلب المستخدم المنشأ
    const user = await this.userRepo.findById(result.id);

    return { success: true, user: user || undefined };
  }

  // ============================================
  // Login - تسجيل الدخول
  // ============================================

  /**
   * تسجيل الدخول
   * Login user
   */
  async login(data: LoginData, lang: Language = 'ar'): Promise<AuthResult> {
    // البحث عن المستخدم
    const user = await this.userRepo.findByEmail(data.email);
    
    if (!user) {
      return { success: false, error: t('auth.invalid_credentials', lang) };
    }

    // التحقق من كلمة المرور
    const passwordHash = await this.userRepo.getPasswordHash(data.email);
    if (!passwordHash || !(await this.verifyPassword(data.password, passwordHash))) {
      return { success: false, error: t('auth.invalid_credentials', lang) };
    }

    // التحقق من تفعيل الحساب
    if (!user.is_active) {
      return { success: false, error: 'Account is disabled' };
    }

    // إنشاء جلسة جديدة
    const token = this.generateToken(64);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await this.sessionRepo.createSession({
      user_id: user.id,
      token,
      expires_at: expiresAt
    });

    return { success: true, user, token };
  }

  // ============================================
  // OAuth - المصادقة الخارجية
  // ============================================

  /**
   * تسجيل/دخول بـ OAuth
   * OAuth login/register
   */
  async handleOAuth(oauthUser: OAuthUser, lang: Language = 'ar'): Promise<AuthResult> {
    // البحث عن مستخدم موجود بـ OAuth
    let user = await this.userRepo.findByOAuth(oauthUser.provider, oauthUser.id);

    if (!user) {
      // البحث بالبريد
      user = await this.userRepo.findByEmail(oauthUser.email);

      if (user) {
        // ربط OAuth بالحساب الموجود
        await this.userRepo.linkOAuth(user.id, oauthUser.provider, oauthUser.id);
      } else {
        // إنشاء مستخدم جديد
        const username = await this.generateUniqueUsername(oauthUser.name);
        
        const userData: CreateOAuthUserData = {
          email: oauthUser.email,
          username,
          display_name: oauthUser.name,
          avatar_url: oauthUser.picture,
          oauth_provider: oauthUser.provider,
          oauth_id: oauthUser.id,
          is_verified: true
        };

        const result = await this.userRepo.createOAuthUser(userData);
        if (!result.success) {
          return { success: false, error: t('errors.server_error', lang) };
        }

        user = await this.userRepo.findById(result.id);
      }
    }

    if (!user) {
      return { success: false, error: t('errors.server_error', lang) };
    }

    // إنشاء جلسة
    const token = this.generateToken(64);
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await this.sessionRepo.createSession({
      user_id: user.id,
      token,
      expires_at: expiresAt
    });

    return { success: true, user, token };
  }

  /**
   * توليد اسم مستخدم فريد
   * Generate unique username
   */
  private async generateUniqueUsername(baseName: string): Promise<string> {
    let username = baseName.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    
    if (username.length < 3) {
      username = 'user' + username;
    }

    let counter = 0;
    let candidate = username;

    while (!(await this.userRepo.isUsernameUnique(candidate))) {
      counter++;
      candidate = `${username}${counter}`;
    }

    return candidate;
  }

  // ============================================
  // Session Management - إدارة الجلسات
  // ============================================

  /**
   * التحقق من الجلسة
   * Validate session
   */
  async validateSession(token: string): Promise<User | null> {
    const session = await this.sessionRepo.findByToken(token);
    if (!session) return null;

    const user = await this.userRepo.findById(session.user_id);
    return user?.is_active ? user : null;
  }

  /**
   * إنهاء الجلسة
   * Logout / End session
   */
  async logout(token: string): Promise<boolean> {
    return this.sessionRepo.deleteByToken(token);
  }

  /**
   * إنهاء جميع جلسات المستخدم
   * Logout all sessions
   */
  async logoutAll(userId: number): Promise<boolean> {
    return this.sessionRepo.deleteByUserId(userId);
  }

  // ============================================
  // Email Verification - التحقق من البريد
  // ============================================

  /**
   * التحقق من البريد
   * Verify email
   */
  async verifyEmail(token: string): Promise<{ success: boolean; error?: string }> {
    const user = await this.userRepo.findByVerificationToken(token);
    
    if (!user) {
      return { success: false, error: 'Invalid or expired verification token' };
    }

    const verified = await this.userRepo.verifyEmail(user.id);
    return { success: verified };
  }

  /**
   * إعادة إرسال رمز التحقق
   * Resend verification email
   */
  async resendVerification(email: string, origin: string, lang: Language = 'ar'): Promise<{ success: boolean; error?: string }> {
    const user = await this.userRepo.findByEmail(email);
    
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    if (user.is_verified) {
      return { success: false, error: 'Email already verified' };
    }

    const verificationToken = this.generateToken(32);
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await this.userRepo.update(user.id, {
      verification_token: verificationToken,
      verification_expires: verificationExpires
    } as any);

    await this.sendVerificationEmail(
      email,
      verificationToken,
      user.display_name || user.username,
      lang,
      origin
    );

    return { success: true };
  }

  // ============================================
  // Password Reset - إعادة تعيين كلمة المرور
  // ============================================

  /**
   * طلب إعادة تعيين كلمة المرور
   * Request password reset
   */
  async forgotPassword(email: string, lang: Language = 'ar'): Promise<{ success: boolean; error?: string }> {
    const user = await this.userRepo.findByEmail(email);
    
    if (!user) {
      // لأمان أفضل، نرجع نجاح حتى لو المستخدم غير موجود
      return { success: true };
    }

    const resetCode = this.generateCode(6);
    const resetExpires = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    await this.userRepo.setResetToken(user.id, resetCode, resetExpires);
    await this.sendResetEmail(email, resetCode, user.display_name || user.username, lang);

    return { success: true };
  }

  /**
   * التحقق من رمز إعادة التعيين
   * Verify reset code
   */
  async verifyResetCode(email: string, code: string): Promise<{ success: boolean; error?: string }> {
    const user = await this.userRepo.findByEmail(email);
    
    if (!user) {
      return { success: false, error: 'Invalid code' };
    }

    const storedUser = await this.userRepo.findByResetToken(code);
    
    if (!storedUser || storedUser.id !== user.id) {
      return { success: false, error: 'Invalid or expired code' };
    }

    return { success: true };
  }

  /**
   * إعادة تعيين كلمة المرور
   * Reset password
   */
  async resetPassword(email: string, code: string, newPassword: string): Promise<{ success: boolean; error?: string }> {
    // التحقق من الرمز أولاً
    const verifyResult = await this.verifyResetCode(email, code);
    if (!verifyResult.success) {
      return verifyResult;
    }

    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      return { success: false, error: 'User not found' };
    }

    const passwordHash = await this.hashPassword(newPassword);
    const updated = await this.userRepo.updatePassword(user.id, passwordHash);

    return { success: updated };
  }

  // ============================================
  // Email Sending - إرسال البريد
  // ============================================

  /**
   * إرسال بريد التحقق
   * Send verification email
   */
  private async sendVerificationEmail(
    email: string,
    token: string,
    name: string,
    lang: Language,
    origin: string
  ): Promise<void> {
    const baseUrl = origin || 'https://project-8e7c178d.pages.dev';
    const verifyUrl = `${baseUrl}/verify?token=${token}&lang=${lang}`;

    const isAr = lang === 'ar';
    const subject = t('emails.verification_subject', lang);
    
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
        <p style="color: #9ca3af; font-size: 12px; margin-top: 40px;">
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

    await this.sendEmail(email, subject, htmlContent);
  }

  /**
   * إرسال بريد إعادة التعيين
   * Send reset password email
   */
  private async sendResetEmail(
    email: string,
    code: string,
    name: string,
    lang: Language
  ): Promise<void> {
    const isAr = lang === 'ar';
    const subject = t('emails.reset_subject', lang);
    
    const htmlContent = isAr ? `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">${t('general.app_title', 'ar')}</h1>
        </div>
        <h2 style="color: #1f2937;">${t('emails.verification_greeting', 'ar')} ${name}!</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          ${t('emails.reset_message', 'ar')}
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="background: #f3f4f6; padding: 15px 30px; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 10px; display: inline-block;">
            ${code}
          </span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          ${t('emails.reset_code_valid', 'ar')}
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 40px;">
          ${t('emails.reset_ignore', 'ar')}
        </p>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">${t('general.app_title', 'en')}</h1>
        </div>
        <h2 style="color: #1f2937;">${t('emails.verification_greeting', 'en')} ${name}!</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          ${t('emails.reset_message', 'en')}
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="background: #f3f4f6; padding: 15px 30px; font-size: 32px; font-weight: bold; letter-spacing: 8px; border-radius: 10px; display: inline-block;">
            ${code}
          </span>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          ${t('emails.reset_code_valid', 'en')}
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 40px;">
          ${t('emails.reset_ignore', 'en')}
        </p>
      </div>
    `;

    await this.sendEmail(email, subject, htmlContent);
  }

  /**
   * إرسال بريد عبر Resend
   * Send email via Resend
   */
  private async sendEmail(to: string, subject: string, html: string): Promise<void> {
    if (!this.resendApiKey) {
      console.warn('RESEND_API_KEY not configured');
      return;
    }

    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.resendApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'Dueli <noreply@resend.dev>',
          to: [to],
          subject,
          html
        })
      });
    } catch (error) {
      console.error('Failed to send email:', error);
    }
  }
}

export default AuthService;
