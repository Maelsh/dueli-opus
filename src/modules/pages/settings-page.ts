/**
 * Settings Page
 * صفحة الإعدادات
 */

import type { Context } from 'hono';
import type { Bindings, Variables, Language } from '../../config/types';
import { translations, getUILanguage, isRTL as checkRTL } from '../../i18n';
import { getNavigation, getLoginModal, getFooter } from '../../shared/components';
import { DUELI_PRIMARY_BTN } from '../../shared/constants';
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
        
        <script nonce="${(c.get('cspNonce') as string) ?? ''}">
            const lang = ${JSON.stringify(getUILanguage(lang))};
            const isRTL = ${rtl};
            const tr = ${JSON.stringify(tr)};
            const countries = ${JSON.stringify(countries)};
            const PRIMARY_BTN = ${JSON.stringify(DUELI_PRIMARY_BTN)};
            let currentSettings = {};
            let accountHasPassword = true;
            let passwordChangeBusy = false;
            
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
                    loadSettings();
                } else if (typeof authStatus === 'function' && authStatus() === 'unknown') {
                    showAuthPending();
                } else {
                    showLoginRequired();
                }
            }
            window.addEventListener('dueli:auth-success', () => {
                if (window.currentUser) loadSettings();
                else initPageAuth();
            });
            window.retryPageAuth = initPageAuth;

            function showAuthPending() {
                document.getElementById('settingsContent').innerHTML = \`
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
                document.getElementById('settingsContent').innerHTML = \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-8 text-center shadow-lg">
                        <i class="fas fa-lock text-4xl text-gray-300 mb-4"></i>
                        <p class="text-gray-500">\${tr.login_required || 'Please login to access settings'}</p>
                        <button data-csp-on="click" data-csp-fn="showLoginModal" data-csp-args='[]' class="mt-4 px-6 py-2 \${PRIMARY_BTN}">
                            \${tr.login || 'Login'}
                        </button>
                    </div>
                \`;
            }
            
            async function loadSettings() {
                try {
                    const res = await fetch('/api/settings');
                    const data = await res.json();
                    currentSettings = data.data?.settings || {};
                    accountHasPassword = !!(data.data?.account?.has_password);
                    await loadAuthoritativeProfile();
                    renderSettings();
                } catch (err) {
                    console.error('Failed to load settings:', err);
                }
            }

            // R4-PROFILE-SAVE-1 (P-01): the session DTO carries display_name but
            // NOT bio, and both are stale right after a save. The authoritative
            // user row is read through the EXISTING user read path
            // (GET /api/users/:username) so the form shows saved values instead
            // of in-memory ones. No new endpoint is introduced.
            async function loadAuthoritativeProfile() {
                const username = window.currentUser && window.currentUser.username;
                if (!username) return null;
                try {
                    const res = await fetch('/api/users/' + encodeURIComponent(username));
                    const data = await res.json();
                    const profile = data && data.success && data.data ? data.data : null;
                    if (!profile) return null;
                    applyProfile(profile);
                    return profile;
                } catch (err) {
                    console.error('Failed to load profile:', err);
                    return null;
                }
            }

            function applyProfile(profile) {
                if (!profile) return;
                if (!window.currentUser) window.currentUser = {};
                if (profile.display_name !== undefined && profile.display_name !== null) {
                    window.currentUser.display_name = profile.display_name;
                }
                if (profile.bio !== undefined) {
                    window.currentUser.bio = profile.bio;
                }
            }
            
            function renderSettings() {
                const user = window.currentUser || {};
                document.getElementById('settingsContent').innerHTML = \`
                    <form data-csp-on="submit" data-csp-fn="saveSettings" data-csp-args='["@event"]' class="space-y-6">
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
                                    <div class="relative">
                                        <select id="language" class="w-full appearance-none ps-4 pe-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#111] focus:ring-2 focus:ring-purple-500 outline-none transition text-gray-900 dark:text-white">
                                            <option value="en" \${currentSettings.default_language === 'en' ? 'selected' : ''}>English</option>
                                            <option value="ar" \${currentSettings.default_language === 'ar' ? 'selected' : ''}>العربية</option>
                                        </select>
                                        <i class="fas fa-chevron-down absolute top-1/2 -translate-y-1/2 \${isRTL ? 'left-4' : 'right-4'} text-gray-400 pointer-events-none" aria-hidden="true"></i>
                                    </div>
                                </div>
                                
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">\${tr.country || 'Country'}</label>
                                    <div class="relative">
                                        <select id="country" class="w-full appearance-none ps-4 pe-10 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#111] focus:ring-2 focus:ring-purple-500 outline-none transition text-gray-900 dark:text-white">
                                            \${countries.map(c => \`<option value="\${c.code}" \${currentSettings.default_country === c.code ? 'selected' : ''}>\${c.nativeName}</option>\`).join('')}
                                        </select>
                                        <i class="fas fa-chevron-down absolute top-1/2 -translate-y-1/2 \${isRTL ? 'left-4' : 'right-4'} text-gray-400 pointer-events-none" aria-hidden="true"></i>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <!-- Notifications -->
                        <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-6 shadow-lg">
                                <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
                                    <i class="fas fa-bell \${isRTL ? 'ml-2' : 'mr-2'} text-purple-600"></i>
                                    \${tr.settings_page?.notifications || 'Notifications'}
                                </h2>
                            
                            <div class="space-y-3">
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" id="emailNotifications" \${currentSettings.email_notifications ? 'checked' : ''} 
                                        class="w-5 h-5 rounded text-purple-600 focus:ring-purple-500">
                                    <span class="text-gray-700 dark:text-gray-300">\${tr.settings_page?.email_notifications || 'Email notifications'}</span>
                                </label>
                                
                                <label class="flex items-center gap-3 cursor-pointer">
                                    <input type="checkbox" id="pushNotifications" \${currentSettings.notifications_enabled ? 'checked' : ''} 
                                        class="w-5 h-5 rounded text-purple-600 focus:ring-purple-500">
                                    <span class="text-gray-700 dark:text-gray-300">\${tr.settings_page?.push_notifications || 'Push notifications'}</span>
                                </label>
                            </div>
                        </div>

                        \${renderPasswordSection()}
                        
                        <!-- Save Button -->
                        <button type="submit" class="w-full py-4 ${DUELI_PRIMARY_BTN} hover:opacity-90 transition-opacity rounded-xl">
                            <i class="fas fa-save \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.save || 'Save Settings'}
                        </button>
                    </form>
                    
                    <!-- Danger Zone -->
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 mt-6 shadow-lg border border-gray-100 dark:border-gray-800">
                        <h2 class="text-lg font-bold text-red-600 dark:text-red-400 mb-4 motion-safe:animate-pulse motion-reduce:animate-none">
                            <i class="fas fa-exclamation-triangle \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.danger_zone}
                        </h2>
                        <p class="text-gray-500 dark:text-gray-400 mb-4">\${tr.delete_account_warning}</p>
                        <button data-csp-on="click" data-csp-fn="deleteAccount" data-csp-args='[]' class="px-6 py-2.5 bg-red-600 text-white rounded-xl font-bold hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20">
                            <i class="fas fa-trash \${isRTL ? 'ml-2' : 'mr-2'}"></i>
                            \${tr.delete_account}
                        </button>
                    </div>
                \`;
            }

            function renderPasswordSection() {
                const sp = tr.settings_page || {};
                if (!accountHasPassword) {
                    return \`
                        <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-6 shadow-lg">
                            <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-3">
                                <i class="fas fa-key \${isRTL ? 'ml-2' : 'mr-2'} text-purple-600" aria-hidden="true"></i>
                                \${sp.password_section || 'Password'}
                            </h2>
                            <p class="text-sm text-gray-600 dark:text-gray-400 mb-4" role="status">\${sp.password_social_hint || tr.auth_social_no_password}</p>
                            <button type="button" data-csp-on="click" data-csp-fn="showForgotPassword" data-csp-args='[]'
                                class="text-sm font-semibold text-purple-600 dark:text-purple-400 hover:underline"
                                aria-label="\${sp.password_reset_cta || tr.forgot_password}">
                                \${sp.password_reset_cta || tr.forgot_password}
                            </button>
                        </div>
                    \`;
                }
                return \`
                    <div class="bg-white dark:bg-[#1a1a1a] rounded-xl p-6 shadow-lg">
                        <h2 class="text-lg font-bold text-gray-900 dark:text-white mb-4">
                            <i class="fas fa-key \${isRTL ? 'ml-2' : 'mr-2'} text-purple-600" aria-hidden="true"></i>
                            \${sp.password_section || 'Password'}
                        </h2>
                        <div class="space-y-4" role="group" aria-labelledby="passwordSectionLegend">
                            <p id="passwordSectionLegend" class="sr-only">\${sp.password_section || 'Password'}</p>
                            <div>
                                <label for="currentPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">\${sp.password_current || 'Current password'}</label>
                                <input type="password" id="currentPassword" name="current-password" autocomplete="current-password"
                                    class="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white">
                            </div>
                            <div>
                                <label for="newPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">\${sp.password_new || 'New password'}</label>
                                <input type="password" id="newPassword" name="new-password" autocomplete="new-password" minlength="8"
                                    class="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white">
                                <p class="text-xs text-gray-500 mt-1">\${tr.password_min_length}</p>
                            </div>
                            <div>
                                <label for="confirmNewPassword" class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">\${sp.password_confirm || 'Confirm new password'}</label>
                                <input type="password" id="confirmNewPassword" name="new-password" autocomplete="new-password" minlength="8"
                                    class="w-full px-4 py-3 rounded-lg bg-gray-100 dark:bg-gray-800 border-none focus:ring-2 focus:ring-purple-500 text-gray-900 dark:text-white">
                            </div>
                            <p id="passwordFormError" class="hidden text-sm text-red-600 dark:text-red-400" role="alert"></p>
                            <button type="button" id="passwordSubmitBtn" data-csp-on="click" data-csp-fn="changeAccountPassword" data-csp-args='[]'
                                class="w-full py-3 \${PRIMARY_BTN} rounded-xl font-semibold disabled:opacity-60">
                                \${sp.password_change_submit || 'Update password'}
                            </button>
                        </div>
                    </div>
                \`;
            }

            function setPasswordFormError(message) {
                const el = document.getElementById('passwordFormError');
                if (!el) return;
                if (!message) {
                    el.textContent = '';
                    el.classList.add('hidden');
                    return;
                }
                el.textContent = message;
                el.classList.remove('hidden');
            }

            async function changeAccountPassword() {
                if (passwordChangeBusy) return;
                const sp = tr.settings_page || {};
                const current = document.getElementById('currentPassword')?.value || '';
                const next = document.getElementById('newPassword')?.value || '';
                const confirm = document.getElementById('confirmNewPassword')?.value || '';
                setPasswordFormError('');
                if (!current || !next || !confirm) {
                    setPasswordFormError(tr.errors?.missing_fields || 'Missing required fields');
                    return;
                }
                if (next.length < 8) {
                    setPasswordFormError(tr.password_min_length);
                    return;
                }
                if (next !== confirm) {
                    setPasswordFormError(sp.password_confirm_mismatch || 'Passwords do not match');
                    return;
                }
                const btn = document.getElementById('passwordSubmitBtn');
                passwordChangeBusy = true;
                if (btn) btn.disabled = true;
                try {
                    const res = await fetch('/api/account/password', {
                        method: 'PUT',
                        headers: Object.assign({ 'Content-Type': 'application/json' }, window.DueliSession?.headers?.() || {}),
                        body: JSON.stringify({ current_password: current, new_password: next })
                    });
                    const data = await res.json().catch(() => null);
                    if (res.ok && data && data.success) {
                        window.dueli?.showToast(data.data?.message || tr.account?.password_updated || 'Password updated', 'success');
                        window.DueliSession?.clearLocal?.();
                        try { localStorage.removeItem('user'); } catch (_) { /* ignore */ }
                        window.currentUser = null;
                        if (typeof showLoginModal === 'function') {
                            showLoginModal();
                        } else {
                            window.location.href = '/?lang=' + lang;
                        }
                        return;
                    }
                    if (res.status >= 500) {
                        setPasswordFormError(tr.error_occurred || 'Server error');
                        return;
                    }
                    setPasswordFormError(data?.error || tr.error_occurred || 'Failed');
                } catch (err) {
                    console.error('Password change failed');
                    setPasswordFormError(tr.error_occurred || 'Network error');
                } finally {
                    passwordChangeBusy = false;
                    if (btn) btn.disabled = false;
                }
            }
            
            async function saveSettings(e) {
                e.preventDefault();
                
                const settings = {
                    display_name: document.getElementById('displayName').value,
                    bio: document.getElementById('bio').value,
                    default_language: document.getElementById('language').value,
                    default_country: document.getElementById('country').value,
                    email_notifications: document.getElementById('emailNotifications').checked,
                    notifications_enabled: document.getElementById('pushNotifications').checked
                };
                
                try {
                    const res = await fetch('/api/settings', {
                        method: 'PUT',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(settings)
                    });

                    const data = await res.json().catch(() => null);

                    // R4-PROFILE-SAVE-1 (P-01): a 200 alone is NOT proof of a
                    // save — the response body decides. A failed save must
                    // never be reported as a success.
                    if (res.ok && data && data.success) {
                        // Adopt the values the server actually persisted.
                        if (data.data?.settings) currentSettings = Object.assign({}, currentSettings, data.data.settings);
                        if (data.data?.profile) applyProfile(data.data.profile);
                        renderSettings();
                        window.dueli?.showToast(\`\${tr.settings_page?.saved || 'Settings saved!'}\`, 'success');
                        // Reload if language changed
                        if (settings.default_language !== lang) {
                            window.location.href = '/settings?lang=' + settings.default_language;
                        }
                    } else {
                        window.dueli?.showToast(\`\${data?.error || tr.error_occurred || 'Failed to save settings'}\`, 'error');
                    }
                } catch (err) {
                    console.error('Failed to save settings:', err);
                    window.dueli?.showToast(\`\${tr.error_occurred || 'Failed to save settings'}\`, 'error');
                }
            }
            
            async function deleteAccount() {
                if (!confirm(\`\${tr.confirm_delete_account || 'Are you sure you want to delete your account?'}\`)) return;
                try {
                    const res = await fetch('/api/users/delete-account?lang=' + (window.lang || 'ar'), {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({ confirm: true })
                    });
                    const data = await res.json();
                    if (data.success) {
                        // GDPR deletion done server-side — clear local UI state.
                        // The server invalidates the HttpOnly session cookie; the
                        // browser must never write it from JS.
                        localStorage.removeItem('user');
                        window.DueliSession.clearLocal();
                        alert(tr.account_deleted || 'Your account has been deleted.');
                        window.location.href = '/?lang=' + (window.lang || 'ar');
                    } else {
                        alert(data.error || 'Failed to delete account');
                    }
                } catch (err) {
                    console.error(err);
                    alert('Failed to delete account');
                }
            }
        </script>
    `;

    return c.html(generateHTML(content, lang, tr.settings || 'Settings', (c.get('cspNonce') as string) ?? ''));
};

export default settingsPage;
