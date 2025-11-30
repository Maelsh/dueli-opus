// Dueli Internationalization (i18n) - Updated Design
// نظام الترجمة والتعريب - التصميم الجديد

export type Language = 'ar' | 'en';

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
  }
};

// Re-export countries from countries.ts
export { countries, getCountriesList, getCountry, getCountriesByLanguage, type Country } from './countries';

// Supported languages for UI translations (we only have ar and en for now)
export type Language = 'ar' | 'en';

// Get language code from country code
export function getLanguageFromCountry(countryCode: string): Language {
  const { getCountry } = require('./countries');
  const country = getCountry(countryCode);
  if (!country) return 'ar'; // Default to Arabic

  // Map primary language to supported UI language
  const langMap: Record<string, Language> = {
    'ar': 'ar',
    'en': 'en',
    // All other languages default to English for now
  };

  return langMap[country.primaryLang] || 'en';
}

export function t(key: string, lang: Language = 'ar'): string {
  const keys = key.split('.');
  let value: any = translations[lang];

  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      // Fallback to Arabic
      value = translations.ar;
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

export function isRTL(lang: Language): boolean {
  return lang === 'ar';
}

export function getDir(lang: Language): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}
