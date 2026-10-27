/**
 * Profile Page
 * صفحة الملف الشخصي
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter, getCompetitionCard, type CompetitionCardProps } from '../../shared/components';
import { DUELI_HERO_GRADIENT, DUELI_HERO_DECOR } from '../../shared/constants';
import { generateHTML } from '../../shared/templates/layout';
import { UserModel, SessionModel, CompetitionModel } from '../../models';
import { FollowModel } from '../../models/FollowModel';

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

    let user: Record<string, unknown> | null = null;
    let competitions: unknown[] = [];
    let stats = { competitions: 0, followers: 0, following: 0, wins: 0 };
    let needsLogin = false;
    let userNotFound = false;
    let viewerId: number | null = null;
    let viewerUsername: string | null = null;
    let isOwnerView = false;

    // NOTE: no self-fetch here — Preview/Data locality: query D1 directly.
    // (fetch(`${origin}/api/users/...`) from inside the Worker causes
    // subrequest loops / missing auth on Preview.)
    try {
        const { DB } = c.env;
        const userModel = new UserModel(DB);

        // ROW28.2 / SEC-11 + SEC-07: session resolution matches the canonical
        // auth source (src/middleware/auth.ts) — Bearer header OR the
        // `sessionId` cookie ONLY. Raw `?token=` (SEC-11: leaks sessions into
        // logs/browser history/Referer) and the legacy `session_id` cookie
        // (SEC-07) are removed so the request fails closed.
        //
        // UNIT32.1: resolve the viewer for BOTH `/profile` and
        // `/profile/:username`; the latter only uses the identity to decide
        // whether the owner-only collections section is rendered. Invalid
        // sessions on a public profile simply stay anonymous.
        const sessionId =
            c.req.header('Authorization')?.replace('Bearer ', '') ||
            getCookie(c, 'sessionId');
        if (sessionId) {
            const sessionModel = new SessionModel(DB);
            const result = await sessionModel.findValidSession(sessionId);
            if (result) {
                viewerId = Number(result.user.id);
                viewerUsername = String(result.user.username || '');
            }
        }

        // /profile (no username): resolve own profile from the viewer session.
        if (!username) {
            if (!viewerUsername) {
                needsLogin = true;
            } else {
                username = viewerUsername;
            }
        }

        if (!needsLogin && username) {
            user = await userModel.findByUsername(username) as unknown as Record<string, unknown> | null;
            if (!user) {
                userNotFound = true;
                console.error(`[Profile] user not found: username=${username} origin=${origin}`);
            } else {
                isOwnerView = viewerId !== null && Number(user.id) === viewerId;
                const competitionModel = new CompetitionModel(DB);
                const followModel = new FollowModel(DB);
                const { UserSignalsModel } = await import('../../models/UserSignalsModel');
                const uid = Number(user.id);
                const [followersCount, followingCount, userCompetitions, competitorProfile] = await Promise.all([
                    followModel.getFollowersCount(uid),
                    followModel.getFollowingCount(uid),
                    competitionModel.findByUser(uid, { limit: 10 }).catch(() => [] as unknown[]),
                    // R3-D2 Profile SSOT (08/11) — same source as ranking.
                    new UserSignalsModel(DB).getProfile(uid).catch(() => ({ userId: uid, starsSum: 0, competitions: 0, profile: null as number | null })),
                ]);
                competitions = Array.isArray(userCompetitions) ? userCompetitions : [];
                stats = {
                    competitions: (user.total_competitions as number) || competitions.length || 0,
                    followers: followersCount,
                    following: followingCount,
                    wins: (user.total_wins as number) || (user.wins as number) || 0
                };
                // R3-D2: Profile display (may exceed 5 — never clamped; null
                // means zero contested competitions — never divide by zero).
                (user as Record<string, unknown>)['profile_score'] = competitorProfile.profile;
                (user as Record<string, unknown>)['profile_competitions'] = competitorProfile.competitions;
                (user as Record<string, unknown>)['profile_stars'] = competitorProfile.starsSum;
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
            <div class="${DUELI_HERO_GRADIENT} relative overflow-hidden pb-24 pt-8">
                ${DUELI_HERO_DECOR}
                <div class="container mx-auto px-4 relative">
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
                                <h1 class="text-3xl font-bold">${user.display_name || user.username}${user.is_fake ? ` <span data-demo-badge="1" class="inline-block align-middle text-xs font-bold px-2.5 py-1 rounded-full bg-amber-400/90 text-amber-950" title="${(tr.demo as any)?.title || 'Demo'}">${(tr.demo as any)?.badge || 'Demo'}</span>` : ''}</h1>
                                <p class="text-white/70 text-lg">@${user.username}</p>
                                ${user.bio ? `<p class="mt-3 text-white/80 max-w-xl">${user.bio}</p>` : ''}
                                
                                <!-- Stats -->
                                <div class="flex ${rtl ? 'flex-row-reverse' : ''} gap-6 mt-4 justify-center md:justify-start">
                                    <div class="text-center" title="${tr.profile_hint || ''}">
                                        <span class="text-2xl font-bold" aria-label="${tr.profile_score || 'Profile'}">${
                                            (user.profile_score as number | null) === null || (user.profile_score as number | null) === undefined
                                                ? `<span class="text-base font-medium">${tr.profile_empty || 'No competitions yet'}</span>`
                                                : Number(user.profile_score as number).toFixed(1)
                                        }</span>
                                        <p class="text-white/60 text-sm">${tr.profile_score || 'Overall Rating'} · ${user.profile_competitions ?? 0} ${tr.profile_participations || ''}</p>
                                    </div>
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
                            <button data-csp-on="click" data-csp-fn="showLoginModal" data-csp-args='[]' class="mt-6 px-8 py-3 bg-white text-purple-700 rounded-full font-bold hover:bg-gray-100 transition-colors">
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
            <!-- R1: the tabs card overlaps the hero (-mt-16), so it must sit
                 ABOVE the positioned hero or the hero swallows tab clicks. -->
            <div class="container mx-auto px-4 -mt-16 relative z-10">
                ${user ? `
                    <!-- Tabs -->
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl mb-6">
                        <div class="flex border-b border-gray-200 dark:border-gray-700">
                            <button data-csp-on="click" data-csp-fn="setProfileTab" data-csp-args='["competitions"]' id="tab-competitions" 
                                class="flex-1 px-6 py-4 text-center font-semibold transition-colors border-b-2 border-purple-600 text-purple-600">
                                <i class="fas fa-trophy ${rtl ? 'ml-2' : 'mr-2'}"></i>
                                ${tr.my_competitions || 'Competitions'}
                            </button>
                            <button data-csp-on="click" data-csp-fn="setProfileTab" data-csp-args='["posts"]' id="tab-posts" 
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
                                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                    ${competitions.map((comp: any) => getCompetitionCard(comp as CompetitionCardProps, lang)).join('')}
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

                    ${isOwnerView ? `
                    <!-- UNIT32.1: owner-only collections. Server-rendered only
                         after the session user is proven to be this profile's
                         owner; the API re-checks ownership on every call. -->
                    <section id="profileCollections" data-owner-id="${user.id}"
                        aria-labelledby="profileCollectionsTitle"
                        class="mt-8 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl overflow-hidden">
                        <div class="p-6 border-b border-gray-200 dark:border-gray-700">
                            <h2 id="profileCollectionsTitle" class="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                                <i class="fas fa-bookmark text-purple-600" aria-hidden="true"></i>
                                ${tr.watch_collections.title}
                            </h2>
                            <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">${tr.watch_collections.hint}</p>
                        </div>
                        <div class="flex border-b border-gray-200 dark:border-gray-700" role="tablist" aria-label="${tr.watch_collections.title}">
                            <button id="collectionsTab-later" type="button" role="tab" tabindex="0"
                                aria-selected="true" aria-controls="collectionPanel-later"
                                data-csp-on="click" data-csp-fn="setCollectionsTab" data-csp-args='["later"]'
                                class="flex-1 px-4 py-4 text-center font-semibold transition-colors border-b-2 border-purple-600 text-purple-600">
                                <i class="far fa-bookmark ${rtl ? 'ml-2' : 'mr-2'}" aria-hidden="true"></i>
                                ${tr.watch_collections.tab_later}
                            </button>
                            <button id="collectionsTab-history" type="button" role="tab" tabindex="0"
                                aria-selected="false" aria-controls="collectionPanel-history"
                                data-csp-on="click" data-csp-fn="setCollectionsTab" data-csp-args='["history"]'
                                class="flex-1 px-4 py-4 text-center font-semibold transition-colors border-b-2 border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
                                <i class="fas fa-history ${rtl ? 'ml-2' : 'mr-2'}" aria-hidden="true"></i>
                                ${tr.watch_collections.tab_history}
                            </button>
                        </div>

                        <div id="collectionPanel-later" role="tabpanel" aria-labelledby="collectionsTab-later" class="p-6">
                            <div class="flex items-center gap-3 mb-4">
                                <p id="collectionLaterState" role="status" aria-live="polite" class="text-sm text-gray-500 dark:text-gray-400">${tr.watch_collections.loading}</p>
                                <button id="collectionLaterRetry" type="button"
                                    data-csp-on="click" data-csp-fn="retryCollection" data-csp-args='["later"]'
                                    class="hidden text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline">
                                    ${tr.watch_collections.retry}
                                </button>
                            </div>
                            <div id="collectionLaterList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
                            <div class="text-center mt-6">
                                <button id="collectionLaterMore" type="button"
                                    data-csp-on="click" data-csp-fn="loadMoreCollection" data-csp-args='["later"]'
                                    class="hidden px-6 py-2.5 rounded-full font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 transition-colors">
                                    ${tr.watch_collections.load_more}
                                </button>
                            </div>
                        </div>

                        <div id="collectionPanel-history" role="tabpanel" aria-labelledby="collectionsTab-history" class="hidden p-6">
                            <p class="mb-4 text-xs text-gray-500 dark:text-gray-400">${tr.watch_collections.history_hint}</p>
                            <div class="flex items-center gap-3 mb-4">
                                <p id="collectionHistoryState" role="status" aria-live="polite" class="hidden text-sm text-gray-500 dark:text-gray-400"></p>
                                <button id="collectionHistoryRetry" type="button"
                                    data-csp-on="click" data-csp-fn="retryCollection" data-csp-args='["history"]'
                                    class="hidden text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline">
                                    ${tr.watch_collections.retry}
                                </button>
                            </div>
                            <div id="collectionHistoryList" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"></div>
                            <div class="text-center mt-6">
                                <button id="collectionHistoryMore" type="button"
                                    data-csp-on="click" data-csp-fn="loadMoreCollection" data-csp-args='["history"]'
                                    class="hidden px-6 py-2.5 rounded-full font-semibold bg-purple-50 text-purple-700 hover:bg-purple-100 dark:bg-purple-900/30 dark:text-purple-300 dark:hover:bg-purple-900/50 transition-colors">
                                    ${tr.watch_collections.load_more}
                                </button>
                            </div>
                        </div>
                    </section>
                    ` : ''}
                ` : ''}
            </div>
        </div>
        
        ${getFooter(lang)}
        
        <script nonce="${(c.get('cspNonce') as string) ?? ''}">
            const profileUsername = ${JSON.stringify(username ?? '')};
            const profileUserId = ${user?.id || 'null'};
            const lang = ${JSON.stringify(getUILanguage(lang))};
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            
            document.addEventListener('DOMContentLoaded', async () => {
                // Post-R1 acceptance: await the canonical resolution (shared
                // single-flight with App.init) instead of racing it — a
                // fire-and-forget check always read a false guest on fresh
                // pages. Re-render on login so actions appear without reload.
                try {
                    await checkAuth();
                } catch (err) {
                    console.error('Auth check failed:', err);
                }
                updateProfileActions();
                // UNIT32.1: deferred app.js has run by DOMContentLoaded, so the
                // shared card renderer is ready. Loading earlier would paint an
                // empty list because renderCompetitionCard was not defined yet.
                if (document.getElementById('profileCollections')) {
                    loadCollection('later', true);
                }
            });
            window.addEventListener('dueli:auth-success', updateProfileActions);
            
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
                        <button data-csp-on="click" data-csp-fn="toggleFollow" data-csp-args='[\${profileUserId}]' id="followBtn" 
                            class="px-6 py-2.5 bg-white text-purple-600 hover:bg-gray-100 rounded-full font-semibold transition-colors">
                            <i class="fas fa-user-plus \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.follow || 'Follow'}
                        </button>
                        <a href="/messages?user=\${encodeURIComponent(profileUsername)}&lang=\${lang}"
                            class="px-6 py-2.5 bg-white/20 hover:bg-white/30 rounded-full font-semibold transition-colors">
                            <i class="fas fa-envelope \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.send_message || 'Message'}
                        </a>
                        <a href="/reports?target_type=user&target_id=\${profileUserId}&lang=\${lang}"
                            class="px-6 py-2.5 bg-white/20 hover:bg-white/30 rounded-full font-semibold transition-colors">
                            <i class="fas fa-flag \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${(tr.report && tr.report.title) || tr.submit_report || 'Report'}
                        </a>
                        <button data-csp-on="click" data-csp-fn="toggleBlock" data-csp-args='[]' id="blockBtn"
                            class="px-6 py-2.5 bg-white/20 hover:bg-white/30 rounded-full font-semibold transition-colors">
                            <i class="fas fa-ban \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.block || 'Block'}
                        </button>
                    \`;
                    refreshFollowState();
                    refreshBlockState();
                }
            }

            // Block state comes from the existing blocks contract (GET /api/blocks,
            // auth required — same contract the toggle below writes through).
            // R2-F: follow state hydrates from GET /api/users/:username
            // (is_following for the current user) so a refresh shows
            // Following instead of resetting to Follow.
            async function refreshFollowState() {
                const btn = document.getElementById('followBtn');
                if (!btn || !window.currentUser || !profileUsername) return;
                try {
                    const res = await fetch('/api/users/' + encodeURIComponent(profileUsername));
                    if (!res.ok) return;
                    const data = await res.json();
                    if (data && data.success && data.data && data.data.is_following) {
                        paintFollowButton(btn, true);
                    }
                } catch (err) {
                    console.error('Follow state error:', err);
                }
            }

            function paintFollowButton(btn, following) {
                if (following) {
                    btn.classList.add('following', 'bg-purple-100');
                    btn.classList.remove('bg-white');
                    btn.innerHTML = \`<i class="fas fa-user-check \${isRTL ? 'ml-2' : 'mr-2'}"></i>\${tr.following || 'Following'}\`;
                } else {
                    btn.classList.remove('following', 'bg-purple-100', 'text-purple-600');
                    btn.classList.add('bg-white', 'text-purple-600');
                    btn.innerHTML = \`<i class="fas fa-user-plus \${isRTL ? 'ml-2' : 'mr-2'}"></i>\${tr.follow || 'Follow'}\`;
                }
            }
            async function refreshBlockState() {
                const btn = document.getElementById('blockBtn');
                if (!btn || !window.currentUser) return;
                try {
                    const res = await fetch('/api/blocks');
                    if (!res.ok) return;
                    const data = await res.json();
                    const list = (data && data.success && data.data) ? data.data : [];
                    const blocked = list.some(b => (b.blocked_id ?? b.user_id ?? b.id) === profileUserId);
                    paintBlockButton(btn, blocked);
                } catch (err) {
                    console.error('Block state error:', err);
                }
            }

            function paintBlockButton(btn, blocked) {
                if (blocked) btn.classList.add('is-blocked');
                else btn.classList.remove('is-blocked');
                btn.innerHTML = blocked
                    ? \`<i class="fas fa-check-circle \${isRTL ? 'ml-2' : 'mr-2'}"></i>\${tr.unblock || 'Unblock'}\`
                    : \`<i class="fas fa-ban \${isRTL ? 'ml-2' : 'mr-2'}"></i>\${tr.block || 'Block'}\`;
            }

            async function toggleBlock() {
                const btn = document.getElementById('blockBtn');
                if (!btn || !profileUserId) return;
                const blocked = btn.classList.contains('is-blocked');
                if (!confirm(blocked ? (tr.confirm_unblock || 'Unblock this user?') : (tr.confirm_block || 'Block this user?'))) return;
                try {
                    const headers = {
                        'Content-Type': 'application/json'
                    };
                    const res = blocked
                        ? await fetch(\`/api/blocks/\${profileUserId}\`, { method: 'DELETE', headers })
                        : await fetch('/api/blocks', { method: 'POST', headers, body: JSON.stringify({ user_id: profileUserId }) });
                    if (res.ok) {
                        paintBlockButton(btn, !blocked);
                        window.dueli?.showToast?.(!blocked ? (tr.user_blocked || 'User blocked.') : (tr.user_unblocked || 'User unblocked.'), !blocked ? 'error' : 'success');
                    }
                } catch (err) {
                    console.error('Block error:', err);
                }
            }
            
            async function toggleFollow(userId) {
                const btn = document.getElementById('followBtn');
                if (!btn) return;
                
                try {
                    const isFollowing = btn.classList.contains('following');
                    const method = isFollowing ? 'DELETE' : 'POST';
                    
                    const res = await fetch(\`/api/users/\${userId}/follow\`, {
                        method
                    });
                    
                    if (res.ok) {
                        paintFollowButton(btn, !isFollowing);
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
                                <button data-csp-on="click" data-csp-fn="publishPost" data-csp-args='[]' class="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-full text-sm font-bold transition-colors disabled:opacity-50">
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
                                    \${isOwner ? \`<button data-csp-on="click" data-csp-fn="deletePost" data-csp-args='[\${post.id}]' class="text-xs text-gray-400 hover:text-red-500 transition-colors" aria-label="Delete"><i class="fas fa-trash"></i></button>\` : ''}
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
                            'Content-Type': 'application/json'
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
                        method: 'DELETE'
                    });
                    const data = await res.json();
                    if (data.success) loadUserPosts();
                    else alert(data.error || 'Failed to delete');
                } catch (err) { console.error(err); }
            };

            // =====================================================
            // UNIT32.1 (R4-PROFILE-COLLECTIONS-1): owner-only lists.
            // The server rendered this section only for the owner; every
            // request below is still authenticated and scoped to the session
            // by /api/watch/*. No list is cached in localStorage.
            // =====================================================
            const COLLECTIONS_PAGE_SIZE = 6;
            const collectionsState = {
                later: { cursor: null, loaded: false, loading: false, attempted: false, error: false },
                history: { cursor: null, loaded: false, loading: false, attempted: false, error: false }
            };

            function collectionEls(kind) {
                const cap = kind === 'later' ? 'Later' : 'History';
                return {
                    list: document.getElementById('collection' + cap + 'List'),
                    state: document.getElementById('collection' + cap + 'State'),
                    retry: document.getElementById('collection' + cap + 'Retry'),
                    more: document.getElementById('collection' + cap + 'More')
                };
            }

            function setCollectionsTab(tab) {
                const isLater = tab === 'later';
                const laterTab = document.getElementById('collectionsTab-later');
                const historyTab = document.getElementById('collectionsTab-history');
                const laterPanel = document.getElementById('collectionPanel-later');
                const historyPanel = document.getElementById('collectionPanel-history');

                [laterTab, historyTab].forEach(function(el) {
                    if (!el) return;
                    el.classList.remove('border-purple-600', 'text-purple-600');
                    el.classList.add('border-transparent', 'text-gray-500');
                    el.setAttribute('aria-selected', 'false');
                });
                const activeTab = isLater ? laterTab : historyTab;
                if (activeTab) {
                    activeTab.classList.remove('border-transparent', 'text-gray-500');
                    activeTab.classList.add('border-purple-600', 'text-purple-600');
                    activeTab.setAttribute('aria-selected', 'true');
                }
                if (laterPanel) laterPanel.classList.toggle('hidden', !isLater);
                if (historyPanel) historyPanel.classList.toggle('hidden', isLater);

                if (!isLater && !collectionsState.history.attempted) {
                    loadCollection('history', true);
                }
            }

            async function loadCollection(kind, reset) {
                const state = collectionsState[kind];
                if (!state || state.loading) return;
                const els = collectionEls(kind);
                if (!els.list || !els.state) return;
                if (!reset && !state.cursor) return;

                state.loading = true;
                state.attempted = true;
                if (reset) {
                    state.cursor = null;
                    state.loaded = false;
                    state.error = false;
                    els.list.innerHTML = '';
                    els.state.textContent = tr.watch_collections.loading;
                    els.state.classList.remove('hidden');
                    if (els.retry) els.retry.classList.add('hidden');
                    if (els.more) els.more.classList.add('hidden');
                }

                try {
                    const url = '/api/watch/' + (kind === 'later' ? 'later' : 'history')
                        + '?limit=' + COLLECTIONS_PAGE_SIZE
                        + (state.cursor ? '&cursor=' + encodeURIComponent(state.cursor) : '');
                    const res = await fetch(url);
                    if (!res.ok) throw new Error('http_' + res.status);
                    const payload = await res.json();
                    const data = payload && payload.success && payload.data ? payload.data : null;
                    if (!data || !Array.isArray(data.items)) throw new Error('invalid_response');

                    let html = '';
                    for (let i = 0; i < data.items.length; i += 1) {
                        const item = data.items[i];
                        const card = window.renderCompetitionCard ? window.renderCompetitionCard(item, lang) : '';
                        if (kind === 'later') {
                            html += card;
                        } else {
                            const seconds = Math.max(0, Number(item.watch_duration_seconds) || 0);
                            const duration = seconds < 60
                                ? tr.watch_collections.less_than_minute
                                : Math.round(seconds / 60) + ' ' + tr.watch_collections.minutes_short;
                            html += '<div data-history-entry="' + item.id + '">' + card
                                + '<div class="mt-1 text-xs text-gray-500 dark:text-gray-400">'
                                + tr.watch_collections.watched_for + ': ' + duration
                                + '</div></div>';
                        }
                    }
                    if (html) els.list.insertAdjacentHTML('beforeend', html);

                    state.cursor = data.nextCursor || null;
                    state.loaded = true;
                    state.error = false;
                    if (els.more) els.more.classList.toggle('hidden', !state.cursor);
                    if (els.retry) els.retry.classList.add('hidden');

                    if (els.list.innerHTML.trim() === '') {
                        els.state.textContent = kind === 'later'
                            ? tr.watch_collections.empty_later
                            : tr.watch_collections.empty_history;
                        els.state.classList.remove('hidden');
                    } else {
                        els.state.classList.add('hidden');
                    }
                } catch (err) {
                    console.error('Collections load failed:', err);
                    state.error = true;
                    state.loaded = false;
                    els.state.textContent = tr.watch_collections.error;
                    els.state.classList.remove('hidden');
                    if (els.retry) els.retry.classList.remove('hidden');
                    if (els.more) els.more.classList.add('hidden');
                } finally {
                    state.loading = false;
                }
            }

            function loadMoreCollection(kind) {
                const state = collectionsState[kind];
                if (!state || !state.cursor) return;
                return loadCollection(kind, false);
            }

            function retryCollection(kind) {
                const state = collectionsState[kind];
                if (!state) return;
                return loadCollection(kind, !state.cursor);
            }

            // A confirmed removal from any card reloads the authoritative list
            // instead of trusting local DOM state (pagination stays coherent).
            window.addEventListener('dueli:watch-later-changed', function(event) {
                const detail = event && event.detail ? event.detail : {};
                if (detail.saved === false && collectionsState.later.loaded) {
                    loadCollection('later', true);
                }
            });
        </script>
    `;

    if (needsLogin) {
        return c.html(generateHTML(content, lang, tr.login || 'Login', (c.get('cspNonce') as string) ?? ''), 401);
    }
    if (userNotFound || !user) {
        return c.html(generateHTML(content, lang, `404 - ${username || tr.page_not_found}`, (c.get('cspNonce') as string) ?? ''), 404);
    }
    return c.html(generateHTML(content, lang, user ? `${user.display_name || user.username} - ${tr.profile}` : tr.page_not_found, (c.get('cspNonce') as string) ?? ''));
};

export default profilePageRoutes;
