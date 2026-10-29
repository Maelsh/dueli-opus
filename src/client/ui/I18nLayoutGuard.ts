/**
 * UNIT 35.2 — layout guard: proportional i18n labels + wrapped truncation tooltips.
 */

import { computeI18nFontScale } from '../../lib/i18nAutoFit';
import { DEFAULT_LANGUAGE, t, type Language } from '../../i18n';

const TOOLTIP_ID = 'dueli-truncate-tooltip';

function activeTooltip(): HTMLElement | null {
    return document.getElementById(TOOLTIP_ID);
}

function hideTooltip(): void {
    activeTooltip()?.remove();
}

function showTooltip(anchor: HTMLElement, text: string): void {
    hideTooltip();
    if (!text) return;
    const tip = document.createElement('div');
    tip.id = TOOLTIP_ID;
    tip.className = 'dueli-truncate-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = text;
    document.body.appendChild(tip);
    const rect = anchor.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const left = Math.max(8, Math.min(window.innerWidth - tipRect.width - 8, rect.left));
    const top = rect.bottom + 8 + tipRect.height > window.innerHeight
        ? rect.top - tipRect.height - 8
        : rect.bottom + 8;
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(8, top)}px`;
}

function isOverflowing(el: HTMLElement): boolean {
    return el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1;
}

function bindOneTruncationTarget(el: HTMLElement): void {
    if (el.dataset.dueliTruncateBound === '1') return;
    el.dataset.dueliTruncateBound = '1';
    const full = el.getAttribute('data-full-text') || el.textContent?.trim() || '';
    if (full && !el.getAttribute('title')) el.setAttribute('title', full);

    const reveal = () => {
        if (!isOverflowing(el)) return;
        showTooltip(el, full);
    };
    const conceal = () => hideTooltip();

    el.addEventListener('mouseenter', reveal);
    el.addEventListener('mouseleave', conceal);
    el.addEventListener('focus', reveal);
    el.addEventListener('blur', conceal);
}

export function bindTruncationTooltips(root: ParentNode = document): void {
    if (typeof document === 'undefined') return;
    root.querySelectorAll<HTMLElement>('[data-dueli-truncate]').forEach(bindOneTruncationTarget);
}

export function applyI18nAutoFit(root: ParentNode = document, lang: Language): void {
    if (typeof document === 'undefined') return;
    root.querySelectorAll<HTMLElement>('[data-i18n-fit]').forEach((el) => {
        const key = el.getAttribute('data-i18n-fit-key');
        const enText = key
            ? t(key, DEFAULT_LANGUAGE)
            : (el.getAttribute('data-i18n-en') || '');
        const localized = (el.textContent || '').trim();
        const scale = computeI18nFontScale(enText, localized, lang);
        el.style.setProperty('--i18n-font-scale', String(scale));
        if (!el.classList.contains('i18n-auto-fit')) el.classList.add('i18n-auto-fit');
    });
}

export function refreshI18nLayout(root: ParentNode = document, lang?: Language): void {
    const resolved = lang || (document.documentElement?.lang as Language) || DEFAULT_LANGUAGE;
    applyI18nAutoFit(root, resolved);
    bindTruncationTooltips(root);
}
