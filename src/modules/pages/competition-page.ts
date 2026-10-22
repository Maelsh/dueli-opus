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
      // A28-SURFACE: which completed surface has actually been PAINTED. State
      // may be "completed" while a cleanup/render failure left the live DOM
      // in place; this key is only set after a successful render, so the next
      // completed event (duplicate SSE / GET resync) retries the surface
      // instead of doing nothing forever.
      let completedSurfaceKey = null;
      
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
        await loadCompetition();
        // The download path is independent of the VOD player: an authenticated
        // user may download as soon as the page (and its button) exists, even
        // if playback never becomes ready or the whole recording never loads.
        refreshEmbeddedDownloadButton();
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
                  <span id="competitionStatusBadge" class="\${
                    isLive ? 'badge-live' :
                    isPending ? 'badge-pending' :
                    isAccepted ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400 px-3 py-1 rounded-full text-xs font-bold' :
                    'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold'
                  } flex items-center gap-1">
                    <span id="competitionStatusDot" class="\${isLive ? 'w-1.5 h-1.5 rounded-full bg-red-500 live-pulse' : 'hidden'}"></span>
                    <span id="competitionStatusText">\${isLive ? tr.status_live : isPending ? tr.status_pending : isAccepted ? (tr.status_accepted || 'Ready') : tr.status_completed}</span>
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
                  
                  <!-- ===== R4-COMP-UNIFIED-1: in-page competitor live (unified) ===== -->
                  \${(window.resolveVideoSurface ? window.resolveVideoSurface(comp, window.currentUser && window.currentUser.id) : 'embedded') === 'competitor' ? \`
                    <div id="competitorView" class="live-stage relative bg-black aspect-video overflow-hidden" aria-label="\${tr.live_tools}">
                      <div id="remoteVideoWrapper" class="live-stage-main">
                        <video id="remoteVideo" class="w-full h-full object-cover" autoplay playsinline></video>
                      </div>
                      <div id="waitingOverlay" class="absolute inset-0 flex items-center justify-center bg-gray-900/80 z-10">
                        <div class="text-center text-white px-4">
                          <i class="fas fa-spinner fa-spin text-4xl mb-4"></i>
                          <p class="text-lg">\${tr.waiting_opponent}</p>
                          <p class="text-xs mt-2 opacity-80">\${tr.waiting_peer_media}</p>
                        </div>
                      </div>
                      <div id="localVideoWrapper" class="live-stage-pip" aria-label="\${tr.toggle_my_video}">
                        <div class="relative w-full h-full rounded-xl overflow-hidden shadow-2xl border-2 border-purple-500">
                          <video id="localVideo" class="w-full h-full object-cover" autoplay muted playsinline></video>
                          <div class="absolute bottom-1 ${rtl ? 'right-1' : 'left-1'} bg-black/60 px-2 py-0.5 rounded text-white text-xs">
                            \${tr.you}
                          </div>
                        </div>
                      </div>
                      <div id="opponentLabel" class="absolute top-4 ${rtl ? 'right-4' : 'left-4'} bg-black/50 px-3 py-1 rounded-full text-white text-sm z-20">
                        <i class="fas fa-user me-1"></i> \${tr.opponent}
                      </div>
                      <div id="connectionStatus" class="absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-sm hidden z-30">
                        <i class="fas fa-wifi me-2"></i><span>...</span>
                      </div>
                      <canvas id="compositeCanvas" class="hidden" width="1280" height="720"></canvas>
                    </div>
                    <!-- R4-LIVE-ENTRY-RECOVERY-REM1: icon-only tools, same
                         sizes/colors as the mandatory host/guest reference.
                         Publish is an explicit consent action; LIVE alone never
                         publishes, and every source change is visible here. -->
                    <div id="competitorControls" class="flex flex-wrap items-center justify-center gap-2 py-3 px-1" role="toolbar" aria-label="\${tr.live_tools}">
                      <button data-csp-on="click" data-csp-fn="startCompetition" data-csp-args='[]' id="startBtn" class="live-tool bg-green-600 hover:bg-green-700 text-white hidden" aria-label="\${tr.start_competition}" title="\${tr.start_competition}">
                        <i class="fas fa-play" aria-hidden="true"></i>
                      </button>
                      <button data-csp-on="click" data-csp-fn="publishMedia" data-csp-args='[]' id="publishBtn" class="live-tool bg-green-600 hover:bg-green-700 text-white hidden" aria-label="\${tr.prep_publish_host}" title="\${tr.prep_publish_host}">
                        <i class="fas fa-broadcast-tower" aria-hidden="true"></i>
                      </button>
                      <button data-csp-on="click" data-csp-fn="shareScreen" data-csp-args='[]' id="screenBtn" class="live-tool bg-blue-600 hover:bg-blue-700 text-white" aria-label="\${tr.share_screen}" title="\${tr.share_screen}">
                        <i class="fas fa-desktop" aria-hidden="true"></i>
                      </button>
                      <button data-csp-on="click" data-csp-fn="toggleVideo" data-csp-args='[]' id="videoBtn" class="live-tool bg-purple-600 hover:bg-purple-700 text-white" aria-label="\${tr.toggle_camera}" title="\${tr.toggle_camera}">
                        <i class="fas fa-video" aria-hidden="true"></i>
                      </button>
                      <button data-csp-on="click" data-csp-fn="switchCamera" data-csp-args='[]' id="switchCamBtn" class="live-tool bg-indigo-600 hover:bg-indigo-700 text-white" aria-label="\${tr.switch_camera}" title="\${tr.switch_camera}">
                        <i class="fas fa-sync-alt" aria-hidden="true"></i>
                      </button>
                      <button data-csp-on="click" data-csp-fn="toggleAudio" data-csp-args='[]' id="audioBtn" class="live-tool bg-green-600 hover:bg-green-700 text-white" aria-label="\${tr.toggle_mic}" title="\${tr.toggle_mic}">
                        <i class="fas fa-microphone" aria-hidden="true"></i>
                      </button>
                      <button data-csp-on="click" data-csp-fn="toggleSpeaker" data-csp-args='[]' id="speakerBtn" class="live-tool bg-teal-600 hover:bg-teal-700 text-white" aria-label="\${tr.toggle_speaker}" title="\${tr.toggle_speaker}">
                        <i class="fas fa-volume-up" aria-hidden="true"></i>
                      </button>
                      <button data-csp-on="click" data-csp-fn="toggleLocalVideo" data-csp-args='[]' id="localVideoBtn" class="live-tool bg-gray-600 hover:bg-gray-700 text-white" aria-label="\${tr.toggle_my_video}" title="\${tr.toggle_my_video}">
                        <i class="fas fa-eye" aria-hidden="true"></i>
                      </button>
                      <button data-csp-on="click" data-csp-fn="swapVideos" data-csp-args='[]' id="swapBtn" class="live-tool bg-indigo-600 hover:bg-indigo-700 text-white" aria-label="\${tr.swap_videos}" title="\${tr.swap_videos}">
                        <i class="fas fa-exchange-alt" aria-hidden="true"></i>
                      </button>
                      <button data-csp-on="click" data-csp-fn="toggleExpandStage" data-csp-args='[]' id="expandBtn" class="live-tool bg-indigo-600 hover:bg-indigo-700 text-white" aria-label="\${tr.expand_stage}" title="\${tr.expand_stage}">
                        <i class="fas fa-up-right-and-down-left-from-center" aria-hidden="true"></i>
                      </button>
                      <button data-csp-on="click" data-csp-fn="toggleFullscreen" data-csp-args='[]' id="fullscreenBtn" class="live-tool bg-gray-600 hover:bg-gray-700 text-white" aria-label="\${tr.fullscreen}" title="\${tr.fullscreen}">
                        <i class="fas fa-expand" aria-hidden="true"></i>
                      </button>
                      <button data-csp-on="click" data-csp-fn="endStream" data-csp-args='[]' id="endBtn" class="live-tool bg-red-600 hover:bg-red-700 text-white hidden" aria-label="\${tr.end_competition}" title="\${tr.end_competition}">
                        <i class="fas fa-stop-circle" aria-hidden="true"></i>
                      </button>
                    </div>
                    <p id="publishState" class="text-center text-xs text-gray-500 dark:text-gray-400 pb-2 px-4" aria-live="polite">\${tr.prep_privacy_hint}</p>
                    
                  \` : (isCreator || isOpponent) && comp.opponent_id && isPending ? \`
                    <!-- Ready to Go Live (legacy pending-with-opponent edge;
                         accepted parties render the prep surface above) -->
                    <div class="bg-gradient-to-br \${bgColor} aspect-video flex items-center justify-center">
                      <div class="text-center text-white">
                        <i class="fas fa-video text-6xl opacity-80 mb-4"></i>
                        <p>\${tr.competitors} \${tr.status_accepted}</p>
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
                        <!-- R4-CHUNK-DOWNLOAD-1: a download affordance that is
                             independent of VOD readiness / player-loaded chunks.
                             Hidden for guests and while live. -->
                        <button id="embeddedDownloadBtn" data-csp-on="click" data-csp-fn="embeddedDownload" data-csp-args='[]'
                                class="hidden absolute top-3 left-3 z-30 w-10 h-10 flex items-center justify-center bg-green-600 text-white rounded-full shadow-lg hover:bg-green-700 transition"
                                aria-label="${tr.download_ui.title}"
                                title="${tr.download_ui.title}">
                          <i class="fas fa-download text-sm" aria-hidden="true"></i>
                        </button>
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
                            <p class="text-xs mt-1 opacity-70 hidden" id="embeddedStateLabel" data-media-state="waiting" role="status" aria-live="polite"></p>
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
                          \${isLive ? '<span id="embeddedLiveChip" class="flex items-center gap-1 bg-red-600 text-white text-xs px-2 py-1 rounded-full"><span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>' + (tr.status_live || 'مباشر') + '</span>' : ''}
                          <!-- R4-CHUNK-PLAYER-UX-1: rewind-one-chunk + return-to-live
                               (live only; shown/hidden by playback position, RTL-safe flex). -->
                          \${isLive ? '<button id="embeddedRewindBtn" data-csp-on="click" data-csp-fn="embeddedRewindLive" data-csp-args="[]" class="hidden items-center gap-1 bg-black/50 text-white text-xs px-2 py-1 rounded-full hover:bg-black/70 backdrop-blur" title="' + (tr.live_rewind || 'Rewind') + '" aria-label="' + (tr.live_rewind || 'Rewind') + '"><i class="fas fa-backward text-[10px]"></i></button>' : ''}
                          \${isLive ? '<button id="embeddedLiveBtn" data-csp-on="click" data-csp-fn="embeddedReturnToLive" data-csp-args="[]" class="hidden items-center gap-1 bg-white/90 text-red-700 text-xs px-2 py-1 rounded-full font-bold hover:bg-white" title="' + (tr.return_to_live || 'Back to live') + '"><span class="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>' + (tr.return_to_live || 'Back to live') + '</button>' : ''}
                        </div>
                      </div>

                      <!-- R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1): LIVE timeline.
                           Range is the WHOLE available recording (index total),
                           never the current chunk duration. Hidden for VOD. -->
                      \${isLive ? '<div id="embeddedLiveControls" class="hidden bg-gray-900 p-3">' +
                        '<div class="flex items-center gap-3">' +
                          '<span id="embeddedLiveTimeDisplay" class="text-xs font-mono text-gray-300 w-20 flex-shrink-0">0:00 / 0:00</span>' +
                          '<input type="range" id="embeddedLiveSeekbar" min="0" max="100" value="100" class="flex-1 h-1.5 bg-gray-600 rounded-full appearance-none cursor-pointer accent-red-500" aria-label="' + (tr.live_timeline || 'Live timeline') + '" />' +
                        '</div>' +
                      '</div>' : ''}
                      
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
      
      // R4-LIVE-ENTRY-RECOVERY-REM1: start the competition IN PLACE. The old
      // flow redirected to /live/:id, which tore down the preview/PC and made
      // the audience surface the source of truth. /competition/:id now stays
      // mounted; status chrome, recording eligibility and both parties update
      // from the same call + SSE, never from a navigation.
      async function startCompetition() {
        if (!window.currentUser) { showLoginModal(); return; }
        if (!competitionData || competitionData.status !== 'accepted') return;
        if (startInFlight) return;
        startInFlight = true;
        const btn = document.getElementById('startBtn');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin" aria-hidden="true"></i>'; }
        const liveUrl = streamServerUrl + '/storage/live/match_' + competitionId + '/playlist.m3u8';
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/start', {
            method: 'POST',
            headers: competitorAuthHeaders(),
            body: JSON.stringify({ live_url: liveUrl })
          });
          const data = await res.json().catch(function() { return null; });
          if (res.ok && data && data.success) {
            competitionData.status = 'live';
            paintCompetitionChrome();
            paintCompetitorControls();
            maybeStartRecording();
            scheduleStatusResync(0);
            showToast(tr.status_live || 'LIVE', 'success');
          } else {
            showToast((data && data.error) || tr.start_competition_failed, 'error');
          }
        } catch (err) {
          console.error(err);
          showToast(tr.start_competition_failed, 'error');
        } finally {
          startInFlight = false;
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-play" aria-hidden="true"></i>';
          }
          paintCompetitorControls();
        }
      }
      window.startCompetition = startCompetition;
      
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
              'Authorization': 'Bearer ' + (window.DueliSession.token() || '')
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
            headers: { 'Authorization': 'Bearer ' + (window.DueliSession.token() || '') }
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

      // ===== R4-LIVE-ENTRY-RECOVERY-REM1: status without refresh =====
      // One SSE subscription on the EXISTING competition channel + a bounded
      // GET resync. No WebSocket, no polling loop. A status event is applied
      // in place: an already-running prep PC/recorder/preview is never
      // recreated, and LIVE never implies publish consent.
      let competitionStatusES = null;
      let statusResyncTimer = null;
      let statusResyncAttempts = 0;

      function statusLabel(status) {
        if (status === 'live') return tr.status_live;
        if (status === 'pending') return tr.status_pending;
        if (status === 'accepted') return tr.status_accepted || 'Ready';
        if (status === 'completed') return tr.status_completed;
        return tr['status_' + status] || status;
      }

      function paintCompetitionChrome() {
        if (!competitionData) return;
        const badge = document.getElementById('competitionStatusBadge');
        const dot = document.getElementById('competitionStatusDot');
        const text = document.getElementById('competitionStatusText');
        const status = competitionData.status;
        if (badge) {
          const base = 'flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ';
          const tone = status === 'live'
            ? 'badge-live'
            : status === 'pending'
              ? 'badge-pending'
              : status === 'accepted'
                ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400'
                : 'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400';
          badge.className = base + tone;
        }
        if (dot) dot.className = status === 'live'
          ? 'w-1.5 h-1.5 rounded-full bg-red-500 live-pulse'
          : 'hidden';
        if (text) text.textContent = statusLabel(status);
        paintCompetitorControls();
      }

      function paintCompetitionTimer() {
        if (!competitionData || !competitionData.timer || !competitionData.timer.deadline) return;
        if (typeof window.createCountdownTimer !== 'function') return;
        const host = document.getElementById('countdownTimerHost');
        if (!host) return;
        host.innerHTML = '';
        window.createCountdownTimer({
          competitionId: competitionId,
          deadline: competitionData.timer.deadline,
          type: competitionData.timer.type,
          labelKey: competitionData.timer.labelKey
        });
      }

      // R4-LIVE-END-RECOVERY-1 (28.5): bounded promises. Recorder drain must
      // never delay the official end transition or the terminal UI.
      function waitBounded(promise, ms) {
        return Promise.race([
          Promise.resolve(promise).then(function(value) { return value; }, function() { return false; }),
          new Promise(function(resolve) { setTimeout(function() { resolve(null); }, ms); })
        ]);
      }

      // Stop the ONE host recorder exactly once. The compositor reference is
      // cleared immediately, so an SSE end racing the local end can never
      // start a second finalize/drain. The returned promise keeps draining in
      // the background if the bounded wait expires (clean-end keys stay valid).
      function stopRecorderForEnd() {
        if (recordingStopPromise) return recordingStopPromise;
        if (!compositor) return Promise.resolve(true);
        const active = compositor;
        compositor = null;
        try { active.stopCompositing(); } catch (e) { /* already stopped */ }
        recordingStopPromise = Promise.resolve()
          .then(function() { return active.destroy(); })
          .then(function() { return true; }, function(err) {
            log('Recorder stop error: ' + (err && err.message ? err.message : err), 'error');
            return false;
          });
        return recordingStopPromise;
      }

      // Official completed state only: release camera/mic/screen tracks,
      // timers and peer connection; never POST /end and never finalize twice.
      function beginTerminalTeardown() {
        if (terminalTeardownStarted) return;
        terminalTeardownStarted = true;
        if (durationTicker) { clearTimeout(durationTicker); durationTicker = null; }
        if (competitorWatcher) { clearInterval(competitorWatcher); competitorWatcher = null; }

        const stopPromise = stopRecorderForEnd();
        const activeP2P = p2p;
        p2p = null;
        if (activeP2P) {
          // Release devices synchronously; disconnect() also withdraws presence
          // and closes the PC, but must not gate camera/mic off on the network
          // round-trip inside signaling.disconnect().
          try { activeP2P.stopLocalMedia(); } catch (e) { /* already stopped */ }
          Promise.resolve()
            .then(function() { return activeP2P.disconnect(); })
            .catch(function(err) {
              log('Peer teardown error: ' + (err && err.message ? err.message : err), 'error');
            });
        }

        mediaPublished = false;
        isScreenSharing = false;
        localMediaAvailable = false;
        prepReady = false;
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = null;
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) remoteVideo.srcObject = null;

        waitBounded(stopPromise, 12000).then(function(result) {
          if (result === null) log('Recording drain exceeded the end bound; valid drain tail continues', 'warn');
        });
      }

      // Completed closes rating writes immediately, before the structural
      // re-render replaces the live DOM; the final tally stays visible.
      function closeRatingUi() {
        const stars = document.getElementById('rateStars');
        if (stars) stars.classList.add('hidden');
        const hint = document.getElementById('rateEligibleHint');
        if (hint) hint.classList.add('hidden');
        const msg = document.getElementById('rateMsg');
        if (msg) msg.classList.add('hidden');
        const state = document.getElementById('rateStateLine');
        const finalText = (tr.ratings && tr.ratings.final_readonly) || 'Final result';
        if (state) {
          state.textContent = finalText;
          state.className = 'text-xs font-semibold mb-4 text-gray-500 dark:text-gray-400';
        }
        const card = document.getElementById('rateCard');
        let note = document.getElementById('rateFinalNote');
        if (!note && card) {
          note = document.createElement('p');
          note.id = 'rateFinalNote';
          note.className = 'mt-3 text-xs text-gray-500 dark:text-gray-400';
          card.appendChild(note);
        }
        if (note) note.textContent = finalText;
        loadRatingSummary();
      }

      function applyCompetitionState(next) {
        if (!next) return;
        const prev = competitionData || {};
        const userId = window.currentUser && window.currentUser.id;
        const resolve = window.resolveVideoSurface;
        const prevSurface = resolve ? resolve(prev, userId) : 'waiting';
        const nextComp = Object.assign({}, prev, next);
        const nextSurface = resolve ? resolve(nextComp, userId) : 'waiting';
        const becameCompleted = prev.status !== 'completed' && nextComp.status === 'completed';
        const wasParticipant = !!userId && (userId === nextComp.creator_id || userId === nextComp.opponent_id);
        // The truthful surface marker for THIS competition's completed state
        // (id-based: unrelated fields arriving later never invalidate it).
        const completionKey = nextComp.status === 'completed'
          ? String(nextComp.id || competitionId) + ':completed'
          : null;
        competitionData = nextComp;

        // A28-SURFACE: cleanup/teardown are best-effort steps on the way to
        // the terminal surface. Each is isolated so a rating-DOM or device
        // release failure can NEVER strand the page on the live DOM with a
        // completed state. The recorder drain is explicitly NOT aborted here:
        // beginTerminalTeardown() bounds its wait and lets the authorized
        // tail keep draining in the background.
        if (becameCompleted) {
          try {
            closeRatingUi();
          } catch (err) {
            log('Rating cleanup failed: ' + (err && err.message ? err.message : err), 'error');
          }
          // Competitors stop broadcasting and become viewers of their own
          // recording. Both roles then boot the completed surface in place.
          if (wasParticipant) {
            try {
              beginTerminalTeardown();
            } catch (err) {
              log('Terminal teardown failed: ' + (err && err.message ? err.message : err), 'error');
            }
          }
        }

        // Structural changes re-render. Completed is structural for every
        // role (live stage/player -> embedded recording) even when the old
        // surface was already running; accepted→live remains chrome-only so
        // the PC/recorder/preview stay mounted. completedNeedsRender retries a
        // completed surface whose previous render threw (state is already
        // completed, so becameCompleted is false on the retry).
        const completedNeedsRender = completionKey !== null && completedSurfaceKey !== completionKey;
        if (becameCompleted || (!competitorStarted && nextSurface !== prevSurface) || completedNeedsRender) {
          try {
            renderCompetition(nextComp);
            if (completionKey !== null) completedSurfaceKey = completionKey;
            refreshEmbeddedDownloadButton();
          } catch (err) {
            // The failed surface stays retryable: keep the marker clear so
            // the next event/resync repaints it instead of trusting a DOM
            // that never rendered this state.
            if (completionKey !== null) completedSurfaceKey = null;
            log('Surface render failed: ' + (err && err.message ? err.message : err), 'error');
          }
          paintCompetitionTimer();
          try {
            initCompetitionDynamics();
          } catch (err) {
            // Realtime/dynamics failures are isolated: they must not undo or
            // block the surface that is already painted.
            log('Dynamics init failed: ' + (err && err.message ? err.message : err), 'error');
          }
          return;
        }
        paintCompetitionChrome();
        paintCompetitionTimer();
        if (nextSurface === 'competitor' && !competitorStarted) {
          checkAndInitStream();
        } else if (nextSurface === 'embedded' && prevSurface !== 'embedded') {
          checkAndInitStream();
        }
        if (competitionData.status === 'live') maybeStartRecording();
      }

      async function syncCompetitionFromServer() {
        try {
          const res = await fetch('/api/competitions/' + competitionId);
          const data = await res.json();
          if (data && data.success && data.data) {
            applyCompetitionState(data.data);
            return true;
          }
        } catch (e) { /* bounded retry below */ }
        return false;
      }

      // Bounded resync: 0 / 1.5s / 4s / 8s. EventSource recovery and the
      // status event both call this; failures never create a polling loop.
      function scheduleStatusResync(attempt) {
        const tries = typeof attempt === 'number' ? attempt : 0;
        if (tries > 3 || statusResyncTimer) return;
        const delay = [0, 1500, 4000, 8000][tries] || 8000;
        statusResyncTimer = setTimeout(async function() {
          statusResyncTimer = null;
          const ok = await syncCompetitionFromServer();
          if (!ok) scheduleStatusResync(tries + 1);
        }, delay);
      }

      function subscribeCompetitionStatus() {
        try {
          if (competitionStatusES) {
            try { competitionStatusES.close(); } catch (e) {}
            competitionStatusES = null;
          }
          if (typeof EventSource === 'undefined') return;
          const es = new EventSource('/api/sse?channel=' + encodeURIComponent('competition:' + competitionId));
          competitionStatusES = es;
          es.addEventListener('competition_status', function(ev) {
            let payload = null;
            try { payload = JSON.parse(ev.data); } catch (e) { payload = null; }
            if (payload && competitionData) {
              const patch = {};
              if (payload.status) patch.status = payload.status;
              if (payload.opponent_id !== undefined) patch.opponent_id = payload.opponent_id;
              if (payload.started_at) patch.started_at = payload.started_at;
              if (payload.ended_at) patch.ended_at = payload.ended_at;
              applyCompetitionState(patch);
            }
            scheduleStatusResync(0);
          });
          es.onerror = function() {
            // EventSource reconnects on its own; the bounded GET keeps state
            // correct even when the stream is unavailable.
            scheduleStatusResync(0);
          };
        } catch (e) { /* realtime is optional; the page still works */ }
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
        const ctrls = document.getElementById('embeddedVodControls');
        if (ctrls && ctrls.classList.contains('hidden')) return null;
        // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1): the SAME global timeline as
        // the seekbar/player (verified chunk start + offset). A chunk-local
        // video.currentTime would misplace every timed comment.
        if (!embeddedCurrentPlayer || typeof embeddedCurrentPlayer.getGlobalTime !== 'function') return null;
        const t = embeddedCurrentPlayer.getGlobalTime();
        return (typeof t === 'number' && isFinite(t)) ? Math.floor(Math.max(0, t)) : null;
      }
      window.seekToCommentOffset = function(sec) {
        const t = parseFloat(sec);
        if (isNaN(t) || t < 0) return;
        if (!embeddedCurrentPlayer || typeof embeddedCurrentPlayer.seekTo !== 'function') return;
        embeddedCurrentPlayer.seekTo(t);
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
        const sess = window.DueliSession.token();
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
      let watchIntentRecorded = false;
      async function initCompetitionDynamics() {
        loadCommentsInitial();
        subscribeCommentsLive();
        loadRatingSummary();
        subscribeRatingsLive();
        subscribeCompetitionStatus();
        loadReactionStatus();
        loadCompetitionAd();
        // Sequential: the heartbeat must see the guest token the intent may
        // have just issued — concurrent first-view calls issued two day-rows
        // for one anonymous viewer. Status-driven re-renders must NOT count a
        // second view, so the intent runs once per page load.
        if (!watchIntentRecorded) {
          watchIntentRecorded = true;
          await recordWatchIntent();
        }
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
          const sess = window.DueliSession.token();
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
              'Authorization': 'Bearer ' + window.DueliSession.token(),
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
              'Authorization': 'Bearer ' + window.DueliSession.token(),
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
              'Authorization': 'Bearer ' + window.DueliSession.token(),
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
              'Authorization': 'Bearer ' + window.DueliSession.token(),
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
              'Authorization': 'Bearer ' + window.DueliSession.token(),
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
              'Authorization': 'Bearer ' + window.DueliSession.token(),
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
              'Authorization': 'Bearer ' + window.DueliSession.token(),
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
      // R4-LIVE-END-RECOVERY-1 (28.5): one player/listener set per surface.
      // Status transitions can arrive from SSE, the 30s check and the end
      // handler at once; overlapping inits are queued, never duplicated.
      let embeddedInitInFlight = false;
      let embeddedReloadQueued = false;
      // R4-CHUNK-PLAYER-UX-1: live-edge bookkeeping for rewind/return-live
      // (manager ref + last played index; reset whenever the player is torn
      // down so stale positions never drive the buttons).
      let liveChunkManager = null;
      let liveCurrentIndex = -1;
      
      function log(msg, type = 'info') {
        console.log('[LiveStream]', type === 'error' ? '❌' : '📡', msg);
      }

      // FV20-TOAST: page-local toast bridge. This page used bare showToast()
      // in the publish/start flow while only window.dueli.showToast existed,
      // so publishMedia threw ReferenceError AFTER attaching the local tracks
      // and NEVER reached createOffer()/requestReoffer(). Delegate to the
      // canonical client API, then legacy global, then a minimal DOM fallback;
      // a toast failure must never break media or negotiation.
      function showToast(message, type = 'info') {
        const text = (message === undefined || message === null) ? '' : String(message);
        const kind = type || 'info';
        try {
          const api = (typeof window !== 'undefined') ? window.dueli : null;
          if (api && typeof api.showToast === 'function') {
            api.showToast(text, kind);
            return;
          }
        } catch (e) { /* bridge failure falls through, never breaks the caller */ }
        try {
          if (typeof window !== 'undefined' && typeof window.showToast === 'function' && window.showToast !== showToast) {
            window.showToast(text, kind);
            return;
          }
        } catch (e) { /* fall through to the DOM fallback */ }
        try {
          if (typeof document === 'undefined' || !document.body) return;
          const existing = document.querySelector('.toast');
          if (existing) existing.remove();
          const toast = document.createElement('div');
          toast.className = 'toast toast-' + kind;
          toast.textContent = text;
          toast.style.cssText = isRTL ? 'left: 24px;' : 'right: 24px;';
          document.body.appendChild(toast);
          setTimeout(function() {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(20px)';
            setTimeout(function() { toast.remove(); }, 300);
          }, 3000);
        } catch (e) { /* the UI affordance is best-effort only */ }
      }

      // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / O19-21): ONE player badge.
      // LIVE is a playback-position fact (at the confirmed edge), REPLAY means
      // the audience rewound inside the recording, VOD means completed media.
      // It is never derived from a printed in-video watermark.
      function updateEmbeddedMode(mode) {
        const badge = document.getElementById('embeddedModeBadge');
        if (!badge) return;
        badge.classList.remove('hidden', 'bg-red-600', 'bg-amber-500');
        if (mode === 'live') {
          badge.classList.add('bg-red-600');
          badge.innerHTML = '<i class="fas fa-circle animate-pulse mr-1"></i>' + (tr.status_live || 'LIVE');
        } else if (mode === 'replay') {
          badge.classList.add('bg-amber-500');
          badge.innerHTML = '<i class="fas fa-history mr-1"></i>' + (tr.replay || 'Replay');
        } else if (mode === 'vod') {
          badge.classList.add('bg-amber-500');
          badge.innerHTML = '<i class="fas fa-film mr-1"></i>' + (tr.recorded || 'VOD');
        } else {
          badge.classList.add('hidden');
        }
      }
      
      // ===== Embedded Viewer: Auto-Start =====

      // One playback surface at a time. A status transition (SSE, end click,
      // 30s check) must stop the live player/listeners before VOD starts.
      function stopEmbeddedPlayback() {
        if (window._statusPollInterval) {
          clearInterval(window._statusPollInterval);
          window._statusPollInterval = null;
        }
        if (window._vodRetryTimer) {
          clearTimeout(window._vodRetryTimer);
          window._vodRetryTimer = null;
        }
        if (embeddedCurrentPlayer && typeof embeddedCurrentPlayer.stop === 'function') {
          try { embeddedCurrentPlayer.stop(); } catch (e) { /* best effort */ }
        }
        embeddedCurrentPlayer = null;
        liveChunkManager = null;
        liveCurrentIndex = -1;
      }
      
      async function initEmbeddedViewer() {
        // Overlapping status/SSE/retry calls are coalesced into one re-init.
        if (embeddedInitInFlight) {
          embeddedReloadQueued = true;
          return;
        }
        embeddedInitInFlight = true;
        try {
        stopEmbeddedPlayback();
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
            // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / O19-07, O19-21): the
            // audience sees a translated state, never a raw 'media:*' token
            // or a chunk counter. The machine state stays in data/__mediaState.
            var labels = {
              waiting: tr.player_state_waiting || 'Waiting for stream...',
              playing: tr.player_state_playing || 'Playing',
              error: tr.player_state_error || 'Error',
              processing: tr.player_state_processing || 'Preparing the recording...',
              ready: tr.player_state_ready || 'Ready',
              unavailable: tr.player_state_unavailable || 'Media unavailable'
            };
            label.textContent = (window.playerStateLabel ? window.playerStateLabel(state) : labels[state]);
            label.setAttribute('data-media-state', state);
            label.classList.remove('hidden');
          }
          const icon = document.getElementById('embeddedStatusIcon');
          if (icon) icon.className = MEDIA_ICONS[state];
          const retry = document.getElementById('embeddedRetryBtn');
          if (retry) retry.classList.toggle('hidden', !(state === 'error' || state === 'unavailable'));
        }
        // R4-LIVE-END-RECOVERY-1 (28.5): completed readiness is decided by
        // the verified playlist/index below (real receivable chunks), never by
        // vod_url alone. An end click or attempted upload is not evidence.
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
        
        // R2-L2 / 28.5: VOD not ready → bounded auto-poll (8 × 15s) while
        // verified chunks/index drain into the playlist, then the
        // unavailable state with a MANUAL retry (no endless spinner).
        var VOD_MAX_RETRIES = 8;
        function handleVodNotReady() {
          if (!window._vodRetryCount) window._vodRetryCount = 0;
          if (window._vodRetryCount < VOD_MAX_RETRIES) {
            window._vodRetryCount++;
            setMediaState('processing');
            showStatusOverlay(tr.recording_processing || 'جاري تجهيز التسجيل...');
            if (window._vodRetryTimer) clearTimeout(window._vodRetryTimer);
            window._vodRetryTimer = setTimeout(function() {
              window._vodRetryTimer = null;
              initEmbeddedViewer();
            }, 15000);
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
          
          // Determine mode from both status and stream_status fields.
          // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / O19-21): COMPLETED wins.
          // A stale stream_status='live' on a completed DB row must never boot
          // the live player or paint a false LIVE badge over a recording.
          const dbStatus = comp.status;            // 'live' | 'completed' | 'pending' | 'accepted'
          const streamSt = comp.stream_status;    // 'live' | 'ready' | 'idle' | undefined
          if (competitionData) {
            // Keep the page-level mode in sync when the viewer transitions
            // live -> completed in place (timed comments/VOD gating).
            competitionData.status = dbStatus;
            if (streamSt !== undefined) competitionData.stream_status = streamSt;
          }
          
          const isCompletedComp = (dbStatus === 'completed') || (streamSt === 'ready');
          const isLiveComp = !isCompletedComp && ((dbStatus === 'live') || (streamSt === 'live'));
          
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

            const vodControls = document.getElementById('embeddedVodControls');
            if (vodControls) vodControls.classList.add('hidden');
            const liveControls = document.getElementById('embeddedLiveControls');
            if (liveControls) liveControls.classList.remove('hidden');

            const chunkManager = new window.ChunkManager(competitionId, 'mp4');
            liveChunkManager = chunkManager;
            liveCurrentIndex = -1;
            embeddedCurrentPlayer = new window.LiveSequentialPlayer({
              videoPlayers: videoPlayers,
              chunkManager: chunkManager,
              onTimeUpdate: function(globalTime, availableDuration) {
                const bar = document.getElementById('embeddedLiveSeekbar');
                const display = document.getElementById('embeddedLiveTimeDisplay');
                if (display) display.textContent = formatClock(globalTime) + ' / ' + formatClock(availableDuration);
                if (bar) bar.value = availableDuration > 0
                  ? Math.max(0, Math.min(100, (globalTime / availableDuration) * 100))
                  : 100;
                syncLiveEdgeButtons();
              },
              onChunkChange: function(index) {
                // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1): no chunk counter is
                // shown to the audience; only real playback state.
                setMediaState('playing');
                hideStatusOverlay();
                liveCurrentIndex = index;
                syncLiveEdgeButtons();
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

            // LIVE timeline seek: percentage of the WHOLE available recording
            // (index total), then the player converts global -> chunk offset.
            const liveSeekbar = document.getElementById('embeddedLiveSeekbar');
            if (liveSeekbar && !liveSeekbar.__dueliWired) {
              liveSeekbar.__dueliWired = true;
              liveSeekbar.addEventListener('input', function() {
                if (!embeddedCurrentPlayer || typeof embeddedCurrentPlayer.seekTo !== 'function') return;
                const dur = (typeof embeddedCurrentPlayer.getAvailableDuration === 'function')
                  ? embeddedCurrentPlayer.getAvailableDuration() : 0;
                if (!(dur > 0)) return;
                const pct = parseFloat(liveSeekbar.value);
                if (!isFinite(pct)) return;
                embeddedCurrentPlayer.seekTo((pct / 100) * dur);
              });
            }

            // يبدأ من آخر قطعة متاحة حالياً لعدم التأخر عن البث
            await embeddedCurrentPlayer.start({ startFromLatest: true });
            syncLiveEdgeButtons();
            
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
                  updateEmbeddedMode('vod');
                  await initEmbeddedViewer();
                }
              } catch(e) { /* تجاهل أخطاء الاستطلاع */ }
            }, 30000);
            
          } else if (isCompletedComp) {
            // === VOD: Use SmartVodPlayer ===
            // Completed WITHOUT verified chunks is NOT recorded — the
            // playlist fetch below routes to processing/unavailable (bounded
            // poll + manual retry), never the VOD badge/controls.
            setEmbeddedStatus(tr.loading_video || 'Loading video...');
            setMediaState('waiting');
            updateEmbeddedMode('vod');

            // Completed recording: never keep live chrome / a false LIVE chip.
            liveChunkManager = null;
            liveCurrentIndex = -1;
            const liveControls = document.getElementById('embeddedLiveControls');
            if (liveControls) liveControls.classList.add('hidden');
            const liveChip = document.getElementById('embeddedLiveChip');
            if (liveChip) liveChip.classList.add('hidden');
            setLiveBtnVisible('embeddedLiveBtn', false);
            setLiveBtnVisible('embeddedRewindBtn', false);

            if (!window.SmartVodPlayer) {
              setMediaState('error');
              showStatusOverlay(tr.streaming_unavailable || 'Video service unavailable');
              return;
            }
            
            // Fetch playlist via our server-side proxy (T1.3: remote playlist.php
            // sends no CORS headers — direct browser calls were blocked)
            const playlistRes = await fetch('/api/chunks/playlist/' + competitionId);
            
            // 28.5: the playlist may lag the end while the authorized drain
            // tail lands — bounded poll instead of dead-ending.
            if (!playlistRes.ok) {
                handleVodNotReady();
                return;
            }
            const playlistData = await playlistRes.json();

            // R4-CHUNK-PLAY-1: the proxy discriminates upstream states — an
            // upstream failure is an ERROR (with manual retry), never the
            // processing spinner; only a valid-but-empty list polls as
            // processing → unavailable.
            if (playlistData.upstream === 'error' || playlistData.upstream === 'invalid') {
                setMediaState('error');
                showStatusOverlay(tr.recording_not_ready || 'Recording not available');
                return;
            }

            if (!playlistData.chunks || playlistData.chunks.length === 0) {
                handleVodNotReady();
                return;
            }
            
            embeddedCurrentPlayer = new window.SmartVodPlayer({
              videoElement: videoPlayers[0],
              competitionId: competitionId,
              playlistData: playlistData,
              // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1): progress, seek and
              // timed comments all consume the player's ONE global timeline.
              onTimeUpdate: function(globalTime, totalDuration) {
                const seekbar = document.getElementById('embeddedSeekbar');
                const display = document.getElementById('embeddedTimeDisplay');
                const total = (typeof totalDuration === 'number' && isFinite(totalDuration)) ? totalDuration : 0;
                if (seekbar) {
                  seekbar.value = total > 0
                    ? Math.max(0, Math.min(100, (globalTime / total) * 100))
                    : 0;
                }
                if (display) display.textContent = formatClock(globalTime) + ' / ' + formatClock(total);
                const v = videoPlayers[0];
                if (v && !v.paused) setMediaState('playing');
                if (typeof syncTimedComments === 'function') syncTimedComments(globalTime);
                const icon = document.getElementById('embeddedPlayPauseIcon');
                if (icon) icon.className = (v && v.paused) ? 'fas fa-play text-sm' : 'fas fa-pause text-sm';
              },
              onReady: function() {
                setMediaState('ready');
                hideStatusOverlay();
                window._vodRetryCount = 0; // reset poll counter on success
                const vodControls = document.getElementById('embeddedVodControls');
                if (vodControls) vodControls.classList.remove('hidden');
                embeddedSetupVodControls(videoPlayers[0], embeddedCurrentPlayer);
                // إظهار زر التحميل بعد أن يكون المشغل جاهزاً — للمستخدمين
                // المسجلين فقط. الضيف يشاهد الفيديو بلا زر تنزيل (الخادم
                // يرفض بيان التنزيل لغير المسجلين أيضاً).
                refreshEmbeddedDownloadButton();
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
          log('Embedded viewer error: ' + ((err && err.message) || err), 'error');
          setMediaState('error');
          showStatusOverlay(tr.error_occurred || 'An error occurred');
        }
        } finally {
          embeddedInitInFlight = false;
          if (embeddedReloadQueued) {
            embeddedReloadQueued = false;
            setTimeout(function() { initEmbeddedViewer(); }, 0);
          }
        }
      }
      
      // ===== VOD Seekbar Controls =====
      // R4-CHUNK-VIEW-RECOVERY-1 REM1 (28.4.1 / O19-12): the control surface
      // ONLY talks to the player's global timeline. videoEl.duration is a
      // current-chunk value and must never become the recording length.
      function embeddedSetupVodControls(videoEl, player) {
        const seekbar = document.getElementById('embeddedSeekbar');
        const timeDisplay = document.getElementById('embeddedTimeDisplay');

        const playerTime = (player && typeof player.getGlobalTime === 'function') ? player.getGlobalTime() : 0;
        const playerDuration = (player && typeof player.getGlobalDuration === 'function') ? player.getGlobalDuration() : 0;
        if (seekbar) {
          seekbar.value = playerDuration > 0
            ? Math.max(0, Math.min(100, (playerTime / playerDuration) * 100))
            : 0;
        }
        if (timeDisplay) timeDisplay.textContent = formatClock(playerTime) + ' / ' + formatClock(playerDuration);

        if (videoEl && !videoEl.__dueliVodWired) {
          videoEl.__dueliVodWired = true;
          videoEl.addEventListener('play', function() {
            const icon = document.getElementById('embeddedPlayPauseIcon');
            if (icon) icon.className = 'fas fa-pause text-sm';
          });
          videoEl.addEventListener('pause', function() {
            const icon = document.getElementById('embeddedPlayPauseIcon');
            if (icon) icon.className = 'fas fa-play text-sm';
          });
        }

        if (seekbar && !seekbar.__dueliVodWired) {
          seekbar.__dueliVodWired = true;
          seekbar.addEventListener('input', function() {
            if (!embeddedCurrentPlayer || typeof embeddedCurrentPlayer.seekTo !== 'function') return;
            const dur = (typeof embeddedCurrentPlayer.getGlobalDuration === 'function')
              ? embeddedCurrentPlayer.getGlobalDuration() : 0;
            if (!(dur > 0)) return;
            const percent = parseFloat(seekbar.value);
            if (!isFinite(percent)) return;
            embeddedCurrentPlayer.seekTo((percent / 100) * dur);
          });
        }
      }
      
      // ===== Embedded Viewer Controls =====
      window.embeddedTogglePlayPause = function() {
        if (embeddedCurrentPlayer && typeof embeddedCurrentPlayer.togglePlayPause === 'function') {
          embeddedCurrentPlayer.togglePlayPause();
          return;
        }
        const v = document.getElementById('embeddedVideoPlayer1');
        if (!v) return;
        v.paused ? v.play() : v.pause();
      };

      // R4-CHUNK-PLAYER-UX-1: live-edge buttons. Rewind = one chunk back
      // then forward flow resumes there; Return-to-Live jumps to the newest
      // confirmed-ready edge. Buttons show by real position only.
      function setLiveBtnVisible(id, show) {
        const btn = document.getElementById(id);
        if (!btn) return;
        btn.classList.toggle('hidden', !show);
        if (show) btn.classList.add('inline-flex');
        else btn.classList.remove('inline-flex');
      }
      function syncLiveEdgeButtons() {
        // VOD/completed: never paint live chrome from a stale player.
        if (!liveChunkManager) return;
        let behind = false;
        try {
          if (embeddedCurrentPlayer && typeof embeddedCurrentPlayer.isBehindLive === 'function') {
            behind = embeddedCurrentPlayer.isBehindLive();
          } else {
            const edge = liveChunkManager.maxIndex ? liveChunkManager.maxIndex() : -1;
            behind = edge >= 0 && liveCurrentIndex >= 0 && edge > liveCurrentIndex;
          }
        } catch (e) {}
        setLiveBtnVisible('embeddedLiveBtn', behind);

        let canRewind = liveCurrentIndex > 0;
        try {
          if (embeddedCurrentPlayer && typeof embeddedCurrentPlayer.getGlobalTime === 'function') {
            canRewind = embeddedCurrentPlayer.getGlobalTime() > 0.5;
          }
        } catch (e) {}
        setLiveBtnVisible('embeddedRewindBtn', canRewind);

        // ONE player badge: LIVE only at the confirmed edge; REPLAY while
        // rewound. A printed recording watermark is not a live indicator.
        const chip = document.getElementById('embeddedLiveChip');
        if (chip) chip.classList.toggle('hidden', behind);
        updateEmbeddedMode(behind ? 'replay' : 'live');
      }
      window.embeddedReturnToLive = async function() {
        if (embeddedCurrentPlayer && typeof embeddedCurrentPlayer.jumpToLive === 'function') {
          try {
            await embeddedCurrentPlayer.jumpToLive();
            syncLiveEdgeButtons();
            return;
          } catch (e) { /* fall through to a clean restart */ }
        }
        try {
          if (embeddedCurrentPlayer && embeddedCurrentPlayer.stop) embeddedCurrentPlayer.stop();
        } catch (e) {}
        embeddedCurrentPlayer = null;
        liveChunkManager = null;
        liveCurrentIndex = -1;
        await initEmbeddedViewer(); // restarts at the live edge
      };
      window.embeddedRewindLive = async function() {
        try {
          if (embeddedCurrentPlayer && embeddedCurrentPlayer.rewindTo && liveCurrentIndex > 0) {
            await embeddedCurrentPlayer.rewindTo(liveCurrentIndex - 1);
          }
        } catch (e) { /* player surfaces errors via onError */ }
        syncLiveEdgeButtons();
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
      
      // Download VOD recording (R4-CHUNK-DOWNLOAD-1): the independent
      // RecordingDownloadService fetches the authenticated server manifest,
      // pulls every remaining chunk itself, verifies it, then remuxes or
      // converts. It never reads SmartVodPlayer.loadedChunks and never uses
      // raw Blob concatenation.
      function refreshEmbeddedDownloadButton() {
        const dlBtn = document.getElementById('embeddedDownloadBtn');
        if (!dlBtn) return;
        const authed = !!(window.currentUser && window.currentUser.id);
        // Availability follows the authoritative competition state, not the
        // VOD player. A partial/not-yet-ready recording may still be
        // downloadable through the manifest (which labels it partial), while a
        // LIVE competition must never expose a download.
        const downloadable = !!competitionData
          && (competitionData.status === 'completed' || competitionData.stream_status === 'ready');
        dlBtn.classList.toggle('hidden', !authed || !downloadable);
      }
      window.addEventListener('dueli:auth-success', refreshEmbeddedDownloadButton);

      window.embeddedDownload = function() {
        if (!window.currentUser || !window.currentUser.id) {
          if (typeof window.showLoginModal === 'function') window.showLoginModal();
          return;
        }
        if (typeof window.openRecordingDownload === 'function') {
          window.openRecordingDownload(competitionId);
          return;
        }
        log('Download UI is not available on this page', 'error');
      };

      // ========== R4-COMP-UNIFIED-1: in-page competitor live ==========
      // Same bundle classes as /live/:id (window.P2PConnection transport +
      // window.VideoCompositor host-only recording) — no parallel broadcast
      // system. Role is server-derived (session user vs creator/opponent);
      // presence/eligibility re-derived server-side per signaling request.
      // Refresh/back safe: single init per page load, idempotent session
      // join, resume-after-max upload, idempotent finalize. The competition
      // is never ended from unload (no beforeunload end anywhere here).
      var competitorStarted = false;
      var competitorWatcher = null;
      var competitorStartTime = null;
      // R4-LIVE-ENTRY-RECOVERY-REM1: independent source/publish/control state.
      // None of these are derived from the competition being LIVE.
      var mediaPublished = false;
      var startInFlight = false;
      var hadCameraBeforeScreen = false;
      var localMediaAvailable = false;
      var prepReady = false;
      // R4-LIVE-END-RECOVERY-1 (28.5): terminal teardown and recorder drain
      // are single-shot. The competition is never ended here — only an
      // official completed state triggers cleanup.
      var terminalTeardownStarted = false;
      var recordingStopPromise = null;
      var speakerMuted = false;
      var stageExpanded = false;
      // Declared here (was an undeclared reference in the end path): both
      // leave and end clear this single timer before tearing anything down.
      var durationTicker = null;

      function competitorAuthHeaders() {
        const h = { 'Content-Type': 'application/json' };
        const sess = window.DueliSession.token();
        if (sess) h['Authorization'] = 'Bearer ' + sess;
        return h;
      }

      async function withCompetitorRetry(label, fn) {
        for (let attempt = 1; attempt <= 5; attempt++) {
          try {
            const res = await fn();
            if (res !== false && res !== null && res !== undefined) return res;
          } catch (err) {
            log(label + ' attempt ' + attempt + ' failed: ' + (err && err.message ? err.message : err), 'error');
          }
          if (attempt < 5) {
            await new Promise(function(r) { setTimeout(r, Math.min(1000 * Math.pow(2, attempt - 1), 8000)); });
          }
        }
        return false;
      }

      function updateCompetitorStatus(state) {
        const el = document.getElementById('connectionStatus');
        if (!el) return;
        el.classList.remove('hidden');
        if (state === 'connected') {
          el.className = 'absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-sm bg-green-600 text-white z-30';
          el.innerHTML = '<i class="fas fa-check me-2"></i>' + (tr.live_signaling ? tr.live_signaling.connected : 'Connected');
          setTimeout(function() { el.classList.add('hidden'); }, 3000);
        } else if (state === 'connecting' || state === 'checking') {
          el.className = 'absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-sm bg-yellow-600 text-white z-30';
          el.innerHTML = '<i class="fas fa-wifi me-2"></i>' + (tr.live_signaling ? tr.live_signaling.connecting : 'Connecting...');
        } else if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          el.className = 'absolute top-4 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-sm bg-red-600 text-white z-30';
          el.innerHTML = '<i class="fas fa-exclamation-triangle me-2"></i>' + (tr.live_signaling ? tr.live_signaling.connection_failed : 'Connection failed');
        }
      }

      // R4-LIVE-ENTRY-RECOVERY-REM1: the prep/publish line tells the truth.
      // Being LIVE is not publishing; the gateway is mediaPublished + a live
      // RTCRtpSender on the peer connection.
      function setPublishState(message) {
        const el = document.getElementById('publishState');
        if (el) el.textContent = message;
      }

      function localTrackOf(kind) {
        if (!p2p) return null;
        const stream = p2p.getLocalStream();
        if (!stream) return null;
        return stream.getTracks().find(function(t) { return t.kind === kind; }) || null;
      }

      function paintCompetitorControls() {
        if (!document.getElementById('competitorControls')) return;
        const status = competitionData ? competitionData.status : null;
        const canStart = status === 'accepted' && !!competitionData.opponent_id && !startInFlight;
        const setHidden = function(id, hidden) {
          const el = document.getElementById(id);
          if (el) el.classList.toggle('hidden', !!hidden);
        };
        setHidden('startBtn', !canStart);
        setHidden('endBtn', status !== 'live');
        // Publish appears only once a real local source exists and consent has
        // not been given yet; the end button never shows before LIVE.
        const preview = p2p ? p2p.getLocalStream() : null;
        const hasMedia = !!(preview && preview.getTracks().length > 0);
        setHidden('publishBtn', !p2p || mediaPublished || !hasMedia);
        setHidden('screenBtn', !supportsScreenShare());

        const publishBtn = document.getElementById('publishBtn');
        if (publishBtn && !mediaPublished) {
          const label = userRole === 'host' ? tr.prep_publish_host : tr.prep_publish_guest;
          publishBtn.setAttribute('aria-label', label);
          publishBtn.setAttribute('title', label);
        }

        const screenBtn = document.getElementById('screenBtn');
        if (screenBtn) screenBtn.classList.toggle('is-active', isScreenSharing);

        const videoBtn = document.getElementById('videoBtn');
        if (videoBtn) {
          const videoTrack = localTrackOf('video');
          const videoOn = !!(videoTrack && videoTrack.enabled) || isScreenSharing;
          videoBtn.classList.toggle('is-active', videoOn);
          videoBtn.innerHTML = videoOn
            ? '<i class="fas fa-video" aria-hidden="true"></i>'
            : '<i class="fas fa-video-slash" aria-hidden="true"></i>';
        }

        const audioBtn = document.getElementById('audioBtn');
        if (audioBtn) {
          const audioTrack = localTrackOf('audio');
          const audioOn = !!(audioTrack && audioTrack.enabled);
          audioBtn.classList.toggle('is-active', audioOn);
          audioBtn.innerHTML = audioOn
            ? '<i class="fas fa-microphone" aria-hidden="true"></i>'
            : '<i class="fas fa-microphone-slash" aria-hidden="true"></i>';
        }

        const speakerBtn = document.getElementById('speakerBtn');
        if (speakerBtn) {
          speakerBtn.innerHTML = speakerMuted
            ? '<i class="fas fa-volume-mute" aria-hidden="true"></i>'
            : '<i class="fas fa-volume-up" aria-hidden="true"></i>';
        }

        const localBtn = document.getElementById('localVideoBtn');
        if (localBtn) {
          localBtn.classList.toggle('is-active', !localVideoVisible);
          localBtn.innerHTML = localVideoVisible
            ? '<i class="fas fa-eye" aria-hidden="true"></i>'
            : '<i class="fas fa-eye-slash" aria-hidden="true"></i>';
        }

        // The prep/publish line never claims publishing because the
        // competition is LIVE — only because this party consented.
        if (mediaPublished) setPublishState(tr.publish_state_on);
        else if (prepReady && !localMediaAvailable) setPublishState(tr.media_none);
        else if (prepReady) setPublishState(tr.publish_state_off);
      }

      function applyStageVisibility() {
        const stage = document.getElementById('competitorView');
        const localWrapper = document.getElementById('localVideoWrapper');
        if (stage) {
          stage.classList.toggle('is-swapped', videosSwapped);
          stage.classList.toggle('is-expanded', stageExpanded);
        }
        if (localWrapper) localWrapper.style.display = localVideoVisible ? '' : 'none';
        document.body.classList.toggle('live-stage-locked', stageExpanded);
        const expandBtn = document.getElementById('expandBtn');
        if (expandBtn) {
          const label = stageExpanded ? tr.collapse_stage : tr.expand_stage;
          expandBtn.setAttribute('aria-label', label);
          expandBtn.setAttribute('title', label);
        }
      }

      // The small pane (whichever side is small) is draggable inside the
      // stage bounds; its position resets when the layout role changes.
      function makePipDraggable(el) {
        if (!el || el.dataset.pipBound === '1') return;
        el.dataset.pipBound = '1';
        el.addEventListener('pointerdown', function(ev) {
          if (ev.target && ev.target.closest && ev.target.closest('button')) return;
          const stage = document.getElementById('competitorView');
          if (!stage) return;
          // Only the CURRENT small pane is draggable: local in normal mode,
          // remote after a swap. The large pane never moves.
          const pipId = videosSwapped ? 'remoteVideoWrapper' : 'localVideoWrapper';
          if (el.id !== pipId) return;
          const stageRect = stage.getBoundingClientRect();
          const elRect = el.getBoundingClientRect();
          const startLeft = elRect.left - stageRect.left;
          const startTop = elRect.top - stageRect.top;
          const startX = ev.clientX;
          const startY = ev.clientY;
          el.setPointerCapture(ev.pointerId);
          el.classList.add('is-dragging');
          function onMove(moveEv) {
            const maxLeft = Math.max(0, stageRect.width - elRect.width);
            const maxTop = Math.max(0, stageRect.height - elRect.height);
            const left = Math.min(Math.max(0, startLeft + (moveEv.clientX - startX)), maxLeft);
            const top = Math.min(Math.max(0, startTop + (moveEv.clientY - startY)), maxTop);
            el.style.insetInlineEnd = 'auto';
            el.style.left = left + 'px';
            el.style.top = top + 'px';
          }
          function onUp() {
            el.classList.remove('is-dragging');
            el.removeEventListener('pointermove', onMove);
            el.removeEventListener('pointerup', onUp);
            el.removeEventListener('pointercancel', onUp);
          }
          el.addEventListener('pointermove', onMove);
          el.addEventListener('pointerup', onUp);
          el.addEventListener('pointercancel', onUp);
        });
      }

      function setupCompetitorStage() {
        applyStageVisibility();
        makePipDraggable(document.getElementById('localVideoWrapper'));
        makePipDraggable(document.getElementById('remoteVideoWrapper'));
        const remote = document.getElementById('remoteVideo');
        if (remote) remote.muted = speakerMuted;
        // Fullscreen icon/aria stays truthful for the in-page and expanded
        // stage alike; the label follows the actual fullscreen element.
        document.addEventListener('fullscreenchange', function() {
          if (document.getElementById('competitorView')) paintFullscreenChrome();
        });
      }

      function watchCompetitorOpponent() {
        if (competitorWatcher) { clearInterval(competitorWatcher); competitorWatcher = null; }
        competitorWatcher = setInterval(async function() {
          if (!p2p) return;
          // R4-LIVE-ENTRY-RECOVERY-1: only offer after local media is published
          if (!p2p.isLocalPublished()) return;
          try {
            const status = await p2p.getRoomStatus();
            if (status && status.opponent_joined && !p2p.isP2PConnected()) {
              await p2p.createOffer();
              if (competitorWatcher) { clearInterval(competitorWatcher); competitorWatcher = null; }
            }
          } catch (e) { /* transient presence read — next tick retries */ }
        }, 2000);
      }

      function initCompetitorCompositor() {
        const canvas = document.getElementById('compositeCanvas');
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        compositor = new window.VideoCompositor({
          competitionId: Number(competitionId),
          localVideo: localVideo,
          remoteVideo: remoteVideo,
          canvas: canvas,
          chunkDuration: 10000,
          serverUrl: streamServerUrl,
          platformName: tr.app_title,
          rtl: isRTL,
          // R4-LIVE-ENTRY-RECOVERY-1: wire lease (fixes F divergence — lease off on comp page)
          lease: (window.PlatformRecordingLease
              ? new window.PlatformRecordingLease(Number(competitionId))
              : undefined),
          onLeaseLost: function(info) {
            // A28-LEASE: a clean end/release is NOT a takeover — the recorder
            // may still be flushing its authorized tail. Only a real
            // takeover/unverified loss aborts the recorder once.
            const reason = info && info.reason;
            if (reason === 'ended' || reason === 'released') {
              log('Recording ended - final tail continuing to drain', 'warn');
              return;
            }
            log(reason === 'unverified'
              ? 'Recording stopped - recorder ownership could not be verified'
              : 'Recording stopped - another session took over', 'error');
            if (compositor && compositor.abortOnLeaseLost) {
              compositor.abortOnLeaseLost();
            }
          },
          onChunkUploaded: function() { /* diagnostics removed from the UI */ },
          onRecordingStarted: function() {
            competitorStartTime = Date.now();
          },
          onRecordingStopped: function() {},
          onError: function(error) {
            log('Compositor error: ' + (error && error.message ? error.message : error), 'error');
          }
        });
        compositor.startCompositing();
      }

      function waitCompetitorMediaReady(localVideo, remoteVideo) {
        const deadline = Date.now() + 10000;
        return new Promise(function(resolve) {
          (function check() {
            const localOk = localVideo && localVideo.readyState >= 2;
            const remoteOk = remoteVideo && remoteVideo.readyState >= 2;
            if ((localOk && remoteOk) || Date.now() > deadline) return resolve();
            setTimeout(check, 500);
          })();
        });
      }

      // R4-LIVE-ENTRY-RECOVERY-REM1: preview-source bookkeeping. A source tag
      // records where a track came from; the competition state never decides a
      // source, and none of these helpers creates an RTCRtpSender.
      function tagTrackSource(track, source) {
        try { if (track) track.__dueliSource = source; } catch (e) { /* frozen track */ }
      }
      function trackSource(track) {
        try { return (track && track.__dueliSource) ? track.__dueliSource : null; } catch (e) { return null; }
      }
      function currentPreviewStream() {
        return p2p ? p2p.getLocalStream() : null;
      }
      function ensurePreviewStream() {
        let stream = currentPreviewStream();
        if (!stream) {
          stream = new MediaStream();
          if (p2p) p2p.setLocalPreviewStream(stream, { stopPrevious: false, source: 'none' });
        }
        return stream;
      }
      function removePreviewTracks(predicate) {
        const stream = currentPreviewStream();
        if (!stream) return;
        stream.getTracks().slice().forEach(function(track) {
          if (!predicate(track)) return;
          if (typeof stream.removeTrack === 'function') stream.removeTrack(track);
          try { track.stop(); } catch (e) { /* already ended */ }
        });
      }
      function attachPreviewTrackEvents(track) {
        if (!track || track.__dueliEndBound === '1') return;
        try { track.__dueliEndBound = '1'; } catch (e) { /* frozen track */ }
        if (track.kind !== 'video') return;
        track.onended = function() {
          // Device revocation or the browser's own "Stop sharing" button.
          // Never publishes and never silently re-acquires: only the preview
          // and the honest state line change.
          if (trackSource(track) === 'screen' && isScreenSharing) {
            stopScreenShare('ended');
          } else {
            paintCompetitorControls();
          }
        };
      }
      // After explicit publish only: same-kind source swaps use replaceTrack
      // (no renegotiation); a NEW sender kind triggers one renegotiation.
      async function syncPublishedTrack(kind, track) {
        if (!p2p || !p2p.isLocalPublished()) return;
        try {
          const mode = await p2p.setPublishedTrack(kind, track);
          if (mode === 'added') await p2p.negotiateMediaChange();
        } catch (err) {
          log('Published track update failed: ' + (err && err.message ? err.message : err), 'error');
        }
      }
      function supportsScreenShare() {
        return !!(navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function');
      }
      async function acquireCameraVideo() {
        try {
          const got = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode } });
          if (terminalTeardownStarted) {
            got.getTracks().forEach(function(t) { try { t.stop(); } catch (e) {} });
            return null;
          }
          const track = got.getVideoTracks()[0];
          if (!track) throw new Error('no video track');
          tagTrackSource(track, 'camera');
          const stream = ensurePreviewStream();
          if (typeof stream.addTrack === 'function') stream.addTrack(track);
          const localVideo = document.getElementById('localVideo');
          if (localVideo) localVideo.srcObject = stream;
          attachPreviewTrackEvents(track);
          localMediaAvailable = true;
          videoMuted = false;
          return track;
        } catch (err) {
          log('Camera unavailable: ' + (err && err.message ? err.message : err), 'warn');
          showToast(tr.camera_error, 'error');
          return null;
        }
      }
      async function acquireMicAudio() {
        try {
          const got = await navigator.mediaDevices.getUserMedia({ audio: true });
          if (terminalTeardownStarted) {
            got.getTracks().forEach(function(t) { try { t.stop(); } catch (e) {} });
            return null;
          }
          const track = got.getAudioTracks()[0];
          if (!track) throw new Error('no audio track');
          tagTrackSource(track, 'mic');
          const stream = ensurePreviewStream();
          if (typeof stream.addTrack === 'function') stream.addTrack(track);
          attachPreviewTrackEvents(track);
          localMediaAvailable = true;
          audioMuted = false;
          return track;
        } catch (err) {
          log('Microphone unavailable: ' + (err && err.message ? err.message : err), 'warn');
          showToast(tr.camera_error, 'error');
          return null;
        }
      }
      // Stop screen sharing (button, browser "Stop sharing", or source switch).
      // Restores a camera preview only when a camera was prepared before the
      // share; otherwise the video source is released. After explicit publish
      // the sibling sender is updated (replaceTrack/detach) — a stopped source
      // is never left behind a hidden sender.
      async function stopScreenShare(reason) {
        if (!isScreenSharing) return;
        isScreenSharing = false;
        const stream = currentPreviewStream();
        const hadScreenAudio = !!(stream && stream.getTracks().some(function(t) {
          return t.kind === 'audio' && trackSource(t) === 'screen';
        }));
        removePreviewTracks(function(track) {
          return trackSource(track) === 'screen' || track.kind === 'video';
        });
        let restored = null;
        if (hadCameraBeforeScreen && !terminalTeardownStarted) {
          try {
            const got = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode } });
            if (terminalTeardownStarted) {
              got.getTracks().forEach(function(t) { try { t.stop(); } catch (e) {} });
              restored = null;
            } else {
              restored = got.getVideoTracks()[0];
              tagTrackSource(restored, 'camera');
            }
          } catch (err) { restored = null; }
        }
        hadCameraBeforeScreen = false;
        if (restored) {
          const preview = ensurePreviewStream();
          if (typeof preview.addTrack === 'function') preview.addTrack(restored);
          attachPreviewTrackEvents(restored);
        }
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = currentPreviewStream();
        if (p2p && p2p.isLocalPublished()) {
          await syncPublishedTrack('video', restored);
          if (hadScreenAudio) await syncPublishedTrack('audio', localTrackOf('audio'));
        }
        if (reason !== 'switch-camera') showToast(tr.screen_share_stopped, 'info');
        paintCompetitorControls();
      }
      window.stopScreenShare = stopScreenShare;

      async function initCompetitorStream() {
        if (competitorStarted || terminalTeardownStarted) return;
        competitorStarted = true;
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        const waitingOverlay = document.getElementById('waitingOverlay');
        if (!localVideo || !remoteVideo || !window.P2PConnection) {
          log('Competitor stream unavailable (missing media/bundle)', 'error');
          return;
        }
        setupCompetitorStage();
        const me = window.currentUser.id;
        userRole = (me === competitionData.creator_id) ? 'host' : 'opponent';

        if (userRole === 'host') {
          const created = await withCompetitorRetry('room/create', async function() {
            const res = await fetch('/api/signaling/room/create', {
              method: 'POST',
              headers: competitorAuthHeaders(),
              body: JSON.stringify({ competition_id: Number(competitionId) })
            });
            const data = await res.json().catch(function() { return null; });
            return (res.ok && data && data.success) ? data : false;
          });
          // The competition may end while room/create is in flight.
          if (terminalTeardownStarted) return;
          if (created === false) {
            showToast(tr.live_signaling.room_create_failed, 'error');
            return;
          }
        }

        p2p = new window.P2PConnection({
          roomId: 'comp_' + competitionId,
          role: userRole,
          userId: me,
          onRemoteStream: function(stream) {
            remoteVideo.srcObject = stream;
            if (waitingOverlay) waitingOverlay.classList.add('hidden');
            maybeStartRecording();
          },
          onConnectionStateChange: function(state) {
            updateCompetitorStatus(state);
          },
          onError: function(error) {
            log('P2P error: ' + (error && error.message ? error.message : error), 'error');
          },
          onReconnectNeeded: function() {
            if (userRole === 'host') watchCompetitorOpponent();
          }
        });

        // Keep the session captured locally: terminal teardown may null the
        // page-level reference while an await is in flight.
        const session = p2p;
        await session.initialize();
        if (terminalTeardownStarted) {
          try { await session.disconnect(); } catch (e) { /* best effort */ }
          if (p2p === session) p2p = null;
          return;
        }
        const joined = await withCompetitorRetry('session/join', function() { return session.joinRoom(); });
        if (terminalTeardownStarted) {
          try { await session.disconnect(); } catch (e) { /* best effort */ }
          if (p2p === session) p2p = null;
          return;
        }
        if (joined === false) {
          showToast(tr.live_signaling.session_join_failed, 'error');
          return;
        }

        // Prep media is offered, never required: a denied camera/mic keeps the
        // signaling session alive, leaves every tool usable and lets the party
        // prepare a screen source instead. Acquiring here creates NO sender.
        try {
          const preview = await session.initLocalStream();
          if (terminalTeardownStarted) {
            try { await session.disconnect(); } catch (e) { /* best effort */ }
            if (p2p === session) p2p = null;
            return;
          }
          localVideo.srcObject = preview;
          preview.getTracks().forEach(function(track) {
            tagTrackSource(track, track.kind === 'audio' ? 'mic' : 'camera');
            attachPreviewTrackEvents(track);
          });
          localMediaAvailable = true;
        } catch (err) {
          localMediaAvailable = false;
          log('Camera/mic unavailable — a screen source can still be prepared', 'warn');
        }
        prepReady = true;

        if (terminalTeardownStarted) return;
        if (userRole === 'host') {
          initCompetitorCompositor();
        }

        try {
          const status = await session.getRoomStatus();
          if (terminalTeardownStarted) return;
          if (status && userRole === 'opponent' && status.host_joined) {
            log('Host already in room. Waiting for offer...', 'info');
          }
        } catch (e) { /* presence read is best-effort; watcher covers it */ }

        if (terminalTeardownStarted) return;
        paintCompetitorControls();

        if (userRole === 'host') {
          watchCompetitorOpponent();
        }
      }
      
      // R4-LIVE-ENTRY-RECOVERY-REM1: explicit publish consent gate. Nothing
      // here runs from acquisition, invite acceptance, LIVE state or refresh —
      // only this handler attaches local tracks to the peer connection.
      async function publishMedia() {
        if (!p2p || mediaPublished) return;
        const stream = p2p.getLocalStream();
        const hasTracks = !!(stream && stream.getTracks().length > 0);
        if (!hasTracks) {
          // Honest refusal: there is nothing to publish yet.
          showToast(tr.nothing_to_publish, 'error');
          setPublishState(tr.media_none);
          return;
        }
        const publishBtn = document.getElementById('publishBtn');
        if (publishBtn) {
          publishBtn.disabled = true;
          setPublishState(tr.prep_publishing);
        }
        try {
          const ok = p2p.publishLocalStream();
          if (!ok) throw new Error('publishLocalStream returned false');
          mediaPublished = true;
          log('Local media published after explicit consent', 'success');
          showToast(tr.prep_published, 'success');
          if (userRole === 'host') {
            const status = await p2p.getRoomStatus().catch(function() { return null; });
            if (status && status.opponent_joined && !p2p.isP2PConnected()) {
              log('Opponent present — creating offer', 'info');
              await p2p.createOffer();
            }
            watchCompetitorOpponent();
            maybeStartRecording();
          } else {
            await p2p.requestReoffer();
            showToast(tr.prep_waiting_guest, 'info');
          }
        } catch (err) {
          log('Publish failed: ' + (err && err.message ? err.message : err), 'error');
          showToast(tr.camera_error, 'error');
        } finally {
          if (publishBtn) publishBtn.disabled = false;
          paintCompetitorControls();
        }
      }
      window.publishMedia = publishMedia;
      
      // Recording stays host-only AND requires both the explicit publish and
      // the competition actually being LIVE. LIVE alone never records (there
      // would be no local media), and publish alone never records a prep call.
      function maybeStartRecording() {
        if (userRole !== 'host' || !p2p || !compositor) return;
        if (!p2p.isLocalPublished()) return;
        if (!competitionData || competitionData.status !== 'live') return;
        if (compositor.getStats().isRecording) return;
        waitCompetitorMediaReady(document.getElementById('localVideo'), document.getElementById('remoteVideo')).then(function() {
          if (compositor && !compositor.getStats().isRecording && p2p && p2p.isLocalPublished()
              && competitionData && competitionData.status === 'live') {
            log('Starting recording', 'info');
            compositor.startRecording();
          }
        });
      }
      
      // ========== R4-LIVE-ENTRY-RECOVERY-REM1: stage + tools ==========
      // Icon-only 40px tools in the mandatory reference palette; every state
      // change reads real tracks/senders — never the competition status.
      function resetPipPosition() {
        ['localVideoWrapper', 'remoteVideoWrapper'].forEach(function(id) {
          const el = document.getElementById(id);
          if (!el) return;
          el.style.left = '';
          el.style.top = '';
          el.style.insetInlineEnd = '';
        });
      }
      function paintFullscreenChrome() {
        const btn = document.getElementById('fullscreenBtn');
        if (!btn) return;
        const full = !!document.fullscreenElement;
        const label = full ? (tr.exit_fullscreen || tr.fullscreen) : tr.fullscreen;
        btn.innerHTML = full
          ? '<i class="fas fa-compress" aria-hidden="true"></i>'
          : '<i class="fas fa-expand" aria-hidden="true"></i>';
        btn.setAttribute('aria-label', label);
        btn.setAttribute('title', label);
      }
      window.toggleFullscreen = function() {
        const stage = document.getElementById('competitorView');
        if (!stage) return;
        if (!document.fullscreenElement) {
          const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
          if (req) { try { req.call(stage); } catch (e) { /* denied */ } }
        } else if (document.exitFullscreen) {
          document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
          document.webkitExitFullscreen();
        }
        isFullscreen = !!document.fullscreenElement;
        paintFullscreenChrome();
      };
      
      // Swap large/small by moving CSS roles between the SAME two video
      // elements — the stage never gains a third video.
      window.swapVideos = function() {
        if (!document.getElementById('competitorView')) return;
        videosSwapped = !videosSwapped;
        resetPipPosition();
        applyStageVisibility();
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
        applyStageVisibility();
        paintCompetitorControls();
      };
      
      // Front/back switch never touches the microphone and never publishes:
      // the same kind keeps the existing sender (replaceTrack, no renegotiation).
      window.switchCamera = async function() {
        if (userRole === 'viewer' || !p2p || isScreenSharing) return;
        currentFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        try {
          const got = await navigator.mediaDevices.getUserMedia({ video: { facingMode: currentFacingMode } });
          if (terminalTeardownStarted) {
            got.getTracks().forEach(function(t) { try { t.stop(); } catch (e) {} });
            return;
          }
          const track = got.getVideoTracks()[0];
          if (!track) throw new Error('no video track');
          tagTrackSource(track, 'camera');
          const stream = ensurePreviewStream();
          stream.getTracks().slice().forEach(function(t) {
            if (t.kind === 'video') {
              if (typeof stream.removeTrack === 'function') stream.removeTrack(t);
              try { t.stop(); } catch (e) { /* already ended */ }
            }
          });
          if (typeof stream.addTrack === 'function') stream.addTrack(track);
          const localVideo = document.getElementById('localVideo');
          if (localVideo) localVideo.srcObject = stream;
          attachPreviewTrackEvents(track);
          localMediaAvailable = true;
          videoMuted = false;
          await syncPublishedTrack('video', track);
          paintCompetitorControls();
        } catch (err) {
          log('Camera switch failed: ' + (err && err.message ? err.message : err), 'error');
        }
      };
      
      // Screen-source selection is available during PREPARATION: it never
      // requires the camera/mic and never publishes by itself. Screen audio is
      // used when the browser offers it. Stopping a share restores the camera
      // preview only when a camera was prepared before, and updates the
      // sibling sender after explicit publish — a stopped source is never
      // left behind an active sender.
      window.shareScreen = async function() {
        if (!p2p) return;
        if (isScreenSharing) { await stopScreenShare('toggle'); return; }
        if (!supportsScreenShare()) {
          showToast(tr.camera_error, 'error');
          return;
        }
        let screenStream = null;
        try {
          screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: true });
        } catch (err) {
          const cancelled = err && (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError');
          if (cancelled) { log('Screen share cancelled', 'warn'); return; }
          try {
            screenStream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: false });
          } catch (err2) {
            log('Screen share failed: ' + (err2 && err2.message ? err2.message : err2), 'error');
            return;
          }
        }
        if (terminalTeardownStarted) {
          screenStream.getTracks().forEach(function(t) { try { t.stop(); } catch (e) {} });
          return;
        }
        const screenVideo = screenStream.getVideoTracks()[0];
        if (!screenVideo) { log('Screen share failed: no video track', 'error'); return; }
        const screenAudio = screenStream.getAudioTracks()[0] || null;
        tagTrackSource(screenVideo, 'screen');
        if (screenAudio) tagTrackSource(screenAudio, 'screen');

        // The camera is released while the screen is the video source (same
        // as the reference test surface). The microphone keeps the audio slot
        // unless the screen shares its own audio, which then takes it.
        const prev = currentPreviewStream();
        hadCameraBeforeScreen = !!(prev && prev.getTracks().some(function(t) { return t.kind === 'video'; }));
        if (prev) {
          prev.getTracks().slice().forEach(function(t) {
            if (t.kind === 'video' || (screenAudio && t.kind === 'audio')) {
              if (typeof prev.removeTrack === 'function') prev.removeTrack(t);
              try { t.stop(); } catch (e) { /* already ended */ }
            }
          });
        }
        const stream = ensurePreviewStream();
        if (typeof stream.addTrack === 'function') stream.addTrack(screenVideo);
        if (screenAudio && typeof stream.addTrack === 'function') stream.addTrack(screenAudio);
        p2p.setLocalPreviewStream(stream, { stopPrevious: false, source: 'screen' });
        const localVideo = document.getElementById('localVideo');
        if (localVideo) localVideo.srcObject = stream;
        attachPreviewTrackEvents(screenVideo);
        isScreenSharing = true;
        screenVideo.onended = function() { if (isScreenSharing) stopScreenShare('ended'); };
        if (p2p.isLocalPublished()) {
          await syncPublishedTrack('video', screenVideo);
          if (screenAudio) await syncPublishedTrack('audio', screenAudio);
        }
        paintCompetitorControls();
      };
      
      // Mic/camera toggles ACQUIRE the device when it was never granted and
      // toggle the live track otherwise — during preparation or after consent.
      // Neither ever publishes.
      window.toggleAudio = async function() {
        if (!p2p) return;
        let track = localTrackOf('audio');
        if (!track) {
          track = await acquireMicAudio();
          if (!track) return;
        } else {
          track.enabled = !track.enabled;
          audioMuted = !track.enabled;
        }
        await syncPublishedTrack('audio', track);
        paintCompetitorControls();
      };
      
      window.toggleVideo = async function() {
        if (!p2p) return;
        if (isScreenSharing) {
          await stopScreenShare('switch-camera');
          if (!localTrackOf('video')) await acquireCameraVideo();
        } else if (localTrackOf('video')) {
          const track = localTrackOf('video');
          track.enabled = !track.enabled;
          videoMuted = !track.enabled;
        } else {
          await acquireCameraVideo();
        }
        await syncPublishedTrack('video', localTrackOf('video'));
        paintCompetitorControls();
      };
      
      window.toggleSpeaker = function() {
        speakerMuted = !speakerMuted;
        const remoteVideo = document.getElementById('remoteVideo');
        if (remoteVideo) remoteVideo.muted = speakerMuted;
        paintCompetitorControls();
      };
      
      window.toggleExpandStage = function() {
        stageExpanded = !stageExpanded;
        applyStageVisibility();
      };
      
      // ========== end ==========
      // Voluntary leave-and-return is deliberately gone (owner decision):
      // the only terminal action is the existing End button. Navigation gets
      // a browser warning while live, but never ends/finalizes the competition.
      window.endStream = async function() {
        // The end button only renders while LIVE; this guard keeps the handler
        // honest for any race (a non-live end would orphan the state).
        if (!competitionData || competitionData.status !== 'live') return;
        if (!confirm(tr.end_competition_confirm || tr.end_stream_confirm)) return;

        log('Ending stream...', 'info');

        // The official transition must not wait for recorder drain: start the
        // request immediately, then apply the authoritative completed state.
        // Recorder stop/drain runs once in beginTerminalTeardown (bounded).
        let ended = false;
        let endedAt = null;
        try {
          const endRes = await fetch('/api/competitions/' + competitionId + '/end', {
            method: 'POST',
            headers: competitorAuthHeaders(),
            body: JSON.stringify({})
          });
          const endData = await endRes.json().catch(function() { return null; });
          if (endRes.ok && endData && endData.success !== false) {
            ended = true;
            endedAt = (endData.data && endData.data.ended_at) || null;
          } else {
            log('Warning: ' + ((endData && endData.error) || 'Could not update status'), 'warn');
          }
        } catch (err) {
          log('End stream error: ' + (err && err.message ? err.message : err), 'error');
        }

        if (ended) {
          // No reload: the same page becomes the recording viewer. Track
          // release, timer cleanup and recorder drain are single-shot.
          applyCompetitionState({ status: 'completed', ended_at: endedAt });
          showToast(tr.status_completed, 'success');
        }
        // Network/response failure may still hide a committed server end;
        // the bounded GET resync is the authority, never a local guess.
        scheduleStatusResync(0);
      };
      
      // Navigation away never ends the competition and never finalizes a
      // recording: subscriptions close by themselves, an explicit endStream
      // is the only end path, and refresh re-enters preparation (never
      // publishes). The browser prompt is a warning, not a navigation trap.
      window.addEventListener('beforeunload', function(ev) {
        if (!competitionData || competitionData.status !== 'live' || !mediaPublished) return;
        ev.preventDefault();
        ev.returnValue = '';
      });
      window.addEventListener('pagehide', function() {
        try { if (competitionStatusES) competitionStatusES.close(); } catch (e) {}
        try { if (commentsLiveES) commentsLiveES.close(); } catch (e) {}
        try { if (ratingsLiveES) ratingsLiveES.close(); } catch (e) {}
      });
      
      // Check if competition needs embedded viewer and start it
      function checkAndInitStream() {
        if (!competitionData) return;
        const status = competitionData.status;
        const streamStatus = competitionData.stream_status;
        
        // R4-COMP-UNIFIED-1: competitors run the in-page live flow below
        // (same bundle classes as /live/:id — no parallel system). Viewers
        // (anyone else) use the embedded chunk player. Single decision point:
        // window.resolveVideoSurface (bundle) over server-derived inputs.
        const surface = window.resolveVideoSurface
          ? window.resolveVideoSurface(competitionData, window.currentUser && window.currentUser.id)
          : 'embedded';
        if (surface === 'competitor') {
          initCompetitorStream();
          return;
        }
        
        // Completed competitors are viewers of their own recording; the
        // single resolveVideoSurface decision already returned 'embedded'.
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
