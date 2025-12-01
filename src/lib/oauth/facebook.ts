import { OAuthUser } from './types';

export class FacebookOAuth {
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
            state: JSON.stringify({ state, lang }),
            scope: 'email,public_profile',
            response_type: 'code',
        });
        return `https://www.facebook.com/v18.0/dialog/oauth?${params.toString()}`;
    }

    async getUser(code: string): Promise<OAuthUser> {
        // 1. Get Token
        const tokenUrl = `https://graph.facebook.com/v18.0/oauth/access_token?` + new URLSearchParams({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            redirect_uri: this.redirectUri,
            code,
        });

        const tokenResponse = await fetch(tokenUrl);
        if (!tokenResponse.ok) {
            throw new Error('Failed to get Facebook token');
        }

        const tokenData = await tokenResponse.json();

        // 2. Get User Info
        const userUrl = `https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${tokenData.access_token}`;
        const userResponse = await fetch(userUrl);

        if (!userResponse.ok) {
            throw new Error('Failed to get Facebook user info');
        }

        const userData = await userResponse.json();

        return {
            id: userData.id,
            email: userData.email,
            name: userData.name,
            picture: userData.picture?.data?.url,
            provider: 'facebook',
            raw: userData,
        };
    }
}
