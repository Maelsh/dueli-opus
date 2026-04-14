/**
 * Earnings & Withdrawal Page (Task 6 – Full Implementation)
 * صفحة الأرباح وطلبات السحب – التنفيذ الكامل
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

/**
 * Earnings Page Handler
 */
export const earningsPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    // Cast to any – new i18n keys for Task 6 may not yet be in the typed definition
    const tr   = translations[getUILanguage(lang)] as any;
    const rtl  = checkRTL(lang);

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}

        <div class="flex-1 bg-gray-50 dark:bg-[#0f0f0f]">
            <div class="container mx-auto px-4 py-8 max-w-4xl">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-8">
                    <i class="fas fa-wallet ${rtl ? 'ml-3' : 'mr-3'} text-emerald-500"></i>
                    ${tr.earnings || 'Earnings & Wallet'}
                </h1>

                <div id="earningsContent">
                    <div class="text-center py-12">
                        <i class="fas fa-spinner fa-spin text-4xl text-purple-400"></i>
                    </div>
                </div>

                <!-- Withdrawal Modal -->
                <div id="withdrawalModal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl p-8 w-full max-w-md shadow-2xl mx-4">
                        <div class="flex items-center justify-between mb-6">
                            <h3 class="text-xl font-bold text-gray-900 dark:text-white">
                                <i class="fas fa-university ${rtl ? 'ml-2' : 'mr-2'} text-emerald-500"></i>
                                ${tr.request_withdrawal || 'Request Withdrawal'}
                            </h3>
                            <button onclick="closeWithdrawalModal()"
                                    id="closeWithdrawalBtn"
                                    class="text-gray-400 hover:text-gray-600 dark:hover:text-white transition-colors">
                                <i class="fas fa-times text-xl"></i>
                            </button>
                        </div>

                        <form id="withdrawalForm" onsubmit="submitWithdrawal(event)" class="space-y-5">
                            <!-- Amount -->
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    ${tr.amount || 'Amount'} (USD)
                                </label>
                                <div class="relative">
                                    <span class="absolute ${rtl ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-400 font-bold">$</span>
                                    <input type="number" id="withdrawAmount" min="10" step="0.01"
                                           placeholder="10.00" required
                                           class="w-full ${rtl ? 'pr-8 pl-4' : 'pl-8 pr-4'} py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#111] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition" />
                                </div>
                                <p class="text-xs text-gray-400 mt-1">${tr.min_withdrawal || 'Minimum: $10.00'}</p>
                            </div>

                            <!-- Payment Method -->
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    ${tr.payment_method || 'Payment Method'}
                                </label>
                                <select id="withdrawMethod" required
                                        class="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#111] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition">
                                    <option value="bank_transfer">${tr.bank_transfer || 'Bank Transfer'}</option>
                                    <option value="paypal">PayPal</option>
                                    <option value="wise">Wise</option>
                                    <option value="crypto_usdt">Crypto USDT (TRC-20)</option>
                                </select>
                            </div>

                            <!-- Payment Details -->
                            <div>
                                <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                                    ${tr.payment_details || 'Payment Details'}
                                </label>
                                <textarea id="withdrawDetails" rows="3" required
                                          placeholder="${tr.payment_details_placeholder || 'IBAN / PayPal email / Wallet address...'}"
                                          class="w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#111] text-gray-900 dark:text-white focus:ring-2 focus:ring-emerald-500 outline-none transition resize-none"></textarea>
                            </div>

                            <!-- Error -->
                            <div id="withdrawError" class="hidden p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-sm"></div>

                            <!-- Submit -->
                            <button type="submit" id="withdrawSubmitBtn"
                                    class="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
                                <i class="fas fa-paper-plane"></i>
                                ${tr.submit_withdrawal || 'Submit Withdrawal Request'}
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>

        ${getFooter(lang)}

        <script>
            const lang   = '${lang}';
            const isRTL  = ${rtl};
            const tr     = ${JSON.stringify(tr)};
            let currentEarnings = {};

            document.addEventListener('DOMContentLoaded', async () => {
                await checkAuth();
                if (window.currentUser) {
                    loadEarnings();
                    // SSE: listen for withdrawal status updates
                    connectSSE('user:' + window.currentUser.id);
                } else {
                    showLoginRequired();
                }
            });

            // =====================
            // SSE Connection
            // =====================
            function connectSSE(channel) {
                const sessionId = localStorage.getItem('session_id');
                const url = '/api/sse?channel=' + encodeURIComponent(channel);
                const es  = new EventSource(url, { withCredentials: false });

                es.addEventListener('withdrawal_status', (e) => {
                    const data = JSON.parse(e.data);
                    showToast(
                        data.status === 'completed'
                            ? '✅ ' + (tr.withdrawal_approved || 'Withdrawal approved!')
                            : '❌ ' + (tr.withdrawal_rejected || 'Withdrawal rejected: ') + (data.note || ''),
                        data.status === 'completed' ? 'success' : 'error'
                    );
                    loadEarnings(); // Refresh wallet
                });

                es.addEventListener('notification', (e) => {
                    const data = JSON.parse(e.data);
                    showToast(data.title || data.message, 'info');
                });

                es.onerror = () => setTimeout(() => connectSSE(channel), 5000);
            }

            function showToast(message, type = 'info') {
                const colors = { success: 'bg-emerald-600', error: 'bg-red-600', info: 'bg-blue-600' };
                const toast  = document.createElement('div');
                toast.className = \`fixed bottom-6 \${isRTL ? 'left-6' : 'right-6'} z-[9999] px-5 py-3 \${colors[type] || colors.info} text-white rounded-xl shadow-xl text-sm font-medium translate-y-20 opacity-0 transition-all duration-300\`;
                toast.textContent = message;
                document.body.appendChild(toast);
                requestAnimationFrame(() => { toast.classList.remove('translate-y-20', 'opacity-0'); });
                setTimeout(() => { toast.classList.add('translate-y-20', 'opacity-0'); setTimeout(() => toast.remove(), 300); }, 4000);
            }

            // =====================
            // Auth Guard
            // =====================
            function showLoginRequired() {
                document.getElementById('earningsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-8 text-center shadow-lg">
                        <i class="fas fa-lock text-4xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500">\${tr.login_required || 'Please login to view earnings'}</p>
                        <button onclick="showLoginModal()" class="mt-4 px-6 py-2 bg-purple-600 text-white rounded-full">
                            \${tr.login || 'Login'}
                        </button>
                    </div>
                \`;
            }

            // =====================
            // Load Earnings
            // =====================
            async function loadEarnings() {
                try {
                    const sessionId = localStorage.getItem('session_id');
                    const [earningsRes, historyRes] = await Promise.all([
                        fetch('/api/withdrawals', { headers: { 'Authorization': 'Bearer ' + sessionId } }),
                        fetch('/api/withdrawals?limit=10', { headers: { 'Authorization': 'Bearer ' + sessionId } })
                    ]);
                    const earningsData = await earningsRes.json();
                    if (!earningsData.success) { showLoginRequired(); return; }

                    currentEarnings = earningsData.data.wallet || {};
                    renderEarnings(currentEarnings, earningsData.data.requests || []);
                } catch (err) {
                    console.error('Failed to load earnings:', err);
                    renderEarnings({}, []);
                }
            }

            // =====================
            // Render
            // =====================
            function renderEarnings(wallet, requests) {
                const available = (wallet.available || 0);
                const pending   = (wallet.pending || 0);
                const onHold    = (wallet.on_hold || 0);
                const total     = (wallet.total || 0);
                const withdrawn = (wallet.withdrawn || 0);

                const historyRows = requests.length === 0
                    ? \`<p class="text-center text-gray-400 py-6">\${tr.no_withdrawal_history || 'No withdrawal history yet'}</p>\`
                    : requests.map(r => {
                        const statusColor = { pending: 'text-amber-500', processing: 'text-blue-500', completed: 'text-emerald-500', rejected: 'text-red-500' }[r.status] || 'text-gray-400';
                        return \`
                            <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl mb-2">
                                <div>
                                    <p class="font-semibold text-gray-900 dark:text-white">$\${parseFloat(r.amount).toFixed(2)}</p>
                                    <p class="text-xs text-gray-500">\${r.payment_method} · \${new Date(r.created_at).toLocaleDateString()}</p>
                                </div>
                                <div class="text-right">
                                    <span class="font-bold \${statusColor} text-sm capitalize">\${r.status}</span>
                                    \${r.status === 'pending' ? \`<button onclick="cancelWithdrawal(\${r.id})" class="block text-xs text-red-400 hover:text-red-600 mt-1">\${tr.cancel || 'Cancel'}</button>\` : ''}
                                </div>
                            </div>
                        \`;
                    }).join('');

                document.getElementById('earningsContent').innerHTML = \`
                    <!-- Balance Cards -->
                    <div class="grid sm:grid-cols-3 gap-5 mb-8">
                        <div class="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg shadow-emerald-500/20">
                            <div class="flex items-center justify-between mb-3">
                                <i class="fas fa-wallet text-2xl opacity-80"></i>
                                <span class="text-xs bg-white/20 px-2 py-1 rounded-full font-medium">\${tr.available || 'Available'}</span>
                            </div>
                            <p class="text-4xl font-black">\$\${available.toFixed(2)}</p>
                            <p class="text-sm opacity-70 mt-1">USD</p>
                        </div>
                        <div class="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg shadow-amber-500/20">
                            <div class="flex items-center justify-between mb-3">
                                <i class="fas fa-clock text-2xl opacity-80"></i>
                                <span class="text-xs bg-white/20 px-2 py-1 rounded-full font-medium">\${tr.pending || 'Pending'}</span>
                            </div>
                            <p class="text-4xl font-black">\$\${pending.toFixed(2)}</p>
                            <p class="text-sm opacity-70 mt-1">USD</p>
                        </div>
                        <div class="bg-gradient-to-br from-slate-600 to-gray-700 rounded-2xl p-6 text-white shadow-lg">
                            <div class="flex items-center justify-between mb-3">
                                <i class="fas fa-check-circle text-2xl opacity-80"></i>
                                <span class="text-xs bg-white/20 px-2 py-1 rounded-full font-medium">\${tr.withdrawn || 'Withdrawn'}</span>
                            </div>
                            <p class="text-4xl font-black">\$\${withdrawn.toFixed(2)}</p>
                            <p class="text-sm opacity-70 mt-1">USD</p>
                        </div>
                    </div>

                    <!-- Ad Revenue Summary -->
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-lg mb-6 border border-gray-100 dark:border-gray-800">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            <i class="fas fa-chart-line \${isRTL ? 'ml-2' : 'mr-2'} text-purple-500"></i>
                            \${tr.total_earnings || 'Total Lifetime Earnings'}
                        </h2>
                        <p class="text-5xl font-black text-purple-500">\$\${total.toFixed(2)}</p>
                        <p class="text-sm text-gray-500 mt-2">\${tr.from_competitions || 'From ad revenue across all competitions'}</p>
                    </div>

                    <!-- Cash Out -->
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-lg mb-6 border border-gray-100 dark:border-gray-800">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            <i class="fas fa-money-bill-wave \${isRTL ? 'ml-2' : 'mr-2'} text-emerald-500"></i>
                            \${tr.withdraw || 'Cash Out'}
                        </h2>
                        \${available < 10
                            ? \`<div class="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl border border-amber-200 dark:border-amber-800 text-amber-800 dark:text-amber-200 text-sm">
                                    <i class="fas fa-info-circle \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                                    \${tr.min_withdrawal || 'Minimum withdrawal is $10.00. Keep competing to earn more!'}
                               </div>\`
                            : \`<button onclick="openWithdrawalModal()"
                                       id="openWithdrawBtn"
                                       class="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold hover:opacity-90 transition-all shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-2">
                                    <i class="fas fa-university"></i>
                                    \${tr.request_withdrawal || 'Request Withdrawal'} (\$\${available.toFixed(2)} \${tr.available || 'available'})
                               </button>\`
                        }
                    </div>

                    <!-- History -->
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-800">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            <i class="fas fa-history \${isRTL ? 'ml-2' : 'mr-2'} text-gray-400"></i>
                            \${tr.withdrawal_history || 'Withdrawal History'}
                        </h2>
                        \${historyRows}
                    </div>
                \`;
            }

            // =====================
            // Modal Controls
            // =====================
            function openWithdrawalModal() {
                document.getElementById('withdrawalModal').classList.remove('hidden');
                document.getElementById('withdrawAmount').max = (currentEarnings.available || 0).toFixed(2);
            }

            function closeWithdrawalModal() {
                document.getElementById('withdrawalModal').classList.add('hidden');
                document.getElementById('withdrawalForm').reset();
                document.getElementById('withdrawError').classList.add('hidden');
            }

            // =====================
            // Submit Withdrawal
            // =====================
            async function submitWithdrawal(event) {
                event.preventDefault();
                const btn      = document.getElementById('withdrawSubmitBtn');
                const errDiv   = document.getElementById('withdrawError');
                const amount   = parseFloat(document.getElementById('withdrawAmount').value);
                const method   = document.getElementById('withdrawMethod').value;
                const details  = document.getElementById('withdrawDetails').value.trim();

                if (!amount || amount < 10) {
                    errDiv.textContent = tr.min_withdrawal || 'Minimum withdrawal is $10.';
                    errDiv.classList.remove('hidden');
                    return;
                }
                if (!details) {
                    errDiv.textContent = tr.payment_details_required || 'Payment details are required.';
                    errDiv.classList.remove('hidden');
                    return;
                }

                btn.disabled = true;
                btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>' + (tr.processing || 'Processing...');
                errDiv.classList.add('hidden');

                try {
                    const sessionId = localStorage.getItem('session_id');
                    const res = await fetch('/api/withdrawals', {
                        method: 'POST',
                        headers: {
                            'Content-Type':  'application/json',
                            'Authorization': 'Bearer ' + sessionId
                        },
                        body: JSON.stringify({ amount, payment_method: method, payment_details: details })
                    });
                    const data = await res.json();

                    if (data.success) {
                        closeWithdrawalModal();
                        showToast('✅ ' + (tr.withdrawal_submitted || 'Withdrawal request submitted!'), 'success');
                        loadEarnings();
                    } else {
                        errDiv.textContent = data.error || tr.error_occurred || 'An error occurred.';
                        errDiv.classList.remove('hidden');
                        btn.disabled = false;
                        btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>${tr.submit_withdrawal || "Submit"}';
                    }
                } catch (e) {
                    errDiv.textContent = tr.network_error || 'Network error. Please try again.';
                    errDiv.classList.remove('hidden');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fas fa-paper-plane mr-2"></i>${tr.submit_withdrawal || "Submit"}';
                }
            }

            // =====================
            // Cancel Withdrawal
            // =====================
            async function cancelWithdrawal(id) {
                if (!confirm(tr.confirm_cancel_withdrawal || 'Cancel this withdrawal request? Your balance will be refunded.')) return;
                const sessionId = localStorage.getItem('session_id');
                const res = await fetch('/api/withdrawals/' + id, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + sessionId }
                });
                const data = await res.json();
                if (data.success) {
                    showToast(tr.withdrawal_cancelled || 'Withdrawal cancelled and funds refunded.', 'info');
                    loadEarnings();
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.earnings || 'Earnings'));
};

export default earningsPage;
