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
                        <div id="conversationsPane" class="w-full md:w-1/3 border-${rtl ? 'l' : 'r'} border-gray-200 dark:border-gray-700 flex flex-col md:flex">
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
                        <div id="chatPane" class="hidden md:flex flex-1 flex-col">
                            <!-- Chat Header -->
                            <div id="chatHeader" class="p-4 border-b border-gray-200 dark:border-gray-700 hidden">
                                <div class="flex items-center gap-3">
                                    <!-- M-01: on mobile the conversation replaces the list;
                                         this returns to the list on the same page. -->
                                    <button type="button" data-csp-on="click" data-csp-fn="backToConversations" data-csp-args='[]'
                                        class="md:hidden shrink-0 w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700"
                                        aria-label="${tr.messages?.back_to_conversations || 'Back to chats'}">
                                        <i class="fas fa-arrow-${rtl ? 'right' : 'left'}"></i>
                                    </button>
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
                            <div id="messagesArea" class="flex-1 overflow-y-auto p-4 space-y-4 hidden" aria-live="polite">
                                <!-- Messages will be loaded here -->
                            </div>
                            
                            <!-- Message Input -->
                            <div id="messageInput" class="p-4 border-t border-gray-200 dark:border-gray-700 hidden">
                                <p id="composerError" class="hidden mb-2 text-sm text-red-600 dark:text-red-400" role="alert" aria-live="polite"></p>
                                <form id="messageForm" data-csp-on="submit" data-csp-fn="sendMessage" data-csp-args='["@event"]' class="flex items-end gap-2">
                                    <textarea
                                        id="newMessage" 
                                        rows="1"
                                        dir="auto"
                                        enterkeyhint="send"
                                        aria-label="${tr.messages?.enter_message || 'Enter your message'}"
                                        placeholder="${tr.messages?.type_message || 'Type a message...'}"
                                        data-csp-on="keydown" data-csp-fn="handleComposerKeydown" data-csp-args='["@event"]'
                                        class="flex-1 px-4 py-3 rounded-2xl bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white resize-none max-h-40 min-h-[48px]"
                                    ></textarea>
                                    <button id="sendMessageBtn" type="submit" aria-label="${tr.messages?.send || 'Send'}" class="px-6 py-3 ${DUELI_PRIMARY_BTN} hover:opacity-90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed">
                                        <i class="fas fa-paper-plane ${rtl ? 'fa-flip-horizontal' : ''}"></i>
                                    </button>
                                </form>
                                <p class="mt-1 text-[11px] text-gray-400">${tr.messages?.composer_hint || 'Enter to send · Shift+Enter for a new line'}</p>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- R2-M: admin-messages pane (own support threads only) -->
                <div id="supportPane" class="hidden bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg overflow-hidden h-[calc(100vh-240px)]">
                    <div class="flex h-full">
                        <div id="supportThreadsPane" class="w-full md:w-1/3 border-${rtl ? 'l' : 'r'} border-gray-200 dark:border-gray-700 flex flex-col md:flex">
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
                        <div id="supportChatPane" class="hidden md:flex flex-1 flex-col">
                            <div id="supportChatHeader" class="p-4 border-b border-gray-200 dark:border-gray-700 hidden">
                                <div class="flex items-center gap-3">
                                    <button type="button" data-csp-on="click" data-csp-fn="backToSupportThreads" data-csp-args='[]'
                                        class="md:hidden shrink-0 w-9 h-9 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-200 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700"
                                        aria-label="${tr.messages?.back_to_admin_messages || 'Back to admin messages'}">
                                        <i class="fas fa-arrow-${rtl ? 'right' : 'left'}"></i>
                                    </button>
                                    <div class="min-w-0">
                                        <p id="supportChatSubject" class="font-bold text-gray-900 dark:text-white truncate"></p>
                                        <p id="supportChatStatus" class="text-sm text-gray-500"></p>
                                    </div>
                                </div>
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
            let pendingUser = null;
            let isSending = false;
            let loadedMessages = [];
            let messageSession = 0;
            let messagesRequestSeq = 0;
            function pageParams() {
                try { return new URLSearchParams(window.location.search); }
                catch (e) { return new URLSearchParams(''); }
            }
            function authHeaders(extra) {
                return window.DueliSession.headers(extra || {});
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
                pendingUserId = null;
                pendingUser = null;
                const startTab = params.get('tab') === 'admin' ? 'admin' : 'personal';
                setMsgTab(startTab, true);
                await loadConversations();
                await loadSupportThreads();
                // Deep links: ?conversation= (personal, incl. message
                // notifications), ?thread= (admin notifications),
                // ?user= (profile message button opens the existing personal
                // conversation, or a named compose state when none exists).
                const convId = params.get('conversation');
                if (convId && startTab !== 'admin') await openConversationById(convId);
                const threadId = params.get('thread');
                if (threadId) await openSupportThread(threadId);
                const userParam = params.get('user');
                if (userParam && startTab !== 'admin') await openPendingUserChat(userParam);
            }
            window.addEventListener('dueli:auth-success', () => {
                if (window.currentUser) bootMessaging();
                else initPageAuth();
            });
            // M-05: the header "mark all read" action is persisted server-side.
            // Mirror the authoritative state here instead of leaving stale
            // page badges/list rows until the next reload.
            window.addEventListener('dueli:messages-read-all', () => {
                if (window.currentUser) refreshMessageSurfaces();
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
                    // M-02: a larger page makes the profile deep link able to
                    // find an existing conversation even when it is not in the
                    // header's first 10 preview rows.
                    const res = await fetch('/api/conversations?limit=100');
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok || !data.success) {
                        container.innerHTML = \`
                            <div class="p-8 text-center text-gray-400" role="alert">
                                <i class="fas fa-exclamation-triangle text-4xl mb-4"></i>
                                <p>\${tr.messages?.load_failed || tr.error_loading || 'Could not load messages'}</p>
                            </div>
                        \`;
                        return;
                    }
                    const conversations = data.data?.conversations || [];
                    conversationsCache = conversations;
                    
                    if (conversations.length > 0) {
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
                    container.innerHTML = \`
                        <div class="p-8 text-center text-gray-400" role="alert">
                            <i class="fas fa-exclamation-triangle text-4xl mb-4"></i>
                            <p>\${tr.messages?.load_failed || tr.error_loading || 'Could not load messages'}</p>
                        </div>
                    \`;
                }
            }

            // M-01: mobile shows one pane at a time. The md:flex class on the
            // list keeps the desktop split view intact even when hidden is added.
            function showChatOnMobile() {
                const list = document.getElementById('conversationsPane');
                const chat = document.getElementById('chatPane');
                if (list) list.classList.add('hidden');
                if (chat) {
                    chat.classList.remove('hidden');
                    chat.classList.add('flex');
                }
            }

            function showListOnMobile() {
                const list = document.getElementById('conversationsPane');
                const chat = document.getElementById('chatPane');
                if (list) list.classList.remove('hidden');
                if (chat) {
                    chat.classList.add('hidden');
                    chat.classList.remove('flex');
                }
            }

            // M-01 (admin tab): same one-pane mobile flow for support threads.
            function showSupportChatOnMobile() {
                const list = document.getElementById('supportThreadsPane');
                const chat = document.getElementById('supportChatPane');
                if (list) list.classList.add('hidden');
                if (chat) {
                    chat.classList.remove('hidden');
                    chat.classList.add('flex');
                }
            }

            function showSupportListOnMobile() {
                const list = document.getElementById('supportThreadsPane');
                const chat = document.getElementById('supportChatPane');
                if (list) list.classList.remove('hidden');
                if (chat) {
                    chat.classList.add('hidden');
                    chat.classList.remove('flex');
                }
            }

            function clearConversationDeepLink() {
                try {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('conversation');
                    url.searchParams.delete('user');
                    window.history.replaceState({}, '', url.toString());
                } catch (e) {}
            }

            function backToConversations() {
                messageSession += 1;
                currentConversationId = null;
                pendingUserId = null;
                pendingUser = null;
                loadedMessages = [];
                setComposerBusy(false);
                clearConversationDeepLink();
                showListOnMobile();
                document.getElementById('chatHeader').classList.add('hidden');
                document.getElementById('messagesArea').classList.add('hidden');
                document.getElementById('messageInput').classList.add('hidden');
                document.getElementById('noConversation').classList.remove('hidden');
                const input = document.getElementById('newMessage');
                if (input) input.value = '';
                clearComposerError();
            }

            function backToSupportThreads() {
                currentSupportThreadId = null;
                showSupportListOnMobile();
                document.getElementById('supportChatHeader').classList.add('hidden');
                document.getElementById('supportMessagesArea').classList.add('hidden');
                document.getElementById('supportMessageInput').classList.add('hidden');
                document.getElementById('noSupportThread').classList.remove('hidden');
                const input = document.getElementById('newSupportMessage');
                if (input) input.value = '';
                try {
                    const url = new URL(window.location.href);
                    url.searchParams.delete('thread');
                    window.history.replaceState({}, '', url.toString());
                } catch (e) {}
            }

            function setChatIdentity(name, username, avatar) {
                const label = String(name || username || (tr.messages?.new_conversation || 'New conversation'));
                const avatarEl = document.getElementById('chatUserAvatar');
                if (avatarEl) {
                    avatarEl.src = avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + (username || 'default');
                    avatarEl.alt = label;
                }
                document.getElementById('chatUserName').textContent = label;
                // B6: the chat header avatar is a real user's avatar, so it
                // links to their profile whenever the identity is known.
                // Hidden otherwise, so a placeholder never becomes a dead link.
                const link = document.getElementById('chatUserLink');
                const path = username && typeof profilePathFor === 'function' ? profilePathFor(username) : null;
                if (link) {
                    if (path) {
                        link.setAttribute('href', path);
                        link.setAttribute('aria-label', label);
                        link.classList.remove('hidden');
                    } else {
                        link.classList.add('hidden');
                        link.removeAttribute('href');
                    }
                }
            }

            // M-04: one rendering path for loaded, optimistic and failed sends.
            function escapeMessageHtml(value) {
                return String(value == null ? '' : value)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }

            function setComposerBusy(busy) {
                isSending = !!busy;
                const button = document.getElementById('sendMessageBtn');
                if (button) {
                    button.disabled = !!busy;
                    button.setAttribute('aria-busy', busy ? 'true' : 'false');
                }
            }

            function clearComposerError() {
                const error = document.getElementById('composerError');
                if (!error) return;
                error.textContent = '';
                error.classList.add('hidden');
            }

            function showComposerError(message) {
                const error = document.getElementById('composerError');
                if (!error) return;
                error.textContent = String(message || '');
                error.classList.remove('hidden');
            }

            function showMessagesLoading() {
                const container = document.getElementById('messagesArea');
                if (!container) return;
                container.innerHTML = '<div class="p-8 text-center"><i class="fas fa-spinner fa-spin text-2xl text-purple-400"></i></div>';
            }

            function showMessagesError(message) {
                const container = document.getElementById('messagesArea');
                if (!container) return;
                container.innerHTML = '<div class="p-8 text-center text-gray-400" role="alert">' +
                    '<i class="fas fa-exclamation-triangle text-3xl mb-3"></i>' +
                    '<p>' + escapeMessageHtml(message) + '</p></div>';
            }

            function messageBubble(message) {
                const mine = !!window.currentUser && String(message.sender_id) === String(window.currentUser.id);
                const pending = message.__pending === true;
                const rawContent = message.content == null ? '' : String(message.content);
                // Stored messages are already escaped server-side (Sanitize.cleanText);
                // only the local optimistic bubble needs escaping before innerHTML.
                const content = pending ? escapeMessageHtml(rawContent) : rawContent;
                const time = pending
                    ? ((tr.messages && tr.messages.sending) || 'Sending...')
                    : (message.created_at ? new Date(message.created_at).toLocaleTimeString() : '');
                const alignment = mine
                    ? (isRTL ? 'justify-start' : 'justify-end')
                    : (isRTL ? 'justify-end' : 'justify-start');
                const tone = mine
                    ? 'bg-purple-600 text-white'
                    : 'bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white';
                const messageId = message.id != null ? String(message.id) : String(message.local_id || '');
                return '<div class="flex ' + alignment + '" data-message-id="' + escapeMessageHtml(messageId) + '">' +
                    '<div class="max-w-[70%] px-4 py-2 rounded-2xl ' + tone + (pending ? ' opacity-60' : '') + '">' +
                    '<p class="whitespace-pre-wrap break-words">' + content + '</p>' +
                    '<p class="text-xs opacity-70 mt-1">' + escapeMessageHtml(time) + '</p>' +
                    '</div></div>';
            }

            function renderMessages() {
                const container = document.getElementById('messagesArea');
                if (!container) return;
                if (loadedMessages.length === 0) {
                    container.innerHTML = '<div class="p-8 text-center text-gray-400">' +
                        escapeMessageHtml((tr.messages && tr.messages.no_messages) || 'No messages yet') + '</div>';
                    return;
                }
                container.innerHTML = loadedMessages.map(messageBubble).join('');
                container.scrollTop = container.scrollHeight;
            }

            function upsertMessage(message) {
                if (!message || message.id == null) return;
                const id = String(message.id);
                loadedMessages = loadedMessages.filter(function (item) {
                    return item.__pending === true || String(item.id) !== id;
                });
                loadedMessages.push(message);
                loadedMessages.sort(function (a, b) {
                    const aTime = Date.parse(a.created_at) || 0;
                    const bTime = Date.parse(b.created_at) || 0;
                    if (aTime !== bTime) return aTime - bTime;
                    return (Number(a.id) || 0) - (Number(b.id) || 0);
                });
            }

            function removePendingMessage(localId) {
                loadedMessages = loadedMessages.filter(function (item) {
                    return !(item.__pending === true && item.local_id === localId);
                });
            }

            function refreshHeaderPreviews() {
                try {
                    if (!window.MessagesUI) return;
                    if (typeof window.MessagesUI.loadUnreadCount === 'function') window.MessagesUI.loadUnreadCount();
                    if (typeof window.MessagesUI.loadMessages === 'function') window.MessagesUI.loadMessages();
                } catch (e) {}
            }

            // M-03: after a send/read, re-read the list previews and both
            // badges from the API instead of waiting for a poll/reload.
            async function refreshMessageSurfaces() {
                await Promise.all([loadUnreadCounts(), loadConversations()]);
                refreshHeaderPreviews();
            }

            async function openConversation(id, username, avatar, displayName) {
                messageSession += 1;
                const session = messageSession;
                const cached = conversationsCache.find(function (item) {
                    return String(item.id) === String(id);
                });
                currentConversationId = id;
                pendingUserId = null;
                pendingUser = null;
                loadedMessages = [];
                setComposerBusy(false);
                clearComposerError();
                const composer = document.getElementById('newMessage');
                if (composer) composer.value = '';
                showChatOnMobile();

                // Update header
                document.getElementById('chatHeader').classList.remove('hidden');
                document.getElementById('noConversation').classList.add('hidden');
                document.getElementById('messagesArea').classList.remove('hidden');
                document.getElementById('messageInput').classList.remove('hidden');
                setChatIdentity(
                    displayName || (cached && cached.other_display_name) || username,
                    username,
                    avatar || (cached && cached.other_avatar)
                );
                renderMessages();

                // Load messages
                await loadMessages(id);
                if (session !== messageSession) return;
                // Opening a thread marks it read server-side; refresh the
                // list previews and both badges from that authoritative state.
                await refreshMessageSurfaces();
            }

            async function loadMessages(conversationId) {
                const requestSeq = ++messagesRequestSeq;
                showMessagesLoading();

                try {
                    const res = await fetch('/api/conversations/' + conversationId + '/messages');
                    const data = await res.json().catch(function () { return {}; });
                    if (requestSeq !== messagesRequestSeq || String(currentConversationId) !== String(conversationId)) return;
                    const messages = data.data?.messages || [];

                    if (!res.ok || !data.success) {
                        showMessagesError((data && data.error) || (tr.messages && tr.messages.load_failed) || 'Could not load messages');
                        return;
                    }
                    loadedMessages = messages;
                    renderMessages();
                } catch (err) {
                    if (requestSeq !== messagesRequestSeq) return;
                    console.error('Failed to load messages:', err);
                    showMessagesError((tr.messages && tr.messages.load_failed) || 'Could not load messages');
                }
            }
            
            async function sendMessage(e) {
                if (e && typeof e.preventDefault === 'function') e.preventDefault();
                if (isSending) return;
                const input = document.getElementById('newMessage');
                if (!input) return;
                const content = input.value.trim();
                if (!content) {
                    input.focus();
                    return;
                }
                const targetConversationId = currentConversationId;
                const targetUser = pendingUser;
                if (!targetConversationId && !targetUser) return;
                const sessionAtSend = messageSession;
                const localId = 'pending-' + Date.now() + '-' + Math.random().toString(36).slice(2);
                const pending = {
                    __pending: true,
                    local_id: localId,
                    sender_id: window.currentUser ? window.currentUser.id : null,
                    content: content,
                    created_at: new Date().toISOString()
                };

                // M-04: show the message immediately, but never claim it was
                // delivered. The pending bubble is replaced by the server row
                // only after a confirmed success.
                loadedMessages.push(pending);
                renderMessages();
                input.value = '';
                clearComposerError();
                setComposerBusy(true);

                try {
                    const endpoint = targetConversationId
                        ? '/api/conversations/' + targetConversationId + '/messages'
                        : '/api/users/' + targetUser.id + '/message';
                    const res = await fetch(endpoint, {
                        method: 'POST',
                        headers: authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ content: content })
                    });
                    const data = await res.json().catch(function () { return {}; });
                    if (sessionAtSend !== messageSession) {
                        await refreshMessageSurfaces();
                        return;
                    }
                    if (!res.ok || !data.success) {
                        removePendingMessage(localId);
                        if (!input.value) input.value = content;
                        showComposerError((data && data.error) || (tr.messages && tr.messages.send_failed) || 'Could not send the message. Try again.');
                        renderMessages();
                        return;
                    }

                    removePendingMessage(localId);
                    const sentMessage = data.data && data.data.message;
                    if (sentMessage) upsertMessage(sentMessage);

                    // ?user= deep link: the first send starts the personal
                    // conversation; later sends use the thread.
                    if (!targetConversationId) {
                        const conversation = data.data && data.data.conversation;
                        if (conversation && conversation.id != null) {
                            currentConversationId = conversation.id;
                            pendingUser = null;
                            pendingUserId = null;
                        } else if (sentMessage && sentMessage.conversation_id != null) {
                            currentConversationId = sentMessage.conversation_id;
                            pendingUser = null;
                            pendingUserId = null;
                        } else {
                            // Contract violation: never pretend the compose
                            // state is a saved thread. Re-read the list once.
                            await loadConversations();
                            const created = conversationsCache.find(function (item) {
                                return String(item.other_user_id) === String(targetUser.id);
                            });
                            if (created) {
                                currentConversationId = created.id;
                                pendingUser = null;
                                pendingUserId = null;
                            } else {
                                showComposerError((tr.messages && tr.messages.send_failed) || 'Could not send the message. Try again.');
                                renderMessages();
                                return;
                            }
                        }
                    }

                    // F-1: a confirmed send is not proof that loadedMessages
                    // has the whole thread. A ?user= deep link can resume a
                    // pre-existing conversation that was outside the loaded
                    // conversations page; the POST response is the first time
                    // the client learns its id. Always re-read the adopted
                    // thread from the server so older messages appear now and
                    // the new row is rendered exactly once (loadMessages
                    // replaces the array with the authoritative history).
                    if (currentConversationId) {
                        await loadMessages(currentConversationId);
                    } else {
                        renderMessages();
                    }
                    await refreshMessageSurfaces();
                } catch (err) {
                    console.error('Failed to send message:', err);
                    if (sessionAtSend === messageSession) {
                        removePendingMessage(localId);
                        if (!input.value) input.value = content;
                        showComposerError((tr.messages && tr.messages.send_failed) || 'Could not send the message. Try again.');
                        renderMessages();
                    }
                } finally {
                    if (sessionAtSend === messageSession) {
                        setComposerBusy(false);
                        input.focus();
                    }
                }
            }

            function handleComposerKeydown(e) {
                if (!e || e.key !== 'Enter' || e.shiftKey) return;
                // M-04: the Enter that commits an IME candidate is not a send.
                if (e.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                const form = document.getElementById('messageForm');
                if (form && typeof form.requestSubmit === 'function') {
                    form.requestSubmit();
                    return;
                }
                sendMessage(e);
            }

            async function openConversationById(id) {
                const conversation = conversationsCache.find(function (item) {
                    return String(item.id) === String(id);
                });
                if (!conversation) return false;
                await openConversation(conversation.id, conversation.other_username, conversation.other_avatar, conversation.other_display_name);
                return true;
            }

            async function openPendingUserChat(userParam) {
                const requested = String(userParam == null ? '' : userParam).trim();
                if (!requested) return;
                const requestedLower = requested.toLowerCase();
                const numeric = /^\\d+$/.test(requested);
                let existing = conversationsCache.find(function (item) {
                    return String(item.other_username || '').toLowerCase() === requestedLower;
                });
                if (!existing && numeric) {
                    // Legacy links used the numeric user id; resolve them
                    // against the loaded list, never render the id as a name.
                    existing = conversationsCache.find(function (item) {
                        return String(item.other_user_id) === requested;
                    });
                }
                if (existing) {
                    await openConversation(existing.id, existing.other_username, existing.other_avatar, existing.other_display_name);
                    return;
                }

                messageSession += 1;
                const session = messageSession;
                currentConversationId = null;
                pendingUser = null;
                pendingUserId = null;
                loadedMessages = [];
                setComposerBusy(false);
                clearComposerError();
                const composer = document.getElementById('newMessage');
                if (composer) composer.value = '';
                showChatOnMobile();
                document.getElementById('chatHeader').classList.remove('hidden');
                document.getElementById('noConversation').classList.add('hidden');
                document.getElementById('messagesArea').classList.remove('hidden');
                document.getElementById('messageInput').classList.add('hidden');
                // M-02: show the username while the profile resolves; the
                // display name replaces it when the API answers. A numeric id
                // is never presented as a person's name.
                const fallbackName = numeric
                    ? ((tr.messages && tr.messages.new_conversation) || 'New conversation')
                    : requested;
                setChatIdentity(fallbackName, numeric ? '' : requested, '');
                showMessagesLoading();

                try {
                    if (numeric) {
                        showMessagesError((tr.messages && tr.messages.load_failed) || 'Could not load messages');
                        return;
                    }
                    const res = await fetch('/api/users/' + encodeURIComponent(requested));
                    const data = await res.json().catch(function () { return {}; });
                    if (session !== messageSession) return;
                    if (!res.ok || !data.success || !data.data) {
                        const message = res.status === 404
                            ? ((tr.user_errors && tr.user_errors.not_found) || (tr.messages && tr.messages.load_failed))
                            : (tr.messages && tr.messages.load_failed);
                        showMessagesError(message || 'Could not load messages');
                        return;
                    }
                    const profile = data.data;
                    const username = profile.username || requested;
                    const displayName = profile.display_name || username;
                    pendingUser = {
                        id: profile.id,
                        username: username,
                        display_name: profile.display_name || '',
                        avatar: profile.avatar_url || ''
                    };
                    pendingUserId = profile.id;
                    setChatIdentity(displayName, username, profile.avatar_url || '');
                    renderMessages();
                    document.getElementById('messageInput').classList.remove('hidden');
                    if (composer) composer.focus();
                } catch (err) {
                    if (session !== messageSession) return;
                    console.error('Failed to resolve message recipient:', err);
                    showMessagesError((tr.messages && tr.messages.load_failed) || 'Could not load messages');
                }
            }

            // ============================
            // R2-M: tabs + independent unreads
            // ============================
            function setMsgTab(tab, silent) {
                const personal = tab !== 'admin';
                document.getElementById('personalPane').classList.toggle('hidden', !personal);
                document.getElementById('supportPane').classList.toggle('hidden', personal);
                // Each tab starts on its list on mobile; desktop keeps both
                // panes visible through md:flex.
                if (personal) showListOnMobile();
                else showSupportListOnMobile();
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
                    // M-03: only an authoritative number repaints a badge. A
                    // failed/malformed response keeps the last known count
                    // instead of fabricating a zero inbox.
                    if (pData.success && typeof pData.data?.unread === 'number') {
                        paintBadge('personalUnreadBadge', pData.data.unread);
                    }
                    if (sData.success && typeof sData.data?.unread === 'number') {
                        paintBadge('adminUnreadBadge', sData.data.unread);
                    }
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
                        ? \`<div class="p-8 text-center text-gray-400"><i class="fas fa-shield-alt text-4xl mb-4"></i><p>\${tr.support?.no_threads || 'No admin messages yet'}</p><p class="mt-2 text-sm"><a href="/guide/help?lang=\${window.lang || 'ar'}#topic-support" class="text-purple-600 dark:text-purple-400 hover:underline font-semibold">\${(tr.help_guide && tr.help_guide.learn_more) || 'Learn more'}</a></p></div>\`
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
                showSupportChatOnMobile();
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
