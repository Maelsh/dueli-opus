/**
 * UNIT34-A — request ID propagation and response correlation header.
 */

import type { MiddlewareHandler } from 'hono';
import type { Bindings, Variables } from '../config/types';
import { logStructuredServerError } from '../lib/services/structured-server-log';

const REQUEST_ID_HEADER = 'x-request-id';

function acceptRequestId(raw: string | undefined): string | null {
    if (!raw) return null;
    const trimmed = raw.trim();
    if (trimmed.length < 8 || trimmed.length > 128) return null;
    if (!/^[\w.-]+$/.test(trimmed)) return null;
    return trimmed;
}

export function requestContextMiddleware(): MiddlewareHandler<{ Bindings: Bindings; Variables: Variables }> {
    return async (c, next) => {
        const requestId = acceptRequestId(c.req.header(REQUEST_ID_HEADER)) ?? crypto.randomUUID();
        const started = Date.now();
        c.set('requestId', requestId);
        c.set('requestStartMs', started);
        try {
            await next();
        } finally {
            c.header('X-Request-Id', requestId);
            const status = c.res.status;
            if (status >= 500) {
                logStructuredServerError({
                    requestId,
                    method: c.req.method,
                    path: c.req.path,
                    status,
                    durationMs: Date.now() - started,
                    errorCode: 'HTTP_5XX',
                });
            }
        }
    };
}

export { REQUEST_ID_HEADER };
