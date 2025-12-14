/**
 * @file src/client/helpers/RecommendationEngine.ts
 * @description محرك التوصيات
 * @module client/helpers/RecommendationEngine
 */

import { ApiClient } from '../core/ApiClient';
import { State } from '../core/State';

interface Competition {
    id: number;
    category_id: number;
    language: string;
    country: string;
    views_count: number;
    [key: string]: any;
}

interface RecommendationOptions {
    limit?: number;
    weights?: {
        category: number;
        language: number;
        country: number;
        popularity: number;
    };
}

/**
 * RecommendationEngine Class
 * نظام التوصيات المخصصة
 */
export class RecommendationEngine {
    private static userInteractions: Map<number, { views: number; likes: number }> = new Map();
    private static categoryPreferences: Map<number, number> = new Map();

    /**
     * Track user view
     */
    static trackView(competitionId: number, categoryId: number): void {
        const existing = this.userInteractions.get(competitionId) || { views: 0, likes: 0 };
        existing.views++;
        this.userInteractions.set(competitionId, existing);

        const catScore = this.categoryPreferences.get(categoryId) || 0;
        this.categoryPreferences.set(categoryId, catScore + 1);

        // Save to localStorage for persistence
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
        this.categoryPreferences.set(categoryId, catScore + 5); // Likes worth more

        this.savePreferences();
    }

    /**
     * Get recommended competitions
     */
    static async getRecommendations(competitions: Competition[], options: RecommendationOptions = {}): Promise<Competition[]> {
        const {
            limit = 10,
            weights = {
                category: 40,
                language: 25,
                country: 20,
                popularity: 15
            }
        } = options;

        this.loadPreferences();

        const userLang = State.lang || 'ar';
        const userCountry = State.country || 'SA';
        const topCategories = this.getTopCategories(3);

        // Score each competition
        const scored = competitions.map(comp => {
            let score = 0;

            // Category preference score
            if (topCategories.includes(comp.category_id)) {
                score += weights.category * (this.categoryPreferences.get(comp.category_id) || 0);
            }

            // Language match
            if (comp.language === userLang) {
                score += weights.language;
            }

            // Country match
            if (comp.country === userCountry) {
                score += weights.country;
            }

            // Popularity (normalized)
            const popularityScore = Math.min(comp.views_count / 1000, 1) * weights.popularity;
            score += popularityScore;

            return { competition: comp, score };
        });

        // Sort by score and return top N
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
            interactions: Array.from(this.userInteractions.entries())
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
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem('dueli_recommendations');
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    (window as any).RecommendationEngine = RecommendationEngine;
}

export default RecommendationEngine;
