/**
 * Reports Page
 * صفحة الشكاوى والبلاغات
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
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
                    <i class="fas fa-flag ${rtl ? 'ml-3' : 'mr-3'} text-orange-500"></i>
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
        
        <script>
            const lang = '${lang}';
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            
            document.addEventListener('DOMContentLoaded', async () => {
                await checkAuth();
                if (window.currentUser) {
                    renderReportForm();
                } else {
                    showLoginRequired();
                }
            });
            
            function showLoginRequired() {
                document.getElementById('reportsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-8 text-center shadow-lg">
                        <i class="fas fa-lock text-4xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500">\${tr.login_required || 'Please login to submit a report'}</p>
                        <button onclick="showLoginModal()" class="mt-4 px-6 py-2 bg-purple-600 text-white rounded-full">
                            \${tr.login || 'Login'}
                        </button>
                    </div>
                \`;
            }
            
            function renderReportForm() {
                document.getElementById('reportsContent').innerHTML = \`
                    <form onsubmit="submitReport(event)" class="space-y-6">
                        <!-- Report Type -->
                        <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-6 shadow-lg">
                            <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
                                <i class="fas fa-list \${isRTL ? 'ml-2' : 'mr-2'} text-purple-600"></i>
                                \${tr.report_type || 'Report Type'}
                            </h2>
                            
                            <div class="space-y-3">
                                <label class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <input type="radio" name="reportType" value="inappropriate" class="w-5 h-5 text-purple-600">
                                    <div>
                                        <p class="font-medium text-gray-900 dark:text-white">\${tr.report_inappropriate || 'Inappropriate Content'}</p>
                                        <p class="text-sm text-gray-500">\${tr.report_inappropriate_desc || 'Offensive or harmful content'}</p>
                                    </div>
                                </label>
                                
                                <label class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <input type="radio" name="reportType" value="spam" class="w-5 h-5 text-purple-600">
                                    <div>
                                        <p class="font-medium text-gray-900 dark:text-white">\${tr.report_spam || 'Spam or Misleading'}</p>
                                        <p class="text-sm text-gray-500">\${tr.report_spam_desc || 'Fake or deceptive content'}</p>
                                    </div>
                                </label>
                                
                                <label class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <input type="radio" name="reportType" value="harassment" class="w-5 h-5 text-purple-600">
                                    <div>
                                        <p class="font-medium text-gray-900 dark:text-white">\${tr.report_harassment || 'Harassment or Bullying'}</p>
                                        <p class="text-sm text-gray-500">\${tr.report_harassment_desc || 'Targeting or attacking others'}</p>
                                    </div>
                                </label>
                                
                                <label class="flex items-center gap-3 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700">
                                    <input type="radio" name="reportType" value="other" class="w-5 h-5 text-purple-600">
                                    <div>
                                        <p class="font-medium text-gray-900 dark:text-white">\${tr.other || 'Other'}</p>
                                        <p class="text-sm text-gray-500">\${tr.other_desc || 'Something else'}</p>
                                    </div>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Subject -->
                        <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-6 shadow-lg">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">\${tr.subject || 'Subject'}</label>
                            <input type="text" id="reportSubject" required
                                class="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white"
                                placeholder="\${tr.enter_subject || 'Enter subject'}">
                        </div>
                        
                        <!-- Description -->
                        <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-6 shadow-lg">
                            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">\${tr.description || 'Description'}</label>
                            <textarea id="reportDescription" rows="5" required
                                class="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white resize-none"
                                placeholder="\${tr.describe_issue || 'Please describe the issue in detail'}"></textarea>
                        </div>
                        
                        <!-- Submit Button -->
                        <button type="submit" class="w-full py-4 bg-gradient-to-r from-orange-600 to-red-600 text-white rounded-xl font-bold hover:opacity-90 transition-opacity shadow-lg">
                            <i class="fas fa-paper-plane \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.submit || 'Submit Report'}
                        </button>
                    </form>
                \`;
            }
            
            async function submitReport(e) {
                e.preventDefault();
                
                const reportType = document.querySelector('input[name="reportType"]:checked')?.value;
                if (!reportType) {
                    window.dueli?.toast?.error?.(\`\${tr.select_reason || 'Please select a report type'}\`);
                    return;
                }
                
                const report = {
                    type: reportType,
                    subject: document.getElementById('reportSubject').value,
                    description: document.getElementById('reportDescription').value
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
                        window.dueli?.toast?.success?.(\`\${tr.report_submitted || 'Report submitted successfully!'}\`);
                        document.getElementById('reportSubject').value = '';
                        document.getElementById('reportDescription').value = '';
                    } else {
                        window.dueli?.toast?.error?.(\`\${tr.error_occurred || 'Failed to submit report'}\`);
                    }
                } catch (err) {
                    console.error('Failed to submit report:', err);
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.submit_report || 'Submit Report'));
};

export default reportsPage;
