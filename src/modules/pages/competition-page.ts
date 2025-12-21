/**
 * Competition Detail Page
 * صفحة تفاصيل المنافسة
 */

import type { Context } from 'hono';
import type { Bindings, Variables } from '../../config/types';
import { translations, getUILanguage, isRTL, getCategoryName } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

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
    
    <!-- HLS.js for viewer mode -->
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    
    <script>
      const lang = '${lang}';
      const isRTL = ${rtl};
      const competitionId = '${id}';
      const tr = ${JSON.stringify(tr)};
      let competitionData = null;
      
      // Client-side getCategoryName function
      function getCategoryName(category, language) {
        // 1. Try category_slug as translation key (convert 'current-affairs' to 'current_affairs')
        const slug = category.category_slug || category.slug;
        if (slug) {
          const slugKey = slug.replace(/-/g, '_');
          if (tr[slugKey]) return tr[slugKey];
        }
        
        // 2. Fallback to category_name based on language
        const langKey = language === 'ar' ? 'category_name_ar' : 'category_name_en';
        if (category[langKey]) return category[langKey];
        
        // 3. Fallback to name based on language
        const nameKey = language === 'ar' ? 'name_ar' : 'name_en';
        if (category[nameKey]) return category[nameKey];
        
        // 4. Fallback to English
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
        } catch (err) {
          console.error(err);
        }
      }
      
      function renderCompetition(comp) {
        const isLive = comp.status === 'live';
        const isPending = comp.status === 'pending';
        const isCreator = window.currentUser && window.currentUser.id === comp.creator_id;
        const isOpponent = window.currentUser && window.currentUser.id === comp.opponent_id;
        const hasRequested = comp.requests?.some(r => r.requester_id === window.currentUser?.id && r.status === 'pending');
        const needsOpponent = isPending && !comp.opponent_id;
        
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
                    'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold'
                  } flex items-center gap-1">
                    \${isLive ? '<span class="w-1.5 h-1.5 rounded-full bg-red-500 live-pulse"></span>' : ''}
                    \${isLive ? tr.status_live : isPending ? tr.status_pending : tr.status_completed}
                  </span>
                  <span class="text-sm text-gray-500">
                    <i class="\${comp.category_icon} mr-1"></i>
                    \${getCategoryName(comp, lang)}
                  </span>
                </div>
                <h1 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">\${comp.title}</h1>
              </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div class="lg:col-span-2 space-y-6">
                <div class="bg-gradient-to-br \${bgColor} rounded-2xl overflow-hidden shadow-xl aspect-video flex items-center justify-center relative">
                  \${isLive && comp.live_url ? \`
                    <!-- Embedded P2P Live Stream -->
                    <div id="embeddedLiveStream" class="absolute inset-0">
                      <!-- Remote Video (fullscreen background) -->
                      <video id="remoteVideo" class="w-full h-full object-cover" autoplay playsinline></video>
                      
                      <!-- Waiting Overlay -->
                      <div id="waitingOverlay" class="absolute inset-0 flex items-center justify-center bg-gray-900/80">
                        <div class="text-center text-white">
                          <i class="fas fa-spinner fa-spin text-4xl mb-4"></i>
                          <p class="text-lg">\${tr.waiting_opponent || 'Connecting...'}</p>
                        </div>
                      </div>
                      
                      <!-- Local Video (small in corner) -->
                      <div id="localVideoWrapper" class="absolute \${isRTL ? 'left-4' : 'right-4'} top-4 z-20">
                        <div class="relative w-24 h-16 md:w-32 md:h-24 rounded-xl overflow-hidden shadow-2xl border-2 border-purple-500 cursor-pointer hover:scale-105 transition-transform" onclick="swapVideos()">
                          <video id="localVideo" class="w-full h-full object-cover" autoplay muted playsinline></video>
                          <div class="absolute top-1 \${isRTL ? 'left-1' : 'right-1'} bg-black/60 p-1 rounded text-white text-xs">
                            <i class="fas fa-arrows-alt"></i>
                          </div>
                        </div>
                      </div>
                      
                      <!-- Stream Controls (overlay at bottom) -->
                      <div id="streamControls" class="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent z-30">
                        <div class="flex items-center justify-center gap-2 flex-wrap">
                          <!-- Fullscreen -->
                          <button onclick="toggleFullscreen()" id="fullscreenBtn" class="p-2 rounded-lg bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors" title="\${tr.fullscreen || 'Fullscreen'}">
                            <i class="fas fa-expand"></i>
                          </button>
                          
                          <!-- Swap Videos -->
                          <button onclick="swapVideos()" id="swapBtn" class="p-2 rounded-lg bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors" title="\${tr.swap_videos || 'Swap'}">
                            <i class="fas fa-exchange-alt"></i>
                          </button>
                          
                          <!-- Comments Toggle -->
                          <button onclick="toggleComments()" id="commentsBtn" class="p-2 rounded-lg bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors" title="\${tr.toggle_comments || 'Comments'}">
                            <i class="fas fa-comment"></i>
                          </button>
                          
                          <!-- Competitor-only controls -->
                          <div id="competitorControls" class="flex items-center gap-2">
                            <!-- Hide Local Video -->
                            <button onclick="toggleLocalVideo()" id="localVideoBtn" class="p-2 rounded-lg bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors" title="\${tr.toggle_my_video || 'My Video'}">
                              <i class="fas fa-user-circle"></i>
                            </button>
                            
                            <!-- Switch Camera -->
                            <button onclick="switchCamera()" id="switchCamBtn" class="p-2 rounded-lg bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors" title="\${tr.switch_camera || 'Switch Camera'}">
                              <i class="fas fa-sync-alt"></i>
                            </button>
                            
                            <!-- Screen Share -->
                            <button onclick="shareScreen()" id="screenBtn" class="p-2 rounded-lg bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors" title="\${tr.share_screen || 'Screen Share'}">
                              <i class="fas fa-desktop"></i>
                            </button>
                            
                            <!-- Microphone -->
                            <button onclick="toggleAudio()" id="audioBtn" class="p-2 rounded-lg bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors" title="\${tr.toggle_mic || 'Microphone'}">
                              <i class="fas fa-microphone"></i>
                            </button>
                            
                            <!-- Camera -->
                            <button onclick="toggleVideo()" id="videoBtn" class="p-2 rounded-lg bg-white/20 backdrop-blur text-white hover:bg-white/30 transition-colors" title="\${tr.toggle_camera || 'Camera'}">
                              <i class="fas fa-video"></i>
                            </button>
                            
                            <!-- End Stream -->
                            <button onclick="endStream()" id="endBtn" class="px-3 py-2 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors flex items-center gap-1" title="\${tr.end_stream || 'End'}">
                              <i class="fas fa-stop-circle"></i>
                            </button>
                          </div>
                        </div>
                      </div>
                      
                      <!-- Comments Overlay (from viewers) -->
                      <div id="commentsOverlay" class="absolute bottom-20 left-4 z-20 max-w-sm max-h-32 overflow-hidden pointer-events-none">
                        <div id="commentsContainer" class="space-y-1 overflow-y-auto text-sm">
                          <!-- Comments will appear here -->
                        </div>
                      </div>
                      
                      <!-- Connection Status -->
                      <div id="connectionStatus" class="absolute top-4 \${isRTL ? 'right-4' : 'left-4'} px-3 py-1 rounded-full text-sm hidden z-30 bg-yellow-600 text-white">
                        <i class="fas fa-wifi mr-2"></i>
                        <span>Connecting...</span>
                      </div>
                      
                      <!-- Canvas for recording (hidden) -->
                      <canvas id="compositeCanvas" class="hidden" width="1280" height="720"></canvas>
                    </div>
                  \` : comp.youtube_live_id && isLive ? \`
                    <iframe width="100%" height="100%" src="https://www.youtube.com/embed/\${comp.youtube_live_id}?autoplay=1" frameborder="0" allowfullscreen class="absolute inset-0"></iframe>
                  \` : comp.vod_url ? \`
                    <!-- P2P VOD Player -->
                    <video id="vodPlayer" controls class="absolute inset-0 w-full h-full" poster="">
                      <source src="\${comp.vod_url}" type="video/mp4">
                    </video>
                  \` : comp.youtube_video_url ? \`
                    <iframe width="100%" height="100%" src="https://www.youtube.com/embed/\${comp.youtube_video_url.split('v=')[1] || comp.youtube_video_url}" frameborder="0" allowfullscreen class="absolute inset-0"></iframe>
                  \` : (isCreator || isOpponent) && comp.opponent_id && (isPending || comp.status === 'accepted') ? \`
                    <!-- Ready to Go Live -->
                    <div class="text-center text-white">
                      <i class="fas fa-video text-6xl opacity-80 mb-4"></i>
                      <p class="mb-4">\${tr.competitors} \${tr.status_accepted}</p>
                      <button onclick="goLive()" class="px-6 py-3 bg-green-600 rounded-full font-bold hover:bg-green-700 transition-all inline-flex items-center gap-2">
                        <i class="fas fa-broadcast-tower"></i>
                        \${tr.status_live || 'Go Live'}
                      </button>
                    </div>
                  \` : \`
                    <div class="text-center text-white">
                      <i class="fas fa-video text-6xl opacity-50 mb-4"></i>
                      <p>\${isPending ? tr.status_pending : tr.stream_not_available}</p>
                    </div>
                  \`}
                </div>
                
                <div class="card p-6">
                  <h3 class="font-bold text-lg mb-4 text-gray-900 dark:text-white">\${tr.competitors}</h3>
                  <div class="grid grid-cols-2 gap-6">
                    <div class="text-center">
                      <img src="\${comp.creator_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + comp.creator_name}" class="w-20 h-20 rounded-full mx-auto mb-3 border-4 border-purple-200 dark:border-purple-800">
                      <h4 class="font-bold text-gray-900 dark:text-white">\${comp.creator_name}</h4>
                      <p class="text-sm text-gray-500">@\${comp.creator_username}</p>
                    </div>
                    
                    <div class="text-center">
                      \${comp.opponent_id ? \`
                        <img src="\${comp.opponent_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + comp.opponent_name}" class="w-20 h-20 rounded-full mx-auto mb-3 border-4 border-amber-200 dark:border-amber-800">
                        <h4 class="font-bold text-gray-900 dark:text-white">\${comp.opponent_name}</h4>
                        <p class="text-sm text-gray-500">@\${comp.opponent_username}</p>
                      \` : \`
                        <div class="w-20 h-20 rounded-full mx-auto mb-3 bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-4 border-dashed border-gray-300 dark:border-gray-600">
                          <i class="fas fa-question text-3xl text-gray-400"></i>
                        </div>
                        <h4 class="font-bold text-gray-400">\${tr.awaiting_opponent}</h4>
                        \${window.currentUser && !isCreator && !hasRequested ? \`
                          <button onclick="requestJoin()" class="join-btn mt-3">
                            <i class="fas fa-hand-paper"></i>
                            \${tr.request_join}
                          </button>
                        \` : hasRequested ? \`
                          <button onclick="cancelRequest()" class="mt-3 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-sm font-bold hover:bg-gray-300 transition-all">
                            <i class="fas fa-times mr-1"></i>
                            \${tr.cancel_request}
                          </button>
                        \` : !window.currentUser ? \`
                          <button onclick="showLoginModal()" class="join-btn mt-3">
                            <i class="fas fa-sign-in-alt"></i>
                            \${tr.login_to_compete}
                          </button>
                        \` : ''}
                      \`}
                    </div>
                  </div>
                </div>
                
                <div class="card p-6">
                  <h3 class="font-bold text-lg mb-4 text-gray-900 dark:text-white">\${tr.competition_rules}</h3>
                  <pre class="whitespace-pre-wrap text-gray-600 dark:text-gray-300 text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">\${comp.rules}</pre>
                </div>
              </div>
              
              <div class="space-y-6">
                <div class="card p-6">
                  <div class="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p class="text-3xl font-bold text-purple-600">\${(comp.total_views || 0).toLocaleString()}</p>
                      <p class="text-sm text-gray-500">\${tr.viewers}</p>
                    </div>
                    <div>
                      <p class="text-3xl font-bold text-purple-600">\${comp.total_comments || 0}</p>
                      <p class="text-sm text-gray-500">\${tr.comments}</p>
                    </div>
                  </div>
                  
                  <!-- Interaction Buttons -->
                  <div class="flex gap-2 mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <button onclick="toggleLike()" id="likeBtn" 
                      class="flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 \${comp.user_liked ? 'bg-red-100 dark:bg-red-900/30 text-red-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-red-50 hover:text-red-500'}">
                      <i class="fas fa-heart"></i>
                      <span id="likeCount">\${comp.likes_count || 0}</span>
                    </button>
                    <button onclick="toggleReminder()" id="reminderBtn" 
                      class="flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 \${comp.user_reminded ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600' : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-amber-50 hover:text-amber-500'}">
                      <i class="fas fa-bell"></i>
                      \${comp.user_reminded ? tr.reminder_set || 'Reminder On' : tr.remind_me || 'Remind Me'}
                    </button>
                    <button onclick="showReportModal()" class="px-4 py-3 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all">
                      <i class="fas fa-flag"></i>
                    </button>
                  </div>
                </div>
                
                <div class="card overflow-hidden">
                  <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    <h3 class="font-bold text-gray-900 dark:text-white">\${tr.live_chat}</h3>
                  </div>
                  <div class="h-80 overflow-y-auto p-4 space-y-3" id="chatMessages">
                    \${comp.comments?.length ? comp.comments.map(cm => \`
                      <div class="flex gap-2 animate-fade-in">
                        <img src="\${cm.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + cm.username}" class="w-8 h-8 rounded-full">
                        <div>
                          <p class="text-sm"><span class="font-semibold text-purple-600">\${cm.display_name}</span></p>
                          <p class="text-sm text-gray-600 dark:text-gray-300">\${cm.content}</p>
                        </div>
                      </div>
                    \`).join('') : '<p class="text-center text-gray-400">' + tr.no_comments_yet + '</p>'}
                  </div>
                  <div class="p-4 border-t border-gray-200 dark:border-gray-700">
                    \${window.currentUser ? \`
                      <form onsubmit="sendComment(event)" class="flex gap-2">
                        <input type="text" id="commentInput" placeholder="\${tr.add_comment}..." class="flex-1 border dark:border-gray-600 dark:bg-gray-700 rounded-full px-4 py-2 text-sm">
                        <button type="submit" class="p-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors">
                          <i class="fas fa-paper-plane"></i>
                        </button>
                      </form>
                    \` : \`
                      <button onclick="showLoginModal()" class="w-full py-2 text-center text-purple-600 hover:underline text-sm font-medium">
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
        
        const streamServerUrl = 'https://maelsh.pro/ffmpeg';
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
            // Redirect to live room
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
      
      async function sendComment(e) {
        e.preventDefault();
        if (!window.currentUser) return;
        const input = document.getElementById('commentInput');
        const content = input.value.trim();
        if (!content) return;
        try {
          await fetch('/api/competitions/' + competitionId + '/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: window.currentUser.id,
              content: content,
              is_live: competitionData?.status === 'live'
            })
          });
          input.value = '';
          loadCompetition();
        } catch (err) { console.error(err); }
      }
      
      async function toggleLike() {
        if (!window.currentUser) { showLoginModal(); return; }
        const btn = document.getElementById('likeBtn');
        const countEl = document.getElementById('likeCount');
        const isLiked = btn.classList.contains('bg-red-100');
        
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/like', {
            method: isLiked ? 'DELETE' : 'POST',
            headers: {
              'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
              'Content-Type': 'application/json'
            }
          });
          
          if (res.ok) {
            const currentCount = parseInt(countEl.textContent) || 0;
            if (isLiked) {
              btn.classList.remove('bg-red-100', 'dark:bg-red-900/30', 'text-red-600');
              btn.classList.add('bg-gray-100', 'dark:bg-gray-800', 'text-gray-600');
              countEl.textContent = Math.max(0, currentCount - 1);
            } else {
              btn.classList.add('bg-red-100', 'dark:bg-red-900/30', 'text-red-600');
              btn.classList.remove('bg-gray-100', 'dark:bg-gray-800', 'text-gray-600');
              countEl.textContent = currentCount + 1;
            }
          }
        } catch (err) { console.error(err); }
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
      
      function showReportModal() {
        if (!window.currentUser) { showLoginModal(); return; }
        
        // Create report modal
        const modal = document.createElement('div');
        modal.id = 'reportModal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50';
        modal.innerHTML = \`
          <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl max-w-md w-full mx-4 p-6 transform animate-scale-up">
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-4">
              <i class="fas fa-flag text-red-500 \${isRTL ? 'ml-2' : 'mr-2'}"></i>
              \${tr.report || 'Report'}
            </h3>
            <div class="space-y-3 mb-6">
              <label class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                <input type="radio" name="reason" value="inappropriate" class="text-red-600">
                <span>\${tr.report_inappropriate || 'Inappropriate content'}</span>
              </label>
              <label class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                <input type="radio" name="reason" value="spam" class="text-red-600">
                <span>\${tr.report_spam || 'Spam or misleading'}</span>
              </label>
              <label class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                <input type="radio" name="reason" value="harassment" class="text-red-600">
                <span>\${tr.report_harassment || 'Harassment or bullying'}</span>
              </label>
              <label class="flex items-center gap-3 p-3 rounded-xl border border-gray-200 dark:border-gray-700 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800">
                <input type="radio" name="reason" value="other" class="text-red-600">
                <span>\${tr.other || 'Other'}</span>
              </label>
            </div>
            <div class="flex gap-3">
              <button onclick="closeReportModal()" class="flex-1 py-3 bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 rounded-xl font-semibold hover:bg-gray-200 transition-colors">
                \${tr.cancel || 'Cancel'}
              </button>
              <button onclick="submitReport()" class="flex-1 py-3 bg-red-600 text-white rounded-xl font-semibold hover:bg-red-700 transition-colors">
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
        
        try {
          const res = await fetch('/api/reports', {
            method: 'POST',
            headers: {
              'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              target_type: 'competition',
              target_id: competitionId,
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
      const streamServerUrl = 'https://maelsh.pro/ffmpeg';
      
      function log(msg, type = 'info') {
        console.log('[LiveStream]', type === 'error' ? '❌' : '📡', msg);
      }
      
      // Initialize embedded streaming when competition is live
      async function initEmbeddedStream() {
        const embeddedLiveStream = document.getElementById('embeddedLiveStream');
        if (!embeddedLiveStream || !window.currentUser) return;
        
        // Wait for streaming services
        try {
          await waitForBundle();
        } catch (err) {
          log('Bundle load failed: ' + err.message, 'error');
          return;
        }
        
        // Determine user role
        const userId = window.currentUser.id;
        const comp = competitionData;
        
        if (userId === comp.creator_id) {
          userRole = 'host';
        } else if (userId === comp.opponent_id) {
          userRole = 'opponent';
        } else {
          userRole = 'viewer';
        }
        
        log('User role: ' + userRole);
        setupViewerRestrictions();
        
        if (userRole === 'viewer') {
          initViewerMode();
        } else {
          initCompetitorMode();
        }
      }
      
      function waitForBundle() {
        return new Promise((resolve, reject) => {
          if (window.P2PConnection && window.VideoCompositor && window.ChunkUploader) {
            resolve();
            return;
          }
          let attempts = 0;
          const interval = setInterval(() => {
            attempts++;
            if (window.P2PConnection && window.VideoCompositor && window.ChunkUploader) {
              clearInterval(interval);
              resolve();
            } else if (attempts >= 100) {
              clearInterval(interval);
              reject(new Error('Streaming services not loaded'));
            }
          }, 100);
        });
      }
      
      function setupViewerRestrictions() {
        const competitorControls = document.getElementById('competitorControls');
        if (userRole === 'viewer' && competitorControls) {
          competitorControls.style.display = 'none';
        }
      }
      
      async function initViewerMode() {
        const hlsPlayer = document.getElementById('remoteVideo');
        const waitingOverlay = document.getElementById('waitingOverlay');
        const hlsUrl = streamServerUrl + '/storage/live/match_' + competitionId + '/playlist.m3u8';
        
        if (typeof Hls !== 'undefined' && Hls.isSupported()) {
          const hls = new Hls({ liveSyncDuration: 3, liveMaxLatencyDuration: 10 });
          hls.loadSource(hlsUrl);
          hls.attachMedia(hlsPlayer);
          hls.on(Hls.Events.MANIFEST_PARSED, () => {
            hlsPlayer.play().catch(() => {});
            if (waitingOverlay) waitingOverlay.classList.add('hidden');
          });
        } else if (hlsPlayer.canPlayType('application/vnd.apple.mpegurl')) {
          hlsPlayer.src = hlsUrl;
          hlsPlayer.addEventListener('loadedmetadata', () => {
            hlsPlayer.play().catch(() => {});
            if (waitingOverlay) waitingOverlay.classList.add('hidden');
          });
        }
      }
      
      async function initCompetitorMode() {
        const roomId = 'comp_' + competitionId;
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        const waitingOverlay = document.getElementById('waitingOverlay');
        
        log('Initializing competitor mode. Room: ' + roomId);
        
        // Create room if host
        if (userRole === 'host') {
          await fetch('/api/signaling/room/create', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              competition_id: competitionId,
              user_id: window.currentUser.id
            })
          });
        }
        
        // Initialize P2P
        p2p = new window.P2PConnection({
          roomId: roomId,
          role: userRole,
          userId: window.currentUser.id,
          onRemoteStream: (stream) => {
            log('Remote stream received');
            remoteVideo.srcObject = stream;
            if (waitingOverlay) waitingOverlay.classList.add('hidden');
            
            if (userRole === 'host' && compositor) {
              setTimeout(() => startRecording(), 1000);
            }
          },
          onConnectionStateChange: (state) => {
            log('Connection: ' + state);
            updateConnectionStatus(state);
          }
        });
        
        // Get local media
        try {
          const stream = await p2p.initLocalStream();
          localVideo.srcObject = stream;
          log('Local stream ready');
          
          // Initialize compositor for host
          if (userRole === 'host') {
            compositor = new window.VideoCompositor({
              localVideo: localVideo,
              remoteVideo: remoteVideo,
              canvas: document.getElementById('compositeCanvas'),
              onProgress: (chunks) => {
                if (document.getElementById('streamStats')) {
                  document.getElementById('streamStats').innerHTML = '<span class="text-green-400">' + chunks + ' chunks</span>';
                }
              }
            });
          }
          
          // Connect P2P
          await p2p.connect();
        } catch (err) {
          log('Failed: ' + err.message, 'error');
          alert(tr.camera_error || 'Camera access failed. Try screen share.');
        }
      }
      
      function startRecording() {
        if (!compositor || !p2p) return;
        log('Starting recording');
        compositor.startRecording();
      }
      
      function updateConnectionStatus(state) {
        const el = document.getElementById('connectionStatus');
        if (!el) return;
        el.classList.remove('hidden');
        el.className = 'absolute top-4 ' + (isRTL ? 'right-4' : 'left-4') + ' px-3 py-1 rounded-full text-sm z-30 text-white ' +
          (state === 'connected' ? 'bg-green-600' : state === 'failed' ? 'bg-red-600' : 'bg-yellow-600');
        el.innerHTML = '<i class="fas fa-wifi mr-2"></i>' + state;
        if (state === 'connected') setTimeout(() => el.classList.add('hidden'), 3000);
      }
      
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
          
          // Send finalize to server
          await fetch(streamServerUrl + '/finalize.php', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              competition_id: competitionId,
              user_id: window.currentUser.id
            })
          });
          
          // Update competition status
          await fetch('/api/competitions/' + competitionId, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
            },
            body: JSON.stringify({ status: 'completed' })
          });
          
          // Leave signaling room
          await fetch('/api/signaling/room/leave', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              competition_id: competitionId,
              user_id: window.currentUser.id
            })
          });
          
          alert(tr.stream_ended || 'Stream ended successfully');
          location.reload();
        } catch (err) {
          log('End stream error: ' + err.message, 'error');
        }
      };
      
      // Check if competition is live and initialize streaming
      // This runs after renderCompetition
      function checkAndInitStream() {
        if (competitionData && competitionData.status === 'live' && competitionData.live_url) {
          initEmbeddedStream();
        }
      }
      
      // Hook into renderCompetition
      const originalRenderCompetition = renderCompetition;
      renderCompetition = function(comp) {
        originalRenderCompetition(comp);
        setTimeout(checkAndInitStream, 100);
      };
    </script>
  `;

  return c.html(generateHTML(content, lang, tr.competitors));
}
