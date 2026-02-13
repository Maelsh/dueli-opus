/**
 * Donate Page
 * صفحة التبرعات ودعم المنصة
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

/**
 * Donate Page Handler
 */
export const donatePage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}
        
        <div class="flex-1 bg-gray-50 dark:bg-[#0f0f0f]">
            <div class="container mx-auto px-4 py-8 max-w-4xl">
                <!-- Hero Section -->
                <div class="text-center mb-12">
                    <div class="w-24 h-24 mx-auto bg-gradient-to-br from-pink-500 to-red-600 rounded-full flex items-center justify-center mb-6 shadow-lg">
                        <i class="fas fa-heart text-4xl text-white"></i>
                    </div>
                    <h1 class="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                        ${tr.support_dueli || 'Support Dueli'}
                    </h1>
                    <p class="text-lg text-gray-600 dark:text-gray-400 max-w-xl mx-auto">
                        ${tr.support_message || 'Help us build a better platform for meaningful conversations and connections.'}
                    </p>
                </div>
                
                <!-- Donation Options -->
                <div class="grid md:grid-cols-3 gap-6 mb-12">
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-lg text-center hover:shadow-xl transition-shadow cursor-pointer border-2 border-transparent hover:border-purple-500" onclick="selectAmount(5)">
                        <p class="text-4xl font-bold text-purple-600 mb-2">$5</p>
                        <p class="text-gray-500">${tr.coffee || 'Buy us a coffee'}</p>
                    </div>
                    
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-lg text-center hover:shadow-xl transition-shadow cursor-pointer border-2 border-purple-500" onclick="selectAmount(25)">
                        <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs px-3 py-1 rounded-full">Popular</div>
                        <p class="text-4xl font-bold text-purple-600 mb-2">$25</p>
                        <p class="text-gray-500">${tr.supporter || 'Supporter'}</p>
                    </div>
                    
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-lg text-center hover:shadow-xl transition-shadow cursor-pointer border-2 border-transparent hover:border-purple-500" onclick="selectAmount(100)">
                        <p class="text-4xl font-bold text-purple-600 mb-2">$100</p>
                        <p class="text-gray-500">${tr.champion || 'Champion'}</p>
                    </div>
                </div>
                
                <!-- Custom Amount -->
                <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-lg mb-8">
                    <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4 text-center">
                        ${tr.custom_amount || 'Or enter a custom amount'}
                    </h2>
                    <div class="flex items-center gap-4 max-w-md mx-auto">
                        <span class="text-2xl font-bold text-gray-500">$</span>
                        <input type="number" id="customAmount" min="1" placeholder="0" 
                            class="flex-1 px-4 py-3 text-center text-2xl font-bold rounded-lg bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white">
                    </div>
                </div>
                
                <!-- Donate Button -->
                <button onclick="processDonation()" class="w-full py-4 bg-gradient-to-r from-pink-600 to-red-600 text-white rounded-xl font-bold hover:opacity-90 transition-opacity shadow-lg text-lg">
                    <i class="fas fa-heart ${rtl ? 'ml-2' : 'mr-2'}"></i>
                    ${tr.donate_now || 'Donate Now'}
                </button>
                
                <!-- Top Supporters -->
                <div class="mt-12">
                    <h2 class="text-xl font-bold text-gray-900 dark:text-white mb-6 text-center">
                        <i class="fas fa-trophy ${rtl ? 'ml-2' : 'mr-2'} text-amber-500"></i>
                        ${tr.top_supporters || 'Top Supporters'}
                    </h2>
                    <div id="supportersList" class="grid md:grid-cols-3 gap-4">
                        <!-- Will be populated by JavaScript -->
                    </div>
                </div>
            </div>
        </div>
        
        ${getFooter(lang)}
        
        <script>
            const lang = '${lang}';
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            let selectedAmount = 25;
            
            document.addEventListener('DOMContentLoaded', () => {
                loadSupporters();
            });
            
            function selectAmount(amount) {
                selectedAmount = amount;
                document.getElementById('customAmount').value = amount;
            }
            
            async function loadSupporters() {
                try {
                    const res = await fetch('/api/donations/top-supporters');
                    const data = await res.json();
                    
                    if (data.success && data.data && data.data.length > 0) {
                        document.getElementById('supportersList').innerHTML = data.data.map((s, i) => \`
                            <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 shadow-lg flex items-center gap-4">
                                <div class="relative">
                                    <img src="\${s.avatar}" class="w-12 h-12 rounded-full">
                                    <span class="absolute -top-1 -\${isRTL ? 'left' : 'right'}-1 w-6 h-6 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-bold">\${i + 1}</span>
                                </div>
                                <div class="flex-1">
                                    <p class="font-bold text-gray-900 dark:text-white">\${s.donor_name}</p>
                                    <p class="text-sm text-gray-500">$\${s.total_amount}</p>
                                </div>
                            </div>
                        \`).join('');
                    } else {
                        // Fallback to mock data
                        const supporters = [
                            { name: 'Anonymous', amount: 500, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=1' },
                            { name: 'Ahmed M.', amount: 200, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=2' },
                            { name: 'Sarah K.', amount: 150, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=3' }
                        ];
                        
                        document.getElementById('supportersList').innerHTML = supporters.map((s, i) => \`
                            <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 shadow-lg flex items-center gap-4">
                                <div class="relative">
                                    <img src="\${s.avatar}" class="w-12 h-12 rounded-full">
                                    <span class="absolute -top-1 -\${isRTL ? 'left' : 'right'}-1 w-6 h-6 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-bold">\${i + 1}</span>
                                </div>
                                <div class="flex-1">
                                    <p class="font-bold text-gray-900 dark:text-white">\${s.name}</p>
                                    <p class="text-sm text-gray-500">$\${s.amount}</p>
                                </div>
                            </div>
                        \`).join('');
                    }
                } catch (err) {
                    console.error('Failed to load supporters:', err);
                    // Use mock data on error
                    const supporters = [
                        { name: 'Anonymous', amount: 500, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=1' },
                        { name: 'Ahmed M.', amount: 200, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=2' },
                        { name: 'Sarah K.', amount: 150, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=3' }
                    ];
                    
                    document.getElementById('supportersList').innerHTML = supporters.map((s, i) => \`
                        <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 shadow-lg flex items-center gap-4">
                            <div class="relative">
                                <img src="\${s.avatar}" class="w-12 h-12 rounded-full">
                                <span class="absolute -top-1 -\${isRTL ? 'left' : 'right'}-1 w-6 h-6 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-bold">\${i + 1}</span>
                            </div>
                            <div class="flex-1">
                                <p class="font-bold text-gray-900 dark:text-white">\${s.name}</p>
                                <p class="text-sm text-gray-500">$\${s.amount}</p>
                            </div>
                        </div>
                    \`).join('');
                }
            }
            
            async function processDonation() {
                const amount = parseInt(document.getElementById('customAmount').value) || selectedAmount;
                if (amount < 1) {
                    if (window.Toast) {
                        window.Toast.error(tr.invalid_amount || 'Please enter a valid amount');
                    } else {
                        alert(tr.invalid_amount || 'Please enter a valid amount');
                    }
                    return;
                }
                
                // Ask for donor details
                const isAnonymous = !confirm(tr.donate_as_yourself || 'Would you like your name to appear in the supporters list?');
                let donorName = null;
                let donorEmail = null;
                
                if (!isAnonymous) {
                    donorName = prompt(tr.enter_your_name || 'Enter your name (will be shown publicly):');
                    if (!donorName) {
                        donorName = 'Anonymous';
                    }
                    donorEmail = prompt(tr.enter_your_email || 'Enter your email (for receipt, optional):');
                }
                
                // Select payment method
                const paymentMethod = prompt((tr.select_payment_method || 'Select payment method:') + '\\n1. Credit/Debit Card\\n2. PayPal\\n3. Stripe');
                if (!paymentMethod) return;
                
                let method = '';
                if (paymentMethod === '1') method = 'card';
                else if (paymentMethod === '2') method = 'paypal';
                else if (paymentMethod === '3') method = 'stripe';
                else {
                    if (window.Toast) {
                        window.Toast.error(tr.invalid_payment_method || 'Invalid payment method');
                    } else {
                        alert(tr.invalid_payment_method || 'Invalid payment method');
                    }
                    return;
                }
                
                try {
                    const res = await fetch('/api/donations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                        },
                        body: JSON.stringify({
                            amount: amount,
                            payment_method: method,
                            donor_name: donorName,
                            donor_email: donorEmail,
                            is_anonymous: isAnonymous
                        })
                    });
                    
                    const data = await res.json();
                    
                    if (data.success) {
                        // In production, redirect to payment processor
                        // For now, show success message
                        if (window.Toast) {
                            window.Toast.success(tr.donation_created || 'Thank you for your donation! You will be redirected to complete payment.');
                        } else {
                            alert(tr.donation_created || 'Thank you for your donation! You will be redirected to complete payment.');
                        }
                        // Simulate payment completion for demo
                        setTimeout(() => {
                            loadSupporters();
                        }, 1000);
                    } else {
                        if (window.Toast) {
                            window.Toast.error(data.error?.message || tr.donation_failed || 'Failed to process donation');
                        } else {
                            alert(data.error?.message || tr.donation_failed || 'Failed to process donation');
                        }
                    }
                } catch (err) {
                    console.error('Donation error:', err);
                    if (window.Toast) {
                        window.Toast.error(tr.donation_failed || 'Failed to process donation');
                    } else {
                        alert(tr.donation_failed || 'Failed to process donation');
                    }
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.donate || 'Support'));
};

export default donatePage;
