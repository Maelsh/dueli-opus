/**
 * @file src/client/ui/MessagingUI.ts
 * @description واجهة المراسلة
 * @module client/ui/MessagingUI
 */

import { State } from '../core/State';
import { MessagingService } from '../services/MessagingService';
import { t, isRTL } from '../../i18n';
import { DateFormatter } from '../helpers/DateFormatter';

/**
 * Messaging UI Class
 * واجهة المراسلة
 */
export class MessagingUI {
    private static isOpen = false;
    private static currentConversationId: number | null = null;

    /**
     * Open messaging panel
     */
    static open(): void {
        if (!State.currentUser) {
            window.showLoginModal?.();
            return;
        }

        this.isOpen = true;
        this.renderPanel();
        this.loadConversations();
    }

    /**
     * Close messaging panel
     */
    static close(): void {
        this.isOpen = false;
        const panel = document.getElementById('messaging-panel');
        if (panel) panel.remove();
    }

    /**
     * Render messaging panel
     */
    private static renderPanel(): void {
        const rtl = isRTL(State.lang);
        const existingPanel = document.getElementById('messaging-panel');
        if (existingPanel) existingPanel.remove();

        const panel = document.createElement('div');
        panel.id = 'messaging-panel';
        panel.className = `fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4`;
        panel.innerHTML = `
            <div class="bg-white dark:bg-gray-900 w-full max-w-4xl h-[80vh] rounded-2xl shadow-2xl flex overflow-hidden ${rtl ? 'flex-row-reverse' : ''}">
                <!-- Conversations List -->
                <div class="w-80 border-${rtl ? 'l' : 'r'} border-gray-200 dark:border-gray-700 flex flex-col">
                    <div class="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white">${t('messages.title', State.lang)}</h2>
                        <button onclick="MessagingUI.close()" class="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                    <div id="conversations-list" class="flex-1 overflow-y-auto">
                        <div class="p-4 text-center text-gray-400">
                            <i class="fas fa-spinner fa-spin"></i>
                        </div>
                    </div>
                </div>
                
                <!-- Messages Area -->
                <div class="flex-1 flex flex-col">
                    <div id="messages-header" class="p-4 border-b border-gray-200 dark:border-gray-700 hidden">
                        <!-- Header will be populated when conversation is selected -->
                    </div>
                    <div id="messages-list" class="flex-1 overflow-y-auto p-4 space-y-3">
                        <div class="h-full flex items-center justify-center text-gray-400">
                            <p>${t('messages.select_conversation', State.lang)}</p>
                        </div>
                    </div>
                    <div id="message-input-area" class="p-4 border-t border-gray-200 dark:border-gray-700 hidden">
                        <form onsubmit="MessagingUI.sendMessage(event)" class="flex gap-2">
                            <input 
                                type="text" 
                                id="message-input" 
                                placeholder="${t('messages.type_message', State.lang)}"
                                class="flex-1 px-4 py-2 rounded-full bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white"
                            >
                            <button type="submit" class="px-4 py-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition">
                                <i class="fas fa-paper-plane"></i>
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(panel);
        panel.addEventListener('click', (e) => {
            if (e.target === panel) this.close();
        });
    }

    /**
     * Load conversations list
     */
    static async loadConversations(): Promise<void> {
        const container = document.getElementById('conversations-list');
        if (!container) return;

        const conversations = await MessagingService.getConversations();

        if (conversations.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-gray-400">
                    <i class="fas fa-inbox text-4xl mb-3"></i>
                    <p>${t('messages.no_conversations', State.lang)}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = conversations.map(conv => `
            <button 
                onclick="MessagingUI.selectConversation(${conv.id})"
                class="w-full p-3 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition ${conv.id === this.currentConversationId ? 'bg-purple-50 dark:bg-purple-900/30' : ''}"
            >
                <img 
                    src="${conv.other_avatar || '/assets/default-avatar.png'}" 
                    class="w-12 h-12 rounded-full object-cover"
                    alt="${conv.other_display_name}"
                >
                <div class="flex-1 text-${isRTL(State.lang) ? 'right' : 'left'} min-w-0">
                    <div class="font-medium text-gray-900 dark:text-white truncate">${conv.other_display_name}</div>
                    <div class="text-sm text-gray-500 truncate">${conv.last_message || ''}</div>
                </div>
                ${conv.unread_count > 0 ? `<span class="bg-purple-600 text-white text-xs px-2 py-1 rounded-full">${conv.unread_count}</span>` : ''}
            </button>
        `).join('');
    }

    /**
     * Select a conversation
     */
    static async selectConversation(conversationId: number): Promise<void> {
        this.currentConversationId = conversationId;

        // Update UI
        document.getElementById('messages-header')?.classList.remove('hidden');
        document.getElementById('message-input-area')?.classList.remove('hidden');

        await this.loadMessages();
        await this.loadConversations(); // Refresh to show selection
    }

    /**
     * Load messages for current conversation
     */
    static async loadMessages(): Promise<void> {
        if (!this.currentConversationId) return;

        const container = document.getElementById('messages-list');
        if (!container) return;

        container.innerHTML = `<div class="text-center text-gray-400"><i class="fas fa-spinner fa-spin"></i></div>`;

        const messages = await MessagingService.getMessages(this.currentConversationId);

        if (messages.length === 0) {
            container.innerHTML = `
                <div class="h-full flex items-center justify-center text-gray-400">
                    <p>${t('messages.no_messages', State.lang)}</p>
                </div>
            `;
            return;
        }

        container.innerHTML = messages.reverse().map(msg => {
            const isOwn = msg.sender_id === State.currentUser?.id;
            return `
                <div class="flex ${isOwn ? 'justify-end' : 'justify-start'}">
                    <div class="max-w-[70%] ${isOwn ? 'bg-purple-600 text-white' : 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-white'} rounded-2xl px-4 py-2">
                        <p>${this.escapeHtml(msg.content)}</p>
                        <span class="text-xs ${isOwn ? 'text-purple-200' : 'text-gray-400'}">${DateFormatter.timeAgo(msg.created_at, State.lang)}</span>
                    </div>
                </div>
            `;
        }).join('');

        container.scrollTop = container.scrollHeight;
    }

    /**
     * Send a message
     */
    static async sendMessage(e: Event): Promise<void> {
        e.preventDefault();
        if (!this.currentConversationId) return;

        const input = document.getElementById('message-input') as HTMLInputElement;
        const content = input?.value.trim();
        if (!content) return;

        input.value = '';
        const result = await MessagingService.sendMessage(this.currentConversationId, content);

        if (result.success) {
            await this.loadMessages();
        }
    }

    /**
     * Start new conversation
     */
    static async startConversation(userId: number, username: string): Promise<void> {
        const content = prompt(t('messages.enter_message', State.lang));
        if (!content) return;

        const result = await MessagingService.startConversation(userId, content);
        if (result.success && result.conversationId) {
            this.open();
            await this.selectConversation(result.conversationId);
        }
    }

    /**
     * Escape HTML
     */
    private static escapeHtml(text: string): string {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).MessagingUI = MessagingUI;
}

export default MessagingUI;
