/**
 * @file src/client/ui/RecordingDownloadPanel.ts
 * @description R4-CHUNK-DOWNLOAD-1: accessible, bilingual recording download UI.
 * @module client/ui/RecordingDownloadPanel
 *
 * CSP-safe by construction: no inline handlers, no `style=""` attributes, no
 * HTML string injection. Progress width is written through CSSOM, which CSP
 * does not block. The panel is deliberately thin: all fetching, remuxing,
 * conversion, retry/cancel and cleanup live in RecordingDownloadService.
 *
 * Guest policy: the panel is never opened for guests. The download button is
 * hidden until the page knows an authenticated session; the server route is
 * still the security boundary.
 */

import { getDir, t } from '../../i18n';
import { DUELI_PRIMARY_GRADIENT, DUELI_PRIMARY_GRADIENT_HOVER } from '../../shared/constants';
import type {
    DownloadManifest,
    DownloadMode,
} from '../../lib/services/ChunkDownloadManifest';
import {
    DownloadCancelledError,
    DownloadFailedError,
    RecordingDownloadService,
    type DownloadFailureCode,
    type DownloadPhase,
    type DownloadProgress,
    type DownloadResult,
    type PreflightResult,
} from '../services/RecordingDownloadService';

export interface RecordingDownloadPanelOptions {
    service?: RecordingDownloadService;
}

const ERROR_KEYS: Record<DownloadFailureCode, string> = {
    unauthorized: 'download_ui.error_not_authenticated',
    not_authenticated: 'download_ui.error_not_authenticated',
    manifest_failed: 'download_ui.error_manifest',
    preflight_failed: 'download_ui.error_manifest',
    incomplete_recording: 'download_ui.error_not_finalized',
    chunk_fetch_failed: 'download_ui.error_chunk_fetch',
    chunk_integrity_failed: 'download_ui.error_chunk_integrity',
    assembly_failed: 'download_ui.error_assembly',
    ffmpeg_unavailable: 'download_ui.error_ffmpeg_unavailable',
    ffmpeg_failed: 'download_ui.error_ffmpeg',
    output_validation_failed: 'download_ui.error_output_validation',
    cancelled: 'download_ui.cancelled',
    unknown: 'download_ui.error_unknown',
};

const PHASE_KEYS: Record<DownloadPhase, string> = {
    preflight: 'download_ui.analyzing',
    fetching: 'download_ui.progress_fetching',
    preparing: 'download_ui.progress_preparing',
    assembling: 'download_ui.progress_assembling',
    converting: 'download_ui.progress_converting',
    finalizing: 'download_ui.progress_finalizing',
    done: 'download_ui.progress_done',
};

/** Translation key for a failure code (exposed for tests). */
export function downloadErrorKey(code: DownloadFailureCode): string {
    return ERROR_KEYS[code] ?? 'download_ui.error_unknown';
}

/** AR/EN-aware byte formatter (exposed for tests). */
export function formatDownloadBytes(bytes: number, lang = 'en'): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = bytes;
    let unit = 0;
    while (value >= 1024 && unit < units.length - 1) {
        value /= 1024;
        unit++;
    }
    const digits = unit === 0 ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2;
    try {
        return `${new Intl.NumberFormat(lang === 'ar' ? 'ar' : 'en', { maximumFractionDigits: digits }).format(value)} ${units[unit]}`;
    } catch {
        return `${value.toFixed(digits)} ${units[unit]}`;
    }
}

