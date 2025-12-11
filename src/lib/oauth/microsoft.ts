/**
 * Microsoft OAuth Provider
 * موفر مصادقة مايكروسوفت
 */

import { BaseOAuthProvider } from './BaseOAuthProvider';
import { OAuthUser } from './types';

/**
 * Extended options for Microsoft OAuth (includes tenantId)
 */
interface MicrosoftOAuthOptions {
    clientId: string;
    clientSecret: string;
    tenantId: string;
    redirectUri: string;
}

export class MicrosoftOAuth extends BaseOAuthProvider {
    readonly providerName = 'microsoft';
    protected readonly authBaseUrl: string;
    protected readonly tokenUrl: string;
    protected readonly userInfoUrl = 'https://graph.microsoft.com/v1.0/me';
    protected readonly scopes = 'openid email profile User.Read';

    private readonly tenantId: string;

    constructor(clientId: string, clientSecret: string, tenantId: string, redirectUri: string) {
        super({ clientId, clientSecret, redirectUri });
        this.tenantId = tenantId;
        this.authBaseUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize`;
        this.tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;
    }

    getAuthUrl(state: string, lang: string): string {
        return this.buildAuthUrl({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            response_mode: 'query',
            scope: this.scopes,
            state: JSON.stringify({ state, lang }),
        });
    }

    async getUser(code: string): Promise<OAuthUser> {
        console.log(`[${this.providerName} OAuth] Starting getUser`);

        // 1. Exchange code for token (custom body with scope)
        const tokenResponse = await fetch(this.tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code,
                redirect_uri: this.redirectUri,
                grant_type: 'authorization_code',
                scope: this.scopes,
            }),
        });

        if (!tokenResponse.ok) {
            const errorText = await tokenResponse.text();
            console.error(`[${this.providerName} OAuth] Token request failed:`, errorText);
            throw new Error(`Failed to get ${this.providerName} token`);
        }

        const tokenData = await tokenResponse.json() as any;
        console.log(`[${this.providerName} OAuth] Token received successfully`);

        // 2. Fetch user info
        const userData = await this.fetchUserInfo(tokenData.access_token);
        console.log(`[${this.providerName} OAuth] User info received`);

        // 3. Normalize to standard format
        return this.normalizeUser(userData);
    }

    protected normalizeUser(rawData: any): OAuthUser {
        return {
            id: rawData.id,
            email: rawData.mail || rawData.userPrincipalName || '',
            name: rawData.displayName || 'User',
            picture: undefined, // Microsoft doesn't provide picture directly
            provider: this.providerName,
            raw: rawData,
        };
    }
}
