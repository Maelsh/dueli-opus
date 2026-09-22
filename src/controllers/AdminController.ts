import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { UserModel } from '../models/UserModel';
import { CompetitionModel } from '../models/CompetitionModel';
import { CommentModel } from '../models/CommentModel';
import { ReportModel } from '../models/ReportModel';
import { AdvertisementModel, EarningsModel } from '../models/AdvertisementModel';
import { AdminRoleModel, AdminRoleType } from '../models/AdminRoleModel';
import { SessionModel } from '../models/SessionModel';
import { AdminAuditLogModel } from '../models/AdminAuditLogModel';
import { AdminStatsModel } from '../models/AdminStatsModel';
import { PlatformSettingsModel } from '../models/PlatformSettingsModel';
import { PlatformFinancialLogModel } from '../models/PlatformFinancialLogModel';
import { ArbitrationService, ArbitrationStatus } from '../lib/services/ArbitrationService';
import { LivePayoutEngine } from '../lib/services/LivePayoutEngine';
import { EventPusher } from '../lib/services/EventPusher';
import { AdCampaignManager } from '../lib/services/AdCampaignManager';
import { WithdrawalController } from './WithdrawalController';

export class AdminController extends BaseController {

    private async isAdmin(c: Context<{ Bindings: Bindings; Variables: Variables }>): Promise<boolean> {
        const user = this.getCurrentUser(c);
        return user?.is_admin === 1;
    }

    async getStats(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) {
                return this.forbidden(c);
            }

            const db = c.env.DB;
            const statsModel = new AdminStatsModel(db);

            const [users, competitions, reports, ads] = await Promise.all([
                statsModel.countUsers(),
                statsModel.countCompetitions(),
                statsModel.countPendingReports(),
                statsModel.countActiveAds()
            ]);

            const competitionStats = await statsModel.competitionsByStatus();

            const revenueStats = await statsModel.totalRevenue();

