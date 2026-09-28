/**
 * Modal accessibility, proven behaviourally against a real (shimmed) DOM:
 * dialog semantics, initial focus, Tab / Shift+Tab wrapping, Escape
 * dismissal, focus restoration to the trigger and body-scroll restoration —
 * for both the id-based modal and the dynamically created custom modal.
 *
 * The project runs Vitest with `environment: 'node'` and ships no jsdom /
 * happy-dom dependency (same approach as `tests/helpers/dom-harness.ts`), so
 * the shim below implements exactly what `Modal.ts` touches.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getLoginModal } from '../../src/shared/components/login-modal';
import { DUELI_AUTH_GRADIENT, DUELI_MODAL_GRADIENT } from '../../src/shared/constants';

class ShimElement {
    tagName: string;
    attrs: Record<string, string> = {};
    classes = new Set<string>();
    children: ShimElement[] = [];
    parent: ShimElement | null = null;
    innerHTML = '';
    disabled = false;
    /** No layout engine here: offsetParent is always null, like jsdom. */
    offsetParent: ShimElement | null = null;
    style: Record<string, string> = {};
    textContent = '';
    doc!: ShimDocument;

    constructor(tag: string, doc?: ShimDocument) {
        this.tagName = tag.toUpperCase();
        if (doc) this.doc = doc;
    }

    get classList() {
        return {
            add: (...c: string[]) => c.forEach((x) => x && this.classes.add(x)),
            remove: (...c: string[]) => c.forEach((x) => this.classes.delete(x)),
            contains: (c: string) => this.classes.has(c),
        };
    }

    get className(): string { return [...this.classes].join(' '); }
    set className(v: string) { this.classes = new Set(v.split(/\s+/).filter(Boolean)); }

    setAttribute(n: string, v: string) { this.attrs[n] = v; }
    getAttribute(n: string): string | null { return n in this.attrs ? this.attrs[n] : null; }
    hasAttribute(n: string): boolean { return n in this.attrs; }
    getAttributeNames(): string[] { return Object.keys(this.attrs); }

    appendChild(child: ShimElement): ShimElement {
        child.parent = this;
        this.children.push(child);
        return child;
    }

    remove(): void {
        if (!this.parent) return;
        this.parent.children = this.parent.children.filter((c) => c !== this);
        this.parent = null;
    }

    get parentElement(): ShimElement | null { return this.parent; }

    contains(node: ShimElement | null): boolean {
        for (let cur = node; cur; cur = cur.parent) if (cur === this) return true;
        return false;
    }

    focus(): void { this.doc.activeElement = this; }

    querySelectorAll(selector: string): ShimElement[] {
        const out: ShimElement[] = [];
        const walk = (n: ShimElement) => { for (const c of n.children) { out.push(c); walk(c); } };
        walk(this);
        return out.filter((el) => selector.split(',').some((p) => matchesPart(el, p.trim())));
    }

    querySelector(selector: string): ShimElement | null {
        return this.querySelectorAll(selector)[0] ?? null;
    }
}

interface ShimDocument {
    activeElement: ShimElement | null;
    body: ShimElement;
    el(tag: string): ShimElement;
    getElementById(id: string): ShimElement | null;
    createElement(tag: string): ShimElement;
    querySelector(sel: string): ShimElement | null;
    querySelectorAll(sel: string): ShimElement[];
    addEventListener(type: string, fn: (e: unknown) => void): void;
    removeEventListener(type: string, fn: (e: unknown) => void): void;
    contains(n: ShimElement): boolean;
}

function hasAttr(el: ShimElement, attr: string): boolean {
    const m = /^\[([\w-]+)(?:=["']?([^\]"']*)["']?)?\]$/.exec(attr.trim());
    if (!m) return false;
    const [, name, value] = m;
    if (!(name in el.attrs)) return false;
    return value === undefined || el.attrs[name] === value;
}

/** One comma-separated selector part, honouring a single `:not(...)`. */
function matchesPart(el: ShimElement, part: string): boolean {
    const [head, ...rest] = part.split(':not(');
    const not = rest.length ? rest[0].replace(')', '').trim() : null;
    if (not && hasAttr(el, not)) return false;

    const tag = (/^([a-z]*)/i.exec(head.trim()) || [''])[1];
    if (tag && el.tagName !== tag.toUpperCase()) return false;

    for (const attr of head.match(/\[[^\]]*\]/g) || []) {
        if (!hasAttr(el, attr)) return false;
    }
    return true;
}

