/**
 * @file core/http/BaseController.ts
 * @description المتحكم الأساسي - الكلاس الأب لجميع المتحكمات
 * @description_en Base Controller - Parent class for all controllers
 * @module core/http/BaseController
 * @version 1.0.0
 * @author Dueli Team
 */

import type { Context } from 'hono';
import type { Bindings, Variables, ApiResponse, Language } from './types';
import { Validator, ValidationSchema, ValidationResult } from './Validator';

/**
 * سياق المتحكم
 * Controller context type
 */
export type ControllerContext = Context<{ Bindings: Bindings; Variables: Variables }>;

/**
 * أكواد حالة HTTP الشائعة
 * Common HTTP status codes
 */
export enum HttpStatus {
  OK = 200,
  CREATED = 201,
  NO_CONTENT = 204,
  BAD_REQUEST = 400,
  UNAUTHORIZED = 401,
  FORBIDDEN = 403,
  NOT_FOUND = 404,
  CONFLICT = 409,
  UNPROCESSABLE_ENTITY = 422,
  TOO_MANY_REQUESTS = 429,
  INTERNAL_SERVER_ERROR = 500,
  SERVICE_UNAVAILABLE = 503
}

/**
 * المتحكم الأساسي المجرد
 * Abstract Base Controller
 * 
 * جميع المتحكمات في التطبيق يجب أن ترث من هذا الكلاس
 * All controllers in the application must extend this class
 * 
 * @example
 * ```typescript
 * class AuthController extends BaseController {
 *   async login(c: ControllerContext) {
 *     const body = await this.parseBody(c);
 *     if (!body) return this.badRequest(c, 'Invalid request body');
 *     
 *     // Business logic...
 *     
 *     return this.ok(c, { user, token });
 *   }
 * }
 * ```
 */
export abstract class BaseController {
  /**
   * اسم المتحكم للتسجيل
   * Controller name for logging
   */
  protected readonly controllerName: string;

  constructor(name: string) {
    this.controllerName = name;
  }

  // ============================================
  // Response Methods - دوال الاستجابة
  // ============================================

  /**
   * استجابة ناجحة مع بيانات
   * Successful response with data
   * 
   * @param c - سياق Hono
   * @param data - البيانات المرجعة
   * @param message - رسالة اختيارية
   * @param status - كود الحالة (افتراضي 200)
   */
  protected ok<T>(
    c: ControllerContext,
    data?: T,
    message?: string,
    status: number = HttpStatus.OK
  ) {
    const response: ApiResponse<T> = {
      success: true,
      data,
      message
    };
    return c.json(response, status as any);
  }

  /**
   * استجابة إنشاء ناجحة (201)
   * Created response (201)
   */
  protected created<T>(c: ControllerContext, data: T, message?: string) {
    return this.ok(c, data, message, HttpStatus.CREATED);
  }

  /**
   * استجابة بدون محتوى (204)
   * No content response (204)
   */
  protected noContent(c: ControllerContext) {
    return c.body(null, HttpStatus.NO_CONTENT);
  }

  /**
   * خطأ طلب غير صالح (400)
   * Bad request error (400)
   * 
   * @param c - سياق Hono
   * @param error - رسالة الخطأ
   */
  protected badRequest(c: ControllerContext, error: string) {
    return c.json<ApiResponse>(
      { success: false, error },
      HttpStatus.BAD_REQUEST
    );
  }

  /**
   * خطأ غير مصرح (401)
   * Unauthorized error (401)
   */
  protected unauthorized(c: ControllerContext, error: string = 'Unauthorized') {
    return c.json<ApiResponse>(
      { success: false, error },
      HttpStatus.UNAUTHORIZED
    );
  }

  /**
   * خطأ محظور (403)
   * Forbidden error (403)
   */
  protected forbidden(c: ControllerContext, error: string = 'Forbidden') {
    return c.json<ApiResponse>(
      { success: false, error },
      HttpStatus.FORBIDDEN
    );
  }

  /**
   * خطأ غير موجود (404)
   * Not found error (404)
   */
  protected notFound(c: ControllerContext, error: string = 'Not found') {
    return c.json<ApiResponse>(
      { success: false, error },
      HttpStatus.NOT_FOUND
    );
  }

  /**
   * خطأ تعارض (409)
   * Conflict error (409)
   */
  protected conflict(c: ControllerContext, error: string) {
    return c.json<ApiResponse>(
      { success: false, error },
      HttpStatus.CONFLICT
    );
  }

  /**
   * خطأ التحقق (422)
   * Validation error (422)
   */
  protected validationError(c: ControllerContext, errors: any) {
    return c.json<ApiResponse>(
      { success: false, error: 'Validation failed', data: errors },
      HttpStatus.UNPROCESSABLE_ENTITY
    );
  }

  /**
   * خطأ كثرة الطلبات (429)
   * Too many requests error (429)
   */
  protected tooManyRequests(c: ControllerContext, error: string = 'Too many requests') {
    return c.json<ApiResponse>(
      { success: false, error },
      HttpStatus.TOO_MANY_REQUESTS
    );
  }

  /**
   * خطأ الخادم (500)
   * Server error (500)
   * 
   * @param c - سياق Hono
   * @param error - الخطأ (يُسجل فقط، لا يُرسل للعميل)
   */
  protected serverError(c: ControllerContext, error?: Error | string) {
    // تسجيل الخطأ للتتبع
    console.error(`[${this.controllerName}] Server Error:`, error);
    
    return c.json<ApiResponse>(
      { success: false, error: 'Internal server error' },
      HttpStatus.INTERNAL_SERVER_ERROR
    );
  }

