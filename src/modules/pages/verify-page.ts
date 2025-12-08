/**
 * Email Verification Page
 * صفحة التحقق من البريد
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../config/types';
import { translations } from '../../i18n';
import { getNavigation, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

export async function verifyPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const lang = c.get('lang');
  const tr = translations[lang];
  const token = c.req.query('token');

  let message = '';
  let isSuccess = false;

  if (token) {
    try {
      const res = await fetch(`${c.req.url.split('/verify')[0]}/api/auth/verify?token=${token}&lang=${lang}`);
      const data = await res.json() as any;
      message = data.message || data.error;
      isSuccess = data.success;
    } catch (error) {
      message = lang === 'ar' ? 'حدث خطأ أثناء التحقق' : 'Verification failed';
    }
  } else {
    message = lang === 'ar' ? 'رابط غير صالح' : 'Invalid link';
  }

  const content = `
    ${getNavigation(lang)}
    
    <div class="min-h-screen bg-white dark:bg-[#0f0f0f] flex items-center justify-center px-4">
      <div class="max-w-md w-full text-center">
        <div class="mb-6">
          <img src="/static/dueli-icon.png" alt="Dueli" class="w-20 h-20 mx-auto mb-6 object-contain">
        </div>
        
        ${isSuccess ? `
          <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <i class="fas fa-check text-4xl text-green-600 dark:text-green-400"></i>
          </div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">${message}</h1>
          <p class="text-gray-600 dark:text-gray-400 mb-8">
            ${lang === 'ar' ? 'يمكنك الآن تسجيل الدخول إلى حسابك' : 'You can now log into your account'}
          </p>
          <a href="/?lang=${lang}" class="inline-block px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full font-semibold hover:opacity-90 transition-all">
            ${lang === 'ar' ? 'اذهب إلى الرئيسية' : 'Go to Home'}
          </a>
        ` : `
          <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <i class="fas fa-times text-4xl text-red-600 dark:text-red-400"></i>
          </div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">${message}</h1>
          <p class="text-gray-600 dark:text-gray-400 mb-8">
            ${lang === 'ar' ? 'يرجى التحقق من الرابط أو طلب رابط جديد' : 'Please check the link or request a new one'}
          </p>
          <a href="/?lang=${lang}" class="inline-block px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full font-semibold hover:opacity-90 transition-all">
            ${lang === 'ar' ? 'العودة' : 'Go Back'}
          </a>
        `}
      </div>
    </div>
    
    ${getFooter(lang)}
  `;

  return c.html(generateHTML(content, lang, lang === 'ar' ? 'تفعيل الحساب' : 'Account Verification'));
}
