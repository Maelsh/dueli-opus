import { translations, getUILanguage, isRTL } from '../../i18n';
import type { Competition, Language } from '../../config/types';

export interface CompetitionCardProps extends Competition {
  subcategory_slug?: string;
  category_color?: string;
  category_icon?: string;
  creator_username?: string;
  creator_name?: string;
  creator_avatar?: string;
  opponent_username?: string;
  opponent_name?: string;
  opponent_avatar?: string;
  likes_count?: number;
  dislikes_count?: number;
  is_live?: boolean;
}

export function getCompetitionCard(item: CompetitionCardProps, lang: Language): string {
  const tr = translations[getUILanguage(lang)];
  const rtl = isRTL(lang);

  // Determine background color using subcategory priority
  // Controller logic ensures item.category_color is the correct specific color (subcategory or parent fallback)
  const hexColor = item.category_color || '#8B5CF6';

  // Fixed width to prevent overlap
  const commonClasses = "duel-thumbnail shadow-lg relative h-48 rounded-2xl overflow-hidden transition-transform hover:scale-[1.02] w-full";

  const isLive = item.status === 'live';
  const isPending = item.status === 'pending';

  // Format date/time
  const date = item.scheduled_at || item.started_at || item.created_at;
  let dateDisplay = '';
  if (date) {
    const d = new Date(date);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      dateDisplay = d.toLocaleTimeString(lang === 'ar' ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' });
    } else {
      // Format as DD-MM-YYYY
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      dateDisplay = `${day}-${month}-${year}`;
    }
  }

  // Generate 6 random icons for background pattern
  // Deterministic "randomness" based on ID to avoid hydration mismatches
  const idNum = item.id;
  const icons = Array(6).fill(0).map((_, i) => {
    const seed = (idNum * (i + 1) * 9301 + 49297) % 233280;
    const rng = seed / 233280;

    // Random properties
    const size = 30 + Math.floor(rng * 50); // 30-80px
    const top = Math.floor(rng * 80); // 0-80%
    const left = Math.floor(((rng * 100) + (i * 20)) % 90); // Distributed horizontal
    const rotate = Math.floor(rng * 360);
    const opacity = 0.05 + (rng * 0.1); // 0.05 - 0.15 opacity

    return `<i class="${item.category_icon || 'fas fa-trophy'}" style="position: absolute; top: ${top}%; ${rtl ? 'right' : 'left'}: ${left}%; font-size: ${size}px; transform: rotate(${rotate}deg); opacity: ${opacity}; color: white; pointer-events: none;"></i>`;
  }).join('');

  return `
      <div class="duel-card snap-start">
        <a href="/competition/${item.id}?lang=${lang}" class="block">
          <div class="${commonClasses}" style="background-color: ${hexColor}">
            <!-- Background Gradient -->
            <div class="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-black/10 z-0"></div>
            
            <!-- Scattered Icons -->
            <div class="absolute inset-0 overflow-hidden z-0">
                ${icons}
            </div>

            <!-- Content Container -->
            <div class="absolute inset-0 flex items-center justify-center gap-3 z-10 p-4">
              <div class="flex flex-col items-center">
                <div class="competitor-avatar p-0.5 transform hover:scale-105 transition-transform duration-300">
                  <img src="${item.creator_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (item.creator_name || 'user')}" alt="" class="w-full h-full rounded-full" loading="lazy" onerror="this.src='https://api.dicebear.com/7.x/avataaars/svg?seed=default'">
                </div>
              </div>

              <div class="w-12 h-12 bg-white rounded-full shadow-lg z-20 flex items-center justify-center transform hover:rotate-180 transition-transform duration-500">
                <img src="/static/dueli-icon.png" alt="VS" class="w-full h-full object-contain" loading="lazy">
              </div>

              <div class="flex flex-col items-center">
                <div class="competitor-avatar p-0.5 transform hover:scale-105 transition-transform duration-300">
                  ${item.opponent_avatar ?
      `<img src="${item.opponent_avatar}" alt="" class="w-full h-full rounded-full" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'w-full h-full rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-bold border-2 border-white/20\\'>?</div>'">` :
      `<div class="w-full h-full rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center text-white text-2xl font-bold border-2 border-white/20 animate-pulse">?</div>`
    }
                </div>
              </div>
            </div>

            <div class="absolute top-3 ${rtl ? 'right-3' : 'left-3'} z-20">
              ${isLive ? `<span class="badge-live shadow-md"><span class="w-1.5 h-1.5 rounded-full bg-red-500 live-pulse"></span>${tr.status_live}</span>` :
      isPending ? `<span class="badge-pending shadow-md">${tr.status_pending}</span>` :
        `<span class="badge-recorded shadow-md"><i class="fas fa-play text-xs"></i>${tr.recorded}</span>`}
            </div>
            
            <!-- Date/Time in top right corner -->
            <div class="absolute top-3 ${rtl ? 'left-3' : 'right-3'} z-20">
              <span class="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md text-white text-xs font-bold flex items-center gap-1.5 border border-white/10 shadow-sm">
                <i class="fas fa-clock text-[10px]"></i>
                ${dateDisplay || '--'}
              </span>
            </div>

            <!-- Views in bottom right, Likes in bottom left -->
            <div class="absolute bottom-3 ${rtl ? 'right-3' : 'left-3'} z-20">
              <span class="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md text-white text-xs font-medium flex items-center gap-3 border border-white/10 shadow-sm">
                <span class="flex items-center gap-1.5 transition-colors hover:text-green-400" title="${(tr.like as any)?.title || (tr.like as any)?.already_liked || 'Likes'}">
                  <i class="fas fa-thumbs-up text-green-400"></i>
                  ${(item.likes_count || 0).toLocaleString()}
                </span>
                <span class="flex items-center gap-1.5 transition-colors hover:text-red-400" title="${(tr as any).dislike?.title || 'Dislikes'}">
                  <i class="fas fa-thumbs-down text-red-400"></i>
                  ${(item.dislikes_count || 0).toLocaleString()}
                </span>
              </span>
            </div>
            
            <div class="absolute bottom-3 ${rtl ? 'left-3' : 'right-3'} z-20">
              <span class="px-2.5 py-1 rounded-full bg-black/40 backdrop-blur-md text-white text-xs font-medium flex items-center gap-1.5 border border-white/10 shadow-sm" title="${tr.viewers || 'Views'}">
                <i class="fas fa-eye"></i>
                ${(item.total_views || 0).toLocaleString()}
              </span>
            </div>
          </div>
        </a>

        <div class="mt-3 px-1">
          <a href="/competition/${item.id}?lang=${lang}">
            <h3 class="text-sm font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight hover:text-purple-600 dark:hover:text-purple-400 transition-all duration-200" title="${item.title}">${item.title}</h3>
          </a>
          <div class="flex items-center gap-1.5 mt-2 text-xs text-gray-500 font-medium whitespace-nowrap overflow-hidden">
            <a href="/profile/${item.creator_username || item.creator_id}?lang=${lang}" class="hover:text-purple-600 dark:hover:text-purple-400 transition-colors flex items-center gap-1" onclick="event.stopPropagation()">
               <img src="${item.creator_avatar || ''}" class="w-4 h-4 rounded-full bg-gray-200" onerror="this.style.display='none'">
               <span class="truncate max-w-[80px]">${item.creator_name}</span>
            </a>
            <span class="mx-0.5 text-gray-300">vs</span>
             ${item.opponent_name ?
      `<a href="/profile/${item.opponent_username || item.opponent_id}?lang=${lang}" class="hover:text-purple-600 dark:hover:text-purple-400 transition-colors flex items-center gap-1" onclick="event.stopPropagation()">
                <img src="${item.opponent_avatar || ''}" class="w-4 h-4 rounded-full bg-gray-200" onerror="this.style.display='none'">
                <span class="truncate max-w-[80px]">${item.opponent_name}</span>
              </a>` :
      `<span class="text-gray-400">?</span>`
    }
          </div>
        </div>
      </div>
    `;
}
