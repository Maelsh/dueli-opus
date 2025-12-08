/**
 * @file core/http/Validator.ts
 * @description مدقق البيانات العام بدون مكتبات خارجية
 * @description_en Generic DTO validator without external libraries
 * @module core/http/Validator
 * @version 1.0.0
 * @author Dueli Team
 */

/**
 * قواعد التحقق المتاحة
 * Available validation rules
 */
export type ValidationRule = 
  | 'required'
  | 'string'
  | 'number'
  | 'boolean'
  | 'email'
  | 'url'
  | 'array'
  | 'object'
  | 'date'
  | 'uuid'
  | { min: number }
  | { max: number }
  | { minLength: number }
  | { maxLength: number }
  | { pattern: RegExp }
  | { enum: readonly string[] }
  | { custom: (value: any) => boolean | string };

/**
 * مخطط التحقق
 * Validation schema
 */
export type ValidationSchema<T> = {
  [K in keyof T]?: ValidationRule[];
};

/**
 * خطأ التحقق
 * Validation error
 */
export interface ValidationError {
  field: string;
  message: string;
  rule: string;
}

/**
 * نتيجة التحقق
 * Validation result
 */
export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors?: ValidationError[];
}

/**
 * كلاس المدقق العام
 * Generic Validator class
 * 
 * @example
 * ```typescript
 * const schema: ValidationSchema<CreateUserDTO> = {
 *   email: ['required', 'email'],
 *   password: ['required', { minLength: 8 }],
 *   name: ['required', 'string', { maxLength: 100 }]
 * };
 * 
 * const result = Validator.validate(data, schema);
 * if (!result.success) {
 *   console.log(result.errors);
 * }
 * ```
 */
export class Validator {
  /**
   * أنماط التحقق المدمجة
   * Built-in validation patterns
   */
  private static patterns = {
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    url: /^https?:\/\/.+/,
    uuid: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    date: /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/
  };

  /**
   * رسائل الخطأ الافتراضية
   * Default error messages
   */
  private static messages: Record<string, string> = {
    required: 'هذا الحقل مطلوب / This field is required',
    string: 'يجب أن يكون نصاً / Must be a string',
    number: 'يجب أن يكون رقماً / Must be a number',
    boolean: 'يجب أن يكون قيمة منطقية / Must be a boolean',
    email: 'بريد إلكتروني غير صالح / Invalid email address',
    url: 'رابط غير صالح / Invalid URL',
    array: 'يجب أن يكون مصفوفة / Must be an array',
    object: 'يجب أن يكون كائناً / Must be an object',
    date: 'تاريخ غير صالح / Invalid date',
    uuid: 'معرف UUID غير صالح / Invalid UUID',
    min: 'القيمة أقل من الحد الأدنى / Value is below minimum',
    max: 'القيمة أعلى من الحد الأقصى / Value exceeds maximum',
    minLength: 'النص أقصر من الحد الأدنى / Text is too short',
    maxLength: 'النص أطول من الحد الأقصى / Text is too long',
    pattern: 'النمط غير مطابق / Pattern does not match',
    enum: 'القيمة غير مسموح بها / Value is not allowed',
    custom: 'فشل التحقق المخصص / Custom validation failed'
  };

  /**
   * تحقق من البيانات وفقاً للمخطط
   * Validate data against schema
   * 
   * @param data - البيانات المراد التحقق منها
   * @param schema - مخطط التحقق
   * @returns نتيجة التحقق
   */
  static validate<T extends Record<string, any>>(
    data: unknown,
    schema: ValidationSchema<T>
  ): ValidationResult<T> {
    const errors: ValidationError[] = [];
    const validatedData: Partial<T> = {};

    // التحقق من أن البيانات كائن
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {
        success: false,
        errors: [{
          field: '_root',
          message: 'البيانات يجب أن تكون كائناً / Data must be an object',
          rule: 'object'
        }]
      };
    }

    const inputData = data as Record<string, any>;

    // التحقق من كل حقل في المخطط
    for (const [field, rules] of Object.entries(schema)) {
      if (!rules) continue;

      const value = inputData[field];
      let isValid = true;

      for (const rule of rules) {
        const error = this.validateRule(field, value, rule);
        if (error) {
          errors.push(error);
          isValid = false;
          break; // توقف عند أول خطأ للحقل
        }
      }

      if (isValid && value !== undefined) {
        (validatedData as any)[field] = value;
      }
    }

    if (errors.length > 0) {
      return { success: false, errors };
    }

