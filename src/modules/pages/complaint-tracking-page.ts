import { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL, t } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';

export function complaintTrackingPage(c: Context<{ Bindings: Bindings; Variables: Variables }>) {
    const lang = c.get('lang');
    const tr = translations[getUILanguage(lang)];
    const rtl = isRTL(lang);
    const tt = (key: string) => t(`arbitration.${key}`, lang);

    const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    <div class="flex-1">
        <div class="container mx-auto px-4 py-8 max-w-4xl">
            <h1 class="text-3xl font-bold mb-2">${tt('my_complaints')}</h1>
            <p class="text-gray-500 mb-8">${tt('track_complaint')}</p>

            <div id="complaintsList" class="space-y-4">
                <div class="text-center py-12 text-gray-400">
                    <i class="fas fa-gavel text-4xl mb-3"></i>
                    <p>${tt('no_complaints')}</p>
                </div>
            </div>

            <div id="complaintDetail" class="hidden">
                <button onclick="backToList()" class="mb-4 text-purple-600 hover:underline"><i class="fas fa-arrow-left mr-2"></i>${tr.back}</button>
                <div id="complaintDetailContent"></div>
            </div>
        </div>
    </div>
    ${getFooter(lang)}
    <style>
        .arb-status { display: inline-block; padding: 2px 12px; border-radius: 9999px; font-size: 0.75rem; font-weight: 700; }
        .arb-submitted { background: #e0e7ff; color: #4338ca; }
        .arb-under_review { background: #fef3c7; color: #92400e; }
        .arb-investigation { background: #fce7f3; color: #9d174d; }
        .arb-resolved { background: #d1fae5; color: #065f46; }
        .arb-rejected { background: #fee2e2; color: #991b1b; }
        .state-timeline { position: relative; padding-left: 24px; border-left: 2px solid #e5e7eb; }
        .state-timeline .entry { position: relative; padding-bottom: 16px; }
        .state-timeline .entry::before { content: ''; position: absolute; left: -29px; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: #8b5cf6; }
    </style>
    <script>
        async function loadComplaints() {
            try {
                const token = localStorage.getItem('session_id');
                if (!token) return;
                const res = await fetch('/api/complaints/my', { headers: { 'Authorization': 'Bearer ' + token } });
                const data = await res.json();
                if (data.success && data.data.complaints && data.data.complaints.length) {
                    document.getElementById('complaintsList').innerHTML = data.data.complaints.map(c => {
                        const report = c.report;
                        const statusClass = 'arb-' + c.current_status;
                        return '<div onclick="viewComplaint(' + report.id + ')" class="bg-white dark:bg-gray-800 rounded-2xl p-5 shadow-sm border border-gray-100 dark:border-gray-700 cursor-pointer hover:border-purple-300 transition-colors"><div class="flex justify-between items-start"><div><h3 class="font-bold">${t("report.reason", lang)}: ' + report.reason + '</h3><p class="text-sm text-gray-500 mt-1">${t("report.target_type", lang)}: ' + report.target_type + ' #' + report.target_id + '</p><p class="text-xs text-gray-400 mt-1">' + new Date(report.created_at).toLocaleString() + '</p></div><span class="arb-status ' + statusClass + '">' + c.current_status + '</span></div>' + (c.assigned_admin_role ? '<p class="text-sm text-gray-500 mt-2">${tt("assigned_admin")}: <span class="font-medium">' + c.assigned_admin_role + '</span></p>' : '') + '</div>';
                    }).join('');
                } else {
                    document.getElementById('complaintsList').innerHTML = '<div class="text-center py-12 text-gray-400"><i class="fas fa-gavel text-4xl mb-3"></i><p>${tt("no_complaints")}</p></div>';
                }
            } catch(e) { console.error(e); }
        }
        async function viewComplaint(id) {
            try {
                const token = localStorage.getItem('session_id');
                const res = await fetch('/api/complaints/' + id, { headers: { 'Authorization': 'Bearer ' + token } });
                const data = await res.json();
                if (!data.success) return;
                const c = data.data.tracker;
                const report = c.report;
                document.getElementById('complaintsList').classList.add('hidden');
                document.getElementById('complaintDetail').classList.remove('hidden');
                const statusClass = 'arb-' + c.current_status;
                let html = '<div class="bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-sm border border-gray-100 dark:border-gray-700">';
                html += '<div class="flex justify-between items-start mb-4"><h2 class="text-xl font-bold">' + report.reason + '</h2><span class="arb-status ' + statusClass + '">' + c.current_status + '</span></div>';
                html += '<div class="space-y-2 text-sm text-gray-600 dark:text-gray-400">';
                html += '<p><strong>${t("report.target_type", lang)}:</strong> ' + report.target_type + ' #' + report.target_id + '</p>';
                if (report.description) html += '<p><strong>${t("report.description", lang)}:</strong> ' + report.description + '</p>';
                if (c.assigned_admin_role) html += '<p><strong>${tt("assigned_admin")}:</strong> ' + c.assigned_admin_role + '</p>';
                html += '</div>';
                if (c.state_history && c.state_history.length) {
                    html += '<h3 class="text-lg font-bold mt-6 mb-3">${tt("state_history")}</h3>';
                    html += '<div class="state-timeline">';
                    c.state_history.forEach(h => {
                        html += '<div class="entry"><p class="font-bold text-sm">' + h.from_state + ' → ' + h.to_state + '</p>';
                        if (h.admin_role) html += '<p class="text-xs text-gray-500">${tt("admin_role")}: ' + h.admin_role + '</p>';
                        if (h.notes) html += '<p class="text-xs text-gray-500">${tt("transition_notes")}: ' + h.notes + '</p>';
                        html += '<p class="text-xs text-gray-400">' + new Date(h.created_at).toLocaleString() + '</p></div>';
                    });
                    html += '</div>';
                }
                html += '</div>';
                document.getElementById('complaintDetailContent').innerHTML = html;
            } catch(e) { console.error(e); }
        }
        function backToList() {
            document.getElementById('complaintsList').classList.remove('hidden');
            document.getElementById('complaintDetail').classList.add('hidden');
        }
        loadComplaints();
    </script>`;

    return c.html(generateHTML(content, lang, tt('my_complaints')));
}
