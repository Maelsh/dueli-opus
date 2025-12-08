/**
 * @file core/i18n/I18nService.ts
 * @description خدمة الترجمة Singleton
 * @description_en Singleton Internationalization Service
 * @module core/i18n
 * @version 1.0.0
 * @author Dueli Team
 */

import type { Language } from '../http/types';

/**
 * هيكل الترجمات
 * Translations structure
 */
export interface TranslationSet {
  [key: string]: string | TranslationSet;
}

/**
 * جميع الترجمات
 * All translations
 */
export interface Translations {
  ar: TranslationSet;
  en: TranslationSet;
}

/**
 * خدمة الترجمة (Singleton)
 * I18n Service (Singleton Pattern)
 * 
 * توفر هذه الخدمة نظام ترجمة مركزي للتطبيق
 * This service provides a centralized translation system for the application
 * 
 * @example
 * ```typescript
 * const i18n = I18nService.getInstance();
 * i18n.setLocale('ar');
 * const text = i18n.t('general.app_title'); // "ديولي"
 * ```
 */
export class I18nService {
  private static instance: I18nService | null = null;
  private currentLocale: Language = 'ar';
  private translations: Translations;

  /**
   * الترجمات الافتراضية
   * Default translations
   */
  private static readonly defaultTranslations: Translations = {
    ar: {
      general: {
        app_title: 'ديولي',
        app_description: 'منصة المنافسات والحوارات التفاعلية',
        home: 'الرئيسية',
        explore: 'استكشف',
        create: 'إنشاء',
        login: 'تسجيل الدخول',
        register: 'إنشاء حساب',
        logout: 'تسجيل الخروج',
        profile: 'الملف الشخصي',
        settings: 'الإعدادات',
        search: 'بحث',
        loading: 'جاري التحميل...',
        save: 'حفظ',
        cancel: 'إلغاء',
        delete: 'حذف',
        edit: 'تعديل',
        submit: 'إرسال',
        back: 'رجوع',
        next: 'التالي',
        previous: 'السابق',
        yes: 'نعم',
        no: 'لا',
        or: 'أو',
        and: 'و',
        all: 'الكل',
        none: 'لا شيء'
      },
      auth: {
        email: 'البريد الإلكتروني',
        password: 'كلمة المرور',
        confirm_password: 'تأكيد كلمة المرور',
        username: 'اسم المستخدم',
        display_name: 'الاسم المعروض',
        forgot_password: 'نسيت كلمة المرور؟',
        reset_password: 'إعادة تعيين كلمة المرور',
        remember_me: 'تذكرني',
        login_with_google: 'تسجيل بواسطة Google',
        login_with_facebook: 'تسجيل بواسطة Facebook',
        login_with_microsoft: 'تسجيل بواسطة Microsoft',
        login_with_tiktok: 'تسجيل بواسطة TikTok',
        no_account: 'ليس لديك حساب؟',
        have_account: 'لديك حساب بالفعل؟',
        verification_sent: 'تم إرسال رمز التحقق',
        invalid_credentials: 'بيانات الدخول غير صحيحة',
        email_exists: 'البريد الإلكتروني مسجل مسبقاً',
        username_exists: 'اسم المستخدم مستخدم مسبقاً'
      },
      categories: {
        dialogue: 'حوار',
        science: 'علوم',
        talents: 'مواهب',
        religions: 'أديان',
        politics: 'سياسة',
        philosophy: 'فلسفة',
        physics: 'فيزياء',
        chemistry: 'كيمياء',
        biology: 'أحياء',
        mathematics: 'رياضيات',
        singing: 'غناء',
        poetry: 'شعر',
        comedy: 'كوميديا',
        art: 'فن'
      },
      competition: {
        create_competition: 'إنشاء منافسة',
        join_competition: 'الانضمام للمنافسة',
        start_competition: 'بدء المنافسة',
        end_competition: 'إنهاء المنافسة',
        competition_title: 'عنوان المنافسة',
        competition_description: 'وصف المنافسة',
        competition_rules: 'قوانين المنافسة',
        category: 'التصنيف',
        scheduled_time: 'الوقت المجدول',
        status_pending: 'في انتظار الموافقة',
        status_waiting: 'في انتظار الخصم',
        status_live: 'مباشر الآن',
        status_completed: 'مكتمل',
        status_cancelled: 'ملغي',
        no_competitions: 'لا توجد منافسات حالياً',
        competitor: 'المتنافس',
        creator: 'المنشئ',
        opponent: 'الخصم',
        viewers: 'المشاهدون',
        rating: 'التقييم',
        comments: 'التعليقات',
        invite: 'دعوة',
        accept: 'قبول',
        decline: 'رفض'
      },
      errors: {
        required_field: 'هذا الحقل مطلوب',
        invalid_email: 'البريد الإلكتروني غير صالح',
        password_min: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل',
        passwords_not_match: 'كلمات المرور غير متطابقة',
        server_error: 'حدث خطأ في الخادم',
        network_error: 'خطأ في الاتصال',
        not_found: 'غير موجود',
        unauthorized: 'غير مصرح',
        forbidden: 'محظور'
      },
      emails: {
        verification_subject: 'تأكيد بريدك الإلكتروني - ديولي',
        verification_greeting: 'مرحباً',
        verification_message: 'شكراً لتسجيلك في ديولي! يرجى النقر على الزر أدناه لتأكيد بريدك الإلكتروني.',
        verification_button: 'تأكيد البريد الإلكتروني',
        verification_link_text: 'أو انسخ هذا الرابط:',
        verification_ignore: 'إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذا البريد.',
        reset_subject: 'إعادة تعيين كلمة المرور - ديولي',
        reset_message: 'طلبت إعادة تعيين كلمة المرور. رمز التحقق الخاص بك هو:',
        reset_code_valid: 'هذا الرمز صالح لمدة 15 دقيقة.',
        reset_ignore: 'إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذا البريد.'
      }
    },
    en: {
      general: {
        app_title: 'Dueli',
        app_description: 'Interactive Competition & Dialogue Platform',
        home: 'Home',
        explore: 'Explore',
        create: 'Create',
        login: 'Login',
        register: 'Register',
        logout: 'Logout',
        profile: 'Profile',
        settings: 'Settings',
        search: 'Search',
        loading: 'Loading...',
        save: 'Save',
        cancel: 'Cancel',
        delete: 'Delete',
        edit: 'Edit',
        submit: 'Submit',
        back: 'Back',
        next: 'Next',
        previous: 'Previous',
        yes: 'Yes',
        no: 'No',
        or: 'or',
        and: 'and',
        all: 'All',
        none: 'None'
      },
      auth: {
        email: 'Email',
        password: 'Password',
        confirm_password: 'Confirm Password',
        username: 'Username',
        display_name: 'Display Name',
        forgot_password: 'Forgot Password?',
        reset_password: 'Reset Password',
        remember_me: 'Remember Me',
        login_with_google: 'Login with Google',
        login_with_facebook: 'Login with Facebook',
        login_with_microsoft: 'Login with Microsoft',
        login_with_tiktok: 'Login with TikTok',
        no_account: "Don't have an account?",
        have_account: 'Already have an account?',
        verification_sent: 'Verification code sent',
        invalid_credentials: 'Invalid credentials',
        email_exists: 'Email already registered',
        username_exists: 'Username already taken'
      },
      categories: {
        dialogue: 'Dialogue',
        science: 'Science',
        talents: 'Talents',
        religions: 'Religions',
        politics: 'Politics',
        philosophy: 'Philosophy',
        physics: 'Physics',
        chemistry: 'Chemistry',
        biology: 'Biology',
        mathematics: 'Mathematics',
        singing: 'Singing',
        poetry: 'Poetry',
        comedy: 'Comedy',
        art: 'Art'
      },
      competition: {
        create_competition: 'Create Competition',
        join_competition: 'Join Competition',
        start_competition: 'Start Competition',
        end_competition: 'End Competition',
        competition_title: 'Competition Title',
        competition_description: 'Competition Description',
        competition_rules: 'Competition Rules',
        category: 'Category',
        scheduled_time: 'Scheduled Time',
        status_pending: 'Pending Approval',
        status_waiting: 'Waiting for Opponent',
        status_live: 'Live Now',
        status_completed: 'Completed',
        status_cancelled: 'Cancelled',
        no_competitions: 'No competitions available',
        competitor: 'Competitor',
        creator: 'Creator',
        opponent: 'Opponent',
        viewers: 'Viewers',
        rating: 'Rating',
        comments: 'Comments',
        invite: 'Invite',
        accept: 'Accept',
        decline: 'Decline'
      },
      errors: {
        required_field: 'This field is required',
        invalid_email: 'Invalid email address',
        password_min: 'Password must be at least 8 characters',
        passwords_not_match: 'Passwords do not match',
        server_error: 'Server error occurred',
        network_error: 'Network error',
        not_found: 'Not found',
        unauthorized: 'Unauthorized',
        forbidden: 'Forbidden'
      },
      emails: {
        verification_subject: 'Verify your email - Dueli',
        verification_greeting: 'Hello',
        verification_message: 'Thank you for registering with Dueli! Please click the button below to verify your email.',
        verification_button: 'Verify Email',
        verification_link_text: 'Or copy this link:',
        verification_ignore: 'If you did not create an account, you can ignore this email.',
        reset_subject: 'Reset Password - Dueli',
        reset_message: 'You requested a password reset. Your verification code is:',
        reset_code_valid: 'This code is valid for 15 minutes.',
        reset_ignore: 'If you did not request a password reset, you can ignore this email.'
      }
    }
  };

