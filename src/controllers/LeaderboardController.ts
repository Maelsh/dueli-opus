/**
 * @file src/controllers/LeaderboardController.ts
 * @description متحكم المتصدرين — HTTP فقط، المنطق والاستعلامات في LeaderboardModel (B13)
 * @module controllers/LeaderboardController
 */

import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { LeaderboardModel } from '../models/LeaderboardModel';

export class LeaderboardController extends BaseController {
    /**
     * GET /api/leaderboard
     * دائماً JSON: نجاح/فارغ = 200، خطأ داخلي = 500 برسالة مترجمة عامة بلا تسريب.
     */
    async getLeaderboard(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            const limit = parseInt(c.req.query('limit') || '50', 10);
            const model = new LeaderboardModel(c.env.DB);
            const leaders = await model.getLeaderboard(limit);
            return this.success(c, leaders);
        } catch (error) {
            // التفاصيل الداخلية في اللوج فقط — لا تسرّب للمستخدم أبداً
            console.error('[LeaderboardController] Error:', error);
            return this.error(c, this.t('errors.service_unavailable', c), 500);
        }
    }
}

export default LeaderboardController;