/**
 * @file core/index.ts
 * @description تصدير جميع مكونات النواة
 * @description_en Export all core components
 * @module core
 * @version 1.0.0
 * @author Dueli Team
 */

// HTTP Components
export * from './http';
export { 
  Validator, 
  BaseController, 
  HttpStatus 
} from './http';
export type { 
  ControllerContext,
  ValidationSchema,
  ValidationResult,
  ValidationError,
  ValidationRule,
  Bindings,
  Variables,
  Language,
  AppContext,
  ApiResponse,
  User,
  Session,
  OAuthUser,
  Competition,
  Category,
  Rating,
  Comment,
  Notification,
  PaginationOptions,
  PaginatedResult
} from './http';

// Database Components
export * from './database';
export { BaseRepository } from './database';
export type {
  QueryOptions,
  InsertResult,
  UpdateResult,
  DeleteResult
} from './database';

// I18n Components
export * from './i18n';
export { I18nService, i18n, t, getDir, isRTL } from './i18n';
