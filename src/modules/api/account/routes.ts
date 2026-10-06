/**
 * Account API Routes (R2-A)
 * Self-service username / password / email change. Authenticated only.
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../../../config/types';
import { AccountController } from '../../../controllers/AccountController';
import { authMiddleware } from '../../../middleware/auth';

const accountRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
accountRoutes.use('*', authMiddleware({ required: false }));
const controller = new AccountController();

accountRoutes.put('/username', (c) => controller.updateUsername(c));
accountRoutes.put('/password', (c) => controller.updatePassword(c));
accountRoutes.put('/email', (c) => controller.updateEmail(c));

export default accountRoutes;
