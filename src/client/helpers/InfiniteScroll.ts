/**
 * @file src/client/helpers/InfiniteScroll.ts
 * @description مساعد التمرير اللانهائي
 * @module client/helpers/InfiniteScroll
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
}

/**
 * InfiniteScroll Class
 * التمرير اللانهائي لتحميل البيانات تدريجياً
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
    private observer: IntersectionObserver | null = null;
    private sentinel: HTMLElement | null = null;

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

        this.init();
    }

    /**
     * Initialize infinite scroll
     */
    private init(): void {
        if (!this.container) return;

        // Create sentinel element for intersection observer
        this.sentinel = document.createElement('div');
        this.sentinel.className = 'infinite-scroll-sentinel h-10';
        this.container.appendChild(this.sentinel);

        // Setup intersection observer
        this.observer = new IntersectionObserver(
            (entries) => {
                if (entries[0].isIntersecting && !this.loading && this.hasMore) {
                    this.loadMore();
                }
            },
            { threshold: this.threshold }
        );

        this.observer.observe(this.sentinel);

        // Load initial data
        this.loadMore();
    }

    /**
     * Load more items
     */
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

            if (response.success && Array.isArray(response.data)) {
                const items = response.data;

                if (items.length < this.limit) {
                    this.hasMore = false;
                }

                if (this.offset === 0 && items.length === 0) {
                    this.showEmpty();
                } else {
                    this.hideLoading();
                    items.forEach((item: any) => {
                        const html = this.renderItem(item);
                        if (this.sentinel) {
                            this.sentinel.insertAdjacentHTML('beforebegin', html);
                        }
                    });
                    this.offset += items.length;
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

    /**
     * Show loading indicator
     */
    private showLoading(): void {
        if (this.sentinel) {
            this.sentinel.innerHTML = this.loadingHTML;
        }
    }

    /**
     * Hide loading indicator
     */
    private hideLoading(): void {
        if (this.sentinel) {
            this.sentinel.innerHTML = '';
        }
    }

    /**
     * Show empty message
     */
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

    /**
     * Reset and reload
     */
    reset(): void {
        this.offset = 0;
        this.hasMore = true;
        if (this.container && this.sentinel) {
            // Remove all items except sentinel
            const items = this.container.querySelectorAll(':scope > *:not(.infinite-scroll-sentinel)');
            items.forEach(item => item.remove());
        }
        this.loadMore();
    }

    /**
     * Update params and reload
     */
    updateParams(newParams: Record<string, string>): void {
        this.params = { ...this.params, ...newParams };
        this.reset();
    }

    /**
     * Destroy observer
     */
    destroy(): void {
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).InfiniteScroll = InfiniteScroll;
}

export default InfiniteScroll;
