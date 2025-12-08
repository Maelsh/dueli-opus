/**
 * @file templates/components.ts
 * @description مكونات HTML القابلة لإعادة الاستخدام
 * @description_en Reusable HTML components
 * @module templates/components
 * @version 1.0.0
 * @author Dueli Team
 */

import type { Language } from '../i18n';
import { t, isRTL as checkRTL } from '../i18n';

// ============================================
// شريط التنقل - Navigation
// ============================================

/**
 * إنشاء شريط التنقل العلوي
 * @param lang - اللغة الحالية
 * @returns كود HTML لشريط التنقل
 */
export function getNavigation(lang: Language): string {
  const isRTL = checkRTL(lang);

  return `
    <nav class="sticky top-0 z-50 bg-white dark:bg-[#0f0f0f] backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
      <div class="container mx-auto px-4 h-16 flex items-center justify-between">
        <!-- Logo -->
        <a href="/?lang=${lang}" class="flex items-center gap-2 cursor-pointer group">
          <img src="/static/dueli-icon.png" alt="Dueli" class="w-10 h-10 object-contain">
          <span class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-amber-500 sm:inline">
            ${t('general.app_title', lang)}
          </span>
        </a>

        <!-- Right Side Actions -->
        <div class="flex items-center gap-1.5">
          <!-- Help Link -->
          <a href="/about?lang=${lang}" title="${t('nav.help', lang)}" class="nav-icon text-gray-400 hover:text-amber-500 dark:text-gray-400 dark:hover:text-amber-500 transition-colors">
            <i class="far fa-question-circle text-2xl"></i>
          </a>
          
          <!-- Country/Language Switcher -->
          <div class="relative">
            <button onclick="toggleCountryMenu()" class="nav-icon text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-colors" title="${t('settings.country_language', lang)}">
              <i class="fas fa-globe text-xl"></i>
            </button>
            <div id="countryMenu" class="hidden absolute ${isRTL ? 'left-0' : 'right-0'} top-full mt-2 w-80 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 z-50 max-h-96 overflow-hidden flex flex-col">
              <!-- Search Box -->
              <div class="p-3 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-[#1a1a1a]">
                <div class="relative">
                  <input 
                    type="text" 
                    id="countrySearch" 
                    placeholder="${t('search.placeholder', lang)}" 
                    class="w-full px-3 py-2 ${isRTL ? 'pr-9' : 'pl-9'} text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    oninput="filterCountries(this.value)"
                  />
                  <i class="fas fa-search absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-3' : 'left-3'} text-gray-400 text-sm"></i>
                </div>
              </div>
              <!-- Countries List -->
              <div id="countriesList" class="overflow-y-auto flex-1"></div>
            </div>
          </div>
          
          <!-- Dark Mode Toggle -->
          <button onclick="toggleDarkMode()" class="nav-icon text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-amber-400 transition-colors" title="${t('settings.theme', lang)}">
            <i id="moonIcon" class="fas fa-moon text-2xl"></i>
            <i id="sunIcon" class="fas fa-sun text-2xl text-amber-400 hidden"></i>
          </button>

          <!-- Separator -->
          <div class="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>

          <!-- Auth Section - Login Button (hidden when logged in) -->
          <div id="authSection">
            <button onclick="showLoginModal()" class="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-full hover:opacity-90 transition-all shadow-lg shadow-purple-500/30 ${isRTL ? 'scale-x-[-1]' : ''}" title="${t('auth.login', lang)}">
              <i class="fas fa-arrow-right-to-bracket text-lg"></i>
            </button>
          </div>
          
          <!-- User Section (hidden when not logged in) -->
          <div id="userSection" class="hidden">
            <div class="relative">
              <button onclick="toggleUserMenu()" class="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
                <img id="userAvatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=user" alt="" class="w-9 h-9 rounded-full border-2 border-purple-400">
              </button>
              <div id="userMenu" class="hidden user-menu ${isRTL ? 'left-0' : 'right-0'}">
                <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <p id="userName" class="font-bold text-gray-900 dark:text-white">User</p>
                  <p id="userEmail" class="text-sm text-gray-500">email@example.com</p>
                </div>
                <a href="/profile?lang=${lang}" class="user-menu-item">
                  <i class="fas fa-user text-gray-500"></i>
                  <span>${t('nav.profile', lang)}</span>
                </a>
                <a href="/my-competitions?lang=${lang}" class="user-menu-item">
                  <i class="fas fa-trophy text-gray-500"></i>
                  <span>${t('competition.my_competitions', lang)}</span>
                </a>
                <a href="/my-requests?lang=${lang}" class="user-menu-item">
                  <i class="fas fa-inbox text-gray-500"></i>
                  <span>${t('competition.my_requests', lang)}</span>
                </a>
                <button onclick="logout()" class="user-menu-item text-red-600 w-full">
                  <i class="fas fa-sign-out-alt"></i>
                  <span>${t('auth.logout', lang)}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `;
}

