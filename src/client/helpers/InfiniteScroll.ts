/**
 * @file src/client/helpers/InfiniteScroll.ts
 * @description Infinite scroll with graceful degradation
 * @module client/helpers/InfiniteScroll
 *
 * Task 7: Graceful Degradation
 * When exact matches run out, progressively queries less relevant content
 * so the user never hits a hard "0 results" wall unless the DB is empty.
 */

import { ApiClient } from '../core/ApiClient';

interface InfiniteScrollOptions {
    container: string | HTMLElement;
    endpoint: string;
    renderItem: (item: any) => string;
    threshold?: number;
    limit?: number;
    emptyMessage?: string;
    loadingHTML?: string;
    params?: Record<string, string>;
    degradeMessage?: string;
}

/**
 * InfiniteScroll Class
 * Graceful degradation: when primary results are exhausted,
 * continues loading progressively less relevant content
 */
export class InfiniteScroll {
    private container: HTMLElement | null;
    private endpoint: string;
    private renderItem: (item: any) => string;
    private threshold: number;
    private limit: number;
    private offset: number = 0;
    private loading: boolean = false;
    private hasMore: boolean = true;
    private emptyMessage: string;
    private loadingHTML: string;
    private params: Record<string, string>;
    private degradeMessage: string;
    private observer: IntersectionObserver | null = null;
    private sentinel: HTMLElement | null = null;
    private loadedIds: Set<number> = new Set();
    private isDegraded: boolean = false;
    private totalLoaded: number = 0;

    constructor(options: InfiniteScrollOptions) {
        this.container = typeof options.container === 'string'
            ? document.querySelector(options.container)
            : options.container;
        this.endpoint = options.endpoint;
        this.renderItem = options.renderItem;
        this.threshold = options.threshold || 0.5;
        this.limit = options.limit || 12;
        this.emptyMessage = options.emptyMessage || 'No items found';
        this.loadingHTML = options.loadingHTML || '<div class="col-span-full text-center py-8"><i class="fas fa-spinner fa-spin text-3xl text-purple-400"></i></div>';
        this.params = options.params || {};
        this.degradeMessage = options.degradeMessage || '';

        this.init();
    }

    private init(): void {
        if (!this.container) return;

        this.sentinel = document.createElement('div');
        this.sentinel.className = 'infinite-scroll-sentinel h-10';
        this.container.appendChild(this.sentinel);

        this.observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !this.loading && this.hasMore) {
                    this.loadMore();
                }
            },
            { threshold: this.threshold }
        );

        this.observer.observe(this.sentinel);
        this.loadMore();
    }

    async loadMore(): Promise<void> {
        if (this.loading || !this.hasMore || !this.container) return;

        this.loading = true;
        this.showLoading();

        try {
            const queryParams = new URLSearchParams({
                ...this.params,
                limit: String(this.limit),
                offset: String(this.offset)
            });

            const response = await ApiClient.get(`${this.endpoint}?${queryParams}`);

            if (response.success) {
                const items = response.data?.competitions || response.data || [];

                const newItems = items.filter((item: any) => {
                    if (this.loadedIds.has(item.id)) return false;
                    this.loadedIds.add(item.id);
                    return true;
                });

                if (response.data?.hasMore === false) {
                    this.hasMore = false;
                } else if (newItems.length < this.limit) {
                    this.hasMore = false;
                }

                if (this.offset === 0 && newItems.length === 0) {
                    this.showEmpty();
                } else {
                    this.hideLoading();

                    if (newItems.length > 0) {
                        if (!this.isDegraded && this.degradeMessage && newItems[0]?.match_phase && newItems[0].match_phase > 1) {
                            this.isDegraded = true;
                            this.showDegradedNotice();
                        }

                        newItems.forEach((item: any) => {
                            const html = this.renderItem(item);
                            if (this.sentinel) {
                                this.sentinel.insertAdjacentHTML('beforebegin', html);
                            }
                        });
                        this.totalLoaded += newItems.length;
                    }

                    this.offset += items.length || this.limit;
                }
            }
        } catch (error) {
            console.error('Failed to load more items:', error);
            this.hasMore = false;
        } finally {
            this.loading = false;
            this.hideLoading();
        }
    }

    private showLoading(): void {
        if (this.sentinel) {
            this.sentinel.innerHTML = this.loadingHTML;
        }
    }

    private hideLoading(): void {
        if (this.sentinel) {
            this.sentinel.innerHTML = '';
        }
    }

    private showEmpty(): void {
        if (this.container && this.sentinel) {
            this.sentinel.innerHTML = `
                <div class="col-span-full text-center py-12 text-gray-400">
                    <i class="fas fa-inbox text-4xl mb-3"></i>
                    <p>${this.emptyMessage}</p>
                </div>
            `;
        }
    }

    private showDegradedNotice(): void {
        if (!this.degradeMessage || !this.sentinel) return;
        const notice = document.createElement('div');
        notice.className = 'col-span-full text-center py-3 px-4 mb-2 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl';
        notice.innerHTML = `<p class="text-sm text-yellow-700 dark:text-yellow-400"><i class="fas fa-info-circle mr-1"></i>${this.degradeMessage}</p>`;
        this.sentinel.insertAdjacentElement('beforebegin', notice);
    }

    reset(): void {
        this.offset = 0;
        this.hasMore = true;
        this.loadedIds.clear();
        this.isDegraded = false;
        this.totalLoaded = 0;
        if (this.container && this.sentinel) {
            const items = this.container.querySelectorAll(':scope > *:not(.infinite-scroll-sentinel)');
            items.forEach(item => item.remove());
        }
        this.loadMore();
    }

    updateParams(newParams: Record<string, string>): void {
        this.params = { ...this.params, ...newParams };
        this.reset();
    }

    destroy(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}

if (typeof window !== 'undefined') {
    (window as any).InfiniteScroll = InfiniteScroll;
}

export default InfiniteScroll;
