/**
 * @file src/client/core/ApiClient.ts
 * @description عميل API للاتصال بالخادم
 * @module client/core/ApiClient
 */

import { State } from './State';

export interface ApiOptions {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    body?: any;
    credentials?: RequestCredentials;
}

/**
 * API Client Class
 * عميل الاتصال بالخادم
 */
export class ApiClient {
    /**
     * Make API request
     */
    static async request<T = any>(endpoint: string, options: ApiOptions = {}): Promise<T> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            ...options.headers,
        };

        // Get session from State or localStorage fallback
        const session = State.sessionId || localStorage.getItem('sessionId');
        if (session) {
            headers['Authorization'] = 'Bearer ' + session;
        }

        const response = await fetch(endpoint, {
            method: options.method || 'GET',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
            credentials: options.credentials || 'include',
        });

        return response.json();
    }

    /**
     * GET request
     */
    static async get<T = any>(endpoint: string): Promise<T> {
        return this.request<T>(endpoint, { method: 'GET' });
    }

    /**
     * POST request
     */
    static async post<T = any>(endpoint: string, body?: any): Promise<T> {
        return this.request<T>(endpoint, { method: 'POST', body });
    }

    /**
     * PUT request
     */
    static async put<T = any>(endpoint: string, body?: any): Promise<T> {
        return this.request<T>(endpoint, { method: 'PUT', body });
    }

    /**
     * DELETE request
     */
    static async delete<T = any>(endpoint: string, body?: any): Promise<T> {
        return this.request<T>(endpoint, { method: 'DELETE', body });
    }
}

export default ApiClient;
