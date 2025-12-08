/**
 * @file modules/auth/index.ts
 * @description تصدير مكونات المصادقة
 * @description_en Export authentication components
 * @module modules/auth
 * @version 1.0.0
 */

export * from './AuthRepository';
export * from './AuthService';
export * from './AuthController';
export { default as authRoutes } from './routes';

// تصدير الكلاسات الرئيسية
export { UserRepository, SessionRepository } from './AuthRepository';
export { AuthService } from './AuthService';
export { AuthController, authController } from './AuthController';
