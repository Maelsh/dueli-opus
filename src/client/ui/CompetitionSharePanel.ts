/**
 * @file src/client/ui/CompetitionSharePanel.ts
 * @description UNIT35.1 — competition page share (Web Share API + platform fallbacks).
 */

import { getDir, t } from '../../i18n';
import { State } from '../core/State';
import { Toast } from './Toast';
import {
    buildCompetitionShareCopy,
    buildPlatformShareHref,
    type CompetitionShareInput,
    type SharePlatform,
} from '../../lib/competitionShare';

const PLATFORMS: SharePlatform[] = ['whatsapp', 'telegram', 'facebook', 'x', 'linkedin', 'email'];

function platformLabel(platform: SharePlatform, lang: string): string {
    const key = `competition_share.platform_${platform}` as const;
    const tr = t(key, lang);
    return tr !== key ? tr : platform;
}

function upsertMeta(property: string, content: string): void {
    if (typeof document === 'undefined') return;
    let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null;
    if (!el) {
        el = document.createElement('meta');
        el.setAttribute('property', property);
        document.head.appendChild(el);
    }
    el.setAttribute('content', content);
}

export class CompetitionSharePanel {
    private static overlay: HTMLElement | null = null;

    /** Client-side hint for humans; crawlers may not execute this script. */
    static syncPageMeta(comp: CompetitionShareInput): void {
        if (typeof document === 'undefined') return;
        const lang = State.lang;
        const copy = buildCompetitionShareCopy(comp, lang, window.location.origin);
        document.title = `${copy.title} | Dueli`;
        upsertMeta('og:title', copy.title);
        upsertMeta('og:url', copy.url);
        upsertMeta('og:description', copy.text.split('\n').slice(0, 3).join(' · '));
    }

    static setPayload(comp: CompetitionShareInput | null): void {
        if (typeof window === 'undefined') return;
        (window as unknown as { __competitionSharePayload?: CompetitionShareInput | null }).__competitionSharePayload = comp;
        if (comp) this.syncPageMeta(comp);
    }

    static async open(): Promise<void> {
        const payload = (typeof window !== 'undefined'
            ? (window as unknown as { __competitionSharePayload?: CompetitionShareInput }).__competitionSharePayload
            : undefined);
        if (!payload?.id) return;

        const lang = State.lang;
        const copy = buildCompetitionShareCopy(payload, lang, window.location.origin);
        const nav = typeof navigator !== 'undefined' ? navigator : undefined;

        if (nav && typeof nav.share === 'function') {
            try {
                await nav.share({ title: copy.title, text: copy.text, url: copy.url });
                return;
            } catch (err) {
                const name = err instanceof Error ? err.name : '';
                if (name === 'AbortError') return;
            }
        }

        this.renderFallback(copy, lang);
    }

    private static close(): void {
        if (this.overlay) {
            this.overlay.remove();
            this.overlay = null;
        }
    }

    private static renderFallback(copy: ReturnType<typeof buildCompetitionShareCopy>, lang: string): void {
        this.close();
        const dir = getDir(lang);
        const overlay = document.createElement('div');
        overlay.className = 'fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/50 p-4';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', t('competition_share.dialog_title', lang));

        const panel = document.createElement('div');
        panel.className = 'w-full max-w-md rounded-2xl bg-white dark:bg-gray-900 shadow-xl border border-gray-200 dark:border-gray-700 p-5';
        panel.setAttribute('dir', dir);

        const title = document.createElement('h2');
        title.className = 'text-lg font-bold text-gray-900 dark:text-white mb-3';
        title.textContent = t('competition_share.dialog_title', lang);

        const preview = document.createElement('pre');
        preview.className = 'text-xs whitespace-pre-wrap break-words text-gray-600 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 rounded-lg p-3 mb-4 max-h-40 overflow-auto';
        preview.textContent = copy.text;

        const grid = document.createElement('div');
        grid.className = 'grid grid-cols-2 gap-2 mb-3';

        for (const platform of PLATFORMS) {
            const a = document.createElement('a');
            a.className = 'inline-flex items-center justify-center gap-2 rounded-lg border border-gray-200 dark:border-gray-700 px-3 py-2 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800';
            a.href = buildPlatformShareHref(platform, copy);
            a.target = '_blank';
            a.rel = 'noopener noreferrer';
            a.textContent = platformLabel(platform, lang);
            grid.appendChild(a);
        }

        const copyBtn = document.createElement('button');
        copyBtn.type = 'button';
        copyBtn.className = 'w-full rounded-lg bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2.5 mb-2';
        copyBtn.textContent = t('competition_share.copy_link', lang);
        copyBtn.addEventListener('click', async () => {
            const ok = await CompetitionSharePanel.copyText(copy.url, lang);
            if (ok) Toast.show(t('competition_share.copy_success', lang), 'success');
            else Toast.show(t('competition_share.copy_failed', lang), 'error');
        });

        const closeBtn = document.createElement('button');
        closeBtn.type = 'button';
        closeBtn.className = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 py-2 text-sm text-gray-600 dark:text-gray-300';
        closeBtn.textContent = t('competition_share.close', lang);
        closeBtn.addEventListener('click', () => this.close());

        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) this.close();
        });

        panel.appendChild(title);
        panel.appendChild(preview);
        panel.appendChild(grid);
        panel.appendChild(copyBtn);
        panel.appendChild(closeBtn);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.overlay = overlay;
    }

    private static async copyText(text: string, lang: string): Promise<boolean> {
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
                return true;
            }
        } catch {
            /* fall through */
        }
        try {
            const ta = document.createElement('textarea');
            ta.value = text;
            ta.setAttribute('readonly', 'true');
            ta.style.position = 'fixed';
            ta.style.left = '-9999px';
            document.body.appendChild(ta);
            ta.select();
            const ok = document.execCommand('copy');
            ta.remove();
            return ok;
        } catch {
            Toast.show(t('competition_share.copy_failed', lang), 'error');
            return false;
        }
    }
}

export function openCompetitionShare(): void {
    void CompetitionSharePanel.open();
}

export function syncCompetitionShareMeta(comp: CompetitionShareInput): void {
    CompetitionSharePanel.setPayload(comp);
}
