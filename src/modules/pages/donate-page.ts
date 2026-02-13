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
                
                <!-- Message -->
                <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-lg mb-8">
                    <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4 text-center">
                        ${tr.leave_message || 'Leave a message (optional)'}
                    </h2>
                    <textarea id="donationMessage" rows="2" maxlength="200"
                        class="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white resize-none"
                        placeholder="${tr.donation_message_placeholder || 'Your message to the Dueli team...'}"></textarea>
                    <div class="mt-4 flex items-center justify-center gap-2">
                        <input type="checkbox" id="anonymousDonation" class="w-5 h-5 rounded text-purple-600 focus:ring-purple-500">
                        <label for="anonymousDonation" class="text-gray-700 dark:text-gray-300">${tr.donate_anonymously || 'Donate anonymously'}</label>
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
                        <div class="text-center py-8">
                            <i class="fas fa-spinner fa-spin text-3xl text-purple-400"></i>
                        </div>
                    </div>
                    <div id="totalDonations" class="text-center mt-4 text-gray-600 dark:text-gray-400"></div>
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
                    
                    if (data.success && data.supporters.length > 0) {
                        document.getElementById('supportersList').innerHTML = data.supporters.map((s, i) => \`
                            <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-4 shadow-lg flex items-center gap-4">
                                <div class="relative">
                                    <img src="\${s.avatar}" class="w-12 h-12 rounded-full">
                                    <span class="absolute -top-1 -\${isRTL ? 'left' : 'right'}-1 w-6 h-6 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-bold">\${i + 1}</span>
                                </div>
                                <div class="flex-1">
                                    <p class="font-bold text-gray-900 dark:text-white">\${s.name}</p>
                                    <p class="text-sm text-gray-500">\\$\${s.amount.toFixed(2)}</p>
                                    \${s.message ? \`<p class="text-xs text-gray-400 mt-1 italic">"\${s.message}"</p>\` : ''}
                                </div>
                            </div>
                        \`).join('');
                        
                        if (data.total_donations > 0) {
                            document.getElementById('totalDonations').innerHTML = 
                                \`<p class="text-lg">\${tr.total_raised || 'Total raised:'} <span class="font-bold text-purple-600">\\$\${data.total_donations.toFixed(2)}</span></p>\`;
                        }
                    } else {
                        document.getElementById('supportersList').innerHTML = \`
                            <div class="col-span-3 text-center py-8 text-gray-500">
                                <i class="fas fa-heart text-4xl mb-4 text-gray-300"></i>
                                <p>\${tr.no_supporters_yet || 'Be the first to support Dueli!'}</p>
                            </div>
                        \`;
                    }
                } catch (err) {
                    console.error('Failed to load supporters:', err);
                    document.getElementById('supportersList').innerHTML = \`
                        <div class="col-span-3 text-center py-8 text-gray-500">
                            <p>\${tr.failed_load_supporters || 'Failed to load supporters'}</p>
                        </div>
                    \`;
                }
            }
            
            async function processDonation() {
                const amount = parseInt(document.getElementById('customAmount').value) || selectedAmount;
                if (amount < 1) {
                    alert(tr.invalid_amount || 'Please enter a valid amount');
                    return;
                }
                
                const message = document.getElementById('donationMessage').value;
                const isAnonymous = document.getElementById('anonymousDonation').checked;
                
                const donateBtn = document.querySelector('button[onclick="processDonation()"]');
                donateBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + (tr.processing || 'Processing...');
                donateBtn.disabled = true;
                
                try {
                    const res = await fetch('/api/donations/create-intent', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId') || ''),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            amount: amount,
                            currency: 'USD',
                            message: message,
                            is_anonymous: isAnonymous
                        })
                    });
                    
                    const data = await res.json();
                    
                    if (data.success) {
                        // Simulate payment confirmation (in production, this would be Stripe checkout)
                        const confirmRes = await fetch('/api/donations/confirm', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json'
                            },
                            body: JSON.stringify({
                                donation_id: data.donation_id,
                                payment_intent_id: data.client_secret
                            })
                        });
                        
                        const confirmData = await confirmRes.json();
                        
                        if (confirmData.success) {
                            alert((tr.thank_you_donation || 'Thank you for your donation!') + '\\n' + 
                                  (tr.amount || 'Amount:') + ' $' + amount);
                            document.getElementById('customAmount').value = '';
                            document.getElementById('donationMessage').value = '';
                            document.getElementById('anonymousDonation').checked = false;
                            loadSupporters(); // Refresh supporters list
                        } else {
                            alert(tr.payment_failed || 'Payment failed. Please try again.');
                        }
                    } else {
                        alert((tr.donation_failed || 'Failed to create donation:') + ' ' + (data.error || ''));
                    }
                } catch (err) {
                    console.error('Donation error:', err);
                    alert(tr.donation_error || 'An error occurred. Please try again later.');
                } finally {
                    donateBtn.innerHTML = '<i class="fas fa-heart"></i> ' + (tr.donate_now || 'Donate Now');
                    donateBtn.disabled = false;
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.donate || 'Support'));
};

export default donatePage;
