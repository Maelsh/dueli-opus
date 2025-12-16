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
                    <!-- P2P Live Stream - redirect to live room -->
                    <div class="text-center text-white">
                      <i class="fas fa-broadcast-tower text-6xl opacity-80 mb-4 animate-pulse"></i>
                      <p class="text-lg font-bold mb-4">\${tr.status_live}</p>
                      <a href="/live/\${comp.id}?lang=\${lang}" class="px-6 py-3 bg-red-600 rounded-full font-bold hover:bg-red-700 transition-all inline-flex items-center gap-2">
                        <i class="fas fa-play"></i>
                        \${tr.watch_competition}
                      </a>
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
    </script>
  `;

  return c.html(generateHTML(content, lang, tr.competitors));
}
