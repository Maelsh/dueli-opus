/**
 * @file src/client/helpers/LiveSearch.ts
 * @description البحث الذكي المباشر
 * @module client/helpers/LiveSearch
 */

import { ApiClient } from '../core/ApiClient';

interface LiveSearchOptions {
    input: string | HTMLInputElement;
    resultsContainer: string | HTMLElement;
    endpoint: string;
    renderResult: (item: any) => string;
    debounceMs?: number;
    minChars?: number;
    placeholder?: string;
    noResultsMessage?: string;
}

/**
 * LiveSearch Class
 * البحث المباشر مع debounce
 */
export class LiveSearch {
    private input: HTMLInputElement | null;
    private resultsContainer: HTMLElement | null;
    private endpoint: string;
    private renderResult: (item: any) => string;
    private debounceMs: number;
    private minChars: number;
    private noResultsMessage: string;
    private debounceTimer: ReturnType<typeof setTimeout> | null = null;
    private isOpen: boolean = false;

    constructor(options: LiveSearchOptions) {
        this.input = typeof options.input === 'string'
            ? document.querySelector(options.input)
            : options.input;
        this.resultsContainer = typeof options.resultsContainer === 'string'
            ? document.querySelector(options.resultsContainer)
            : options.resultsContainer;
        this.endpoint = options.endpoint;
        this.renderResult = options.renderResult;
        this.debounceMs = options.debounceMs || 300;
        this.minChars = options.minChars || 2;
        this.noResultsMessage = options.noResultsMessage || 'No results found';

        this.init();
    }

    /**
     * Initialize live search
     */
    private init(): void {
        if (!this.input || !this.resultsContainer) return;

        // Input event with debounce
        this.input.addEventListener('input', () => {
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }
            this.debounceTimer = setTimeout(() => {
                this.search();
            }, this.debounceMs);
        });

        // Focus event
        this.input.addEventListener('focus', () => {
            if (this.input && this.input.value.length >= this.minChars) {
                this.show();
            }
        });

        // Click outside to close
        document.addEventListener('click', (e) => {
            if (!this.input?.contains(e.target as Node) &&
                !this.resultsContainer?.contains(e.target as Node)) {
                this.hide();
            }
        });

        // Keyboard navigation
        this.input.addEventListener('keydown', (e) => {
            this.handleKeydown(e);
        });
    }

    /**
     * Perform search
     */
    async search(): Promise<void> {
        if (!this.input || !this.resultsContainer) return;

        const query = this.input.value.trim();

        if (query.length < this.minChars) {
            this.hide();
            return;
        }

        try {
            this.resultsContainer.innerHTML = `
                <div class="p-4 text-center text-gray-400">
                    <i class="fas fa-spinner fa-spin"></i>
                </div>
            `;
            this.show();

            const response = await ApiClient.get(`${this.endpoint}?q=${encodeURIComponent(query)}`);

            if (response.success && Array.isArray(response.data)) {
                const results = response.data;

                if (results.length === 0) {
                    this.resultsContainer.innerHTML = `
                        <div class="p-4 text-center text-gray-400 text-sm">
                            ${this.noResultsMessage}
                        </div>
                    `;
                } else {
                    this.resultsContainer.innerHTML = results.map((item: any) => this.renderResult(item)).join('');
                }
            }
        } catch (error) {
            console.error('Search failed:', error);
            this.hide();
        }
    }

    /**
     * Handle keyboard navigation
     */
    private handleKeydown(e: KeyboardEvent): void {
        if (!this.resultsContainer || !this.isOpen) return;

        const items = this.resultsContainer.querySelectorAll('[data-search-item]');
        const active = this.resultsContainer.querySelector('.search-active');
        let index = Array.from(items).indexOf(active as Element);

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                index = Math.min(index + 1, items.length - 1);
                if (index < 0) index = 0;
                this.setActive(items[index] as HTMLElement);
                break;
            case 'ArrowUp':
                e.preventDefault();
                index = Math.max(index - 1, 0);
                this.setActive(items[index] as HTMLElement);
                break;
            case 'Enter':
                e.preventDefault();
                if (active) {
                    (active as HTMLElement).click();
                }
                break;
            case 'Escape':
                this.hide();
                break;
        }
    }

    /**
     * Set active item
     */
    private setActive(item: HTMLElement): void {
        if (!this.resultsContainer) return;

        this.resultsContainer.querySelectorAll('.search-active').forEach(el => {
            el.classList.remove('search-active', 'bg-purple-50', 'dark:bg-purple-900/20');
        });

        if (item) {
            item.classList.add('search-active', 'bg-purple-50', 'dark:bg-purple-900/20');
            item.scrollIntoView({ block: 'nearest' });
        }
    }

    /**
     * Show results
     */
    show(): void {
        if (this.resultsContainer) {
            this.resultsContainer.classList.remove('hidden');
            this.isOpen = true;
        }
    }

    /**
     * Hide results
     */
    hide(): void {
        if (this.resultsContainer) {
            this.resultsContainer.classList.add('hidden');
            this.isOpen = false;
        }
    }

    /**
     * Clear search
     */
    clear(): void {
        if (this.input) {
            this.input.value = '';
        }
        this.hide();
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).LiveSearch = LiveSearch;
}

export default LiveSearch;
