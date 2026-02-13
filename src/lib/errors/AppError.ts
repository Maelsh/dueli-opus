/**
 * @file src/lib/errors/AppError.ts
 * @description Application error classes for structured error handling
 * @module lib/errors
 * 
 * فئات أخطاء التطبيق للتعامل المنظم مع الأخطاء
 */

/**
 * Base application error class
 */
export class AppError extends Error {
    constructor(
        public code: string,
        message: string,
        public statusCode: number = 500,
        public details?: any
    ) {
        super(message);
        this.name = 'AppError';
    }

    toJSON() {
        return {
            code: this.code,
            message: this.message,
            details: this.details,
        };
    }
}

/**
 * Validation error (422)
 */
export class ValidationError extends AppError {
    constructor(message: string, details?: any) {
        super('VALIDATION_ERROR', message, 422, details);
        this.name = 'ValidationError';
    }
}

/**
 * Authentication error (401)
 */
export class AuthenticationError extends AppError {
    constructor(message: string = 'غير مصرح / Unauthorized') {
        super('AUTHENTICATION_ERROR', message, 401);
        this.name = 'AuthenticationError';
    }
}

/**
 * Authorization error (403)
 */
export class AuthorizationError extends AppError {
    constructor(message: string = 'غير مسموح / Forbidden') {
        super('AUTHORIZATION_ERROR', message, 403);
        this.name = 'AuthorizationError';
    }
}

/**
 * Not found error (404)
 */
export class NotFoundError extends AppError {
    constructor(resource: string = 'Resource') {
        super('NOT_FOUND', `${resource} غير موجود / not found`, 404);
        this.name = 'NotFoundError';
    }
}

/**
 * Conflict error (409)
 */
export class ConflictError extends AppError {
    constructor(message: string) {
        super('CONFLICT_ERROR', message, 409);
        this.name = 'ConflictError';
    }
}

/**
 * User busy error (409)
 */
export class BusyError extends AppError {
    constructor(message: string = 'المستخدم مشغول في منافسة أخرى / User is busy') {
        super('USER_BUSY', message, 409);
        this.name = 'BusyError';
    }
}

/**
 * Time conflict error (409)
 */
export class TimeConflictError extends AppError {
    constructor(message: string = 'تعارض في المواعيد / Time conflict') {
        super('TIME_CONFLICT', message, 409);
        this.name = 'TimeConflictError';
    }
}

/**
 * Rate limit error (429)
 */
export class RateLimitError extends AppError {
    constructor(message: string = 'طلبات كثيرة جداً / Too many requests') {
        super('RATE_LIMIT', message, 429);
        this.name = 'RateLimitError';
    }
}

export default {
    AppError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    ConflictError,
    BusyError,
    TimeConflictError,
    RateLimitError,
};
