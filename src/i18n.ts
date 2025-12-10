// Dueli Internationalization (i18n) - Updated Design
// نظام الترجمة والتعريب - التصميم الجديد

// Languages with available translations (can be extended)
export const TRANSLATED_LANGUAGES = ['ar', 'en'] as const;
export type TranslatedLanguage = typeof TRANSLATED_LANGUAGES[number];

// Language can be ANY language code (all languages supported)
// If translation not available, English is used as fallback
export type Language = string;
export const DEFAULT_LANGUAGE: TranslatedLanguage = 'en'; // English as global fallback

export const translations = {
  ar: {
    // العامة
    app_title: 'ديولي',
    app_subtitle: 'تواصل عبر التنافس',
    home: 'الرئيسية',
    explore: 'استكشف',
    live: 'بث مباشر',
    recorded: 'مسجل',
    profile: 'الملف الشخصي',
    settings: 'الإعدادات',
    logout: 'تسجيل الخروج',
    login: 'دخول',
    register: 'إنشاء حساب',
    search_placeholder: 'ابحث عن منافسة، عالم، أو موهبة...',
    filter: 'تصفية',
    all: 'الجميع',
    help: 'مساعدة',
    theme: 'الوضع الليلي/النهاري',
    language: 'اللغة',
    country_language: 'البلد واللغة',
    search_country: 'ابحث عن بلد...',

    // الأقسام
    categories: 'الأقسام',
    dialogue: 'الحوار',
    science: 'العلوم',
    talents: 'المواهب',

    // أقسام العرض
    sections: {
      suggested: 'مقترح لك',
      dialogue: 'ساحة الحوار',
      science: 'المختبر العلمي',
      talents: 'مسرح المواهب'
    },

    // أقسام الحوار الفرعية
    religions: 'الأديان',
    sects: 'المذاهب',
    politics: 'السياسة',
    economics: 'الاقتصاد',
    current_affairs: 'قضايا الساعة',
    disputes: 'النزاعات الأخرى',

    // أقسام العلوم الفرعية
    physics: 'الفيزياء',
    biology: 'الأحياء',
    chemistry: 'الكيمياء',
    math: 'الرياضيات',
    technology: 'التقنية',
    medicine: 'الطب',
    philosophy: 'الفلسفة',

    // أقسام المواهب الفرعية
    singing: 'الغناء',
    poetry: 'الشعر',
    art: 'الفن',
    sports: 'الرياضة',
    comedy: 'الكوميديا',
    cooking: 'الطبخ',
    gaming: 'الألعاب',
    magic: 'الخدع',

    // المنافسات
    competition: 'منافسة',
    competitions: 'المنافسات',
    create_competition: 'إنشاء منافسة',
    join_competition: 'انضم للمنافسة',
    watch_competition: 'شاهد المنافسة',
    competition_title: 'عنوان المنافسة',
    competition_rules: 'قوانين المنافسة',
    competition_description: 'وصف المنافسة',
    select_category: 'اختر القسم',
    select_subcategory: 'اختر القسم الفرعي',
    scheduled_time: 'موعد البدء',
    request_join: 'طلب الانضمام',
    cancel_request: 'إلغاء الطلب',

    // الحالات
    status_pending: 'في انتظار منافس',
    status_accepted: 'تم القبول',
    status_live: 'مباشر',
    status_completed: 'منتهية',
    status_cancelled: 'ملغاة',
    status_ongoing: 'مستمر',

    // التفاعل
    invite: 'دعوة',
    accept: 'قبول',
    decline: 'رفض',
    cancel: 'إلغاء',
    send: 'إرسال',
    save: 'حفظ',
    edit: 'تعديل',
    delete: 'حذف',
    follow: 'متابعة',
    unfollow: 'إلغاء المتابعة',

    // التقييم
    rate: 'قيّم',
    rating: 'التقييم',
    viewers: 'مشاهدة',

    // التعليقات
    comment: 'تعليق',
    comments: 'التعليقات',
    add_comment: 'أضف تعليقاً',
    live_chat: 'المحادثة المباشرة',

    // تسجيل الدخول
    login_with_google: 'الدخول بحساب Google',
    login_with_facebook: 'الدخول بحساب Facebook',
    login_with_microsoft: 'الدخول بحساب Microsoft',
    login_with_twitter: 'الدخول بحساب X',
    login_welcome: 'مرحباً بك في ديولي',
    login_subtitle: 'سجل دخولك للمشاركة في المنافسات',
    or_continue_with: 'أو تابع باستخدام',

    // المستخدم
    user: 'مستخدم',
    username: 'اسم المستخدم',
    email: 'البريد الإلكتروني',
    display_name: 'الاسم المعروض',
    bio: 'نبذة عني',
    country: 'الدولة',
    my_competitions: 'منافساتي',
    my_requests: 'طلباتي',

    // الإحصائيات
    stats: 'الإحصائيات',
    total_competitions: 'إجمالي المنافسات',
    total_wins: 'الانتصارات',
    total_views: 'المشاهدات',
    followers: 'المتابعون',
    following: 'يتابع',

    // الأخطاء
    error: 'خطأ',
    not_found: 'غير موجود',
    login_required: 'يجب تسجيل الدخول',
    no_duels: 'عذراً، لا توجد منافسات هنا حالياً.',

    // النجاح
    success: 'تم بنجاح',
    request_sent: 'تم إرسال الطلب',

    // Footer
    footer: '© 2025 ديولي. جميع الحقوق محفوظة.',
    about: 'عن المنصة',
    contact: 'تواصل معنا',
    terms: 'الشروط والأحكام',
    privacy: 'سياسة الخصوصية',

    // الإجراءات
    view_all: 'عرض الكل',
    load_more: 'تحميل المزيد',
    back: 'رجوع',
    close: 'إغلاق',
    submit: 'إرسال',
    loading: 'جاري التحميل...',
    go_home: 'اذهب إلى الرئيسية',
    go_back: 'العودة',

    // المصادقة - رسائل API
    auth_all_fields_required: 'جميع الحقول مطلوبة',
    auth_email_exists: 'البريد الإلكتروني مستخدم بالفعل',
    auth_register_success: 'تم التسجيل بنجاح! يرجى التحقق من بريدك الإلكتروني.',
    auth_register_failed: 'حدث خطأ أثناء التسجيل',
    auth_invalid_link: 'رابط التفعيل غير صالح أو منتهي',
    auth_account_activated: 'تم تفعيل حسابك بنجاح!',
    auth_email_password_required: 'البريد الإلكتروني وكلمة المرور مطلوبان',
    auth_invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
    auth_verify_email_first: 'يرجى تفعيل حسابك أولاً',
    auth_email_required: 'البريد الإلكتروني مطلوب',
    auth_user_not_found: 'المستخدم غير موجود أو تم تفعيله بالفعل',
    auth_verification_resent: 'تم إرسال رابط التفعيل مجدداً',
    auth_reset_if_exists: 'إذا كان هذا البريد مسجلاً، ستصلك رسالة إعادة تعيين',
    auth_reset_code_sent: 'تم إرسال رمز إعادة التعيين إلى بريدك',
    auth_email_code_required: 'البريد والرمز مطلوبان',
    auth_invalid_code: 'الرمز غير صحيح أو منتهي',
    auth_code_verified: 'تم التحقق من الرمز',
    auth_password_required: 'كلمة المرور الجديدة مطلوبة',
    auth_password_changed: 'تم تغيير كلمة المرور بنجاح',

    // التحقق
    verification_failed: 'حدث خطأ أثناء التحقق',
    verification_invalid_link: 'رابط غير صالح',
    verification_success_msg: 'يمكنك الآن تسجيل الدخول إلى حسابك',
    verification_check_link: 'يرجى التحقق من الرابط أو طلب رابط جديد',
    account_verification: 'تفعيل الحساب',

    // صفحة عن ديولي
    about_title: 'منصة ديولي للمنافسات',
    about_description: 'المنصة الأولى من نوعها التي تجمع بين المنافسات الحية، الحوارات البناءة، واكتشاف المواهب في بيئة تفاعلية عادلة.',
    about_live_streaming: 'بث مباشر وتفاعل حي',
    about_live_streaming_desc: 'نظام بث متطور يجمع المتنافسين جنباً إلى جنب مع إمكانية تفاعل الجمهور والتصويت المباشر.',
    about_fair_judging: 'نظام تحكيم عادل',
    about_fair_judging_desc: 'آليات تحكيم شفافة تعتمد على تصويت الجمهور ولجان التحكيم المختصة لضمان العدالة.',
    about_global_community: 'مجتمع عالمي',
    about_global_community_desc: 'تواصل مع مبدعين ومفكرين من مختلف أنحاء العالم وشارك في منافسات عابرة للحدود.',
    about_platform_preview: 'نظرة على المنصة',
    about_developed_by: 'تم التطوير بواسطة Maelsh',
    about_maelsh_desc: 'نحن في Maelsh نؤمن بقوة الحوار والمنافسة الشريفة في بناء المجتمعات. نسعى لتقديم حلول برمجية مبتكرة تجمع بين الجمالية والوظيفة لخدمة المستخدم العربي والعالمي.',
    about_dueli: 'عن ديولي',

    // صفحة المنافسة
    competitors: 'المتنافسون',
    awaiting_opponent: 'بانتظار منافس',
    login_to_compete: 'سجل دخول للمنافسة',
    stream_not_available: 'البث غير متاح',
    no_comments_yet: 'لا توجد تعليقات بعد',
    error_occurred: 'حدث خطأ',
    new_follower: 'متابع جديد',

    // البريد الإلكتروني
    email_activate_subject: 'تفعيل حسابك في ديولي',
    email_reset_subject: 'إعادة تعيين كلمة المرور',
  },

  en: {
    // General
    app_title: 'Dueli',
    app_subtitle: 'Connect via Competition',
    home: 'Home',
    explore: 'Explore',
    live: 'Live Stream',
    recorded: 'Recorded',
    profile: 'Profile',
    settings: 'Settings',
    logout: 'Logout',
    login: 'Login',
    register: 'Register',
    search_placeholder: 'Search for a duel, scientist, or talent...',
    filter: 'Filter',
    all: 'All',
    help: 'Help',
    theme: 'Dark/Light Mode',
    language: 'Language',
    country_language: 'Country & Language',
    search_country: 'Search country...',

    // Categories
    categories: 'Categories',
    dialogue: 'Dialogue',
    science: 'Science',
    talents: 'Talents',

    // Sections
    sections: {
      suggested: 'Suggested for You',
      dialogue: 'Dialogue Arena',
      science: 'Science Lab',
      talents: 'Talent Stage'
    },

    // Dialogue subcategories
    religions: 'Religions',
    sects: 'Sects',
    politics: 'Politics',
    economics: 'Economics',
    current_affairs: 'Current Affairs',
    disputes: 'Other Disputes',

    // Science subcategories
    physics: 'Physics',
    biology: 'Biology',
    chemistry: 'Chemistry',
    math: 'Mathematics',
    technology: 'Technology',
    medicine: 'Medicine',
    philosophy: 'Philosophy',

    // Talents subcategories
    singing: 'Singing',
    poetry: 'Poetry',
    art: 'Art',
    sports: 'Sports',
    comedy: 'Comedy',
    cooking: 'Cooking',
    gaming: 'Gaming',
    magic: 'Magic',

    // Competitions
    competition: 'Competition',
    competitions: 'Competitions',
    create_competition: 'Create Competition',
    join_competition: 'Join Competition',
    watch_competition: 'Watch Competition',
    competition_title: 'Competition Title',
    competition_rules: 'Competition Rules',
    competition_description: 'Competition Description',
    select_category: 'Select Category',
    select_subcategory: 'Select Subcategory',
    scheduled_time: 'Scheduled Time',
    request_join: 'Request to Join',
    cancel_request: 'Cancel Request',

    // Statuses
    status_pending: 'Waiting for opponent',
    status_accepted: 'Accepted',
    status_live: 'Live',
    status_completed: 'Completed',
    status_cancelled: 'Cancelled',
    status_ongoing: 'Ongoing',

    // Actions
    invite: 'Invite',
    accept: 'Accept',
    decline: 'Decline',
    cancel: 'Cancel',
    send: 'Send',
    save: 'Save',
    edit: 'Edit',
    delete: 'Delete',
    follow: 'Follow',
    unfollow: 'Unfollow',

    // Rating
    rate: 'Rate',
    rating: 'Rating',
    viewers: 'views',

    // Comments
    comment: 'Comment',
    comments: 'Comments',
    add_comment: 'Add Comment',
    live_chat: 'Live Chat',

    // Login
    login_with_google: 'Continue with Google',
    login_with_facebook: 'Continue with Facebook',
    login_with_microsoft: 'Continue with Microsoft',
    login_with_twitter: 'Continue with X',
    login_welcome: 'Welcome to Dueli',
    login_subtitle: 'Sign in to participate in competitions',
    or_continue_with: 'Or continue with',

    // User
    user: 'User',
    username: 'Username',
    email: 'Email',
    display_name: 'Display Name',
    bio: 'Bio',
    country: 'Country',
    my_competitions: 'My Competitions',
    my_requests: 'My Requests',

    // Stats
    stats: 'Statistics',
    total_competitions: 'Total Competitions',
    total_wins: 'Wins',
    total_views: 'Views',
    followers: 'Followers',
    following: 'Following',

    // Errors
    error: 'Error',
    not_found: 'Not Found',
    login_required: 'Login required',
    no_duels: 'Sorry, no duels available here currently.',

    // Success
    success: 'Success',
    request_sent: 'Request sent',

    // Footer
    footer: '© 2025 Dueli. All rights reserved.',
    about: 'About',
    contact: 'Contact Us',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',

    // Actions
    view_all: 'View All',
    load_more: 'Load More',
    back: 'Back',
    close: 'Close',
    submit: 'Submit',
    loading: 'Loading...',
    go_home: 'Go to Home',
    go_back: 'Go Back',

    // Auth - API messages
    auth_all_fields_required: 'All fields are required',
    auth_email_exists: 'Email already exists',
    auth_register_success: 'Registration successful! Please check your email.',
    auth_register_failed: 'Registration failed',
    auth_invalid_link: 'Invalid or expired verification link',
    auth_account_activated: 'Account activated successfully!',
    auth_email_password_required: 'Email and password are required',
    auth_invalid_credentials: 'Invalid email or password',
    auth_verify_email_first: 'Please verify your email first',
    auth_email_required: 'Email is required',
    auth_user_not_found: 'User not found or already verified',
    auth_verification_resent: 'Verification email sent',
    auth_reset_if_exists: 'If this email is registered, you will receive a reset link',
    auth_reset_code_sent: 'Reset code sent to your email',
    auth_email_code_required: 'Email and code are required',
    auth_invalid_code: 'Invalid or expired code',
    auth_code_verified: 'Code verified',
    auth_password_required: 'New password is required',
    auth_password_changed: 'Password changed successfully',

    // Verification
    verification_failed: 'Verification failed',
    verification_invalid_link: 'Invalid link',
    verification_success_msg: 'You can now log into your account',
    verification_check_link: 'Please check the link or request a new one',
    account_verification: 'Account Verification',

    // About page
    about_title: 'Dueli Competition Platform',
    about_description: 'The first platform of its kind combining live competitions, constructive dialogues, and talent discovery in a fair interactive environment.',
    about_live_streaming: 'Live Streaming & Interaction',
    about_live_streaming_desc: 'Advanced streaming system bringing competitors side-by-side with audience interaction and live voting.',
    about_fair_judging: 'Fair Judging System',
    about_fair_judging_desc: 'Transparent judging mechanisms based on audience voting and expert panels to ensure fairness.',
    about_global_community: 'Global Community',
    about_global_community_desc: 'Connect with creators and thinkers from around the world and participate in cross-border competitions.',
    about_platform_preview: 'Platform Preview',
    about_developed_by: 'Developed by Maelsh',
    about_maelsh_desc: 'At Maelsh, we believe in the power of dialogue and fair competition in building communities. We strive to provide innovative software solutions that combine aesthetics and functionality to serve the Arab and global user.',
    about_dueli: 'About Dueli',

    // Competition page
    competitors: 'Competitors',
    awaiting_opponent: 'Awaiting Opponent',
    login_to_compete: 'Login to Compete',
    stream_not_available: 'Stream not available',
    no_comments_yet: 'No comments yet',
    error_occurred: 'Error occurred',
    new_follower: 'New Follower',

    // Email
    email_activate_subject: 'Activate your Dueli account',
    email_reset_subject: 'Reset Your Password',
  }
};

