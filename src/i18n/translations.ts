/**
 * @file translations.ts
 * @description نظام الترجمة الشامل لمنصة ديولي
 * @description_en Comprehensive translation system for Dueli platform
 * @module i18n/translations
 * @version 2.0.0
 * @author Dueli Team
 * @license MIT
 */

import type { Language, TranslationSchema } from './types';

/**
 * كائن الترجمات الرئيسي
 * @description يحتوي على جميع النصوص المترجمة للمنصة
 * @constant
 */
export const translations: Record<Language, TranslationSchema> = {
  /**
   * الترجمات العربية
   */
  ar: {
    // ===============================
    // العامة - General
    // ===============================
    general: {
      app_title: 'ديولي',
      app_subtitle: 'تواصل عبر التنافس',
      app_tagline: 'المنصة الأولى للمنافسات التفاعلية',
      loading: 'جاري التحميل...',
      error: 'خطأ',
      success: 'تم بنجاح',
      warning: 'تنبيه',
      info: 'معلومة',
      yes: 'نعم',
      no: 'لا',
      ok: 'حسناً',
      cancel: 'إلغاء',
      close: 'إغلاق',
      save: 'حفظ',
      edit: 'تعديل',
      delete: 'حذف',
      back: 'رجوع',
      next: 'التالي',
      previous: 'السابق',
      submit: 'إرسال',
      send: 'إرسال',
      search: 'بحث',
      filter: 'تصفية',
      sort: 'ترتيب',
      all: 'الجميع',
      none: 'لا شيء',
      more: 'المزيد',
      less: 'أقل',
      view_all: 'عرض الكل',
      load_more: 'تحميل المزيد',
      refresh: 'تحديث',
      retry: 'إعادة المحاولة',
      copyright: '© 2025 ديولي. جميع الحقوق محفوظة.',
    },

    // ===============================
    // التنقل - Navigation
    // ===============================
    nav: {
      home: 'الرئيسية',
      explore: 'استكشف',
      live: 'بث مباشر',
      recorded: 'مسجل',
      profile: 'الملف الشخصي',
      settings: 'الإعدادات',
      notifications: 'الإشعارات',
      messages: 'الرسائل',
      help: 'مساعدة',
      about: 'عن المنصة',
      contact: 'تواصل معنا',
      terms: 'الشروط والأحكام',
      privacy: 'سياسة الخصوصية',
    },

    // ===============================
    // المصادقة - Authentication
    // ===============================
    auth: {
      login: 'دخول',
      logout: 'تسجيل الخروج',
      register: 'إنشاء حساب',
      login_welcome: 'مرحباً بك في ديولي',
      login_subtitle: 'سجل دخولك للمشاركة في المنافسات',
      login_with_google: 'الدخول بحساب Google',
      login_with_facebook: 'الدخول بحساب Facebook',
      login_with_microsoft: 'الدخول بحساب Microsoft',
      login_with_twitter: 'الدخول بحساب X',
      login_with_tiktok: 'الدخول بحساب TikTok',
      login_with_snapchat: 'الدخول بحساب Snapchat',
      or_continue_with: 'أو تابع باستخدام',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      confirm_password: 'تأكيد كلمة المرور',
      name: 'الاسم',
      remember_me: 'تذكرني',
      forgot_password: 'نسيت كلمة المرور؟',
      reset_password: 'إعادة تعيين كلمة المرور',
      new_password: 'كلمة المرور الجديدة',
      verification_code: 'رمز التحقق',
      send_code: 'إرسال رمز التحقق',
      verify_code: 'تحقق من الرمز',
      change_password: 'تغيير كلمة المرور',
      back_to_login: 'العودة لتسجيل الدخول',
      create_account: 'إنشاء حساب',
      password_requirements: 'يجب أن تكون 6 أحرف على الأقل',
      agree_terms: 'بالمتابعة، أنت توافق على شروط الخدمة وسياسة الخصوصية',
      // رسائل المصادقة
      login_success: 'تم تسجيل الدخول بنجاح',
      logout_success: 'تم تسجيل الخروج',
      register_success: 'تم التسجيل بنجاح! يرجى التحقق من بريدك الإلكتروني.',
      password_reset_success: 'تم تغيير كلمة المرور بنجاح',
      code_sent: 'تم إرسال رمز التحقق إلى بريدك',
      code_verified: 'الرمز صحيح',
      verification_success: 'تم تفعيل حسابك بنجاح!',
      // أخطاء المصادقة
      email_required: 'البريد الإلكتروني مطلوب',
      password_required: 'كلمة المرور مطلوبة',
      all_fields_required: 'جميع الحقول مطلوبة',
      invalid_credentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة',
      email_exists: 'البريد الإلكتروني مستخدم بالفعل',
      email_not_verified: 'يرجى تفعيل حسابك أولاً',
      invalid_token: 'رابط التفعيل غير صالح أو منتهي',
      invalid_code: 'الرمز غير صحيح أو منتهي',
      user_not_found: 'المستخدم غير موجود',
      login_required: 'يجب تسجيل الدخول',
      session_expired: 'انتهت صلاحية الجلسة',
      invalid_email_domain: 'نقبل فقط حسابات Gmail و Outlook و Yahoo',
      connection_failed: 'فشل الاتصال بالخادم',
      provider_error: 'حدث خطأ في الاتصال مع مزود الخدمة',
    },

    // ===============================
    // المستخدم - User
    // ===============================
    user: {
      user: 'مستخدم',
      username: 'اسم المستخدم',
      display_name: 'الاسم المعروض',
      bio: 'نبذة عني',
      country: 'الدولة',
      language: 'اللغة',
      avatar: 'الصورة الشخصية',
      email_verified: 'تم التحقق من البريد',
      member_since: 'عضو منذ',
      last_seen: 'آخر ظهور',
      online: 'متصل',
      offline: 'غير متصل',
      followers: 'المتابعون',
      following: 'يتابع',
      follow: 'متابعة',
      unfollow: 'إلغاء المتابعة',
    },

    // ===============================
    // الأقسام - Categories
    // ===============================
    categories: {
      title: 'الأقسام',
      dialogue: 'الحوار',
      science: 'العلوم',
      talents: 'المواهب',
      // أقسام الحوار
      religions: 'الأديان',
      sects: 'المذاهب',
      politics: 'السياسة',
      economics: 'الاقتصاد',
      current_affairs: 'قضايا الساعة',
      disputes: 'النزاعات الأخرى',
      // أقسام العلوم
      physics: 'الفيزياء',
      biology: 'الأحياء',
      chemistry: 'الكيمياء',
      math: 'الرياضيات',
      technology: 'التقنية',
      medicine: 'الطب',
      philosophy: 'الفلسفة',
      // أقسام المواهب
      singing: 'الغناء',
      poetry: 'الشعر',
      art: 'الفن',
      sports: 'الرياضة',
      comedy: 'الكوميديا',
      cooking: 'الطبخ',
      gaming: 'الألعاب',
      magic: 'الخدع',
    },

    // ===============================
    // الأقسام الرئيسية للعرض - Sections
    // ===============================
    sections: {
      suggested: 'مقترح لك',
      dialogue: 'ساحة الحوار',
      science: 'المختبر العلمي',
      talents: 'مسرح المواهب',
      trending: 'الأكثر رواجاً',
      new: 'الجديد',
      popular: 'الأكثر شعبية',
    },

    // ===============================
    // المنافسات - Competitions
    // ===============================
    competition: {
      competition: 'منافسة',
      competitions: 'المنافسات',
      create_competition: 'إنشاء منافسة',
      join_competition: 'انضم للمنافسة',
      watch_competition: 'شاهد المنافسة',
      my_competitions: 'منافساتي',
      my_requests: 'طلباتي',
      title: 'عنوان المنافسة',
      description: 'وصف المنافسة',
      rules: 'قوانين المنافسة',
      category: 'القسم',
      subcategory: 'القسم الفرعي',
      select_category: 'اختر القسم',
      select_subcategory: 'اختر القسم الفرعي',
      scheduled_time: 'موعد البدء',
      competitors: 'المتنافسون',
      awaiting_opponent: 'بانتظار منافس',
      // الحالات
      status_pending: 'في انتظار منافس',
      status_accepted: 'تم القبول',
      status_live: 'مباشر',
      status_completed: 'منتهية',
      status_cancelled: 'ملغاة',
      status_ongoing: 'مستمر',
      status_soon: 'قريباً',
      // الإجراءات
      request_join: 'طلب الانضمام',
      cancel_request: 'إلغاء الطلب',
      accept: 'قبول',
      decline: 'رفض',
      invite: 'دعوة',
      start: 'بدء',
      end: 'إنهاء',
      // الرسائل
      request_sent: 'تم إرسال الطلب',
      request_accepted: 'تم قبول الطلب',
      request_cancelled: 'تم إلغاء الطلب',
      no_competitions: 'عذراً، لا توجد منافسات هنا حالياً.',
      try_different_filter: 'جرب تصفية أخرى أو أنشئ منافسة جديدة',
      stream_not_available: 'البث غير متاح',
      login_to_compete: 'سجل دخول للمنافسة',
    },

    // ===============================
    // التقييم والتعليقات - Rating & Comments
    // ===============================
    interaction: {
      rate: 'قيّم',
      rating: 'التقييم',
      viewers: 'مشاهدة',
      views: 'مشاهدات',
      comment: 'تعليق',
      comments: 'التعليقات',
      add_comment: 'أضف تعليقاً',
      live_chat: 'المحادثة المباشرة',
      no_comments: 'لا توجد تعليقات بعد',
      like: 'إعجاب',
      dislike: 'عدم إعجاب',
      share: 'مشاركة',
      report: 'إبلاغ',
    },

    // ===============================
    // الإحصائيات - Statistics
    // ===============================
    stats: {
      stats: 'الإحصائيات',
      total_competitions: 'إجمالي المنافسات',
      total_wins: 'الانتصارات',
      total_views: 'المشاهدات',
      win_rate: 'نسبة الفوز',
      average_rating: 'متوسط التقييم',
    },

    // ===============================
    // البحث - Search
    // ===============================
    search: {
      placeholder: 'ابحث عن منافسة، عالم، أو موهبة...',
      no_results: 'لا توجد نتائج',
      search_for: 'ابحث عن',
    },

    // ===============================
    // الإعدادات - Settings
    // ===============================
    settings: {
      theme: 'الوضع الليلي/النهاري',
      dark_mode: 'الوضع الداكن',
      light_mode: 'الوضع الفاتح',
      language: 'اللغة',
      country_language: 'البلد واللغة',
      notifications_settings: 'إعدادات الإشعارات',
      privacy_settings: 'إعدادات الخصوصية',
      account_settings: 'إعدادات الحساب',
      delete_account: 'حذف الحساب',
    },

    // ===============================
    // الأخطاء - Errors
    // ===============================
    errors: {
      not_found: 'غير موجود',
      page_not_found: 'الصفحة غير موجودة',
      server_error: 'خطأ في الخادم',
      network_error: 'خطأ في الشبكة',
      unauthorized: 'غير مصرح',
      forbidden: 'ممنوع',
      bad_request: 'طلب غير صحيح',
      something_wrong: 'حدث خطأ ما',
      try_again: 'يرجى المحاولة مرة أخرى',
    },

    // ===============================
    // الرسائل المنبثقة - Modals
    // ===============================
    modals: {
      coming_soon_title: 'قريباً جداً!',
      coming_soon_message: 'نعمل حالياً على إضافة هذه الميزة. يرجى استخدام طريقة أخرى حالياً.',
      confirm_delete: 'هل أنت متأكد من الحذف؟',
      confirm_action: 'هل أنت متأكد؟',
      action_cannot_undone: 'لا يمكن التراجع عن هذا الإجراء',
    },

    // ===============================
    // صفحة عن المنصة - About Page
    // ===============================
    about: {
      page_title: 'عن ديولي',
      hero_title: 'منصة ديولي للمنافسات',
      hero_description: 'المنصة الأولى من نوعها التي تجمع بين المنافسات الحية، الحوارات البناءة، واكتشاف المواهب في بيئة تفاعلية عادلة.',
      feature_streaming_title: 'بث مباشر وتفاعل حي',
      feature_streaming_desc: 'نظام بث متطور يجمع المتنافسين جنباً إلى جنب مع إمكانية تفاعل الجمهور والتصويت المباشر.',
      feature_judging_title: 'نظام تحكيم عادل',
      feature_judging_desc: 'آليات تحكيم شفافة تعتمد على تصويت الجمهور ولجان التحكيم المختصة لضمان العدالة.',
      feature_community_title: 'مجتمع عالمي',
      feature_community_desc: 'تواصل مع مبدعين ومفكرين من مختلف أنحاء العالم وشارك في منافسات عابرة للحدود.',
      gallery_title: 'نظرة على المنصة',
      developer_title: 'تم التطوير بواسطة Maelsh',
      developer_desc: 'نحن في Maelsh نؤمن بقوة الحوار والمنافسة الشريفة في بناء المجتمعات.',
    },

    // ===============================
    // التحقق من البريد - Email Verification
    // ===============================
    verification: {
      page_title: 'تفعيل الحساب',
      success_title: 'تم تفعيل حسابك!',
      success_message: 'يمكنك الآن تسجيل الدخول إلى حسابك',
      error_title: 'فشل التفعيل',
      error_message: 'يرجى التحقق من الرابط أو طلب رابط جديد',
      go_home: 'اذهب إلى الرئيسية',
      go_back: 'العودة',
    },

    // ===============================
    // البريد الإلكتروني - Emails
    // ===============================
    emails: {
      verification_subject: 'تفعيل حسابك في ديولي',
      verification_greeting: 'مرحباً',
      verification_message: 'شكراً لتسجيلك في منصة ديولي. يرجى الضغط على الزر أدناه لتفعيل حسابك:',
      verification_button: 'تفعيل الحساب',
      verification_link_text: 'أو انسخ هذا الرابط:',
      verification_ignore: 'إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذه الرسالة.',
      reset_subject: 'إعادة تعيين كلمة المرور',
      reset_greeting: 'إعادة تعيين كلمة المرور',
      reset_message: 'تلقينا طلباً لإعادة تعيين كلمة المرور. استخدم الرمز التالي:',
      reset_code_validity: 'هذا الرمز صالح لمدة 15 دقيقة فقط.',
      reset_ignore: 'إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.',
    },

    // ===============================
    // إشعارات Join Requests
    // ===============================
    notifications: {
      new_join_request: 'طلب انضمام جديد',
      join_request_message: 'طلب انضمام للمنافسة:',
      request_accepted: 'تم قبول طلبك',
      request_accepted_message: 'تم قبول طلبك للانضمام للمنافسة',
    },

    // ===============================
    // القواعد الافتراضية - Default Rules
    // ===============================
    defaults: {
      rules_placeholder: '1. مدة الحديث لكل طرف\n2. قواعد الحوار\n3. معايير التقييم',
    },
  },

  /**
   * English Translations
   */
  en: {
    // ===============================
    // General
    // ===============================
    general: {
      app_title: 'Dueli',
      app_subtitle: 'Connect via Competition',
      app_tagline: 'The First Interactive Competition Platform',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      warning: 'Warning',
      info: 'Info',
      yes: 'Yes',
      no: 'No',
      ok: 'OK',
      cancel: 'Cancel',
      close: 'Close',
      save: 'Save',
      edit: 'Edit',
      delete: 'Delete',
      back: 'Back',
      next: 'Next',
      previous: 'Previous',
      submit: 'Submit',
      send: 'Send',
      search: 'Search',
      filter: 'Filter',
      sort: 'Sort',
      all: 'All',
      none: 'None',
      more: 'More',
      less: 'Less',
      view_all: 'View All',
      load_more: 'Load More',
      refresh: 'Refresh',
      retry: 'Retry',
      copyright: '© 2025 Dueli. All rights reserved.',
    },

    // ===============================
    // Navigation
    // ===============================
    nav: {
      home: 'Home',
      explore: 'Explore',
      live: 'Live Stream',
      recorded: 'Recorded',
      profile: 'Profile',
      settings: 'Settings',
      notifications: 'Notifications',
      messages: 'Messages',
      help: 'Help',
      about: 'About',
      contact: 'Contact Us',
      terms: 'Terms of Service',
      privacy: 'Privacy Policy',
    },

    // ===============================
    // Authentication
    // ===============================
    auth: {
      login: 'Login',
      logout: 'Logout',
      register: 'Register',
      login_welcome: 'Welcome to Dueli',
      login_subtitle: 'Sign in to participate in competitions',
      login_with_google: 'Continue with Google',
      login_with_facebook: 'Continue with Facebook',
      login_with_microsoft: 'Continue with Microsoft',
      login_with_twitter: 'Continue with X',
      login_with_tiktok: 'Continue with TikTok',
      login_with_snapchat: 'Continue with Snapchat',
      or_continue_with: 'Or continue with',
      email: 'Email',
      password: 'Password',
      confirm_password: 'Confirm Password',
      name: 'Name',
      remember_me: 'Remember me',
      forgot_password: 'Forgot Password?',
      reset_password: 'Reset Password',
      new_password: 'New Password',
      verification_code: 'Verification Code',
      send_code: 'Send Verification Code',
      verify_code: 'Verify Code',
      change_password: 'Change Password',
      back_to_login: 'Back to Login',
      create_account: 'Create Account',
      password_requirements: 'Must be at least 6 characters',
      agree_terms: 'By continuing, you agree to our Terms and Privacy Policy',
      // Messages
      login_success: 'Logged in successfully',
      logout_success: 'Logged out successfully',
      register_success: 'Registration successful! Please check your email.',
      password_reset_success: 'Password reset successfully',
      code_sent: 'Verification code sent to your email',
      code_verified: 'Code verified',
      verification_success: 'Account activated successfully!',
      // Errors
      email_required: 'Email is required',
      password_required: 'Password is required',
      all_fields_required: 'All fields are required',
      invalid_credentials: 'Invalid email or password',
      email_exists: 'Email already exists',
      email_not_verified: 'Please verify your email first',
      invalid_token: 'Invalid or expired verification link',
      invalid_code: 'Invalid or expired code',
      user_not_found: 'User not found',
      login_required: 'Login required',
      session_expired: 'Session expired',
      invalid_email_domain: 'We only accept Gmail, Outlook, and Yahoo accounts',
      connection_failed: 'Connection to server failed',
      provider_error: 'Connection error with the provider',
    },

    // ===============================
    // User
    // ===============================
    user: {
      user: 'User',
      username: 'Username',
      display_name: 'Display Name',
      bio: 'Bio',
      country: 'Country',
      language: 'Language',
      avatar: 'Profile Picture',
      email_verified: 'Email Verified',
      member_since: 'Member since',
      last_seen: 'Last seen',
      online: 'Online',
      offline: 'Offline',
      followers: 'Followers',
      following: 'Following',
      follow: 'Follow',
      unfollow: 'Unfollow',
    },

    // ===============================
    // Categories
    // ===============================
    categories: {
      title: 'Categories',
      dialogue: 'Dialogue',
      science: 'Science',
      talents: 'Talents',
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
    },

    // ===============================
    // Sections
    // ===============================
    sections: {
      suggested: 'Suggested for You',
      dialogue: 'Dialogue Arena',
      science: 'Science Lab',
      talents: 'Talent Stage',
      trending: 'Trending',
      new: 'New',
      popular: 'Popular',
    },

    // ===============================
    // Competitions
    // ===============================
    competition: {
      competition: 'Competition',
      competitions: 'Competitions',
      create_competition: 'Create Competition',
      join_competition: 'Join Competition',
      watch_competition: 'Watch Competition',
      my_competitions: 'My Competitions',
      my_requests: 'My Requests',
      title: 'Competition Title',
      description: 'Competition Description',
      rules: 'Competition Rules',
      category: 'Category',
      subcategory: 'Subcategory',
      select_category: 'Select Category',
      select_subcategory: 'Select Subcategory',
      scheduled_time: 'Scheduled Time',
      competitors: 'Competitors',
      awaiting_opponent: 'Awaiting Opponent',
      // Statuses
      status_pending: 'Waiting for opponent',
      status_accepted: 'Accepted',
      status_live: 'Live',
      status_completed: 'Completed',
      status_cancelled: 'Cancelled',
      status_ongoing: 'Ongoing',
      status_soon: 'Soon',
      // Actions
      request_join: 'Request to Join',
      cancel_request: 'Cancel Request',
      accept: 'Accept',
      decline: 'Decline',
      invite: 'Invite',
      start: 'Start',
      end: 'End',
      // Messages
      request_sent: 'Request sent',
      request_accepted: 'Request accepted',
      request_cancelled: 'Request cancelled',
      no_competitions: 'Sorry, no competitions available here currently.',
      try_different_filter: 'Try a different filter or create a new competition',
      stream_not_available: 'Stream not available',
      login_to_compete: 'Login to Compete',
    },

    // ===============================
    // Rating & Comments
    // ===============================
    interaction: {
      rate: 'Rate',
      rating: 'Rating',
      viewers: 'views',
      views: 'Views',
      comment: 'Comment',
      comments: 'Comments',
      add_comment: 'Add Comment',
      live_chat: 'Live Chat',
      no_comments: 'No comments yet',
      like: 'Like',
      dislike: 'Dislike',
      share: 'Share',
      report: 'Report',
    },

    // ===============================
    // Statistics
    // ===============================
    stats: {
      stats: 'Statistics',
      total_competitions: 'Total Competitions',
      total_wins: 'Wins',
      total_views: 'Views',
      win_rate: 'Win Rate',
      average_rating: 'Average Rating',
    },

    // ===============================
    // Search
    // ===============================
    search: {
      placeholder: 'Search for a duel, scientist, or talent...',
      no_results: 'No results',
      search_for: 'Search for',
    },

    // ===============================
    // Settings
    // ===============================
    settings: {
      theme: 'Dark/Light Mode',
      dark_mode: 'Dark Mode',
      light_mode: 'Light Mode',
      language: 'Language',
      country_language: 'Country & Language',
      notifications_settings: 'Notification Settings',
      privacy_settings: 'Privacy Settings',
      account_settings: 'Account Settings',
      delete_account: 'Delete Account',
    },

    // ===============================
    // Errors
    // ===============================
    errors: {
      not_found: 'Not Found',
      page_not_found: 'Page Not Found',
      server_error: 'Server Error',
      network_error: 'Network Error',
      unauthorized: 'Unauthorized',
      forbidden: 'Forbidden',
      bad_request: 'Bad Request',
      something_wrong: 'Something went wrong',
      try_again: 'Please try again',
    },

    // ===============================
    // Modals
    // ===============================
    modals: {
      coming_soon_title: 'Coming Very Soon!',
      coming_soon_message: 'We are working on adding this feature. Please use another method for now.',
      confirm_delete: 'Are you sure you want to delete?',
      confirm_action: 'Are you sure?',
      action_cannot_undone: 'This action cannot be undone',
    },

    // ===============================
    // About Page
    // ===============================
    about: {
      page_title: 'About Dueli',
      hero_title: 'Dueli Competition Platform',
      hero_description: 'The first platform of its kind combining live competitions, constructive dialogues, and talent discovery in a fair interactive environment.',
      feature_streaming_title: 'Live Streaming & Interaction',
      feature_streaming_desc: 'Advanced streaming system bringing competitors side-by-side with audience interaction and live voting.',
      feature_judging_title: 'Fair Judging System',
      feature_judging_desc: 'Transparent judging mechanisms based on audience voting and expert panels to ensure fairness.',
      feature_community_title: 'Global Community',
      feature_community_desc: 'Connect with creators and thinkers from around the world and participate in cross-border competitions.',
      gallery_title: 'Platform Preview',
      developer_title: 'Developed by Maelsh',
      developer_desc: 'At Maelsh, we believe in the power of dialogue and fair competition in building communities.',
    },

    // ===============================
    // Email Verification
    // ===============================
    verification: {
      page_title: 'Account Verification',
      success_title: 'Account Activated!',
      success_message: 'You can now log into your account',
      error_title: 'Verification Failed',
      error_message: 'Please check the link or request a new one',
      go_home: 'Go to Home',
      go_back: 'Go Back',
    },

    // ===============================
    // Emails
    // ===============================
    emails: {
      verification_subject: 'Activate your Dueli account',
      verification_greeting: 'Welcome',
      verification_message: 'Thank you for signing up for Dueli. Please click the button below to activate your account:',
      verification_button: 'Activate Account',
      verification_link_text: 'Or copy this link:',
      verification_ignore: "If you didn't create an account, you can ignore this message.",
      reset_subject: 'Reset Your Password',
      reset_greeting: 'Reset Your Password',
      reset_message: 'We received a request to reset your password. Use this code:',
      reset_code_validity: 'This code is valid for 15 minutes only.',
      reset_ignore: "If you didn't request a password reset, you can ignore this message.",
    },

    // ===============================
    // Notifications
    // ===============================
    notifications: {
      new_join_request: 'New Join Request',
      join_request_message: 'Join request for competition:',
      request_accepted: 'Request Accepted',
      request_accepted_message: 'Your request to join the competition has been accepted',
    },

    // ===============================
    // Defaults
    // ===============================
    defaults: {
      rules_placeholder: '1. Speaking time per side\n2. Dialogue rules\n3. Evaluation criteria',
    },
  },
};

/**
 * الحصول على ترجمة نص معين
 * @param key - مفتاح الترجمة (يدعم التداخل مثل 'auth.login')
 * @param lang - لغة الترجمة
 * @returns النص المترجم أو المفتاح إذا لم توجد الترجمة
 * @example
 * t('auth.login', 'ar') // returns 'دخول'
 * t('general.loading', 'en') // returns 'Loading...'
 */
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

/**
 * الحصول على كائن الترجمات الكامل للغة معينة
 * @param lang - لغة الترجمة
 * @returns كائن الترجمات
 */
export function getTranslations(lang: Language): TranslationSchema {
  return translations[lang] || translations.ar;
}

export default translations;
