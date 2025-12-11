/**
 * Google OAuth Provider
 * موفر مصادقة جوجل
 */

import { BaseOAuthProvider, OAuthProviderOptions } from './BaseOAuthProvider';
import { OAuthUser } from './types';

export class GoogleOAuth extends BaseOAuthProvider {
    readonly providerName = 'google';
    protected readonly authBaseUrl = 'https://accounts.google.com/o/oauth2/v2/auth';
    protected readonly tokenUrl = 'https://oauth2.googleapis.com/token';
    protected readonly userInfoUrl = 'https://www.googleapis.com/oauth2/v2/userinfo';
    protected readonly scopes = 'openid email profile';

    constructor(clientId: string, clientSecret: string, redirectUri: string) {
        super({ clientId, clientSecret, redirectUri });
    }

    getAuthUrl(state: string, lang: string): string {
        return this.buildAuthUrl({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: this.scopes,
            state: JSON.stringify({ state, lang }),
            access_type: 'offline',
            prompt: 'consent'
        });
    }

    async getUser(code: string): Promise<OAuthUser> {
        console.log(`[${this.providerName} OAuth] Starting getUser with redirect_uri:`, this.redirectUri);

        // 1. Exchange code for token
        const tokenData = await this.exchangeCodeForToken(code);
        console.log(`[${this.providerName} OAuth] Token received successfully`);

        // 2. Fetch user info
        const userData = await this.fetchUserInfo(tokenData.access_token);
        console.log(`[${this.providerName} OAuth] User info received:`, {
            id: userData.id,
            email: userData.email,
            name: userData.name
        });

        // 3. Normalize to standard format
        return this.normalizeUser(userData);
    }

    protected normalizeUser(rawData: any): OAuthUser {
        return {
            id: rawData.id,
            email: rawData.email,
            name: rawData.name,
            picture: rawData.picture,
            provider: this.providerName,
            raw: rawData,
        };
    }
}
