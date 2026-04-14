import { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL, t } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

export function adminDashboardPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const lang = c.get('lang');
    const tr = translations[getUILanguage(lang)];
    const rtl = isRTL(lang);
    const tt = (key: string) => t(`admin.${key}`, lang);

    const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    <div class="flex-1">
        <div class="container mx-auto px-4 py-8 max-w-7xl">
            <h1 class="text-3xl font-bold mb-8">${tt('dashboard_title')}</h1>

            <div id="adminStats" class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p class="text-gray-500 text-sm">${tt('active_users')}</p>
                    <p class="text-3xl font-bold mt-1" id="statUsers">0</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p class="text-gray-500 text-sm">${tr.competitions}</p>
                    <p class="text-3xl font-bold mt-1" id="statCompetitions">0</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p class="text-gray-500 text-sm">${tt('pending_arbitrations')}</p>
                    <p class="text-3xl font-bold mt-1 text-yellow-500" id="statArbitrations">0</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p class="text-gray-500 text-sm">${tt('active_campaigns')}</p>
                    <p class="text-3xl font-bold mt-1 text-purple-500" id="statCampaigns">0</p>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h2 class="text-xl font-bold mb-4">${tt('financial_summary')}</h2>
                    <div id="financialSummary" class="space-y-3"></div>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h2 class="text-xl font-bold mb-4">${tt('demographics')}</h2>
                    <div id="demographics" class="space-y-2"></div>
                </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h2 class="text-xl font-bold mb-4">${tt('admin_roles')}</h2>
                    <div id="adminRoles" class="space-y-2"></div>
                    <button onclick="showGrantRoleForm()" class="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">${tt('grant_role')}</button>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <h2 class="text-xl font-bold mb-4">${tt('audit_logs')}</h2>
                    <div id="auditLogs" class="space-y-2 max-h-80 overflow-y-auto"></div>
                </div>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h2 class="text-xl font-bold mb-4">${tt('hottest_competitions')}</h2>
                <div id="hottestCompetitions" class="space-y-2"></div>
            </div>

            <div id="grantRoleForm" class="hidden mt-6 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 class="text-lg font-bold mb-4">${tt('grant_role')}</h3>
                <form onsubmit="grantRole(event)" class="flex gap-4 items-end">
                    <div class="flex-1"><label class="block text-sm mb-1">User ID</label><input type="number" id="grantUserId" required class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent" /></div>
                    <div class="flex-1"><label class="block text-sm mb-1">${tt('grant_role')}</label><select id="grantRoleSelect" class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent"><option value="Moderator">${tt('role_moderator')}</option><option value="Auditor">${tt('role_auditor')}</option><option value="SuperAdmin">${tt('role_superadmin')}</option></select></div>
                    <button type="submit" class="px-6 py-2 bg-purple-600 text-white rounded-lg">${tt('grant_role')}</button>
                </form>
            </div>

            <!-- Task 6: Withdrawal Management Queue -->
            <div class="mt-6 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-red-100 dark:border-red-900/50">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold flex items-center gap-2">
                        <i class="fas fa-money-check-alt text-emerald-500"></i>
                        Withdrawal Queue
                        <span id="pendingWithdrawCount" class="ml-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">0</span>
                    </h2>
                    <select id="withdrawFilterStatus" onchange="loadWithdrawals()" class="px-3 py-1.5 text-sm rounded-lg border dark:border-gray-600 bg-transparent">
                        <option value="">All</option>
                        <option value="pending" selected>Pending</option>
                        <option value="completed">Completed</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </div>
                <div id="withdrawQueueList" class="space-y-3 max-h-96 overflow-y-auto"></div>
            </div>

            <!-- Approve Modal -->
            <div id="approveModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
                    <h3 class="text-lg font-bold mb-4 text-emerald-600"><i class="fas fa-check-circle mr-2"></i>Approve Withdrawal</h3>
                    <input type="hidden" id="approveWrId" />
                    <label class="block text-sm mb-1 font-medium">Transaction ID *</label>
                    <input type="text" id="approveTxnId" placeholder="TXN-20260414-XXXXX" class="w-full px-4 py-2 border dark:border-gray-600 rounded-xl bg-transparent mb-3" />
                    <label class="block text-sm mb-1 font-medium">Note (optional)</label>
                    <input type="text" id="approveNote" placeholder="Payment sent via bank transfer" class="w-full px-4 py-2 border dark:border-gray-600 rounded-xl bg-transparent mb-4" />
                    <div class="flex gap-3">
                        <button onclick="document.getElementById('approveModal').classList.add('hidden')" class="flex-1 py-2 border dark:border-gray-600 rounded-xl text-sm">Cancel</button>
                        <button onclick="confirmApprove()" class="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold">Confirm Approve</button>
                    </div>
                </div>
            </div>

            <!-- Reject Modal -->
            <div id="rejectModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl">
                    <h3 class="text-lg font-bold mb-4 text-red-600"><i class="fas fa-times-circle mr-2"></i>Reject Withdrawal</h3>
                    <input type="hidden" id="rejectWrId" />
                    <label class="block text-sm mb-1 font-medium">Reason for rejection *</label>
                    <textarea id="rejectReason" rows="3" placeholder="Please provide a clear reason..." class="w-full px-4 py-2 border dark:border-gray-600 rounded-xl bg-transparent mb-4 resize-none"></textarea>
                    <div class="flex gap-3">
                        <button onclick="document.getElementById('rejectModal').classList.add('hidden')" class="flex-1 py-2 border dark:border-gray-600 rounded-xl text-sm">Cancel</button>
                        <button onclick="confirmReject()" class="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-bold">Confirm Reject</button>
                    </div>
                </div>
            </div>

            <!-- Task 9: Transparent Admin Veto – Suspend Broadcast -->
            <div class="mt-6 bg-gradient-to-br from-red-950/40 to-red-900/20 rounded-2xl p-6 shadow-sm border border-red-900/50">
                <h2 class="text-xl font-bold mb-1 flex items-center gap-2 text-red-400">
                    <i class="fas fa-ban"></i>
                    Transparent Admin Veto (Kill Switch)
                </h2>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4">
                    Suspend a live or accepted competition. <strong>Competition is NEVER deleted</strong> – it remains in the archive with a tombstone marker for full public transparency.
                </p>
                <div class="flex gap-3 items-start">
                    <div class="flex-1 space-y-3">
                        <div>
                            <label class="block text-sm font-semibold mb-1">Competition ID *</label>
                            <input type="number" id="suspendCompId" placeholder="42" class="w-full px-4 py-2 border border-red-900/50 dark:border-red-800 rounded-xl bg-transparent" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-1">Explicit Reason (required by transparency policy) *</label>
                            <textarea id="suspendReason" rows="2" placeholder="Describe the rule violation clearly..." class="w-full px-4 py-2 border border-red-900/50 dark:border-red-800 rounded-xl bg-transparent resize-none"></textarea>
                        </div>
                        <div id="suspendError" class="hidden p-2 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm rounded-lg"></div>
                        <button onclick="suspendBroadcast()" class="w-full py-3 bg-gradient-to-r from-red-600 to-red-800 text-white rounded-xl font-bold hover:opacity-90 transition-all">
                            <i class="fas fa-ban mr-2"></i> Execute Transparent Suspension
                        </button>
                    </div>
                    <div class="flex-1 space-y-3">
                        <div>
                            <label class="block text-sm font-semibold mb-1">Restore Competition ID</label>
                            <input type="number" id="restoreCompId" placeholder="42" class="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-transparent" />
                        </div>
                        <div>
                            <label class="block text-sm font-semibold mb-1">Restore Reason *</label>
                            <textarea id="restoreReason" rows="2" placeholder="Why is this competition being restored?" class="w-full px-4 py-2 border border-gray-300 dark:border-gray-700 rounded-xl bg-transparent resize-none"></textarea>
                        </div>
                        <button onclick="restoreBroadcast()" class="w-full py-3 bg-gradient-to-r from-green-600 to-teal-700 text-white rounded-xl font-bold hover:opacity-90 transition-all">
                            <i class="fas fa-undo mr-2"></i> Restore to Archive
                        </button>
                    </div>
                </div>
            </div>

        </div>
    </div>
    ${getFooter(lang)}
    <script>
        const token = localStorage.getItem('session_id');

        async function loadAdminDashboard() {
            try {
                if (!token) return;
                const res = await fetch('/api/admin/enhanced-stats', { headers: { 'Authorization': 'Bearer ' + token } });
                const data = await res.json();
                if (data.success) {
                    const d = data.data;
                    document.getElementById('statUsers').textContent = d.users || 0;
                    document.getElementById('statCompetitions').textContent = d.competitions || 0;
                    document.getElementById('statArbitrations').textContent = d.pendingReports || 0;
                    document.getElementById('statCampaigns').textContent = d.activeAds || 0;
                    if (d.financialSummary) {
                        document.getElementById('financialSummary').innerHTML = '<div class="flex justify-between"><span>${t("transparency.kpi_total_revenue", lang)}</span><span class="font-bold">$' + (d.financialSummary.total_ad_revenue || 0).toFixed(2) + '</span></div><div class="flex justify-between"><span>${t("transparency.kpi_platform_share", lang)}</span><span class="font-bold">$' + (d.financialSummary.total_platform_share || 0).toFixed(2) + '</span></div><div class="flex justify-between"><span>${t("transparency.kpi_competitors_paid", lang)}</span><span class="font-bold">$' + (d.financialSummary.total_competitor_payouts || 0).toFixed(2) + '</span></div><div class="flex justify-between"><span>${t("transparency.kpi_operating_costs", lang)}</span><span class="font-bold">$' + (d.financialSummary.total_operating_costs || 0).toFixed(2) + '</span></div>';
                    }
                    if (d.demographics) {
                        document.getElementById('demographics').innerHTML = d.demographics.map(dm => '<div class="flex justify-between text-sm"><span>' + dm.country + '</span><span class="font-bold">' + dm.count + '</span></div>').join('');
                    }
                    if (d.hottestCompetitions) {
                        document.getElementById('hottestCompetitions').innerHTML = d.hottestCompetitions.map(c => '<div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-xl"><div><span class="font-bold">' + c.title + '</span><span class="text-sm text-gray-500 ml-2">' + c.status + '</span></div><div class="flex items-center gap-2"><span class="text-sm text-gray-500">' + c.total_views + ' ${tr.viewers}</span><button onclick="openSuspendPanel(' + c.id + ')" class="text-xs text-red-500 hover:text-red-700 font-bold"><i class="fas fa-ban"></i></button></div></div>').join('');
                    }
                }
                const rolesRes = await fetch('/api/admin/roles', { headers: { 'Authorization': 'Bearer ' + token } });
                const rolesData = await rolesRes.json();
                if (rolesData.success && rolesData.data.roles) {
                    document.getElementById('adminRoles').innerHTML = rolesData.data.roles.map(r => '<div class="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"><span>' + r.display_name + ' (' + r.username + ')</span><div class="flex items-center gap-2"><span class="px-2 py-1 rounded-full text-xs font-bold ' + (r.role === 'SuperAdmin' ? 'bg-red-100 text-red-700' : r.role === 'Auditor' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700') + '">' + r.role + '</span><button onclick="revokeRole(' + r.user_id + ')" class="text-red-500 text-xs">${tt('revoke_role')}</button></div></div>').join('');
                }
                const logsRes = await fetch('/api/admin/audit-logs?limit=10', { headers: { 'Authorization': 'Bearer ' + token } });
                const logsData = await logsRes.json();
                if (logsData.success && logsData.data.logs) {
                    document.getElementById('auditLogs').innerHTML = logsData.data.logs.map(l => '<div class="p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm"><div class="flex justify-between"><span class="font-bold">' + l.admin_username + '</span><span class="text-gray-500">' + new Date(l.timestamp).toLocaleString() + '</span></div><p class="text-gray-600 dark:text-gray-400 truncate">' + l.action_type + ' → ' + l.target_entity + (l.target_id ? ' #' + l.target_id : '') + '</p>' + (l.details ? '<p class="text-xs text-gray-400 truncate">' + l.details + '</p>' : '') + '</div>').join('');
                }
            } catch(e) { console.error(e); }
        }

        // ============================
        // Task 6: Withdrawal Queue
        // ============================
        async function loadWithdrawals() {
            const status = document.getElementById('withdrawFilterStatus').value;
            const url = '/api/admin/withdrawals' + (status ? '?status=' + status : '');
            const res = await fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
            const data = await res.json();
            if (!data.success) return;
            const list = data.data.requests || [];
            const pending = data.data.pendingCount || 0;
            document.getElementById('pendingWithdrawCount').textContent = pending;
            document.getElementById('withdrawQueueList').innerHTML = list.length === 0
                ? '<p class="text-center text-gray-400 py-4">No withdrawal requests.</p>'
                : list.map(r => {
                    const statusColor = { pending: 'text-amber-500', processing: 'text-blue-500', completed: 'text-emerald-500', rejected: 'text-red-500' }[r.status] || '';
                    return '<div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">' +
                        '<div><p class="font-bold text-base">$' + parseFloat(r.amount).toFixed(2) + ' <span class="text-xs text-gray-400">· ' + r.payment_method + '</span></p>' +
                        '<p class="text-xs text-gray-500">' + (r.display_name || r.username) + ' · ' + new Date(r.created_at).toLocaleDateString() + '</p>' +
                        (r.payment_details ? '<p class="text-xs text-gray-400 truncate max-w-xs">' + r.payment_details + '</p>' : '') + '</div>' +
                        '<div class="flex items-center gap-2">' +
                        '<span class="font-bold text-sm ' + statusColor + ' capitalize">' + r.status + '</span>' +
                        (r.status === 'pending' ?
                            '<button onclick="openApproveModal(' + r.id + ')" class="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">Approve</button>' +
                            '<button onclick="openRejectModal(' + r.id + ')" class="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700">Reject</button>'
                            : '') +
                        '</div></div>';
                }).join('');
        }

        function openApproveModal(id) {
            document.getElementById('approveWrId').value = id;
            document.getElementById('approveTxnId').value = '';
            document.getElementById('approveNote').value = '';
            document.getElementById('approveModal').classList.remove('hidden');
        }

        async function confirmApprove() {
            const id  = document.getElementById('approveWrId').value;
            const txn = document.getElementById('approveTxnId').value.trim();
            if (!txn) { alert('Transaction ID is required.'); return; }
            const res = await fetch('/api/admin/withdrawals/' + id + '/approve', {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ transaction_id: txn, note: document.getElementById('approveNote').value.trim() })
            });
            const data = await res.json();
            document.getElementById('approveModal').classList.add('hidden');
            if (data.success) { showAdminToast('✅ Withdrawal approved!', 'success'); loadWithdrawals(); }
            else showAdminToast('Error: ' + (data.error || 'Unknown error'), 'error');
        }

        function openRejectModal(id) {
            document.getElementById('rejectWrId').value = id;
            document.getElementById('rejectReason').value = '';
            document.getElementById('rejectModal').classList.remove('hidden');
        }

        async function confirmReject() {
            const id     = document.getElementById('rejectWrId').value;
            const reason = document.getElementById('rejectReason').value.trim();
            if (!reason) { alert('Rejection reason is required.'); return; }
            const res = await fetch('/api/admin/withdrawals/' + id + '/reject', {
                method: 'PUT',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            const data = await res.json();
            document.getElementById('rejectModal').classList.add('hidden');
            if (data.success) { showAdminToast('Withdrawal rejected and funds refunded.', 'info'); loadWithdrawals(); }
            else showAdminToast('Error: ' + (data.error || 'Unknown error'), 'error');
        }

        // ============================
        // Task 9: Transparent Veto
        // ============================
        function openSuspendPanel(competitionId) {
            document.getElementById('suspendCompId').value = competitionId;
            document.getElementById('suspendCompId').scrollIntoView({ behavior: 'smooth' });
        }

        async function suspendBroadcast() {
            const compId = document.getElementById('suspendCompId').value;
            const reason = document.getElementById('suspendReason').value.trim();
            const errDiv = document.getElementById('suspendError');
            errDiv.classList.add('hidden');
            if (!compId) { errDiv.textContent = 'Competition ID is required.'; errDiv.classList.remove('hidden'); return; }
            if (!reason) { errDiv.textContent = 'An explicit reason is mandatory for transparency.'; errDiv.classList.remove('hidden'); return; }
            if (!confirm('You are about to SUSPEND competition #' + compId + '.\n\nThis will:\n• Change status to SUSPENDED (NOT deleted)\n• Remain visible in archive with tombstone\n• Log your name, role, and reason\n• Instantly notify all live viewers\n\nReason: ' + reason + '\n\nProceed?')) return;
            const res = await fetch('/api/admin/competitions/' + compId + '/suspend', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            const data = await res.json();
            if (data.success) {
                showAdminToast('🚫 Competition #' + compId + ' suspended. Logged to admin_audit_logs.', 'warning');
                document.getElementById('suspendCompId').value = '';
                document.getElementById('suspendReason').value = '';
                loadAdminDashboard();
            } else {
                errDiv.textContent = data.error || 'Failed to suspend competition.';
                errDiv.classList.remove('hidden');
            }
        }

        async function restoreBroadcast() {
            const compId = document.getElementById('restoreCompId').value;
            const reason = document.getElementById('restoreReason').value.trim();
            if (!compId || !reason) { alert('Competition ID and reason are required.'); return; }
            const res = await fetch('/api/admin/competitions/' + compId + '/restore', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason })
            });
            const data = await res.json();
            if (data.success) {
                showAdminToast('✅ Competition #' + compId + ' restored to archived status.', 'success');
                document.getElementById('restoreCompId').value = '';
                document.getElementById('restoreReason').value = '';
                loadAdminDashboard();
            } else {
                alert('Error: ' + (data.error || 'Unknown'));
            }
        }

        function showAdminToast(message, type) {
            const colors = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-blue-600', warning: 'bg-amber-600' };
            const t = document.createElement('div');
            t.className = 'fixed top-6 right-6 z-[9999] px-5 py-3 ' + (colors[type] || colors.info) + ' text-white rounded-xl shadow-xl text-sm font-medium translate-y-0 opacity-100 transition-all duration-300';
            t.textContent = message;
            document.body.appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 4000);
        }

        function showGrantRoleForm() { document.getElementById('grantRoleForm').classList.toggle('hidden'); }
        async function grantRole(e) {
            e.preventDefault();
            await fetch('/api/admin/roles', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify({ user_id: parseInt(document.getElementById('grantUserId').value), role: document.getElementById('grantRoleSelect').value }) });
            loadAdminDashboard();
        }
        async function revokeRole(userId) {
            await fetch('/api/admin/roles/' + userId, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
            loadAdminDashboard();
        }

        loadAdminDashboard();
        loadWithdrawals();
    </script>`;

    return c.html(generateHTML(content, lang, tt('dashboard_title')));
}
