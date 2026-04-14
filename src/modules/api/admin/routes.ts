import { Hono } from 'hono';
import { Bindings, Variables } from '../../../config/types';
import { AdminController } from '../../../controllers/AdminController';

const adminRoutes = new Hono<{ Bindings: Bindings; Variables: Variables }>();
const controller = new AdminController();

// =====================================
// Dashboard
// =====================================

adminRoutes.get('/stats', async (c) => controller.getStats(c));
adminRoutes.get('/enhanced-stats', async (c) => controller.getEnhancedStats(c));

// =====================================
// Users
// =====================================

adminRoutes.get('/users', async (c) => controller.getUsers(c));
adminRoutes.put('/users/:id/ban', async (c) => controller.toggleUserBan(c));

// =====================================
// Admin Roles (Task 2)
// =====================================

adminRoutes.get('/roles', async (c) => controller.getAdminRoles(c));
adminRoutes.post('/roles', async (c) => controller.grantAdminRole(c));
adminRoutes.delete('/roles/:id', async (c) => controller.revokeAdminRole(c));

// =====================================
// Audit Logs (Task 2)
// =====================================

adminRoutes.get('/audit-logs', async (c) => controller.getAuditLogs(c));

// =====================================
// Platform Settings (Task 2)
// =====================================

adminRoutes.get('/settings', async (c) => controller.getPlatformSettings(c));
adminRoutes.put('/settings', async (c) => controller.updatePlatformSetting(c));

// =====================================
// Reports
// =====================================

adminRoutes.get('/reports', async (c) => controller.getReports(c));
adminRoutes.put('/reports/:id', async (c) => controller.reviewReport(c));

// =====================================
// Arbitration (Task 3)
// =====================================

adminRoutes.get('/arbitrations', async (c) => controller.getArbitrationQueue(c));
adminRoutes.put('/arbitrations/:id/transition', async (c) => controller.transitionArbitration(c));
adminRoutes.put('/arbitrations/:id/assign', async (c) => controller.assignArbitration(c));

// =====================================
// Advertisements
// =====================================

adminRoutes.get('/ads', async (c) => controller.getAds(c));
adminRoutes.post('/ads', async (c) => controller.createAd(c));
adminRoutes.put('/ads/:id', async (c) => controller.updateAd(c));
adminRoutes.delete('/ads/:id', async (c) => controller.deleteAd(c));

// =====================================
// Live Finance (Task 5)
// =====================================

adminRoutes.get('/live-finance/:id', async (c) => controller.getLivePayoutSnapshot(c));
adminRoutes.post('/live-finance/:id/finalize', async (c) => controller.finalizePayouts(c));

// =====================================
// Task 9: Transparent Admin Veto (Suspend / Restore Broadcast)
// المهمة 9: تعليق/استعادة البث الإداري
// =====================================

adminRoutes.post('/competitions/:id/suspend', async (c) => controller.suspendBroadcast(c));
adminRoutes.post('/competitions/:id/restore', async (c) => controller.restoreBroadcast(c));

// =====================================
// Task 6: Withdrawal Management
// المهمة 6: إدارة طلبات السحب
// =====================================

adminRoutes.get('/withdrawals', async (c) => controller.adminListWithdrawals(c));
adminRoutes.put('/withdrawals/:id/approve', async (c) => controller.adminApproveWithdrawal(c));
adminRoutes.put('/withdrawals/:id/reject', async (c) => controller.adminRejectWithdrawal(c));

export default adminRoutes;
