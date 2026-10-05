import { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL, t } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';
import { SessionModel } from '../../models/SessionModel';

export async function adminDashboardPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const lang = c.get('lang');
    const tr = translations[getUILanguage(lang)];
    const rtl = isRTL(lang);
    const tt = (key: string) => t(`admin.${key}`, lang);
    const nonce = (c.get('cspNonce') as string) ?? '';

    // R2-A: server-side gate. Cookie/Bearer sessions are checked here and
    // non-admins get an immediate 403 (no dashboard shell, no API probing
    // needed). The admin API stays authoritative; the client boot-check
    // below covers cookie-less (localStorage-only) sessions the same way.
    const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')
        || getCookie(c, 'sessionId');
    if (sessionId) {
        try {
            const session = await new SessionModel(c.env.DB).findValidSession(sessionId);
            if (session?.user && session.user.is_admin !== 1) {
                const denied = `
                ${getNavigation(lang)}
                <div class="flex-1"><div class="container mx-auto px-4 py-16 max-w-xl text-center">
                    <i class="fas fa-shield-alt text-6xl text-red-400 mb-4"></i>
                    <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-2">403</h1>
                    <p class="text-gray-500 dark:text-gray-400">${tt('access_denied')}</p>
                    <a href="/?lang=${lang}" class="inline-block mt-6 px-6 py-2 bg-purple-600 text-white rounded-full font-bold">Dueli</a>
                </div></div>
                ${getFooter(lang)}`;
                return c.html(generateHTML(denied, lang, tt('access_denied'), nonce), 403);
            }
        } catch {
            // Fall through to the shell; the API + client checks still apply.
        }
    }

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

            <!-- R2-A: own account settings (username / email / password) -->
            <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 mb-8">
                <h2 class="text-xl font-bold mb-1">${tt('my_account')}</h2>
                <p class="text-sm text-gray-500 dark:text-gray-400 mb-4" id="accountCurrent"></p>
                <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <form data-csp-on="submit" data-csp-fn="saveAccountUsername" data-csp-args='["@event"]' class="space-y-2">
                        <label class="block text-sm font-semibold" for="accountUsername">Username</label>
                        <input type="text" id="accountUsername" autocomplete="username" class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent" />
                        <button type="submit" class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold">Save</button>
                    </form>
                    <form data-csp-on="submit" data-csp-fn="saveAccountEmail" data-csp-args='["@event"]' class="space-y-2">
                        <label class="block text-sm font-semibold" for="accountEmail">Email</label>
                        <input type="email" id="accountEmail" autocomplete="email" class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent" />
                        <button type="submit" class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold">Save</button>
                    </form>
                    <form data-csp-on="submit" data-csp-fn="saveAccountPassword" data-csp-args='["@event"]' class="space-y-2">
                        <label class="block text-sm font-semibold" for="accountCurrentPassword">New password</label>
                        <input type="password" id="accountCurrentPassword" autocomplete="current-password" placeholder="Current" class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent" />
                        <input type="password" id="accountNewPassword" autocomplete="new-password" placeholder="New (8+)" class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent" />
                        <button type="submit" class="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-bold">Save</button>
                    </form>
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
                    <button data-csp-on="click" data-csp-fn="showGrantRoleForm" data-csp-args='[]' class="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg text-sm">${tt('grant_role')}</button>
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

            <!-- R2-A (H9): managed documents & data -->
            <div class="mt-6 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <div class="flex items-center justify-between mb-4">
                    <h2 class="text-xl font-bold">${tt('documents_title')}</h2>
                    <div class="flex items-center gap-2">
                        <button data-csp-on="click" data-csp-fn="previewAdminDoc" data-csp-args='["ar"]' id="docPreviewAr" class="px-3 py-1 rounded-lg text-sm bg-purple-600 text-white font-bold">عربي</button>
                        <button data-csp-on="click" data-csp-fn="previewAdminDoc" data-csp-args='["en"]' id="docPreviewEn" class="px-3 py-1 rounded-lg text-sm bg-gray-200 dark:bg-gray-700 font-bold">EN</button>
                    </div>
                </div>
                <div id="adminDocsList" class="space-y-2 mb-6"></div>
                <form data-csp-on="submit" data-csp-fn="saveAdminDoc" data-csp-args='["@event"]' class="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input type="hidden" id="docId" value="" />
                    <div><label class="block text-sm font-semibold mb-1" for="docSlug">Slug</label><input type="text" id="docSlug" placeholder="terms-of-service" class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent" /></div>
                    <div class="flex gap-3">
                        <div class="flex-1"><label class="block text-sm font-semibold mb-1" for="docStatus">Status</label><select id="docStatus" class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent"><option value="draft">Draft</option><option value="published">Published</option></select></div>
                        <div class="flex-1"><label class="block text-sm font-semibold mb-1" for="docVisibility">Visibility</label><select id="docVisibility" class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent"><option value="private">Private</option><option value="public">Public</option></select></div>
                    </div>
                    <div><label class="block text-sm font-semibold mb-1" for="docTitleAr">Title (AR)</label><input type="text" id="docTitleAr" class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent" /></div>
                    <div><label class="block text-sm font-semibold mb-1" for="docTitleEn">Title (EN)</label><input type="text" id="docTitleEn" class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent" /></div>
                    <div><label class="block text-sm font-semibold mb-1" for="docBodyAr">Body (AR)</label><textarea id="docBodyAr" rows="4" class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent"></textarea></div>
                    <div><label class="block text-sm font-semibold mb-1" for="docBodyEn">Body (EN)</label><textarea id="docBodyEn" rows="4" class="w-full px-3 py-2 rounded-lg border dark:border-gray-600 bg-transparent"></textarea></div>
                    <div class="md:col-span-2 flex gap-2">
                        <button type="submit" class="px-6 py-2 bg-purple-600 text-white rounded-lg font-bold">Save</button>
                        <button type="button" data-csp-on="click" data-csp-fn="resetAdminDocForm" data-csp-args='[]' class="px-6 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg font-bold">New</button>
                    </div>
                </form>
                <div id="adminDocPreview" class="hidden mt-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700"></div>
            </div>

            <div id="grantRoleForm" class="hidden mt-6 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 class="text-lg font-bold mb-4">${tt('grant_role')}</h3>
                <form data-csp-on="submit" data-csp-fn="grantRole" data-csp-args='["@event"]' class="flex gap-4 items-end">
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
                    <select id="withdrawFilterStatus" data-csp-on="change" data-csp-fn="loadWithdrawals" data-csp-args='[]' class="px-3 py-1.5 text-sm rounded-lg border dark:border-gray-600 bg-transparent">
                        <option value="">All</option>
                        <option value="requested" selected>Requested</option>
                        <option value="paid">Paid</option>
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
                        <button data-csp-on="click" data-csp-fn="__byIdClass" data-csp-args='["approveModal","add","hidden"]' class="flex-1 py-2 border dark:border-gray-600 rounded-xl text-sm">Cancel</button>
                        <button data-csp-on="click" data-csp-fn="confirmApprove" data-csp-args='[]' class="flex-1 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold">Confirm Approve</button>
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
                        <button data-csp-on="click" data-csp-fn="__byIdClass" data-csp-args='["rejectModal","add","hidden"]' class="flex-1 py-2 border dark:border-gray-600 rounded-xl text-sm">Cancel</button>
                        <button data-csp-on="click" data-csp-fn="confirmReject" data-csp-args='[]' class="flex-1 py-2 bg-red-600 text-white rounded-xl text-sm font-bold">Confirm Reject</button>
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
                        <button data-csp-on="click" data-csp-fn="suspendBroadcast" data-csp-args='[]' class="w-full py-3 bg-gradient-to-r from-red-600 to-red-800 text-white rounded-xl font-bold hover:opacity-90 transition-all">
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
                        <button data-csp-on="click" data-csp-fn="restoreBroadcast" data-csp-args='[]' class="w-full py-3 bg-gradient-to-r from-green-600 to-teal-700 text-white rounded-xl font-bold hover:opacity-90 transition-all">
                            <i class="fas fa-undo mr-2"></i> Restore to Archive
                        </button>
                    </div>
                </div>
            </div>

        </div>
    </div>
    ${getFooter(lang)}
    <script nonce="${nonce}">
        const token = localStorage.getItem('session_id') || localStorage.getItem('sessionId');
        const adminHeaders = (extra) => Object.assign({ 'Authorization': 'Bearer ' + token }, extra || {});

        // R2-A: client boot gate (covers cookie-less sessions; the server
        // gate + admin API remain authoritative). Non-admins see an explicit
        // denial instead of an empty dashboard; guests go to login.
        function denyAdminAccess() {
            document.querySelector('.container')?.insertAdjacentHTML('afterbegin',
                '<div id="adminDenied" class="mb-6 p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-red-700 dark:text-red-300 font-bold" role="alert">${tt('access_denied')}</div>');
        }

        async function loadAdminDashboard() {
            try {
                if (!token) { window.location.href = '/login?redirect=' + encodeURIComponent('/admin'); return; }
                const res = await fetch('/api/admin/enhanced-stats', { headers: adminHeaders() });
                if (res.status === 403) { denyAdminAccess(); return; }
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
                        document.getElementById('hottestCompetitions').innerHTML = d.hottestCompetitions.map(c => '<div class="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700 rounded-xl"><div><span class="font-bold">' + c.title + '</span><span class="text-sm text-gray-500 ml-2">' + c.status + '</span></div><div class="flex items-center gap-2"><span class="text-sm text-gray-500">' + c.total_views + ' ${tr.viewers}</span><button data-csp-on="click" data-csp-fn="openSuspendPanel" data-csp-args='[" + c.id + "]' class="text-xs text-red-500 hover:text-red-700 font-bold"><i class="fas fa-ban"></i></button></div></div>').join('');
                    }
                }
                const rolesRes = await fetch('/api/admin/roles', { headers: { 'Authorization': 'Bearer ' + token } });
                const rolesData = await rolesRes.json();
                if (rolesData.success && rolesData.data.roles) {
                    document.getElementById('adminRoles').innerHTML = rolesData.data.roles.map(r => '<div class="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded-lg"><span>' + r.display_name + ' (' + r.username + ')</span><div class="flex items-center gap-2"><span class="px-2 py-1 rounded-full text-xs font-bold ' + (r.role === 'SuperAdmin' ? 'bg-red-100 text-red-700' : r.role === 'Auditor' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700') + '">' + r.role + '</span><button data-csp-on="click" data-csp-fn="revokeRole" data-csp-args='[" + r.user_id + "]' class="text-red-500 text-xs">${tt('revoke_role')}</button></div></div>').join('');
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
                    const statusColor = { requested: 'text-amber-500', approved: 'text-blue-500', paid: 'text-emerald-500', rejected: 'text-red-500' }[r.status] || '';
                    return '<div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl">' +
                        '<div><p class="font-bold text-base">$' + parseFloat(r.amount).toFixed(2) + ' <span class="text-xs text-gray-400">· ' + r.payment_method + '</span></p>' +
                        '<p class="text-xs text-gray-500">' + (r.display_name || r.username) + ' · ' + new Date(r.created_at).toLocaleDateString() + '</p>' +
                        (r.payment_details ? '<p class="text-xs text-gray-400 truncate max-w-xs">' + r.payment_details + '</p>' : '') + '</div>' +
                        '<div class="flex items-center gap-2">' +
                        '<span class="font-bold text-sm ' + statusColor + ' capitalize">' + r.status + '</span>' +
                        (r.status === 'requested' ?
                            '<button data-csp-on="click" data-csp-fn="openApproveModal" data-csp-args='[" + r.id + "]' class="px-3 py-1 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">Approve</button>' +
                            '<button data-csp-on="click" data-csp-fn="openRejectModal" data-csp-args='[" + r.id + "]' class="px-3 py-1 bg-red-600 text-white rounded-lg text-xs font-bold hover:bg-red-700">Reject</button>'
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

        // ============================
        // R2-A: own account settings
        // ============================
        async function saveAccountUsername(e) {
            e.preventDefault();
            const username = document.getElementById('accountUsername').value;
            const res = await fetch('/api/account/username', { method: 'PUT', headers: adminHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ username }) });
            const data = await res.json().catch(() => ({}));
            showAdminToast(data.success ? '✅ Username updated' : ('Error: ' + (data.error || 'Unknown')), data.success ? 'success' : 'error');
            if (data.success) paintAccountCurrent(data.data?.user);
        }
        async function saveAccountEmail(e) {
            e.preventDefault();
            const email = document.getElementById('accountEmail').value;
            const res = await fetch('/api/account/email', { method: 'PUT', headers: adminHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ email }) });
            const data = await res.json().catch(() => ({}));
            showAdminToast(data.success ? '✅ ' + (data.data?.reverify_required ? 'Email updated — please verify the new address' : 'Email updated') : ('Error: ' + (data.error || 'Unknown')), data.success ? 'success' : 'error');
            if (data.success) paintAccountCurrent(data.data?.user);
        }
        async function saveAccountPassword(e) {
            e.preventDefault();
            const current_password = document.getElementById('accountCurrentPassword').value;
            const new_password = document.getElementById('accountNewPassword').value;
            const res = await fetch('/api/account/password', { method: 'PUT', headers: adminHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ current_password, new_password }) });
            const data = await res.json().catch(() => ({}));
            if (data.success && data.data?.reauth_required) {
                showAdminToast('✅ Password updated — please log in again', 'success');
                setTimeout(() => { window.location.href = '/login'; }, 1200);
                return;
            }
            showAdminToast('Error: ' + (data.error || 'Unknown'), 'error');
        }
        function paintAccountCurrent(user) {
            const el = document.getElementById('accountCurrent');
            if (el && user) el.textContent = (user.display_name || user.username) + ' · @' + user.username + ' · ' + user.email;
        }

        // ============================
        // R2-A (H9): managed documents
        // ============================
        let adminDocs = [];
        let adminDocPreviewLang = 'ar';
        async function loadAdminDocs() {
            const res = await fetch('/api/admin/documents?limit=50', { headers: adminHeaders() });
            const data = await res.json().catch(() => ({}));
            if (!data.success) return;
            adminDocs = data.data?.documents || [];
            const box = document.getElementById('adminDocsList');
            box.innerHTML = adminDocs.length === 0
                ? '<p class="text-center text-gray-400 py-2">${tt('documents_empty')}</p>'
                : adminDocs.map(d => '<div class="flex flex-wrap justify-between items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700 rounded-lg text-sm">' +
                    '<span class="font-bold">' + escapeAdminHtml(d.slug) + ' <span class="text-gray-400 font-normal">v' + d.version + '</span>' +
                    (d.is_seed ? ' <span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800">SEED</span>' : '') + '</span>' +
                    '<span class="flex items-center gap-2">' +
                    '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold ' + (d.status === 'published' ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-600') + '">' + d.status + '</span>' +
                    '<span class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-700">' + d.visibility + '</span>' +
                    '<button data-csp-on="click" data-csp-fn="editAdminDoc" data-csp-args="[' + d.id + ']" class="text-purple-600 text-xs font-bold">Edit</button>' +
                    '<button data-csp-on="click" data-csp-fn="toggleDocPublish" data-csp-args="[' + d.id + ']" class="text-amber-600 text-xs font-bold">' + (d.status === 'published' ? 'Unpublish' : 'Publish') + '</button>' +
                    '<button data-csp-on="click" data-csp-fn="deleteAdminDoc" data-csp-args="[' + d.id + ']" class="text-red-500 text-xs font-bold">Delete</button>' +
                    '</span></div>').join('');
        }
        function escapeAdminHtml(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
        function resetAdminDocForm() {
            for (const id of ['docId', 'docSlug', 'docTitleAr', 'docTitleEn', 'docBodyAr', 'docBodyEn']) document.getElementById(id).value = '';
            document.getElementById('docStatus').value = 'draft';
            document.getElementById('docVisibility').value = 'private';
        }
        function editAdminDoc(id) {
            const d = adminDocs.find(x => x.id === Number(id));
            if (!d) return;
            document.getElementById('docId').value = d.id;
            document.getElementById('docSlug').value = d.slug;
            document.getElementById('docTitleAr').value = d.title_ar || '';
            document.getElementById('docTitleEn').value = d.title_en || '';
            document.getElementById('docBodyAr').value = d.body_ar || '';
            document.getElementById('docBodyEn').value = d.body_en || '';
            document.getElementById('docStatus').value = d.status;
            document.getElementById('docVisibility').value = d.visibility;
            previewAdminDoc(adminDocPreviewLang);
            document.getElementById('docSlug').scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        async function saveAdminDoc(e) {
            e.preventDefault();
            const id = document.getElementById('docId').value;
            const payload = {
                slug: document.getElementById('docSlug').value,
                title_ar: document.getElementById('docTitleAr').value,
                title_en: document.getElementById('docTitleEn').value,
                body_ar: document.getElementById('docBodyAr').value,
                body_en: document.getElementById('docBodyEn').value,
                status: document.getElementById('docStatus').value,
                visibility: document.getElementById('docVisibility').value
            };
            const res = await fetch(id ? '/api/admin/documents/' + id : '/api/admin/documents',
                { method: id ? 'PUT' : 'POST', headers: adminHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(payload) });
            const data = await res.json().catch(() => ({}));
            showAdminToast(data.success ? '✅ Saved (v' + data.data?.document?.version + ')' : ('Error: ' + (data.error || 'Unknown')), data.success ? 'success' : 'error');
            if (data.success) { resetAdminDocForm(); loadAdminDocs(); }
        }
        async function deleteAdminDoc(id) {
            if (!confirm('Delete this document?')) return;
            const res = await fetch('/api/admin/documents/' + id, { method: 'DELETE', headers: adminHeaders() });
            const data = await res.json().catch(() => ({}));
            showAdminToast(data.success ? '✅ Deleted' : ('Error: ' + (data.error || 'Unknown')), data.success ? 'success' : 'error');
            if (data.success) loadAdminDocs();
        }
        async function toggleDocPublish(id) {
            const d = adminDocs.find(x => x.id === Number(id));
            if (!d) return;
            const res = await fetch('/api/admin/documents/' + id,
                { method: 'PUT', headers: adminHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify({ status: d.status === 'published' ? 'draft' : 'published' }) });
            const data = await res.json().catch(() => ({}));
            if (data.success) loadAdminDocs();
            else showAdminToast('Error: ' + (data.error || 'Unknown'), 'error');
        }
        function previewAdminDoc(lang) {
            adminDocPreviewLang = (lang === 'en') ? 'en' : 'ar';
            document.getElementById('docPreviewAr')?.classList.toggle('bg-purple-600', adminDocPreviewLang === 'ar');
            document.getElementById('docPreviewAr')?.classList.toggle('text-white', adminDocPreviewLang === 'ar');
            document.getElementById('docPreviewEn')?.classList.toggle('bg-purple-600', adminDocPreviewLang === 'en');
            document.getElementById('docPreviewEn')?.classList.toggle('text-white', adminDocPreviewLang === 'en');
            const box = document.getElementById('adminDocPreview');
            const title = adminDocPreviewLang === 'ar' ? document.getElementById('docTitleAr').value : document.getElementById('docTitleEn').value;
            const body = adminDocPreviewLang === 'ar' ? document.getElementById('docBodyAr').value : document.getElementById('docBodyEn').value;
            box.classList.remove('hidden');
            box.innerHTML = '<h3 class="font-bold text-lg mb-2">' + escapeAdminHtml(title || '—') + '</h3><p class="text-sm whitespace-pre-wrap">' + escapeAdminHtml(body || '—') + '</p>';
            box.setAttribute('dir', adminDocPreviewLang === 'ar' ? 'rtl' : 'ltr');
        }

        loadAdminDashboard();
        loadWithdrawals();
        loadAdminDocs();
        // Paint the signed-in admin identity (refresh-safe: same session).
        fetch('/api/auth/session', { headers: adminHeaders() }).then(r => r.json()).then(d => {
            if (d && d.success && d.data && d.data.user) {
                const u = d.data.user;
                paintAccountCurrent(u);
                const un = document.getElementById('accountUsername'); if (un && !un.value) un.value = u.username || '';
                const em = document.getElementById('accountEmail'); if (em && !em.value) em.value = u.email || '';
            }
        }).catch(() => {});
    </script>`;

    return c.html(generateHTML(content, lang, tt('dashboard_title'), nonce));
}