function installDom(): ShimDocument {
    const listeners: Record<string, ((e: unknown) => void)[]> = {};
    const doc = {} as ShimDocument;

    doc.activeElement = null;
    doc.body = new ShimElement('body', doc);
    doc.el = (tag: string) => new ShimElement(tag, doc);
    doc.getElementById = (id) => doc.body.querySelector(`[id="${id}"]`);
    doc.createElement = (tag) => doc.el(tag);
    doc.querySelector = (sel) => doc.body.querySelector(sel);
    doc.querySelectorAll = (sel) => doc.body.querySelectorAll(sel);
    doc.contains = (n) => doc.body.contains(n);
    doc.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
    doc.removeEventListener = (type, fn) => {
        listeners[type] = (listeners[type] || []).filter((x) => x !== fn);
    };

    const g = globalThis as Record<string, unknown>;
    (g as Record<string, unknown>).__modalTestListeners = listeners;
    g.document = doc;
    g.HTMLElement = ShimElement;
    g.Element = ShimElement;
    // Model `display:none` from the `hidden` class (the Tailwind convention the
    // modal uses for its register / forgot-password sub-forms), so the unit
    // test exercises the same ancestor-walk the browser does.
    g.getComputedStyle = (el: ShimElement) => ({
        display: el.classes.has('hidden') ? 'none' : 'block',
        visibility: 'visible',
    });
    g.MutationObserver = class { observe() { /* no-op */ } disconnect() { /* no-op */ } };
    return doc;
}

interface KeyEvent { key: string; shiftKey: boolean; defaultPrevented: boolean; preventDefault(): void }

function press(doc: ShimDocument, key: string, shift = false): KeyEvent {
    const ev: KeyEvent = {
        key,
        shiftKey: shift,
        defaultPrevented: false,
        preventDefault() { ev.defaultPrevented = true; },
    };
    // Re-dispatch through the registered capture listeners.
    const g = globalThis as unknown as { __modalTestListeners: Record<string, ((e: unknown) => void)[]> };
    for (const fn of g.__modalTestListeners.keydown || []) fn(ev);
    void doc;
    return ev;
}

/** Builds a modal root with `.modal-backdrop` / `.modal-content` and 3 buttons. */
function buildModal(doc: ShimDocument, id: string): ShimElement {
    const root = doc.el('div');
    root.setAttribute('id', id);
    root.className = 'hidden';

    const backdrop = doc.el('div');
    backdrop.className = 'modal-backdrop';
    root.appendChild(backdrop);

    const content = doc.el('div');
    content.className = 'modal-content';
    for (const name of ['first', 'middle', 'last']) {
        const btn = doc.el('button');
        btn.setAttribute('id', name);
        content.appendChild(btn);
    }
    root.appendChild(content);
    doc.body.appendChild(root);
    return root;
}

describe('login modal markup semantics', () => {
    it('the root is a modal dialog bound to its title and subtitle', () => {
        const html = getLoginModal('ar');
        expect(html).toMatch(/id="loginModal"[^>]*role="dialog"/);
        expect(html).toMatch(/aria-modal="true"/);
        expect(html).toMatch(/aria-labelledby="modalTitle"/);
        expect(html).toMatch(/aria-describedby="modalSubtitle"/);
    });

    it('the close control is labelled and its glyph is decorative', () => {
        const html = getLoginModal('ar');
        expect(html).toMatch(/aria-label="[^"]+"/);
        expect(html).toMatch(/aria-hidden="true"/);
    });

    it('the submit CTAs use the shared auth gradient', () => {
        expect(getLoginModal('ar')).toContain(DUELI_AUTH_GRADIENT);
    });
});