// ============================================
// نافذة تسجيل الدخول - Login Modal
// ============================================

/**
 * إنشاء نافذة تسجيل الدخول
 * @param lang - اللغة الحالية
 * @returns كود HTML لنافذة تسجيل الدخول
 */
export function getLoginModal(lang: Language): string {
  const isRTL = checkRTL(lang);

  return `
    <div id="loginModal" class="hidden fixed inset-0 z-[100]">
      <div class="modal-backdrop absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="hideLoginModal()"></div>
      <div class="modal-content bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-md p-8">
        <button onclick="hideLoginModal()" class="absolute top-4 ${isRTL ? 'left-4' : 'right-4'} text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
          <i class="fas fa-times text-xl"></i>
        </button>
        
        <div class="text-center mb-6">
          <div class="flex justify-center mb-4">
            <img src="/static/dueli-icon.png" alt="Dueli" class="w-12 h-12 object-contain">
          </div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white">${t('auth.login_welcome', lang)}</h2>
          <p class="text-gray-500 mt-2 text-sm">${t('auth.login_subtitle', lang)}</p>
        </div>

        <!-- Tabs -->
        <div class="flex gap-2 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <button onclick="switchAuthTab('login')" id="loginTab" class="flex-1 py-2 rounded-md text-sm font-semibold transition-all bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm">
            ${t('auth.login', lang)}
          </button>
          <button onclick="switchAuthTab('register')" id="registerTab" class="flex-1 py-2 rounded-md text-sm font-semibold transition-all text-gray-600 dark:text-gray-400">
            ${t('auth.register', lang)}
          </button>
        </div>

        <!-- Messages -->
        <div id="authMessage" class="hidden mb-4 p-3 rounded-lg text-sm"></div>

        <!-- Login Form -->
        <div id="loginForm">
          <form onsubmit="handleLogin(event)" class="space-y-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${t('auth.email', lang)}</label>
              <input type="email" id="loginEmail" required class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
            </div>
            <div>
              <div class="flex justify-between items-center mb-2">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">${t('auth.password', lang)}</label>
                <button type="button" onclick="showForgotPassword()" class="text-sm text-purple-600 hover:text-purple-500 font-medium">
                  ${t('auth.forgot_password', lang)}
                </button>
              </div>
              <input type="password" id="loginPassword" required class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
            </div>
            <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
              ${t('auth.login', lang)}
            </button>
          </form>

          <div class="relative my-6">
            <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-200 dark:border-gray-700"></div></div>
            <div class="relative flex justify-center text-sm"><span class="px-2 bg-white dark:bg-[#1a1a1a] text-gray-500">${t('auth.or_continue_with', lang)}</span></div>
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

            <button onclick="loginWith('facebook')" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-facebook text-xl text-[#1877F2]"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">Facebook</span>
            </button>
            
            <button onclick="loginWith('twitter')" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-x-twitter text-xl text-gray-800 dark:text-white"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">X</span>
            </button>

            <button onclick="loginWith('tiktok')" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-tiktok text-xl text-black dark:text-white"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">TikTok</span>
            </button>

            <button onclick="loginWith('snapchat')" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-snapchat text-xl text-[#FFFC00] drop-shadow-sm"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">Snapchat</span>
            </button>
          </div>
        </div>

        <!-- Forgot Password Form -->
        ${getForgotPasswordForm(lang)}

        <!-- Register Form -->
        ${getRegisterForm(lang)}
        
        <p class="text-xs text-gray-400 text-center mt-6">
          ${t('auth.agree_terms', lang)}
        </p>
      </div>
    </div>
  `;
}

