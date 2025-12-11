/**
 * OAuth Module Exports
 * تصدير وحدة OAuth
 */

// Base class
export { BaseOAuthProvider, OAuthProviderOptions } from './BaseOAuthProvider';

// Factory
export { OAuthProviderFactory, OAuthProviderType, OAuthFactoryConfig } from './OAuthProviderFactory';

// Providers
export { GoogleOAuth } from './google';
export { FacebookOAuth } from './facebook';
export { MicrosoftOAuth } from './microsoft';
export { TikTokOAuth } from './tiktok';

// Types
export { OAuthUser, OAuthError, OAuthProviderConfig } from './types';

// Utilities
export { ALLOWED_EMAIL_DOMAINS, isEmailAllowed, generateState } from './utils';
