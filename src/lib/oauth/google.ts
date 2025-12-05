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
        console.log('[Google OAuth] Starting getUser with redirect_uri:', this.redirectUri);

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
            const errorText = await tokenResponse.text();
            console.error('[Google OAuth] Token request failed:', {
                status: tokenResponse.status,
                statusText: tokenResponse.statusText,
                error: errorText
            });
            throw new Error(`Failed to get Google token: ${tokenResponse.status} - ${errorText}`);
        }

        const tokenData = await tokenResponse.json() as any;
        console.log('[Google OAuth] Token received successfully');

        // 2. Get User Info
        const userResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (!userResponse.ok) {
            const errorText = await userResponse.text();
            console.error('[Google OAuth] User info request failed:', {
                status: userResponse.status,
                statusText: userResponse.statusText,
                error: errorText
            });
            throw new Error(`Failed to get Google user info: ${userResponse.status} - ${errorText}`);
        }

        const userData = await userResponse.json() as any;
        console.log('[Google OAuth] User info received:', { id: userData.id, email: userData.email, name: userData.name });

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