            return this.success(c, {
                users: users?.count || 0,
                competitions: competitions?.count || 0,
                pendingReports: reports?.count || 0,
                activeAds: ads?.count || 0,
                competitionsByStatus: competitionStats.results || [],
                totalRevenue: revenueStats?.total || 0
            });
        } catch (error) {
            console.error('Admin stats error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async getUsers(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const limit = this.getQueryInt(c, 'limit') || 50;
            const offset = this.getQueryInt(c, 'offset') || 0;
            const search = this.getQuery(c, 'search');

            const userModel = new UserModel(c.env.DB);
            const users = await userModel.searchForAdmin({ search, limit, offset });

            return this.success(c, { users });
        } catch (error) {
            console.error('Admin get users error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async toggleUserBan(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const admin = this.getCurrentUser(c);
            const userId = this.getParamInt(c, 'id');
            const body = await this.getBody<{ banned: boolean }>(c);

            if (!userId || body?.banned === undefined) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            // T1.4: Prevent self-ban and banning other admins
            if (admin && userId === admin.id) {
                return this.error(c, 'Cannot ban yourself');
            }

            const userModel = new UserModel(c.env.DB);
            const target = await userModel.getBanTarget(userId);
            if (!target) return this.notFound(c);
            if (target.is_admin) return this.error(c, 'Cannot ban an admin');

            // T1.4 FIX (BUG-12): ban alters account status, not the verification badge
            await userModel.setActive(userId, !body.banned);

            // T1.4: When banning, destroy all sessions so the user is logged out everywhere
            let killedSessions = 0;
            if (body.banned) {
                const sessionModel = new SessionModel(c.env.DB);
                killedSessions = await sessionModel.deleteByUser(userId);
            }

            return this.success(c, { banned: body.banned, sessions_destroyed: killedSessions });
        } catch (error) {
            console.error('Admin toggle ban error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async getReports(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const status = this.getQuery(c, 'status') as any || undefined;
            const limit = this.getQueryInt(c, 'limit') || 50;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const reportModel = new ReportModel(c.env.DB);
            const reports = await reportModel.getReports({ status, limit, offset });

            return this.success(c, { reports });
        } catch (error) {
            console.error('Admin get reports error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async reviewReport(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const reportId = this.getParamInt(c, 'id');
            const user = this.getCurrentUser(c);
            const body = await this.getBody<{ status: string; action_taken?: string }>(c);

            if (!reportId || !body?.status) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const reportModel = new ReportModel(c.env.DB);
            await reportModel.reviewReport(reportId, user.id, body.status as any, body.action_taken);

            // T3.4 FIX (BUG-13): actually EXECUTE the moderation action
            // instead of only storing its name as text.
            let actionExecuted: string | null = null;
            if (body.status === 'resolved' && body.action_taken) {
                try {
                    actionExecuted = await this.executeModerationAction(
                        c, reportId, body.action_taken, user.id
                    );
                } catch (actionError) {
                    console.error('Moderation action failed:', actionError);
                    return this.error(c, `Report saved but action failed: ${(actionError as Error).message}`);
                }
            }

            // T3.4: Audit trail for every executed moderation decision
            if (actionExecuted) {
                try {
                    const auditModel = new AdminAuditLogModel(c.env.DB);
                    const report = await new ReportModel(c.env.DB).getTarget(reportId);
                    await auditModel.log(
                        user.id,
                        'report_action:' + body.action_taken,
                        report?.target_type || 'unknown',
                        report?.target_id || 0,
                        `Report #${reportId} resolved with action "${body.action_taken}"`
                    );
                } catch (auditError) {
                    console.error('Audit log failed:', auditError);
                }
            }

            return this.success(c, { reviewed: true, action_executed: actionExecuted });
        } catch (error) {
            console.error('Admin review report error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * T3.4: Execute a moderation action against the report target.
     * Supported actions: ban_user | delete_comment | delete_competition | warn (record-only)
     */
    private async executeModerationAction(
        c: Context<{ Bindings: Bindings; Variables: Variables }>,
        reportId: number,
        action: string,
        adminId: number
    ): Promise<string | null> {
        const db = c.env.DB;
        const report = await new ReportModel(db).getTarget(reportId);

        if (!report) throw new Error('Report not found');
        const { target_type, target_id } = report;

        switch (action) {
            case 'ban_user': {
                // Resolve the offending user: direct target, or author of the content
                const userModel = new UserModel(db);
                let userId: number | null = null;
                if (target_type === 'user') {
                    userId = target_id;
                } else if (target_type === 'comment') {
                    userId = await new CommentModel(db).getAuthorId(target_id);
                } else if (target_type === 'competition') {
                    userId = await new CompetitionModel(db).getCreatorId(target_id);
                }
                if (!userId) throw new Error('Could not resolve user to ban');

                const target = await userModel.getBanTarget(userId);
                if (target?.is_admin) throw new Error('Cannot ban an admin');

                await userModel.setActive(userId, false);
                const sessionModel = new SessionModel(db);
                await sessionModel.deleteByUser(userId);
                return `banned_user:${userId}`;
            }

            case 'delete_comment': {
                if (target_type !== 'comment') throw new Error('Target is not a comment');
                await new CommentModel(db).delete(target_id);
                return `deleted_comment:${target_id}`;
            }

            case 'delete_competition': {
                if (target_type !== 'competition') throw new Error('Target is not a competition');
                await new CompetitionModel(db).deleteCascade(target_id);
                return `deleted_competition:${target_id}`;
            }

            default:
                // warn / no_action / unknown â†’ record-only
                return null;
        }
    }

    async getAds(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const adModel = new AdvertisementModel(c.env.DB);
            const ads = await adModel.findAll({ limit: 100 });

            return this.success(c, { ads });
        } catch (error) {
            console.error('Admin get ads error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async createAd(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const user = this.getCurrentUser(c);
            const body = await this.getBody<{
                title: string;
                image_url?: string;
                link_url?: string;
                revenue_per_view?: number;
                budget_cents?: number;
            }>(c);

            if (!body?.title) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const budgetCents = body.budget_cents ?? 0;
            if (!Number.isInteger(budgetCents) || budgetCents < 0) {
                return this.validationError(c, this.t('ads.invalid_budget', c));
            }

            const adModel = new AdvertisementModel(c.env.DB);
            const ad = await adModel.create({
                title: body.title,
                image_url: body.image_url,
                link_url: body.link_url,
                revenue_per_view: body.revenue_per_view,
                created_by: user.id
            });

            // 0025/0026 carry-over: every row carries BOTH status columns so the
            // admin review workflow can always proceed to pending_review/active.
            const manager = new AdCampaignManager(c.env.DB);
            await manager.registerExternalRow(ad.id, {
                advertiserId: user.id,
                budgetCents,
                costPerImpressionCents: Math.max(1, Math.round((body.revenue_per_view ?? 0.01) * 100)),
                initialStatus: 'draft'
            });

            return this.success(c, { ad: (await adModel.findById(ad.id))! }, 201);
        } catch (error) {
            console.error('Admin create ad error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async updateAd(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const adId = this.getParamInt(c, 'id');
            const body = await this.getBody<Partial<{
                title: string;
                image_url: string;
                link_url: string;
                is_active: number;
                revenue_per_view: number;
            }>>(c);

            if (!adId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const adModel = new AdvertisementModel(c.env.DB);
            const ad = await adModel.update(adId, body || {});

            if (!ad) return this.notFound(c);
            return this.success(c, { ad });
        } catch (error) {
            console.error('Admin update ad error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async deleteAd(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const adId = this.getParamInt(c, 'id');
            if (!adId) {
                return this.validationError(c, this.t('errors.invalid_id', c));
            }

            const adModel = new AdvertisementModel(c.env.DB);
            await adModel.delete(adId);

            return this.success(c, { deleted: true });
        } catch (error) {
            console.error('Admin delete ad error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Ad campaign review (Phase 9.A): pending_review → active
    // =====================================

    async reviewAdCampaign(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const admin = this.getCurrentUser(c);
            const adId = this.getParamInt(c, 'id');
            if (!adId) return this.validationError(c, this.t('errors.invalid_id', c));

            const body = await this.getBody<{ approve?: boolean }>(c);
            if (body?.approve !== true) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const campaignManager = new AdCampaignManager(c.env.DB);
            const ad = await campaignManager.approveCampaign(adId);

            if (!ad) return this.error(c, this.t('ads.invalid_transition', c), 409);

            // F-4: admin campaign review is written to the existing append-only
            // audit trail — who, what, when, which campaign — G4/A record.
            try {
                const auditModel = new AdminAuditLogModel(c.env.DB);
                await auditModel.log(
                    admin?.id ?? 0,
                    'review_ad_campaign',
                    'advertisement',
                    adId,
                    `Approved campaign #${adId} to active`
                );
            } catch (auditError) {
                // Audit must never block the guarded lifecycle outcome — the
                // transition already committed; surface the failure in logs only.
                console.error('Admin review audit write failed:', auditError);
            }

            return this.success(c, { ad });
        } catch (error) {
            console.error('Admin review ad campaign error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Admin Roles (Task 2)
    // =====================================

    async getAdminRoles(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const adminRoleModel = new AdminRoleModel(c.env.DB);
            const roles = await adminRoleModel.getAdminsWithRoles();

            return this.success(c, { roles });
        } catch (error) {
            console.error('Admin get roles error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async grantAdminRole(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const user = this.getCurrentUser(c);
            const body = await this.getBody<{ user_id: number; role: AdminRoleType }>(c);

            if (!body?.user_id || !body?.role) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const adminRoleModel = new AdminRoleModel(c.env.DB);
            const grantorRole = await adminRoleModel.findByUserId(user.id);

            if (!grantorRole || grantorRole.role !== 'SuperAdmin') {
                return this.forbidden(c);
            }

            const existingRole = await adminRoleModel.findByUserId(body.user_id);
            if (existingRole) {
                await adminRoleModel.update(existingRole.id, { role: body.role });
            } else {
                await adminRoleModel.create({
                    user_id: body.user_id,
                    role: body.role,
                    granted_by: user.id
                });
            }

            const auditLogModel = new AdminAuditLogModel(c.env.DB);
            await auditLogModel.log(user.id, 'grant_role', 'user', body.user_id, `Granted role: ${body.role}`);

            return this.success(c, { granted: true });
        } catch (error) {
            console.error('Admin grant role error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async revokeAdminRole(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const user = this.getCurrentUser(c);
            const targetUserId = this.getParamInt(c, 'id');

            const adminRoleModel = new AdminRoleModel(c.env.DB);
            const grantorRole = await adminRoleModel.findByUserId(user.id);

            if (!grantorRole || grantorRole.role !== 'SuperAdmin') {
                return this.forbidden(c);
            }

            await adminRoleModel.deleteByUserId(targetUserId);

            const auditLogModel = new AdminAuditLogModel(c.env.DB);
            await auditLogModel.log(user.id, 'revoke_role', 'user', targetUserId, 'Revoked admin role');

            return this.success(c, { revoked: true });
        } catch (error) {
            console.error('Admin revoke role error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Audit Logs (Task 2)
    // =====================================

    async getAuditLogs(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const actionType = this.getQuery(c, 'action_type') || undefined;
            const limit = this.getQueryInt(c, 'limit') || 50;
            const offset = this.getQueryInt(c, 'offset') || 0;

            const auditLogModel = new AdminAuditLogModel(c.env.DB);
            const logs = await auditLogModel.getLogs({ action_type: actionType, limit, offset });

            return this.success(c, { logs });
        } catch (error) {
            console.error('Admin audit logs error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Platform Settings (Task 2)
    // =====================================

    async getPlatformSettings(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const settingsModel = new PlatformSettingsModel(c.env.DB);
            const settings = await settingsModel.getAllSettings();

            return this.success(c, { settings });
        } catch (error) {
            console.error('Admin get settings error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async updatePlatformSetting(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const user = this.getCurrentUser(c);
            const body = await this.getBody<{ key: string; value: string }>(c);

            if (!body?.key || body?.value === undefined) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const settingsModel = new PlatformSettingsModel(c.env.DB);
            await settingsModel.setByKey(body.key, body.value, user.id);

            const auditLogModel = new AdminAuditLogModel(c.env.DB);
            await auditLogModel.log(user.id, 'update_setting', 'platform_setting', null, `Set ${body.key} = ${body.value}`);

            return this.success(c, { updated: true });
        } catch (error) {
            console.error('Admin update setting error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Arbitration (Task 3)
    // =====================================

    async getArbitrationQueue(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const arbitrationService = new ArbitrationService(c.env.DB);
            const pending = await arbitrationService.getPendingArbitrations();

            return this.success(c, { reports: pending });
        } catch (error) {
            console.error('Admin arbitration queue error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async transitionArbitration(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const user = this.getCurrentUser(c);
            const reportId = this.getParamInt(c, 'id');
            const body = await this.getBody<{ to_state: ArbitrationStatus; notes?: string }>(c);

            if (!reportId || !body?.to_state) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const arbitrationService = new ArbitrationService(c.env.DB);
            const report = await arbitrationService.transitionStatus({
                report_id: reportId,
                from_state: 'submitted',
                to_state: body.to_state,
                admin_id: user.id,
                notes: body.notes
            });

            return this.success(c, { report });
        } catch (error) {
            console.error('Admin arbitration transition error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async assignArbitration(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const reportId = this.getParamInt(c, 'id');
            const body = await this.getBody<{ admin_id: number }>(c);

            if (!reportId || !body?.admin_id) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const arbitrationService = new ArbitrationService(c.env.DB);
            const report = await arbitrationService.assignToAdmin(reportId, body.admin_id);

            return this.success(c, { report });
        } catch (error) {
            console.error('Admin assign arbitration error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Enhanced Dashboard (Task 2)
    // =====================================

    async getEnhancedStats(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const db = c.env.DB;
            const financialModel = new PlatformFinancialLogModel(db);
            const statsModel = new AdminStatsModel(db);

            const [
                users, competitions, pendingReports, activeAds,
                competitionStats, financialSummary, todaySummary
            ] = await Promise.all([
                statsModel.countActiveUsers(),
                statsModel.countCompetitions(),
                statsModel.countArbitrationPending(),
                statsModel.countCampaignActiveAds(),
                statsModel.competitionsByStatus(),
                financialModel.getTotals(),
                financialModel.getTodaySummary()
            ]);

            const demographics = await statsModel.userCountryDemographics();

            const hottestCompetitions = await statsModel.hottestCompetitions();

            return this.success(c, {
                users: users?.count || 0,
                competitions: competitions?.count || 0,
                pendingReports: pendingReports?.count || 0,
                activeAds: activeAds?.count || 0,
                competitionsByStatus: competitionStats.results || [],
                financialSummary,
                todaySummary,
                demographics: demographics.results || [],
                hottestCompetitions: hottestCompetitions.results || []
            });
        } catch (error) {
            console.error('Admin enhanced stats error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =====================================
    // Live Finance (Task 5)
    // =====================================

    async getLivePayoutSnapshot(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const competitionId = this.getParamInt(c, 'id');
            const livePayoutEngine = new LivePayoutEngine(c.env.DB);
            const snapshot = await livePayoutEngine.getLiveSnapshot(competitionId);

            if (!snapshot) return this.notFound(c);
            return this.success(c, { snapshot });
        } catch (error) {
            console.error('Admin live payout error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async finalizePayouts(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const user = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'id');

            const livePayoutEngine = new LivePayoutEngine(c.env.DB);
            const result = await livePayoutEngine.finalizePayouts(competitionId);

            const auditLogModel = new AdminAuditLogModel(c.env.DB);
            await auditLogModel.log(user.id, 'finalize_payouts', 'competition', competitionId, `Finalized payouts: platform=${result.platform_share}, creator=${result.creator_share}, opponent=${result.opponent_share}`);

            return this.success(c, { result });
        } catch (error) {
            console.error('Admin finalize payouts error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =============================================
    // Task 9: Transparent Admin Veto (Suspend Broadcast)
    // المهمة 9: حق النقض الشفاف للإداري - تعليق البث
    // =============================================

    /**
     * POST /api/admin/competitions/:id/suspend
     * Suspend a live/accepted competition (Transparent God Mode Kill Switch).
     *
     * Rules (Task 9):
     *  1. NEVER delete the competition from the DB.
     *  2. Change status to 'suspended' (retains full history).
     *  3. Mark with a tombstone reason viewable publicly in the archive.
     *  4. Log: admin name, role, timestamp, explicit reason â†’ admin_audit_logs.
     *  5. Emit SSE event so all live viewers get instant notification.
     *
     * Body: { reason: string }
     */
    async suspendBroadcast(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const admin         = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'id');
            const body          = await this.getBody<{ reason: string }>(c);

            // Reason is MANDATORY for transparency
            if (!competitionId || !body?.reason?.trim()) {
                return this.validationError(
                    c,
                    this.t('errors.missing_fields', c) +
                    ' — An explicit reason is required for every suspension.'
                );
            }

            const db = c.env.DB;
            const competitionModel = new CompetitionModel(db);

            // Fetch the competition to verify it exists and is live/accepted
            const competition = await competitionModel.getSuspendState(competitionId);

            if (!competition) return this.notFound(c);

            if (['suspended', 'completed', 'cancelled'].includes(competition.status)) {
                return this.error(
                    c,
                    `Competition is already in '${competition.status}' state and cannot be suspended.`,
                    409
                );
            }

            // Fetch admin role for audit clarity
            const adminRoleModel = new AdminRoleModel(db);
            const adminRole      = await adminRoleModel.findByUserId(admin.id);
            const adminRoleName  = adminRole?.role ?? 'Admin';

            // 1. Change status to 'suspended' (NOT deleted)
            await competitionModel.suspend(
                competitionId,
                `[SUSPENDED by ${admin.username ?? admin.display_name} (${adminRoleName})] ${body.reason}`
            );

            // 2. Record in competition_suspensions table
            await competitionModel.recordSuspension(competitionId, admin.id, body.reason);

            // 3. Mandatory audit log â€“ name + role + timestamp + reason
            const auditLogModel = new AdminAuditLogModel(db);
            await auditLogModel.log(
                admin.id,
                'suspend_broadcast',
                'competition',
                competitionId,
                `[${adminRoleName}] ${admin.username ?? admin.display_name} suspended competition "${competition.title}" (ID=${competitionId}). ` +
                `Reason: "${body.reason}". Timestamp: ${new Date().toISOString()}`
            );

            // 4. SSE â€“ push tombstone event to all viewers instantly
            const pusher = new EventPusher(db, c.env);
            await pusher.publishCompetitionSuspended(
                competitionId,
                admin.display_name ?? admin.username,
                body.reason
            );

            return this.success(c, {
                suspended:      true,
                competition_id: competitionId,
                status:         'suspended',
                suspended_by:   { id: admin.id, username: admin.username, role: adminRoleName },
                reason:         body.reason,
                timestamp:      new Date().toISOString()
            });
        } catch (error) {
            console.error('Admin suspendBroadcast error:', error);
            return this.serverError(c, error as Error);
        }
    }

    /**
     * POST /api/admin/competitions/:id/restore
     * Restore a previously suspended competition back to 'archived' status.
     * It remains visible publicly (transparency) but is no longer 'suspended'.
     *
     * Body: { reason: string }
     */
    async restoreBroadcast(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const admin         = this.getCurrentUser(c);
            const competitionId = this.getParamInt(c, 'id');
            const body          = await this.getBody<{ reason: string }>(c);

            if (!competitionId || !body?.reason?.trim()) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const db = c.env.DB;
            const competitionModel = new CompetitionModel(db);

            const competition = await competitionModel.getRestoreState(competitionId);

            if (!competition) return this.notFound(c);
            if (competition.status !== 'suspended') {
                return this.error(c, 'Competition is not in suspended state.', 409);
            }

            // Move to 'archived' â€“ transparent, visible, not live
            await competitionModel.restore(
                competitionId,
                `[RESTORED by ${admin.username ?? admin.display_name}] ${body.reason}`
            );

            // Update suspension record
            await competitionModel.markSuspensionRestored(competitionId, admin.id);

            const auditLogModel = new AdminAuditLogModel(db);
            await auditLogModel.log(
                admin.id, 'restore_broadcast', 'competition', competitionId,
                `Restored competition ID=${competitionId} from suspended â†’ archived. Reason: "${body.reason}"`
            );

            return this.success(c, { restored: true, competition_id: competitionId, status: 'archived' });
        } catch (error) {
            console.error('Admin restoreBroadcast error:', error);
            return this.serverError(c, error as Error);
        }
    }

    // =============================================
    // Task 6: Admin withdrawal management
    // المهمة 6: إدارة طلبات السحب من الإداري
    // =============================================

    /**
     * GET /api/admin/withdrawals
     * List all withdrawal requests (admin).
     */
    async adminListWithdrawals(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        const delegate = new WithdrawalController();
        return delegate.adminListWithdrawals(c);
    }

    /**
     * PUT /api/admin/withdrawals/:id/approve
     * Approve a withdrawal request.
     */
    async adminApproveWithdrawal(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        const delegate = new WithdrawalController();
        return delegate.adminApproveWithdrawal(c);
    }

    /**
     * PUT /api/admin/withdrawals/:id/reject
     * Reject a withdrawal request (refund user).
     */
    async adminRejectWithdrawal(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        const delegate = new WithdrawalController();
        return delegate.adminRejectWithdrawal(c);
    }
}

export default AdminController;
