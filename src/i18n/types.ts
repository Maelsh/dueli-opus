/**
 * @file types.ts
 * @description أنواع TypeScript لنظام الترجمة
 * @description_en TypeScript types for the i18n system
 * @module i18n/types
 * @version 1.0.0
 */

/**
 * اللغات المدعومة
 * @description قائمة اللغات المتاحة في المنصة
 */
export type Language = 'ar' | 'en';

/**
 * اتجاه الصفحة
 * @description يحدد اتجاه قراءة النص
 */
export type Direction = 'rtl' | 'ltr';

/**
 * هيكل قسم الترجمات العامة
 */
export interface GeneralTranslations {
  app_title: string;
  app_subtitle: string;
  app_tagline: string;
  loading: string;
  error: string;
  success: string;
  warning: string;
  info: string;
  yes: string;
  no: string;
  ok: string;
  cancel: string;
  close: string;
  save: string;
  edit: string;
  delete: string;
  back: string;
  next: string;
  previous: string;
  submit: string;
  send: string;
  search: string;
  filter: string;
  sort: string;
  all: string;
  none: string;
  more: string;
  less: string;
  view_all: string;
  load_more: string;
  refresh: string;
  retry: string;
  copyright: string;
}

/**
 * هيكل قسم ترجمات التنقل
 */
export interface NavTranslations {
  home: string;
  explore: string;
  live: string;
  recorded: string;
  profile: string;
  settings: string;
  notifications: string;
  messages: string;
  help: string;
  about: string;
  contact: string;
  terms: string;
  privacy: string;
}

/**
 * هيكل قسم ترجمات المصادقة
 */
export interface AuthTranslations {
  login: string;
  logout: string;
  register: string;
  login_welcome: string;
  login_subtitle: string;
  login_with_google: string;
  login_with_facebook: string;
  login_with_microsoft: string;
  login_with_twitter: string;
  login_with_tiktok: string;
  login_with_snapchat: string;
  or_continue_with: string;
  email: string;
  password: string;
  confirm_password: string;
  name: string;
  remember_me: string;
  forgot_password: string;
  reset_password: string;
  new_password: string;
  verification_code: string;
  send_code: string;
  verify_code: string;
  change_password: string;
  back_to_login: string;
  create_account: string;
  password_requirements: string;
  agree_terms: string;
  // Messages
  login_success: string;
  logout_success: string;
  register_success: string;
  password_reset_success: string;
  code_sent: string;
  code_verified: string;
  verification_success: string;
  // Errors
  email_required: string;
  password_required: string;
  all_fields_required: string;
  invalid_credentials: string;
  email_exists: string;
  email_not_verified: string;
  invalid_token: string;
  invalid_code: string;
  user_not_found: string;
  login_required: string;
  session_expired: string;
  invalid_email_domain: string;
  connection_failed: string;
  provider_error: string;
}

/**
 * هيكل قسم ترجمات المستخدم
 */
export interface UserTranslations {
  user: string;
  username: string;
  display_name: string;
  bio: string;
  country: string;
  language: string;
  avatar: string;
  email_verified: string;
  member_since: string;
  last_seen: string;
  online: string;
  offline: string;
  followers: string;
  following: string;
  follow: string;
  unfollow: string;
}

/**
 * هيكل قسم ترجمات الأقسام
 */
export interface CategoriesTranslations {
  title: string;
  dialogue: string;
  science: string;
  talents: string;
  // Dialogue
  religions: string;
  sects: string;
  politics: string;
  economics: string;
  current_affairs: string;
  disputes: string;
  // Science
  physics: string;
  biology: string;
  chemistry: string;
  math: string;
  technology: string;
  medicine: string;
  philosophy: string;
  // Talents
  singing: string;
  poetry: string;
  art: string;
  sports: string;
  comedy: string;
  cooking: string;
  gaming: string;
  magic: string;
}

/**
 * هيكل قسم ترجمات الأقسام الرئيسية
 */
export interface SectionsTranslations {
  suggested: string;
  dialogue: string;
  science: string;
  talents: string;
  trending: string;
  new: string;
  popular: string;
}

/**
 * هيكل قسم ترجمات المنافسات
 */
