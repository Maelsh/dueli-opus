/**
 * OAuth Authentication Routes
 * مسارات مصادقة OAuth
 */

import { Hono } from 'hono';
import type { Bindings, Variables, ApiResponse } from '../../../config/types';
import { hashPassword, generateState, isEmailAllowed } from './helpers';
import { GoogleOAuth } from '../../../lib/oauth/google';
import { FacebookOAuth } from '../../../lib/oauth/facebook';
import { MicrosoftOAuth } from '../../../lib/oauth/microsoft';
import { TikTokOAuth } from '../../../lib/oauth/tiktok';
import { translations, getUILanguage, DEFAULT_LANGUAGE, DEFAULT_COUNTRY } from '../../../i18n';

const oauthRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * Get OAuth provider instance - الحصول على مزود OAuth
 */
function getOAuthProvider(provider: string, env: Bindings, redirectBase: string) {
  const redirectUri = `${redirectBase}/api/auth/oauth/${provider}/callback`;

  switch (provider) {
    case 'google':
      return new GoogleOAuth(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
    case 'facebook':
      return new FacebookOAuth(env.FACEBOOK_CLIENT_ID, env.FACEBOOK_CLIENT_SECRET, redirectUri);
    case 'microsoft':
      return new MicrosoftOAuth(env.MICROSOFT_CLIENT_ID, env.MICROSOFT_CLIENT_SECRET, env.MICROSOFT_TENANT_ID, redirectUri);
    case 'tiktok':
      return new TikTokOAuth(env.TIKTOK_CLIENT_KEY, env.TIKTOK_CLIENT_SECRET, redirectUri);
    default:
      return null;
  }
}

/**
 * OAuth Init - بدء OAuth
 * GET /api/auth/oauth/:provider
 */
oauthRoutes.get('/:provider', async (c) => {
  const provider = c.req.param('provider');
  const lang = c.req.query('lang') || DEFAULT_LANGUAGE;
  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;

  const oauth = getOAuthProvider(provider, c.env, origin);
  if (!oauth) {
    return c.json<ApiResponse>({
      success: false,
      error: 'Invalid provider'
    }, 400);
  }

  const state = generateState();
  const authUrl = oauth.getAuthUrl(state, lang);
  return c.redirect(authUrl);
});

/**
 * OAuth Callback - رد OAuth
 * GET /api/auth/oauth/:provider/callback
 */
oauthRoutes.get('/:provider/callback', async (c) => {
  const provider = c.req.param('provider');
  const code = c.req.query('code');
  const stateParam = c.req.query('state');
  const { DB } = c.env;

  const url = new URL(c.req.url);
  const origin = `${url.protocol}//${url.host}`;

  // Parse state to get lang
  let lang = DEFAULT_LANGUAGE;
  try {
    if (stateParam) {
      const stateObj = JSON.parse(stateParam);
      lang = stateObj.lang || DEFAULT_LANGUAGE;
    }
  } catch (e) {
    // Ignore parse error, default to DEFAULT_LANGUAGE
  }

  if (!code) {
    return c.html(getOAuthErrorHTML(lang, 'PROVIDER_ERROR'));
  }

  const oauth = getOAuthProvider(provider, c.env, origin);
  if (!oauth) {
    return c.html(getOAuthErrorHTML(lang, 'PROVIDER_ERROR'));
  }

  try {
    const oauthUser = await oauth.getUser(code);

    // Check email domain
    if (oauthUser.email && !isEmailAllowed(oauthUser.email)) {
      return c.html(getOAuthErrorHTML(lang, 'INVALID_EMAIL_DOMAIN'));
    }

    // Check if user exists
    let user = null;
    if (oauthUser.email) {
      user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(oauthUser.email).first();
    } else if (oauthUser.id) {
      user = await DB.prepare('SELECT * FROM users WHERE oauth_provider = ? AND oauth_id = ?').bind(provider, oauthUser.id).first();
    }

    if (user) {
      // Update OAuth info
      await DB.prepare(`
        UPDATE users 
        SET oauth_provider = ?, oauth_id = ?, avatar_url = COALESCE(avatar_url, ?)
        WHERE id = ?
      `).bind(provider, oauthUser.id, oauthUser.picture, (user as any).id).run();
    } else {
      // Create new user
      const password = crypto.randomUUID();
      const passwordHash = await hashPassword(password);
      const baseUsername = oauthUser.email ? oauthUser.email.split('@')[0].replace(/[^a-z0-9]/g, '').substring(0, 10) : 'user';
      const username = `${baseUsername}_${Date.now().toString(36)}`;

      const result = await DB.prepare(`
        INSERT INTO users (username, email, password_hash, display_name, country, language, oauth_provider, oauth_id, avatar_url, is_active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'))
      `).bind(
        username,
        oauthUser.email || '',
        passwordHash,
        oauthUser.name || username,
        DEFAULT_COUNTRY,
        lang,
        provider,
        oauthUser.id,
        oauthUser.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`
      ).run();

      user = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(result.meta.last_row_id).first();
    }

    // Create session
    const sessionId = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    await DB.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(sessionId, (user as any).id, expiresAt).run();

    return c.html(getOAuthSuccessHTML(lang, sessionId));

  } catch (error: any) {
    console.error('OAuth Error Details:', {
      provider,
      errorMessage: error?.message || 'Unknown error',
      error
    });

    return c.html(getOAuthErrorDetailHTML(provider, origin, error?.message || 'Unknown error'));
  }
});

/**
 * OAuth Error HTML - صفحة خطأ OAuth
 */
function getOAuthErrorHTML(lang: string, errorType: string): string {
  const tr = translations[getUILanguage(lang)];
  return `
    <!DOCTYPE html>
    <html>
    <head><title>OAuth Error</title></head>
    <body>
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'oauth_error', error: '${errorType}' }, window.location.origin);
          window.close();
        } else {
          window.location.href = '/?error=${errorType}&lang=${lang}';
        }
      </script>
      <p style="text-align:center;padding:20px;font-family:Arial;color:red;">
        ${tr.error_occurred} ${tr.close}...
      </p>
    </body>
    </html>
  `;
}

/**
 * OAuth Success HTML - صفحة نجاح OAuth
 */
function getOAuthSuccessHTML(lang: string, sessionId: string): string {
  const tr = translations[getUILanguage(lang)];
  return `
    <!DOCTYPE html>
    <html>
    <head><title>OAuth Success</title></head>
    <body style="font-family: Arial, sans-serif; text-align: center; padding: 40px; background: #f0fdf4;">
      <div style="background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); max-width: 400px; margin: 0 auto;">
        <h2 style="color: #22c55e; margin: 0 0 20px 0;">✓ ${tr.success}</h2>
        <p style="color: #666; margin: 0 0 20px 0;">${tr.loading}</p>
        <button onclick="window.close()" style="background: #22c55e; color: white; border: none; padding: 10px 30px; border-radius: 6px; cursor: pointer; font-size: 16px;">
          ${tr.close}
        </button>
      </div>
      <script>
        setTimeout(function() {
          if (window.opener) {
            window.opener.postMessage({
              type: 'oauth_success',
              session: '${sessionId}'
            }, '*');
            setTimeout(function() {
              window.close();
            }, 300);
          }
        }, 100);
      </script>
    </body>
    </html>
  `;
}

/**
 * OAuth Error Detail HTML - صفحة تفاصيل خطأ OAuth
 */
function getOAuthErrorDetailHTML(provider: string, origin: string, errorMessage: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>OAuth Error</title>
      <style>
        body { font-family: Arial, sans-serif; padding: 20px; background: #f5f5f5; }
        .error-box { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
        h2 { color: #dc2626; margin-top: 0; }
        pre { background: #f0f0f0; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
        button { background: #3b82f6; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; margin-top: 10px; }
        button:hover { background: #2563eb; }
      </style>
    </head>
    <body>
      <div class="error-box">
        <h2>OAuth Error</h2>
        <p><strong>Provider:</strong> ${provider}</p>
        <p><strong>Error:</strong></p>
        <pre>${errorMessage}</pre>
        <p><strong>Origin:</strong> ${origin}</p>
        <button onclick="window.close()">Close Window</button>
        <button onclick="window.opener?.postMessage({ type: 'oauth_error', error: 'PROVIDER_ERROR' }, window.location.origin); window.close();">Close & Report Error</button>
      </div>
    </body>
    </html>
  `;
}

export default oauthRoutes;
