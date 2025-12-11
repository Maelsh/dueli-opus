/**
 * About Page
 * صفحة عن ديولي
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../config/types';
import { translations, getUILanguage, isRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

export function aboutPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const lang = c.get('lang');
  const tr = translations[getUILanguage(lang)];
  const rtl = isRTL(lang);

  const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    
    <div class="min-h-screen bg-white dark:bg-[#0f0f0f] animate-fade-in">
      <main class="container mx-auto px-4 py-12">
        <!-- Hero Section -->
        <div class="text-center mb-16 max-w-4xl mx-auto">
          <div class="inline-block p-3 rounded-2xl bg-gradient-to-br from-purple-500/10 to-amber-500/10 mb-6">
            <img src="/static/dueli-icon.png" alt="Dueli" class="w-20 h-20 object-contain drop-shadow-xl">
          </div>
          <h1 class="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-amber-500 mb-6 leading-tight">
            ${tr.about_title}
          </h1>
          <p class="text-xl text-gray-600 dark:text-gray-300 leading-relaxed">
            ${tr.about_description}
          </p>
        </div>

        <!-- Features Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <div class="p-8 rounded-3xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 hover:border-purple-500/30 transition-all group">
            <div class="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 text-2xl mb-6 group-hover:scale-110 transition-transform">
              <i class="fas fa-video"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
              ${tr.about_live_streaming}
            </h3>
            <p class="text-gray-500 dark:text-gray-400 leading-relaxed">
              ${tr.about_live_streaming_desc}
            </p>
          </div>

          <div class="p-8 rounded-3xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 hover:border-amber-500/30 transition-all group">
            <div class="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 text-2xl mb-6 group-hover:scale-110 transition-transform">
              <i class="fas fa-trophy"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
              ${tr.about_fair_judging}
            </h3>
            <p class="text-gray-500 dark:text-gray-400 leading-relaxed">
              ${tr.about_fair_judging_desc}
            </p>
          </div>

          <div class="p-8 rounded-3xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 hover:border-cyan-500/30 transition-all group">
            <div class="w-14 h-14 rounded-2xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400 text-2xl mb-6 group-hover:scale-110 transition-transform">
              <i class="fas fa-globe"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
              ${tr.about_global_community}
            </h3>
            <p class="text-gray-500 dark:text-gray-400 leading-relaxed">
              ${tr.about_global_community_desc}
            </p>
          </div>
        </div>

        <!-- Gallery Section -->
        <div class="mb-20">
          <h2 class="text-3xl font-bold text-center text-gray-900 dark:text-white mb-10">
            ${tr.about_platform_preview}
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div class="rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all group h-64">
              <img src="/static/about/image-1.png" alt="Preview 1" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
            <div class="rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all group h-64 lg:col-span-2">
              <img src="/static/about/image-2.png" alt="Preview 2" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
            <div class="rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all group h-64 lg:col-span-2">
              <img src="/static/about/image-3.jpg" alt="Preview 3" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
            <div class="rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all group h-64">
              <img src="/static/about/image-4.jpg" alt="Preview 4" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
            <div class="rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all group h-64 md:col-span-2 lg:col-span-3">
              <img src="/static/about/image-5.jpg" alt="Preview 5" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
          </div>
        </div>

        <!-- Maelsh Section -->
        <div class="bg-gradient-to-br from-gray-900 to-black rounded-3xl p-8 md:p-12 text-white relative overflow-hidden">
          <div class="absolute top-0 right-0 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div class="absolute bottom-0 left-0 w-64 h-64 bg-amber-600/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
          
          <div class="relative z-10 flex flex-col md:flex-row items-center gap-10">
            <div class="w-32 h-32 md:w-40 md:h-40 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border-2 border-white/20 shadow-2xl shrink-0">
              <span class="text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-amber-400">M</span>
            </div>
            <div class="text-center md:text-${rtl ? 'right' : 'left'}">
              <h2 class="text-3xl font-bold mb-4">
                ${tr.about_developed_by}
              </h2>
              <p class="text-gray-300 text-lg leading-relaxed max-w-2xl">
                ${tr.about_maelsh_desc}
              </p>
              <div class="mt-8 flex gap-4 justify-center md:justify-start">
                <a href="#" class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                  <i class="fab fa-twitter"></i>
                </a>
                <a href="#" class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                  <i class="fab fa-github"></i>
                </a>
                <a href="#" class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                  <i class="fas fa-envelope"></i>
                </a>
              </div>
            </div>
          </div>
        </div>
      </main>
      <div>  
        ${getFooter(lang)}
      </div>
    </div>
  `;

  return c.html(generateHTML(content, lang, tr.about_dueli));
}
