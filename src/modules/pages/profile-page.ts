/**
 * Profile Page
 * صفحة الملف الشخصي
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';
import { UserModel, SessionModel, CompetitionModel } from '../../models';

const profilePageRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Profile Page Handler
 */
export const profilePage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);
    const origin = new URL(c.req.url).origin;
    let username: string | undefined = c.req.param('username');

    let user: any = null;
    let competitions: any[] = [];
    let stats = { competitions: 0, followers: 0, following: 0, wins: 0 };
    let needsLogin = false;
    let userNotFound = false;

    // NOTE: no self-fetch here — Preview/Data locality: query D1 directly.
    // (fetch(`${origin}/api/users/...`) from inside the Worker causes
    // subrequest loops / missing auth on Preview.)
    try {
        const { DB } = c.env;
        const userModel = new UserModel(DB);

        // /profile (no username): resolve own profile from session
        if (!username) {
            const sessionId =
                c.req.header('Authorization')?.replace('Bearer ', '') ||
                c.req.query('token') ||
                getCookie(c, 'sessionId') ||
                getCookie(c, 'session_id');
            if (!sessionId) {
                needsLogin = true;
            } else {
                const sessionModel = new SessionModel(DB);
                const result = await sessionModel.findValidSession(sessionId);
                if (!result) {
                    needsLogin = true;
                } else {
                    username = result.user.username;
                }
            }
        }

        if (!needsLogin && username) {
            user = await userModel.findByUsername(username);
            if (!user) {
                userNotFound = true;
                console.error(`[Profile] user not found: username=${username} origin=${origin}`);
            } else {
                const competitionModel = new CompetitionModel(DB);
                const [followersRow, followingRow, userCompetitions] = await Promise.all([
                    DB.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').bind(user.id).first() as Promise<{ count: number } | null>,
                    DB.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').bind(user.id).first() as Promise<{ count: number } | null>,
                    competitionModel.findByUser(user.id, { limit: 10 }).catch(() => [] as any[])
                ]);
                competitions = Array.isArray(userCompetitions) ? userCompetitions : [];
                stats = {
                    competitions: (user as any).total_competitions || competitions.length || 0,
                    followers: followersRow?.count || 0,
                    following: followingRow?.count || 0,
                    wins: (user as any).total_wins || (user as any).wins || 0
                };
            }
        }
    } catch (err) {
        console.error(`[Profile] query failed: username=${username} origin=${origin}`, err);
        if (!user) userNotFound = !needsLogin;
    }

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}
        
        <div class="flex-1">
            <!-- Profile Header -->
            <div class="bg-gradient-to-br from-purple-600 via-indigo-600 to-purple-700 pb-24 pt-8">
                <div class="container mx-auto px-4">
                    ${user ? `
                        <div class="flex flex-col md:flex-row items-center gap-6 text-white">
                            <!-- Avatar -->
                            <div class="relative">
                                <img 
                                    src="${user.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user.username}`}" 
                                    alt="${user.display_name || user.username}"
                                    class="w-32 h-32 rounded-full border-4 border-white/30 shadow-xl"
                                >
                                ${user.is_verified ? `
                                    <div class="absolute bottom-2 right-2 w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center border-2 border-white">
                                        <i class="fas fa-check text-white text-sm"></i>
                                    </div>
                                ` : ''}
                            </div>
                            
                            <!-- Info -->
                            <div class="text-center md:${rtl ? 'text-right' : 'text-left'} flex-1">
                                <h1 class="text-3xl font-bold">${user.display_name || user.username}</h1>
                                <p class="text-white/70 text-lg">@${user.username}</p>
                                ${user.bio ? `<p class="mt-3 text-white/80 max-w-xl">${user.bio}</p>` : ''}
                                
                                <!-- Stats -->
                                <div class="flex ${rtl ? 'flex-row-reverse' : ''} gap-6 mt-4 justify-center md:justify-start">
                                    <div class="text-center">
                                        <span class="text-2xl font-bold">${stats.competitions}</span>
                                        <p class="text-white/60 text-sm">${tr.my_competitions || 'Competitions'}</p>
                                    </div>
                                    <div class="text-center">
                                        <span class="text-2xl font-bold">${stats.wins}</span>
                                        <p class="text-white/60 text-sm">${tr.wins || 'Wins'}</p>
                                    </div>
                                    <div class="text-center">
                                        <span class="text-2xl font-bold">${stats.followers}</span>
                                        <p class="text-white/60 text-sm">${tr.followers || 'Followers'}</p>
                                    </div>
                                    <div class="text-center">
                                        <span class="text-2xl font-bold">${stats.following}</span>
                                        <p class="text-white/60 text-sm">${tr.following || 'Following'}</p>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- Actions -->
                            <div id="profileActions" class="flex gap-2">
                                <!-- Will be populated by JS based on auth status -->
                            </div>
                        </div>
                    ` : needsLogin ? `
                        <div class="text-center text-white py-12">
                            <i class="fas fa-sign-in-alt text-5xl mb-4 opacity-50"></i>
                            <h1 class="text-2xl font-bold">${tr.login_required || tr.login || 'Login required'}</h1>
                            <p class="text-white/70 mt-2">${tr.login_to_view_profile || 'Please log in to view your profile'}</p>
                            <button onclick="showLoginModal()" class="mt-6 px-8 py-3 bg-white text-purple-700 rounded-full font-bold hover:bg-gray-100 transition-colors">
                                ${tr.login || 'Login'}
                            </button>
                        </div>
                    ` : `
                        <div class="text-center text-white py-12">
                            <i class="fas fa-user-slash text-5xl mb-4 opacity-50"></i>
                            <h1 class="text-2xl font-bold">404 — ${tr.page_not_found || 'User Not Found'}</h1>
                            ${username ? `<p class="text-white/70 mt-2">@${username}</p>` : ''}
                        </div>
                    `}
                </div>
            </div>
            
            <!-- Profile Content -->
            <div class="container mx-auto px-4 -mt-16">
                ${user ? `
                    <!-- Tabs -->
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl mb-6">
                        <div class="flex border-b border-gray-200 dark:border-gray-700">
                            <button onclick="setProfileTab('competitions')" id="tab-competitions" 
                                class="flex-1 px-6 py-4 text-center font-semibold transition-colors border-b-2 border-purple-600 text-purple-600">
                                <i class="fas fa-trophy ${rtl ? 'ml-2' : 'mr-2'}"></i>
                                ${tr.my_competitions || 'Competitions'}
                            </button>
                            <button onclick="setProfileTab('posts')" id="tab-posts" 
                                class="flex-1 px-6 py-4 text-center font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700">
                                <i class="fas fa-stream ${rtl ? 'ml-2' : 'mr-2'}"></i>
                                ${tr.posts || 'Posts'}
                            </button>
                        </div>
                    </div>
                    
                    <!-- Tab Content -->
                    <div id="profileTabContent">
                        <!-- Competitions Tab -->
                        <div id="content-competitions">
                            ${competitions.length > 0 ? `
                                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                    ${competitions.map((comp: any) => `
                                        <a href="/competition/${comp.id}?lang=${lang}" 
                                           class="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-md overflow-hidden hover:shadow-lg transition-all group">
                                            <div class="relative aspect-video bg-gradient-to-br ${comp.category_id === 1 ? 'from-purple-600 to-indigo-600' : comp.category_id === 2 ? 'from-cyan-500 to-blue-600' : 'from-amber-500 to-orange-600'}">
                                                <div class="absolute inset-0 flex items-center justify-center">
                                                    <i class="${comp.category_icon || 'fas fa-trophy'} text-white/30 text-5xl"></i>
                                                </div>
                                                <div class="absolute top-2 ${rtl ? 'right-2' : 'left-2'}">
                                                    <span class="px-2 py-1 rounded-full text-xs font-bold ${comp.status === 'live' ? 'bg-red-500' : comp.status === 'pending' ? 'bg-amber-500' : 'bg-gray-600'} text-white">
                                                        ${comp.status === 'live' ? '🔴 ' + (tr.status_live || 'Live') : comp.status === 'pending' ? tr.status_pending || 'Pending' : tr.recorded || 'Recorded'}
                                                    </span>
                                                </div>
                                            </div>
                                            <div class="p-4">
                                                <h3 class="font-bold text-gray-900 dark:text-white line-clamp-2 group-hover:text-purple-600 transition-colors">${comp.title}</h3>
                                                <p class="text-sm text-gray-500 mt-1">${comp.total_views || comp.views || 0} ${tr.viewers || 'views'}</p>
                                            </div>
                                        </a>
                                    `).join('')}
                                </div>
                            ` : `
                                <div class="text-center py-16">
                                    <i class="fas fa-trophy text-4xl text-gray-300 mb-4"></i>
                                    <p class="text-gray-500">${tr.no_competitions || 'No competitions yet'}</p>
                                </div>
                            `}
                        </div>
                        
                        <!-- Posts Tab (hidden by default) -->
                        <div id="content-posts" class="hidden">
                            <div id="postsContainer" class="space-y-4">
                                <div class="text-center py-16">
                                    <i class="fas fa-stream text-4xl text-gray-300 mb-4"></i>
                                    <p class="text-gray-500">${tr.no_posts || 'No posts yet'}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
        
        ${getFooter(lang)}
        
        <script>
            const profileUsername = '${username}';
            const profileUserId = ${user?.id || 'null'};
            const lang = '${lang}';
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            
            document.addEventListener('DOMContentLoaded', () => {
                checkAuth();
                updateProfileActions();
            });
            
            function updateProfileActions() {
                const container = document.getElementById('profileActions');
                if (!container || !profileUserId) return;
                
                // Check if viewing own profile
                const currentUser = window.currentUser;
                const isOwnProfile = currentUser && currentUser.username === profileUsername;
                
                if (isOwnProfile) {
                    container.innerHTML = \`
                        <a href="/settings?lang=\${lang}" class="px-6 py-2.5 bg-white/20 hover:bg-white/30 rounded-full font-semibold transition-colors">
                            <i class="fas fa-edit \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.edit_profile || 'Edit Profile'}
                        </a>
                    \`;
                } else if (currentUser) {
                    container.innerHTML = \`
                        <button onclick="toggleFollow(\${profileUserId})" id="followBtn" 
                            class="px-6 py-2.5 bg-white text-purple-600 hover:bg-gray-100 rounded-full font-semibold transition-colors">
                            <i class="fas fa-user-plus \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.follow || 'Follow'}
                        </button>
                        <a href="/messages?user=\${profileUserId}&lang=\${lang}" 
                            class="px-6 py-2.5 bg-white/20 hover:bg-white/30 rounded-full font-semibold transition-colors">
                            <i class="fas fa-envelope \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.send_message || 'Message'}
                        </a>
                    \`;
                }
            }
            
            async function toggleFollow(userId) {
                const btn = document.getElementById('followBtn');
                if (!btn) return;
                
                try {
                    const isFollowing = btn.classList.contains('following');
                    const method = isFollowing ? 'DELETE' : 'POST';
                    
                    const res = await fetch(\`/api/users/\${userId}/follow\`, {
                        method,
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
                            'Content-Type': 'application/json'
                        }
                    });
                    
                    if (res.ok) {
                        if (isFollowing) {
                            btn.classList.remove('following', 'bg-purple-100', 'text-purple-600');
                            btn.classList.add('bg-white', 'text-purple-600');
                            btn.innerHTML = \`<i class="fas fa-user-plus \${isRTL ? 'ml-2' : 'mr-2'}"></i>\${tr.follow || 'Follow'}\`;
                        } else {
                            btn.classList.add('following', 'bg-purple-100');
                            btn.classList.remove('bg-white');
                            btn.innerHTML = \`<i class="fas fa-user-check \${isRTL ? 'ml-2' : 'mr-2'}"></i>\${tr.following || 'Following'}\`;
                        }
                    }
                } catch (err) {
                    console.error('Follow error:', err);
                }
            }
            
            function setProfileTab(tab) {
                // Update tab buttons
                document.querySelectorAll('[id^="tab-"]').forEach(el => {
                    el.classList.remove('border-purple-600', 'text-purple-600');
                    el.classList.add('border-transparent', 'text-gray-500');
                });
                const activeTab = document.getElementById('tab-' + tab);
                if (activeTab) {
                    activeTab.classList.remove('border-transparent', 'text-gray-500');
                    activeTab.classList.add('border-purple-600', 'text-purple-600');
                }
                
                // Update content
                document.querySelectorAll('[id^="content-"]').forEach(el => el.classList.add('hidden'));
                const activeContent = document.getElementById('content-' + tab);
                if (activeContent) activeContent.classList.remove('hidden');
                
                // Load posts if needed
                if (tab === 'posts') {
                    loadUserPosts();
                }
            }
            
            async function loadUserPosts() {
                const container = document.getElementById('postsContainer');
                if (!container || !profileUserId) return;

                try {
                    const res = await fetch(\`/api/settings/users/\${profileUserId}/posts\`);
                    const data = await res.json();

                    // T3.2 FIX: server returns { data: { posts: [...] } } — the old
                    // client checked data.data.length which is undefined → always "No posts".
                    const posts = data.data?.posts || [];

                    const isOwner = window.currentUser && window.currentUser.id === profileUserId;

                    // T3.2: composer for the profile owner
                    const composerHtml = isOwner ? \`
                        <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 shadow-md mb-4">
                            <textarea id="postComposer" rows="3" maxlength="1000"
                                placeholder="\${tr.post_placeholder || 'Share a thought with your audience...'}"
                                class="w-full border-0 focus:ring-0 resize-none bg-transparent text-gray-900 dark:text-white text-sm"
                                aria-label="\${tr.post_publish || 'Publish'}"></textarea>
                            <div class="flex justify-end mt-2">
                                <button onclick="publishPost()" class="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full text-sm font-bold transition-colors disabled:opacity-50">
                                    <i class="fas fa-paper-plane mr-1"></i>\${tr.post_publish || 'Publish'}
                                </button>
                            </div>
                        </div>
                    \` : '';

                    if (posts.length > 0) {
                        container.innerHTML = composerHtml + posts.map(post => \`
                            <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 shadow-md">
                                <p class="text-gray-900 dark:text-white whitespace-pre-wrap">\${post.content}</p>
                                <div class="flex items-center justify-between mt-2">
                                    <p class="text-sm text-gray-400">\${new Date(post.created_at).toLocaleDateString()}</p>
                                    \${isOwner ? \`<button onclick="deletePost(\${post.id})" class="text-xs text-gray-400 hover:text-red-500 transition-colors" aria-label="Delete"><i class="fas fa-trash"></i></button>\` : ''}
                                </div>
                            </div>
                        \`).join('');
                    } else {
                        container.innerHTML = composerHtml + \`
                            <div class="text-center py-16">
                                <i class="fas fa-stream text-4xl text-gray-300 mb-4"></i>
                                <p class="text-gray-500">\${tr.no_posts || 'No posts yet'}</p>
                            </div>
                        \`;
                    }
                } catch (err) {
                    console.error('Failed to load posts:', err);
                }
            }

            // T3.2: publish a post from the profile composer
            window.publishPost = async function() {
                const ta = document.getElementById('postComposer');
                const content = ta ? ta.value.trim() : '';
                if (!content || !window.currentUser) return;
                try {
                    const res = await fetch('/api/settings/posts?lang=' + (window.lang || 'ar'), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + (localStorage.getItem('sessionId') || '')
                        },
                        body: JSON.stringify({ content })
                    });
                    const data = await res.json();
                    if (data.success) {
                        loadUserPosts();
                    } else {
                        alert(data.error || 'Failed to publish');
                    }
                } catch (err) { console.error(err); }
            };

            // T3.2: delete own post
            window.deletePost = async function(postId) {
                if (!confirm(tr.confirm_delete_post || 'Delete this post?')) return;
                try {
                    const res = await fetch('/api/settings/posts/' + postId + '?lang=' + (window.lang || 'ar'), {
                        method: 'DELETE',
                        headers: { 'Authorization': 'Bearer ' + (localStorage.getItem('sessionId') || '') }
                    });
                    const data = await res.json();
                    if (data.success) loadUserPosts();
                    else alert(data.error || 'Failed to delete');
                } catch (err) { console.error(err); }
            };
        </script>
    `;

    if (needsLogin) {
        return c.html(generateHTML(content, lang, tr.login || 'Login'), 401);
    }
    if (userNotFound || !user) {
        return c.html(generateHTML(content, lang, `404 - ${username || tr.page_not_found}`), 404);
    }
    return c.html(generateHTML(content, lang, user ? `${user.display_name || user.username} - ${tr.profile}` : tr.page_not_found));
};

export default profilePageRoutes;
