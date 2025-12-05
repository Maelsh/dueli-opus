import { OAuthUser } from './types';

export class TikTokOAuth {
    private clientKey: string;
    private clientSecret: string;
    private redirectUri: string;

    constructor(clientKey: string, clientSecret: string, redirectUri: string) {
        this.clientKey = clientKey;
        this.clientSecret = clientSecret;
        this.redirectUri = redirectUri;
    }

    getAuthUrl(state: string, lang: string): string {
        const params = new URLSearchParams({
            client_key: this.clientKey,
            redirect_uri: this.redirectUri,
            scope: 'user.info.profile',
            response_type: 'code',
            state: JSON.stringify({ state, lang }),
        });
        return `https://www.tiktok.com/v2/auth/authorize/?${params.toString()}`;
    }

    async getUser(code: string): Promise<OAuthUser> {
        // 1. Get Token
        const tokenResponse = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
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
            throw new Error('Failed to get TikTok token');
        }

        const tokenData = await tokenResponse.json() as any;

        // 2. Get User Info
        const userResponse = await fetch('https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,avatar_url,display_name', {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });

        if (!userResponse.ok) {
            throw new Error('Failed to get TikTok user info');
        }

        const userData = await userResponse.json() as any;
        const user = userData.data.user;

        return {
            id: user.open_id,
            email: '', // TikTok doesn't provide email by default in basic scope
            name: user.display_name,
            picture: user.avatar_url,
            provider: 'tiktok',
            raw: userData,
        };
    }
}
