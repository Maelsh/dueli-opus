/**
 * Authentication Helpers
 * مساعدات المصادقة
 * 
 * Re-exports from OOP service classes for backward compatibility
 * إعادة تصدير من فئات الخدمة OOP للتوافق العكسي
 */

import { CryptoUtils } from '../../../lib/services/CryptoUtils';
import { EmailService } from '../../../lib/services/EmailService';

// Re-export CryptoUtils static methods
export const hashPassword = CryptoUtils.hashPassword.bind(CryptoUtils);
export const generateState = CryptoUtils.generateState.bind(CryptoUtils);

// Email sending - now uses EmailService class
// These functions are kept for backward compatibility with existing route handlers
export async function sendVerificationEmail(
  email: string,
  token: string,
  name: string,
  lang: string,
  resendApiKey: string,
  origin: string
): Promise<any> {
  const emailService = new EmailService(resendApiKey);
  return emailService.sendVerificationEmail(email, token, name, lang, origin);
}

export async function sendPasswordResetEmail(
  email: string,
  resetCode: string,
  lang: string,
  resendApiKey: string
): Promise<any> {
  const emailService = new EmailService(resendApiKey);
  return emailService.sendPasswordResetEmail(email, resetCode, lang);
}

/**
 * Check if email is allowed
 * التحقق من أن البريد مسموح
 */
export function isEmailAllowed(email: string): boolean {
  // Add any email domain restrictions here if needed
  // For now, allow all emails
  return true;
}
