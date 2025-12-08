/**
 * Authentication Helpers
 * مساعدات المصادقة
 */

import type { Bindings, Language } from '../../../config/types';

/**
 * Hash password using SHA-256 - تشفير كلمة المرور
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Send verification email - إرسال بريد التحقق
 */
export async function sendVerificationEmail(
  email: string, 
  token: string, 
  name: string, 
  lang: string, 
  resendApiKey: string, 
  origin: string
): Promise<any> {
  const baseUrl = origin || 'https://project-8e7c178d.pages.dev';
  const verifyUrl = `${baseUrl}/verify?token=${token}&lang=${lang}`;

  const subject = lang === 'ar' ? 'تفعيل حسابك في ديولي' : 'Activate your Dueli account';
  const htmlContent = lang === 'ar' ? `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">ديولي</h1>
      </div>
      <h2 style="color: #1f2937;">مرحباً ${name}!</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        شكراً لتسجيلك في منصة ديولي. يرجى الضغط على الزر أدناه لتفعيل حسابك:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background: linear-gradient(135deg, #7c3aed 0%, #f59e0b 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
          تفعيل الحساب
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        أو انسخ هذا الرابط:
        <br>
        <a href="${verifyUrl}" style="color: #7c3aed;">${verifyUrl}</a>
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 40px">
        إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذه الرسالة.
      </p>
    </div>
  ` : `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">Dueli</h1>
      </div>
      <h2 style="color: #1f2937;">Welcome ${name}!</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        Thank you for signing up for Dueli. Please click the button below to activate your account:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background: linear-gradient(135deg, #7c3aed 0%, #f59e0b 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
          Activate Account
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        Or copy this link:
        <br>
        <a href="${verifyUrl}" style="color: #7c3aed;">${verifyUrl}</a>
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 40px;">
        If you didn't create an account, you can ignore this message.
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
    console.error('Resend API Error:', errorText);
    throw new Error(`Failed to send verification email: ${errorText}`);
  }

  return await response.json();
}

/**
 * Send password reset email - إرسال بريد إعادة تعيين كلمة المرور
 */
export async function sendPasswordResetEmail(
  email: string,
  resetCode: string,
  lang: string,
  resendApiKey: string
): Promise<any> {
  const subject = lang === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Reset Your Password';
  const htmlContent = lang === 'ar' ? `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">ديولي</h1>
      </div>
      <h2 style="color: #1f2937;">إعادة تعيين كلمة المرور</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        تلقينا طلباً لإعادة تعيين كلمة المرور. استخدم الرمز التالي:
      </p>
      <div style="background: #f3f4f6; padding: 20px; border-radius: 10px; text-align: center; margin: 30px 0;">
        <div style="font-size: 32px; font-weight: bold; color: #7c3aed; letter-spacing: 8px;">${resetCode}</div>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        هذا الرمز صالح لمدة 15 دقيقة فقط.
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 40px">
        إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.
      </p>
    </div>
  ` : `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">Dueli</h1>
      </div>
      <h2 style="color: #1f2937;">Reset Your Password</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        We received a request to reset your password. Use this code:
      </p>
      <div style="background: #f3f4f6; padding: 20px; border-radius: 10px; text-align: center; margin: 30px 0;">
        <div style="font-size: 32px; font-weight: bold; color: #7c3aed; letter-spacing: 8px;">${resetCode}</div>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        This code is valid for 15 minutes only.
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 40px;">
        If you didn't request a password reset, you can ignore this message.
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
    console.error('Resend API Error:', errorText);
    throw new Error(`Failed to send password reset email: ${errorText}`);
  }

  return await response.json();
}

/**
 * Generate random state for OAuth - توليد حالة عشوائية لـ OAuth
 */
export function generateState(): string {
  return crypto.randomUUID();
}

/**
 * Check if email is allowed - التحقق من أن البريد مسموح
 */
export function isEmailAllowed(email: string): boolean {
  // Add any email domain restrictions here if needed
  // For now, allow all emails
  return true;
}
