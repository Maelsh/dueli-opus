import { Hono } from 'hono';
import { getJitsiConfig } from '../lib/jitsi-config';

const app = new Hono();

/**
 * GET /api/jitsi/config
 * Returns the current Jitsi configuration with dynamic tunnel URL
 */
app.get('/config', async (c) => {
    try {
        const config = await getJitsiConfig(c.env);

        return c.json({
            success: true,
            data: config,
        });
    } catch (error) {
        console.error('Error fetching Jitsi config:', error);

        return c.json({
            success: false,
            error: 'Failed to fetch Jitsi configuration',
        }, 500);
    }
});

/**
 * GET /api/jitsi/status
 * Check if Jitsi server is reachable
 */
app.get('/status', async (c) => {
    try {
        const config = await getJitsiConfig(c.env);

        // Try to reach the Jitsi server
        const response = await fetch(config.serverUrl, {
            method: 'HEAD',
            signal: AbortSignal.timeout(5000), // 5 second timeout
        });

        return c.json({
            success: true,
            status: response.ok ? 'online' : 'offline',
            serverUrl: config.serverUrl,
        });
    } catch (error) {
        return c.json({
            success: false,
            status: 'offline',
            error: 'Jitsi server is not reachable',
        }, 503);
    }
});

export default app;
