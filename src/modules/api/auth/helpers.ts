/**
 * Authentication Helpers
 * مساعدات المصادقة
 */

import { translations, getUILanguage, isRTL } from '../../../i18n';

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
  const tr = translations[getUILanguage(lang)];
  const rtl = isRTL(lang);

  const subject = tr.email_activate_subject;
  const htmlContent = `
    <div ${rtl ? 'dir="rtl"' : ''} style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">${tr.app_title}</h1>
      </div>
      <h2 style="color: #1f2937;">${tr.login_welcome.replace('ديولي', '').replace('Dueli', '')} ${name}!</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        ${tr.auth_register_success.split('!')[0]}:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background: linear-gradient(135deg, #7c3aed 0%, #f59e0b 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
          ${tr.account_verification}
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        <a href="${verifyUrl}" style="color: #7c3aed;">${verifyUrl}</a>
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
  const tr = translations[getUILanguage(lang)];
  const rtl = isRTL(lang);

  const subject = tr.email_reset_subject;
  const htmlContent = `
    <div ${rtl ? 'dir="rtl"' : ''} style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">${tr.app_title}</h1>
      </div>
      <h2 style="color: #1f2937;">${tr.reset_password_title}</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        ${tr.verification_code_label}:
      </p>
      <div style="background: #f3f4f6; padding: 20px; border-radius: 10px; text-align: center; margin: 30px 0;">
        <div style="font-size: 32px; font-weight: bold; color: #7c3aed; letter-spacing: 8px;">${resetCode}</div>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        ${tr.password_min_length}
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
