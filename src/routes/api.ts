/**
 * API Routes Factory (DEPRECATED)
 * This file is deprecated. Routes are now in modules/api/
 * Keeping minimal export for backward compatibility.
 */

import { Hono } from 'hono';
import type { Bindings, Variables } from '../config/types';

/**
 * Create empty API routes (all routes moved to modules/api)
 * @deprecated Use modules/api routes instead
 */
export function createApiRoutes() {
    return new Hono<{ Bindings: Bindings; Variables: Variables }>();
}

export default createApiRoutes;
