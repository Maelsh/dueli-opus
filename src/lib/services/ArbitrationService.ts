import { ReportModel, Report, ReportStatus } from '../../models/ReportModel';
import { AdminAuditLogModel } from '../../models/AdminAuditLogModel';
import { AdminRoleModel, AdminRoleType } from '../../models/AdminRoleModel';

export type ArbitrationStatus = 'submitted' | 'under_review' | 'investigation' | 'resolved' | 'rejected';

export const VALID_TRANSITIONS: Record<ArbitrationStatus, ArbitrationStatus[]> = {
    submitted: ['under_review', 'rejected'],
    under_review: ['investigation', 'resolved', 'rejected', 'submitted'],
    investigation: ['resolved', 'rejected', 'under_review'],
    resolved: [],
    rejected: []
};

export interface ArbitrationTransition {
    report_id: number;
    from_state: ArbitrationStatus;
    to_state: ArbitrationStatus;
    admin_id: number;
    notes?: string;
}

export interface ComplaintTracker {
    report: Report;
    current_status: ArbitrationStatus;
    assigned_admin_role: string | null;
    state_history: {
        from_state: string;
        to_state: string;
        admin_role: string | null;
        notes: string | null;
        created_at: string;
    }[];
}

export class ArbitrationService {
    private reportModel: ReportModel;
    private auditLogModel: AdminAuditLogModel;
    private adminRoleModel: AdminRoleModel;
    private db: D1Database;

    constructor(db: D1Database) {
        this.db = db;
        this.reportModel = new ReportModel(db);
        this.auditLogModel = new AdminAuditLogModel(db);
        this.adminRoleModel = new AdminRoleModel(db);
    }

    async submitComplaint(data: {
        reporter_id: number;
        target_type: 'user' | 'competition' | 'comment';
        target_id: number;
        reason: string;
        description?: string;
    }): Promise<Report> {
        const report = await this.reportModel.createReport({
            reporter_id: data.reporter_id,
            target_type: data.target_type,
            target_id: data.target_id,
            reason: data.reason,
            description: data.description
        });

        if (report) {
            await this.db.prepare(`
                UPDATE reports SET arbitration_status = 'submitted' WHERE id = ?
            `).bind(report.id).run();
        }

        return report!;
    }

    async transitionStatus(transition: ArbitrationTransition): Promise<Report | null> {
        const report = await this.reportModel.findById(transition.report_id);
        if (!report) return null;

        const currentStatus = (report as any).arbitration_status || 'submitted';
        const fromState = currentStatus as ArbitrationStatus;
        const toState = transition.to_state;

        const allowedTransitions = VALID_TRANSITIONS[fromState];
        if (!allowedTransitions.includes(toState)) {
            throw new Error(`Invalid state transition: ${fromState} -> ${toState}`);
        }

        const adminRole = await this.adminRoleModel.findByUserId(transition.admin_id);
        if (!adminRole) {
            throw new Error('User does not have admin privileges');
        }

        await this.db.prepare(`
            UPDATE reports SET
                arbitration_status = ?,
                assigned_admin_id = ?,
                arbitration_notes = ?,
                status = ?
            WHERE id = ?
        `).bind(
            toState,
            transition.admin_id,
            transition.notes || null,
            this.mapArbitrationToReportStatus(toState),
            transition.report_id
        ).run();

        await this.db.prepare(`
            INSERT INTO report_state_transitions (report_id, from_state, to_state, admin_id, notes)
            VALUES (?, ?, ?, ?, ?)
        `).bind(
            transition.report_id,
            fromState,
            toState,
            transition.admin_id,
            transition.notes || null
        ).run();

        await this.auditLogModel.log(
            transition.admin_id,
            `arbitration_${toState}`,
            'report',
            transition.report_id,
            `State changed: ${fromState} -> ${toState}${transition.notes ? `. Notes: ${transition.notes}` : ''}`
        );

        if (toState === 'resolved' || toState === 'rejected') {
            await this.db.prepare(`
                UPDATE reports SET resolved_at = datetime('now'), resolution_reason = ? WHERE id = ?
            `).bind(transition.notes || toState, transition.report_id).run();

            const reportForReview = await this.reportModel.findById(transition.report_id);
            if (reportForReview) {
                await this.reportModel.reviewReport(
                    transition.report_id,
                    transition.admin_id,
                    this.mapArbitrationToReportStatus(toState),
                    transition.notes
                );
            }
        }

        return this.reportModel.findById(transition.report_id);
    }

