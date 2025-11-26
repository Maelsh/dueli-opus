// Dueli Internationalization (i18n)
// نظام الترجمة والتعريب

export type Language = 'ar' | 'en';

export const translations = {
  ar: {
    // العامة
    app_name: 'Dueli',
    app_tagline: 'منصة المنافسات والحوارات',
    home: 'الرئيسية',
    explore: 'استكشف',
    live: 'مباشر',
    recorded: 'مسجل',
    profile: 'الملف الشخصي',
    settings: 'الإعدادات',
    logout: 'تسجيل الخروج',
    login: 'تسجيل الدخول',
    register: 'إنشاء حساب',
    search: 'بحث...',
    filter: 'تصفية',
    sort: 'ترتيب',
    all: 'الكل',
    
    // الأقسام
    categories: 'الأقسام',
    dialogue: 'الحوار',
    science: 'العلوم',
    talents: 'المواهب',
    
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
    
    // الحالات
    status_pending: 'في انتظار منافس',
    status_accepted: 'تم القبول',
    status_live: 'مباشر الآن',
    status_completed: 'منتهية',
    status_cancelled: 'ملغاة',
    
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
    ratings: 'التقييمات',
    rate_competitor: 'قيّم المتنافس',
    your_rating: 'تقييمك',
    average_rating: 'متوسط التقييم',
    
    // التعليقات
    comment: 'تعليق',
    comments: 'التعليقات',
    add_comment: 'أضف تعليقاً',
    live_chat: 'المحادثة المباشرة',
    
    // المستخدم
    user: 'مستخدم',
    username: 'اسم المستخدم',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    confirm_password: 'تأكيد كلمة المرور',
    display_name: 'الاسم المعروض',
    bio: 'نبذة عني',
    country: 'الدولة',
    language: 'اللغة',
    
    // الإحصائيات
    stats: 'الإحصائيات',
    total_competitions: 'إجمالي المنافسات',
    total_wins: 'الانتصارات',
    total_views: 'المشاهدات',
    total_earnings: 'الأرباح',
    followers: 'المتابعون',
    following: 'يتابع',
    
    // البث
    start_live: 'ابدأ البث',
    end_live: 'إنهاء البث',
    connect_youtube: 'ربط حساب يوتيوب',
    youtube_connected: 'يوتيوب متصل',
    camera: 'الكاميرا',
    microphone: 'الميكروفون',
    screen_share: 'مشاركة الشاشة',
    
    // الإشعارات
    notifications: 'الإشعارات',
    new_invite: 'دعوة جديدة للمنافسة',
    new_follower: 'متابع جديد',
    competition_starting: 'المنافسة ستبدأ قريباً',
    
    // الفلترة
    filter_by_country: 'فلترة حسب الدولة',
    filter_by_language: 'فلترة حسب اللغة',
    filter_by_category: 'فلترة حسب القسم',
    filter_by_status: 'فلترة حسب الحالة',
    
    // الرسائل
    messages: 'الرسائل',
    send_message: 'إرسال رسالة',
    no_messages: 'لا توجد رسائل',
    
    // المنشورات
    posts: 'المنشورات',
    create_post: 'منشور جديد',
    whats_new: 'ما الجديد؟',
    
    // الأخطاء
    error: 'خطأ',
    error_occurred: 'حدث خطأ',
    not_found: 'غير موجود',
    unauthorized: 'غير مصرح',
    login_required: 'يجب تسجيل الدخول',
    
    // النجاح
    success: 'تم بنجاح',
    saved: 'تم الحفظ',
    created: 'تم الإنشاء',
    deleted: 'تم الحذف',
    
    // التأكيدات
    confirm: 'تأكيد',
    are_you_sure: 'هل أنت متأكد؟',
    yes: 'نعم',
    no: 'لا',
    
    // الأرباح
    earnings: 'الأرباح',
    ad_revenue: 'إيرادات الإعلانات',
    your_share: 'حصتك',
    platform_fee: 'رسوم المنصة (20%)',
    
    // الوصف
    platform_description: 'منصة تتيح التواصل عن طريق التنافس في الحوارات والعلوم والمواهب',
    open_source: 'مفتوحة المصدر',
    non_profit: 'غير ربحية',
    
    // Footer
    about: 'عن المنصة',
    contact: 'تواصل معنا',
    terms: 'الشروط والأحكام',
    privacy: 'سياسة الخصوصية',
    github: 'المصدر على GitHub',
    
    // الصفحة الرئيسية
    hero_title: 'نافس، ناقش، تألق',
    hero_subtitle: 'منصة عالمية للمنافسات الحوارية والعلمية والمواهب',
    get_started: 'ابدأ الآن',
    watch_live: 'شاهد البث المباشر',
    featured_competitions: 'منافسات مميزة',
    trending_now: 'الأكثر رواجاً',
    upcoming: 'القادمة',
    
    // أزرار الإجراءات
    view_all: 'عرض الكل',
    load_more: 'تحميل المزيد',
    refresh: 'تحديث',
    back: 'رجوع',
    next: 'التالي',
    previous: 'السابق',
    submit: 'إرسال',
    close: 'إغلاق',

    // المشاهدين
    viewers: 'مشاهد',
    watching_now: 'يشاهدون الآن',
    registered_only: 'المسجلون فقط يمكنهم التعليق والتقييم',
  },
  
  en: {
    // General
    app_name: 'Dueli',
    app_tagline: 'Competition & Dialogue Platform',
    home: 'Home',
    explore: 'Explore',
    live: 'Live',
    recorded: 'Recorded',
    profile: 'Profile',
    settings: 'Settings',
    logout: 'Logout',
    login: 'Login',
    register: 'Register',
    search: 'Search...',
    filter: 'Filter',
    sort: 'Sort',
    all: 'All',
    
    // Categories
    categories: 'Categories',
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
    
    // Statuses
    status_pending: 'Waiting for opponent',
    status_accepted: 'Accepted',
    status_live: 'Live Now',
    status_completed: 'Completed',
    status_cancelled: 'Cancelled',
    
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
    ratings: 'Ratings',
    rate_competitor: 'Rate Competitor',
    your_rating: 'Your Rating',
    average_rating: 'Average Rating',
    
    // Comments
    comment: 'Comment',
    comments: 'Comments',
    add_comment: 'Add Comment',
    live_chat: 'Live Chat',
    
    // User
    user: 'User',
    username: 'Username',
    email: 'Email',
    password: 'Password',
    confirm_password: 'Confirm Password',
    display_name: 'Display Name',
    bio: 'Bio',
    country: 'Country',
    language: 'Language',
    
    // Stats
    stats: 'Statistics',
    total_competitions: 'Total Competitions',
    total_wins: 'Wins',
    total_views: 'Views',
    total_earnings: 'Earnings',
    followers: 'Followers',
    following: 'Following',
    
    // Streaming
    start_live: 'Start Live',
    end_live: 'End Live',
    connect_youtube: 'Connect YouTube',
    youtube_connected: 'YouTube Connected',
    camera: 'Camera',
    microphone: 'Microphone',
    screen_share: 'Screen Share',
    
    // Notifications
    notifications: 'Notifications',
    new_invite: 'New competition invite',
    new_follower: 'New follower',
    competition_starting: 'Competition starting soon',
    
    // Filtering
    filter_by_country: 'Filter by Country',
    filter_by_language: 'Filter by Language',
    filter_by_category: 'Filter by Category',
    filter_by_status: 'Filter by Status',
    
    // Messages
    messages: 'Messages',
    send_message: 'Send Message',
    no_messages: 'No messages',
    
    // Posts
    posts: 'Posts',
    create_post: 'New Post',
    whats_new: "What's new?",
    
    // Errors
    error: 'Error',
    error_occurred: 'An error occurred',
    not_found: 'Not Found',
    unauthorized: 'Unauthorized',
    login_required: 'Login required',
    
    // Success
    success: 'Success',
    saved: 'Saved',
    created: 'Created',
    deleted: 'Deleted',
    
    // Confirmations
    confirm: 'Confirm',
    are_you_sure: 'Are you sure?',
    yes: 'Yes',
    no: 'No',
    
    // Earnings
    earnings: 'Earnings',
    ad_revenue: 'Ad Revenue',
    your_share: 'Your Share',
    platform_fee: 'Platform Fee (20%)',
    
    // Description
    platform_description: 'A platform for competing in dialogues, sciences, and talents',
    open_source: 'Open Source',
    non_profit: 'Non-Profit',
    
    // Footer
    about: 'About',
    contact: 'Contact Us',
    terms: 'Terms of Service',
    privacy: 'Privacy Policy',
    github: 'Source on GitHub',
    
    // Home page
    hero_title: 'Compete, Discuss, Shine',
    hero_subtitle: 'Global platform for dialogue, science, and talent competitions',
    get_started: 'Get Started',
    watch_live: 'Watch Live',
    featured_competitions: 'Featured Competitions',
    trending_now: 'Trending Now',
    upcoming: 'Upcoming',
    
    // Action buttons
    view_all: 'View All',
    load_more: 'Load More',
    refresh: 'Refresh',
    back: 'Back',
    next: 'Next',
    previous: 'Previous',
    submit: 'Submit',
    close: 'Close',

    // Viewers
    viewers: 'viewers',
    watching_now: 'watching now',
    registered_only: 'Only registered users can comment and rate',
  }
};

export function t(key: keyof typeof translations.ar, lang: Language = 'ar'): string {
  return translations[lang][key] || translations.ar[key] || key;
}

export function isRTL(lang: Language): boolean {
  return lang === 'ar';
}

export function getDir(lang: Language): 'rtl' | 'ltr' {
  return lang === 'ar' ? 'rtl' : 'ltr';
}
