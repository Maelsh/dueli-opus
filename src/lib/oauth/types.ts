export interface OAuthUser {
    id: string;
    email: string;
    name: string;
    picture?: string;
    provider: string;
    raw?: any;
}

export interface OAuthError {
    code: string;
    message: string;
}

export interface OAuthProviderConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    authUrl: string;
    tokenUrl: string;
    userUrl: string;
    scope: string;
}
