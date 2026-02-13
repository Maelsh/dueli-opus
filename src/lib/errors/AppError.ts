/**
 * Base Application Error Class
 * فئة الأخطاء الأساسية للتطبيق
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
        Error.captureStackTrace(this, this.constructor);
    }

    toJSON() {
        return {
            code: this.code,
            message: this.message,
            statusCode: this.statusCode,
            details: this.details
        };
    }
}

/**
 * Validation Error - 422 Unprocessable Entity
 * خطأ التحقق من الصحة
 */
export class ValidationError extends AppError {
    constructor(message: string, details?: any) {
        super('VALIDATION_ERROR', message, 422, details);
        this.name = 'ValidationError';
    }
}

/**
 * Authentication Error - 401 Unauthorized
 * خطأ المصادقة
 */
export class AuthenticationError extends AppError {
    constructor(message: string = 'غير مصرح - يجب تسجيل الدخول') {
        super('AUTHENTICATION_ERROR', message, 401);
        this.name = 'AuthenticationError';
    }
}

/**
 * Authorization Error - 403 Forbidden
 * خطأ الصلاحية
 */
export class AuthorizationError extends AppError {
    constructor(message: string = 'غير مسموح - ليس لديك صلاحية') {
        super('AUTHORIZATION_ERROR', message, 403);
        this.name = 'AuthorizationError';
    }
}

/**
 * Conflict Error - 409 Conflict
 * خطأ التعارض
 */
export class ConflictError extends AppError {
    constructor(message: string, details?: any) {
        super('CONFLICT_ERROR', message, 409, details);
        this.name = 'ConflictError';
    }
}

/**
 * Not Found Error - 404 Not Found
 * خطأ عدم الوجود
 */
export class NotFoundError extends AppError {
    constructor(resource: string = 'المورد') {
        super('NOT_FOUND', `${resource} غير موجود`, 404);
        this.name = 'NotFoundError';
    }
}

/**
 * User Busy Error - 409 Conflict
 * خطأ المستخدم مشغول
 */
export class BusyError extends AppError {
    constructor(message: string = 'المستخدم مشغول في منافسة أخرى') {
        super('USER_BUSY', message, 409);
        this.name = 'BusyError';
    }
}

/**
 * Time Conflict Error - 409 Conflict
 * خطأ تعارض المواعيد
 */
export class TimeConflictError extends AppError {
    constructor(message: string = 'تعارض في المواعيد - لديك منافسة في نفس الوقت') {
        super('TIME_CONFLICT', message, 409);
        this.name = 'TimeConflictError';
    }
}

/**
 * Rate Limit Error - 429 Too Many Requests
 * خطأ تجاوز الحد
 */
export class RateLimitError extends AppError {
    constructor(message: string = 'تجاوزت الحد المسموح من الطلبات') {
        super('RATE_LIMIT_EXCEEDED', message, 429);
        this.name = 'RateLimitError';
    }
}
