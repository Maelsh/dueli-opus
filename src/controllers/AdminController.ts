import { Context } from 'hono';
import { Bindings, Variables } from '../config/types';
import { BaseController } from './base/BaseController';
import { UserModel } from '../models/UserModel';
import { CompetitionModel } from '../models/CompetitionModel';
import { ReportModel } from '../models/ReportModel';
import { AdvertisementModel, EarningsModel } from '../models/AdvertisementModel';
import { AdminRoleModel, AdminRoleType } from '../models/AdminRoleModel';
import { AdminAuditLogModel } from '../models/AdminAuditLogModel';
import { PlatformSettingsModel } from '../models/PlatformSettingsModel';
import { PlatformFinancialLogModel } from '../models/PlatformFinancialLogModel';
import { ArbitrationService, ArbitrationStatus } from '../lib/services/ArbitrationService';
import { LivePayoutEngine } from '../lib/services/LivePayoutEngine';
import { EventPusher } from '../lib/services/EventPusher';
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

            const [users, competitions, reports, ads] = await Promise.all([
                db.prepare('SELECT COUNT(*) as count FROM users').first<{ count: number }>(),
                db.prepare('SELECT COUNT(*) as count FROM competitions').first<{ count: number }>(),
                db.prepare('SELECT COUNT(*) as count FROM reports WHERE status = ?').bind('pending').first<{ count: number }>(),
                db.prepare('SELECT COUNT(*) as count FROM advertisements WHERE is_active = 1').first<{ count: number }>()
            ]);

            const competitionStats = await db.prepare(`
                SELECT status, COUNT(*) as count FROM competitions GROUP BY status
            `).all<{ status: string; count: number }>();

            const revenueStats = await db.prepare(`
                SELECT SUM(amount) as total FROM user_earnings
            `).first<{ total: number | null }>();

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

            let query = `
                SELECT id, username, display_name, email, avatar_url, is_verified, is_admin,
                       total_competitions, average_rating, created_at
                FROM users
            `;
            const params: any[] = [];

            if (search) {
                query += ` WHERE username LIKE ? OR email LIKE ? OR display_name LIKE ?`;
                params.push(`%${search}%`, `%${search}%`, `%${search}%`);
            }

            query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
            params.push(limit, offset);

            const result = await c.env.DB.prepare(query).bind(...params).all();

            return this.success(c, { users: result.results || [] });
        } catch (error) {
            console.error('Admin get users error:', error);
            return this.serverError(c, error as Error);
        }
    }

    async toggleUserBan(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
        try {
            if (!await this.isAdmin(c)) return this.forbidden(c);

            const userId = this.getParamInt(c, 'id');
            const body = await this.getBody<{ banned: boolean }>(c);

            if (!userId || body?.banned === undefined) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            await c.env.DB.prepare(`
                UPDATE users SET is_verified = ? WHERE id = ?
            `).bind(body.banned ? 0 : 1, userId).run();

            return this.success(c, { banned: body.banned });
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

            return this.success(c, { reviewed: true });
        } catch (error) {
            console.error('Admin review report error:', error);
            return this.serverError(c, error as Error);
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
            }>(c);

            if (!body?.title) {
                return this.validationError(c, this.t('errors.missing_fields', c));
            }

            const adModel = new AdvertisementModel(c.env.DB);
            const ad = await adModel.create({
                title: body.title,
                image_url: body.image_url,
                link_url: body.link_url,
                revenue_per_view: body.revenue_per_view,
                created_by: user.id
            });

            return this.success(c, { ad }, 201);
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

            const [
                users, competitions, pendingReports, activeAds,
                competitionStats, financialSummary, todaySummary
            ] = await Promise.all([
                db.prepare('SELECT COUNT(*) as count FROM users WHERE is_active = 1').first<{ count: number }>(),
                db.prepare('SELECT COUNT(*) as count FROM competitions').first<{ count: number }>(),
                db.prepare("SELECT COUNT(*) as count FROM reports WHERE arbitration_status IN ('submitted', 'under_review', 'investigation')").first<{ count: number }>(),
                db.prepare("SELECT COUNT(*) as count FROM advertisements WHERE campaign_status = 'active'").first<{ count: number }>(),
                db.prepare('SELECT status, COUNT(*) as count FROM competitions GROUP BY status').all<{ status: string; count: number }>(),
                financialModel.getTotals(),
                financialModel.getTodaySummary()
            ]);

            const demographics = await db.prepare(`
                SELECT country, COUNT(*) as count FROM users WHERE is_active = 1 GROUP BY country ORDER BY count DESC LIMIT 10
            `).all<{ country: string; count: number }>();

            const hottestCompetitions = await db.prepare(`
                SELECT c.id, c.title, c.status, c.total_views, c.creator_rating, c.opponent_rating,
                       cr.display_name as creator_name, op.display_name as opponent_name
                FROM competitions c
                LEFT JOIN users cr ON c.creator_id = cr.id
                LEFT JOIN users op ON c.opponent_id = op.id
                WHERE c.status IN ('live', 'accepted')
                ORDER BY c.total_views DESC LIMIT 5
            `).all();

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
     *  4. Log: admin name, role, timestamp, explicit reason → admin_audit_logs.
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
                    ' – An explicit reason is required for every suspension.'
                );
            }

            const db = c.env.DB;

            // Fetch the competition to verify it exists and is live/accepted
            const competition = await db.prepare(
                `SELECT id, title, status, creator_id, opponent_id FROM competitions WHERE id = ?`
            ).bind(competitionId).first<{
                id: number; title: string; status: string;
                creator_id: number; opponent_id: number | null;
            }>();

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
            await db.prepare(`
                UPDATE competitions
                SET status = 'suspended',
                    auto_deleted_reason = ?,
                    updated_at = datetime('now')
                WHERE id = ?
            `).bind(
                `[SUSPENDED by ${admin.username ?? admin.display_name} (${adminRoleName})] ${body.reason}`,
                competitionId
            ).run();

            // 2. Record in competition_suspensions table
            await db.prepare(`
                INSERT INTO competition_suspensions (competition_id, admin_id, reason)
                VALUES (?, ?, ?)
            `).bind(competitionId, admin.id, body.reason).run();

            // 3. Mandatory audit log – name + role + timestamp + reason
            const auditLogModel = new AdminAuditLogModel(db);
            await auditLogModel.log(
                admin.id,
                'suspend_broadcast',
                'competition',
                competitionId,
                `[${adminRoleName}] ${admin.username ?? admin.display_name} suspended competition "${competition.title}" (ID=${competitionId}). ` +
                `Reason: "${body.reason}". Timestamp: ${new Date().toISOString()}`
            );

            // 4. SSE – push tombstone event to all viewers instantly
            const pusher = new EventPusher(db);
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

            const competition = await db.prepare(
                `SELECT id, status FROM competitions WHERE id = ?`
            ).bind(competitionId).first<{ id: number; status: string }>();

            if (!competition) return this.notFound(c);
            if (competition.status !== 'suspended') {
                return this.error(c, 'Competition is not in suspended state.', 409);
            }

            // Move to 'archived' – transparent, visible, not live
            await db.prepare(`
                UPDATE competitions
                SET status = 'archived',
                    auto_deleted_reason = ?,
                    updated_at = datetime('now')
                WHERE id = ?
            `).bind(`[RESTORED by ${admin.username ?? admin.display_name}] ${body.reason}`, competitionId).run();

            // Update suspension record
            await db.prepare(`
                UPDATE competition_suspensions
                SET restored_at = datetime('now'), restored_by = ?
                WHERE competition_id = ? AND restored_at IS NULL
            `).bind(admin.id, competitionId).run();

            const auditLogModel = new AdminAuditLogModel(db);
            await auditLogModel.log(
                admin.id, 'restore_broadcast', 'competition', competitionId,
                `Restored competition ID=${competitionId} from suspended → archived. Reason: "${body.reason}"`
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
