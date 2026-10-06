/**
 * Messages Page
 * صفحة الرسائل
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { DUELI_PRIMARY_BTN } from '../../shared/constants';
import { generateHTML } from '../../shared/templates/layout';

/**
 * Messages Page Handler
 */
export const messagesPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}
        
        <div class="flex-1 bg-gray-50 dark:bg-[#0f0f0f]">
            <div class="container mx-auto px-4 py-6">
                <!-- R2-M: personal chats vs admin messages — separate tabs,
                     separate lists, separate unread badges. -->
                <div class="flex gap-2 mb-4" role="tablist" aria-label="${tr.messages?.title || 'Messages'}">
                    <button data-csp-on="click" data-csp-fn="setMsgTab" data-csp-args='["personal"]' id="msgTabPersonal" role="tab" aria-selected="true"
                        class="px-5 py-2 rounded-full font-bold text-sm bg-purple-600 text-white">
                        <i class="fas fa-comments ${rtl ? 'ml-1' : 'mr-1'}"></i>${tr.support?.personal_tab || 'Chats'}
                        <span id="personalUnreadBadge" class="hidden ms-1 min-w-5 h-5 px-1 bg-white/90 text-purple-700 text-xs rounded-full items-center justify-center font-bold">0</span>
                    </button>
                    <button data-csp-on="click" data-csp-fn="setMsgTab" data-csp-args='["admin"]' id="msgTabAdmin" role="tab" aria-selected="false"
                        class="px-5 py-2 rounded-full font-bold text-sm bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200">
                        <i class="fas fa-shield-alt ${rtl ? 'ml-1' : 'mr-1'}"></i>${tr.support?.admin_tab || 'Admin messages'}
                        <span id="adminUnreadBadge" class="hidden ms-1 min-w-5 h-5 px-1 bg-amber-500 text-white text-xs rounded-full items-center justify-center font-bold">0</span>
                    </button>
                </div>
                <div id="personalPane" class="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg overflow-hidden h-[calc(100vh-240px)]">
                    <div class="flex h-full">
                        <!-- Conversations List -->
                        <div class="w-full md:w-1/3 border-${rtl ? 'l' : 'r'} border-gray-200 dark:border-gray-700 flex flex-col">
                            <!-- Header -->
                            <div class="p-4 border-b border-gray-200 dark:border-gray-700">
                                <h1 class="text-xl font-bold text-gray-900 dark:text-white">
                                    <i class="fas fa-envelope ${rtl ? 'ml-2' : 'mr-2'} text-purple-600"></i>
                                    ${tr.messages?.title || 'Messages'}
                                </h1>
                            </div>
                            
                            <!-- Conversations -->
                            <div id="conversationsList" class="flex-1 overflow-y-auto">
                                <div class="p-8 text-center text-gray-400">
                                    <i class="fas fa-spinner fa-spin text-3xl mb-3"></i>
                                    <p>${tr.loading || 'Loading...'}</p>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Chat Area -->
                        <div class="hidden md:flex flex-1 flex-col">
                            <!-- Chat Header -->
                            <div id="chatHeader" class="p-4 border-b border-gray-200 dark:border-gray-700 hidden">
                                <div class="flex items-center gap-3">
                                    <a id="chatUserLink" class="shrink-0 hidden" aria-label="">
                                        <img id="chatUserAvatar" src="" class="w-10 h-10 rounded-full" alt="">
                                    </a>
                                    <div>
                                        <p id="chatUserName" class="font-bold text-gray-900 dark:text-white"></p>
                                        <p id="chatUserStatus" class="text-sm text-gray-500"></p>
                                    </div>
                                </div>
                            </div>
                            
                            <!-- No Conversation Selected -->
                            <div id="noConversation" class="flex-1 flex items-center justify-center text-gray-400">
                                <div class="text-center">
                                    <i class="fas fa-comments text-5xl mb-4"></i>
                                    <p>${tr.messages?.select_conversation || 'Select a conversation'}</p>
                                </div>
                            </div>
                            
                            <!-- Messages Area -->
                            <div id="messagesArea" class="flex-1 overflow-y-auto p-4 space-y-4 hidden">
                                <!-- Messages will be loaded here -->
                            </div>
                            
                            <!-- Message Input -->
                            <div id="messageInput" class="p-4 border-t border-gray-200 dark:border-gray-700 hidden">
                                <form data-csp-on="submit" data-csp-fn="sendMessage" data-csp-args='["@event"]' class="flex gap-2">
                                    <input 
                                        type="text" 
                                        id="newMessage" 
                                        placeholder="${tr.messages?.type_message || 'Type a message...'}"
                                        class="flex-1 px-4 py-3 rounded-full bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white"
                                    >
                                    <button type="submit" class="px-6 py-3 ${DUELI_PRIMARY_BTN} hover:opacity-90 transition-colors">
                                        <i class="fas fa-paper-plane ${rtl ? 'fa-flip-horizontal' : ''}"></i>
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- R2-M: admin-messages pane (own support threads only) -->
                <div id="supportPane" class="hidden bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg overflow-hidden h-[calc(100vh-240px)]">
                    <div class="flex h-full">
                        <div class="w-full md:w-1/3 border-${rtl ? 'l' : 'r'} border-gray-200 dark:border-gray-700 flex flex-col">
                            <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                                <h2 class="text-lg font-bold text-gray-900 dark:text-white">
                                    <i class="fas fa-shield-alt ${rtl ? 'ml-2' : 'mr-2'} text-amber-500"></i>
                                    ${tr.support?.admin_tab || 'Admin messages'}
                                </h2>
                                <button data-csp-on="click" data-csp-fn="toggleNewSupportThread" data-csp-args='[]' class="px-3 py-1.5 text-sm rounded-full bg-purple-600 text-white font-bold">
                                    <i class="fas fa-plus ${rtl ? 'ml-1' : 'mr-1'}"></i>${tr.support?.new_thread || 'New'}
                                </button>
                            </div>
                            <div id="newSupportThreadForm" class="hidden p-4 border-b border-gray-200 dark:border-gray-700 space-y-2">
                                <input type="text" id="supportSubject" placeholder="${tr.support?.subject_label || 'Subject (optional)'}"
                                    class="w-full px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border-none text-sm text-gray-900 dark:text-white">
                                <textarea id="supportFirstMessage" rows="3" placeholder="${tr.messages?.type_message || 'Type a message...'}"
                                    class="w-full px-4 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 border-none text-sm text-gray-900 dark:text-white"></textarea>
                                <button data-csp-on="click" data-csp-fn="createSupportThread" data-csp-args='[]' class="px-5 py-2 ${DUELI_PRIMARY_BTN} text-sm">${tr.support?.new_thread || 'Send to admin'}</button>
                            </div>
                            <div id="supportThreadsList" class="flex-1 overflow-y-auto"></div>
                        </div>
                        <div class="hidden md:flex flex-1 flex-col">
                            <div id="supportChatHeader" class="p-4 border-b border-gray-200 dark:border-gray-700 hidden">
                                <p id="supportChatSubject" class="font-bold text-gray-900 dark:text-white"></p>
                                <p id="supportChatStatus" class="text-sm text-gray-500"></p>
                            </div>
                            <div id="noSupportThread" class="flex-1 flex items-center justify-center text-gray-400">
                                <div class="text-center">
                                    <i class="fas fa-shield-alt text-5xl mb-4"></i>
                                    <p>${tr.support?.select_thread || 'Select a message'}</p>
                                </div>
                            </div>
                            <div id="supportMessagesArea" class="flex-1 overflow-y-auto p-4 space-y-4 hidden"></div>
                            <div id="supportMessageInput" class="p-4 border-t border-gray-200 dark:border-gray-700 hidden">
                                <form data-csp-on="submit" data-csp-fn="sendSupportMessage" data-csp-args='["@event"]' class="flex gap-2">
                                    <input type="text" id="newSupportMessage" placeholder="${tr.messages?.type_message || 'Type a message...'}"
                                        class="flex-1 px-4 py-3 rounded-full bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white">
                                    <button type="submit" class="px-6 py-3 ${DUELI_PRIMARY_BTN} hover:opacity-90 transition-colors">
                                        <i class="fas fa-paper-plane ${rtl ? 'fa-flip-horizontal' : ''}"></i>
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        
        ${getFooter(lang)}
        
        <script nonce="${(c.get('cspNonce') as string) ?? ''}">
            const lang = ${JSON.stringify(getUILanguage(lang))};
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            const PRIMARY_BTN = ${JSON.stringify(DUELI_PRIMARY_BTN)};
            let currentConversationId = null;
            // R2-M: separate admin-message state (own support threads only).
            let currentSupportThreadId = null;
            let supportThreadsCache = [];
            let conversationsCache = [];
            let pendingUserId = null;
            function pageParams() {
                try { return new URLSearchParams(window.location.search); }
                catch (e) { return new URLSearchParams(''); }
            }
            function authHeaders(extra) {
                return Object.assign({ 'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')) }, extra || {});
            }
            
            document.addEventListener('DOMContentLoaded', initPageAuth);

            // Post-R1 acceptance: canonical auth lifecycle shared with
            // App.init. A transient 429/5xx/network ('unknown') renders a
            // retrying state — never a false Login Required; only an
            // authoritative 'guest' does. Login updates this page live.
            async function initPageAuth() {
                try {
                    await checkAuth();
                } catch (err) {
                    console.error('Auth check failed:', err);
                }
                if (window.currentUser) {
                    await bootMessaging();
                } else if (typeof authStatus === 'function' && authStatus() === 'unknown') {
                    showAuthPending();
                } else {
                    showLoginRequired();
                }
            }
            async function bootMessaging() {
                await loadUnreadCounts();
                const params = pageParams();
                pendingUserId = params.get('user');
                const startTab = params.get('tab') === 'admin' ? 'admin' : 'personal';
                setMsgTab(startTab, true);
                await loadConversations();
                await loadSupportThreads();
                // Deep links: ?conversation= (personal, incl. message
                // notifications), ?thread= (admin notifications),
                // ?user= (profile message button starts a chat).
                const convId = params.get('conversation');
                if (convId && startTab !== 'admin') openConversationById(convId);
                const threadId = params.get('thread');
                if (threadId) openSupportThread(threadId);
                if (pendingUserId && startTab !== 'admin') openPendingUserChat(pendingUserId);
            }
            window.addEventListener('dueli:auth-success', () => {
                if (window.currentUser) bootMessaging();
                else initPageAuth();
            });
            window.retryPageAuth = initPageAuth;

            function showAuthPending() {
                document.getElementById('conversationsList').innerHTML = \`
                    <div class="p-8 text-center text-gray-400">
                        <i class="fas fa-spinner fa-spin text-3xl mb-3"></i>
                        <p>\${tr.loading || 'Checking your session...'}</p>
                        <button data-csp-on="click" data-csp-fn="retryPageAuth" data-csp-args='[]' class="mt-4 px-6 py-2 \${PRIMARY_BTN}">
                            \${(tr.discovery && tr.discovery.retry) || tr.retry || 'Retry'}
                        </button>
                    </div>
                \`;
            }
            
            function showLoginRequired() {
                document.getElementById('conversationsList').innerHTML = \`
                    <div class="p-8 text-center text-gray-400">
                        <i class="fas fa-lock text-4xl mb-4"></i>
                        <p>\${tr.login_required || 'Please login to view messages'}</p>
                        <button data-csp-on="click" data-csp-fn="showLoginModal" data-csp-args='[]' class="mt-4 px-6 py-2 \${PRIMARY_BTN}">
                            \${tr.login || 'Login'}
                        </button>
                    </div>
                \`;
            }
            
            async function loadConversations() {
                const container = document.getElementById('conversationsList');
                try {
                    const res = await fetch('/api/conversations', {
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                        }
                    });
                    const data = await res.json();
                    const conversations = data.data?.conversations || [];
                    conversationsCache = conversations;
                    
                    if (data.success && conversations.length > 0) {
                        container.innerHTML = conversations.map(conv => \`
                            <button data-csp-on="click" data-csp-fn="openConversation" data-csp-args='[\${conv.id},\${JSON.stringify((conv.other_username))},\${JSON.stringify((conv.other_avatar || ''))}]' 
                                class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 \${isRTL ? 'text-right' : 'text-left'}">
                                \${conv.other_username ? \`<span role="link" tabindex="0" class="cursor-pointer shrink-0" aria-label="\${conv.other_display_name || conv.other_username}"
                                    data-csp-on="click" data-csp-fn="__navigateProfile" data-csp-args='["\${conv.other_username}","@event"]' data-csp-stop="1">
                                    <img src="\${conv.other_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + conv.other_username}"
                                         class="w-12 h-12 rounded-full" alt="\${conv.other_display_name || conv.other_username}">
                                </span>\` : \`<img src="\${conv.other_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=default'}" class="w-12 h-12 rounded-full shrink-0" alt="">\`}
                                <div class="flex-1 min-w-0">
                                    <p class="font-semibold text-gray-900 dark:text-white truncate">\${conv.other_display_name || conv.other_username}</p>
                                    <p class="text-sm text-gray-500 truncate">\${conv.last_message || ''}</p>
                                </div>
                                \${conv.unread_count > 0 ? \`<span class="w-5 h-5 bg-purple-600 text-white text-xs rounded-full flex items-center justify-center">\${conv.unread_count}</span>\` : ''}
                            </button>
                        \`).join('');
                    } else {
                        container.innerHTML = \`
                            <div class="p-8 text-center text-gray-400">
                                <i class="fas fa-inbox text-4xl mb-4"></i>
                                <p>\${tr.no_messages || 'No conversations yet'}</p>
                            </div>
                        \`;
                    }
                } catch (err) {
                    console.error('Failed to load conversations:', err);
                }
            }
            
            async function openConversation(id, username, avatar) {
                currentConversationId = id;
                pendingUserId = null;
                
                // Update header
                document.getElementById('chatHeader').classList.remove('hidden');
                document.getElementById('noConversation').classList.add('hidden');
                document.getElementById('messagesArea').classList.remove('hidden');
                document.getElementById('messageInput').classList.remove('hidden');
                
                document.getElementById('chatUserAvatar').src = avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + username;
                document.getElementById('chatUserName').textContent = username;
                // B6: the chat header avatar is a real user's avatar, so it
                // links to their profile whenever the identity is known.
                // Hidden otherwise, so a placeholder never becomes a dead link.
                const link = document.getElementById('chatUserLink');
                const path = username && typeof profilePathFor === 'function' ? profilePathFor(username) : null;
                if (link) {
                    if (path) {
                        link.setAttribute('href', path);
                        link.setAttribute('aria-label', username);
                        link.classList.remove('hidden');
                    } else {
                        link.classList.add('hidden');
                        link.removeAttribute('href');
                    }
                }
                
                // Load messages
                await loadMessages(id);
            }
            
            async function loadMessages(conversationId) {
                const container = document.getElementById('messagesArea');
                container.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin text-2xl text-purple-400"></i></div>';
                
                try {
                    const res = await fetch(\`/api/conversations/\${conversationId}/messages\`, {
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                        }
                    });
                    const data = await res.json();
                    const messages = data.data?.messages || [];
                    
                    if (data.success && messages.length > 0) {
                        container.innerHTML = messages.map(msg => {
                            const isMine = msg.sender_id === window.currentUser?.id;
                            return \`
                                <div class="flex \${isMine ? (isRTL ? 'justify-start' : 'justify-end') : (isRTL ? 'justify-end' : 'justify-start')}">
                                    <div class="max-w-[70%] px-4 py-2 rounded-2xl \${isMine ? 'bg-purple-600 text-white' : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white'}">
                                        <p>\${msg.content}</p>
                                        <p class="text-xs opacity-70 mt-1">\${new Date(msg.created_at).toLocaleTimeString()}</p>
                                    </div>
                                </div>
                            \`;
                        }).join('');
                        container.scrollTop = container.scrollHeight;
                    } else {
                        container.innerHTML = '<div class="text-center text-gray-400">No messages yet</div>';
                    }
                } catch (err) {
                    console.error('Failed to load messages:', err);
                }
            }
            
            async function sendMessage(e) {
                e.preventDefault();
                const input = document.getElementById('newMessage');
                const content = input.value.trim();
                if (!content) return;

                try {
                    // ?user= deep link: first send starts the personal
                    // conversation, later sends use the thread.
                    if (pendingUserId && !currentConversationId) {
                        const res = await fetch(\`/api/users/\${pendingUserId}/message\`, {
                            method: 'POST',
                            headers: authHeaders({ 'Content-Type': 'application/json' }),
                            body: JSON.stringify({ content })
                        });
                        const data = await res.json().catch(() => ({}));
                        if (res.ok && data.success) {
                            input.value = '';
                            pendingUserId = null;
                            currentConversationId = data.data.conversation.id;
                            await loadConversations();
                            openConversationById(currentConversationId);
                        }
                        return;
                    }
                    if (!currentConversationId) return;
                    const res = await fetch(\`/api/conversations/\${currentConversationId}/messages\`, {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ content })
                    });

                    if (res.ok) {
                        input.value = '';
                        loadMessages(currentConversationId);
                        loadUnreadCounts();
                    }
                } catch (err) {
                    console.error('Failed to send message:', err);
                }
            }

            function openConversationById(id) {
                const conv = conversationsCache.find(c => String(c.id) === String(id));
                if (conv) openConversation(conv.id, conv.other_username, conv.other_avatar);
            }

            function openPendingUserChat(userId) {
                currentConversationId = null;
                document.getElementById('chatHeader').classList.remove('hidden');
                document.getElementById('noConversation').classList.add('hidden');
                document.getElementById('messagesArea').classList.remove('hidden');
                document.getElementById('messageInput').classList.remove('hidden');
                document.getElementById('chatUserName').textContent = '#' + userId;
                document.getElementById('messagesArea').innerHTML = '';
                const input = document.getElementById('newMessage');
                if (input) input.focus();
            }

            // ============================
            // R2-M: tabs + independent unreads
            // ============================
            function setMsgTab(tab, silent) {
                const personal = tab !== 'admin';
                document.getElementById('personalPane').classList.toggle('hidden', !personal);
                document.getElementById('supportPane').classList.toggle('hidden', personal);
                const pBtn = document.getElementById('msgTabPersonal');
                const aBtn = document.getElementById('msgTabAdmin');
                pBtn.setAttribute('aria-selected', personal ? 'true' : 'false');
                aBtn.setAttribute('aria-selected', personal ? 'false' : 'true');
                pBtn.className = 'px-5 py-2 rounded-full font-bold text-sm ' + (personal ? 'bg-purple-600 text-white' : 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200');
                aBtn.className = 'px-5 py-2 rounded-full font-bold text-sm ' + (personal ? 'bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-200' : 'bg-amber-500 text-white');
                if (!silent) {
                    try {
                        const url = new URL(window.location.href);
                        if (personal) url.searchParams.delete('tab');
                        else url.searchParams.set('tab', 'admin');
                        window.history.replaceState({}, '', url.toString());
                    } catch (e) {}
                }
            }

            function paintBadge(id, count) {
                const el = document.getElementById(id);
                if (!el) return;
                if (count > 0) {
                    el.textContent = count > 99 ? '99+' : String(count);
                    el.classList.remove('hidden');
                    el.classList.add('inline-flex');
                } else {
                    el.classList.add('hidden');
                    el.classList.remove('inline-flex');
                }
            }

            async function loadUnreadCounts() {
                try {
                    const [pRes, sRes] = await Promise.all([
                        fetch('/api/messages/unread', { headers: authHeaders() }),
                        fetch('/api/support/unread', { headers: authHeaders() })
                    ]);
                    const pData = await pRes.json().catch(() => ({}));
                    const sData = await sRes.json().catch(() => ({}));
                    paintBadge('personalUnreadBadge', (pData.success && pData.data?.unread) || 0);
                    paintBadge('adminUnreadBadge', (sData.success && sData.data?.unread) || 0);
                } catch (e) {}
            }

            // ============================
            // R2-M: own support threads
            // ============================
            async function loadSupportThreads() {
                const box = document.getElementById('supportThreadsList');
                try {
                    const res = await fetch('/api/support/threads', { headers: authHeaders() });
                    const data = await res.json().catch(() => ({}));
                    const threads = (data.success && data.data?.threads) || [];
                    supportThreadsCache = threads;
                    box.innerHTML = threads.length === 0
                        ? \`<div class="p-8 text-center text-gray-400"><i class="fas fa-shield-alt text-4xl mb-4"></i><p>\${tr.support?.no_threads || 'No admin messages yet'}</p><p class="mt-2 text-sm"><a href="/help?lang=\${window.lang || 'ar'}#topic-support" class="text-purple-600 dark:text-purple-400 hover:underline font-semibold">\${(tr.help_guide && tr.help_guide.learn_more) || 'Learn more'}</a></p></div>\`
                        : threads.map(t => \`
                            <button data-csp-on="click" data-csp-fn="openSupportThread" data-csp-args='[\${t.id}]'
                                class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 \${isRTL ? 'text-right' : 'text-left'}">
                                <span class="w-10 h-10 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 flex items-center justify-center shrink-0"><i class="fas fa-shield-alt"></i></span>
                                <div class="flex-1 min-w-0">
                                    <p class="font-semibold text-gray-900 dark:text-white truncate">\${t.subject ? escapeSupportHtml(t.subject) : (tr.support?.admin_tab || 'Admin')}</p>
                                    <p class="text-xs text-gray-500">\${t.status === 'closed' ? (tr.support?.thread_closed || 'Closed') : ''}</p>
                                </div>
                                \${t.unread_user > 0 ? \`<span class="min-w-5 h-5 px-1 bg-amber-500 text-white text-xs rounded-full inline-flex items-center justify-center font-bold">\${t.unread_user}</span>\` : ''}
                            </button>\`).join('');
                } catch (err) {
                    console.error('Failed to load support threads:', err);
                }
            }

            function escapeSupportHtml(s) {
                return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
            }

            async function openSupportThread(id) {
                currentSupportThreadId = id;
                setMsgTab('admin', true);
                document.getElementById('supportChatHeader').classList.remove('hidden');
                document.getElementById('noSupportThread').classList.add('hidden');
                document.getElementById('supportMessagesArea').classList.remove('hidden');
                document.getElementById('supportMessageInput').classList.remove('hidden');
                const box = document.getElementById('supportMessagesArea');
                box.innerHTML = '<div class="text-center"><i class="fas fa-spinner fa-spin text-2xl text-purple-400"></i></div>';
                try {
                    const res = await fetch(\`/api/support/threads/\${id}\`, { headers: authHeaders() });
                    const data = await res.json().catch(() => ({}));
                    if (!data.success) return;
                    const thread = data.data.thread;
                    const supportMessages = data.data.messages || [];
                    document.getElementById('supportChatSubject').textContent = thread.subject || (tr.support?.admin_tab || 'Admin');
                    document.getElementById('supportChatStatus').textContent = thread.status === 'closed'
                        ? (tr.support?.thread_closed || 'Closed')
                        : (tr.support?.official_sender || 'Dueli Support');
                    box.innerHTML = supportMessages.length === 0
                        ? '<div class="text-center text-gray-400">No messages yet</div>'
                        : supportMessages.map(m => {
                            const official = m.sender_kind === 'admin';
                            return \`
                                <div class="flex \${official ? 'justify-start' : (isRTL ? 'justify-start' : 'justify-end')}">
                                    <div class="max-w-[80%] px-4 py-2 rounded-2xl \${official ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-gray-900 dark:text-white' : 'bg-purple-600 text-white'}">
                                        \${official ? \`<p class="text-[11px] font-bold text-amber-600 dark:text-amber-400 mb-1"><i class="fas fa-shield-alt me-1"></i>\${tr.support?.official_sender || 'Dueli Support'}</p>\` : ''}
                                        <p>\${escapeSupportHtml(m.content)}</p>
                                        <p class="text-xs opacity-70 mt-1">\${new Date(m.created_at).toLocaleTimeString()}</p>
                                    </div>
                                </div>\`;
                        }).join('');
                    box.scrollTop = box.scrollHeight;
                    loadUnreadCounts();
                    loadSupportThreads();
                } catch (err) {
                    console.error('Failed to load support thread:', err);
                }
            }

            function toggleNewSupportThread() {
                document.getElementById('newSupportThreadForm').classList.toggle('hidden');
            }

            async function createSupportThread() {
                const subject = document.getElementById('supportSubject').value;
                const content = document.getElementById('supportFirstMessage').value.trim();
                if (!content) return;
                try {
                    const res = await fetch('/api/support/threads', {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ subject, content })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok && data.success) {
                        document.getElementById('supportSubject').value = '';
                        document.getElementById('supportFirstMessage').value = '';
                        document.getElementById('newSupportThreadForm').classList.add('hidden');
                        await loadSupportThreads();
                        openSupportThread(data.data.thread.id);
                    }
                } catch (err) {
                    console.error('Failed to create support thread:', err);
                }
            }

            async function sendSupportMessage(e) {
                e.preventDefault();
                if (!currentSupportThreadId) return;
                const input = document.getElementById('newSupportMessage');
                const content = input.value.trim();
                if (!content) return;
                try {
                    const res = await fetch(\`/api/support/threads/\${currentSupportThreadId}/messages\`, {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ content })
                    });
                    const data = await res.json().catch(() => ({}));
                    if (res.ok && data.success) {
                        input.value = '';
                        openSupportThread(currentSupportThreadId);
                    } else if (data.error) {
                        input.value = '';
                        openSupportThread(currentSupportThreadId);
                    }
                } catch (err) {
                    console.error('Failed to send support message:', err);
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.messages?.title || 'Messages', (c.get('cspNonce') as string) ?? ''));
};

export default messagesPage;