  /**
   * المنشئ الخاص (Singleton)
   * Private constructor (Singleton)
   */
  private constructor(translations?: Translations) {
    this.translations = translations || I18nService.defaultTranslations;
  }

  /**
   * الحصول على نسخة الخدمة
   * Get service instance
   */
  static getInstance(translations?: Translations): I18nService {
    if (!I18nService.instance) {
      I18nService.instance = new I18nService(translations);
    }
    return I18nService.instance;
  }

  /**
   * إعادة تعيين النسخة (للاختبارات)
   * Reset instance (for testing)
   */
  static resetInstance(): void {
    I18nService.instance = null;
  }

  /**
   * تعيين اللغة الحالية
   * Set current locale
   */
  setLocale(locale: Language): void {
    this.currentLocale = locale;
  }

  /**
   * الحصول على اللغة الحالية
   * Get current locale
   */
  getLocale(): Language {
    return this.currentLocale;
  }

  /**
   * الحصول على ترجمة
   * Get translation
   * 
   * @param key - مفتاح الترجمة (مثل 'general.app_title')
   * @param locale - اللغة (اختياري، يستخدم اللغة الحالية إذا لم يُحدد)
   * @param params - معاملات للاستبدال (اختياري)
   * @returns النص المترجم
   */
  t(key: string, locale?: Language, params?: Record<string, string | number>): string {
    const lang = locale || this.currentLocale;
    const keys = key.split('.');
    let value: any = this.translations[lang];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // fallback للغة العربية ثم المفتاح
        value = this.getFallback(key) || key;
        break;
      }
    }

    if (typeof value !== 'string') {
      return key;
    }

    // استبدال المعاملات
    if (params) {
      return this.interpolate(value, params);
    }

    return value;
  }

  /**
   * البحث عن ترجمة بديلة
   * Get fallback translation
   */
  private getFallback(key: string): string | null {
    const fallbackLang: Language = this.currentLocale === 'ar' ? 'en' : 'ar';
    const keys = key.split('.');
    let value: any = this.translations[fallbackLang];

    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        return null;
      }
    }

    return typeof value === 'string' ? value : null;
  }

  /**
   * استبدال المعاملات في النص
   * Interpolate parameters in text
   */
  private interpolate(text: string, params: Record<string, string | number>): string {
    return text.replace(/\{(\w+)\}/g, (match, key) => {
      return params[key]?.toString() || match;
    });
  }

  /**
   * هل اللغة من اليمين لليسار؟
   * Is the language RTL?
   */
  isRTL(locale?: Language): boolean {
    return (locale || this.currentLocale) === 'ar';
  }

  /**
   * الحصول على اتجاه النص
   * Get text direction
   */
  getDir(locale?: Language): 'rtl' | 'ltr' {
    return this.isRTL(locale) ? 'rtl' : 'ltr';
  }

  /**
   * الحصول على جميع الترجمات للغة معينة
   * Get all translations for a locale
   */
  getTranslations(locale?: Language): TranslationSet {
    return this.translations[locale || this.currentLocale];
  }

  /**
   * إضافة ترجمات جديدة
   * Add new translations
   */
  addTranslations(locale: Language, translations: TranslationSet): void {
    this.translations[locale] = this.mergeDeep(
      this.translations[locale] || {},
      translations
    );
  }

  /**
   * دمج عميق للكائنات
   * Deep merge objects
   */
  private mergeDeep(target: TranslationSet, source: TranslationSet): TranslationSet {
    const result = { ...target };
    
    for (const key in source) {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this.mergeDeep(
          (result[key] as TranslationSet) || {},
          source[key] as TranslationSet
        );
      } else {
        result[key] = source[key];
      }
    }
    
    return result;
  }
}

// تصدير نسخة جاهزة للاستخدام
export const i18n = I18nService.getInstance();

// دالة مختصرة للترجمة
export function t(key: string, locale?: Language, params?: Record<string, string | number>): string {
  return i18n.t(key, locale, params);
}

// دالة اتجاه النص
export function getDir(locale?: Language): 'rtl' | 'ltr' {
  return i18n.getDir(locale);
}

// دالة RTL
export function isRTL(locale?: Language): boolean {
  return i18n.isRTL(locale);
}

export default I18nService;
