/**
 * Login Modal Component
 * مكون نافذة تسجيل الدخول
 */

import type { Language } from '../../config/types';
import { translations, getUILanguage, isRTL } from '../../i18n';

/**
 * Get Login Modal HTML - الحصول على HTML نافذة تسجيل الدخول
 */
export function getLoginModal(lang: Language): string {
  const tr = translations[getUILanguage(lang)];
  const rtl = isRTL(lang);

  return `
    <div id="loginModal" class="hidden fixed inset-0 z-[100]">
      <div class="modal-backdrop absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="hideLoginModal()"></div>
      <div class="modal-content bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-md p-8">
        <button onclick="hideLoginModal()" class="absolute top-4 ${rtl ? 'left-4' : 'right-4'} text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
          <i class="fas fa-times text-xl"></i>
        </button>
        
        <div class="text-center mb-6">
          <div class="flex justify-center mb-4"><img src="/static/dueli-icon.png" alt="Dueli" class="w-12 h-12 object-contain"></div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white" id="modalTitle">${tr.login_welcome}</h2>
          <p class="text-gray-500 mt-2 text-sm" id="modalSubtitle">${tr.login_subtitle}</p>
        </div>

        <!-- Tabs -->
        <div class="flex gap-2 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <button onclick="switchAuthTab('login')" id="loginTab" class="flex-1 py-2 rounded-md text-sm font-semibold transition-all bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm">
            ${tr.login_button}
          </button>
          <button onclick="switchAuthTab('register')" id="registerTab" class="flex-1 py-2 rounded-md text-sm font-semibold transition-all text-gray-600 dark:text-gray-400">
            ${tr.register_button}
          </button>
        </div>

        <!-- Messages -->
        <div id="authMessage" class="hidden mb-4 p-3 rounded-lg text-sm"></div>

        <!-- Login Form -->
        <div id="loginForm">
          <form onsubmit="handleLogin(event)" class="space-y-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${tr.email_label}</label>
              <input type="email" id="loginEmail" required title="${tr.email_label}" class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
            </div>
            <div>
              <div class="flex justify-between items-center mb-2">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">${tr.password_label}</label>
                <button type="button" onclick="showForgotPassword()" class="text-sm text-purple-600 hover:text-purple-500 font-medium">
                  ${tr.forgot_password}
                </button>
              </div>
              <input type="password" id="loginPassword" required title="${tr.password_label}" class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
            </div>
            <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
              ${tr.login_button}
            </button>
          </form>

          <div class="relative my-6">
            <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-200 dark:border-gray-700"></div></div>
            <div class="relative flex justify-center text-sm"><span class="px-2 bg-white dark:bg-[#1a1a1a] text-gray-500">${tr.or_divider}</span></div>
          </div>
        
          <div class="grid grid-cols-2 gap-3">
            <button onclick="loginWith('google')" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <svg class="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">Google</span>
            </button>
            
            <button onclick="loginWith('microsoft')" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-microsoft text-xl text-[#00A4EF]"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">Outlook</span>
            </button>

            <!-- Hidden social buttons - قد تُفعَّل لاحقاً -->
            <button onclick="loginWith('facebook')" style="display:none;" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-facebook text-xl text-[#1877F2]"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">Facebook</span>
            </button>
            
            <button onclick="loginWith('twitter')" style="display:none;" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-x-twitter text-xl text-gray-800 dark:text-white"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">X</span>
            </button>

            <button onclick="loginWith('tiktok')" style="display:none;" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-tiktok text-xl text-black dark:text-white"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">TikTok</span>
            </button>

            <button onclick="loginWith('snapchat')" style="display:none;" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-snapchat text-xl text-[#FFFC00] drop-shadow-sm"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">Snapchat</span>
            </button>
          </div>
        </div>

        <!-- Forgot Password Form -->
        ${getForgotPasswordForm(lang, rtl, tr)}

        <!-- Register Form -->
        ${getRegisterForm(lang, tr)}
        
        <p class="text-xs text-gray-400 text-center mt-6">
          ${tr.terms_agreement}
        </p>
      </div>
    </div>
  `;
}

/**
 * Get Forgot Password Form - نموذج نسيان كلمة المرور
 */
function getForgotPasswordForm(lang: Language, rtl: boolean, tr: any): string {
  return `
    <div id="forgotPasswordForm" class="hidden">
      <div class="text-center mb-6">
        <button onclick="showLogin()" class="text-sm text-gray-500 hover:text-purple-600 mb-4 flex items-center justify-center gap-2 mx-auto">
          <i class="fas fa-arrow-${rtl ? 'right' : 'left'}"></i>
          ${tr.back_to_login}
        </button>
        <h3 class="text-xl font-bold text-gray-900 dark:text-white">${tr.reset_password_title}</h3>
      </div>

      <!-- Step 1: Email -->
      <form id="resetStep1" onsubmit="handleForgotPassword(event)" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${tr.email_label}</label>
          <input type="email" id="resetEmail" required title="${tr.email_label}" class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
        </div>
        <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
          ${tr.send_code}
        </button>
      </form>

      <!-- Step 2: Verify Code -->
      <form id="resetStep2" onsubmit="handleVerifyResetCode(event)" class="space-y-4 hidden">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${tr.verification_code_label}</label>
          <input type="text" id="resetCode" required title="${tr.verification_code_label}" class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-center text-2xl tracking-widest">
          <p class="text-xs text-gray-500 mt-2 text-center">${tr.code_sent_to_email}</p>
        </div>
        <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
          ${tr.verify_code}
        </button>
      </form>

      <!-- Step 3: New Password -->
      <form id="resetStep3" onsubmit="handleResetPassword(event)" class="space-y-4 hidden">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${tr.new_password_label}</label>
          <input type="password" id="newPassword" required minlength="6" title="${tr.new_password_label}" class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
        </div>
        <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
          ${tr.change_password}
        </button>
      </form>
    </div>
  `;
}

/**
 * Get Register Form - نموذج التسجيل
 */
function getRegisterForm(lang: Language, tr: any): string {
  return `
    <div id="registerForm" class="hidden">
      <form onsubmit="handleRegister(event)" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${tr.name_label}</label>
          <input type="text" id="registerName" required title="${tr.name_label}" class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${tr.email_label}</label>
          <input type="email" id="registerEmail" required title="${tr.email_label}" class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${tr.password_label}</label>
          <input type="password" id="registerPassword" required minlength="6" title="${tr.password_label}" class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
          <p class="text-xs text-gray-500 mt-1">${tr.password_min_length}</p>
        </div>
        <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
          ${tr.register_button}
        </button>
      </form>
    </div>
  `;
}
