/**
 * Facebook OAuth Provider
 * موفر مصادقة فيسبوك
 */

import { BaseOAuthProvider, OAuthProviderOptions } from './BaseOAuthProvider';
import { OAuthUser } from './types';

export class FacebookOAuth extends BaseOAuthProvider {
    readonly providerName = 'facebook';
    protected readonly authBaseUrl = 'https://www.facebook.com/v18.0/dialog/oauth';
    protected readonly tokenUrl = 'https://graph.facebook.com/v18.0/oauth/access_token';
    protected readonly userInfoUrl = 'https://graph.facebook.com/me';
    protected readonly scopes = 'email,public_profile';

    constructor(clientId: string, clientSecret: string, redirectUri: string) {
        super({ clientId, clientSecret, redirectUri });
    }

    getAuthUrl(state: string, lang: string): string {
        return this.buildAuthUrl({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            state: JSON.stringify({ state, lang }),
            scope: this.scopes,
            response_type: 'code',
        });
    }

    async getUser(code: string): Promise<OAuthUser> {
        console.log(`[${this.providerName} OAuth] Starting getUser`);

        // 1. Get token (Facebook uses GET request for token)
        const tokenUrl = `${this.tokenUrl}?` + new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: this.redirectUri,
            code,
        });

        const tokenResponse = await fetch(tokenUrl);
        if (!tokenResponse.ok) {
            throw new Error(`Failed to get ${this.providerName} token`);
        }

        const tokenData = await tokenResponse.json() as any;
        console.log(`[${this.providerName} OAuth] Token received successfully`);

        // 2. Fetch user info (with specific fields)
        const userUrl = `${this.userInfoUrl}?fields=id,name,email,picture.type(large)&access_token=${tokenData.access_token}`;
        const userResponse = await fetch(userUrl);

        if (!userResponse.ok) {
            throw new Error(`Failed to get ${this.providerName} user info`);
        }

        const userData = await userResponse.json() as any;
        console.log(`[${this.providerName} OAuth] User info received`);

        // 3. Normalize to standard format
        return this.normalizeUser(userData);
    }

    protected normalizeUser(rawData: any): OAuthUser {
        return {
            id: rawData.id,
            email: rawData.email,
            name: rawData.name,
            picture: rawData.picture?.data?.url,
            provider: this.providerName,
            raw: rawData,
        };
    }
}
