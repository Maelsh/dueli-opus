/**
 * @file modules/index.ts
 * @description تصدير جميع الوحدات
 * @description_en Export all modules
 * @module modules
 * @version 1.0.0
 * @author Dueli Team
 */

// Auth Module
export * from './auth';
export { authRoutes } from './auth';

// Competition Module
export * from './competitions';
export { competitionRoutes } from './competitions';

// User Module
export * from './users';
export { userRoutes, notificationRoutes } from './users';

// Category Module
export * from './categories';
export { categoryRoutes } from './categories';
