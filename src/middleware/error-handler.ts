import { Context } from 'hono';
import { AppError } from '../lib/errors/AppError';

/**
 * Global Error Handler Middleware
 * معالج الأخطاء العام
 */
export const errorHandler = (err: Error, c: Context) => {
    console.error('Error caught:', {
        name: err.name,
        message: err.message,
        stack: err.stack
    });
    
    if (err instanceof AppError) {
        return c.json({
            success: false,
            error: {
                code: err.code,
                message: err.message,
                details: err.details
            }
        }, err.statusCode);
    }
    
    // Unexpected errors
    return c.json({
        success: false,
        error: {
            code: 'INTERNAL_ERROR',
            message: 'حدث خطأ غير متوقع في الخادم'
        }
    }, 500);
};
