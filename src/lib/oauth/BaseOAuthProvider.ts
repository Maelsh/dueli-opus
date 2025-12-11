/**
 * Base OAuth Provider - Abstract Class
 * فئة موفر OAuth الأساسية - فئة مجردة
 * 
 * All OAuth providers must extend this class and implement its abstract methods.
 * يجب على جميع موفري OAuth توسيع هذه الفئة وتنفيذ أساليبها المجردة.
 */

import { OAuthUser } from './types';

/**
 * OAuth Provider Configuration
 */
export interface OAuthProviderOptions {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
}

/**
 * Abstract Base Class for OAuth Providers
 * Implements common functionality and enforces consistent interface
 */
export abstract class BaseOAuthProvider {
    protected readonly clientId: string;
    protected readonly clientSecret: string;
    protected readonly redirectUri: string;

    /** Provider name (e.g., 'google', 'facebook') */
    abstract readonly providerName: string;

    /** OAuth authorization URL */
    protected abstract readonly authBaseUrl: string;

    /** OAuth token URL */
    protected abstract readonly tokenUrl: string;

    /** User info URL */
    protected abstract readonly userInfoUrl: string;

    /** OAuth scopes */
    protected abstract readonly scopes: string;

    constructor(options: OAuthProviderOptions) {
        this.clientId = options.clientId;
        this.clientSecret = options.clientSecret;
        this.redirectUri = options.redirectUri;
    }

    /**
     * Generate OAuth authorization URL
     * @param state - Security state parameter
     * @param lang - Language for state preservation
     */
    abstract getAuthUrl(state: string, lang: string): string;

    /**
     * Exchange authorization code for user info
     * @param code - Authorization code from OAuth callback
     */
    abstract getUser(code: string): Promise<OAuthUser>;

    /**
     * Build authorization URL with common parameters
     * Helper method for subclasses
     */
    protected buildAuthUrl(params: Record<string, string>): string {
        const urlParams = new URLSearchParams(params);
        return `${this.authBaseUrl}?${urlParams.toString()}`;
    }

    /**
     * Exchange code for access token
     * Common implementation that can be overridden
     */
    protected async exchangeCodeForToken(code: string): Promise<any> {
        const response = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: this.redirectUri,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[${this.providerName} OAuth] Token request failed:`, {
                status: response.status,
                error: errorText
            });
            throw new Error(`Failed to get ${this.providerName} token: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Fetch user info with access token
     * Common implementation that can be overridden
     */
    protected async fetchUserInfo(accessToken: string): Promise<any> {
        const response = await fetch(this.userInfoUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[${this.providerName} OAuth] User info request failed:`, {
                status: response.status,
                error: errorText
            });
            throw new Error(`Failed to get ${this.providerName} user info: ${response.status}`);
        }

        return response.json();
    }

    /**
     * Create standardized OAuthUser from raw data
     * Must be implemented by subclasses to handle provider-specific response format
     */
    protected abstract normalizeUser(rawData: any): OAuthUser;
}
