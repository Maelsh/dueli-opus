/**
 * Messages Page
 * صفحة الرسائل
 */

import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
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
                <div class="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-lg overflow-hidden" style="height: calc(100vh - 180px);">
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
                                    <img id="chatUserAvatar" src="" class="w-10 h-10 rounded-full">
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
                                    <p>\${tr.messages?.select_conversation || 'Select a conversation'}</p>
                                </div>
                            </div>
                            
                            <!-- Messages Area -->
                            <div id="messagesArea" class="flex-1 overflow-y-auto p-4 space-y-4 hidden">
                                <!-- Messages will be loaded here -->
                            </div>
                            
                            <!-- Message Input -->
                            <div id="messageInput" class="p-4 border-t border-gray-200 dark:border-gray-700 hidden">
                                <form onsubmit="sendMessage(event)" class="flex gap-2">
                                    <input 
                                        type="text" 
                                        id="newMessage" 
                                        placeholder="\${tr.messages?.type_message || 'Type a message...'}"
                                        class="flex-1 px-4 py-3 rounded-full bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white"
                                    >
                                    <button type="submit" class="px-6 py-3 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors">
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
        
        <script>
            const lang = '${lang}';
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            let currentConversationId = null;
            
            document.addEventListener('DOMContentLoaded', async () => {
                await checkAuth();
                if (window.currentUser) {
                    loadConversations();
                } else {
                    showLoginRequired();
                }
            });
            
            function showLoginRequired() {
                document.getElementById('conversationsList').innerHTML = \`
                    <div class="p-8 text-center text-gray-400">
                        <i class="fas fa-lock text-4xl mb-4"></i>
                        <p>\${tr.login_required || 'Please login to view messages'}</p>
                        <button onclick="showLoginModal()" class="mt-4 px-6 py-2 bg-purple-600 text-white rounded-full">
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
                    
                    if (data.success && data.data?.length > 0) {
                        container.innerHTML = data.data.map(conv => \`
                            <button onclick="openConversation(\${conv.id}, '\${conv.other_user?.username}', '\${conv.other_user?.avatar_url || ''}')" 
                                class="w-full p-4 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors border-b border-gray-100 dark:border-gray-800 \${isRTL ? 'text-right' : 'text-left'}">
                                <img src="\${conv.other_user?.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + conv.other_user?.username}" 
                                     class="w-12 h-12 rounded-full">
                                <div class="flex-1 min-w-0">
                                    <p class="font-semibold text-gray-900 dark:text-white truncate">\${conv.other_user?.display_name || conv.other_user?.username}</p>
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
                
                // Update header
                document.getElementById('chatHeader').classList.remove('hidden');
                document.getElementById('noConversation').classList.add('hidden');
                document.getElementById('messagesArea').classList.remove('hidden');
                document.getElementById('messageInput').classList.remove('hidden');
                
                document.getElementById('chatUserAvatar').src = avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + username;
                document.getElementById('chatUserName').textContent = username;
                
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
                    
                    if (data.success && data.data?.length > 0) {
                        container.innerHTML = data.data.map(msg => {
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
                if (!currentConversationId) return;
                
                const input = document.getElementById('newMessage');
                const content = input.value.trim();
                if (!content) return;
                
                try {
                    const res = await fetch(\`/api/conversations/\${currentConversationId}/messages\`, {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ content })
                    });
                    
                    if (res.ok) {
                        input.value = '';
                        loadMessages(currentConversationId);
                    }
                } catch (err) {
                    console.error('Failed to send message:', err);
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.messages?.title || 'Messages'));
};

export default messagesPage;
