import { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL, t } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

export function advertiserPortalPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const lang = c.get('lang');
    const tr = translations[getUILanguage(lang)];
    const rtl = isRTL(lang);
    const tt = (key: string) => t(`advertiser.${key}`, lang);

    const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    <div class="flex-1">
        <div class="container mx-auto px-4 py-8 max-w-6xl">
            <div class="flex items-center justify-between mb-8">
                <div>
                    <h1 class="text-3xl font-bold">${tt('portal_title')}</h1>
                    <p class="text-gray-500 mt-1">${tt('dashboard')}</p>
                </div>
                <button onclick="showCreateCampaignForm()" class="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-colors">
                    <i class="fas fa-plus mr-2"></i>${tt('create_campaign')}
                </button>
            </div>

            <div id="campaignStats" class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p class="text-gray-500 text-sm">${tt('total_budget')}</p>
                    <p class="text-2xl font-bold mt-1" id="totalBudget">$0.00</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p class="text-gray-500 text-sm">${tt('total_remaining')}</p>
                    <p class="text-2xl font-bold mt-1 text-green-500" id="totalRemaining">$0.00</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p class="text-gray-500 text-sm">${tt('impressions')}</p>
                    <p class="text-2xl font-bold mt-1" id="totalImpressions">0</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p class="text-gray-500 text-sm">${tt('active_campaigns')}</p>
                    <p class="text-2xl font-bold mt-1 text-purple-500" id="activeCampaigns">0</p>
                </div>
            </div>

            <h2 class="text-xl font-bold mb-4">${tt('my_campaigns')}</h2>
            <div id="campaignsList" class="space-y-4">
                <div class="text-center py-12 text-gray-400">
                    <i class="fas fa-bullhorn text-4xl mb-3"></i>
                    <p>${tt('no_campaigns')}</p>
                </div>
            </div>

            <div id="createCampaignForm" class="hidden mt-8 bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">
                <h3 class="text-xl font-bold mb-4">${tt('create_campaign')}</h3>
                <form onsubmit="createCampaign(event)" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium mb-1">${tt('campaign_title')}</label>
                        <input type="text" id="campaignTitle" required class="w-full px-4 py-2 rounded-xl border dark:border-gray-600 bg-transparent" />
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">${tt('budget')} ($)</label>
                            <input type="number" id="campaignBudget" step="0.01" min="1" required class="w-full px-4 py-2 rounded-xl border dark:border-gray-600 bg-transparent" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">${tt('revenue_per_view')} ($)</label>
                            <input type="number" id="revenuePerView" step="0.0001" min="0.0001" value="0.001" required class="w-full px-4 py-2 rounded-xl border dark:border-gray-600 bg-transparent" />
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">${tt('image_url')}</label>
                            <input type="url" id="campaignImage" class="w-full px-4 py-2 rounded-xl border dark:border-gray-600 bg-transparent" />
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">${tt('link_url')}</label>
                            <input type="url" id="campaignLink" class="w-full px-4 py-2 rounded-xl border dark:border-gray-600 bg-transparent" />
                        </div>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium mb-1">${tt('target_language')}</label>
                            <select id="targetLanguage" class="w-full px-4 py-2 rounded-xl border dark:border-gray-600 bg-transparent">
                                <option value="">${tr.all}</option>
                                <option value="ar">العربية</option>
                                <option value="en">English</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-sm font-medium mb-1">${tt('target_country')}</label>
                            <input type="text" id="targetCountry" class="w-full px-4 py-2 rounded-xl border dark:border-gray-600 bg-transparent" placeholder="SA, AE, US..." />
                        </div>
                    </div>
                    <button type="submit" class="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold transition-colors">${tt('create_campaign')}</button>
                </form>
            </div>
        </div>
    </div>
    ${getFooter(lang)}
    <script>
        async function loadAdvertiserDashboard() {
            try {
                const token = localStorage.getItem('session_id');
                if (!token) return;
                const res = await fetch('/api/advertiser/dashboard', { headers: { 'Authorization': 'Bearer ' + token } });
                const data = await res.json();
                if (data.success) {
                    const d = data.data;
                    document.getElementById('totalBudget').textContent = '$' + (d.total_budget || 0).toFixed(2);
                    document.getElementById('totalRemaining').textContent = '$' + (d.total_remaining || 0).toFixed(2);
                    document.getElementById('totalImpressions').textContent = d.total_impressions || 0;
                    document.getElementById('activeCampaigns').textContent = d.active_campaigns || 0;
                    renderCampaigns(d.campaigns || []);
                }
            } catch(e) { console.error(e); }
        }
        function renderCampaigns(campaigns) {
            const list = document.getElementById('campaignsList');
            if (!campaigns.length) { list.innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-bullhorn text-4xl mb-3"></i><p>${tt("no_campaigns")}</p></div>'; return; }
            list.innerHTML = campaigns.map(c => '<div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700"><div class="flex justify-between items-start"><div><h3 class="font-bold text-lg">' + c.title + '</h3><div class="flex gap-4 mt-2 text-sm text-gray-500"><span>' + '${tt("impressions")}: ' + c.total_impressions + '</span><span>' + '${tt("clicks")}: ' + c.total_clicks + '</span><span>' + '${tt("ctr")}: ' + (c.ctr * 100).toFixed(2) + '%</span></div></div><div class="text-right"><span class="px-3 py-1 rounded-full text-xs font-bold ' + (c.campaign_status === 'active' ? 'bg-green-100 text-green-700' : c.campaign_status === 'paused' ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700') + '">' + c.campaign_status + '</span><p class="text-sm mt-1">$' + c.budget_remaining.toFixed(2) + ' / $' + c.budget.toFixed(2) + '</p>' + (c.campaign_status === 'active' ? '<button onclick="pauseCampaign(' + c.ad_id + ')" class="text-xs text-yellow-600 mt-1">${tt("pause_campaign")}</button>' : c.campaign_status === 'paused' ? '<button onclick="resumeCampaign(' + c.ad_id + ')" class="text-xs text-green-600 mt-1">${tt("resume_campaign")}</button>' : '') + '</div></div></div>').join('');
        }
        function showCreateCampaignForm() { document.getElementById('createCampaignForm').classList.toggle('hidden'); }
        async function createCampaign(e) {
            e.preventDefault();
            const token = localStorage.getItem('session_id');
            const body = { title: document.getElementById('campaignTitle').value, budget: parseFloat(document.getElementById('campaignBudget').value), revenue_per_view: parseFloat(document.getElementById('revenuePerView').value), image_url: document.getElementById('campaignImage').value || undefined, link_url: document.getElementById('campaignLink').value || undefined, target_language: document.getElementById('targetLanguage').value || undefined, target_country: document.getElementById('targetCountry').value || undefined };
            const res = await fetch('/api/advertiser/campaigns', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
            if (res.ok) { loadAdvertiserDashboard(); document.getElementById('createCampaignForm').classList.add('hidden'); }
        }
        async function pauseCampaign(id) { const token = localStorage.getItem('session_id'); await fetch('/api/advertiser/campaigns/' + id + '/pause', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + token } }); loadAdvertiserDashboard(); }
        async function resumeCampaign(id) { const token = localStorage.getItem('session_id'); await fetch('/api/advertiser/campaigns/' + id + '/resume', { method: 'PUT', headers: { 'Authorization': 'Bearer ' + token } }); loadAdvertiserDashboard(); }
        loadAdvertiserDashboard();
    </script>`;

    return c.html(generateHTML(content, lang, tt('portal_title')));
}
