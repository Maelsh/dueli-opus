/**
 * TikTok OAuth Provider
 * موفر مصادقة تيك توك
 */

import { BaseOAuthProvider } from './BaseOAuthProvider';
import { OAuthUser } from './types';

export class TikTokOAuth extends BaseOAuthProvider {
    readonly providerName = 'tiktok';
    protected readonly authBaseUrl = 'https://www.tiktok.com/v2/auth/authorize/';
    protected readonly tokenUrl = 'https://open.tiktokapis.com/v2/oauth/token/';
    protected readonly userInfoUrl = 'https://open.tiktokapis.com/v2/user/info/';
    protected readonly scopes = 'user.info.basic';

    // TikTok uses 'client_key' instead of 'client_id'
    private readonly clientKey: string;

    constructor(clientKey: string, clientSecret: string, redirectUri: string) {
        super({ clientId: clientKey, clientSecret, redirectUri });
        this.clientKey = clientKey;
    }

    getAuthUrl(state: string, lang: string): string {
        const params = new URLSearchParams({
            client_key: this.clientKey,
            redirect_uri: this.redirectUri,
            scope: this.scopes,
            response_type: 'code',
            state: JSON.stringify({ state, lang }),
            sandbox: '1',
        });
        return `${this.authBaseUrl}?${params.toString()}`;
    }

    async getUser(code: string): Promise<OAuthUser> {
        console.log(`[${this.providerName} OAuth] Starting getUser`);

        // 1. Exchange code for token (TikTok uses client_key)
        const tokenResponse = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_key: this.clientKey,
                client_secret: this.clientSecret,
                code,
                grant_type: 'authorization_code',
                redirect_uri: this.redirectUri,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error(`[${this.providerName} OAuth] Token request failed:`, errorText);
            throw new Error(`Failed to get ${this.providerName} token`);
        }

        const tokenData = await tokenResponse.json() as any;
        console.log(`[${this.providerName} OAuth] Token received successfully`);

        // 2. Fetch user info (with fields parameter)
        const userUrl = `${this.userInfoUrl}?fields=open_id,union_id,avatar_url,display_name`;
        const userResponse = await fetch(userUrl, {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error(`[${this.providerName} OAuth] User info request failed:`, errorText);
            throw new Error(`Failed to get ${this.providerName} user info`);
        }

        const userData = await userResponse.json() as any;
        console.log(`[${this.providerName} OAuth] User info received`);

        // 3. Normalize to standard format
        return this.normalizeUser(userData.data.user);
    }

    protected normalizeUser(rawData: any): OAuthUser {
        return {
            id: rawData.open_id,
            email: '', // TikTok doesn't provide email in basic scope
            name: rawData.display_name,
            picture: rawData.avatar_url,
            provider: this.providerName,
            raw: rawData,
        };
    }
}
