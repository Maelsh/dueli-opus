/**
 * Competition Detail Page
 * صفحة تفاصيل المنافسة
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../config/types';
import { translations, getUILanguage, isRTL, getCategoryName } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';
import { getClientSharedScript } from './live/scripts/client/shared';
import { getViewerScript } from './live/scripts/client/viewer';

export async function competitionPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
  const lang = c.get('lang');
  const tr = translations[getUILanguage(lang)];
  const id = c.req.param('id');
  const rtl = isRTL(lang);

  const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    
    <div class="container mx-auto px-4 py-6" id="competitionContainer">
      <div class="flex flex-col items-center justify-center py-16">
        <i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i>
        <p class="text-gray-500">${tr.loading}</p>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <!-- HLS.js & Shared streaming scripts -->
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    
    <!-- Shared Streaming Classes (ChunkManager, LiveSequentialPlayer, SmartVodPlayer...) -->
    <script nonce="${(c.get('cspNonce') as string) ?? ''}">
      (function() {
      ${getClientSharedScript()}
      })();
    </script>
    
    <script nonce="${(c.get('cspNonce') as string) ?? ''}">
      const lang = ${JSON.stringify(getUILanguage(lang))};
      const isRTL = ${rtl};
      const competitionId = ${JSON.stringify(id ?? '')};
      const tr = ${JSON.stringify(tr)};
      let competitionData = null;
      
      // Client-side getCategoryName function (mirrors src/i18n/index.ts):
      // explicit DB fields (category_name_<lang>/name_<lang>) first, then
      // namespaced i18n key categories.<slug>, then English fallback.
      function getCategoryName(category, language) {
        const reqLang = language === 'ar' ? 'ar' : 'en';
        const catReq = 'category_name_' + reqLang;
        if (category[catReq]) return category[catReq];
        const nameReq = 'name_' + reqLang;
        if (category[nameReq]) return category[nameReq];
        // Namespaced i18n pack lookup
        const slug = category.category_slug || category.slug;
        if (slug) {
          const slugKey = slug.replace(/-/g, '_');
          if (tr.categories && tr.categories[slugKey]) return tr.categories[slugKey];
          if (tr[slugKey]) return tr[slugKey];
        }

        // Fallback to category_name based on language
        const langKey = language === 'ar' ? 'category_name_ar' : 'category_name_en';
        if (category[langKey]) return category[langKey];

        // Fallback to name based on language
        const nameKey = language === 'ar' ? 'name_ar' : 'name_en';
        if (category[nameKey]) return category[nameKey];

        // Fallback to English
        return category.category_name_en || category.name_en || '';
      }
      
      document.addEventListener('DOMContentLoaded', async () => {
        await checkAuth();
        loadCompetition();
      });
      
      async function loadCompetition() {
        try {
          const res = await fetch('/api/competitions/' + competitionId);
          const data = await res.json();
          
          if (!data.success) {
            document.getElementById('competitionContainer').innerHTML = \`
              <div class="text-center py-16">
                <i class="fas fa-exclamation-circle text-6xl text-red-400 mb-4"></i>
                <h2 class="text-2xl font-bold text-gray-600">\${tr.not_found}</h2>
              </div>
            \`;
            return;
          }
          
          competitionData = data.data;
          renderCompetition(competitionData);
          // Dynamics need the rendered DOM (chat box, stats) and the loaded
          // competitionData — starting them at parse time raced the async
          // injection and painted nothing. Re-runs (invite/request flows)
          // reset timers/streams instead of stacking them.
          initCompetitionDynamics();

          // T3.2: universal lifecycle countdown (join window / start window / live limit)
          if (competitionData.timer && competitionData.timer.deadline && typeof window.createCountdownTimer === 'function') {
            const timerHost = document.getElementById('countdownTimerHost');
            if (timerHost) {
              timerHost.innerHTML = '';
              window.createCountdownTimer({
                competitionId: competitionId,
                deadline: competitionData.timer.deadline,
                type: competitionData.timer.type,
                labelKey: competitionData.timer.labelKey
              });
            }
          }
          
          // T2.1: Auto-open invite panel when arriving from creation (?invite=1)
          // Only if current user is creator, competition still pending without opponent
          const urlParams = new URLSearchParams(window.location.search);
          if (urlParams.get('invite') === '1'
              && window.currentUser
              && window.currentUser.id === competitionData.creator_id
              && !competitionData.opponent_id
              && competitionData.status === 'pending'
              && window.openInvitePanel) {
            setTimeout(() => window.openInvitePanel(competitionId), 400);
          }
        } catch (err) {
          console.error(err);
        }
      }
      
      function renderCompetition(comp) {
        const isLive = comp.status === 'live';
        const isPending = comp.status === 'pending';
        const isAccepted = comp.status === 'accepted';
        const isCompleted = comp.status === 'completed';
        const isCreator = window.currentUser && window.currentUser.id === comp.creator_id;
        const isOpponent = window.currentUser && window.currentUser.id === comp.opponent_id;
        // R2-J (H3): invite/request/show-page contract. A pending invitation for
        // the current user replaces the join-request path with Accept/Decline;
        // closed competitions (non-pending or opponent set) expose a translated
        // reason and no action buttons for non-parties.
        const hasRequested = comp.user_has_pending_request === true;
        const hasInvite = comp.user_has_pending_invitation === true;
        const needsOpponent = isPending && !comp.opponent_id;
        const closedReason = !needsOpponent && !isCreator && !isOpponent
          ? (comp.opponent_id
            ? (tr.competition_errors?.opponent_already_set || tr.status_accepted || 'Accepted')
            : (tr.competition_errors?.competition_closed || tr['status_' + comp.status] || comp.status))
          : '';
        
        const bgColors = {
          1: 'from-purple-600 to-purple-800',
          2: 'from-cyan-500 to-cyan-700',
          3: 'from-amber-500 to-orange-600'
        };
        const bgColor = bgColors[comp.category_id] || 'from-gray-600 to-gray-800';
        
        document.getElementById('competitionContainer').innerHTML = \`
          <div class="max-w-6xl mx-auto">
            <div class="flex items-center gap-4 mb-6">
              <a href="/?lang=\${lang}" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
                <i class="fas fa-arrow-\${isRTL ? 'right' : 'left'} text-xl text-gray-600 dark:text-gray-300"></i>
              </a>
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="\${
                    isLive ? 'badge-live' :
                    isPending ? 'badge-pending' :
                    isAccepted ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 px-3 py-1 rounded-full text-xs font-bold' :
                    'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold'
                  } flex items-center gap-1">
                    \${isLive ? '<span class="w-1.5 h-1.5 rounded-full bg-red-500 live-pulse"></span>' : ''}
                    \${isLive ? tr.status_live : isPending ? tr.status_pending : isAccepted ? (tr.status_accepted || 'Ready') : tr.status_completed}
                  </span>
                  <span class="text-sm text-gray-500 dark:text-gray-400">
                    <i class="\${comp.category_icon} me-1"></i>
                    \${getCategoryName(comp, lang)}
                  </span>
                </div>
                <h1 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">\${comp.title}\${comp.is_fake ? \` <span data-demo-badge="1" class="inline-block align-middle text-xs font-bold px-2.5 py-1 rounded-full bg-amber-400/90 text-amber-950" title="\${tr.demo.title}">\${tr.demo.badge}</span>\` : ''}</h1>
                <!-- T3.2: lifecycle countdown host (join/start/live-limit) -->
                <div id="countdownTimerHost" class="mt-3"></div>
              </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div class="lg:col-span-2 space-y-6">
                <!-- Video Player Area -->
                <div class="rounded-2xl overflow-hidden shadow-xl relative" id="videoPlayerArea">
                  
                  <!-- ===== للمنافسين (host/guest): توجيه لصفحة البث المخصصة ===== -->
                  \${(isCreator || isOpponent) && comp.opponent_id && isLive ? \`
                    <div class="bg-gradient-to-br \${bgColor} aspect-video flex items-center justify-center relative">
                      <div class="text-center text-white">
                        <div class="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                          <i class="fas fa-broadcast-tower text-3xl text-red-400 animate-pulse"></i>
                        </div>
                        <p class="text-lg font-bold mb-2">\${tr.status_live || 'البث مباشر'}</p>
                        <p class="text-sm opacity-75 mb-4">\${isCreator ? (tr.you_are_host || 'أنت المضيف') : (tr.you_are_guest || 'أنت الضيف')}</p>
                        <!-- R2-L2: production room — creator/host, opponent and viewers
                             all enter /live/:id (role resolved server-side from the
                             session vs creator/opponent). The /live/host|guest test
                             pages remain for diagnostics only, never the sole path. -->
                        <a href="/live/\${competitionId}?lang=\${lang}"
                           class="px-6 py-3 bg-red-600 rounded-full font-bold hover:bg-red-700 transition-all inline-flex items-center gap-2">
                          <i class="fas fa-video"></i>
                          \${tr.join_stream || 'انضم للبث'}
                        </a>
                      </div>
                    </div>
                    
                  \` : (isCreator || isOpponent) && comp.opponent_id && (isPending || comp.status === 'accepted') ? \`
                    <!-- Ready to Go Live -->
                    <div class="bg-gradient-to-br \${bgColor} aspect-video flex items-center justify-center">
                      <div class="text-center text-white">
                        <i class="fas fa-video text-6xl opacity-80 mb-4"></i>
                        <p class="mb-4">\${tr.competitors} \${tr.status_accepted}</p>
                        <button data-csp-on="click" data-csp-fn="goLive" data-csp-args='[]' class="px-6 py-3 bg-green-600 rounded-full font-bold hover:bg-green-700 transition-all inline-flex items-center gap-2">
                          <i class="fas fa-broadcast-tower"></i>
                          \${tr.status_live || 'Go Live'}
                        </button>
                      </div>
                    </div>

                  \` : comp.youtube_live_id && isLive ? \`
                    <!-- YouTube Live -->
                    <div class="aspect-video">
                      <iframe width="100%" height="100%" src="https://www.youtube.com/embed/\${comp.youtube_live_id}?autoplay=1" frameborder="0" allowfullscreen class="absolute inset-0"></iframe>
                    </div>

                  \` : comp.youtube_video_url ? \`
                    <!-- YouTube VOD -->
                    <div class="aspect-video">
                      <iframe width="100%" height="100%" src="https://www.youtube.com/embed/\${comp.youtube_video_url.split('v=')[1] || comp.youtube_video_url}" frameborder="0" allowfullscreen class="absolute inset-0"></iframe>
                    </div>

                  \` : (isLive || isCompleted) ? \`
                    <!-- ===== مشاهد البث المدمج (Chunk-Based) ===== -->
                    <div class="bg-black relative" id="embeddedViewerSection">
                      <!-- Video Container with double buffering -->
                      <div class="aspect-video relative bg-black" id="embeddedVideoContainer">
                        <div id="embeddedModeBadge" class="hidden absolute top-3 right-3 z-10 px-3 py-1 rounded-full text-xs font-bold text-white"></div>
                        <video id="embeddedVideoPlayer1" autoplay playsinline 
                               class="absolute inset-0 transition-opacity duration-300 opacity-100 z-[2] bg-black"></video>
                        <video id="embeddedVideoPlayer2" autoplay playsinline 
                               class="absolute inset-0 transition-opacity duration-300 opacity-0 z-[1] bg-black"></video>
                        
                        <!-- Status overlay: R2-L2 explicit media states
                             (waiting/playing/error/processing/ready/unavailable).
                             Never an endless spinner — error/unavailable states
                             offer a manual retry instead of silent polling. -->
                        <div id="embeddedStatusOverlay" class="absolute inset-0 flex items-center justify-center bg-black/70 z-20">
                          <div class="text-center text-white">
                            <i id="embeddedStatusIcon" class="fas fa-spinner fa-spin text-4xl mb-3"></i>
                            <p class="text-sm" id="embeddedStatusText">\${isLive ? (tr.connecting_to_stream || 'جاري الاتصال بالبث...') : (tr.loading_video || 'جاري تحميل الفيديو...')}</p>
                            <p class="text-xs mt-1 opacity-70 hidden" id="embeddedStateLabel" data-media-state="waiting"></p>
                            <button id="embeddedRetryBtn" data-csp-on="click" data-csp-fn="embeddedRetryMedia" data-csp-args='[]'
                                    class="hidden mt-3 px-5 py-2 bg-purple-600 text-white rounded-full text-sm font-bold hover:bg-purple-700 transition-colors">
                              <i class="fas fa-redo me-1"></i>\${tr.retry || 'Retry'}
                            </button>
                          </div>
                        </div>
                        
                        <!-- Fullscreen button -->
                        <button data-csp-on="click" data-csp-fn="embeddedToggleFullscreen" data-csp-args='[]' 
                                class="absolute bottom-3 right-3 z-30 w-9 h-9 bg-black/50 backdrop-blur text-white rounded-lg hover:bg-black/70 transition flex items-center justify-center"
                                title="\${tr.fullscreen || 'ملء الشاشة'}">
                          <i id="embeddedFsIcon" class="fas fa-expand text-sm"></i>
                        </button>

                        <!-- Stream info bar -->
                        <div class="absolute bottom-3 left-3 z-30 flex items-center gap-2">
                          \${isLive ? '<span class="flex items-center gap-1 bg-red-600 text-white text-xs px-2 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>' + (tr.status_live || 'مباشر') + '</span>' : ''}
                          <span id="embeddedChunkInfo" class="text-xs text-white/70 bg-black/40 px-2 py-1 rounded-full hidden"></span>
                        </div>
                      </div>
                      
                      <!-- VOD Controls (hidden by default, shown for recorded) -->
                      <div id="embeddedVodControls" class="hidden bg-gray-900 p-3">
                        <div class="flex items-center gap-3">
                          <button id="embeddedPlayPauseBtn" data-csp-on="click" data-csp-fn="embeddedTogglePlayPause" data-csp-args='[]' 
                                  class="w-9 h-9 flex items-center justify-center bg-purple-600 text-white rounded-full hover:bg-purple-700 flex-shrink-0">
                            <i id="embeddedPlayPauseIcon" class="fas fa-play text-sm"></i>
                          </button>
                          <span id="embeddedTimeDisplay" class="text-xs font-mono text-gray-300 w-20 flex-shrink-0">0:00 / 0:00</span>
                          <input type="range" id="embeddedSeekbar" min="0" max="100" value="0"
                                 class="flex-1 h-1.5 bg-gray-600 rounded-full appearance-none cursor-pointer accent-purple-500"
                                 title="Seek" />
                          <button id="embeddedDownloadBtn" data-csp-on="click" data-csp-fn="embeddedDownload" data-csp-args='[]'
                                  class="hidden w-9 h-9 flex items-center justify-center bg-green-600 text-white rounded-full hover:bg-green-700 flex-shrink-0"
                                  title="${tr.download || '\u062a\u062d\u0645\u064a\u0644 \u0627\u0644\u0641\u064a\u062f\u064a\u0648'}">
                            <i class="fas fa-download text-sm"></i>
                          </button>
                          <button data-csp-on="click" data-csp-fn="embeddedToggleFullscreen" data-csp-args='[]'
                                  class="w-9 h-9 flex items-center justify-center bg-gray-700 text-white rounded-full hover:bg-gray-600 flex-shrink-0">
                            <i class="fas fa-expand text-sm"></i>
                          </button>
                        </div>
                      </div>
                    </div>

                  \` : \`
                    <!-- No stream yet -->
                    <div class="bg-gradient-to-br \${bgColor} aspect-video flex items-center justify-center">
                      <div class="text-center text-white">
                        <i class="fas fa-video text-6xl opacity-50 mb-4"></i>
                        <p>\${isPending ? tr.status_pending : tr.stream_not_available}</p>
                      </div>
                    </div>
                  \`}
                </div>
                
                <div class="card p-6">
                  <h3 class="font-bold text-lg mb-4 text-gray-900 dark:text-white">\${tr.competitors}</h3>
                  <div class="grid grid-cols-2 gap-6">
                    <div class="text-center">
                      \${window.renderUserAvatar({
                        username: comp.creator_username,
                        displayName: comp.creator_name,
                        avatarUrl: comp.creator_avatar,
                        fallbackSeed: comp.creator_name,
                        imgClassName: 'w-20 h-20 rounded-full mx-auto mb-3 border-4 border-purple-200 dark:border-purple-800',
                        className: 'block'
                      })}
                      <h4 class="font-bold text-gray-900 dark:text-white">\${comp.creator_name}</h4>
                      <p class="text-sm text-gray-500">@\${comp.creator_username}</p>
                    </div>
                    
                    <div class="text-center">
                      \${comp.opponent_id ? \`
                        \${window.renderUserAvatar({
                          username: comp.opponent_username,
                          displayName: comp.opponent_name,
                          avatarUrl: comp.opponent_avatar,
                          fallbackSeed: comp.opponent_name,
                          imgClassName: 'w-20 h-20 rounded-full mx-auto mb-3 border-4 border-amber-200 dark:border-amber-800',
                          className: 'block'
                        })}
                        <h4 class="font-bold text-gray-900 dark:text-white">\${comp.opponent_name}</h4>
                        <p class="text-sm text-gray-500">@\${comp.opponent_username}</p>
                      \` : \`
                        <div class="w-20 h-20 rounded-full mx-auto mb-3 bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-4 border-dashed border-gray-300 dark:border-gray-600">
                          <i class="fas fa-question text-3xl text-gray-400"></i>
                        </div>
                        <h4 class="font-bold text-gray-400">\${tr.awaiting_opponent}</h4>
                        \${isCreator ? \`
                          <button data-csp-on="click" data-csp-fn="window.toggleInvitePanel" data-csp-args='[\${comp.id}]' class="mt-3 px-5 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full text-sm font-bold hover:from-purple-700 hover:to-indigo-700 transition-all shadow-lg shadow-purple-500/20 hover:shadow-purple-500/40 active:scale-95">
                            <i class="fas fa-user-plus me-1"></i>
                            \${tr.matchmaking?.invite_opponent_btn || tr.invite || 'Invite Opponent'}
                          </button>
                          <p class="mt-2 text-xs"><a href="/help?lang=\${lang}#topic-invite" class="text-purple-600 dark:text-purple-400 hover:underline font-semibold">\${(tr.help_guide && tr.help_guide.learn_more) || 'Learn more'}</a></p>
                        \` : ''}
                        \${window.currentUser && !isCreator && hasInvite && isPending ? \`
                          <p class="mt-3 text-sm font-semibold text-purple-700 dark:text-purple-300">\${tr.invites_you || 'Invites you to compete'}</p>
                          <div class="mt-2 flex items-center justify-center gap-2">
                            <button data-csp-on="click" data-csp-fn="acceptInvite" data-csp-args='[]' class="px-5 py-2.5 bg-green-600 text-white rounded-full text-sm font-bold hover:bg-green-700 transition-all">
                              <i class="fas fa-check me-1"></i>
                              \${tr.accept || 'Accept'}
                            </button>
                            <button data-csp-on="click" data-csp-fn="declineInvite" data-csp-args='[]' class="px-5 py-2.5 bg-red-600 text-white rounded-full text-sm font-bold hover:bg-red-700 transition-all">
                              <i class="fas fa-times me-1"></i>
                              \${tr.decline || 'Decline'}
                            </button>
                          </div>
                        \` : ''}
                        \${window.currentUser && !isCreator && !hasInvite && !hasRequested && needsOpponent ? \`
                          <button data-csp-on="click" data-csp-fn="requestJoin" data-csp-args='[]' class="join-btn mt-3">
                            <i class="fas fa-hand-paper"></i>
                            \${tr.request_join}
                          </button>
                          <p class="mt-2 text-xs text-center"><a href="/help?lang=\${lang}#topic-invite" class="text-purple-600 dark:text-purple-400 hover:underline font-semibold">\${(tr.help_guide && tr.help_guide.learn_more) || 'Learn more'}</a></p>
                        \` : ''}
                        \${window.currentUser && !isCreator && !hasInvite && hasRequested ? \`
                          <button data-csp-on="click" data-csp-fn="cancelRequest" data-csp-args='[]' class="mt-3 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-sm font-bold hover:bg-gray-300 transition-all">
                            <i class="fas fa-times me-1"></i>
                            \${tr.cancel_request}
                          </button>
                        \` : ''}
                        \${window.currentUser && !isCreator && !isOpponent && !hasInvite && !hasRequested && closedReason ? \`
                          <p class="mt-3 text-sm font-semibold text-gray-500 dark:text-gray-400">\${closedReason}</p>
                        \` : ''}
                        \${!window.currentUser ? \`
                          <button data-csp-on="click" data-csp-fn="showLoginModal" data-csp-args='[]' class="join-btn mt-3">
                            <i class="fas fa-sign-in-alt"></i>
                            \${tr.login_to_compete}
                          </button>
                        \` : ''}
                      \`}
                    </div>
                  </div>
                </div>

                \${isCompleted && comp.winner_id ? \`
                  <!-- T2.4: Winner banner (decided by viewer ratings) -->
                  <div class="card p-5 border-2 border-amber-300 dark:border-amber-700 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/10">
                    <div class="flex items-center justify-center gap-3 text-center">
                      <i class="fas fa-trophy text-3xl text-amber-500"></i>
                      <div>
                        <p class="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">\${tr.rate_winner_banner || 'Winner by public rating'}</p>
                        <p class="text-lg font-black text-gray-900 dark:text-white">
                          \${comp.winner_id === comp.creator_id ? comp.creator_name : (comp.opponent_name || '')}
                        </p>
                      </div>
                    </div>
                  </div>
                \` : ''}

                \${(isLive || isCompleted) ? \`
                  <!-- R2-V: live provisional tally + read-only final (ar/en, dark, RTL) -->
                  <div class="card p-6" id="rateCard" aria-live="polite">
                    <h3 class="font-bold text-lg mb-1 text-gray-900 dark:text-white">
                      <i class="fas fa-star text-amber-400 me-1"></i>
                      \${tr.rate_title || 'Rate the competitors'}
                    </h3>
                    <p id="rateStateLine" class="text-xs font-semibold mb-4 \${isLive ? 'text-sky-600 dark:text-sky-400' : 'text-gray-500 dark:text-gray-400'}">\${isLive ? ((tr.ratings && tr.ratings.live_provisional) || 'Provisional tally') : ((tr.ratings && tr.ratings.final_readonly) || 'Final result')}</p>
                    <p class="text-xs mb-4"><a href="/help?lang=\${lang}#topic-ratings" class="text-purple-600 dark:text-purple-400 hover:underline font-semibold">\${(tr.help_guide && tr.help_guide.learn_more) || 'Learn more'}</a></p>
                    <div id="rateTally" class="text-sm text-gray-600 dark:text-gray-300 mb-4">\${(tr.ratings && tr.ratings.summary_title) || ''}</div>
                    \${isLive && window.currentUser && !isCreator && !isOpponent ? \`
                    <div class="space-y-4" id="rateStars">
                      <div class="flex flex-wrap items-center justify-between gap-2">
                        <div class="flex items-center gap-2 min-w-0">
                          \${window.renderUserAvatar({
                            username: comp.creator_username,
                            displayName: comp.creator_name,
                            avatarUrl: comp.creator_avatar,
                            fallbackSeed: comp.creator_name,
                            imgClassName: 'w-9 h-9 rounded-full',
                            className: 'block'
                          })}
                          <span class="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate">\${comp.creator_name}</span>
                        </div>
                        <!-- R3-C1 forensic: plain natively-operable buttons with honest
                          names (competitor + value). A radio pattern would
                          require managed checked state + arrow-key roving
                          behavior that submitRating does not implement, so the
                          roles were removed rather than kept as decoration. -->
                        <div class="flex gap-1" dir="ltr" aria-label="\${comp.creator_name}">
                          \${[1,2,3,4,5].map(v => \`
                            <button data-csp-on="click" data-csp-fn="submitRating" data-csp-args='[\${comp.creator_id},\${v},"@this"]' data-val="\${v}"
                              class="rate-star text-2xl text-gray-300 dark:text-gray-600 hover:text-amber-400 transition-colors"
                              aria-label="\${comp.creator_name} \${v}/5"><i class="fas fa-star" aria-hidden="true"></i></button>
                          \`).join('')}
                        </div>
                      </div>
                      \${comp.opponent_id ? \`
                      <div class="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-gray-100 dark:border-gray-800">
                        <div class="flex items-center gap-2 min-w-0">
                          \${window.renderUserAvatar({
                            username: comp.opponent_username,
                            displayName: comp.opponent_name,
                            avatarUrl: comp.opponent_avatar,
                            fallbackSeed: comp.opponent_name,
                            imgClassName: 'w-9 h-9 rounded-full',
                            className: 'block'
                          })}
                          <span class="font-semibold text-sm text-gray-800 dark:text-gray-100 truncate">\${comp.opponent_name}</span>
                        </div>
                        <div class="flex gap-1" dir="ltr" aria-label="\${comp.opponent_name}">
                          \${[1,2,3,4,5].map(v => \`
                            <button data-csp-on="click" data-csp-fn="submitRating" data-csp-args='[\${comp.opponent_id},\${v},"@this"]' data-val="\${v}"
                              class="rate-star text-2xl text-gray-300 dark:text-gray-600 hover:text-amber-400 transition-colors"
                              aria-label="\${comp.opponent_name} \${v}/5"><i class="fas fa-star" aria-hidden="true"></i></button>
                          \`).join('')}
                        </div>
                      </div>
                      \` : ''}
                      <p id="rateEligibleHint" class="hidden text-xs text-amber-600 dark:text-amber-400 font-semibold">\${(tr.ratings && tr.ratings.not_eligible) || ''}</p>
                    </div>
                    \` : ''}
                    \${isCompleted ? \`<p class="mt-3 text-xs text-gray-500 dark:text-gray-400">\${(tr.ratings && tr.ratings.final_readonly) || ''}</p>\` : ''}
                    <p id="rateMsg" class="hidden mt-3 text-sm text-green-600 dark:text-green-400 font-semibold"></p>
                  </div>
                \` : ''}
                
                <div class="card p-6">
                  <h3 class="font-bold text-lg mb-4 text-gray-900 dark:text-white">\${tr.competition_rules}</h3>
                  <pre class="whitespace-pre-wrap text-gray-600 dark:text-gray-300 text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">\${comp.rules}</pre>
                </div>
              </div>
              
              <div class="space-y-6">
                <div class="card p-6">
                  <div class="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p class="text-3xl font-bold text-purple-600" id="statViews">\${(comp.total_views || 0).toLocaleString()}</p>
                      <p class="text-sm text-gray-500">\${tr.viewers}</p>
                      <p class="text-xs text-gray-400 hidden" id="presenceNow" aria-live="polite"></p>
                    </div>
                    <div>
                      <p class="text-3xl font-bold text-purple-600">\${comp.comments_count ?? comp.total_comments ?? 0}</p>
                      <p class="text-sm text-gray-500">\${tr.comments.label}</p>
                    </div>
                  </div>
                  
                  <!-- Interaction Buttons: R2-L2 real Like + Dislike (single
                       active reaction per identity: like/dislike/neutral).
                       Counts always come from the server response — switching
                       never double-counts. Signals are H7-ready; no ranking
                       is computed here. -->
                  <div class="flex gap-2 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700" id="reactionBar">
                    <button data-csp-on="click" data-csp-fn="setReaction" data-csp-args='["like"]' id="likeBtn"
                      aria-pressed="false" aria-label="\${tr.like?.title || 'Like'}"
                      class="flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-green-50 hover:text-green-600">
                      <i class="fas fa-thumbs-up"></i>
                      <span id="likeCount">\${comp.likes_count || 0}</span>
                    </button>
                    <button data-csp-on="click" data-csp-fn="setReaction" data-csp-args='["dislike"]' id="dislikeBtn"
                      aria-pressed="false" aria-label="\${tr.interactions?.dislike || 'Dislike'}"
                      class="flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-red-50 hover:text-red-500">
                      <i class="fas fa-thumbs-down"></i>
                      <span id="dislikeCount">\${comp.dislikes_count || 0}</span>
                    </button>
                    <button data-csp-on="click" data-csp-fn="toggleReminder" data-csp-args='[]' id="reminderBtn" 
                      class="flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 \${comp.user_reminded ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-amber-50 hover:text-amber-500'}">
                      <i class="fas fa-bell"></i>
                      \${comp.user_reminded ? tr.reminder_set || 'Reminder On' : tr.remind_me || 'Remind Me'}
                    </button>
                    <button data-csp-on="click" data-csp-fn="showReportModal" data-csp-args='[]' aria-label="\${tr.report?.title || tr.submit_report || 'Report'}" title="\${tr.report?.title || tr.submit_report || 'Report'}" class="px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all">
                      <i class="fas fa-flag" aria-hidden="true"></i>
                    </button>
                  </div>
                </div>
                
                <!-- R2-L2: single competition ad slot (below stats, clear of
                     video/comments/ratings). Impression fires once on ACTUAL
                     view via IntersectionObserver — never on fetch. Budget /
                     idempotency enforced server-side (chargeImpression). -->
                <div class="card p-4 hidden" id="competitionAdSlot" aria-label="\${tr.ads?.sponsored_label || 'Sponsored'}">
                  <div class="flex items-center justify-between mb-2">
                    <span class="text-[11px] font-bold uppercase tracking-wide text-gray-400">\${tr.ads?.sponsored_label || 'Sponsored'}</span>
                  </div>
                  <div id="competitionAdBody" class="min-h-[72px] flex items-center justify-center text-sm text-gray-500"></div>
                </div>

                <div class="card overflow-hidden">
                  <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-between gap-2">
                    <h3 class="font-bold text-gray-900 dark:text-white">\${tr.live_chat}</h3>
                    <a href="/help?lang=\${lang}#topic-comments" class="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline">\${(tr.help_guide && tr.help_guide.learn_more) || 'Learn more'}</a>
                  </div>
                  <div class="h-80 overflow-y-auto p-4 space-y-3" id="chatMessages">
                    <p class="text-center text-gray-400" id="commentsEmpty"></p>
                  </div>
                  <div class="p-4 border-t border-gray-200 dark:border-gray-700">
                    \${window.currentUser ? \`
                      <form data-csp-on="submit" data-csp-fn="sendComment" data-csp-args='["@event"]' class="flex gap-2">
                        <input type="text" id="commentInput" placeholder="\${tr.add_comment}..." aria-label="\${tr.add_comment || 'Add comment'}" class="flex-1 border dark:border-gray-600 dark:bg-gray-700 rounded-full px-4 py-2 text-sm">
                        <button type="submit" aria-label="\${tr.send || 'Send'}" class="p-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors">
                          <i class="fas fa-paper-plane"></i>
                        </button>
                      </form>
                      <div class="mt-2 text-center">
                        <button id="commentsMoreBtn" data-csp-on="click" data-csp-fn="loadMoreComments" data-csp-args='[]' class="hidden text-sm text-purple-600 hover:underline font-medium" aria-label="\${(tr.comments && tr.comments.load_more) || tr.load_more || 'Load more'}">\${(tr.comments && tr.comments.load_more) || tr.load_more || 'Load more'}</button>
                      </div>
                    \` : \`
                      <button data-csp-on="click" data-csp-fn="showLoginModal" data-csp-args='[]' class="w-full py-2 text-center text-purple-600 hover:underline text-sm font-medium">
                        \${tr.login_required}
                      </button>
                    \`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        \`;
      }
      
      // Go Live - start P2P streaming
      async function goLive() {
        if (!window.currentUser) { showLoginModal(); return; }
        
        const isCreator = window.currentUser.id === competitionData.creator_id;
        const isOpponent = window.currentUser.id === competitionData.opponent_id;
        
        if (!isCreator && !isOpponent) {
          showToast(tr.not_authorized || 'Not authorized', 'error');
          return;
        }
        
        const streamServerUrl = 'https://maelshpro.com/ffmpeg';
        const liveUrl = streamServerUrl + '/storage/live/match_' + competitionId + '/playlist.m3u8';
        
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/start', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ live_url: liveUrl })
          });
          
          const data = await res.json();
          if (data.success) {
            // R2-L2: production room for every role — /live/:id resolves
            // host/opponent/viewer from the session (same guards as start).
            window.location.href = '/live/' + competitionId + '?lang=' + lang;
          } else {
            showToast(data.error || 'Failed to start', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast(tr.error_occurred || 'Error', 'error');
        }
      }
      
      async function requestJoin() {
        if (!window.currentUser) { showLoginModal(); return; }
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requester_id: window.currentUser.id })
          });
          const data = await res.json();
          if (data.success) {
            showToast(tr.request_sent, 'success');
            loadCompetition();
          }
        } catch (err) { console.error(err); }
      }
      
      async function cancelRequest() {
        if (!window.currentUser) return;
        try {
          await fetch('/api/competitions/' + competitionId + '/request', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requester_id: window.currentUser.id })
          });
          loadCompetition();
        } catch (err) { console.error(err); }
      }

      // R2-V: live-only viewer rating (1-5, upsert = create-or-replace).
      // Stars stay enabled so a second vote REPLACES the first (one
      // effective vote); the tally below refreshes from the summary +
      // live rating_updated events on the existing competition channel.
      window.submitRating = async function(competitorId, value, btn) {
        if (!window.currentUser) { showLoginModal(); return; }
        const starRow = btn.parentElement;
        const stars = starRow.querySelectorAll('.rate-star');
        // Highlight up to the chosen star
        stars.forEach(s => {
          const on = parseInt(s.dataset.val) <= value;
          s.classList.toggle('text-amber-400', on);
          s.classList.toggle('text-gray-300', !on);
          s.classList.toggle('dark:text-gray-600', !on);
        });
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/rate?lang=' + (window.lang || 'ar'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + (localStorage.getItem('sessionId') || '')
            },
            body: JSON.stringify({ competitor_id: competitorId, rating: value })
          });
          const data = await res.json();
          if (data.success) {
            const msg = document.getElementById('rateMsg');
            const thanks = (data.data && data.data.updated)
              ? ((tr.competition_errors && tr.competition_errors.rating_replaced) || tr.rate_thanks || 'Thanks for rating!')
              : (tr.rate_thanks || 'Thanks for rating!');
            if (msg) { msg.textContent = thanks; msg.classList.remove('hidden'); }
            showToast(thanks, 'success');
            await loadRatingSummary();
          } else {
            showToast(data.error || tr.rate_failed || 'Rating failed', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast(tr.rate_failed || 'Rating failed', 'error');
        }
      };

      window.withdrawRating = async function(competitorId) {
        if (!window.currentUser) { showLoginModal(); return; }
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/rate?competitor_id=' + competitorId + '&lang=' + (window.lang || 'ar'), {
            method: 'DELETE',
            headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('sessionId') || '') }
          });
          const data = await res.json();
          if (data.success) {
            showToast((tr.ratings && tr.ratings.withdrawn) || 'Withdrawn', 'success');
            await loadRatingSummary();
          } else {
            showToast(data.error || tr.rate_failed || 'Rating failed', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast(tr.rate_failed || 'Rating failed', 'error');
        }
      };

      // R2-V: interim (live) / final (completed) tally, no rater identity.
      async function loadRatingSummary() {
        const box = document.getElementById('rateTally');
        if (!box || !competitionData || (competitionData.status !== 'live' && competitionData.status !== 'completed')) return;
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/ratings/summary?lang=' + (window.lang || 'ar'));
          const data = await res.json().catch(function(){ return null; });
          if (!data || !data.success) return;
          const rows = (data.data.competitors || []).map(function(e) {
            const avg = e.average === null || e.average === undefined ? '—' : String(e.average);
            return '<div>' + avg + ' × ' + e.count + '</div>';
          }).join('');
          box.innerHTML = rows || (((tr.ratings && tr.ratings.no_ratings) || 'No ratings yet'));
          // Eligibility hint: live + logged viewer without 300s.
          const hint = document.getElementById('rateEligibleHint');
          if (hint) {
            const w = competitionData.viewer_watch;
            const show = competitionData.status === 'live' && w && w.eligible === false;
            hint.classList.toggle('hidden', !show);
          }
        } catch (e) {}
      }

      // R2-V: tally updates arrive on the EXISTING competition channel.
      let ratingsLiveES = null;
      function subscribeRatingsLive() {
        try {
          if (ratingsLiveES) { try { ratingsLiveES.close(); } catch (e) {} ratingsLiveES = null; }
          if (!competitionData || (competitionData.status !== 'live' && competitionData.status !== 'completed')) return;
          const es = new EventSource('/api/sse?channel=' + encodeURIComponent('competition:' + competitionId));
          ratingsLiveES = es;
          es.addEventListener('rating_updated', function() { loadRatingSummary(); });
          es.addEventListener('competition_status', function() { loadRatingSummary(); });
        } catch (e) {}
      }

      // B2+B3: paged comments state (roots carry replies_count)
      let commentsItems = [];
      let commentsTotal = 0;
      const COMMENTS_PAGE = 20;
      function commentsEmptyText() {
        return (tr.comments && tr.comments.no_comments) || tr.no_comments_yet || 'No comments yet';
      }
      function paintCommentsEmpty() {
        const el = document.getElementById('commentsEmpty');
        if (el && commentsItems.length === 0) el.textContent = commentsEmptyText();
        if (el && commentsItems.length > 0) el.textContent = '';
      }
      async function fetchCommentsPage(offset) {
        const res = await fetch('/api/competitions/' + competitionId + '/comments?limit=' + COMMENTS_PAGE + '&offset=' + offset);
        const data = await res.json();
        return data.success ? data.data : { items: [], total: 0 };
      }
      async function loadCommentsInitial() {
        const page = await fetchCommentsPage(0);
        commentsItems = page.items || [];
        commentsTotal = page.total || 0;
        const box = document.getElementById('chatMessages');
        if (box) box.innerHTML = renderCommentsTree(commentsItems) || '';
        paintCommentsEmpty();
        syncMoreBtn();
      }
      window.loadMoreComments = async function() {
        const page = await fetchCommentsPage(commentsItems.length);
        commentsItems = commentsItems.concat(page.items || []);
        commentsTotal = page.total || commentsTotal;
        const box = document.getElementById('chatMessages');
        if (box) box.innerHTML = renderCommentsTree(commentsItems) || '';
        paintCommentsEmpty();
        syncMoreBtn();
      };
      function syncMoreBtn() {
        const btn = document.getElementById('commentsMoreBtn');
        if (btn) btn.classList.toggle('hidden', !(commentsItems.length < commentsTotal));
      }
      function upsertLiveComment(cm) {
        // R2-L1: merge by id — the SSE echo of our own POST (or a reconnect
        // replay) must never render twice. Newest first at the top.
        if (!cm || cm.id === undefined || cm.id === null) return;
        const at = commentsItems.findIndex(function(c){ return c && c.id === cm.id; });
        if (at !== -1) {
          commentsItems[at] = cm;
        } else {
          commentsItems = [cm].concat(commentsItems);
          commentsTotal += 1;
        }
        const box = document.getElementById('chatMessages');
        if (box) box.innerHTML = renderCommentsTree(commentsItems) || '';
        paintCommentsEmpty();
        syncMoreBtn();
      }
      function removeLiveComment(commentId) {
        // R2-L1: deletion sync — converge without a refresh.
        const before = commentsItems.length;
        commentsItems = commentsItems.filter(function(c){ return !c || c.id !== commentId; });
        if (commentsItems.length !== before) {
          commentsTotal = Math.max(0, commentsTotal - (before - commentsItems.length));
          const box = document.getElementById('chatMessages');
          if (box) box.innerHTML = renderCommentsTree(commentsItems) || '';
          paintCommentsEmpty();
          syncMoreBtn();
        }
      }
      // R2-L1: exactly one live subscription per rendered competition —
      // re-renders (invite/request flows reload via loadCompetition) close
      // the previous stream instead of stacking EventSources.
      let commentsLiveES = null;
      function subscribeCommentsLive() {
        try {
          if (commentsLiveES) {
            try { commentsLiveES.close(); } catch (e) {}
            commentsLiveES = null;
          }
          const es = new EventSource('/api/sse?channel=' + encodeURIComponent('competition:' + competitionId));
          commentsLiveES = es;
          es.addEventListener('comment_new', function(ev) {
            try {
              const payload = JSON.parse(ev.data);
              if (payload && payload.comment) upsertLiveComment(payload.comment);
            } catch (e) {}
          });
          es.addEventListener('comment_deleted', function(ev) {
            try {
              const payload = JSON.parse(ev.data);
              if (payload && payload.comment_id !== undefined) removeLiveComment(payload.comment_id);
            } catch (e) {}
          });
        } catch (e) {}
      }

      // R2-L2: VOD timed comments — same comments/SSE system (no second
      // system). Post-live comments carry the current playback offset;
      // the final list is chronological by offset; playback highlights the
      // comment at the current position. Live comments omit the offset.
      function isVodMode() {
        return !!competitionData && competitionData.status === 'completed';
      }
      function formatClock(s) {
        s = Math.max(0, Math.floor(Number(s) || 0));
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return m + ':' + (sec < 10 ? '0' : '') + sec;
      }
      function currentVodTime() {
        if (!competitionData || competitionData.status !== 'completed') return null;
        const v = document.getElementById('embeddedVideoPlayer1');
        if (!v || typeof v.currentTime !== 'number' || !isFinite(v.currentTime)) return null;
        const ctrls = document.getElementById('embeddedVodControls');
        if (ctrls && ctrls.classList.contains('hidden')) return null;
        return Math.floor(v.currentTime);
      }
      window.seekToCommentOffset = function(sec) {
        const v = document.getElementById('embeddedVideoPlayer1');
        if (!v) return;
        const t = parseFloat(sec);
        if (isNaN(t) || t < 0) return;
        if (embeddedCurrentPlayer && embeddedCurrentPlayer.seekTo) embeddedCurrentPlayer.seekTo(t);
        else { try { v.currentTime = t; } catch (e) {} }
        try { v.play(); } catch (e) {}
      };
      function commentOffsetOf(cm) {
        return (cm && typeof cm.video_offset === 'number' && isFinite(cm.video_offset)) ? cm.video_offset : null;
      }
      function orderCommentsForDisplay(items) {
        if (!isVodMode()) return items;
        return items.slice().sort(function(a, b) {
          const ao = commentOffsetOf(a), bo = commentOffsetOf(b);
          if (ao !== null && bo !== null && ao !== bo) return ao - bo;
          if (ao !== null && bo === null) return -1;
          if (ao === null && bo !== null) return 1;
          const at = a && a.created_at ? String(a.created_at) : '';
          const bt = b && b.created_at ? String(b.created_at) : '';
          return at < bt ? -1 : (at > bt ? 1 : 0);
        });
      }
      function syncTimedComments(cur) {
        if (!isVodMode() || typeof cur !== 'number' || !isFinite(cur)) return;
        const box = document.getElementById('chatMessages');
        if (!box || typeof box.querySelectorAll !== 'function') return;
        let current = null;
        let currentOff = -1;
        const nodes = box.querySelectorAll('[data-comment-offset]');
        nodes.forEach(function(n) {
          const off = parseFloat(n.getAttribute('data-comment-offset'));
          n.classList.remove('bg-purple-50', 'dark:bg-purple-900/20', 'rounded-xl', 'px-1');
          if (!isNaN(off) && off <= cur && off >= currentOff) { current = n; currentOff = off; }
        });
        if (current) current.classList.add('bg-purple-50', 'dark:bg-purple-900/20', 'rounded-xl', 'px-1');
      }

      // T3.3: nested replies state
      let replyToComment = null;

      // T3.3: render comments as a tree — top-level posts with indented replies
      function commentHTML(cm) {
        const off = commentOffsetOf(cm);
        return \`
          <div class="flex gap-2 animate-fade-in"\${off !== null ? ' data-comment-offset="' + off + '"' : ''} data-comment-id="\${cm.id}">
            <img src="\${cm.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + cm.username}" class="w-8 h-8 rounded-full flex-shrink-0" alt="">
            <div class="min-w-0">
              <p class="text-sm"><span class="font-semibold text-purple-600">\${cm.display_name || cm.username || ''}</span>\${off !== null ? ' <button data-csp-on="click" data-csp-fn="seekToCommentOffset" data-csp-args="[' + off + ']" class="text-[11px] font-mono text-purple-500 hover:text-purple-700 hover:underline" title="' + (tr.vod_comment_at || 'Jump to moment') + '"><i class="fas fa-clock me-0.5"></i>' + formatClock(off) + '</button>' : ''}</p>
              <p class="text-sm text-gray-600 dark:text-gray-300 break-words">\${cm.content}</p>
              \${window.currentUser ? \`
                <span class="inline-flex items-center gap-3 mt-0.5">
                  <button data-csp-on="click" data-csp-fn="setReplyTo" data-csp-args='[\${cm.id},\${JSON.stringify((cm.display_name || "").replace(/['"]/g, ""))}]' class="text-xs text-gray-400 hover:text-purple-500 transition-colors">
                    <i class="fas fa-reply me-1"></i>\${tr.reply || 'Reply'}
                  </button>
                  <button data-csp-on="click" data-csp-fn="showReportModal" data-csp-args='["comment",\${cm.id}]' class="text-xs text-gray-400 hover:text-red-500 transition-colors" aria-label="\${(tr.report && tr.report.title) || 'Report'}">
                    <i class="fas fa-flag"></i>
                  </button>
                </span>
              \` : ''}
            </div>
          </div>
        \`;
      }

      function renderCommentsTree(comments) {
        const tops = orderCommentsForDisplay(comments.filter(function(c){ return !c.parent_id; }));
        const byParent = {};
        comments.forEach(function(c){
          if (c.parent_id) {
            if (!byParent[c.parent_id]) byParent[c.parent_id] = [];
            byParent[c.parent_id].push(c);
          }
        });
        return tops.map(function(cm){
          const replies = (byParent[cm.id] || []).map(function(r){
            return '<div class="ms-7 ps-2 border-s-2 border-purple-100 dark:border-purple-900">' + commentHTML(r) + '</div>';
          }).join('');
          return commentHTML(cm) + replies;
        }).join('');
      }

      window.setReplyTo = function(commentId, authorName) {
        replyToComment = commentId;
        const input = document.getElementById('commentInput');
        if (input) {
          input.placeholder = tr.replying_to ? (tr.replying_to + ' ' + authorName) : ('Reply to ' + authorName);
          input.focus();
        }
      };

      // R2-L1: shared headers — the session Bearer when present (the server
      // always binds identity to the session, never to body fields).
      function commentAuthHeaders(extra) {
        const h = extra || {};
        const sess = (window.sessionId || localStorage.getItem('sessionId'));
        if (sess) h['Authorization'] = 'Bearer ' + sess;
        const guest = localStorage.getItem('dueli_guest_token');
        if (guest) h['X-Guest-Token'] = guest;
        return h;
      }
      async function sendComment(e) {
        e.preventDefault();
        if (!window.currentUser) return;
        const input = document.getElementById('commentInput');
        const content = input.value.trim();
        if (!content) return;
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/comments', {
            method: 'POST',
            headers: commentAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
              content: content,
              is_live: competitionData?.status === 'live',
              parent_id: replyToComment || null,
              video_offset: currentVodTime()
            })
          });
          const data = await res.json().catch(function(){ return null; });
          if (!res.ok || !data || !data.success) {
            showToast((data && data.error) || tr.error_occurred || 'Error', 'error');
            return;
          }
          input.value = '';
          input.placeholder = tr.add_comment + '...';
          replyToComment = null;
          // Merge the author-joined POST response by id (the SSE echo of
          // this same row dedups instead of doubling).
          if (data.data && data.data.id !== undefined) {
            upsertLiveComment(data.data);
          } else {
            await loadCommentsInitial();
          }
        } catch (err) {
          console.error(err);
          showToast(tr.error_occurred || 'Error', 'error');
        }
      };

      // R2-L1: start (or restart, after a re-render) everything that needs
      // the rendered competition DOM. Parse-time starts raced the async
      // renderCompetition injection and silently painted nothing — init runs
      // here, once the box, stats and competitionData exist.
      // B2+B3: hydrate paged comments + live subscription after first render.
      let watchTimers = [];
      async function initCompetitionDynamics() {
        loadCommentsInitial();
        subscribeCommentsLive();
        loadRatingSummary();
        subscribeRatingsLive();
        loadReactionStatus();
        loadCompetitionAd();
        // Sequential: the heartbeat must see the guest token the intent may
        // have just issued — concurrent first-view calls issued two day-rows
        // for one anonymous viewer.
        await recordWatchIntent();
        sendWatchHeartbeat();
        refreshPresence();
        for (const t of watchTimers) {
          try { clearInterval(t); } catch (e) {}
        }
        watchTimers = [
          setInterval(sendWatchHeartbeat, 30000),
          setInterval(refreshPresence, 30000)
        ];
      }

      // R2-L1: one watch intent per page view (H2) + bounded live pulses
      // (H1) + presence display. GETs never count; only these explicit calls
      // insert day-rows. Failures are silent (counters are informational).
      function watchHeaders() {
        const h = commentAuthHeaders({ 'Content-Type': 'application/json' });
        return h;
      }
      function storeGuestToken(token) {
        try {
          if (token && !localStorage.getItem('dueli_guest_token')) {
            localStorage.setItem('dueli_guest_token', token);
          }
        } catch (e) {}
      }
      function paintViewsTotal(total) {
        // Plain String(): the server renders the same counter without a
        // locale, and a browser-locale toLocaleString would flip Western to
        // Eastern Arabic digits on ar pages (breaking digits-based checks).
        const el = document.getElementById('statViews');
        if (el && typeof total === 'number') el.textContent = String(total);
      }
      async function recordWatchIntent() {
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/watch', {
            method: 'POST',
            headers: watchHeaders()
          });
          const data = await res.json().catch(function(){ return null; });
          if (data && data.success && data.data) {
            storeGuestToken(data.data.guest_token);
            paintViewsTotal(data.data.total_views);
          }
        } catch (e) {}
      }
      async function sendWatchHeartbeat() {
        if (document.visibilityState !== 'visible') return;
        if (!competitionData || competitionData.status !== 'live') return;
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/watch-heartbeat', {
            method: 'POST',
            headers: watchHeaders()
          });
          const data = await res.json().catch(function(){ return null; });
          if (data && data.success && data.data) {
            storeGuestToken(data.data.guest_token);
            paintViewsTotal(data.data.total_views);
          }
        } catch (e) {}
      }
      async function refreshPresence() {
        const el = document.getElementById('presenceNow');
        if (!el) return;
        if (!competitionData || competitionData.status !== 'live' || !window.currentUser) {
          el.classList.add('hidden');
          return;
        }
        try {
          const sess = (window.sessionId || localStorage.getItem('sessionId'));
          if (!sess) { el.classList.add('hidden'); return; }
          const res = await fetch('/api/signaling/session?competition_id=' + competitionId, {
            headers: { 'Authorization': 'Bearer ' + sess }
          });
          const data = await res.json().catch(function(){ return null; });
          const count = data && data.success && data.data && data.data.presence
            ? data.data.presence.viewer_count : null;
          if (typeof count === 'number') {
            el.textContent = count + ' ' + (tr.viewers_now || 'watching now');
            el.classList.remove('hidden');
          } else {
            el.classList.add('hidden');
          }
        } catch (e) {}
      }
      // R2-L2: single-active reaction per identity (like/dislike/neutral).
      // One effective signal: POSTing a reaction atomically clears the
      // opposite server-side (LikeModel.setReaction, one batch); clicking
      // the active one DELETEs back to neutral. Counts are ALWAYS taken
      // from the server response — switching never double-counts.
      window.__reaction = { liked: false, disliked: false };
      function paintReaction() {
        const likeBtn = document.getElementById('likeBtn');
        const dislikeBtn = document.getElementById('dislikeBtn');
        const likeCount = document.getElementById('likeCount');
        const dislikeCount = document.getElementById('dislikeCount');
        const r = window.__reaction || { liked: false, disliked: false };
        if (likeBtn) {
          likeBtn.setAttribute('aria-pressed', r.liked ? 'true' : 'false');
          likeBtn.className = 'flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ' +
            (r.liked ? 'bg-green-100 dark:bg-green-900/30 text-green-600'
                     : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-green-50 hover:text-green-600');
        }
        if (dislikeBtn) {
          dislikeBtn.setAttribute('aria-pressed', r.disliked ? 'true' : 'false');
          dislikeBtn.className = 'flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ' +
            (r.disliked ? 'bg-red-100 dark:bg-red-900/30 text-red-600'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-red-50 hover:text-red-500');
        }
        if (likeCount && typeof r.likes_count === 'number') likeCount.textContent = String(r.likes_count);
        if (dislikeCount && typeof r.dislikes_count === 'number') dislikeCount.textContent = String(r.dislikes_count);
      }
      async function loadReactionStatus() {
        // Prefer the show() payload (no extra round-trip); fall back to GET.
        const pre = competitionData && competitionData.user_reaction;
        if (pre && typeof pre.liked === 'boolean') {
          window.__reaction = { liked: !!pre.liked, disliked: !!pre.disliked, likes_count: pre.likes_count, dislikes_count: pre.dislikes_count };
          paintReaction();
          return;
        }
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/like');
          const data = await res.json().catch(function(){ return null; });
          if (data && data.success && data.data) {
            window.__reaction = {
              liked: !!data.data.liked, disliked: !!data.data.disliked,
              likes_count: data.data.likes_count, dislikes_count: data.data.dislikes_count
            };
            const likeCount = document.getElementById('likeCount');
            const dislikeCount = document.getElementById('dislikeCount');
            if (likeCount && !window.currentUser) likeCount.textContent = String(data.data.likes_count || 0);
            if (dislikeCount && !window.currentUser) dislikeCount.textContent = String(data.data.dislikes_count || 0);
            paintReaction();
          }
        } catch (e) {}
      }
      window.setReaction = async function(type) {
        if (!window.currentUser) { showLoginModal(); return; }
        if (type !== 'like' && type !== 'dislike') return;
        const r = window.__reaction || { liked: false, disliked: false };
        const active = (type === 'like' && r.liked) || (type === 'dislike' && r.disliked);
        const method = active ? 'DELETE' : 'POST';
        const path = '/api/competitions/' + competitionId + '/' + type;
        try {
          const res = await fetch(path, {
            method: method,
            headers: {
              'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
              'Content-Type': 'application/json'
            }
          });
          const data = await res.json().catch(function(){ return null; });
          if (res.ok && data && data.success && data.data) {
            window.__reaction = {
              liked: !!data.data.liked, disliked: !!data.data.disliked,
              likes_count: data.data.likes_count, dislikes_count: data.data.dislikes_count
            };
            paintReaction();
          } else if (res.status === 404 && active) {
            // Already neutral server-side — converge locally.
            window.__reaction = { liked: false, disliked: false, likes_count: r.likes_count, dislikes_count: r.dislikes_count };
            paintReaction();
          } else {
            showToast((data && data.error) || tr.error_occurred || 'Error', 'error');
          }
        } catch (err) { console.error(err); }
      };
      // R2-L2: single competition ad slot. Serving reuses AdServingService
      // via GET /api/advertisements?competition_id=&context=competition&limit=1
      // (server-side targeting/cap/sensitive-context). The impression POSTs
      // ONCE on actual view (IntersectionObserver) with an idempotency key —
      // never on fetch. Budget/idempotency stay server-side. No click is
      // fired, no paid action, no test purchase.
      window.__compAdImpressed = false;
      async function loadCompetitionAd() {
        const slot = document.getElementById('competitionAdSlot');
        const body = document.getElementById('competitionAdBody');
        if (!slot || !body) return;
        let ad = null;
        try {
          const res = await fetch('/api/advertisements?competition_id=' + competitionId + '&context=competition&limit=1');
          const data = await res.json().catch(function(){ return null; });
          const items = data && data.success && Array.isArray(data.data) ? data.data : [];
          if (items.length === 0) return;
          ad = items[0];
        } catch (e) { return; }
        if (!ad || !ad.id) return;
        const title = ad.title || ad.name || '';
        const text = ad.description || ad.body || '';
        body.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'w-full text-center';
        const t = document.createElement('p');
        t.className = 'font-bold text-gray-800 dark:text-gray-100';
        t.textContent = title;
        wrap.appendChild(t);
        if (text) {
          const d = document.createElement('p');
          d.className = 'text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2';
          d.textContent = text;
          wrap.appendChild(d);
        }
        body.appendChild(wrap);
        slot.classList.remove('hidden');
        // Impression on ACTUAL view only — once per page view. The
        // idempotency key makes retries replay server-side without a
        // second charge; fetch alone never counts.
        const key = 'comp-' + competitionId + '-' + Date.now() + '-' + Math.floor(Math.random() * 1e6);
        const fire = async function() {
          if (window.__compAdImpressed) return;
          window.__compAdImpressed = true;
          try {
            await fetch('/api/advertisements/' + ad.id + '/impression', {
              method: 'POST',
              headers: commentAuthHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ competition_id: parseInt(competitionId, 10), idempotency_key: key })
            });
          } catch (e) {}
        };
        try {
          if ('IntersectionObserver' in window) {
            const obs = new IntersectionObserver(function(entries) {
              for (const en of entries) {
                if (en.isIntersecting) { fire(); try { obs.disconnect(); } catch (e) {} }
              }
            }, { threshold: 0.5 });
            obs.observe(slot);
          }
        } catch (e) {}
      }
      // Legacy alias (heart-era callers): like toggle only.
      async function toggleLike() {
        return window.setReaction('like');
      }
      
      async function toggleReminder() {
        if (!window.currentUser) { showLoginModal(); return; }
        const btn = document.getElementById('reminderBtn');
        const isReminded = btn.classList.contains('bg-amber-100');
        
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/remind', {
            method: isReminded ? 'DELETE' : 'POST',
            headers: {
              'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
              'Content-Type': 'application/json'
            }
          });
          
          if (res.ok) {
            if (isReminded) {
              btn.classList.remove('bg-amber-100', 'dark:bg-amber-900/30', 'text-amber-600');
              btn.classList.add('bg-gray-100', 'dark:bg-gray-800', 'text-gray-600');
              btn.innerHTML = '<i class="fas fa-bell"></i> ' + (tr.remind_me || 'Remind Me');
            } else {
              btn.classList.add('bg-amber-100', 'dark:bg-amber-900/30', 'text-amber-600');
              btn.classList.remove('bg-gray-100', 'dark:bg-gray-800', 'text-gray-600');
              btn.innerHTML = '<i class="fas fa-bell"></i> ' + (tr.reminder_set || 'Reminder On');
              showToast(tr.reminder_added || 'Reminder added!', 'success');
            }
          }
        } catch (err) { console.error(err); }
      }
      
      // B2+B3: report modal supports competition | comment | message | user
      const REPORT_REASONS = {
        competition: ['spam', 'misleading', 'inappropriate_content', 'copyright', 'other'],
        comment: ['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'other'],
        message: ['spam', 'harassment', 'hate_speech', 'inappropriate_content', 'other'],
        user: ['spam', 'harassment', 'fake_account', 'inappropriate_content', 'other']
      };
      const REPORT_REASON_LABELS = {
        spam: () => tr.report_spam || 'Spam',
        harassment: () => tr.report_harassment || 'Harassment or bullying',
        hate_speech: () => tr.report_hate || 'Hate speech',
        inappropriate_content: () => tr.report_inappropriate || 'Inappropriate content',
        copyright: () => tr.report_copyright || 'Copyright violation',
        misleading: () => tr.report_misleading || 'Misleading',
        fake_account: () => tr.report_fake || 'Fake account',
        other: () => tr.other || 'Other'
      };

      function showReportModal(targetType, targetId) {
        if (!window.currentUser) { showLoginModal(); return; }
        targetType = targetType || 'competition';
        targetId = targetId || competitionId;
        window._reportTarget = { type: targetType, id: targetId };
        const reasonOptions = (REPORT_REASONS[targetType] || REPORT_REASONS.competition)
          .map(r => \`
            <label class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
              <input type="radio" name="reason" value="\${r}" class="text-red-600">
              <span>\${(REPORT_REASON_LABELS[r] || (() => r))()}</span>
            </label>
          \`).join('');

        // Create report modal
        const modal = document.createElement('div');
        modal.id = 'reportModal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
        modal.innerHTML = \`
          <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 transform animate-scale-up">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
              <i class="fas fa-flag text-red-500 me-2"></i>
              \${(tr.report && tr.report.title) || 'Report'}
            </h3>
            <div class="space-y-3 mb-6">
              \${reasonOptions}
            </div>
            <div class="flex gap-3">
              <button data-csp-on="click" data-csp-fn="closeReportModal" data-csp-args='[]' class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl font-semibold hover:bg-gray-200 transition-colors">
                \${tr.cancel || 'Cancel'}
              </button>
              <button data-csp-on="click" data-csp-fn="submitReport" data-csp-args='[]' class="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors">
                \${tr.submit || 'Submit'}
              </button>
            </div>
          </div>
        \`;
        
        document.body.appendChild(modal);
        modal.onclick = (e) => { if (e.target === modal) closeReportModal(); };
      }
      
      function closeReportModal() {
        document.getElementById('reportModal')?.remove();
      }
      
      async function submitReport() {
        const reason = document.querySelector('input[name="reason"]:checked')?.value;
        if (!reason) {
          showToast(tr.select_reason || 'Please select a reason', 'error');
          return;
        }
        const target = window._reportTarget || { type: 'competition', id: competitionId };

        try {
          const res = await fetch('/api/reports', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              target_type: target.type,
              target_id: target.id,
              reason: reason
            })
          });
          
          if (res.ok) {
            showToast(tr.report_submitted || 'Report submitted. Thank you!', 'success');
            closeReportModal();
          }
        } catch (err) { console.error(err); }
      }
      
      // Request to join competition
      async function requestJoin() {
        if (!window.currentUser) { showLoginModal(); return; }
        
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/request', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
              'Content-Type': 'application/json'
            }
          });
          
          const data = await res.json();
          if (data.success) {
            alert(tr.request_sent || 'Join request sent successfully!');
            loadCompetition(); // Reload to show updated state
          } else {
            alert(data.error || tr.error_occurred || 'Failed to send request');
          }
        } catch (err) { 
          console.error(err); 
          alert(tr.error_occurred || 'An error occurred');
        }
      }
      
      // Cancel join request
      async function cancelRequest() {
        if (!window.currentUser) return;
        
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/request', {
            method: 'DELETE',
            headers: {
              'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
              'Content-Type': 'application/json'
            }
          });
          
          if (res.ok) {
            alert(tr.request_cancelled || 'Request cancelled');
            loadCompetition(); // Reload to show updated state
          }
        } catch (err) { console.error(err); }
      }

      // R2-J: Accept the current user's pending invitation (H3 accept path)
      async function acceptInvite() {
        if (!window.currentUser) { showLoginModal(); return; }

        try {
          const res = await fetch('/api/competitions/' + competitionId + '/accept-invite', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
              'Content-Type': 'application/json'
            }
          });

          const data = await res.json();
          if (data.success) {
            alert(tr.status_accepted || 'Accepted');
            loadCompetition(); // Reload to show updated state
          } else {
            alert(data.error || tr.error_occurred || 'Failed to accept invitation');
          }
        } catch (err) {
          console.error(err);
          alert(tr.error_occurred || 'An error occurred');
        }
      }

      // R2-J: Decline the current user's pending invitation (H3 decline path)
      async function declineInvite() {
        if (!window.currentUser) { showLoginModal(); return; }

        try {
          const res = await fetch('/api/competitions/' + competitionId + '/decline-invite', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
              'Content-Type': 'application/json'
            }
          });

          const data = await res.json();
          if (data.success) {
            alert(tr.status_declined || 'Declined');
            loadCompetition(); // Reload to show updated state
          } else {
            alert(data.error || tr.error_occurred || 'Failed to decline invitation');
          }
        } catch (err) {
          console.error(err);
          alert(tr.error_occurred || 'An error occurred');
        }
      }

      // CSP-delegated handlers must be reachable from window (same convention
      // as my-requests-page's window.setTab binding).
      window.acceptInvite = acceptInvite;
      window.declineInvite = declineInvite;
      
      // ============== EMBEDDED LIVE STREAMING ==============
      // These functions are only active when isLive && comp.live_url
      
      let p2p = null;
      let compositor = null;
      let userRole = null;
      let audioMuted = false;
      let videoMuted = false;
      let isFullscreen = false;
      let videosSwapped = false;
      let commentsVisible = true;
      let localVideoVisible = true;
      let isScreenSharing = false;
      let currentFacingMode = 'user';
      const streamServerUrl = 'https://maelshpro.com/ffmpeg';
      
      // ===== Embedded Viewer State =====
      let embeddedCurrentPlayer = null;
      let embeddedFullscreen = false;
      
      function log(msg, type = 'info') {
        console.log('[LiveStream]', type === 'error' ? '❌' : '📡', msg);
      }
      
      // ===== Embedded Viewer: Auto-Start =====
      
      async function initEmbeddedViewer() {
        const viewerSection = document.getElementById('embeddedViewerSection');
        if (!viewerSection) return; // not shown (competitor or no stream)
        
        const videoPlayers = [
          document.getElementById('embeddedVideoPlayer1'),
          document.getElementById('embeddedVideoPlayer2')
        ];
        
        // R2-L2: explicit media state machine. States: waiting (no stream
        // yet) / playing (live chunks or VOD flowing) / error (fatal playback
        // or fetch failure) / processing (completed, recording finalizing) /
        // ready (completed + playable recording, VOD playing) / unavailable
        // (completed with no recording, or live service missing). The state
        // is painted on #embeddedStateLabel and mirrored to
        // window.__mediaState for targeted UI tests. Error/unavailable offer
        // a manual retry — never an endless spinner.
        var MEDIA_STATES = ['waiting', 'playing', 'error', 'processing', 'ready', 'unavailable'];
        var MEDIA_ICONS = {
          waiting: 'fas fa-clock text-4xl mb-3',
          playing: 'fas fa-play-circle text-4xl mb-3',
          error: 'fas fa-exclamation-triangle text-4xl mb-3',
          processing: 'fas fa-cog fa-spin text-4xl mb-3',
          ready: 'fas fa-film text-4xl mb-3',
          unavailable: 'fas fa-video-slash text-4xl mb-3'
        };
        function setMediaState(state) {
          if (MEDIA_STATES.indexOf(state) === -1) state = 'waiting';
          window.__mediaState = state;
          const label = document.getElementById('embeddedStateLabel');
          if (label) {
            label.textContent = 'media:' + state;
            label.setAttribute('data-media-state', state);
            label.classList.remove('hidden');
          }
          const icon = document.getElementById('embeddedStatusIcon');
          if (icon) icon.className = MEDIA_ICONS[state];
          const retry = document.getElementById('embeddedRetryBtn');
          if (retry) retry.classList.toggle('hidden', !(state === 'error' || state === 'unavailable'));
        }
        // R2-L2: client mirror of the server playableRecording predicate
        // (vod_url OR youtube_video_url trimmed non-empty). This is the ONLY
        // readiness source — no HEAD request per discovery. completed without
        // a recording is NOT recorded (processing/unavailable, never VOD).
        function hasPlayableRecording(comp) {
          if (!comp) return false;
          const vod = (comp.vod_url || '').trim();
          const yt = (comp.youtube_video_url || '').trim();
          return vod !== '' || yt !== '';
        }
        // R2-L2: manual retry from error/unavailable states.
        window.embeddedRetryMedia = function() {
          window._vodRetryCount = 0;
          initEmbeddedViewer();
        };

        function setEmbeddedStatus(text) {
          const el = document.getElementById('embeddedStatusText');
          if (el) el.textContent = text;
        }

        function hideStatusOverlay() {
          const overlay = document.getElementById('embeddedStatusOverlay');
          if (overlay) overlay.classList.add('hidden');
        }

        function showStatusOverlay(text) {
          const overlay = document.getElementById('embeddedStatusOverlay');
          const el = document.getElementById('embeddedStatusText');
          if (el) el.textContent = text;
          if (overlay) overlay.classList.remove('hidden');
        }
        
        function updateEmbeddedMode(mode) {
          const badge = document.getElementById('embeddedModeBadge');
          if (!badge) return;
          badge.classList.remove('hidden', 'bg-red-600', 'bg-amber-500');
          if (mode === 'live') {
            badge.classList.add('bg-red-600');
            badge.innerHTML = '<i class="fas fa-circle animate-pulse mr-1"></i>LIVE';
          } else if (mode === 'vod') {
            badge.classList.add('bg-amber-500');
            badge.innerHTML = '<i class="fas fa-film mr-1"></i>VOD';
          } else {
            badge.classList.add('hidden');
          }
        }
        
        // R2-L2: VOD not ready → bounded auto-poll (8 × 15s) while the
        // ffmpeg server finalizes the merged recording, then the
        // unavailable state with a MANUAL retry (no endless spinner).
        var VOD_MAX_RETRIES = 8;
        function handleVodNotReady() {
          if (!window._vodRetryCount) window._vodRetryCount = 0;
          if (window._vodRetryCount < VOD_MAX_RETRIES) {
            window._vodRetryCount++;
            setMediaState('processing');
            showStatusOverlay(tr.recording_processing || 'جاري تجهيز التسجيل...');
            setTimeout(function() { initEmbeddedViewer(); }, 15000);
          } else {
            setMediaState('unavailable');
            showStatusOverlay(tr.recording_not_ready || 'Recording not available');
          }
        }
        
        try {
          // إلغاء أي استطلاع قديم عند إعادة التشغيل
          if (window._statusPollInterval) { clearInterval(window._statusPollInterval); window._statusPollInterval = null; }
          
          // Re-fetch fresh competition data from API to get latest status
          setEmbeddedStatus(tr.loading || 'Loading...');
          const freshRes = await fetch('/api/competitions/' + competitionId);
          if (!freshRes.ok) { setMediaState('error'); showStatusOverlay(tr.stream_not_available || 'Stream not available'); return; }
          const freshData = await freshRes.json();
          const comp = freshData.data || freshData;
          
          // Determine mode from both status and stream_status fields
          const dbStatus = comp.status;            // 'live' | 'completed' | 'pending' | 'accepted'
          const streamSt = comp.stream_status;    // 'live' | 'ready' | 'idle' | undefined
          
          const isLiveComp = (dbStatus === 'live') || (streamSt === 'live');
          const isCompletedComp = (dbStatus === 'completed') || (streamSt === 'ready');
          
          if (isLiveComp) {
            // === LIVE: Use ChunkManager + LiveSequentialPlayer ===
            setEmbeddedStatus(tr.connecting_to_stream || 'Connecting to stream...');
            setMediaState('waiting');
            updateEmbeddedMode('live');

            if (!window.ChunkManager || !window.LiveSequentialPlayer) {
              setMediaState('error');
              showStatusOverlay(tr.streaming_unavailable || 'Streaming service unavailable');
              return;
            }

            const chunkManager = new window.ChunkManager(competitionId, 'mp4');
            embeddedCurrentPlayer = new window.LiveSequentialPlayer({
              videoPlayers: videoPlayers,
              chunkManager: chunkManager,
              onChunkChange: function(index) {
                const info = document.getElementById('embeddedChunkInfo');
                if (info) { info.textContent = (tr.chunk || 'Chunk') + ' ' + (index + 1); info.classList.remove('hidden'); }
                setMediaState('playing');
                hideStatusOverlay();
              },
              onStatus: function(status) { log(status); },
              onError: function(err) {
                log('Viewer error: ' + err.message, 'error');
                setMediaState('error');
                showStatusOverlay(tr.stream_not_available || 'Stream not available');
              },
              // عند انتهاء البث: تحقق من الحالة وانتقل لـ VOD إن كانت مكتملة
              onStreamEnd: async function() {
                log('Stream ended - checking competition status...', 'info');
                setMediaState('waiting');
                showStatusOverlay(tr.stream_ended || 'انتهى البث، جاري التحقق...');
                // انتظر قليلاً ثم تحقق من قاعدة البيانات
                await new Promise(function(r) { setTimeout(r, 3000); });
                try {
                  const statusRes = await fetch('/api/competitions/' + competitionId);
                  const statusData = await statusRes.json();
                  const latestComp = statusData.data || statusData;
                  if (latestComp.status === 'completed') {
                    // المنافسة انتهت - أعد تشغيل العارض كـ VOD
                    log('Competition completed - switching to VOD', 'success');
                    await initEmbeddedViewer();
                  } else {
                    showStatusOverlay(tr.stream_not_available || 'Stream ended');
                  }
                } catch(e) {
                  showStatusOverlay(tr.stream_not_available || 'Stream ended');
                }
              }
            });
            // يبدأ من آخر قطعة متاحة حالياً لعدم التأخر عن البث
            await embeddedCurrentPlayer.start({ startFromLatest: true });
            
            // استطلاع حالة المنافسة كل 30 ثانية لاكتشاف نهاية البث فوراً
            window._statusPollInterval = setInterval(async function() {
              try {
                const pollRes = await fetch('/api/competitions/' + competitionId);
                const pollData = await pollRes.json();
                const pollComp = pollData.data || pollData;
                if (pollComp.status === 'completed') {
                  clearInterval(window._statusPollInterval);
                  if (embeddedCurrentPlayer && embeddedCurrentPlayer.stop) embeddedCurrentPlayer.stop();
                  log('🏁 Competition completed - switching to VOD', 'success');
                  // تحديث شارة الحالة في واجهة المنافسة
                  const liveSpan = document.querySelector('.bg-red-600.text-white.text-xs');
                  if (liveSpan) liveSpan.remove();
                  await initEmbeddedViewer();
                }
              } catch(e) { /* تجاهل أخطاء الاستطلاع */ }
            }, 30000);
            
          } else if (isCompletedComp) {
            // === VOD: Use SmartVodPlayer ===
            // R2-L2: completed WITHOUT a recording is NOT recorded — route
            // to processing/unavailable (bounded poll + manual retry), never
            // the VOD badge/controls.
            if (!hasPlayableRecording(comp)) {
              handleVodNotReady();
              return;
            }
            setEmbeddedStatus(tr.loading_video || 'Loading video...');
            setMediaState('waiting');
            updateEmbeddedMode('vod');

            if (!window.SmartVodPlayer) {
              setMediaState('error');
              showStatusOverlay(tr.streaming_unavailable || 'Video service unavailable');
              return;
            }
            
            // Fetch playlist via our server-side proxy (T1.3: remote playlist.php
            // sends no CORS headers — direct browser calls were blocked)
            const playlistRes = await fetch('/api/chunks/playlist/' + competitionId);
            
            // T1.3 FIX: playlist may not be ready right after the stream ends
            // (ffmpeg merge takes time) — poll instead of dead-ending.
            if (!playlistRes.ok) {
                handleVodNotReady();
                return;
            }
            const playlistData = await playlistRes.json();
            
            if (!playlistData.chunks || playlistData.chunks.length === 0) {
                handleVodNotReady();
                return;
            }
            
            embeddedCurrentPlayer = new window.SmartVodPlayer({
              videoElement: videoPlayers[0],
              competitionId: competitionId,
              playlistData: playlistData,
              onProgress: function(current, total) {
                const info = document.getElementById('embeddedChunkInfo');
                if (info) { info.textContent = current + '/' + total; info.classList.remove('hidden'); }
              },
              onChunkLoaded: function(index, loaded) {},
              onReady: function(info) {
                setMediaState('ready');
                hideStatusOverlay();
                window._vodRetryCount = 0; // reset poll counter on success
                const vodControls = document.getElementById('embeddedVodControls');
                if (vodControls) vodControls.classList.remove('hidden');
                embeddedSetupVodControls(videoPlayers[0], info.totalDuration);
                // إظهار زر التحميل بعد أن يكون المشغل جاهزاً
                const dlBtn = document.getElementById('embeddedDownloadBtn');
                if (dlBtn) dlBtn.classList.remove('hidden');
              },
              onError: function(err) {
                log('VOD error: ' + err.message, 'error');
                setMediaState('error');
                showStatusOverlay(tr.recording_not_ready || 'Recording not available');
              }
            });
            await embeddedCurrentPlayer.start();
          } else {
            // Status is not live or completed
            setMediaState('waiting');
            showStatusOverlay(tr.stream_not_available || 'Stream not available yet');
          }

        } catch (err) {
          log('Embedded viewer error: ' + err.message, 'error');
          setMediaState('error');
          showStatusOverlay(tr.error_occurred || 'An error occurred');
        }
      }
      
      // ===== VOD Seekbar Controls =====
      function embeddedSetupVodControls(videoEl, totalDuration) {
        const seekbar = document.getElementById('embeddedSeekbar');
        const timeDisplay = document.getElementById('embeddedTimeDisplay');
        
        function formatTime(s) {
          s = Math.floor(s);
          const m = Math.floor(s / 60);
          const sec = s % 60;
          return m + ':' + (sec < 10 ? '0' : '') + sec;
        }
        
        if (videoEl) {
          videoEl.addEventListener('timeupdate', function() {
            const cur = videoEl.currentTime;
            const total = videoEl.duration || totalDuration || 0;
            if (seekbar) seekbar.value = total > 0 ? (cur / total * 100) : 0;
            if (timeDisplay) timeDisplay.textContent = formatTime(cur) + ' / ' + formatTime(total);
            // R2-L2: VOD is flowing → playing; timed comments sync off this.
            if (!videoEl.paused) setMediaState('playing');
            if (typeof syncTimedComments === 'function') syncTimedComments(cur);
            // Update play/pause icon
            const icon = document.getElementById('embeddedPlayPauseIcon');
            if (icon) icon.className = videoEl.paused ? 'fas fa-play text-sm' : 'fas fa-pause text-sm';
          });
          videoEl.addEventListener('play', function() {
            const icon = document.getElementById('embeddedPlayPauseIcon');
            if (icon) icon.className = 'fas fa-pause text-sm';
          });
          videoEl.addEventListener('pause', function() {
            const icon = document.getElementById('embeddedPlayPauseIcon');
            if (icon) icon.className = 'fas fa-play text-sm';
          });
        }
        
        if (seekbar) {
          seekbar.addEventListener('input', function() {
            if (!embeddedCurrentPlayer || !videoEl) return;
            const percent = parseFloat(seekbar.value);
            const dur = videoEl.duration || totalDuration || 0;
            const targetTime = (percent / 100) * dur;
            if (embeddedCurrentPlayer.seekTo) {
              embeddedCurrentPlayer.seekTo(targetTime);
            } else {
              videoEl.currentTime = targetTime;
            }
          });
        }
      }
      
      // ===== Embedded Viewer Controls =====
      window.embeddedTogglePlayPause = function() {
        const v = document.getElementById('embeddedVideoPlayer1');
        if (!v) return;
        v.paused ? v.play() : v.pause();
      };
      
      window.embeddedToggleFullscreen = function() {
        const container = document.getElementById('embeddedVideoContainer');
        if (!container) return;
        if (!document.fullscreenElement) {
          container.requestFullscreen && container.requestFullscreen();
          container.webkitRequestFullscreen && container.webkitRequestFullscreen();
          embeddedFullscreen = true;
        } else {
          document.exitFullscreen && document.exitFullscreen();
          document.webkitExitFullscreen && document.webkitExitFullscreen();
          embeddedFullscreen = false;
        }
        const icon = document.getElementById('embeddedFsIcon');
        if (icon) icon.className = embeddedFullscreen ? 'fas fa-compress text-sm' : 'fas fa-expand text-sm';
      };
      
      document.addEventListener('fullscreenchange', function() {
        const icon = document.getElementById('embeddedFsIcon');
        if (icon) icon.className = document.fullscreenElement ? 'fas fa-compress text-sm' : 'fas fa-expand text-sm';
      });
      
      // Download VOD recording (merge all chunks in browser memory)
      window.embeddedDownload = async function() {
        if (!embeddedCurrentPlayer || !embeddedCurrentPlayer.downloadVideo) return;
        const btn = document.getElementById('embeddedDownloadBtn');
        const originalHtml = btn ? btn.innerHTML : '';
        try {
          if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin text-sm"></i>'; }
          await embeddedCurrentPlayer.downloadVideo('competition_' + competitionId);
        } catch (e) {
          log('Download failed: ' + e.message, 'error');
        } finally {
          if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
        }
      };
      
      // Control Functions
      window.toggleFullscreen = function() {
        const container = document.querySelector('.aspect-video');
        if (!isFullscreen) {
          if (container.requestFullscreen) container.requestFullscreen();
          else if (container.webkitRequestFullscreen) container.webkitRequestFullscreen();
          isFullscreen = true;
        } else {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          isFullscreen = false;
        }
        const btn = document.getElementById('fullscreenBtn');
        if (btn) btn.innerHTML = isFullscreen ? '<i class="fas fa-compress"></i>' : '<i class="fas fa-expand"></i>';
      };
      
      window.swapVideos = function() {
        const localWrapper = document.getElementById('localVideoWrapper');
        const remoteVideo = document.getElementById('remoteVideo');
        const localVideo = document.getElementById('localVideo');
        if (!localWrapper) return;
        
        videosSwapped = !videosSwapped;
        
        if (videosSwapped) {
          localWrapper.style.cssText = 'position:absolute;inset:0;z-index:10;';
          localVideo.classList.add('w-full', 'h-full');
          remoteVideo.style.cssText = 'position:absolute;top:1rem;' + (isRTL ? 'left' : 'right') + ':1rem;z-index:20;width:8rem;height:6rem;border-radius:0.75rem;';
        } else {
          localWrapper.style.cssText = 'position:absolute;top:1rem;' + (isRTL ? 'left' : 'right') + ':1rem;z-index:20;';
          localVideo.classList.remove('w-full', 'h-full');
          remoteVideo.style.cssText = '';
        }
        
        const btn = document.getElementById('swapBtn');
        if (btn) btn.classList.toggle('bg-purple-500', videosSwapped);
      };
      
      window.toggleComments = function() {
        commentsVisible = !commentsVisible;
        const overlay = document.getElementById('commentsOverlay');
        if (overlay) overlay.style.opacity = commentsVisible ? '1' : '0';
        const btn = document.getElementById('commentsBtn');
        if (btn) btn.innerHTML = commentsVisible ? '<i class="fas fa-comment"></i>' : '<i class="fas fa-comment-slash"></i>';
      };
      
      window.toggleLocalVideo = function() {
        if (userRole === 'viewer') return;
        localVideoVisible = !localVideoVisible;
        const wrapper = document.getElementById('localVideoWrapper');
        if (wrapper) wrapper.style.display = localVideoVisible ? 'block' : 'none';
        const btn = document.getElementById('localVideoBtn');
        if (btn) btn.innerHTML = localVideoVisible ? '<i class="fas fa-user-circle"></i>' : '<i class="fas fa-user-slash"></i>';
      };
      
      window.switchCamera = async function() {
        if (userRole === 'viewer' || !p2p) return;
        try {
          currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: currentFacingMode },
            audio: true
          });
          const videoTrack = newStream.getVideoTracks()[0];
          const sender = p2p.pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            await sender.replaceTrack(videoTrack);
            document.getElementById('localVideo').srcObject = newStream;
          }
        } catch (err) {
          log('Camera switch failed: ' + err.message, 'error');
        }
      };
      
      window.shareScreen = async function() {
        if (!p2p) return;
        try {
          const screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: { cursor: 'always' },
            audio: true
          });
          const videoTrack = screenStream.getVideoTracks()[0];
          const sender = p2p.pc.getSenders().find(s => s.track && s.track.kind === 'video');
          if (sender) {
            await sender.replaceTrack(videoTrack);
            document.getElementById('localVideo').srcObject = screenStream;
            isScreenSharing = true;
            document.getElementById('screenBtn').classList.add('bg-green-600');
            
            videoTrack.onended = () => {
              isScreenSharing = false;
              document.getElementById('screenBtn').classList.remove('bg-green-600');
            };
          }
        } catch (err) {
          log('Screen share failed: ' + err.message, 'error');
        }
      };
      
      window.toggleAudio = function() {
        if (!p2p) return;
        const stream = p2p.getLocalStream();
        if (!stream) return;
        const track = stream.getAudioTracks()[0];
        if (track) {
          audioMuted = !audioMuted;
          track.enabled = !audioMuted;
          const btn = document.getElementById('audioBtn');
          if (btn) {
            btn.classList.toggle('bg-red-600', audioMuted);
            btn.innerHTML = audioMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
          }
        }
      };
      
      window.toggleVideo = function() {
        if (!p2p) return;
        const stream = p2p.getLocalStream();
        if (!stream) return;
        const track = stream.getVideoTracks()[0];
        if (track) {
          videoMuted = !videoMuted;
          track.enabled = !videoMuted;
          const btn = document.getElementById('videoBtn');
          if (btn) {
            btn.classList.toggle('bg-red-600', videoMuted);
            btn.innerHTML = videoMuted ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
          }
        }
      };
      
      window.endStream = async function() {
        if (!confirm(tr.end_stream_confirm || 'End the stream?')) return;
        
        log('Ending stream...');
        
        try {
          // Stop compositor
          if (compositor) {
            compositor.destroy();
            compositor = null;
          }
          
          // Disconnect P2P
          if (p2p) {
            p2p.disconnect();
            p2p = null;
          }
          
          // End competition via the correct API endpoint
          const endRes = await fetch('/api/competitions/' + competitionId + '/end', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'same-origin'
          });
          const endData = await endRes.json();
          if (!endData.success) {
            log('Warning: ' + (endData.error || 'Could not update status'), 'warn');
          }
          
          // Also notify the ffmpeg server to finalize
          await fetch(streamServerUrl + '/finalize.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              competition_id: competitionId,
              user_id: window.currentUser ? window.currentUser.id : null
            })
          }).catch(function() {}); // not critical
          
          alert(tr.stream_ended || 'Stream ended successfully');
          location.reload();
        } catch (err) {
          log('End stream error: ' + err.message, 'error');
        }
      };
      
      // Check if competition needs embedded viewer and start it
      function checkAndInitStream() {
        if (!competitionData) return;
        const status = competitionData.status;
        const streamStatus = competitionData.stream_status;
        const isUserCreator = window.currentUser && window.currentUser.id === competitionData.creator_id;
        const isUserOpponent = window.currentUser && window.currentUser.id === competitionData.opponent_id;
        
        // Competitors go to dedicated pages. Viewers (anyone else) use embedded player.
        if (isUserCreator || isUserOpponent) return;
        
        // Show embedded viewer for live or completed competitions
        if (status === 'live' || status === 'completed' || streamStatus === 'live' || streamStatus === 'ready') {
          initEmbeddedViewer();
        }
      }
      
      // Hook into renderCompetition
      const originalRenderCompetition = renderCompetition;
      renderCompetition = function(comp) {
        originalRenderCompetition(comp);
        setTimeout(checkAndInitStream, 300);
      };
    </script>
  `;

  return c.html(generateHTML(content, lang, tr.competitors, (c.get('cspNonce') as string) ?? ''));
}
