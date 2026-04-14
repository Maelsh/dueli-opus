/**
 * @file src/client/helpers/RecommendationEngine.ts
 * @description Client-side recommendation engine with graceful degradation
 * @module client/helpers/RecommendationEngine
 *
 * Task 7: Advanced Recommendation Engine
 * Factors: Language, Country, Rating, Topic Relevancy, Unwatched status, Recency
 * Graceful degradation: never shows "0 results" unless DB is truly empty
 */

import { ApiClient } from '../core/ApiClient';
import { State } from '../core/State';

interface Competition {
    id: number;
    category_id: number;
    language: string;
    country: string;
    total_views: number;
    average_rating: number;
    created_at: string;
    [key: string]: any;
}

interface RecommendationOptions {
    limit?: number;
    offset?: number;
    weights?: {
        language: number;
        country: number;
        rating: number;
        category: number;
        unwatched: number;
        recency: number;
    };
}

interface RecommendationResponse {
    success: boolean;
    data: {
        competitions: Competition[];
        hasMore: boolean;
        totalAvailable: number;
    };
}

/**
 * RecommendationEngine Class
 * Client-side scoring + server-side API with graceful degradation
 */
export class RecommendationEngine {
    private static userInteractions: Map<number, { views: number; likes: number }> = new Map();
    private static categoryPreferences: Map<number, number> = new Map();
    private static watchedIds: Set<number> = new Set();

    /**
     * Track user view
     */
    static trackView(competitionId: number, categoryId: number): void {
        const existing = this.userInteractions.get(competitionId) || { views: 0, likes: 0 };
        existing.views++;
        this.userInteractions.set(competitionId, existing);
        this.watchedIds.add(competitionId);

        const catScore = this.categoryPreferences.get(categoryId) || 0;
        this.categoryPreferences.set(categoryId, catScore + 1);

        this.savePreferences();
    }

    /**
     * Track user like
     */
    static trackLike(competitionId: number, categoryId: number): void {
        const existing = this.userInteractions.get(competitionId) || { views: 0, likes: 0 };
        existing.likes++;
        this.userInteractions.set(competitionId, existing);

        const catScore = this.categoryPreferences.get(categoryId) || 0;
        this.categoryPreferences.set(categoryId, catScore + 5);

        this.savePreferences();
    }

    /**
     * Mark competition as watched (for unwatched scoring)
     */
    static markWatched(competitionId: number): void {
        this.watchedIds.add(competitionId);
        this.savePreferences();
    }

    /**
     * Fetch recommendations from server API with graceful degradation
     */
    static async fetchRecommendations(options: RecommendationOptions = {}): Promise<{
        competitions: Competition[];
        hasMore: boolean;
        totalAvailable: number;
    }> {
        const { limit = 20, offset = 0 } = options;

        try {
            const res = await ApiClient.get<RecommendationResponse>(
                `/api/recommendations?limit=${limit}&offset=${offset}`
            );

            if (res.success && res.data) {
                return {
                    competitions: res.data.competitions || [],
                    hasMore: res.data.hasMore ?? false,
                    totalAvailable: res.data.totalAvailable ?? 0
                };
            }
        } catch (e) {
            console.error('[RecommendationEngine] fetchRecommendations error:', e);
        }

        return { competitions: [], hasMore: false, totalAvailable: 0 };
    }

    /**
     * Fetch competitor mini-stats for a user profile
     */
    static async fetchCompetitorStats(userId: number): Promise<{
        wins: number;
        losses: number;
        top_categories: { id: number; name_ar: string; name_en: string; icon: string; color: string; count: number }[];
    } | null> {
        try {
            const res = await ApiClient.get<{ success: boolean; data: any }>(
                `/api/recommendations/competitor-stats/${userId}`
            );
            if (res.success && res.data) return res.data;
        } catch (e) {
            console.error('[RecommendationEngine] fetchCompetitorStats error:', e);
        }
        return null;
    }

    /**
     * Score competitions client-side (for local re-ranking)
     */
    static async getRecommendations(competitions: Competition[], options: RecommendationOptions = {}): Promise<Competition[]> {
        const {
            limit = 10,
            weights = {
                language: 25,
                country: 20,
                rating: 15,
                category: 20,
                unwatched: 10,
                recency: 10
            }
        } = options;

        this.loadPreferences();

        const userLang = State.lang || 'ar';
        const userCountry = State.country || 'SA';
        const topCategories = this.getTopCategories(3);

        const scored = competitions.map(comp => {
            let score = 0;

            if (comp.language === userLang) {
                score += weights.language;
            }

            if (comp.country === userCountry) {
                score += weights.country;
            }

            const ratingScore = Math.min((comp.average_rating || 0) / 5.0, 1) * weights.rating;
            score += ratingScore;

            if (topCategories.includes(comp.category_id)) {
                const pref = this.categoryPreferences.get(comp.category_id) || 0;
                score += weights.category * Math.min(pref / 10, 1);
            }

            if (!this.watchedIds.has(comp.id)) {
                score += weights.unwatched;
            }

            const created = new Date(comp.created_at).getTime();
            const now = Date.now();
            const daysSince = (now - created) / (1000 * 60 * 60 * 24);
            if (daysSince < 1) score += weights.recency;
            else if (daysSince < 3) score += weights.recency * 0.7;
            else if (daysSince < 7) score += weights.recency * 0.4;

            return { competition: comp, score };
        });

        return scored
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => item.competition);
    }

    /**
     * Get top N categories by preference
     */
    private static getTopCategories(n: number): number[] {
        const sorted = Array.from(this.categoryPreferences.entries())
            .sort((a, b) => b[1] - a[1]);
        return sorted.slice(0, n).map(([catId]) => catId);
    }

    /**
     * Save preferences to localStorage
     */
    private static savePreferences(): void {
        if (typeof localStorage === 'undefined') return;

        const data = {
            categories: Array.from(this.categoryPreferences.entries()),
            interactions: Array.from(this.userInteractions.entries()),
            watched: Array.from(this.watchedIds)
        };
        localStorage.setItem('dueli_recommendations', JSON.stringify(data));
    }

    /**
     * Load preferences from localStorage
     */
    private static loadPreferences(): void {
        if (typeof localStorage === 'undefined') return;

        try {
            const stored = localStorage.getItem('dueli_recommendations');
            if (stored) {
                const data = JSON.parse(stored);
                this.categoryPreferences = new Map(data.categories || []);
                this.userInteractions = new Map(data.interactions || []);
                this.watchedIds = new Set(data.watched || []);
            }
        } catch (e) {
            console.error('Failed to load recommendations:', e);
        }
    }

    /**
     * Clear preferences
     */
    static clearPreferences(): void {
        this.categoryPreferences.clear();
        this.userInteractions.clear();
        this.watchedIds.clear();
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('dueli_recommendations');
        }
    }
}

if (typeof window !== 'undefined') {
    (window as any).RecommendationEngine = RecommendationEngine;
}

export default RecommendationEngine;
