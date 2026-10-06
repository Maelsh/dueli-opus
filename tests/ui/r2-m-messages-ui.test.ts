/**
 * R2-M (3/3) — messages UI contract (tabs, deep links, badges,
 * notification routing, inbox, i18n/CSP).
 *
 * Pins (string-level on server-rendered templates + client sources):
 * 1. Separate tabs (personal/admin) with independent unread badges;
 *    panes never share a list container.
 * 2. Deep links parsed on boot: tab=, conversation= (personal incl.
 *    message notifications), thread= (admin notifications), user=
 *    (profile button starts a personal chat via startConversation).
 * 3. Contact-admin entry opens ?tab=admin (dead ?admin=true is gone).
 * 4. Official identity: admin-kind rows render the shield + official
 *    label, never a personal profile link.
 * 5. Notification routing: conversation → personal thread,
 *    support_thread → admin thread; distinct admin_message icon.
 * 6. Independent admin inbox on the dashboard (admin API only).
 * 7. Transport/UI reuse only: no personal-table access from the
 *    support model/controller, no second SSE system.
 * 8. i18n support/notification keys exist in ar+en and differ.
 * 9. Every new data-csp-fn is allowlisted; dark + RTL preserved.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ar } from '../../src/i18n/ar';
import { en } from '../../src/i18n/en';

const PAGE = readFileSync(resolve(__dirname, '../../src/modules/pages/messages-page.ts'), 'utf-8');
const NAV = readFileSync(resolve(__dirname, '../../src/shared/components/navigation.ts'), 'utf-8');
const NOTIF_UI = readFileSync(resolve(__dirname, '../../src/client/ui/NotificationsUI.ts'), 'utf-8');
const DASH = readFileSync(resolve(__dirname, '../../src/modules/pages/admin-dashboard-page.ts'), 'utf-8');
const CSP = readFileSync(resolve(__dirname, '../../src/client/csp-delegate.ts'), 'utf-8');
const MAIN = readFileSync(resolve(__dirname, '../../src/main.ts'), 'utf-8');
const SUPPORT_CTRL = readFileSync(resolve(__dirname, '../../src/controllers/SupportController.ts'), 'utf-8');
const SUPPORT_MODEL = readFileSync(resolve(__dirname, '../../src/models/SupportModel.ts'), 'utf-8');
const PRESENTER = readFileSync(resolve(__dirname, '../../src/lib/services/NotificationPresenter.ts'), 'utf-8');

describe('R2-M messages UI contract', () => {
    it('1. separate tabs and badges (personal vs admin, own containers)', () => {
        for (const id of ['msgTabPersonal', 'msgTabAdmin', 'personalPane', 'supportPane', 'personalUnreadBadge', 'adminUnreadBadge', 'supportThreadsList', 'supportMessagesArea']) {
            expect(PAGE).toContain(`id="${id}"`);
        }
        expect(PAGE).toContain('setMsgTab');
        expect(PAGE).toContain('/api/messages/unread');
        expect(PAGE).toContain('/api/support/unread');
        expect(CSP).toContain("'setMsgTab'");
    });

    it('2. deep links parsed on boot (tab/conversation/thread/user)', () => {
        for (const p of ["params.get('tab')", "params.get('conversation')", "params.get('thread')", "params.get('user')"]) {
            expect(PAGE).toContain(p);
        }
        expect(PAGE).toContain('openConversationById');
        expect(PAGE).toContain('openSupportThread');
        expect(PAGE).toContain('/api/users/');
        expect(PAGE).toContain('/message');
    });

    it('3. contact-admin entry opens the admin tab (dead param gone)', () => {
        expect(NAV).toContain('/messages?tab=admin');
        expect(NAV).not.toContain('admin=true');
    });

    it('4. official identity rendered, never a personal profile link', () => {
        expect(PAGE).toContain('sender_kind');
        expect(PAGE).toContain('official_sender');
        expect(PAGE).toContain('fa-shield-alt');
        expect(PAGE).toContain('openSupportThread');
        // Admin-kind rows carry no profile navigation.
        expect(PAGE).not.toMatch(/support.*__navigateProfile/);
        // Controller strips nothing needed but keeps the audit actor server-side.
        expect(SUPPORT_CTRL).toContain('sender_kind');
        expect(SUPPORT_CTRL).toContain('support_replied');
    });

    it('5. notification routing opens the right thread', () => {
        expect(NOTIF_UI).toContain("refType === 'conversation'");
        expect(NOTIF_UI).toContain("refType === 'support_thread'");
        expect(NOTIF_UI).toContain('/messages?conversation=');
        expect(NOTIF_UI).toContain('/messages?tab=admin&thread=');
        expect(NOTIF_UI).toContain("'admin_message'");
        expect(PRESENTER).toContain("case 'support_thread':");
        expect(PRESENTER).toContain('/messages?tab=admin&thread=');
        expect(PRESENTER).toContain('admin_message: { titleKey');
    });

    it('6. independent admin inbox on the dashboard (admin API only)', () => {
        for (const id of ['inboxThreadsList', 'inboxThreadView', 'inboxMessagesArea', 'inboxReplyInput', 'inboxUnreadCount']) {
            expect(DASH).toContain(`id="${id}"`);
        }
        for (const fn of ['loadInboxThreads', 'openInboxThread', 'sendInboxReply', 'setInboxThreadStatus']) {
            expect(DASH).toContain(fn);
            expect(CSP).toContain(`'${fn}'`);
        }
        expect(DASH).toContain('/api/admin/support/threads');
        expect(DASH).toContain('/api/admin/support/unread');
        // Inbox never touches personal endpoints.
        expect(DASH).not.toContain('/api/conversations');
    });

    it('7. transport/UI reuse only — no storage mixing', () => {
        expect(SUPPORT_MODEL).toContain('support_threads');
        expect(SUPPORT_MODEL).toContain('support_messages');
        expect(SUPPORT_MODEL).not.toContain('FROM messages');
        expect(SUPPORT_MODEL).not.toContain('FROM conversations');
        expect(SUPPORT_MODEL).not.toContain('JOIN messages');
        expect(SUPPORT_CTRL).toContain('createForType');
        expect(SUPPORT_CTRL).toContain("type: 'admin_message'");
        expect(SUPPORT_CTRL).not.toContain('MessageModel');
        expect(SUPPORT_CTRL).not.toContain('ConversationModel');
        expect(SUPPORT_CTRL).toContain('RateLimitService');
        expect(SUPPORT_CTRL).toContain('Sanitize');
    });

    it('8. routes mounted for the independent system', () => {
        expect(MAIN).toContain("app.route('/api/support'");
        expect(PAGE).toContain('/api/support/threads');
    });

    it.each(['ar', 'en'] as const)('9. i18n support/notification keys exist and differ (%s)', (lang) => {
        void lang;
        const a = ar as any, e = en as any;
        for (const k of ['personal_tab', 'admin_tab', 'official_sender', 'new_thread', 'thread_closed', 'admin_inbox', 'reply_label', 'unread_admin']) {
            expect(a.support?.[k], `ar.support.${k}`).toBeTruthy();
            expect(e.support?.[k], `en.support.${k}`).toBeTruthy();
            expect(a.support[k]).not.toBe(e.support[k]);
        }
        expect(a.notification?.new_admin_message).toBeTruthy();
        expect(e.notification?.new_admin_message).toBeTruthy();
        expect(a.notification.new_admin_message).not.toBe(e.notification.new_admin_message);
    });

    it('10. dark + RTL preserved on new surfaces', () => {
        expect(PAGE).toContain('dark:bg-[#1a1a1a]');
        expect(PAGE).toContain('isRTL');
        expect(DASH).toContain('dark:bg-gray-800');
    });
});
