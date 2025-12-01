import { OAuthUser } from './types';

export class GoogleOAuth {
    private clientId: string;
    private clientSecret: string;
    private redirectUri: string;

    constructor(clientId: string, clientSecret: string, redirectUri: string) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    getAuthUrl(state: string, lang: string): string {
        const params = new URLSearchParams({
            client_id: this.clientId,
            redirect_uri: this.redirectUri,
            response_type: 'code',
            scope: 'openid email profile',
            state: JSON.stringify({ state, lang }), // Pass lang in state
            access_type: 'offline',
            prompt: 'consent'
        });
        return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    }

    async getUser(code: string): Promise<OAuthUser> {
        // 1. Get Token
        const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
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

        if (!tokenResponse.ok) {
            throw new Error('Failed to get Google token');
        }

        const tokenData = await tokenResponse.json();

        // 2. Get User Info
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (!userResponse.ok) {
            throw new Error('Failed to get Google user info');
        }

        const userData = await userResponse.json();

        return {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            picture: userData.picture,
            provider: 'google',
            raw: userData,
        };
    }
}
