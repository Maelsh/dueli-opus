/**
 * Jitsi API Routes
 * مسارات API لـ Jitsi
 * 
 * Handles Jitsi Meet configuration and status.
 * MVC-compliant with i18n.
 */

import { Hono } from 'hono';
import type { Bindings, Variables, Language } from '../../../config/types';
import { getJitsiConfig } from '../../../lib/jitsi-config';
import { t } from '../../../i18n';

const jitsiRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

/**
 * GET /api/jitsi/config
 * Returns the current Jitsi configuration with dynamic tunnel URL
 */
jitsiRoutes.get('/config', async (c) => {
    const lang = (c.get('lang') || 'en') as Language;

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
            error: t('errors.fetch_failed', lang),
        }, 500);
    }
});

/**
 * GET /api/jitsi/status
 * Check if Jitsi server is reachable
 */
jitsiRoutes.get('/status', async (c) => {
    const lang = (c.get('lang') || 'en') as Language;

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
            error: t('server_error', lang),
        }, 503);
    }
});

export default jitsiRoutes;
