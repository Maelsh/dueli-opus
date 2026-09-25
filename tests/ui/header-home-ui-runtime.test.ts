/**
 * Behavioral Regression Tests for:
 * 1. Header Menus click-outside & toggle behavior
 * 2. Country selection, language & direction change
 * 3. Loading state completion on success/failure
 * 4. Search button styling & gradient
 * 5. Main tabs gradient transitions
 * 6. Icon orientation in RTL vs LTR
 * 7. Cursor pointer on interactive buttons
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Menu, computeCountryMenuPosition } from '../../src/client/ui/Menu';
import { MessagesUI } from '../../src/client/ui/MessagesUI';
import { HomePage } from '../../src/client/pages/HomePage';
import { State } from '../../src/client/core/State';
import { ApiClient } from '../../src/client/core/ApiClient';
import { getDir, isRTL } from '../../src/i18n';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

class MockClassList {
    private classes = new Set<string>();
    constructor(initialClasses: string[] = []) {
        initialClasses.forEach(c => this.classes.add(c));
    }
    add(...tokens: string[]) { tokens.forEach(t => this.classes.add(t)); }
    remove(...tokens: string[]) { tokens.forEach(t => this.classes.delete(t)); }
    toggle(token: string, force?: boolean): boolean {
        if (force === true) { this.classes.add(token); return true; }
        if (force === false) { this.classes.delete(token); return false; }
        if (this.classes.has(token)) { this.classes.delete(token); return false; }
        this.classes.add(token); return true;
    }
    contains(token: string): boolean { return this.classes.has(token); }
    get value(): string { return Array.from(this.classes).join(' '); }
}

class MockElement {
    id: string;
    tagName: string;
    attributes: Record<string, string> = {};
    classList: MockClassList;
    parentElement: MockElement | null = null;
    children: MockElement[] = [];
    innerHTML: string = '';
    textContent: string = '';

    constructor(tagName: string, id: string = '', initialClasses: string[] = []) {
        this.tagName = tagName.toUpperCase();
        this.id = id;
        this.classList = new MockClassList(initialClasses);
    }

    setAttribute(name: string, value: string) {
        this.attributes[name] = value;
    }

    getAttribute(name: string): string | null {
        return this.attributes[name] ?? null;
    }

    hasAttribute(name: string): boolean {
        return name in this.attributes;
    }

    closest(selector: string): MockElement | null {
        let current: MockElement | null = this;
        while (current) {
            if (current.matches(selector)) return current;
            current = current.parentElement;
        }
        return null;
    }

    matches(selector: string): boolean {
        const parts = selector.split(',').map(s => s.trim());
        for (const part of parts) {
            if (part.startsWith('[') && part.endsWith(']')) {
                const attrExpr = part.slice(1, -1);
                if (attrExpr.includes('*=')) {
                    const [attr, val] = attrExpr.split('*=');
                    const cleanVal = val.replace(/["']/g, '');
                    const currentVal = this.getAttribute(attr);
                    if (currentVal && currentVal.includes(cleanVal)) return true;
                } else if (attrExpr.includes('=')) {
                    const [attr, val] = attrExpr.split('=');
                    const cleanVal = val.replace(/["']/g, '');
                    if (this.getAttribute(attr) === cleanVal) return true;
                }
            } else if (part.startsWith('#') && this.id === part.slice(1)) {
                return true;
            } else if (part.startsWith('.') && this.classList.contains(part.slice(1))) {
                return true;
            }
        }
        return false;
    }

    contains(other: MockElement | null): boolean {
        let current = other;
        while (current) {
            if (current === this) return true;
            current = current.parentElement;
        }
        return false;
    }

    appendChild(child: MockElement) {
        child.parentElement = this;
        this.children.push(child);
    }

    set className(val: string) {
        this.classList = new MockClassList(val.split(/\s+/).filter(Boolean));
    }

    get className(): string {
        return this.classList.value;
    }
}
describe('Header Menus & Runtime UI Remediation', () => {
    let docElements: Map<string, MockElement>;
    let clickListeners: Array<(e: { target: any }) => void>;

    beforeEach(() => {
        docElements = new Map();
        clickListeners = [];

        const body = new MockElement('BODY', 'body');
        const countryBtn = new MockElement('BUTTON', 'countryBtn');
        countryBtn.setAttribute('data-csp-fn', 'toggleCountryMenu');
        const countryMenu = new MockElement('DIV', 'countryMenu', ['hidden']);

        const userBtn = new MockElement('BUTTON', 'userBtn');
        userBtn.setAttribute('data-csp-fn', 'toggleUserMenu');
        const userMenu = new MockElement('DIV', 'userMenu');

        const notifBtn = new MockElement('BUTTON', 'notifBtn');
        notifBtn.setAttribute('data-csp-fn', 'toggleNotifications');
        const notifDropdown = new MockElement('DIV', 'notificationsDropdown', ['hidden']);

        const msgBtn = new MockElement('BUTTON', 'msgBtn');
        msgBtn.setAttribute('data-csp-fn', 'toggleMessages');
        const msgDropdown = new MockElement('DIV', 'messagesDropdown', ['hidden']);

        const outsideArea = new MockElement('DIV', 'outsideArea');

        body.appendChild(countryBtn);
        body.appendChild(countryMenu);
        body.appendChild(userBtn);
        body.appendChild(userMenu);
        body.appendChild(notifBtn);
        body.appendChild(notifDropdown);
        body.appendChild(msgBtn);
        body.appendChild(msgDropdown);
        body.appendChild(outsideArea);

        [countryBtn, countryMenu, userBtn, userMenu, notifBtn, notifDropdown, msgBtn, msgDropdown, outsideArea, body].forEach(el => {
            docElements.set(el.id, el);
        });

        (globalThis as any).document = {
            getElementById: (id: string) => docElements.get(id) || null,
            addEventListener: (event: string, fn: any) => {
                if (event === 'click') clickListeners.push(fn);
            },
            body: body,
            readyState: 'complete',
        };
        (globalThis as any).window = globalThis;
    });

    describe('Issue 1: Header Menus Click Outside & Toggle', () => {
        it('setupClickOutside keeps menus open when clicking data-csp-fn buttons', () => {
            Menu.setupClickOutside();
            expect(clickListeners.length).toBeGreaterThan(0);

            const countryBtn = docElements.get('countryBtn')!;
            const countryMenu = docElements.get('countryMenu')!;
            const userBtn = docElements.get('userBtn')!;
            const userMenu = docElements.get('userMenu')!;
            const notifBtn = docElements.get('notifBtn')!;
            const notifDropdown = docElements.get('notificationsDropdown')!;
            const msgBtn = docElements.get('msgBtn')!;
            const msgDropdown = docElements.get('messagesDropdown')!;
            const outside = docElements.get('outsideArea')!;

            // Country menu
            countryMenu.classList.remove('hidden');
            clickListeners.forEach(listener => listener({ target: countryBtn }));
            expect(countryMenu.classList.contains('hidden')).toBe(false);

            clickListeners.forEach(listener => listener({ target: outside }));
            expect(countryMenu.classList.contains('hidden')).toBe(true);

            // User menu
            userMenu.classList.add('show');
            clickListeners.forEach(listener => listener({ target: userBtn }));
            expect(userMenu.classList.contains('show')).toBe(true);

            clickListeners.forEach(listener => listener({ target: outside }));
            expect(userMenu.classList.contains('show')).toBe(false);

            // Notifications dropdown
            notifDropdown.classList.remove('hidden');
            clickListeners.forEach(listener => listener({ target: notifBtn }));
            expect(notifDropdown.classList.contains('hidden')).toBe(false);

            clickListeners.forEach(listener => listener({ target: outside }));
            expect(notifDropdown.classList.contains('hidden')).toBe(true);

            // Messages dropdown
            msgDropdown.classList.remove('hidden');
            clickListeners.forEach(listener => listener({ target: msgBtn }));
            expect(msgDropdown.classList.contains('hidden')).toBe(false);

            clickListeners.forEach(listener => listener({ target: outside }));
            expect(msgDropdown.classList.contains('hidden')).toBe(true);
        });

        it('keeps the country menu inside safe viewport bounds for RTL, LTR and narrow screens', () => {
            const rtl = computeCountryMenuPosition({ viewportWidth: 1440, menuWidth: 320, triggerLeft: 1370, triggerRight: 1402, direction: 'rtl' });
            const ltr = computeCountryMenuPosition({ viewportWidth: 1440, menuWidth: 320, triggerLeft: 1370, triggerRight: 1402, direction: 'ltr' });
            const narrowRtl = computeCountryMenuPosition({ viewportWidth: 320, menuWidth: 288, triggerLeft: 152, triggerRight: 184, direction: 'rtl' });
            const narrowLtr = computeCountryMenuPosition({ viewportWidth: 320, menuWidth: 288, triggerLeft: 136, triggerRight: 168, direction: 'ltr' });

            expect(rtl.left).toBe(1082);
            expect(rtl.atTrigger).toBe(true);
            expect(rtl.left).toBeGreaterThanOrEqual(rtl.safeMargin);
            expect(rtl.left + 320).toBeLessThanOrEqual(1440 - rtl.safeMargin);
            expect(ltr.left).toBe(1104);
            expect(ltr.atTrigger).toBe(false);
            expect(ltr.left).toBeGreaterThanOrEqual(ltr.safeMargin);
            expect(ltr.left + 320).toBeLessThanOrEqual(1440 - ltr.safeMargin);
            expect(narrowRtl.centeredFallback).toBe(true);
            expect(narrowRtl.left).toBe(16);
            expect(narrowLtr.centeredFallback).toBe(true);
            expect(narrowLtr.left).toBe(16);
        });

        it('supports both data-csp-fn and legacy onclick selectors', () => {
            Menu.setupClickOutside();
            const legacyBtn = new MockElement('BUTTON', 'legacyCountry');
            legacyBtn.setAttribute('onclick', 'window.toggleCountryMenu()');
            const countryMenu = docElements.get('countryMenu')!;
            countryMenu.classList.remove('hidden');

            clickListeners.forEach(listener => listener({ target: legacyBtn }));
            expect(countryMenu.classList.contains('hidden')).toBe(false);
        });
        it('country selection updates language and direction accordingly', async () => {
            const { getCountry } = await import('../../src/countries');
            const sa = getCountry('SA');
            const us = getCountry('US');

            expect(sa).toBeDefined();
            expect(sa?.primaryLang).toBe('ar');
            expect(getDir(sa!.primaryLang)).toBe('rtl');
            expect(isRTL(sa!.primaryLang)).toBe(true);

            expect(us).toBeDefined();
            expect(us?.primaryLang).toBe('en');
            expect(getDir(us!.primaryLang)).toBe('ltr');
            expect(isRTL(us!.primaryLang)).toBe(false);
        });

    });

    describe('Issue 2: Loading & Error Resilience', () => {
        it('MessagesUI.loadMessages finishes and renders empty list on 404', async () => {
            const listEl = new MockElement('DIV', 'messagesList');
            docElements.set('messagesList', listEl);

            vi.spyOn(ApiClient, 'get').mockResolvedValueOnce({
                success: false,
                error: 'Not Found',
            } as any);

            await MessagesUI.loadMessages();
            expect(listEl.innerHTML).toMatch(/No messages|لا توجد رسائل/);
            expect(listEl.innerHTML).toContain('fa-envelope-open');
        });

        it('MessagesUI.loadUnreadCount recognizes unread field from backend', async () => {
            const badge = new MockElement('SPAN', 'messagesBadge', ['hidden']);
            docElements.set('messagesBadge', badge);

            vi.spyOn(ApiClient, 'get').mockResolvedValueOnce({
                success: true,
                data: { unread: 5 },
            } as any);

            await MessagesUI.loadUnreadCount();
            expect(badge.textContent).toBe('5');
            expect(badge.classList.contains('hidden')).toBe(false);
        });
    });

    describe('Issue 3: Search Button & Tab Styles', () => {
        it('search button applies entrance gradient, arrow icon and performSearch', () => {
            const mainSrc = readSrc('src/main.ts');
            expect(mainSrc).toContain('bg-gradient-to-br from-purple-600 to-indigo-600');
            expect(mainSrc).toContain('hover:opacity-90');
            expect(mainSrc).toContain('shadow-purple-500/30');
            expect(mainSrc).toContain('id="searchBtn"');
            expect(mainSrc).toContain('data-csp-fn="performSearch"');
            expect(mainSrc).toMatch(/<i class="fas fa-arrow-\$\{rtl \? 'left' : 'right'\}"><\/i>/);
        });

        it('.tab-active in CSS applies entrance gradient and cursor pointer', () => {
            const cssSrc = readSrc('src/styles.css');
            const tabActiveBlock = cssSrc.match(/\.tab-active\s*\{[^}]+\}/)?.[0] || '';
            expect(tabActiveBlock).toContain('linear-gradient(to bottom right, #9333ea, #4f46e5)');
            expect(tabActiveBlock).toContain('cursor: pointer');
        });

        it('HomePage.setMainTab transitions tab-active class across all three tabs', () => {
            const liveTab = new MockElement('BUTTON', 'tab-live');
            const upcomingTab = new MockElement('BUTTON', 'tab-upcoming');
            const recordedTab = new MockElement('BUTTON', 'tab-recorded');

            docElements.set('tab-live', liveTab);
            docElements.set('tab-upcoming', upcomingTab);
            docElements.set('tab-recorded', recordedTab);

            State.currentUser = { id: 1, username: 'test' };
            vi.spyOn(HomePage, 'loadCompetitions').mockImplementation(() => Promise.resolve());

            HomePage.setMainTab('live');
            expect(liveTab.classList.contains('tab-active')).toBe(true);

            HomePage.setMainTab('recorded');
            expect(recordedTab.classList.contains('tab-active')).toBe(true);
            expect(liveTab.classList.contains('tab-inactive')).toBe(true);

            HomePage.setMainTab('upcoming');
            expect(upcomingTab.classList.contains('tab-active')).toBe(true);
            expect(recordedTab.classList.contains('tab-inactive')).toBe(true);
        });

        it('RTL mirrors Login Arrow and Moon to left, LTR preserves original orientation', () => {
            const cssSrc = readSrc('src/styles.css');
            expect(cssSrc).toMatch(/\[dir="rtl"\] #authSection \.fa-sign-in-alt\s*\{\s*transform:\s*(?:rotateY\(180deg\)|scaleX\(-1\)|scale\(-1,\s*1\))/);
            expect(cssSrc).toMatch(/\[dir="rtl"\] #moonIcon\s*\{\s*transform:\s*(?:rotateY\(180deg\)|scaleX\(-1\)|scale\(-1,\s*1\))/);

            expect(isRTL('ar')).toBe(true);
            expect(getDir('ar')).toBe('rtl');
            expect(isRTL('en')).toBe(false);
            expect(getDir('en')).toBe('ltr');
        });
    });

    describe('Issue 4: Hand Pointer (cursor-pointer) on Buttons', () => {
        it('navigation.ts, main.ts, and styles.css include cursor-pointer for specified buttons', () => {
            const navSrc = readSrc('src/shared/components/navigation.ts');
            const mainSrc = readSrc('src/main.ts');
            const cssSrc = readSrc('src/styles.css');

            expect(mainSrc).toMatch(/id="searchBtn"[^>]*cursor-pointer/);
            expect(navSrc).toMatch(/data-csp-fn="showLoginModal"[^>]*cursor-pointer/);
            expect(navSrc).toMatch(/data-csp-fn="toggleUserMenu"[^>]*cursor-pointer/);
            expect(cssSrc).toMatch(/\.category-tab-active\s*\{[^}]*cursor:\s*pointer/);
            expect(cssSrc).toMatch(/\.category-tab-inactive\s*\{[^}]*cursor:\s*pointer/);
            expect(cssSrc).toMatch(/\.tab-active\s*\{[^}]*cursor:\s*pointer/);
            expect(cssSrc).toMatch(/\.tab-inactive\s*\{[^}]*cursor:\s*pointer/);
        });
    });
});

