/**
 * Models Module Exports
 * تصدير وحدة النماذج
 */

// Base
export { BaseModel, QueryOptions } from './base/BaseModel';

// Domain Models
export { UserModel, CreateUserData, UpdateUserData } from './UserModel';
export { CompetitionModel, CompetitionFilters, CompetitionWithDetails, CreateCompetitionData } from './CompetitionModel';
export { CategoryModel, CategoryWithSubcategories } from './CategoryModel';
export { CommentModel, CommentWithUser } from './CommentModel';
export { NotificationModel, CreateNotificationData } from './NotificationModel';
export { SessionModel } from './SessionModel';
export { SearchModel, SearchFilters, SearchResult } from './SearchModel';
export { LikeModel, Like, LikeWithUser } from './LikeModel';
export { ReportModel, Report, ReportWithDetails, CreateReportData, ReportTargetType, ReportStatus, REPORT_REASONS } from './ReportModel';
export { MessageModel, ConversationModel, Message, Conversation, MessageWithSender, ConversationWithUser } from './MessageModel';
export { AdvertisementModel, EarningsModel, Advertisement, AdImpression, UserEarnings } from './AdvertisementModel';
export { UserSettingsModel, UserPostModel, UserSettings, UserPost, UserPostWithAuthor } from './UserSettingsModel';
export { ScheduleModel, CompetitionReminder, ReminderWithDetails } from './ScheduleModel';

// New Feature Models (FR-016, FR-018, FR-020)
export { AdBlockModel, AdBlock } from './AdBlockModel';
export { DonationModel, Donation, DonationWithDetails } from './DonationModel';
export { PaymentMethodModel, PaymentMethod, PaymentMethodType } from './PaymentMethodModel';
