/**
 * Jitsi Configuration Module
 * Dynamically fetches the current Cloudflare Tunnel URL for Jitsi Meet
 */

const CLOUDFLARE_ACCOUNT_ID = '9c325cdf5a11fead7617a2f5051b530a';
const TUNNEL_ID = 'bd19fb5a-4294-494e-a8d1-3f2e6b0bc8ad';

interface TunnelConnection {
    id: string;
    colo_name: string;
    is_pending_reconnect: boolean;
    client_id: string;
    client_version: string;
    opened_at: string;
    origin_ip: string;
}

interface TunnelInfo {
    id: string;
    name: string;
    status: string;
    created_at: string;
    connections: TunnelConnection[];
}

/**
 * Get the current Jitsi server URL from Cloudflare Tunnel
 * This allows using Quick Tunnel with dynamic URLs
 */
export async function getJitsiServerUrl(env: { CLOUDFLARE_API_TOKEN?: string }): Promise<string> {
    try {
        if (!env.CLOUDFLARE_API_TOKEN) {
            // No token, return localhost for development
            return 'http://localhost';
        }

        // Query Cloudflare API for tunnel info
        const response = await fetch(
            `https://api.cloudflare.com/client/v4/accounts/${CLOUDFLARE_ACCOUNT_ID}/cfd_tunnel/${TUNNEL_ID}`,
            {
                headers: {
                    'Authorization': `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
                    'Content-Type': 'application/json',
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Cloudflare API error: ${response.status}`);
        }

        const data = await response.json() as any;
        const tunnel: TunnelInfo = data.result;

        // Check if tunnel is active
        if (tunnel.status !== 'active' || !tunnel.connections || tunnel.connections.length === 0) {
            throw new Error('Tunnel is not active or has no connections');
        }

        // For Quick Tunnel, the URL format is: https://{tunnel-id}.cfargotunnel.com
        // For Named Tunnel with hostname, we would get it from the configuration
        const tunnelUrl = `https://${TUNNEL_ID}.cfargotunnel.com`;

        return tunnelUrl;
    } catch (error) {
        console.error('Failed to fetch Jitsi server URL:', error);
        // Fallback to localhost for development
        return 'http://localhost';
    }
}

/**
 * Get Jitsi configuration for the frontend
 */
export async function getJitsiConfig(env: { CLOUDFLARE_API_TOKEN?: string }) {
    const serverUrl = await getJitsiServerUrl(env);

    return {
        domain: serverUrl.replace(/^https?:\/\//, ''), // Remove protocol
        serverUrl: serverUrl,
        options: {
            roomName: '', // Will be set dynamically
            width: '100%',
            height: '100%',
            parentNode: undefined, // Will be set by frontend
            configOverwrite: {
                startWithAudioMuted: true,
                startWithVideoMuted: false,
                enableWelcomePage: false,
                prejoinPageEnabled: false,
            },
            interfaceConfigOverwrite: {
                SHOW_JITSI_WATERMARK: false,
                SHOW_WATERMARK_FOR_GUESTS: false,
                TOOLBAR_BUTTONS: [
                    'microphone',
                    'camera',
                    'closedcaptions',
                    'desktop',
                    'fullscreen',
                    'fodeviceselection',
                    'hangup',
                    'chat',
                    'recording',
                    'livestreaming',
                    'settings',
                    'videoquality',
                    'filmstrip',
                    'stats',
                    'shortcuts',
                    'tileview',
                ],
            },
        },
    };
}
