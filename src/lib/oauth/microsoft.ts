import { OAuthUser } from './types';

export class MicrosoftOAuth {
    private clientId: string;
    private clientSecret: string;
    private tenantId: string;
    private redirectUri: string;

    constructor(clientId: string, clientSecret: string, tenantId: string, redirectUri: string) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.tenantId = tenantId;
        this.redirectUri = redirectUri;
    }

    getAuthUrl(state: string, lang: string): string {
        const params = new URLSearchParams({
            client_id: this.clientId,
            response_type: 'code',
            redirect_uri: this.redirectUri,
            response_mode: 'query',
            scope: 'openid email profile User.Read',
            state: JSON.stringify({ state, lang }),
        });
        return `https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
    }

    async getUser(code: string): Promise<OAuthUser> {
        // 1. Get Token
        const tokenResponse = await fetch(`https://login.microsoftonline.com/${this.tenantId}/oauth2/v2.0/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: this.clientId,
                client_secret: this.clientSecret,
                code,
                redirect_uri: this.redirectUri,
                grant_type: 'authorization_code',
                scope: 'openid email profile User.Read',
            }),
        });

        if (!tokenResponse.ok) {
            throw new Error('Failed to get Microsoft token');
        }

        const tokenData = await tokenResponse.json();

        // 2. Get User Info
        const userResponse = await fetch('https://graph.microsoft.com/v1.0/me', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (!userResponse.ok) {
            throw new Error('Failed to get Microsoft user info');
        }

        const userData = await userResponse.json();

        return {
            id: userData.id,
            email: userData.mail || userData.userPrincipalName,
            name: userData.displayName,
            picture: undefined, // Requires another call, skipping for now
            provider: 'microsoft',
            raw: userData,
        };
    }
}
