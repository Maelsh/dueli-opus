/**
 * @file src/client/ui/RecommendationCarousel.ts
 * @description Recommendation Carousel with infinite scroll graceful degradation + Competitors Mini-Stats Card
 * @module client/ui/RecommendationCarousel
 *
 * Task 7: Advanced Recommendation Engine & Matchmaking
 * - Recommendation Carousel that users can scroll through
 * - MUST NOT hide or replace the universal Search Bar
 * - Competitors Mini-Stats Card (Wins/Losses/Top Categories) on user profiles
 */

import { ApiClient } from '../core/ApiClient';
import { State } from '../core/State';
import { t } from '../../i18n';
import { getCompetitionCard, CompetitionCardProps } from '../../shared/components/competition-card';

interface CarouselOptions {
    containerId: string;
    limit?: number;
}

/**
 * RecommendationCarousel
 * Horizontal scrolling carousel of personalized recommendations
 * Does NOT replace the search bar - sits above or below it
 */
export class RecommendationCarousel {
    private static instances: Map<string, RecommendationCarousel> = new Map();
    private containerId: string;
    private limit: number;
    private offset: number = 0;
    private loading: boolean = false;
    private hasMore: boolean = true;
    private loadedIds: Set<number> = new Set();
    private scrollContainer: HTMLElement | null = null;

    private constructor(options: CarouselOptions) {
        this.containerId = options.containerId;
        this.limit = options.limit || 15;
    }

    static getInstance(containerId: string, options?: Partial<CarouselOptions>): RecommendationCarousel {
        if (!this.instances.has(containerId)) {
            this.instances.set(containerId, new RecommendationCarousel({
                containerId,
                limit: options?.limit || 15
            }));
        }
        return this.instances.get(containerId)!;
    }

    /**
     * Initialize and render the carousel
     */
    init(): void {
        const container = document.getElementById(this.containerId);
        if (!container) return;

        const isRtl = State.lang === 'ar' || State.lang === 'fa' || State.lang === 'he' || State.lang === 'ur';
        const lang = State.lang;

        container.innerHTML = `
            <div class="recommendation-carousel-wrapper relative" data-carousel="${this.containerId}">
                <div class="flex items-center justify-between mb-3 px-1">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-wand-magic-sparkles text-purple-500"></i>
                        <h3 class="text-sm font-bold text-gray-900 dark:text-white">${t('recommendations.carousel_title', lang)}</h3>
                    </div>
                    <div class="flex items-center gap-1">
                        <button onclick="window._recCarouselScroll('${this.containerId}', -1)" class="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 flex items-center justify-center transition-all">
                            <i class="fas fa-chevron-${isRtl ? 'right' : 'left'} text-xs text-gray-600 dark:text-gray-400"></i>
                        </button>
                        <button onclick="window._recCarouselScroll('${this.containerId}', 1)" class="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 flex items-center justify-center transition-all">
                            <i class="fas fa-chevron-${isRtl ? 'left' : 'right'} text-xs text-gray-600 dark:text-gray-400"></i>
                        </button>
                        <button onclick="window._recCarouselRefresh('${this.containerId}')" class="w-7 h-7 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-purple-100 dark:hover:bg-purple-900/30 flex items-center justify-center transition-all" title="${t('matchmaking.refresh', lang)}">
                            <i class="fas fa-sync-alt text-xs text-gray-600 dark:text-gray-400"></i>
                        </button>
                    </div>
                </div>
                <div id="${this.containerId}-scroll" class="flex overflow-x-auto pb-3 gap-4 scrollbar-hide snap-x snap-mandatory scroll-smooth" style="scroll-behavior: smooth;">
                    <div class="flex items-center justify-center min-w-[200px] py-8">
                        <i class="fas fa-spinner fa-spin text-2xl text-purple-400"></i>
                    </div>
                </div>
            </div>
        `;

        this.scrollContainer = document.getElementById(`${this.containerId}-scroll`);
        this.offset = 0;
        this.loadedIds.clear();
        this.hasMore = true;
        this.fetchRecommendations();
    }

    /**
     * Fetch recommendations from the API with graceful degradation
     */
    private async fetchRecommendations(): Promise<void> {
        if (this.loading || !this.hasMore || !this.scrollContainer) return;
        this.loading = true;

        try {
            const res = await ApiClient.get<{
                success: boolean;
                data: {
                    competitions: CompetitionCardProps[];
                    hasMore: boolean;
                    totalAvailable: number;
                };
            }>(`/api/recommendations?limit=${this.limit}&offset=${this.offset}`);

            if (res.success && res.data) {
                const items = res.data.competitions || [];
                this.hasMore = res.data.hasMore ?? false;

                const newItems = items.filter((item: any) => {
                    if (this.loadedIds.has(item.id)) return false;
                    this.loadedIds.add(item.id);
                    return true;
                });

                if (this.offset === 0 && newItems.length === 0) {
                    this.scrollContainer.innerHTML = `
                        <div class="flex flex-col items-center justify-center min-w-full py-8 text-gray-400">
                            <i class="fas fa-compass text-3xl mb-2"></i>
                            <p class="text-sm">${t('recommendations.no_recommendations', State.lang)}</p>
                        </div>
                    `;
                } else {
                    if (this.offset === 0) {
                        this.scrollContainer.innerHTML = '';
                    }

                    newItems.forEach((item: CompetitionCardProps) => {
                        const cardHtml = getCompetitionCard(item, State.lang as any);
                        const wrapper = document.createElement('div');
                        wrapper.className = 'snap-start flex-shrink-0 w-72';
                        wrapper.innerHTML = cardHtml;
                        this.scrollContainer!.appendChild(wrapper);
                    });

                    this.offset += items.length;
                }
            }
        } catch (e) {
            console.error('[RecommendationCarousel] fetch error:', e);
        } finally {
            this.loading = false;
        }
    }