describe('Modal focus lifecycle', () => {
    let doc: ShimDocument;
    let root: ShimElement;
    let trigger: ShimElement;
    let Modal: typeof import('../../src/client/ui/Modal').Modal;

    beforeEach(async () => {
        doc = installDom();
        trigger = doc.el('button');
        trigger.setAttribute('id', 'openTrigger');
        doc.body.appendChild(trigger);
        root = buildModal(doc, 'testModal');
        vi.useFakeTimers();
        ({ Modal } = await import('../../src/client/ui/Modal'));
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    const open = () => {
        trigger.focus();
        Modal.show('testModal');
        vi.advanceTimersByTime(20);
    };

    it('opening sets dialog semantics and locks body scroll', () => {
        trigger.focus();
        Modal.show('testModal');
        expect(root.getAttribute('role')).toBe('dialog');
        expect(root.getAttribute('aria-modal')).toBe('true');
        expect(doc.body.style.overflow).toBe('hidden');
    });

    it('initial focus moves inside the modal, not onto the trigger', () => {
        open();
        expect(root.contains(doc.activeElement)).toBe(true);
        expect(doc.activeElement).not.toBe(trigger);
    });

    it('Tab on the last control wraps to the first', () => {
        open();
        const last = doc.getElementById('last')!;
        last.focus();
        const e = press(doc, 'Tab');
        expect(e.defaultPrevented).toBe(true);
        expect(doc.activeElement?.attrs.id).toBe('first');
    });

    it('Shift+Tab on the first control wraps to the last', () => {
        open();
        doc.getElementById('first')!.focus();
        const e = press(doc, 'Tab', true);
        expect(e.defaultPrevented).toBe(true);
        expect(doc.activeElement?.attrs.id).toBe('last');
    });

    it('focus in the middle is never yanked by the trap', () => {
        open();
        doc.getElementById('middle')!.focus();
        press(doc, 'Tab');
        expect(doc.activeElement?.attrs.id).toBe('middle');
    });

    it('Escape dismisses the modal and restores body scroll', () => {
        open();
        const e = press(doc, 'Escape');
        expect(e.defaultPrevented).toBe(true);
        vi.advanceTimersByTime(300);
        expect(root.classes.has('hidden')).toBe(true);
        expect(doc.body.style.overflow).toBe('');
    });

    it('closing restores focus to the element that opened the modal', () => {
        open();
        Modal.hide('testModal');
        vi.advanceTimersByTime(300);
        expect(doc.activeElement).toBe(trigger);
    });

    it('a closed modal releases the trap (Tab is not intercepted)', () => {
        Modal.show('testModal');
        Modal.hide('testModal');
        vi.advanceTimersByTime(300);
        expect(press(doc, 'Tab').defaultPrevented).toBe(false);
    });

    it('controls inside a hidden sub-form are excluded from the focus order', () => {
        // Regression: the auth modal keeps register / forgot-password forms
        // hidden. Trapping focus onto an invisible control breaks Tab wrap in
        // the real browser, so hidden subtrees must be skipped.
        const hidden = doc.el('div');
        hidden.className = 'hidden';
        const hiddenBtn = doc.el('button');
        hiddenBtn.setAttribute('id', 'hiddenBtn');
        hidden.appendChild(hiddenBtn);
        doc.getElementById('testModal')!.appendChild(hidden);

        open();
        (doc.getElementById('last') as ShimElement).focus();
        press(doc, 'Tab');
        // Wrapped to the first VISIBLE control, not to the hidden one.
        expect(doc.activeElement?.attrs.id).toBe('first');
    });
});

describe('custom modal lifecycle', () => {
    let doc: ShimDocument;
    let trigger: ShimElement;
    let Modal: typeof import('../../src/client/ui/Modal').Modal;

    beforeEach(async () => {
        doc = installDom();
        trigger = doc.el('button');
        trigger.setAttribute('id', 'openTrigger');
        doc.body.appendChild(trigger);
        ({ Modal } = await import('../../src/client/ui/Modal'));
    });

    it('is labelled, traps focus, and its CTA uses the shared modal gradient', () => {
        trigger.focus();
        Modal.showCustom('Coming soon', 'Provider X', 'OK');

        const modal = doc.querySelector('[role="dialog"]')!;
        expect(modal.getAttribute('aria-modal')).toBe('true');
        expect(modal.getAttribute('aria-label')).toBe('Coming soon');
        expect(modal.innerHTML).toContain(DUELI_MODAL_GRADIENT);
        expect(modal.contains(doc.activeElement)).toBe(true);
    });

    it('Escape closes it and hands focus back to the trigger', () => {
        trigger.focus();
        Modal.showCustom('T', 'M', 'OK');
        press(doc, 'Escape');

        expect(doc.querySelector('[role="dialog"]')).toBeNull();
        expect(doc.activeElement).toBe(trigger);
        expect(doc.body.style.overflow).toBe('');
    });
});
