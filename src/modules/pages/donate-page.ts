/**
 * Donate Page
 * صفحة التبرعات ودعم المنصة
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { DUELI_CARD, DUELI_CARD_FLAT, DUELI_INPUT, DUELI_SECTION_TITLE } from '../../shared/constants';
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
                    <div class="w-24 h-24 mx-auto bg-gradient-to-br from-violet-600 via-fuchsia-500 to-indigo-600 rounded-full flex items-center justify-center mb-6 shadow-lg shadow-purple-500/30">
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
                    <div class="${DUELI_CARD_FLAT} text-center hover:shadow-xl transition-shadow cursor-pointer border-2 border-transparent hover:border-purple-500" data-csp-on="click" data-csp-fn="selectAmount" data-csp-args='[5]'>
                        <p class="text-4xl font-bold text-purple-600 mb-2">$5</p>
                        <p class="text-gray-500">${tr.coffee || 'Buy us a coffee'}</p>
                    </div>
                    
                    <div class="${DUELI_CARD_FLAT} relative text-center hover:shadow-xl transition-shadow cursor-pointer border-2 border-purple-500" data-csp-on="click" data-csp-fn="selectAmount" data-csp-args='[25]'>
                        <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-purple-600 text-white text-xs px-3 py-1 rounded-full">${tr.popular}</div>
                        <p class="text-4xl font-bold text-purple-600 mb-2">$25</p>
                        <p class="text-gray-500">${tr.supporter || 'Supporter'}</p>
                    </div>
                    
                    <div class="${DUELI_CARD_FLAT} text-center hover:shadow-xl transition-shadow cursor-pointer border-2 border-transparent hover:border-purple-500" data-csp-on="click" data-csp-fn="selectAmount" data-csp-args='[100]'>
                        <p class="text-4xl font-bold text-purple-600 mb-2">$100</p>
                        <p class="text-gray-500">${tr.champion || 'Champion'}</p>
                    </div>
                </div>
                
                <!-- Custom Amount -->
                <div class="${DUELI_CARD} mb-8">
                    <h2 class="${DUELI_SECTION_TITLE} text-center">
                        ${tr.custom_amount || 'Or enter a custom amount'}
                    </h2>
                    <div class="flex items-center gap-4 max-w-md mx-auto">
                        <span class="text-2xl font-bold text-gray-500">$</span>
                        <input type="number" id="customAmount" min="1" placeholder="0" aria-label="${tr.custom_amount || 'Or enter a custom amount'}"
                            class="${DUELI_INPUT} text-center text-2xl font-bold">
                    </div>
                </div>
                
                <!-- Donate Button -->
                <button data-csp-on="click" data-csp-fn="processDonation" data-csp-args='[]' aria-label="${tr.donations?.send || 'Send donation'}" class="w-full py-4 bg-gradient-to-r from-purple-600 via-fuchsia-500 to-indigo-600 text-white rounded-xl font-bold hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/30 text-lg">
                    <i class="fas fa-heart ${rtl ? 'ml-2' : 'mr-2'}"></i>
                    ${tr.donate_now || 'Donate Now'}
                </button>
                <!-- 8.E: لا حد أقصى على مستوى Dueli (نص تفسيري بلا رقم مخترع) -->
                <p class="text-center text-xs text-gray-400 dark:text-gray-500 mt-3">${tr.donations?.max || ''}</p>

                <!-- 8.G-F3: سياسة عدم الاسترداد + موافقتان صريحتان (لا افتراضيات) -->
                <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-5 shadow mt-6">
                    <p class="text-sm font-bold text-amber-800 dark:text-amber-200 mb-4" role="note">
                        <i class="fas fa-exclamation-triangle ${rtl ? 'ml-2' : 'mr-2'}"></i>${tr.donations?.non_refundable || 'Donations are non-refundable once completed'}
                    </p>
                    <label class="flex items-start gap-3 mb-3 cursor-pointer">
                        <input type="checkbox" id="nonRefundableAccept" class="mt-1 w-5 h-5 accent-pink-600" aria-label="${tr.donations?.non_refundable_accept || 'Accept non-refundable policy'}">
                        <span class="text-sm text-gray-700 dark:text-gray-300">${tr.donations?.non_refundable_accept || 'I understand and accept that this donation is non-refundable'}</span>
                    </label>
                    <label class="flex items-start gap-3 cursor-pointer">
                        <input type="checkbox" id="amountConfirm" class="mt-1 w-5 h-5 accent-pink-600" aria-label="${tr.donations?.amount_confirm || 'Confirm donation amount'}">
                        <span class="text-sm text-gray-700 dark:text-gray-300">${tr.donations?.amount_confirm || 'I confirm this donation amount'}</span>
                    </label>
                </div>
                
                <!-- R2-F: My Donations (GET /api/donations/my, auth-aware) -->
                <div class="${DUELI_CARD} mb-8" id="myDonationsCard" hidden>
                    <h2 class="${DUELI_SECTION_TITLE} text-center">
                        <i class="fas fa-receipt ${rtl ? 'ml-2' : 'mr-2'} text-purple-500"></i>
                        ${tr.donations?.my_donations || 'My Donations'}
                    </h2>
                    <div id="myDonationsList" class="space-y-3">
                        <p class="text-center text-gray-400 text-sm py-4">${tr.loading || 'Loading...'}</p>
                    </div>
                </div>

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
        
        <script nonce="${(c.get('cspNonce') as string) ?? ''}">
            const lang = ${JSON.stringify(getUILanguage(lang))};
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            let selectedAmount = 25;
            
            document.addEventListener('DOMContentLoaded', () => {
                loadSupporters();
                showPaymentOutcome();
                loadMyDonations();
            });
            
            function selectAmount(amount) {
                selectedAmount = amount;
                document.getElementById('customAmount').value = amount;
            }
            
            async function loadSupporters() {
                // T4.1: real top supporters from the donations API (mock fallback)
                try {
                    const res = await fetch('/api/donations/top-supporters?lang=' + (window.lang || 'ar'));
                    const data = await res.json();
                    if (data.success && data.data?.length > 0) {
                        renderSupporters(data.data.map(function(s, i) {
                            return { name: s.donor_name || 'Anonymous', total_amount: s.total_amount,
                                     avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + encodeURIComponent(s.donor_name || i) };
                        }));
                        return;
                    }
                } catch (e) { console.error(e); }
                renderSupporters([]);
            }

            function renderSupporters(supporters) {
                if (!supporters.length) {
                    document.getElementById('supportersList').innerHTML =
                        '<p class="text-center text-gray-400 text-sm py-6">' + (tr.donations?.be_first || 'Be the first supporter!') + '</p>';
                    return;
                }
                document.getElementById('supportersList').innerHTML = supporters.map((s, i) => \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl p-4 shadow border border-gray-100 dark:border-gray-800 flex items-center gap-4">
                        <div class="relative">
                            <img src="\${s.avatar}" class="w-12 h-12 rounded-full">
                            <span class="absolute -top-1 -\${isRTL ? 'left' : 'right'}-1 w-6 h-6 bg-amber-500 text-white text-xs rounded-full flex items-center justify-center font-bold">\${i + 1}</span>
                        </div>
                        <div class="flex-1">
                            <p class="font-bold text-gray-900 dark:text-white">\${s.name}</p>
                            <p class="text-sm text-gray-500">$\${s.total_amount}</p>
                        </div>
                    </div>
                \`).join('');
            }

            async function processDonation() {
                const amount = parseFloat(document.getElementById('customAmount').value) || selectedAmount;
                if (amount < 1) {
                    window.dueli?.showToast(tr.payment_min_amount, 'error');
                    return;
                }

                // 8.G-F3: موافقتان صريحتان معاً — لا افتراضيات ولا موافقة
                // ضمنية بمجرد الضغط على Continue/Donate.
                const policyAccepted = document.getElementById('nonRefundableAccept')?.checked === true;
                if (!policyAccepted) {
                    window.dueli?.showToast(tr.donations?.non_refundable_required || tr.payment_failed, 'error');
                    return;
                }
                const amountOk = document.getElementById('amountConfirm')?.checked === true;
                if (!amountOk) {
                    window.dueli?.showToast(tr.donations?.amount_confirm_required || tr.payment_failed, 'error');
                    return;
                }

                // 8.E: تمرير سياق المتنافس/البث من الرابط (?competitor=&competition=)
                // إلى POST /api/donations — بلا أي حساب رسوم في العميل.
                const pageParams = new URLSearchParams(window.location.search);
                const competitorParam = pageParams.get('competitor');
                const competitionParam = pageParams.get('competition');
                const donationBody = {
                    amount: amount,
                    payment_method: 'stripe',
                    donor_name: window.currentUser?.display_name || undefined,
                    donor_email: window.currentUser?.email || undefined,
                    non_refundable_accepted: true,
                    amount_confirmed: true
                };
                if (competitorParam) donationBody.competitor_id = parseInt(competitorParam, 10);
                if (competitionParam) donationBody.competition_id = parseInt(competitionParam, 10);

                try {
                    const res = await fetch('/api/donations?lang=' + (window.lang || 'ar'), {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(donationBody)
                    });
                    const data = await res.json();
                    if (data.success && data.data?.payment_url) {
                        if (data.data.payment_url.startsWith('http')) {
                            // T4.1: real Stripe Checkout — hosted payment page
                            window.location.href = data.data.payment_url;
                        } else {
                            alert(tr.payment_failed);
                        }
                    } else {
                        alert(data.error?.message || tr.payment_failed);
                    }
                } catch (err) {
                    console.error(err);
                    alert(tr.payment_failed);
                }
            }

            // R2-F: donation history for the signed-in donor. Hidden for
            // guests (no session) — loading / empty / error states only.
            async function loadMyDonations() {
                const card = document.getElementById('myDonationsCard');
                const list = document.getElementById('myDonationsList');
                const token = (window.sessionId || localStorage.getItem('sessionId') || localStorage.getItem('session_id') || '');
                if (!token || !card || !list) return;
                card.hidden = false;
                try {
                    const res = await fetch('/api/donations/my?lang=' + (window.lang || 'ar'), {
                        headers: { 'Authorization': 'Bearer ' + token }
                    });
                    if (res.status === 401) { card.hidden = true; return; }
                    if (!res.ok) throw new Error('my donations failed');
                    const data = await res.json();
                    const items = (data.success && Array.isArray(data.data)) ? data.data : [];
                    if (!items.length) {
                        list.innerHTML = '<p class="text-center text-gray-400 text-sm py-4">' + (tr.donations?.my_donations_empty || 'No donations yet') + '</p>';
                        return;
                    }
                    list.innerHTML = items.map((d) => \`
                        <div class="flex items-center justify-between gap-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800">
                            <div class="flex items-center gap-3">
                                <span class="w-9 h-9 rounded-full bg-purple-100 dark:bg-purple-900/40 text-purple-600 flex items-center justify-center"><i class="fas fa-heart text-xs"></i></span>
                                <div>
                                    <p class="font-bold text-gray-900 dark:text-white">$\${d.amount} \${d.currency || ''}</p>
                                    <p class="text-xs text-gray-400">\${d.created_at ? new Date(d.created_at).toLocaleDateString() : ''}</p>
                                </div>
                            </div>
                            <span class="text-xs font-bold text-green-600 dark:text-green-400">\${d.payment_status || ''}</span>
                        </div>
                    \`).join('');
                } catch (e) {
                    console.error(e);
                    list.innerHTML = '<p class="text-center text-gray-400 text-sm py-4">' + (tr.donations?.my_donations_error || 'Could not load donations') + '</p>';
                }
            }

            // 8.C: عرض نتيجة العودة من Stripe Checkout (?paid=1 / ?cancelled=1).
            // 8.E: العودة لتبرع متنافس (?competitor=) تعرض رسالة الشكر المخصصة.
            function showPaymentOutcome() {
                const params = new URLSearchParams(window.location.search);
                if (params.get('paid') === '1') {
                    const thanked = params.get('competitor')
                        ? (tr.donations?.thanks || tr.donation_completed)
                        : tr.donation_completed;
                    window.dueli?.showToast(thanked, 'success');
                } else if (params.get('cancelled') === '1') {
                    window.dueli?.showToast(tr.payment_cancelled, 'error');
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.donate || 'Support', (c.get('cspNonce') as string) ?? ''));
};

export default donatePage;
