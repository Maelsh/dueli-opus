/**
 * TurnCredentialService — Phase 7.D: TURN/STUN behind NAT/restricted networks.
 * خدمة اعتمادات TURN المؤقتة قصيرة الأجل
 *
 * Guarantees (7.D):
 *  - Credentials are EPHEMERAL and SHORT-LIVED, generated server-side per
 *    session/request — never a shared static secret.
 *  - All secrets stay in environment variables (wrangler secrets / Pages env):
 *    TURN_SECRET (coturn REST auth secret) or TURN_API_TOKEN (Cloudflare Calls).
 *    Nothing secret is ever committed to the repo or echoed beyond the
 *    ephemeral username/credential pair the browser legitimately needs.
 *  - Graceful degradation: when TURN is not configured the platform falls back
 *    to STUN-only (open networks still work); when the TURN backend FAILS the
 *    caller surfaces a translated `live.turn_unavailable` message instead of a
 *    black screen.
 */

export interface TurnIceServer {
    urls: string | string[];
    username?: string;
    credential?: string;
    credentialType?: string;
}

export interface TurnResolution {
    iceServers: TurnIceServer[];
    /** true when relay (TURN) credentials were provided; false = STUN-only fallback. */
    turn_available: boolean;
    /** Lifetime of the ephemeral credential in seconds (only when turn_available). */
    ttl_seconds?: number;
    /** ISO instant after which the credential stops working (only when turn_available). */
    expires_at?: string;
}

/** Thrown when a TURN backend is configured but fails — maps to live.turn_unavailable. */
export class TurnCredentialError extends Error {
    constructor(message = 'turn_backend_failed') {
        super(message);
        this.name = 'TurnCredentialError';
    }
}

export interface TurnServiceEnv {
    TURN_URL?: string;
    TURN_SECRET?: string;
    TURN_TOKEN_ID?: string;
    TURN_API_TOKEN?: string;
}

/** Ephemeral-credential lifetime. Short by design (per-session, renewable). */
const CREDENTIAL_TTL_SECONDS = 3600;

/** STUN-only fallback (open networks). Restricted networks need TURN relay. */
export const DEFAULT_STUN_SERVERS: TurnIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
];

export class TurnCredentialService {

    /**
     * Resolve ICE servers for this session. Never throws for "not configured"
     * (STUN-only fallback); throws TurnCredentialError only when a configured
     * backend fails, so the route can return a translated, actionable message.
     */
    async resolve(): Promise<TurnResolution> {
        const env = this.env;

        // Backend A: self-hosted coturn with the standard TURN REST auth
        // (RFC-style ephemeral credentials): username = `<expiry>:<userId>`,
        // credential = base64(HMAC-SHA1(TURN_SECRET, username)).
        if (env.TURN_URL && env.TURN_SECRET) {
            const expiryUnix = Math.floor(Date.now() / 1000) + CREDENTIAL_TTL_SECONDS;
            const username = `${expiryUnix}:${this.userId ?? 'anonymous'}`;
            const credential = await this.hmacSha1Base64(env.TURN_SECRET, username);
            return {
                iceServers: this.buildRelayUrls(env.TURN_URL).map((urls) => ({
                    urls,
                    username,
                    credential,
                })),
                turn_available: true,
                ttl_seconds: CREDENTIAL_TTL_SECONDS,
                expires_at: new Date(expiryUnix * 1000).toISOString(),
            };
        }

        // Backend B: Cloudflare Calls TURN — short-lived credentials generated
        // per session (no shared cached credential), ttl requested = 3600s.
        if (env.TURN_TOKEN_ID && env.TURN_API_TOKEN) {
            const iceServers = await this.fetchCloudflareIceServers();
            return {
                iceServers,
                turn_available: iceServers.length > 0,
                ttl_seconds: CREDENTIAL_TTL_SECONDS,
                expires_at: new Date(Date.now() + CREDENTIAL_TTL_SECONDS * 1000).toISOString(),
            };
        }

        // Not configured — graceful degradation to STUN-only (open networks).
        return { iceServers: DEFAULT_STUN_SERVERS.map((s) => ({ ...s })), turn_available: false };
    }

    /**
     * TURN URL list → relay URLs. Accepts a comma-separated list. For every
     * `turn:` (UDP) URL without an explicit transport, adds a `transport=tcp`
     * variant so restricted networks (UDP blocked) can still reach the relay.
     */
    private buildRelayUrls(turnUrl: string): string[] {
        const urls: string[] = [];
        for (const raw of turnUrl.split(',').map((s) => s.trim()).filter(Boolean)) {
            urls.push(raw);
            if (raw.startsWith('turn:') && !raw.includes('transport=')) {
                urls.push(`${raw}?transport=tcp`);
            }
        }
        return urls;
    }

    /** base64(HMAC-SHA1(secret, message)) via WebCrypto (Workers + Node compatible). */
    private async hmacSha1Base64(secret: string, message: string): Promise<string> {
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            enc.encode(secret),
            { name: 'HMAC', hash: 'SHA-1' },
            false,
            ['sign'],
        );
        const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
        let binary = '';
        const bytes = new Uint8Array(sig);
        for (const b of bytes) binary += String.fromCharCode(b);
        return btoa(binary);
    }

    /**
     * Cloudflare Calls TURN (rtc.live.cloudflare.com):
     * POST /v1/turn/keys/{TURN_TOKEN_ID}/credentials/generate-ice-servers
     * The API token stays server-side; only the short-lived ICE servers are
     * returned. Per-session request — the previous ~6h shared Cache API entry
     * (one credential reused across all sessions) is intentionally dropped.
     */
    private async fetchCloudflareIceServers(): Promise<TurnIceServer[]> {
        let res: Response;
        try {
            res = await fetch(
                `https://rtc.live.cloudflare.com/v1/turn/keys/${this.env.TURN_TOKEN_ID}/credentials/generate-ice-servers`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.env.TURN_API_TOKEN}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
                },
            );
        } catch {
            throw new TurnCredentialError('turn_backend_unreachable');
        }

        if (!res.ok) {
            // Never log/echo the token or the API error body to the client.
            console.error('Cloudflare TURN API error:', res.status);
            throw new TurnCredentialError('turn_backend_rejected');
        }

        const body = await res.json<{ iceServers?: TurnIceServer[] }>().catch(() => null);
        if (!body || !Array.isArray(body.iceServers)) {
            throw new TurnCredentialError('turn_backend_malformed');
        }
        return body.iceServers;
    }

    /** Ephemeral-credential lifetime (seconds) — exposed for tests/clients. */
    static readonly TTL_SECONDS = CREDENTIAL_TTL_SECONDS;

    constructor(
        private readonly env: TurnServiceEnv,
        /** Owning session's user id — bound into the ephemeral username. */
        private readonly userId: number | null,
    ) {}

    /** True when either TURN backend is configured via environment variables. */
    isConfigured(): boolean {
        const env = this.env;
        return Boolean(
            (env.TURN_URL && env.TURN_SECRET)
            || (env.TURN_TOKEN_ID && env.TURN_API_TOKEN),
        );
    }
}

