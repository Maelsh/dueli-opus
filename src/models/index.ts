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
export { ReportModel, Report, ReportWithDetails, CreateReportData, ReportTargetType, ReportStatus, ArbitrationStatus, REPORT_REASONS } from './ReportModel';
export { MessageModel, ConversationModel, Message, Conversation, MessageWithSender, ConversationWithUser } from './MessageModel';
export { AdvertisementModel, EarningsModel, Advertisement, AdImpression, UserEarnings } from './AdvertisementModel';
export { UserSettingsModel, UserPostModel, UserSettings, UserPost, UserPostWithAuthor } from './UserSettingsModel';
export { ScheduleModel, CompetitionReminder, ReminderWithDetails } from './ScheduleModel';

// Task 4: Transparency Engine Models
export { PlatformFinancialLogModel } from './PlatformFinancialLogModel';
export type { PlatformFinancialLog, PublicFinancialLogEntry, CreateFinancialLogData, DailySummary, PlatformFinancialTotals, FinancialEntryType } from './PlatformFinancialLogModel';
export { PlatformDonationsLedgerModel } from './PlatformDonationsLedgerModel';
export type { PlatformDonationsLedger, PublicDonationLedgerEntry, CreateDonationLedgerData, DonationLedgerStats, DonationLedgerType } from './PlatformDonationsLedgerModel';

// Task 1: Advertiser Portal Models
export { AdminRoleModel, AdminRole, AdminRoleType } from './AdminRoleModel';
export { AdminAuditLogModel, AdminAuditLog, AdminAuditLogWithAdmin } from './AdminAuditLogModel';
export { PlatformSettingsModel, PlatformSetting } from './PlatformSettingsModel';
export { CompetitionRevenueLogModel, CompetitionRevenueLog } from './CompetitionRevenueLogModel';

// Task 6: Withdrawal Requests Model
export { WithdrawalRequestModel } from './WithdrawalRequestModel';
export type { WithdrawalRequest, WithdrawalRequestWithUser, CreateWithdrawalData, WithdrawalFilters, WithdrawalStatus } from './WithdrawalRequestModel';

// Task 9: SSE Event Log Model
export { SseEventLogModel } from './SseEventLogModel';
export type { SseEventLog, SseChannel, SseEventType } from './SseEventLogModel';
