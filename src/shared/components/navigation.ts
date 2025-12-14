/**
 * Navigation Component
 * مكون الملاحة
 */

import type { Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';

/**
 * Get Navigation HTML - الحصول على HTML الملاحة
 */
export function getNavigation(lang: Language): string {
  const tr = translations[getUILanguage(lang)];
  const isRTL = checkRTL(lang);

  return `
    <nav class="sticky top-0 z-50 bg-white dark:bg-[#0f0f0f] backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
      <div class="container mx-auto px-4 h-16 flex items-center justify-between">
        <!-- Logo -->
        <a href="/?lang=${lang}" class="flex items-center gap-2 cursor-pointer group" title="${tr.app_title}">
          <img src="/static/dueli-icon.png" alt="Dueli" class="w-10 h-10 object-contain">
          <span class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-amber-500 sm:inline">
            ${tr.app_title}
          </span>
        </a>

        <!-- Right Side Actions -->
        <div class="flex items-center gap-1.5">
          <!-- Help Icon (hidden by default using auth-hidden, shown for non-logged-in users via JS) -->
          <a href="/about?lang=${lang}" id="helpIcon" title="${tr.help || 'Help'}" class="nav-icon text-gray-400 hover:text-amber-500 dark:text-gray-400 dark:hover:text-amber-500 transition-colors auth-hidden">
            <i class="far fa-question-circle text-2xl"></i>
          </a>
          
          <!-- Country/Language Switcher -->
          <div class="relative">
            <button onclick="toggleCountryMenu()" class="nav-icon text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-colors" title="${tr.country_language || 'Language & Country'}">
              <i class="fas fa-globe text-xl"></i>
            </button>
            <div id="countryMenu" class="hidden fixed sm:absolute ${isRTL ? 'sm:left-0' : 'sm:right-0'} left-1/2 sm:left-auto transform -translate-x-1/2 sm:translate-x-0 top-20 sm:top-full sm:mt-2 w-80 bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 z-50 max-h-96 overflow-hidden flex flex-col">
              <!-- Search Box -->
              <div class="p-3 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-[#1a1a1a]">
                <div class="relative">
                  <input 
                    type="text" 
                    id="countrySearch" 
                    placeholder="${tr.search_country || 'Search country...'}" 
                    title="${tr.search_country || 'Search country...'}"
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
          <button onclick="toggleDarkMode()" class="nav-icon text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-amber-400 transition-colors" title="${tr.theme || 'Theme'}">
            <i id="moonIcon" class="fas fa-moon text-2xl"></i>
            <i id="sunIcon" class="fas fa-sun text-2xl text-amber-400 theme-icon-hidden"></i>
          </button>

          <!-- Separator -->
          <div class="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>

          <!-- Auth Section - Login Button (hidden when logged in) -->
          <div id="authSection">
            <button onclick="showLoginModal()" class="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-full hover:opacity-90 transition-all shadow-lg shadow-purple-500/30 ${isRTL ? 'scale-x-[-1]' : ''}" title="${tr.login || 'Login'}">
              <i class="fas fa-arrow-right-to-bracket text-lg"></i>
            </button>
          </div>
          
          <!-- User Section (hidden when not logged in) -->
          <div id="userSection" class="flex items-center gap-2 hidden">
            <!-- Notifications Button -->
            <div class="relative">
              <button onclick="toggleNotifications()" class="nav-icon relative text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-colors" title="${tr.notifications || 'Notifications'}">
                <i class="fas fa-bell text-xl"></i>
                <span id="notificationBadge" class="hidden absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">0</span>
              </button>
              <!-- Notifications Dropdown -->
              <div id="notificationsDropdown" class="hidden absolute ${isRTL ? 'left-0' : 'right-0'} top-full mt-2 w-80 bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 z-50 overflow-hidden">
                <div class="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <span class="font-bold text-gray-900 dark:text-white">${tr.notifications || 'Notifications'}</span>
                  <button onclick="markAllNotificationsRead()" class="text-xs text-purple-600 hover:underline" title="${tr.mark_all_read || 'Mark all read'}">${tr.mark_all_read || 'Mark all read'}</button>
                </div>
                <div id="notificationsList" class="overflow-y-auto max-h-72">
                  <div class="p-4 text-center text-gray-400 text-sm">
                    <i class="fas fa-bell-slash text-2xl mb-2"></i>
                    <p>${tr.loading || 'Loading...'}</p>
                  </div>
                </div>
                <a href="/notifications?lang=${lang}" class="block p-3 text-center text-sm text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-t border-gray-200 dark:border-gray-700" title="${tr.view_all || 'View all'}">
                  ${tr.view_all || 'View all'}
                </a>
              </div>
            </div>

            <!-- Messages Button with Dropdown -->
            <div class="relative">
              <button onclick="toggleMessages()" class="nav-icon relative text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-colors" title="${tr.messages?.title || 'Messages'}">
                <i class="fas fa-envelope text-xl"></i>
                <span id="messagesBadge" class="hidden absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">0</span>
              </button>
              <!-- Messages Dropdown -->
              <div id="messagesDropdown" class="hidden absolute ${isRTL ? 'left-0' : 'right-0'} top-full mt-2 w-80 bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-xl border border-gray-100 dark:border-gray-800 z-50 overflow-hidden">
                <div class="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <span class="font-bold text-gray-900 dark:text-white">${tr.messages?.title || 'Messages'}</span>
                  <button onclick="markAllMessagesRead()" class="text-xs text-purple-600 hover:underline" title="${tr.mark_all_read || 'Mark all read'}">${tr.mark_all_read || 'Mark all read'}</button>
                </div>
                <div id="messagesList" class="overflow-y-auto max-h-72">
                  <div class="p-4 text-center text-gray-400 text-sm">
                    <i class="fas fa-envelope-open text-2xl mb-2"></i>
                    <p>${tr.no_messages || 'No messages'}</p>
                  </div>
                </div>
                <a href="/messages?lang=${lang}" class="block p-3 text-center text-sm text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 border-t border-gray-200 dark:border-gray-700" title="${tr.view_all || 'View all'}">
                  ${tr.view_all || 'View all'}
                </a>
              </div>
            </div>

            <!-- User Avatar & Menu -->
            <div class="relative">
              <button onclick="toggleUserMenu()" class="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all" title="${tr.profile || 'Profile'}">
                <img id="userAvatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=user" alt="" class="w-12 h-12 rounded-full border-2 border-purple-400">
              </button>
              <div id="userMenu" class="user-menu ${isRTL ? 'left-0' : 'right-0'}">
                <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <p id="userName" class="font-bold text-gray-900 dark:text-white">User</p>
                  <p id="userEmail" class="text-sm text-gray-500">email@example.com</p>
                </div>
                <a href="/profile?lang=${lang}" class="user-menu-item" title="${tr.profile || 'Profile'}">
                  <i class="fas fa-user text-gray-500"></i>
                  <span>${tr.profile || 'Profile'}</span>
                </a>
                <a href="/earnings?lang=${lang}" class="user-menu-item" title="${tr.earnings || 'Earnings'}">
                  <i class="fas fa-wallet text-gray-500"></i>
                  <span>${tr.earnings || 'Earnings'}</span>
                </a>
                <a href="/my-competitions?lang=${lang}" class="user-menu-item" title="${tr.my_competitions || 'My Competitions'}">
                  <i class="fas fa-trophy text-gray-500"></i>
                  <span>${tr.my_competitions || 'My Competitions'}</span>
                </a>
                <a href="/my-requests?lang=${lang}" class="user-menu-item" title="${tr.my_requests || 'My Requests'}">
                  <i class="fas fa-inbox text-gray-500"></i>
                  <span>${tr.my_requests || 'My Requests'}</span>
                </a>
                <div class="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                <a href="/reports?lang=${lang}" class="user-menu-item" title="${tr.report || 'Report'}">
                  <i class="fas fa-flag text-gray-500"></i>
                  <span>${tr.submit_report || 'Submit Report'}</span>
                </a>
                <a href="/messages?lang=${lang}&admin=true" class="user-menu-item" title="${tr.contact_admin || 'Contact Admin'}">
                  <i class="fas fa-headset text-gray-500"></i>
                  <span>${tr.contact_admin || 'Contact Admin'}</span>
                </a>
                <a href="/donate?lang=${lang}" class="user-menu-item" title="${tr.donate || 'Donate'}">
                  <i class="fas fa-heart text-gray-500"></i>
                  <span>${tr.donate || 'Support'}</span>
                </a>
                <div class="border-t border-gray-200 dark:border-gray-700 my-1"></div>
                <a href="/settings?lang=${lang}" class="user-menu-item" title="${tr.settings || 'Settings'}">
                  <i class="fas fa-cog text-gray-500"></i>
                  <span>${tr.settings || 'Settings'}</span>
                </a>
                <button onclick="logout()" class="user-menu-item text-red-600 w-full" title="${tr.logout || 'Logout'}">
                  <i class="fas fa-sign-out-alt"></i>
                  <span>${tr.logout || 'Logout'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `;
}

