/**
 * @file src/client/ui/WatchLaterUI.ts
 * @description UNIT32.1 / R4-PROFILE-COLLECTIONS-1 — explicit Watch Later
 * toggle shared by every competition card and the competition page.
 *
 * Rules:
 *  - the SERVER is the only source of saved state: buttons start neutral and
 *    are painted from `GET /api/watch/later/status`, and a click paints only
 *    the confirmed add/remove response;
 *  - a guest is sent to the EXISTING login modal. No navigation happens and no
 *    return URL is accepted, so there is no open-redirect surface;
 *  - dynamically rendered cards (home rails, explore, search, profile lists)
 *    are hydrated through one MutationObserver + batched status calls.
 */
import { t } from '../../i18n';

type WatchLaterButton = HTMLElement & {
    dataset: DOMStringMap & {
        watchLaterToggle?: string;
        saved?: string;
        wlHydrated?: string;
        wlHydrating?: string;
        wlAddLabel?: string;
        wlRemoveLabel?: string;
        wlError?: string;
    };
};

const TOGGLE_SELECTOR = '[data-watch-later-toggle]';
const STATUS_CHUNK = 50;

export class WatchLaterUI {
    private static initialized = false;
    private static hydrating = false;
    private static hydrateQueued = false;

    /** Wire the observer and hydrate the first paint. Safe to call twice. */
    static init(): void {
        if (typeof document === 'undefined') return;
        if (this.initialized) {
            void this.hydrate(document);
            return;
        }
        this.initialized = true;

        if (typeof MutationObserver !== 'undefined' && document.documentElement) {
            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of Array.from(mutation.addedNodes)) {
                        if (node instanceof Element) {
                            if (node.matches(TOGGLE_SELECTOR) || node.querySelector(TOGGLE_SELECTOR)) {
                                void this.hydrate(document);
                                return;
                            }
                        }
                    }
                }
            });
            observer.observe(document.documentElement, { childList: true, subtree: true });
        }

        // Login can complete without a reload; the new session must repaint.
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
            window.addEventListener('dueli:auth-success', () => {
                for (const button of this.buttons()) {
                    delete button.dataset.wlHydrated;
                }
                void this.hydrate(document);
            });
        }

        void this.hydrate(document);
    }

    /**
     * One explicit save/remove. `competitionId` arrives from a trusted numeric
     * data attribute (the CSP delegate parses a JSON argument list).
     */
    static async toggle(competitionId: unknown): Promise<void> {
        const id = Number(competitionId);
        if (!Number.isSafeInteger(id) || id <= 0) return;

        let user: unknown = typeof window !== 'undefined' ? window.currentUser : null;
        if (!user && typeof window !== 'undefined' && typeof window.checkAuth === 'function') {
            // Canonical auth resolution may still be in flight on first paint.
            // Reuse it instead of misclassifying a signed-in user as a guest.
            // `checkAuth()` is authoritative even when App.init has not copied
            // the user onto `window.currentUser` yet.
            try {
                const authenticated = await window.checkAuth();
                if (authenticated) user = window.currentUser || true;
            } catch {
                // Fall through: an unresolved session is treated as a guest.
            }
        }
        if (!user) {
            // Existing login modal = the safe local return: the user stays on
            // the page they were on and no URL parameter is consumed.
            window.showLoginModal?.();
            return;
        }

        const current = this.buttons(id);
        if (current.length === 0) return;
        // A click can land while the batched status request is still in flight.
        // Wait for the authoritative paint instead of dropping the action; then
        // the add/remove decision is based on server truth, not the neutral
        // initial markup.
        const hydrateDeadline = Date.now() + 5000;
        while (
            current.some((button) => button.dataset.wlHydrating === '1')
            && Date.now() < hydrateDeadline
        ) {
            await new Promise((resolve) => setTimeout(resolve, 25));
        }
        if (current.some((button) => button.dataset.wlHydrating === '1')) return;

        const wasSaved = current.some((button) => button.dataset.saved === '1');
        for (const button of current) {
            button.dataset.wlHydrating = '1';
            button.setAttribute('aria-busy', 'true');
        }

        try {
            const res = await fetch(`/api/watch/later/${id}`, {
                method: wasSaved ? 'DELETE' : 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) throw new Error(`http_${res.status}`);
            const body = await res.json() as {
                success?: boolean;
                data?: { saved?: boolean };
            };
            if (!body || body.success !== true || !body.data || typeof body.data.saved !== 'boolean') {
                throw new Error('invalid_response');
            }

            const saved = body.data.saved === true;
            for (const button of this.buttons(id)) this.applySavedState(button, saved);

            const lang = typeof window !== 'undefined' ? (window.lang || 'en') : 'en';
            window.dueli?.showToast?.(
                t(saved ? 'watch_collections.added' : 'watch_collections.removed', lang),
                'success'
            );

            if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
                window.dispatchEvent(new CustomEvent('dueli:watch-later-changed', {
                    detail: { competitionId: id, saved },
                }));
            }
        } catch (error) {
            console.error('[WatchLaterUI] toggle failed:', error);
            const message = current[0].dataset.wlError
                || t('watch_collections.save_failed', (typeof window !== 'undefined' ? window.lang : null) || 'en');
            window.dueli?.showToast?.(message, 'error');
        } finally {
            for (const button of this.buttons(id)) {
                delete button.dataset.wlHydrating;
                button.removeAttribute?.('aria-busy');
            }
        }
    }

    /** Paint one button from confirmed server truth. */
    static applySavedState(button: WatchLaterButton, saved: boolean): void {
        const addLabel = button.dataset.wlAddLabel
            || t('watch_collections.add', (typeof window !== 'undefined' ? window.lang : null) || 'en');
        const removeLabel = button.dataset.wlRemoveLabel
            || t('watch_collections.remove', (typeof window !== 'undefined' ? window.lang : null) || 'en');
        const label = saved ? removeLabel : addLabel;

        button.dataset.saved = saved ? '1' : '0';
        button.setAttribute('aria-pressed', saved ? 'true' : 'false');
        button.setAttribute('title', label);
        button.setAttribute('aria-label', label);
        button.classList.toggle('text-purple-600', saved);
        button.classList.toggle('text-gray-400', !saved);

        const icon = button.querySelector('i');
        if (icon) {
            icon.className = saved ? 'fas fa-bookmark' : 'far fa-bookmark';
            icon.setAttribute?.('aria-hidden', 'true');
        }
    }

    /**
     * Batch-hydrate every unhydrated toggle under `root`. A failed status call
     * leaves the buttons neutral and retry-able; it never guesses.
     */
    static async hydrate(root: ParentNode = document): Promise<void> {
        if (this.hydrating) {
            this.hydrateQueued = true;
            return;
        }
        this.hydrating = true;
        try {
            do {
                this.hydrateQueued = false;
                const buttons = Array.from(root.querySelectorAll(TOGGLE_SELECTOR))
                    .map((node) => node as unknown as WatchLaterButton)
                    .filter((node) =>
                        !!node && typeof node === 'object' && !!node.dataset
                        && node.dataset.wlHydrated !== '1'
                        && node.dataset.wlHydrating !== '1'
                    );
                if (buttons.length === 0) continue;

                const byId = new Map<number, WatchLaterButton[]>();
                for (const button of buttons) {
                    const id = Number(button.dataset.watchLaterToggle);
                    if (!Number.isSafeInteger(id) || id <= 0) continue;
                    button.dataset.wlHydrating = '1';
                    const bucket = byId.get(id) || [];
                    bucket.push(button);
                    byId.set(id, bucket);
                }

                const ids = [...byId.keys()];
                for (let offset = 0; offset < ids.length; offset += STATUS_CHUNK) {
                    const chunk = ids.slice(offset, offset + STATUS_CHUNK);
                    try {
                        const res = await fetch(`/api/watch/later/status?ids=${chunk.join(',')}`);
                        if (!res.ok) throw new Error(`http_${res.status}`);
                        const body = await res.json() as {
                            success?: boolean;
                            data?: { saved?: unknown[] };
                        };
                        if (!body || body.success !== true || !body.data || !Array.isArray(body.data.saved)) {
                            throw new Error('invalid_response');
                        }
                        const saved = new Set((body.data.saved as unknown[]).map((value) => Number(value)));
                        for (const id of chunk) {
                            for (const button of byId.get(id) || []) {
                                this.applySavedState(button, saved.has(id));
                                button.dataset.wlHydrated = '1';
                                delete button.dataset.wlHydrating;
                            }
                        }
                    } catch (error) {
                        console.error('[WatchLaterUI] status hydration failed:', error);
                        for (const id of chunk) {
                            for (const button of byId.get(id) || []) delete button.dataset.wlHydrating;
                        }
                    }
                }
            } while (this.hydrateQueued);
        } finally {
            this.hydrating = false;
        }
    }

    private static buttons(id?: number): WatchLaterButton[] {
        if (typeof document === 'undefined') return [];
        const selector = id === undefined ? TOGGLE_SELECTOR : `[data-watch-later-toggle="${id}"]`;
        return Array.from(document.querySelectorAll(selector))
            .map((node) => node as unknown as WatchLaterButton)
            .filter((node) => !!node && typeof node === 'object' && !!node.dataset);
    }
}

export default WatchLaterUI;
