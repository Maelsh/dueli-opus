/**
 * OAuth Provider Factory
 * مصنع موفري OAuth
 * 
 * Factory pattern for creating OAuth provider instances
 * نمط المصنع لإنشاء مثيلات موفري OAuth
 */

import { BaseOAuthProvider } from './BaseOAuthProvider';
import { GoogleOAuth } from './google';
import { FacebookOAuth } from './facebook';
import { MicrosoftOAuth } from './microsoft';
import { TikTokOAuth } from './tiktok';

/**
 * Supported OAuth provider types
 */
export type OAuthProviderType = 'google' | 'facebook' | 'microsoft' | 'tiktok';

/**
 * OAuth configuration options
 */
export interface OAuthFactoryConfig {
    google?: {
        clientId: string;
        clientSecret: string;
    };
    facebook?: {
        clientId: string;
        clientSecret: string;
    };
    microsoft?: {
        clientId: string;
        clientSecret: string;
        tenantId: string;
    };
    tiktok?: {
        clientKey: string;
        clientSecret: string;
    };
}

/**
 * OAuth Provider Factory
 * Creates OAuth provider instances based on provider type
 */
export class OAuthProviderFactory {
    private config: OAuthFactoryConfig;
    private redirectBaseUrl: string;

    constructor(config: OAuthFactoryConfig, redirectBaseUrl: string) {
        this.config = config;
        this.redirectBaseUrl = redirectBaseUrl;
    }

    /**
     * Build redirect URI for a provider
     */
    private getRedirectUri(provider: OAuthProviderType): string {
        return `${this.redirectBaseUrl}/api/auth/oauth/${provider}/callback`;
    }

    /**
     * Create OAuth provider instance
     * @param provider - Provider type ('google', 'facebook', 'microsoft', 'tiktok')
     * @returns OAuth provider instance
     * @throws Error if provider not configured
     */
    create(provider: OAuthProviderType): BaseOAuthProvider {
        const redirectUri = this.getRedirectUri(provider);

        switch (provider) {
            case 'google':
                if (!this.config.google) {
                    throw new Error('Google OAuth not configured');
                }
                return new GoogleOAuth(
                    this.config.google.clientId,
                    this.config.google.clientSecret,
                    redirectUri
                );

            case 'facebook':
                if (!this.config.facebook) {
                    throw new Error('Facebook OAuth not configured');
                }
                return new FacebookOAuth(
                    this.config.facebook.clientId,
                    this.config.facebook.clientSecret,
                    redirectUri
                );

            case 'microsoft':
                if (!this.config.microsoft) {
                    throw new Error('Microsoft OAuth not configured');
                }
                return new MicrosoftOAuth(
                    this.config.microsoft.clientId,
                    this.config.microsoft.clientSecret,
                    this.config.microsoft.tenantId,
                    redirectUri
                );

            case 'tiktok':
                if (!this.config.tiktok) {
                    throw new Error('TikTok OAuth not configured');
                }
                return new TikTokOAuth(
                    this.config.tiktok.clientKey,
                    this.config.tiktok.clientSecret,
                    redirectUri
                );

            default:
                throw new Error(`Unknown OAuth provider: ${provider}`);
        }
    }

    /**
     * Get all supported providers
     */
    static getSupportedProviders(): OAuthProviderType[] {
        return ['google', 'facebook', 'microsoft', 'tiktok'];
    }

    /**
     * Check if a provider is supported
     */
    static isSupported(provider: string): provider is OAuthProviderType {
        return this.getSupportedProviders().includes(provider as OAuthProviderType);
    }
}

export default OAuthProviderFactory;