    return { success: true, data: validatedData as T };
  }

  /**
   * تحقق من قاعدة واحدة
   * Validate single rule
   */
  private static validateRule(
    field: string,
    value: any,
    rule: ValidationRule
  ): ValidationError | null {
    // قاعدة مطلوب
    if (rule === 'required') {
      if (value === undefined || value === null || value === '') {
        return { field, message: this.messages.required, rule: 'required' };
      }
      return null;
    }

    // إذا القيمة غير موجودة وليست مطلوبة، تخطى
    if (value === undefined || value === null) {
      return null;
    }

    // قواعد النوع
    if (rule === 'string') {
      if (typeof value !== 'string') {
        return { field, message: this.messages.string, rule: 'string' };
      }
    }

    if (rule === 'number') {
      if (typeof value !== 'number' || isNaN(value)) {
        return { field, message: this.messages.number, rule: 'number' };
      }
    }

    if (rule === 'boolean') {
      if (typeof value !== 'boolean') {
        return { field, message: this.messages.boolean, rule: 'boolean' };
      }
    }

    if (rule === 'array') {
      if (!Array.isArray(value)) {
        return { field, message: this.messages.array, rule: 'array' };
      }
    }

    if (rule === 'object') {
      if (typeof value !== 'object' || Array.isArray(value)) {
        return { field, message: this.messages.object, rule: 'object' };
      }
    }

    // قواعد النمط
    if (rule === 'email') {
      if (typeof value !== 'string' || !this.patterns.email.test(value)) {
        return { field, message: this.messages.email, rule: 'email' };
      }
    }

    if (rule === 'url') {
      if (typeof value !== 'string' || !this.patterns.url.test(value)) {
        return { field, message: this.messages.url, rule: 'url' };
      }
    }

    if (rule === 'uuid') {
      if (typeof value !== 'string' || !this.patterns.uuid.test(value)) {
        return { field, message: this.messages.uuid, rule: 'uuid' };
      }
    }

    if (rule === 'date') {
      if (typeof value !== 'string' || !this.patterns.date.test(value)) {
        return { field, message: this.messages.date, rule: 'date' };
      }
    }

    // قواعد مخصصة ككائنات
    if (typeof rule === 'object') {
      if ('min' in rule) {
        if (typeof value !== 'number' || value < rule.min) {
          return { 
            field, 
            message: `${this.messages.min} (${rule.min})`, 
            rule: 'min' 
          };
        }
      }

      if ('max' in rule) {
        if (typeof value !== 'number' || value > rule.max) {
          return { 
            field, 
            message: `${this.messages.max} (${rule.max})`, 
            rule: 'max' 
          };
        }
      }

      if ('minLength' in rule) {
        if (typeof value !== 'string' || value.length < rule.minLength) {
          return { 
            field, 
            message: `${this.messages.minLength} (${rule.minLength})`, 
            rule: 'minLength' 
          };
        }
      }

      if ('maxLength' in rule) {
        if (typeof value !== 'string' || value.length > rule.maxLength) {
          return { 
            field, 
            message: `${this.messages.maxLength} (${rule.maxLength})`, 
            rule: 'maxLength' 
          };
        }
      }

      if ('pattern' in rule) {
        if (typeof value !== 'string' || !rule.pattern.test(value)) {
          return { field, message: this.messages.pattern, rule: 'pattern' };
        }
      }

      if ('enum' in rule) {
        if (!rule.enum.includes(value)) {
          return { 
            field, 
            message: `${this.messages.enum}: ${rule.enum.join(', ')}`, 
            rule: 'enum' 
          };
        }
      }

      if ('custom' in rule) {
        const result = rule.custom(value);
        if (result !== true) {
          return { 
            field, 
            message: typeof result === 'string' ? result : this.messages.custom, 
            rule: 'custom' 
          };
        }
      }
    }

    return null;
  }

  /**
   * تحقق سريع من بريد إلكتروني
   * Quick email validation
   */
  static isEmail(value: string): boolean {
    return this.patterns.email.test(value);
  }

  /**
   * تحقق سريع من رابط
   * Quick URL validation
   */
  static isUrl(value: string): boolean {
    return this.patterns.url.test(value);
  }

  /**
   * تحقق سريع من UUID
   * Quick UUID validation
   */
  static isUuid(value: string): boolean {
    return this.patterns.uuid.test(value);
  }

  /**
   * تنظيف النص من الأحرف الخطرة
   * Sanitize string from dangerous characters
   */
  static sanitize(value: string): string {
    return value
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .trim();
  }

  /**
   * تحويل إلى رقم صحيح آمن
   * Safe integer conversion
   */
  static toInt(value: any, defaultValue: number = 0): number {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * تحويل إلى رقم عشري آمن
   * Safe float conversion
   */
  static toFloat(value: any, defaultValue: number = 0): number {
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * تحويل إلى قيمة منطقية
   * Convert to boolean
   */
  static toBool(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return ['true', '1', 'yes', 'on'].includes(value.toLowerCase());
    }
    return !!value;
  }
}

export default Validator;