    async assignToAdmin(reportId: number, adminId: number): Promise<Report | null> {
        const adminRole = await this.adminRoleModel.findByUserId(adminId);
        if (!adminRole) throw new Error('Target user is not an admin');

        const report = await this.reportModel.findById(reportId);
        if (!report) return null;

        const currentStatus = (report as any).arbitration_status || 'submitted';

        await this.db.prepare(`
            UPDATE reports SET assigned_admin_id = ?, arbitration_status = 'under_review' WHERE id = ?
        `).bind(adminId, reportId).run();

        await this.db.prepare(`
            INSERT INTO report_state_transitions (report_id, from_state, to_state, admin_id, notes)
            VALUES (?, ?, 'under_review', ?, 'Assigned to admin')
        `).bind(reportId, currentStatus, adminId).run();

        await this.auditLogModel.log(
            adminId,
            'arbitration_assigned',
            'report',
            reportId,
            `Report assigned to admin (role: ${adminRole.role})`
        );

        return this.reportModel.findById(reportId);
    }

    async getComplaintTracker(reportId: number): Promise<ComplaintTracker | null> {
        const report = await this.reportModel.findById(reportId);
        if (!report) return null;

        let assignedAdminRole: string | null = null;
        if ((report as any).assigned_admin_id) {
            const role = await this.adminRoleModel.findByUserId((report as any).assigned_admin_id);
            assignedAdminRole = role?.role || null;
        }

        const stateHistory = await this.db.prepare(`
            SELECT rst.from_state, rst.to_state, rst.notes, rst.created_at,
                   ar.role as admin_role
            FROM report_state_transitions rst
            LEFT JOIN admin_roles ar ON rst.admin_id = ar.user_id
            WHERE rst.report_id = ?
            ORDER BY rst.created_at ASC
        `).bind(reportId).all<{
            from_state: string;
            to_state: string;
            notes: string | null;
            created_at: string;
            admin_role: string | null;
        }>();

        return {
            report,
            current_status: ((report as any).arbitration_status || 'submitted') as ArbitrationStatus,
            assigned_admin_role: assignedAdminRole,
            state_history: (stateHistory.results || []).map(r => ({
                from_state: r.from_state,
                to_state: r.to_state,
                admin_role: r.admin_role,
                notes: r.notes,
                created_at: r.created_at
            }))
        };
    }

    async getUserComplaints(reporterId: number, limit: number = 20, offset: number = 0): Promise<ComplaintTracker[]> {
        const reports = await this.reportModel.findBy('reporter_id', reporterId, { limit, offset });
        const trackers: ComplaintTracker[] = [];

        for (const report of reports) {
            const tracker = await this.getComplaintTracker(report.id);
            if (tracker) trackers.push(tracker);
        }

        return trackers;
    }

    async getPendingArbitrations(limit: number = 50, offset: number = 0): Promise<Report[]> {
        const result = await this.db.prepare(`
            SELECT * FROM reports
            WHERE arbitration_status IN ('submitted', 'under_review', 'investigation')
            ORDER BY created_at ASC
            LIMIT ? OFFSET ?
        `).bind(limit, offset).all<Report>();
        return result.results || [];
    }

    private mapArbitrationToReportStatus(arbStatus: ArbitrationStatus): ReportStatus {
        switch (arbStatus) {
            case 'resolved': return 'resolved';
            case 'rejected': return 'dismissed';
            case 'under_review':
            case 'investigation': return 'reviewed';
            default: return 'pending';
        }
    }
}

export default ArbitrationService;
