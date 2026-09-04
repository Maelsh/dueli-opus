/**
 * @file src/modules/api/cron/routes.ts
 * @description نقطة تشغيل مهام الصيانة عبر HTTP - T1.5
 *
 * Cloudflare Pages لا يدعم cron triggers، لذا يُستدعى هذا المسار
 * من مجدول خارجي (cron-job.org / GitHub Action / Worker) كل دقيقة.
 *
 * الحماية: مطلوب CRON_SECRET في متغيرات البيئة ومطابقته في ?key=
 *
 * GET/POST /api/cron/run?key=<CRON_SECRET>
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { runMinuteMaintenance } from '../../../lib/services/CronHandler';

const cronRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const handleRun = async (c: { req: any; env: Bindings }): Promise<Response> => {
    const secret = c.env.CRON_SECRET;
    const provided = c.req.query('key');

    if (!secret) {
        return Response.json(
            { success: false, error: 'CRON_SECRET not configured' },
            { status: 503 }
        );
    }

    if (provided !== secret) {
        return Response.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    try {
        const result = await runMinuteMaintenance({ DB: c.env.DB });
        return Response.json({ success: true, ...result });
    } catch (error) {
        console.error('[CronRoute] error:', error);
        return Response.json(
            { success: false, error: (error as Error).message },
            { status: 500 }
        );
    }
};

cronRoutes.get('/run', (c) => handleRun(c as any));
cronRoutes.post('/run', (c) => handleRun(c as any));

export default cronRoutes;
