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
                    const res = await fetch('/api/earnings', {
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                        }
                    });
                    const data = await res.json();
                    const earnings = data.data || {};
                    renderEarnings(earnings);
                } catch (err) {
                    console.error('Failed to load earnings:', err);
                    renderEarnings({});
                }
            }
            
            function renderEarnings(earnings) {
                document.getElementById('earningsContent').innerHTML = \`
                    <!-- Balance Cards -->
                    <div class="grid md:grid-cols-3 gap-6 mb-8">
                        <div class="bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl p-6 text-white shadow-lg">
                            <div class="flex items-center justify-between mb-4">
                                <i class="fas fa-wallet text-3xl opacity-80"></i>
                                <span class="text-xs bg-white/20 px-2 py-1 rounded-full">\${tr.available || 'Available'}</span>
                            </div>
                            <p class="text-4xl font-bold">\${(earnings.available || 0).toFixed(2)}</p>
                            <p class="text-sm opacity-80 mt-1">USD</p>
                        </div>
                        
                        <div class="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg">
                            <div class="flex items-center justify-between mb-4">
                                <i class="fas fa-clock text-3xl opacity-80"></i>
                                <span class="text-xs bg-white/20 px-2 py-1 rounded-full">\${tr.pending || 'Pending'}</span>
                            </div>
                            <p class="text-4xl font-bold">\${(earnings.pending || 0).toFixed(2)}</p>
                            <p class="text-sm opacity-80 mt-1">USD</p>
                        </div>
                        
                        <div class="bg-gradient-to-br from-red-500 to-pink-600 rounded-2xl p-6 text-white shadow-lg">
                            <div class="flex items-center justify-between mb-4">
                                <i class="fas fa-ban text-3xl opacity-80"></i>
                                <span class="text-xs bg-white/20 px-2 py-1 rounded-full">\${tr.on_hold || 'On Hold'}</span>
                            </div>
                            <p class="text-4xl font-bold">\${(earnings.on_hold || 0).toFixed(2)}</p>
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
                                \${tr.min_withdrawal || 'Minimum withdrawal: $50.00'}
                            </p>
                        </div>
                        
                        <button onclick="requestWithdrawal()" 
                                class="w-full py-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-bold hover:opacity-90 transition-opacity shadow-lg"
                                \${(earnings.available || 0) < 50 ? 'disabled' : ''}>
                            <i class="fas fa-money-bill-wave \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.request_withdrawal || 'Request Withdrawal'}
                        </button>
                    </div>
                \`;
            }
            
            async function requestWithdrawal() {
                // Get current available balance from API
                let availableBalance = 0;
                try {
                    const res = await fetch('/api/earnings', {
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                        }
                    });
                    const data = await res.json();
                    availableBalance = data.data?.available || 0;
                } catch (err) {
                    console.error('Failed to get balance:', err);
                    alert(tr.error_occurred || 'An error occurred');
                    return;
                }
                
                if (availableBalance < 50) {
                    alert(tr.min_withdrawal || 'Minimum withdrawal: $50.00');
                    return;
                }
                
                const paymentMethod = prompt((tr.select_payment_method || 'Select payment method:') + '\\n1. Bank Transfer\\n2. PayPal\\n3. Wise');
                if (!paymentMethod) return;
                
                let method = '';
                if (paymentMethod === '1') method = 'bank_transfer';
                else if (paymentMethod === '2') method = 'paypal';
                else if (paymentMethod === '3') method = 'wise';
                else {
                    alert(tr.invalid_payment_method || 'Invalid payment method');
                    return;
                }
                
                const paymentDetails = prompt(tr.enter_payment_details || 'Enter your payment details:');
                if (!paymentDetails || paymentDetails.trim().length < 5) {
                    alert(tr.payment_details_required || 'Payment details are required');
                    return;
                }
                
                const amountStr = prompt(tr.enter_withdrawal_amount || 'Enter withdrawal amount (min $50):');
                const amount = parseFloat(amountStr);
                
                if (isNaN(amount) || amount < 50) {
                    alert(tr.min_withdrawal || 'Minimum withdrawal: $50.00');
                    return;
                }
                
                if (amount > availableBalance) {
                    alert(tr.insufficient_balance || 'Insufficient available balance');
                    return;
                }
                
                try {
                    const res = await fetch('/api/earnings/withdrawal', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                        },
                        body: JSON.stringify({
                            amount: amount,
                            payment_method: method,
                            payment_details: paymentDetails
                        })
                    });
                    
                    const data = await res.json();
                    
                    if (data.success) {
                        alert(tr.withdrawal_requested || 'Withdrawal request submitted successfully!');
                        loadEarnings(); // Reload earnings
                    } else {
                        alert(data.error?.message || tr.withdrawal_failed || 'Failed to request withdrawal');
                    }
                } catch (err) {
                    console.error('Withdrawal request error:', err);
                    alert(tr.withdrawal_failed || 'Failed to request withdrawal');
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.earnings || 'Earnings'));
};

export default earningsPage;
