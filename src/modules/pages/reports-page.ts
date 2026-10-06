/**
 * Reports Page
 * صفحة الشكاوى والبلاغات
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { DUELI_PRIMARY_BTN, DUELI_PRIMARY_GRADIENT, DUELI_CARD, DUELI_INPUT, DUELI_SECTION_TITLE } from '../../shared/constants';
import { generateHTML } from '../../shared/templates/layout';

/**
 * Reports Page Handler
 */
export const reportsPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}
        
        <div class="flex-1 bg-gray-50 dark:bg-[#0f0f0f]">
            <div class="container mx-auto px-4 py-8 max-w-2xl">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-8">
                    <i class="fas fa-flag ${rtl ? 'ml-3' : 'mr-3'} text-purple-500"></i>
                    ${tr.submit_report || 'Submit Report'}
                </h1>
                
                <div id="reportsContent">
                    <div class="text-center py-12">
                        <i class="fas fa-spinner fa-spin text-4xl text-purple-400"></i>
                    </div>
                </div>
            </div>
        </div>
        
        ${getFooter(lang)}
        
        <script nonce="${(c.get('cspNonce') as string) ?? ''}">
            const lang = ${JSON.stringify(getUILanguage(lang))};
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            const PRIMARY_BTN = ${JSON.stringify(DUELI_PRIMARY_BTN)};
            const GRADIENT = ${JSON.stringify(DUELI_PRIMARY_GRADIENT)};
            const CARD = ${JSON.stringify(DUELI_CARD)};
            const INPUT = ${JSON.stringify(DUELI_INPUT)};
            const SECTION_TITLE = ${JSON.stringify(DUELI_SECTION_TITLE)};
            
            document.addEventListener('DOMContentLoaded', initPageAuth);

            // Post-R1 acceptance: canonical auth lifecycle shared with
            // App.init — transient 'unknown' renders retrying, never a false
            // Login Required; login updates this page without a reload.
            async function initPageAuth() {
                try {
                    await checkAuth();
                } catch (err) {
                    console.error('Auth check failed:', err);
                }
                if (window.currentUser) {
                    renderReportForm();
                } else if (typeof authStatus === 'function' && authStatus() === 'unknown') {
                    showAuthPending();
                } else {
                    showLoginRequired();
                }
            }
            window.addEventListener('dueli:auth-success', () => {
                if (window.currentUser) renderReportForm();
                else initPageAuth();
            });
            window.retryPageAuth = initPageAuth;

            function showAuthPending() {
                document.getElementById('reportsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-8 text-center shadow-lg">
                        <i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i>
                        <p class="text-gray-500">\${tr.loading || 'Checking your session...'}</p>
                        <button data-csp-on="click" data-csp-fn="retryPageAuth" data-csp-args='[]' class="mt-4 px-6 py-2 \${PRIMARY_BTN}">
                            \${(tr.discovery && tr.discovery.retry) || tr.retry || 'Retry'}
                        </button>
                    </div>
                \`;
            }
            
            function showLoginRequired() {
                document.getElementById('reportsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-8 text-center shadow-lg">
                        <i class="fas fa-lock text-4xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500">\${tr.login_required || 'Please login to submit a report'}</p>
                        <button data-csp-on="click" data-csp-fn="showLoginModal" data-csp-args='[]' class="mt-4 px-6 py-2 \${PRIMARY_BTN}">
                            \${tr.login || 'Login'}
                        </button>
                    </div>
                \`;
            }
            
            function renderReportForm() {
                const params = new URLSearchParams(window.location.search);
                const presetType = params.get('target_type') || '';
                const presetId = params.get('target_id') || '';
                const targetTypes = ['user', 'competition', 'comment', 'message', 'ad'];
                document.getElementById('reportsContent').innerHTML = \`
                    <form data-csp-on="submit" data-csp-fn="submitReport" data-csp-args='["@event"]' class="space-y-6">
                        <!-- Target -->
                        <div class="\${CARD}">
                            <h2 class="\${SECTION_TITLE}">
                                <i class="fas fa-crosshairs \${isRTL ? 'ml-2' : 'mr-2'} text-purple-500"></i>
                                \${(tr.report && tr.report.target_type) || 'Report about'}
                            </h2>
                            <div class="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">\${(tr.report && tr.report.target_type) || 'Report about'}</label>
                                    <select id="reportTargetType" required class="\${INPUT}">
                                        <option value="">\${(tr.report && tr.report.select_target_type) || 'Select what to report'}</option>
                                        \${targetTypes.map(tt => \`<option value="\${tt}" \${presetType === tt ? 'selected' : ''}>\${tt}</option>\`).join('')}
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">\${(tr.report && tr.report.target_id) || 'Target ID'}</label>
                                    <input type="number" id="reportTargetId" min="1" step="1" required value="\${presetId.replace(/[^0-9]/g, '')}"
                                        class="\${INPUT}"
                                        placeholder="\${(tr.report && tr.report.target_id_placeholder) || ''}">
                                </div>
                            </div>
                        </div>

                        <!-- Reason -->
                        <div class="\${CARD}">
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">\${(tr.report && tr.report.reason) || 'Reason'}</label>
                            <select id="reportReason" required class="\${INPUT}">
                                <option value="">\${(tr.report && tr.report.select_reason) || 'Select a reason'}</option>
                            </select>
                        </div>

                        <!-- Description -->
                        <div class="\${CARD}">
                            <label class="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">\${(tr.report && tr.report.description) || tr.description}</label>
                            <textarea id="reportDescription" rows="5"
                                class="\${INPUT} resize-none"
                                placeholder="\${(tr.report && tr.report.description_placeholder) || tr.describe_issue || ''}"></textarea>
                        </div>

                        <!-- Submit Button -->
                        <button type="submit" class="w-full py-4 \${GRADIENT} text-white rounded-xl font-bold hover:opacity-90 transition-opacity shadow-lg shadow-purple-500/20">
                            <i class="fas fa-paper-plane \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${(tr.report && tr.report.submit) || tr.submit || 'Submit Report'}
                        </button>
                    </form>
                \`;
                loadReportReasons(presetType);
                document.getElementById('reportTargetType').addEventListener('change', (e) => {
                    loadReportReasons(e.target.value);
                });
            }

            async function loadReportReasons(targetType) {
                const sel = document.getElementById('reportReason');
                if (!sel) return;
                try {
                    const res = await fetch('/api/reports/reasons');
                    const data = await res.json();
                    const reasons = (data.success && data.data && data.data.reasons && data.data.reasons[targetType]) || [];
                    const label = (r) => ((tr.report && tr.report['reason_' + r]) || r);
                    sel.innerHTML = \`<option value="">\${(tr.report && tr.report.select_reason) || 'Select a reason'}</option>\` +
                        reasons.map(r => \`<option value="\${r}">\${label(r)}</option>\`).join('');
                } catch (err) {
                    console.error('Failed to load report reasons:', err);
                }
            }

            async function submitReport(e) {
                e.preventDefault();

                const targetType = document.getElementById('reportTargetType')?.value;
                const targetId = parseInt(document.getElementById('reportTargetId')?.value, 10);
                const reason = document.getElementById('reportReason')?.value;
                if (!targetType || !Number.isInteger(targetId) || targetId <= 0 || !reason) {
                    window.dueli?.toast?.error?.(\`\${(tr.report && tr.report.select_reason) || tr.select_reason || 'Please select a report type'}\`);
                    return;
                }

                const report = {
                    target_type: targetType,
                    target_id: targetId,
                    reason,
                    description: document.getElementById('reportDescription').value || undefined
                };

                try {
                    const res = await fetch('/api/reports', {
                        method: 'POST',
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(report)
                    });

                    if (res.ok) {
                        window.dueli?.toast?.success?.(\`\${(tr.report && tr.report.submitted) || tr.report_submitted || 'Report submitted successfully!'}\`);
                        document.getElementById('reportTargetId').value = '';
                        document.getElementById('reportDescription').value = '';
                    } else {
                        const data = await res.json().catch(() => null);
                        const msg = (data && data.error && data.error.message)
                            || (res.status === 400 && (tr.report && tr.report.already_reported))
                            || \`\${tr.error_occurred || 'Failed to submit report'}\`;
                        window.dueli?.toast?.error?.(msg);
                    }
                } catch (err) {
                    console.error('Failed to submit report:', err);
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.submit_report || 'Submit Report', (c.get('cspNonce') as string) ?? ''));
};

export default reportsPage;