/** H:MM:SS / M:SS formatter (exposed for tests). */
export function formatDownloadDuration(ms: number): string {
    if (!Number.isFinite(ms) || ms <= 0) return '0:00';
    const total = Math.round(ms / 1000);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Auth hint for UI visibility only. The server manifest route is the actual
 * authorization boundary; a stale local hint can never grant access.
 */
export function isDownloadUserAuthenticated(): boolean {
    if (typeof window === 'undefined') return false;
    const win = window as unknown as { currentUser?: { id?: number } | null };
    if (win.currentUser && win.currentUser.id) return true;
    try {
        // Non-secret UI hint only; the server manifest route is the actual
        // authorization boundary. No session key is read or written here.
        const storedUser = localStorage.getItem('user');
        if (!storedUser) return false;
        const parsed = JSON.parse(storedUser) as { id?: number } | null;
        return !!parsed && !!parsed.id;
    } catch {
        return false;
    }
}

function currentLanguage(): string {
    if (typeof document !== 'undefined') {
        const lang = (document.documentElement.lang || '').toLowerCase();
        return lang.startsWith('ar') ? 'ar' : 'en';
    }
    return 'en';
}

interface PanelElementMap {
    div: HTMLDivElement;
    p: HTMLParagraphElement;
    h2: HTMLHeadingElement;
    button: HTMLButtonElement;
    pre: HTMLPreElement;
    i: HTMLElement;
}

function el<K extends keyof PanelElementMap>(
    tag: K,
    className?: string,
    text?: string
): PanelElementMap[K] {
    const node = document.createElement(tag) as PanelElementMap[K];
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function appendChildren(parent: HTMLElement, ...children: HTMLElement[]): void {
    for (const child of children) parent.appendChild(child);
}

interface PanelRefs {
    overlay: HTMLDivElement;
    dialog: HTMLDivElement;
    title: HTMLHeadingElement;
    status: HTMLParagraphElement;
    meta: HTMLDivElement;
    rights: HTMLParagraphElement;
    resource: HTMLParagraphElement;
    partial: HTMLDivElement;
    progressWrap: HTMLDivElement;
    progressBar: HTMLDivElement;
    progressTrack: HTMLDivElement;
    progressText: HTMLParagraphElement;
    errorBox: HTMLDivElement;
    errorText: HTMLParagraphElement;
    errorDetail: HTMLPreElement;
    startBtn: HTMLButtonElement;
    cancelBtn: HTMLButtonElement;
    retryBtn: HTMLButtonElement;
    saveBtn: HTMLButtonElement;
    closeBtn: HTMLButtonElement;
}

const MODE_KEYS: Record<DownloadMode, string> = {
    'mp4-remux': 'download_ui.mode_mp4_remux',
    ffmpeg: 'download_ui.mode_ffmpeg',
    none: 'download_ui.mode_none',
};

export class RecordingDownloadPanel {
    private static current: RecordingDownloadPanel | null = null;

    private readonly competitionId: number;
    private readonly service: RecordingDownloadService;
    private readonly lang: string;
    private readonly refs: PanelRefs;
    private manifest: DownloadManifest | null = null;
    private preflight: PreflightResult | null = null;
    private result: DownloadResult | null = null;
    private busy = false;
    private destroyed = false;
    private manifestController: AbortController | null = null;

    private constructor(competitionId: number, options: RecordingDownloadPanelOptions) {
        this.competitionId = competitionId;
        this.service = options.service ?? new RecordingDownloadService();
        this.lang = currentLanguage();
        this.refs = this.build();
        this.bind();
    }

    /** Open the download dialog for an authenticated user. */
    static open(competitionId: number, options: RecordingDownloadPanelOptions = {}): RecordingDownloadPanel | null {
        if (typeof document === 'undefined' || !document.body) return null;
        if (!Number.isFinite(competitionId) || competitionId <= 0) return null;
        if (!isDownloadUserAuthenticated()) return null;

        if (RecordingDownloadPanel.current) {
            RecordingDownloadPanel.current.close();
        }
        const panel = new RecordingDownloadPanel(competitionId, options);
        RecordingDownloadPanel.current = panel;
        document.body.appendChild(panel.refs.overlay);
        panel.refs.closeBtn.focus();
        void panel.loadManifest();
        return panel;
    }

    /** Close any open panel (used by navigation/tests). */
    static closeCurrent(): void {
        RecordingDownloadPanel.current?.close();
    }

    private build(): PanelRefs {
        const overlay = el('div', 'fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4');
        overlay.setAttribute('data-recording-download', String(this.competitionId));
        const dialog = el('div', 'w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-gray-200 bg-white p-5 shadow-2xl dark:border-gray-700 dark:bg-gray-900');
        dialog.setAttribute('role', 'dialog');
        dialog.setAttribute('aria-modal', 'true');
        dialog.setAttribute('aria-labelledby', 'recordingDownloadTitle');
        dialog.setAttribute('dir', getDir(this.lang));

        const header = el('div', 'mb-3 flex items-start justify-between gap-3');
        const title = el('h2', 'text-lg font-bold text-gray-900 dark:text-white', t('download_ui.title', this.lang));
        title.id = 'recordingDownloadTitle';
        const closeBtn = el('button', 'flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700');
        closeBtn.type = 'button';
        closeBtn.setAttribute('aria-label', t('download_ui.close', this.lang));
        const closeIcon = el('i', 'fas fa-times');
        closeIcon.setAttribute('aria-hidden', 'true');
        closeBtn.appendChild(closeIcon);
        appendChildren(header, title, closeBtn);

        const status = el('p', 'min-h-[1.25rem] text-sm text-gray-600 dark:text-gray-300');
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');

        const meta = el('div', 'mt-2 grid grid-cols-2 gap-2 text-sm');
        const rights = el('p', 'mt-3 rounded-lg bg-blue-50 p-3 text-xs leading-5 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100');
        const resource = el('p', 'mt-2 text-[11px] leading-5 text-gray-500 dark:text-gray-400');
        const partial = el('div', 'mt-3 hidden rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs leading-5 text-amber-900 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100');

        const progressWrap = el('div', 'mt-4 hidden');
        const progressTrack = el('div', 'h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700');
        progressTrack.setAttribute('role', 'progressbar');
        progressTrack.setAttribute('aria-valuemin', '0');
        progressTrack.setAttribute('aria-valuemax', '100');
        progressTrack.setAttribute('aria-valuenow', '0');
        progressTrack.setAttribute('aria-label', t('download_ui.aria_progress', this.lang));
        const progressBar = el('div', 'h-full w-0 rounded-full bg-purple-600 transition-all');
        progressTrack.appendChild(progressBar);
        const progressText = el('p', 'mt-1 text-xs text-gray-600 dark:text-gray-300');
        appendChildren(progressWrap, progressTrack, progressText);

        const errorBox = el('div', 'mt-3 hidden rounded-lg border border-red-300 bg-red-50 p-3 text-xs leading-5 text-red-900 dark:border-red-800 dark:bg-red-950/40 dark:text-red-100');
        const errorText = el('p', 'font-semibold');
        const errorDetail = el('pre', 'mt-1 hidden whitespace-pre-wrap break-words text-[11px] font-normal opacity-80');
        appendChildren(errorBox, errorText, errorDetail);

        const footer = el('div', 'mt-4 flex flex-wrap items-center justify-end gap-2');
        const startBtn = el('button', `rounded-lg ${DUELI_PRIMARY_GRADIENT} ${DUELI_PRIMARY_GRADIENT_HOVER} px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50`, t('download_ui.start', this.lang));
        startBtn.type = 'button';
        startBtn.disabled = true;
        const cancelBtn = el('button', 'hidden rounded-lg bg-gray-200 px-4 py-2 text-sm font-semibold text-gray-800 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600', t('download_ui.cancel', this.lang));
        cancelBtn.type = 'button';
        const retryBtn = el('button', 'hidden rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-700', t('download_ui.retry', this.lang));
        retryBtn.type = 'button';
        const saveBtn = el('button', 'hidden rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700', t('download_ui.save_again', this.lang));
        saveBtn.type = 'button';
        appendChildren(footer, saveBtn, retryBtn, cancelBtn, startBtn);

        appendChildren(dialog, header, status, meta, rights, partial, resource, progressWrap, errorBox, footer);
        overlay.appendChild(dialog);

        return {
            overlay, dialog, title, status, meta, rights, resource, partial,
            progressWrap, progressBar, progressTrack, progressText,
            errorBox, errorText, errorDetail,
            startBtn, cancelBtn, retryBtn, saveBtn, closeBtn,
        };
    }

    private bind(): void {
        const refs = this.refs;
        refs.closeBtn.addEventListener('click', () => this.close());
        refs.startBtn.addEventListener('click', () => { void this.start(); });
        refs.cancelBtn.addEventListener('click', () => this.cancel());
        refs.retryBtn.addEventListener('click', () => { void this.retry(); });
        refs.saveBtn.addEventListener('click', () => {
            if (this.result) RecordingDownloadService.saveBlob(this.result.blob, this.result.filename);
        });
        refs.overlay.addEventListener('click', (event) => {
            if (event.target === refs.overlay) this.close();
        });
        refs.dialog.addEventListener('keydown', (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                this.close();
            }
        });
    }

    private setStatus(text: string): void {
        this.refs.status.textContent = text;
    }

    private showError(message: string, detail?: string): void {
        this.refs.errorBox.classList.remove('hidden');
        this.refs.errorText.textContent = message;
        if (detail) {
            this.refs.errorDetail.textContent = detail;
            this.refs.errorDetail.classList.remove('hidden');
        } else {
            this.refs.errorDetail.textContent = '';
            this.refs.errorDetail.classList.add('hidden');
        }
    }

    private clearError(): void {
        this.refs.errorBox.classList.add('hidden');
        this.refs.errorText.textContent = '';
        this.refs.errorDetail.textContent = '';
        this.refs.errorDetail.classList.add('hidden');
    }

    private setBusy(busy: boolean): void {
        this.busy = busy;
        this.refs.startBtn.disabled = busy || !this.preflight?.ok;
        this.refs.cancelBtn.disabled = false;
        this.refs.cancelBtn.classList.toggle('hidden', !busy);
        this.refs.retryBtn.classList.add('hidden');
        this.refs.saveBtn.classList.add('hidden');
        this.refs.progressWrap.classList.toggle('hidden', !busy);
        if (!busy) {
            this.refs.startBtn.classList.toggle('hidden', !!this.result);
        }
    }

    private setProgress(progress: DownloadProgress): void {
        const percent = Math.max(0, Math.min(100, Math.round(progress.percent)));
        this.refs.progressBar.style.width = `${percent}%`;
        this.refs.progressTrack.setAttribute('aria-valuenow', String(percent));
        const phaseKey = PHASE_KEYS[progress.phase];
        const bytes = progress.totalBytes > 0
            ? ` — ${formatDownloadBytes(progress.bytesReceived, this.lang)} / ${formatDownloadBytes(progress.totalBytes, this.lang)}`
            : '';
        this.refs.progressText.textContent = `${t(phaseKey, this.lang)} ${percent}%${bytes}`;
    }

    private metaItem(labelKey: string, value: string): HTMLDivElement {
        const item = el('div', 'rounded-lg bg-gray-50 p-2 dark:bg-gray-800/70');
        const label = el('div', 'text-[11px] uppercase tracking-wide text-gray-500 dark:text-gray-400', t(labelKey, this.lang));
        const text = el('div', 'text-sm font-semibold text-gray-900 dark:text-white', value);
        appendChildren(item, label, text);
        return item;
    }

    private async loadManifest(): Promise<void> {
        if (this.destroyed) return;
        this.manifestController?.abort();
        this.manifestController = new AbortController();
        this.setStatus(t('download_ui.loading_manifest', this.lang));
        this.refs.startBtn.disabled = true;
        this.clearError();
        this.refs.partial.classList.add('hidden');
        this.refs.meta.replaceChildren();
        this.refs.rights.textContent = '';
        try {
            const manifest = await this.service.loadManifest(this.competitionId, this.manifestController.signal);
            if (this.destroyed) return;
            this.manifest = manifest;
            this.renderManifest(manifest);
        } catch (error) {
            if (this.destroyed) return;
            if (error instanceof DownloadCancelledError) return;
            const detail = error instanceof DownloadFailedError ? error.details : undefined;
            const code = error instanceof DownloadFailedError ? error.code : 'manifest_failed';
            this.setStatus('');
            this.showError(t(downloadErrorKey(code === 'manifest_failed' ? 'manifest_failed' : code), this.lang), detail);
            this.refs.retryBtn.classList.remove('hidden');
        }
    }

    private renderManifest(manifest: DownloadManifest): void {
        const allowPartial = manifest.finalized && !manifest.complete;
        const preflight = RecordingDownloadService.preflight(manifest, { allowPartial });
        this.preflight = preflight;

        this.setStatus('');
        this.clearError();
        this.refs.retryBtn.classList.add('hidden');
        this.refs.rights.textContent = t(manifest.rights.notice_key, this.lang);
        this.refs.resource.textContent = manifest.mode === 'ffmpeg'
            ? t('download_ui.resource_note', this.lang)
            : '';
        this.refs.meta.replaceChildren(
            this.metaItem('download_ui.meta_size', manifest.unknown_bytes
                ? `${formatDownloadBytes(manifest.total_bytes, this.lang)} +`
                : formatDownloadBytes(manifest.total_bytes, this.lang)),
            this.metaItem('download_ui.meta_duration', formatDownloadDuration(manifest.total_duration_ms)),
            this.metaItem('download_ui.meta_chunks', String(manifest.chunks.length)),
            this.metaItem('download_ui.meta_mode', t(MODE_KEYS[manifest.mode], this.lang)),
        );

        const completeLabel = el('div', `mb-1 font-semibold ${manifest.complete
            ? 'text-green-700 dark:text-green-300'
            : 'text-amber-800 dark:text-amber-200'}`, t(manifest.complete ? 'download_ui.complete_label' : 'download_ui.partial_label', this.lang));
        this.refs.partial.replaceChildren(completeLabel);
        if (!manifest.complete) {
            const notice = el('p', '', t('download_ui.partial_notice', this.lang));
            this.refs.partial.appendChild(notice);
            if (manifest.gaps.length > 0 || manifest.unready_sequences.length > 0 || manifest.failed_sequences.length > 0) {
                const numbers = [
                    ...manifest.gaps,
                    ...manifest.unready_sequences,
                    ...manifest.failed_sequences,
                ].sort((a, b) => a - b);
                const detail = el('p', 'mt-1 text-[11px] opacity-80', `${t('download_ui.error_detail', this.lang)}: ${numbers.join(', ')}`);
                this.refs.partial.appendChild(detail);
            }
            this.refs.partial.classList.remove('hidden');
        } else {
            this.refs.partial.classList.add('hidden');
        }

        const firstIssue = preflight.issues[0];
        if (!preflight.ok && firstIssue) {
            this.setStatus('');
            this.showError(t(firstIssue.message_key, this.lang), firstIssue.code);
            this.refs.startBtn.disabled = true;
            return;
        }
        if (!manifest.complete) {
            this.setStatus(t('download_ui.partial_notice', this.lang));
        }
        this.refs.startBtn.textContent = t(allowPartial ? 'download_ui.start_partial' : 'download_ui.start', this.lang);
        this.refs.startBtn.disabled = false;
    }

    private async start(): Promise<void> {
        if (this.busy || !this.manifest || !this.preflight?.ok) return;
        const manifest = this.manifest;
        this.result = null;
        this.clearError();
        this.setBusy(true);
        this.setStatus(t('download_ui.analyzing', this.lang));
        try {
            const result = await this.service.download(manifest, {
                allowPartial: this.preflight.partialDownload,
                onProgress: (progress) => {
                    if (!this.destroyed) {
                        this.setStatus(t(PHASE_KEYS[progress.phase], this.lang));
                        this.setProgress(progress);
                    }
                },
            });
            if (this.destroyed) return;
            this.result = result;
            this.setBusy(false);
            this.refs.progressWrap.classList.add('hidden');
            this.setStatus(t(result.partial ? 'download_ui.success_partial' : 'download_ui.success', this.lang)
                .replace('{size}', formatDownloadBytes(result.blob.size, this.lang))
                .replace('{duration}', formatDownloadDuration(result.durationMs)));
            this.refs.saveBtn.classList.remove('hidden');
            this.refs.startBtn.classList.add('hidden');
            RecordingDownloadService.saveBlob(result.blob, result.filename);
        } catch (error) {
            if (this.destroyed) return;
            this.setBusy(false);
            this.refs.progressWrap.classList.add('hidden');
            if (error instanceof DownloadCancelledError) {
                this.setStatus(t('download_ui.cancelled', this.lang));
                this.refs.startBtn.classList.add('hidden');
                this.refs.retryBtn.classList.remove('hidden');
                return;
            }
            const failed = error instanceof DownloadFailedError ? error : null;
            const key = failed && failed.code === 'preflight_failed' && failed.message.startsWith('download_ui.')
                ? failed.message
                : downloadErrorKey(failed?.code ?? 'unknown');
            this.setStatus('');
            this.showError(t(key, this.lang), failed?.details);
            this.refs.startBtn.classList.add('hidden');
            this.refs.retryBtn.classList.remove('hidden');
        }
    }

    private cancel(): void {
        if (!this.busy) return;
        this.refs.cancelBtn.disabled = true;
        this.setStatus(t('download_ui.cancelled_cleanup', this.lang));
        this.service.cancel();
    }

    private async retry(): Promise<void> {
        if (this.busy) return;
        this.refs.retryBtn.classList.add('hidden');
        if (!this.manifest || !this.preflight || !this.preflight.ok) {
            this.manifest = null;
            this.preflight = null;
            await this.loadManifest();
            return;
        }
        await this.start();
    }

    private close(): void {
        if (this.destroyed) return;
        this.destroyed = true;
        this.manifestController?.abort();
        if (this.busy) this.service.cancel();
        this.refs.overlay.remove();
        if (RecordingDownloadPanel.current === this) RecordingDownloadPanel.current = null;
    }
}

export default RecordingDownloadPanel;