  // ============================================
  // Request Helpers - دوال مساعدة للطلبات
  // ============================================

  /**
   * تحليل جسم الطلب JSON
   * Parse JSON request body
   * 
   * @param c - سياق Hono
   * @returns البيانات المحللة أو null
   */
  protected async parseBody<T = any>(c: ControllerContext): Promise<T | null> {
    try {
      return await c.req.json<T>();
    } catch {
      return null;
    }
  }

  /**
   * تحليل والتحقق من جسم الطلب
   * Parse and validate request body
   * 
   * @param c - سياق Hono
   * @param schema - مخطط التحقق
   * @returns نتيجة التحقق
   */
  protected async parseAndValidate<T extends Record<string, any>>(
    c: ControllerContext,
    schema: ValidationSchema<T>
  ): Promise<ValidationResult<T>> {
    const body = await this.parseBody(c);
    if (!body) {
      return {
        success: false,
        errors: [{
          field: '_body',
          message: 'Invalid or empty request body',
          rule: 'required'
        }]
      };
    }
    return Validator.validate<T>(body, schema);
  }

  /**
   * الحصول على معامل من الرابط
   * Get parameter from URL
   * 
   * @param c - سياق Hono
   * @param name - اسم المعامل
   * @returns قيمة المعامل
   */
  protected getParam(c: ControllerContext, name: string): string | undefined {
    return c.req.param(name);
  }

  /**
   * الحصول على معامل رقمي من الرابط
   * Get numeric parameter from URL
   * 
   * @param c - سياق Hono
   * @param name - اسم المعامل
   * @param defaultValue - القيمة الافتراضية
   */
  protected getParamInt(
    c: ControllerContext,
    name: string,
    defaultValue: number = 0
  ): number {
    return Validator.toInt(c.req.param(name), defaultValue);
  }

  /**
   * الحصول على معامل استعلام
   * Get query parameter
   * 
   * @param c - سياق Hono
   * @param name - اسم المعامل
   * @param defaultValue - القيمة الافتراضية
   */
  protected getQuery(
    c: ControllerContext,
    name: string,
    defaultValue?: string
  ): string | undefined {
    return c.req.query(name) ?? defaultValue;
  }

  /**
   * الحصول على معامل استعلام رقمي
   * Get numeric query parameter
   */
  protected getQueryInt(
    c: ControllerContext,
    name: string,
    defaultValue: number = 0
  ): number {
    return Validator.toInt(c.req.query(name), defaultValue);
  }

  /**
   * الحصول على معاملات الصفحات
   * Get pagination parameters
   */
  protected getPagination(c: ControllerContext): { limit: number; offset: number } {
    return {
      limit: Math.min(this.getQueryInt(c, 'limit', 20), 100),
      offset: this.getQueryInt(c, 'offset', 0)
    };
  }

  // ============================================
  // Context Helpers - دوال السياق
  // ============================================

  /**
   * الحصول على اللغة الحالية
   * Get current language
   */
  protected getLang(c: ControllerContext): Language {
    return c.get('lang') || 'ar';
  }

  /**
   * الحصول على المستخدم الحالي
   * Get current user
   */
  protected getUser(c: ControllerContext): any {
    return c.get('user');
  }

  /**
   * الحصول على قاعدة البيانات
   * Get database instance
   */
  protected getDB(c: ControllerContext): D1Database {
    return c.env.DB;
  }

  /**
   * الحصول على متغير بيئة
   * Get environment variable
   */
  protected getEnv<K extends keyof Bindings>(c: ControllerContext, key: K): Bindings[K] {
    return c.env[key];
  }

  /**
   * الحصول على رابط الأصل
   * Get origin URL
   */
  protected getOrigin(c: ControllerContext): string {
    const url = new URL(c.req.url);
    return `${url.protocol}//${url.host}`;
  }

  /**
   * الحصول على الكوكيز
   * Get cookie value
   */
  protected getCookie(c: ControllerContext, name: string): string | undefined {
    const cookies = c.req.header('Cookie') || '';
    const match = cookies.match(new RegExp(`${name}=([^;]+)`));
    return match ? match[1] : undefined;
  }

  /**
   * تعيين كوكي
   * Set cookie
   */
  protected setCookie(
    c: ControllerContext,
    name: string,
    value: string,
    options: {
      maxAge?: number;
      path?: string;
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: 'Strict' | 'Lax' | 'None';
    } = {}
  ): void {
    const {
      maxAge = 86400 * 30, // 30 days
      path = '/',
      secure = true,
      httpOnly = true,
      sameSite = 'Lax'
    } = options;

    const cookie = `${name}=${value}; Path=${path}; Max-Age=${maxAge}; SameSite=${sameSite}${secure ? '; Secure' : ''}${httpOnly ? '; HttpOnly' : ''}`;
    c.header('Set-Cookie', cookie);
  }

  /**
   * حذف كوكي
   * Delete cookie
   */
  protected deleteCookie(c: ControllerContext, name: string): void {
    c.header('Set-Cookie', `${name}=; Path=/; Max-Age=0`);
  }

  // ============================================
  // Logging - التسجيل
  // ============================================

  /**
   * تسجيل معلومات
   * Log info
   */
  protected log(message: string, data?: any): void {
    console.log(`[${this.controllerName}] ${message}`, data || '');
  }

  /**
   * تسجيل تحذير
   * Log warning
   */
  protected warn(message: string, data?: any): void {
    console.warn(`[${this.controllerName}] ${message}`, data || '');
  }

  /**
   * تسجيل خطأ
   * Log error
   */
  protected error(message: string, error?: any): void {
    console.error(`[${this.controllerName}] ${message}`, error || '');
  }
}

export default BaseController;
