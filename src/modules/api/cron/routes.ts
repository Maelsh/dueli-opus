/**
 * @file src/modules/api/cron/routes.ts
 * @description نقطة تشغيل مهام الصيانة عبر HTTP - T1.5
 *
 * Cloudflare Pages لا يدعم cron triggers، لذا يُستدعى هذا المسار
 * من مجدول خارجي (cron-job.org / GitHub Action / Worker) كل دقيقة.
 *
 * الحماية (SEC-04، docs/12-SECURITY-REMEDIATION.md): CRON_SECRET عبر ترويسة
 * `Authorization: Bearer <CRON_SECRET>` فقط — لا `?key=` بعد الآن، لأن query
 * strings تُسجَّل في سجلات الطلبات وأي proxy بينها؛ سرّ يشغّل توزيع الأرباح
 * تلقائياً لا يجوز أن يظهر في سجل نصي. `GET` مرفوض أيضاً (قابل للتشغيل من
 * متصفح أو زاحف بمجرد معرفة الرابط) — `POST` فقط.
 *
 * POST /api/cron/run  Authorization: Bearer <CRON_SECRET>
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { runMinuteMaintenance } from '../../../lib/services/CronHandler';
import { CryptoUtils } from '../../../lib/services/CryptoUtils';

const cronRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();

const handleRun = async (c: { req: any; env: Bindings }): Promise<Response> => {
    const secret = c.env.CRON_SECRET;
    const authHeader: string = c.req.header('Authorization') || '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';

    if (!secret) {
        return Response.json(
            { success: false, error: 'CRON_SECRET not configured' },
            { status: 503 }
        );
    }

    if (!provided || !CryptoUtils.timingSafeEqualString(provided, secret)) {
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

cronRoutes.post('/run', (c) => handleRun(c as any));

export default cronRoutes;