export interface CompetitionTranslations {
  competition: string;
  competitions: string;
  create_competition: string;
  join_competition: string;
  watch_competition: string;
  my_competitions: string;
  my_requests: string;
  title: string;
  description: string;
  rules: string;
  category: string;
  subcategory: string;
  select_category: string;
  select_subcategory: string;
  scheduled_time: string;
  competitors: string;
  awaiting_opponent: string;
  // Statuses
  status_pending: string;
  status_accepted: string;
  status_live: string;
  status_completed: string;
  status_cancelled: string;
  status_ongoing: string;
  status_soon: string;
  // Actions
  request_join: string;
  cancel_request: string;
  accept: string;
  decline: string;
  invite: string;
  start: string;
  end: string;
  // Messages
  request_sent: string;
  request_accepted: string;
  request_cancelled: string;
  no_competitions: string;
  try_different_filter: string;
  stream_not_available: string;
  login_to_compete: string;
}

/**
 * هيكل قسم ترجمات التفاعل
 */
export interface InteractionTranslations {
  rate: string;
  rating: string;
  viewers: string;
  views: string;
  comment: string;
  comments: string;
  add_comment: string;
  live_chat: string;
  no_comments: string;
  like: string;
  dislike: string;
  share: string;
  report: string;
}

/**
 * هيكل قسم ترجمات الإحصائيات
 */
export interface StatsTranslations {
  stats: string;
  total_competitions: string;
  total_wins: string;
  total_views: string;
  win_rate: string;
  average_rating: string;
}

/**
 * هيكل قسم ترجمات البحث
 */
export interface SearchTranslations {
  placeholder: string;
  no_results: string;
  search_for: string;
}

/**
 * هيكل قسم ترجمات الإعدادات
 */
export interface SettingsTranslations {
  theme: string;
  dark_mode: string;
  light_mode: string;
  language: string;
  country_language: string;
  notifications_settings: string;
  privacy_settings: string;
  account_settings: string;
  delete_account: string;
}

/**
 * هيكل قسم ترجمات الأخطاء
 */
export interface ErrorsTranslations {
  not_found: string;
  page_not_found: string;
  server_error: string;
  network_error: string;
  unauthorized: string;
  forbidden: string;
  bad_request: string;
  something_wrong: string;
  try_again: string;
}

/**
 * هيكل قسم ترجمات النوافذ المنبثقة
 */
export interface ModalsTranslations {
  coming_soon_title: string;
  coming_soon_message: string;
  confirm_delete: string;
  confirm_action: string;
  action_cannot_undone: string;
}

/**
 * هيكل قسم ترجمات صفحة عن المنصة
 */
export interface AboutTranslations {
  page_title: string;
  hero_title: string;
  hero_description: string;
  feature_streaming_title: string;
  feature_streaming_desc: string;
  feature_judging_title: string;
  feature_judging_desc: string;
  feature_community_title: string;
  feature_community_desc: string;
  gallery_title: string;
  developer_title: string;
  developer_desc: string;
}

/**
 * هيكل قسم ترجمات التحقق من البريد
 */
export interface VerificationTranslations {
  page_title: string;
  success_title: string;
  success_message: string;
  error_title: string;
  error_message: string;
  go_home: string;
  go_back: string;
}

/**
 * هيكل قسم ترجمات البريد الإلكتروني
 */
export interface EmailsTranslations {
  verification_subject: string;
  verification_greeting: string;
  verification_message: string;
  verification_button: string;
  verification_link_text: string;
  verification_ignore: string;
  reset_subject: string;
  reset_greeting: string;
  reset_message: string;
  reset_code_validity: string;
  reset_ignore: string;
}

/**
 * هيكل قسم ترجمات الإشعارات
 */
export interface NotificationsTranslations {
  new_join_request: string;
  join_request_message: string;
  request_accepted: string;
  request_accepted_message: string;
}

/**
 * هيكل قسم الافتراضيات
 */
export interface DefaultsTranslations {
  rules_placeholder: string;
}

/**
 * الهيكل الكامل لنظام الترجمة
 * @description يحتوي على جميع أقسام الترجمة
 */
export interface TranslationSchema {
  general: GeneralTranslations;
  nav: NavTranslations;
  auth: AuthTranslations;
  user: UserTranslations;
  categories: CategoriesTranslations;
  sections: SectionsTranslations;
  competition: CompetitionTranslations;
  interaction: InteractionTranslations;
  stats: StatsTranslations;
  search: SearchTranslations;
  settings: SettingsTranslations;
  errors: ErrorsTranslations;
  modals: ModalsTranslations;
  about: AboutTranslations;
  verification: VerificationTranslations;
  emails: EmailsTranslations;
  notifications: NotificationsTranslations;
  defaults: DefaultsTranslations;
}
