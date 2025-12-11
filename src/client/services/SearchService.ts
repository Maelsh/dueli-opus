/**
 * @file src/client/services/SearchService.ts
 * @description خدمة البحث على جانب العميل
 * @module client/services/SearchService
 */

import { ApiClient } from '../core/ApiClient';
import { State } from '../core/State';

/**
 * Search filters interface
 */
export interface SearchFilters {
    q?: string;
    category?: number;
    subcategory?: number;
    status?: string;
    language?: string;
    country?: string;
    limit?: number;
    offset?: number;
}

/**
 * Search Service Class
 * خدمة البحث والاكتشاف
 */
export class SearchService {

    /**
     * Search competitions
     */
    static async searchCompetitions(filters: SearchFilters = {}): Promise<any> {
        try {
            const params = new URLSearchParams();

            if (filters.q) params.append('q', filters.q);
            if (filters.category) params.append('category', String(filters.category));
            if (filters.subcategory) params.append('subcategory', String(filters.subcategory));
            if (filters.status) params.append('status', filters.status);
            if (filters.language) params.append('language', filters.language);
            if (filters.country) params.append('country', filters.country);
            if (filters.limit) params.append('limit', String(filters.limit));
            if (filters.offset) params.append('offset', String(filters.offset));

            const queryString = params.toString();
            const url = `/api/search/competitions${queryString ? `?${queryString}` : ''}`;

            const response = await ApiClient.get(url);
            return response.success ? response.data : { items: [], total: 0, hasMore: false };
        } catch (error) {
            console.error('Search competitions error:', error);
            return { items: [], total: 0, hasMore: false };
        }
    }

    /**
     * Search users
     */
    static async searchUsers(query: string, limit: number = 20, offset: number = 0): Promise<any> {
        if (!query || query.length < 2) {
            return { items: [], total: 0, hasMore: false };
        }

        try {
            const response = await ApiClient.get(
                `/api/search/users?q=${encodeURIComponent(query)}&limit=${limit}&offset=${offset}`
            );
            return response.success ? response.data : { items: [], total: 0, hasMore: false };
        } catch (error) {
            console.error('Search users error:', error);
            return { items: [], total: 0, hasMore: false };
        }
    }

    /**
     * Get suggestions for current user
     */
    static async getSuggestions(): Promise<{ competitions: any[]; users: any[] }> {
        try {
            const country = State.country || 'US';
            const response = await ApiClient.get(`/api/search/suggestions?country=${country}`);
            return response.success ? response.data : { competitions: [], users: [] };
        } catch (error) {
            console.error('Get suggestions error:', error);
            return { competitions: [], users: [] };
        }
    }

    /**
     * Get trending competitions
     */
    static async getTrending(limit: number = 10): Promise<any[]> {
        try {
            const response = await ApiClient.get(`/api/search/trending?limit=${limit}`);
            return response.success ? response.data?.competitions || [] : [];
        } catch (error) {
            console.error('Get trending error:', error);
            return [];
        }
    }

    /**
     * Get live competitions
     */
    static async getLive(limit: number = 20, offset: number = 0): Promise<any> {
        try {
            const response = await ApiClient.get(`/api/search/live?limit=${limit}&offset=${offset}`);
            return response.success ? response.data : { items: [], total: 0, hasMore: false };
        } catch (error) {
            console.error('Get live error:', error);
            return { items: [], total: 0, hasMore: false };
        }
    }

    /**
     * Get pending competitions (waiting for opponent)
     */
    static async getPending(limit: number = 20, offset: number = 0): Promise<any> {
        try {
            const response = await ApiClient.get(`/api/search/pending?limit=${limit}&offset=${offset}`);
            return response.success ? response.data : { items: [], total: 0, hasMore: false };
        } catch (error) {
            console.error('Get pending error:', error);
            return { items: [], total: 0, hasMore: false };
        }
    }

    /**
     * Quick search (combined results for search bar)
     */
    static async quickSearch(query: string): Promise<{ competitions: any[]; users: any[] }> {
        if (!query || query.length < 2) {
            return { competitions: [], users: [] };
        }

        try {
            const [competitionsResult, usersResult] = await Promise.all([
                this.searchCompetitions({ q: query, limit: 5 }),
                this.searchUsers(query, 5)
            ]);

            return {
                competitions: competitionsResult.items || [],
                users: usersResult.items || []
            };
        } catch (error) {
            console.error('Quick search error:', error);
            return { competitions: [], users: [] };
        }
    }
}

export default SearchService;
