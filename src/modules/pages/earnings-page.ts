/**
 * Earnings Page
 * صفحة الأرباح
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
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}
        
        <div class="flex-1 bg-gray-50 dark:bg-[#0f0f0f]">
            <div class="container mx-auto px-4 py-8 max-w-4xl">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-8">
                    <i class="fas fa-wallet ${rtl ? 'ml-3' : 'mr-3'} text-emerald-500"></i>
                    ${tr.earnings || 'Earnings'}
                </h1>
                
                <div id="earningsContent">
                    <div class="text-center py-12">
                        <i class="fas fa-spinner fa-spin text-4xl text-purple-400"></i>
                    </div>
                </div>
            </div>
        </div>
        
        ${getFooter(lang)}
        
        <script>
            const lang = '${lang}';
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            
            document.addEventListener('DOMContentLoaded', async () => {
                await checkAuth();
                if (window.currentUser) {
                    loadEarnings();
                } else {
                    showLoginRequired();
                }
            });
            
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
            
            async function loadEarnings() {
                try {
                    // Load both earnings and withdrawal history
                    const [earningsRes, historyRes, balanceRes] = await Promise.all([
                        fetch('/api/earnings', {
                            headers: {
                                'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                            }
                        }),
                        fetch('/api/earnings/withdrawal/history', {
                            headers: {
                                'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                            }
                        }),
                        fetch('/api/earnings/withdrawal/balance', {
                            headers: {
                                'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                            }
                        })
                    ]);
                    
                    const earningsData = await earningsRes.json();
                    const historyData = await historyRes.json();
                    const balanceData = await balanceRes.json();
                    
                    const earnings = earningsData.data || {};
                    const history = historyData.history || [];
                    const balance = balanceData.balance || {};
                    
                    renderEarnings(earnings, history, balance);
                } catch (err) {
                    console.error('Failed to load earnings:', err);
                    renderEarnings({}, [], {});
                }
            }
            
            function renderEarnings(earnings, history, balance) {
                const availableBalance = balance.available_balance || earnings.available || 0;
                const pendingWithdrawals = balance.pending_withdrawals || 0;
                const totalEarnings = balance.total_earnings || earnings.total || 0;
                
                document.getElementById('earningsContent').innerHTML = \`
                    <!-- Balance Cards -->
                    <div class="grid md:grid-cols-3 gap-6 mb-8">
                        <div class="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg">
                            <div class="flex items-center justify-between mb-4">
                                <i class="fas fa-wallet text-3xl opacity-80"></i>
                                <span class="text-xs bg-white/20 px-2 py-1 rounded-full">\${tr.available || 'Available'}</span>
                            </div>
                            <p class="text-4xl font-bold">\${availableBalance.toFixed(2)}</p>
                            <p class="text-sm opacity-80 mt-1">USD</p>
                        </div>
                        
                        <div class="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg">
                            <div class="flex items-center justify-between mb-4">
                                <i class="fas fa-clock text-3xl opacity-80"></i>
                                <span class="text-xs bg-white/20 px-2 py-1 rounded-full">\${tr.pending || 'Pending'}</span>
                            </div>
                            <p class="text-4xl font-bold">\${pendingWithdrawals.toFixed(2)}</p>
                            <p class="text-sm opacity-80 mt-1">USD</p>
                        </div>
                        
                        <div class="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
                            <div class="flex items-center justify-between mb-4">
                                <i class="fas fa-chart-line text-3xl opacity-80"></i>
                                <span class="text-xs bg-white/20 px-2 py-1 rounded-full">\${tr.total || 'Total'}</span>
                            </div>
                            <p class="text-4xl font-bold">\${totalEarnings.toFixed(2)}</p>
                            <p class="text-sm opacity-80 mt-1">USD</p>
                        </div>
                    </div>
                    
                    <!-- Ad Revenue Section -->
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-6 shadow-lg mb-6">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            <i class="fas fa-ad \${isRTL ? 'ml-2' : 'mr-2'} text-purple-600"></i>
                            \${tr.ad_revenue || 'Ad Revenue'}
                        </h2>
                        
                        <div class="space-y-4">
                            <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <div>
                                    <p class="font-medium text-gray-900 dark:text-white">\${tr.total_earnings || 'Total Earnings'}</p>
                                    <p class="text-sm text-gray-500">\${tr.from_competitions || 'From competitions'}</p>
                                </div>
                                <p class="text-2xl font-bold text-emerald-600">\${(earnings.total || 0).toFixed(2)} USD</p>
                            </div>
                            
                            <div class="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                <div>
                                    <p class="font-medium text-gray-900 dark:text-white">\${tr.withdrawn || 'Withdrawn'}</p>
                                    <p class="text-sm text-gray-500">\${tr.to_bank || 'To bank account'}</p>
                                </div>
                                <p class="text-2xl font-bold text-gray-600">\${(earnings.withdrawn || 0).toFixed(2)} USD</p>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Withdrawal Section -->
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-6 shadow-lg">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            <i class="fas fa-university \${isRTL ? 'ml-2' : 'mr-2'} text-purple-600"></i>
                            \${tr.withdraw || 'Withdraw'}
                        </h2>
                        
                        <div class="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 mb-4">
                            <p class="text-amber-800 dark:text-amber-200 text-sm">
                                <i class="fas fa-info-circle \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                                \${tr.min_withdrawal_10 || 'Minimum withdrawal: $10.00'}
                            </p>
                        </div>
                        
                        <button onclick="requestWithdrawal()" 
                                class="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold hover:opacity-90 transition-opacity shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                                \${availableBalance < 10 ? 'disabled' : ''}>
                            <i class="fas fa-money-bill-wave \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.request_withdrawal || 'Request Withdrawal'}
                        </button>
                        
                        \${history.length > 0 ? \`
                        <!-- Withdrawal History -->
                        <div class="mt-6 border-t border-gray-200 dark:border-gray-700 pt-6">
                            <h3 class="text-md font-bold text-gray-900 dark:text-white mb-4">
                                <i class="fas fa-history \${isRTL ? 'ml-2' : 'mr-2'} text-gray-500"></i>
                                \${tr.withdrawal_history || 'Withdrawal History'}
                            </h3>
                            <div class="space-y-3">
                                \${history.map(req => \`
                                    <div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                                        <div>
                                            <p class="font-medium text-gray-900 dark:text-white">\\$\${req.amount.toFixed(2)}</p>
                                            <p class="text-xs text-gray-500">\${req.method} • \${new Date(req.created_at).toLocaleDateString()}</p>
                                        </div>
                                        <span class="px-3 py-1 rounded-full text-xs font-bold \${req.status === 'pending' ? 'bg-amber-100 text-amber-800' : req.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}">
                                            \${req.status}
                                        </span>
                                    </div>
                                \`).join('')}
                            </div>
                        </div>
                        \` : ''}
                    </div>
                \`;
            }
            
            async function requestWithdrawal() {
                const amount = prompt(tr.enter_amount || 'Enter amount to withdraw (minimum $10):');
                if (!amount || isNaN(parseFloat(amount))) {
                    alert(tr.invalid_amount || 'Please enter a valid amount');
                    return;
                }
                
                const withdrawalAmount = parseFloat(amount);
                if (withdrawalAmount < 10) {
                    alert(tr.min_withdrawal_10 || 'Minimum withdrawal amount is $10');
                    return;
                }
                
                const method = prompt(tr.payment_method || 'Enter payment method (paypal/bank):');
                if (!method || !['paypal', 'bank'].includes(method.toLowerCase())) {
                    alert(tr.invalid_method || 'Please enter "paypal" or "bank"');
                    return;
                }
                
                const accountInfo = prompt(tr.account_info || 'Enter your PayPal email or bank account details:');
                if (!accountInfo) {
                    alert(tr.account_info_required || 'Account information is required');
                    return;
                }
                
                try {
                    const res = await fetch('/api/earnings/withdrawal/request', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            amount: withdrawalAmount,
                            method: method.toLowerCase(),
                            account_info: accountInfo
                        })
                    });
                    
                    const data = await res.json();
                    
                    if (data.success) {
                        alert((tr.withdrawal_submitted || 'Withdrawal request submitted successfully!') + '\n' + 
                              (tr.request_id || 'Request ID:') + ' ' + data.request_id);
                        loadEarnings(); // Refresh the page
                    } else {
                        alert((tr.withdrawal_failed || 'Withdrawal request failed:') + ' ' + (data.error || ''));
                    }
                } catch (err) {
                    console.error('Withdrawal request error:', err);
                    alert(tr.withdrawal_error || 'An error occurred. Please try again later.');
                }
            }

        </script>
    `;

    return c.html(generateHTML(content, lang, tr.earnings || 'Earnings'));
};

export default earningsPage;
