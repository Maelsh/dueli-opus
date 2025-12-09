/**
 * Navigation Component
 * مكون الملاحة
 */

import type { Language } from '../../config/types';
import { translations, isRTL as checkRTL } from '../../i18n';

/**
 * Get Navigation HTML - الحصول على HTML الملاحة
 */
export function getNavigation(lang: Language): string {
  const tr = translations[lang];
  const isRTL = checkRTL(lang);

  return `
    <nav class="sticky top-0 z-50 bg-white dark:bg-[#0f0f0f] backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
      <div class="container mx-auto px-4 h-16 flex items-center justify-between">
        <!-- Logo -->
        <a href="/?lang=${lang}" class="flex items-center gap-2 cursor-pointer group">
          <img src="/static/dueli-icon.png" alt="Dueli" class="w-10 h-10 object-contain">
          <span class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-amber-500 sm:inline">
            ${tr.app_title}
          </span>
        </a>

        <!-- Right Side Actions -->
        <div class="flex items-center gap-1.5">
          <!-- Settings/Help -->
          <a href="/about?lang=${lang}" title="${tr.help}" class="nav-icon text-gray-400 hover:text-amber-500 dark:text-gray-400 dark:hover:text-amber-500 transition-colors">
            <i class="far fa-question-circle text-2xl"></i>
          </a>
          
          <!-- Country/Language Switcher -->
          <div class="relative">
            <button onclick="toggleCountryMenu()" class="nav-icon text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-colors" title="${tr.country_language}">
              <i class="fas fa-globe text-xl"></i>
            </button>
            <div id="countryMenu" class="hidden absolute ${isRTL ? 'left-0' : 'right-0'} top-full mt-2 w-80 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 z-50 max-h-96 overflow-hidden flex flex-col">
              <!-- Search Box -->
              <div class="p-3 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-[#1a1a1a]">
                <div class="relative">
                  <input 
                    type="text" 
                    id="countrySearch" 
                    placeholder="${tr.search_country}" 
                    class="w-full px-3 py-2 ${isRTL ? 'pr-9' : 'pl-9'} text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    oninput="filterCountries(this.value)"
                  />
                  <i class="fas fa-search absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-3' : 'left-3'} text-gray-400 text-sm"></i>
                </div>
              </div>
              <!-- Countries List -->
              <div id="countriesList" class="overflow-y-auto flex-1">
                <!-- Will be populated by JavaScript -->
              </div>
            </div>
          </div>
          
          <!-- Dark Mode Toggle -->
          <button onclick="toggleDarkMode()" class="nav-icon text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-amber-400 transition-colors" title="${tr.theme}">
            <i id="moonIcon" class="fas fa-moon text-2xl"></i>
            <i id="sunIcon" class="fas fa-sun text-2xl text-amber-400 hidden"></i>
          </button>

          <!-- Separator -->
          <div class="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>

          <!-- Auth Section - Login Button (hidden when logged in) -->
          <div id="authSection">
            <button onclick="showLoginModal()" class="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-full hover:opacity-90 transition-all shadow-lg shadow-purple-500/30 ${isRTL ? 'scale-x-[-1]' : ''}" title="${tr.login}">
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
                  <span>${tr.profile}</span>
                </a>
                <a href="/my-competitions?lang=${lang}" class="user-menu-item">
                  <i class="fas fa-trophy text-gray-500"></i>
                  <span>${tr.my_competitions}</span>
                </a>
                <a href="/my-requests?lang=${lang}" class="user-menu-item">
                  <i class="fas fa-inbox text-gray-500"></i>
                  <span>${tr.my_requests}</span>
                </a>
                <button onclick="logout()" class="user-menu-item text-red-600 w-full">
                  <i class="fas fa-sign-out-alt"></i>
                  <span>${tr.logout}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `;
}