    /**
     * Scroll the carousel left or right
     */
    scroll(direction: -1 | 1): void {
        if (!this.scrollContainer) return;
        const scrollAmount = 300;
        this.scrollContainer.scrollBy({
            left: direction * scrollAmount,
            behavior: 'smooth'
        });

        if (direction > 0 && this.hasMore) {
            const scrollRight = this.scrollContainer.scrollWidth - this.scrollContainer.scrollLeft - this.scrollContainer.clientWidth;
            if (scrollRight < 400) {
                this.fetchRecommendations();
            }
        }
    }

    /**
     * Refresh the carousel
     */
    refresh(): void {
        this.offset = 0;
        this.loadedIds.clear();
        this.hasMore = true;
        this.init();
    }

    /**
     * Register global window functions
     */
    static registerGlobals(): void {
        (window as any)._recCarouselScroll = (containerId: string, direction: -1 | 1) => {
            const instance = RecommendationCarousel.instances.get(containerId);
            if (instance) instance.scroll(direction);
        };
        (window as any)._recCarouselRefresh = (containerId: string) => {
            const instance = RecommendationCarousel.instances.get(containerId);
            if (instance) instance.refresh();
        };
    }
}

/**
 * CompetitorsMiniStatsCard
 * Renders a small card on user profiles showing Wins/Losses/Top Categories
 */
export class CompetitorsMiniStatsCard {
    /**
     * Render the mini-stats card into a container
     */
    static async render(containerId: string, userId: number): Promise<void> {
        const container = document.getElementById(containerId);
        if (!container) return;

        const lang = State.lang;

        try {
            const res = await ApiClient.get<{
                success: boolean;
                data: {
                    wins: number;
                    losses: number;
                    top_categories: { id: number; name_ar: string; name_en: string; icon: string; color: string; count: number }[];
                };
            }>(`/api/recommendations/competitor-stats/${userId}`);

            if (!res.success || !res.data) {
                container.innerHTML = '';
                return;
            }

            const { wins, losses, top_categories } = res.data;
            const winRate = wins + losses > 0 ? Math.round((wins / (wins + losses)) * 100) : 0;

            container.innerHTML = `
                <div class="bg-white dark:bg-gray-800/60 rounded-2xl p-4 border border-gray-100 dark:border-gray-700/50">
                    <div class="flex items-center gap-2 mb-3">
                        <i class="fas fa-chart-line text-purple-500 text-sm"></i>
                        <h4 class="text-sm font-bold text-gray-900 dark:text-white">${t('recommendations.competitor_stats', lang)}</h4>
                    </div>
                    <div class="grid grid-cols-3 gap-2 mb-3">
                        <div class="text-center p-2 bg-green-50 dark:bg-green-900/20 rounded-xl">
                            <div class="text-lg font-bold text-green-600 dark:text-green-400">${wins}</div>
                            <div class="text-[10px] text-green-700 dark:text-green-500 font-medium">${t('wins', lang)}</div>
                        </div>
                        <div class="text-center p-2 bg-red-50 dark:bg-red-900/20 rounded-xl">
                            <div class="text-lg font-bold text-red-600 dark:text-red-400">${losses}</div>
                            <div class="text-[10px] text-red-700 dark:text-red-500 font-medium">${t('recommendations.losses', lang)}</div>
                        </div>
                        <div class="text-center p-2 bg-purple-50 dark:bg-purple-900/20 rounded-xl">
                            <div class="text-lg font-bold text-purple-600 dark:text-purple-400">${winRate}%</div>
                            <div class="text-[10px] text-purple-700 dark:text-purple-500 font-medium">${t('recommendations.win_rate', lang)}</div>
                        </div>
                    </div>
                    ${top_categories && top_categories.length > 0 ? `
                        <div class="space-y-1.5">
                            <div class="text-xs font-semibold text-gray-500 dark:text-gray-400">${t('recommendations.top_categories', lang)}</div>
                            ${top_categories.map((cat: any) => {
                                const name = lang === 'ar' ? cat.name_ar : cat.name_en;
                                return `
                                    <div class="flex items-center gap-2">
                                        <div class="w-6 h-6 rounded-lg flex items-center justify-center" style="background-color: ${cat.color || '#8B5CF6'}20">
                                            <i class="${cat.icon || 'fas fa-tag'} text-[10px]" style="color: ${cat.color || '#8B5CF6'}"></i>
                                        </div>
                                        <span class="text-xs text-gray-700 dark:text-gray-300 flex-1">${name}</span>
                                        <span class="text-[10px] text-gray-400 font-medium">${cat.count}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
        } catch (e) {
            console.error('[CompetitorsMiniStatsCard] render error:', e);
            container.innerHTML = '';
        }
    }
}

RecommendationCarousel.registerGlobals();

if (typeof window !== 'undefined') {
    (window as any).RecommendationCarousel = RecommendationCarousel;
    (window as any).CompetitorsMiniStatsCard = CompetitorsMiniStatsCard;
}

export default RecommendationCarousel;
