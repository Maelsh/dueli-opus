/**
 * @file src/shared/components/user-card.ts
 * @description مكون كارت المستخدم - Shared View Component
 * @module shared/components/user-card
 * 
 * يُستخدم في: صفحة البحث، صفحة المتابعين، اقتراحات المستخدمين
 */

import { translations, getUILanguage, isRTL, type Language } from '../../i18n';

export interface UserCardProps {
    id: number;
    username: string;
    display_name?: string;
    avatar_url?: string;
    bio?: string;
    country?: string;
    followers_count?: number;
    following_count?: number;
    competitions_count?: number;
    is_verified?: boolean;
    is_busy?: boolean;
}

/**
 * Generate user card HTML
 * عرض كارت المستخدم
 */
export function getUserCard(user: UserCardProps, lang: Language): string {
    const tr = translations[getUILanguage(lang)];
    const rtl = isRTL(lang);

    const avatar = user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`;
    const displayName = user.display_name || user.username;

    return `
    <a href="/profile/${user.username}?lang=${lang}" class="user-card group block bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-md hover:shadow-xl transition-all duration-300 border border-gray-100 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-600">
      <div class="flex items-center gap-4">
        <!-- Avatar -->
        <div class="relative flex-shrink-0">
          <img 
            src="${avatar}" 
            alt="${displayName}" 
            class="w-16 h-16 rounded-full object-cover border-2 border-purple-100 dark:border-purple-900 group-hover:border-purple-400 transition-colors"
            loading="lazy"
            onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'"
          >
          ${user.is_verified ? `
            <div class="absolute -bottom-1 -${rtl ? 'left' : 'right'}-1 bg-blue-500 rounded-full p-1" title="${tr.verified || 'Verified'}">
              <i class="fas fa-check text-white text-xs" aria-hidden="true"></i>
              <span class="sr-only">${tr.verified || 'Verified'}</span>
            </div>
          ` : ''}
          ${user.is_busy ? `
            <div class="absolute top-0 ${rtl ? 'left' : 'right'}-0 w-3 h-3 bg-red-500 rounded-full border-2 border-white dark:border-gray-800 animate-pulse" title="${tr.busy_in_stream || 'Busy in stream'}"></div>
          ` : ''}
        </div>
        
        <!-- Info -->
        <div class="flex-1 min-w-0">
          <h3 class="font-bold text-gray-900 dark:text-white truncate group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
            ${displayName}
          </h3>
          <p class="text-sm text-gray-500 truncate">@${user.username}</p>
          ${user.bio ? `<p class="text-xs text-gray-400 mt-1 line-clamp-1">${user.bio}</p>` : ''}
        </div>
        
        <!-- Stats -->
        <div class="hidden sm:flex flex-col items-end gap-1 text-xs text-gray-400">
          ${user.followers_count !== undefined ? `
            <span class="flex items-center gap-1">
              <i class="fas fa-users" aria-hidden="true"></i>
              <span>${formatNumber(user.followers_count)}</span>
            </span>
          ` : ''}
          ${user.competitions_count !== undefined ? `
            <span class="flex items-center gap-1">
              <i class="fas fa-trophy" aria-hidden="true"></i>
              <span>${formatNumber(user.competitions_count)}</span>
            </span>
          ` : ''}
        </div>
      </div>
    </a>
  `;
}

/**
 * Generate multiple user cards
 * عرض عدة كروت مستخدمين
 */
export function getUserCards(users: UserCardProps[], lang: Language): string {
    return users.map(user => getUserCard(user, lang)).join('');
}

/**
 * Format number with K/M suffix
 */
function formatNumber(num: number): string {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
}
