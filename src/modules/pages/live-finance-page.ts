import { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL, t } from '../../i18n';
import { getNavigation, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

export function liveFinanceDashboardPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const lang = c.get('lang');
    const tr = translations[getUILanguage(lang)];
    const rtl = isRTL(lang);
    const tt = (key: string) => t(`live_finance.${key}`, lang);
    const competitionId = c.req.param('id');

    const content = `
    ${getNavigation(lang)}
    <div class="flex-1">
        <div class="container mx-auto px-4 py-8 max-w-4xl">
            <h1 class="text-3xl font-bold mb-2">${tt('dashboard_title')}</h1>
            <p class="text-gray-500 mb-6">${tt('updating_realtime')}</p>

            <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                    <p class="text-gray-500 text-sm">${tt('total_ad_revenue')}</p>
                    <p class="text-3xl font-bold mt-2 text-green-500" id="liveTotalRevenue">$0.00</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                    <p class="text-gray-500 text-sm">${tt('platform_cut')}</p>
                    <p class="text-3xl font-bold mt-2 text-purple-500" id="livePlatformShare">$0.00</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                    <p class="text-gray-500 text-sm">${tt('competitor_pool')}</p>
                    <p class="text-3xl font-bold mt-2 text-blue-500" id="liveCompetitorPool">$0.00</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                    <p class="text-gray-500 text-sm">${tt('creator_payout')}</p>
                    <p class="text-2xl font-bold mt-2 text-emerald-500" id="liveCreatorShare">$0.00</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                    <p class="text-gray-500 text-sm">${tt('opponent_payout')}</p>
                    <p class="text-2xl font-bold mt-2 text-amber-500" id="liveOpponentShare">$0.00</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 text-center">
                    <p class="text-gray-500 text-sm">${tt('platform_percentage')}</p>
                    <p class="text-2xl font-bold mt-2" id="livePlatformPct">20%</p>
                </div>
            </div>

            <div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700 mb-6">
                <h2 class="text-xl font-bold mb-4">${tt('revenue_split')}</h2>
                <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-8 overflow-hidden flex">
                    <div id="platformBar" class="bg-purple-500 h-full transition-all duration-500" style="width:20%"></div>
                    <div id="creatorBar" class="bg-emerald-500 h-full transition-all duration-500" style="width:40%"></div>
                    <div id="opponentBar" class="bg-amber-500 h-full transition-all duration-500" style="width:40%"></div>
                </div>
                <div class="flex justify-between mt-3 text-sm">
                    <span class="text-purple-500">■ ${tt('platform_cut')}</span>
                    <span class="text-emerald-500">■ ${tt('creator_payout')}</span>
                    <span class="text-amber-500">■ ${tt('opponent_payout')}</span>
                </div>
            </div>

            <div class="grid grid-cols-2 gap-4 mb-6">
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p class="text-sm text-gray-500">${tt('creator_rating')}</p>
                    <p class="text-2xl font-bold" id="liveCreatorRating">0</p>
                </div>
                <div class="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                    <p class="text-sm text-gray-500">${tt('opponent_rating')}</p>
                    <p class="text-2xl font-bold" id="liveOpponentRating">0</p>
                </div>
            </div>
        </div>
    </div>
    ${getFooter(lang)}
    <script>
        const competitionId = '${competitionId}';
        async function pollLiveFinance() {
            try {
                const token = localStorage.getItem('session_id');
                const res = await fetch('/api/admin/live-finance/' + competitionId, { headers: { 'Authorization': 'Bearer ' + token } });
                const data = await res.json();
                if (data.success && data.data.snapshot) {
                    const s = data.data.snapshot;
                    document.getElementById('liveTotalRevenue').textContent = '$' + (s.total_ad_revenue || 0).toFixed(4);
                    document.getElementById('livePlatformShare').textContent = '$' + (s.platform_share || 0).toFixed(4);
                    document.getElementById('liveCompetitorPool').textContent = '$' + (s.competitor_pool || 0).toFixed(4);
                    document.getElementById('liveCreatorShare').textContent = '$' + (s.creator_share || 0).toFixed(4);
                    document.getElementById('liveOpponentShare').textContent = '$' + (s.opponent_share || 0).toFixed(4);
                    document.getElementById('livePlatformPct').textContent = (s.platform_percentage || 20) + '%';
                    document.getElementById('liveCreatorRating').textContent = (s.creator_rating || 0).toFixed(1);
                    document.getElementById('liveOpponentRating').textContent = (s.opponent_rating || 0).toFixed(1);
                    const total = s.total_ad_revenue || 1;
                    const pPct = ((s.platform_share || 0) / total * 100);
                    const cPct = ((s.creator_share || 0) / total * 100);
                    const oPct = ((s.opponent_share || 0) / total * 100);
                    document.getElementById('platformBar').style.width = pPct + '%';
                    document.getElementById('creatorBar').style.width = cPct + '%';
                    document.getElementById('opponentBar').style.width = oPct + '%';
                }
            } catch(e) { console.error(e); }
        }
        pollLiveFinance();
        setInterval(pollLiveFinance, 3000);
    </script>`;

    return c.html(generateHTML(content, lang, tt('dashboard_title')));
}
