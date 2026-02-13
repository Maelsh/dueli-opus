/**
 * @file src/middleware/error-handler.ts
 * @description Global error handler middleware
 * @module middleware/error-handler
 * 
 * وسيطة معالجة الأخطاء العامة
 */

import { Context } from 'hono';
import { AppError } from '../lib/errors/AppError';

/**
 * Global error handler for Hono
 * Catches AppError instances and returns structured JSON responses
 */
export const errorHandler = (err: Error, c: Context) => {
    console.error(`[ERROR] ${err.name}: ${err.message}`);

    if (err instanceof AppError) {
        return c.json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                details: err.details
            }
        }, err.statusCode as any);
    }

    // Unexpected errors - don't leak internal details
    return c.json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'حدث خطأ غير متوقع / An unexpected error occurred'
        }
    }, 500);
};

export default errorHandler;