/**
 * نموذج نسيت كلمة المرور
 */
function getForgotPasswordForm(lang: Language): string {
  const isRTL = checkRTL(lang);
  
  return `
    <div id="forgotPasswordForm" class="hidden">
      <div class="text-center mb-6">
        <button onclick="showLogin()" class="text-sm text-gray-500 hover:text-purple-600 mb-4 flex items-center justify-center gap-2 mx-auto">
          <i class="fas fa-arrow-${isRTL ? 'right' : 'left'}"></i>
          ${t('auth.back_to_login', lang)}
        </button>
        <h3 class="text-xl font-bold text-gray-900 dark:text-white">${t('auth.reset_password', lang)}</h3>
      </div>

      <!-- Step 1: Email -->
      <form id="resetStep1" onsubmit="handleForgotPassword(event)" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${t('auth.email', lang)}</label>
          <input type="email" id="resetEmail" required class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
        </div>
        <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
          ${t('auth.send_code', lang)}
        </button>
      </form>

      <!-- Step 2: Verify Code -->
      <form id="resetStep2" onsubmit="handleVerifyResetCode(event)" class="space-y-4 hidden">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${t('auth.verification_code', lang)}</label>
          <input type="text" id="resetCode" required class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-center text-2xl tracking-widest">
          <p class="text-xs text-gray-500 mt-2 text-center">${t('auth.code_sent', lang)}</p>
        </div>
        <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
          ${t('auth.verify_code', lang)}
        </button>
      </form>

      <!-- Step 3: New Password -->
      <form id="resetStep3" onsubmit="handleResetPassword(event)" class="space-y-4 hidden">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${t('auth.new_password', lang)}</label>
          <input type="password" id="newPassword" required minlength="6" class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
        </div>
        <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
          ${t('auth.change_password', lang)}
        </button>
      </form>
    </div>
  `;
}

/**
 * نموذج التسجيل
 */
function getRegisterForm(lang: Language): string {
  return `
    <div id="registerForm" class="hidden">
      <form onsubmit="handleRegister(event)" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${t('auth.name', lang)}</label>
          <input type="text" id="registerName" required class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${t('auth.email', lang)}</label>
          <input type="email" id="registerEmail" required class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${t('auth.password', lang)}</label>
          <input type="password" id="registerPassword" required minlength="6" class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
          <p class="text-xs text-gray-500 mt-1">${t('auth.password_requirements', lang)}</p>
        </div>
        <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
          ${t('auth.create_account', lang)}
        </button>
      </form>
    </div>
  `;
}

// ============================================
// ذيل الصفحة - Footer
// ============================================

/**
 * إنشاء ذيل الصفحة
 * @param lang - اللغة الحالية
 * @returns كود HTML لذيل الصفحة
 */
export function getFooter(lang: Language): string {
  return `
    <footer class="bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-200 dark:border-gray-800 py-6 mt-auto">
      <div class="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
        <div class="flex items-center gap-2">
          <img src="/static/dueli-icon.png" alt="Dueli" class="w-8 h-8 object-contain opacity-70 grayscale hover:grayscale-0 transition-all">
          <span class="font-bold text-gray-700 dark:text-white">${t('general.app_title', lang)}</span>
        </div>
        <p>${t('general.copyright', lang)}</p>
      </div>
    </footer>
  `;
}

export default {
  getNavigation,
  getLoginModal,
  getFooter,
};
