import { getCompetitionCard, type CompetitionCardProps } from './competition-card';
import { translations, getUILanguage, isRTL } from '../../i18n';
import type { Language } from '../../config/types';

export function getCompetitionSection(
  title: string,
  items: CompetitionCardProps[],
  icon: string,
  lang: Language,
  color: string = '#8B5CF6',
  allowSeeAll: boolean = true,
  customId: string = ''
): string {
  const tr = translations[getUILanguage(lang)];
  const rtl = isRTL(lang);

  if (!items || items.length === 0) return '';

  const cardsHtml = items.map(item => getCompetitionCard(item, lang)).join('');

  const uniqueId = customId || 'section-' + Math.random().toString(36).substr(2, 9);

  // Convert hex to rgb for opacity background
  const hexToRgb = (hex: string) => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` : '139, 92, 246'; // Default purple
  }
  const rgb = hexToRgb(color);

  return `
      <section class="py-6 animate-fade-in relative group" id="${uniqueId}">
        <div class="flex items-center justify-between mb-4 px-2">
          <div class="flex items-center gap-3">
             <div class="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg transform rotate-3 transition-transform hover:rotate-0" style="background: linear-gradient(135deg, ${color}, ${color}dd)">
                <i class="${icon} text-white text-lg"></i>
             </div>
             <div>
               <h2 class="text-xl font-bold text-gray-900 dark:text-white leading-tight">${title}</h2>
               <div class="h-1 w-12 rounded-full mt-1" style="background-color: ${color}"></div>
             </div>
          </div>
          
          ${allowSeeAll ? `
            <div class="flex items-center gap-2">
              <button class="section-prev p-2 rounded-full bg-white dark:bg-gray-800 shadow-md transform scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 hover:bg-purple-50 dark:hover:bg-gray-700 z-10 disabled:opacity-0 disabled:cursor-not-allowed" aria-label="${(tr as any).previous || 'Previous'}" onclick="document.getElementById('${uniqueId}-scroll').scrollBy({left: ${rtl ? 300 : -300}, behavior: 'smooth'})">
                <i class="fas fa-chevron-${rtl ? 'right' : 'left'} text-gray-600 dark:text-gray-300"></i>
              </button>
              <button class="section-next p-2 rounded-full bg-white dark:bg-gray-800 shadow-md transform scale-90 opacity-0 group-hover:scale-100 group-hover:opacity-100 transition-all duration-300 hover:bg-purple-50 dark:hover:bg-gray-700 z-10 disabled:opacity-0 disabled:cursor-not-allowed" aria-label="${(tr as any).next || 'Next'}" onclick="document.getElementById('${uniqueId}-scroll').scrollBy({left: ${rtl ? -300 : 300}, behavior: 'smooth'})">
                <i class="fas fa-chevron-${rtl ? 'left' : 'right'} text-gray-600 dark:text-gray-300"></i>
              </button>
              <a href="/explore?category=${title}&lang=${lang}" class="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-all hover:bg-gray-100 dark:hover:bg-gray-800" style="color: ${color}">
                <span>${tr.view_all || 'View All'}</span>
                <i class="fas fa-arrow-${rtl ? 'left' : 'right'} text-xs transform transition-transform group-hover:translate-x-1"></i>
              </a>
            </div>
          ` : ''}
        </div>
        
        <div class="relative -mx-4 px-4">
           <!-- Side gradients for scroll hint -->
           <div class="absolute left-0 top-0 bottom-4 w-12 bg-gradient-to-r from-white dark:from-[#121212] to-transparent z-10 pointer-events-none hidden sm:block"></div>
           <div class="absolute right-0 top-0 bottom-4 w-12 bg-gradient-to-l from-white dark:from-[#121212] to-transparent z-10 pointer-events-none hidden sm:block"></div>
           
           <div id="${uniqueId}-scroll" class="flex overflow-x-auto pb-8 -mx-4 px-4 gap-5 scrollbar-hide snap-x snap-mandatory scroll-smooth" style="scroll-padding-left: 1rem; scroll-padding-right: 1rem;">
             ${cardsHtml}
             
             ${allowSeeAll ? `
               <div class="snap-start flex-shrink-0 w-32 flex flex-col items-center justify-center p-4">
                 <a href="/explore?category=${title}&lang=${lang}" class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400 group-hover:text-purple-600 group-hover:bg-purple-50 dark:group-hover:bg-purple-900/20 transition-all duration-300 transform hover:scale-110 shadow-sm hover:shadow-md border border-gray-200 dark:border-gray-700">
                   <i class="fas fa-arrow-${rtl ? 'left' : 'right'} text-xl"></i>
                 </a>
                 <span class="mt-3 text-sm font-medium text-gray-500">${tr.view_all || 'View All'}</span>
               </div>
             ` : ''}
           </div>
        </div>
      </section>
    `;
}
