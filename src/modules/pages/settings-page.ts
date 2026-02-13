/**
 * Settings Page
 * صفحة الإعدادات
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { generateHTML } from '../../shared/templates/layout';
import { getCountriesList } from '../../countries';

/**
 * Settings Page Handler
 */
export const settingsPage = async (c: Context<{ Bindings: Bindings; Variables: Variables }>) => {
    const lang = c.get('lang') as Language;
    const tr = translations[getUILanguage(lang)];
    const rtl = checkRTL(lang);
    const countries = getCountriesList();

    const content = `
        ${getNavigation(lang)}
        ${getLoginModal(lang)}
        
        <div class="flex-1 bg-gray-50 dark:bg-[#0f0f0f]">
            <div class="container mx-auto px-4 py-8 max-w-2xl">
                <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-8">
                    <i class="fas fa-cog ${rtl ? 'ml-3' : 'mr-3'} text-purple-600"></i>
                    ${tr.settings || 'Settings'}
                </h1>
                
                <div id="settingsContent">
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
            const countries = ${JSON.stringify(countries)};
            let currentSettings = {};
            
            document.addEventListener('DOMContentLoaded', async () => {
                await checkAuth();
                if (window.currentUser) {
                    loadSettings();
                } else {
                    showLoginRequired();
                }
            });
            
            function showLoginRequired() {
                document.getElementById('settingsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-8 text-center shadow-lg">
                        <i class="fas fa-lock text-4xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500">\${tr.login_required || 'Please login to access settings'}</p>
                        <button onclick="showLoginModal()" class="mt-4 px-6 py-2 bg-purple-600 text-white rounded-full">
                            \${tr.login || 'Login'}
                        </button>
                    </div>
                \`;
            }
            
            async function loadSettings() {
                try {
                    const res = await fetch('/api/settings', {
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                        }
                    });
                    const data = await res.json();
                    currentSettings = data.data || {};
                    renderSettings();
                } catch (err) {
                    console.error('Failed to load settings:', err);
                }
            }
            
            function renderSettings() {
                const user = window.currentUser || {};
                document.getElementById('settingsContent').innerHTML = \`
                    <form onsubmit="saveSettings(event)" class="space-y-6">
                        <!-- Profile Section -->
                        <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-6 shadow-lg">
                            <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
                                <i class="fas fa-user \${isRTL ? 'ml-2' : 'mr-2'} text-purple-600"></i>
                                \${tr.profile || 'Profile'}
                            </h2>
                            
                            <div class="space-y-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">\${tr.display_name || 'Display Name'}</label>
                                    <input type="text" id="displayName" value="\${user.display_name || ''}" 
                                        class="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white">
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">\${tr.bio || 'Bio'}</label>
                                    <textarea id="bio" rows="3" 
                                        class="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white resize-none">\${user.bio || ''}</textarea>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Language & Country -->
                        <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-6 shadow-lg">
                            <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
                                <i class="fas fa-globe \${isRTL ? 'ml-2' : 'mr-2'} text-purple-600"></i>
                                \${tr.country_language || 'Language & Country'}
                            </h2>
                            
                            <div class="grid md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">\${tr.language || 'Language'}</label>
                                    <select id="language" class="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white">
                                        <option value="en" \${currentSettings.language === 'en' ? 'selected' : ''}>English</option>
                                        <option value="ar" \${currentSettings.language === 'ar' ? 'selected' : ''}>العربية</option>
                                    </select>
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">\${tr.country || 'Country'}</label>
                                    <select id="country" class="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white">
                                        \${countries.map(c => \`<option value="\${c.code}" \${currentSettings.default_country === c.code ? 'selected' : ''}>\${c.nativeName}</option>\`).join('')}
                                    </select>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Notifications -->
                        <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-6 shadow-lg">
                            <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
                                <i class="fas fa-bell \${isRTL ? 'ml-2' : 'mr-2'} text-purple-600"></i>
                                \${tr.notification?.new_join_request || 'Notifications'}
                            </h2>
                            
                            <div class="space-y-3">
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" id="emailNotifications" \${currentSettings.email_notifications !== false ? 'checked' : ''} 
                                        class="w-5 h-5 rounded text-purple-600 focus:ring-purple-500">
                                    <span class="text-gray-700 dark:text-gray-300">\${tr.email_notifications || 'Email notifications'}</span>
                                </label>
                                
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" id="pushNotifications" \${currentSettings.push_notifications !== false ? 'checked' : ''} 
                                        class="w-5 h-5 rounded text-purple-600 focus:ring-purple-500">
                                    <span class="text-gray-700 dark:text-gray-300">\${tr.push_notifications || 'Push notifications'}</span>
                                </label>
                            </div>
                        </div>
                        
                        <!-- Save Button -->
                        <button type="submit" class="w-full py-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-xl font-bold hover:opacity-90 transition-opacity shadow-lg">
                            <i class="fas fa-save \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.save || 'Save Settings'}
                        </button>
                    </form>
                    
                    <!-- Danger Zone -->
                    <div class="bg-red-50 dark:bg-red-900/20 rounded-xl p-6 mt-6 border border-red-200 dark:border-red-800">
                        <h2 class="text-lg font-bold text-red-600 mb-4">
                            <i class="fas fa-exclamation-triangle \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.danger_zone || 'Danger Zone'}
                        </h2>
                        <p class="text-red-600/80 mb-4">\${tr.delete_account_warning || 'Deleting your account is permanent and cannot be undone.'}</p>
                        <button onclick="deleteAccount()" class="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">
                            <i class="fas fa-trash \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.delete_account || 'Delete Account'}
                        </button>
                    </div>
                \`;
            }
            
            async function saveSettings(e) {
                e.preventDefault();
                
                const settings = {
                    display_name: document.getElementById('displayName').value,
                    bio: document.getElementById('bio').value,
                    language: document.getElementById('language').value,
                    default_country: document.getElementById('country').value,
                    email_notifications: document.getElementById('emailNotifications').checked,
                    push_notifications: document.getElementById('pushNotifications').checked
                };
                
                try {
                    const res = await fetch('/api/settings', {
                        method: 'PUT',
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId')),
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(settings)
                    });
                    
                    if (res.ok) {
                        window.dueli?.toast?.success?.(\`\${tr.settings_saved || 'Settings saved!'}\`);
                        // Reload if language changed
                        if (settings.language !== lang) {
                            window.location.href = '/settings?lang=' + settings.language;
                        }
                    } else {
                        window.dueli?.toast?.error?.(\`\${tr.error_occurred || 'Failed to save settings'}\`);
                    }
                } catch (err) {
                    console.error('Failed to save settings:', err);
                }
            }
            
            async function deleteAccount() {
                if (!confirm(\`\${tr.confirm_delete_account || 'Are you sure you want to delete your account?'}\`)) return;
                
                // Second confirmation for safety
                if (!confirm(\`\${tr.confirm_delete_account_final || 'This action cannot be undone. All your data will be permanently deleted. Are you absolutely sure?'}\`)) return;
                
                try {
                    const res = await fetch('/api/users/me', {
                        method: 'DELETE',
                        headers: {
                            'Authorization': 'Bearer ' + (window.sessionId || localStorage.getItem('sessionId'))
                        }
                    });
                    
                    const data = await res.json();
                    
                    if (res.ok && data.success) {
                        // Clear local storage
                        localStorage.clear();
                        // Clear session cookie
                        document.cookie = 'session=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
                        // Show message and redirect
                        alert(\`\${tr.account_deleted || 'Your account has been deleted successfully.'}\`);
                        window.location.href = '/?lang=' + lang;
                    } else {
                        alert(\`\${data.error || tr.error_occurred || 'Failed to delete account. Please try again.'}\`);
                    }
                } catch (err) {
                    console.error('Delete account error:', err);
                    alert(\`\${tr.error_occurred || 'An error occurred. Please try again later.'}\`);
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.settings || 'Settings'));
};

export default settingsPage;