// Re-export countries from countries.ts
export { countries, getCountriesList, getCountry, getCountriesByLanguage, type Country } from './countries';

// Get language code from country code
import { getCountry as getCountryFn } from './countries';
export function getLanguageFromCountry(countryCode: string): Language {
  const country = getCountryFn(countryCode);
  if (!country) return 'ar'; // Default to Arabic

  // Map primary language to supported UI language
  const langMap: Record<string, Language> = {
    'ar': 'ar',
    'en': 'en',
    // All other languages default to English for now
  };

  return langMap[country.primaryLang] || 'en';
}

/**
 * Get the UI language for a given language code
 * Falls back to English (global fallback) if no translation available
 */
export function getUILanguage(lang: Language): TranslatedLanguage {
  if (TRANSLATED_LANGUAGES.includes(lang as TranslatedLanguage)) {
    return lang as TranslatedLanguage;
  }
  return DEFAULT_LANGUAGE; // English fallback
}

export function t(key: string, lang: Language): string {
  const keys = key.split('.');
  const uiLang = getUILanguage(lang);
  let value: any = translations[uiLang];

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Fallback to English (global default)
      value = translations[DEFAULT_LANGUAGE];
      for (const k2 of keys) {
        if (value && typeof value === 'object' && k2 in value) {
          value = value[k2];
        } else {
          return key;
        }
      }
      break;
    }
  }

  return typeof value === 'string' ? value : key;
}

// RTL languages list - includes all RTL languages from countries
const RTL_LANGUAGES: string[] = ['ar', 'fa', 'he', 'ur'];

export function isRTL(lang: Language): boolean {
  return RTL_LANGUAGES.includes(lang);
}

export function getDir(lang: Language): 'rtl' | 'ltr' {
  return RTL_LANGUAGES.includes(lang) ? 'rtl' : 'ltr';
}
