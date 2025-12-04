// Dueli Frontend JavaScript - New Design
// منصة المنافسات والحوارات

// ============================================
// Global State
// ============================================
window.currentUser = null;
window.sessionId = null;
window.lang = 'ar';
window.isDarkMode = false;

// Helper function for debouncing
window.debounce = function (func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
};

// ============================================
// Initialize
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Get current language from URL
  const urlParams = new URLSearchParams(window.location.search);
  window.lang = urlParams.get('lang') || 'ar';

  // Handle OAuth Callback
  const session = urlParams.get('session');
  const error = urlParams.get('error');

  if (session) {
    localStorage.setItem('sessionId', session);
    // Remove params from URL without reload
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/[\?&]session=[^&]+/, '').replace(/^&/, '?'));

    // Fetch user info immediately
    fetch('/api/auth/session', {
      headers: { 'Authorization': 'Bearer ' + session }
    })
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          localStorage.setItem('user', JSON.stringify(data.user));
          window.currentUser = data.user;
          window.sessionId = session;
          updateAuthUI();
          showToast(window.lang === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Logged in successfully', 'success');
        }
      });
  }

  if (error) {
    showOAuthError(error);
    // Remove error from URL
    window.history.replaceState({}, document.title, window.location.pathname + window.location.search.replace(/[\?&]error=[^&]+/, '').replace(/^&/, '?'));
  }

  // Load dark mode preference
  const savedDarkMode = localStorage.getItem('darkMode');
  window.isDarkMode = savedDarkMode === 'true';
  applyDarkMode();
});

// ============================================
// Authentication Functions
// ============================================
async function checkAuth() {
  const savedUser = localStorage.getItem('user');
  const savedSession = localStorage.getItem('sessionId');

  if (savedUser && savedSession) {
    try {
      // Validate session with server
      const res = await fetch('/api/auth/session', {
        headers: { 'Authorization': 'Bearer ' + savedSession }
      });
      const data = await res.json();

      if (data.success && data.user) {
        window.currentUser = data.user;
        window.sessionId = savedSession;
        updateAuthUI();
        return true;
      } else {
        // Session invalid, clear storage
        localStorage.removeItem('user');
        localStorage.removeItem('sessionId');
      }
    } catch (err) {
      console.error('Auth check failed:', err);
    }
  }

  updateAuthUI();
  return false;
}

// Logout function
async function logout() {
  const sessionId = localStorage.getItem('sessionId'); // Corrected from 'session' to 'sessionId'

  if (sessionId) {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${sessionId}`
        }
      });
    } catch (error) {
      console.error('Logout error:', error);
    }
  }

  // Clear local storage regardless of API call result
  localStorage.removeItem('sessionId'); // Corrected from 'session' to 'sessionId'
  localStorage.removeItem('user');

  // Update UI
  updateAuthUI();

  // Redirect to home
  window.location.href = '/';
}

function updateAuthUI() {
  const authSection = document.getElementById('authSection');
  const userSection = document.getElementById('userSection');
  const createCompBtn = document.getElementById('createCompBtn');

  if (window.currentUser) {
    // User is logged in
    if (authSection) authSection.classList.add('hidden');
    if (userSection) {
      userSection.classList.remove('hidden');

      const userAvatar = document.getElementById('userAvatar');
      const userName = document.getElementById('userName');
      const userEmail = document.getElementById('userEmail');

      if (userAvatar) userAvatar.src = window.currentUser.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=user';
      if (userName) userName.textContent = window.currentUser.display_name || window.currentUser.username;
      if (userEmail) userEmail.textContent = window.currentUser.email;
    }
    if (createCompBtn) createCompBtn.classList.remove('hidden');
  } else {
    // User is not logged in
    if (authSection) authSection.classList.remove('hidden');
    if (userSection) userSection.classList.add('hidden');
    if (createCompBtn) createCompBtn.classList.add('hidden');
  }
}

// Show login modal
function showLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) {
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    // Add animation
    setTimeout(() => {
      const backdrop = modal.querySelector('.modal-backdrop');
      const content = modal.querySelector('.modal-content');
      if (backdrop) backdrop.classList.add('show');
      if (content) content.classList.add('show');
    }, 10);
  }
}

// Hide login modal
function hideLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) {
    const backdrop = modal.querySelector('.modal-backdrop');
    const content = modal.querySelector('.modal-content');

    if (backdrop) backdrop.classList.remove('show');
    if (content) content.classList.remove('show');

    setTimeout(() => {
      modal.classList.add('hidden');
      document.body.style.overflow = '';
      // Reset forms
      document.getElementById('loginForm')?.querySelector('form')?.reset();
      document.getElementById('registerForm')?.querySelector('form')?.reset();
      hideAuthMessage();
    }, 200);
  }
}

// Switch between login and register tabs
function switchAuthTab(tab) {
  const loginTab = document.getElementById('loginTab');
  const registerTab = document.getElementById('registerTab');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  hideAuthMessage();

  if (tab === 'login') {
    loginTab?.classList.add('bg-white', 'dark:bg-gray-700', 'text-purple-600', 'dark:text-purple-400', 'shadow-sm');
    loginTab?.classList.remove('text-gray-600', 'dark:text-gray-400');
    registerTab?.classList.remove('bg-white', 'dark:bg-gray-700', 'text-purple-600', 'dark:text-purple-400', 'shadow-sm');
    registerTab?.classList.add('text-gray-600', 'dark:text-gray-400');
    loginForm?.classList.remove('hidden');
    registerForm?.classList.add('hidden');
  } else {
    registerTab?.classList.add('bg-white', 'dark:bg-gray-700', 'text-purple-600', 'dark:text-purple-400', 'shadow-sm');
    registerTab?.classList.remove('text-gray-600', 'dark:text-gray-400');
    loginTab?.classList.remove('bg-white', 'dark:bg-gray-700', 'text-purple-600', 'dark:text-purple-400', 'shadow-sm');
    loginTab?.classList.add('text-gray-600', 'dark:text-gray-400');
    registerForm?.classList.remove('hidden');
    loginForm?.classList.add('hidden');
    registerForm?.classList.remove('hidden');
    loginForm?.classList.add('hidden');
  }
}

// Show forgot password form
function showForgotPassword() {
  document.getElementById('loginForm')?.classList.add('hidden');
  document.getElementById('forgotPasswordForm')?.classList.remove('hidden');
  document.getElementById('resetStep1')?.classList.remove('hidden');
  document.getElementById('resetStep2')?.classList.add('hidden');
  document.getElementById('resetStep3')?.classList.add('hidden');
  hideAuthMessage();
}

// Show login form (back from forgot password)
function showLogin() {
  document.getElementById('forgotPasswordForm')?.classList.add('hidden');
  document.getElementById('loginForm')?.classList.remove('hidden');
  hideAuthMessage();
}

// Handle Forgot Password - Step 1: Request Code
async function handleForgotPassword(e) {
  e.preventDefault();
  hideAuthMessage();

  const email = document.getElementById('resetEmail').value;

  try {
    const res = await fetch(`/api/auth/forgot-password?lang=${window.lang}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await res.json();

    if (data.success) {
      showAuthMessage(data.message, 'success');
      document.getElementById('resetStep1').classList.add('hidden');
      document.getElementById('resetStep2').classList.remove('hidden');
    } else {
      showAuthMessage(data.error || 'Failed to send code', 'error');
    }
  } catch (error) {
    console.error('Forgot password error:', error);
    showAuthMessage('فشل الاتصال بالخادم', 'error');
  }
}

// Handle Forgot Password - Step 2: Verify Code
async function handleVerifyResetCode(e) {
  e.preventDefault();
  hideAuthMessage();

  const email = document.getElementById('resetEmail').value;
  const code = document.getElementById('resetCode').value;

  try {
    const res = await fetch(`/api/auth/verify-reset-code?lang=${window.lang}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code })
    });

    const data = await res.json();

    if (data.success) {
      showAuthMessage(data.message, 'success');
      document.getElementById('resetStep2').classList.add('hidden');
      document.getElementById('resetStep3').classList.remove('hidden');
    } else {
      showAuthMessage(data.error || 'Invalid code', 'error');
    }
  } catch (error) {
    console.error('Verify code error:', error);
    showAuthMessage('فشل الاتصال بالخادم', 'error');
  }
}

// Handle Forgot Password - Step 3: Reset Password
async function handleResetPassword(e) {
  e.preventDefault();
  hideAuthMessage();

  const email = document.getElementById('resetEmail').value;
  const code = document.getElementById('resetCode').value;
  const newPassword = document.getElementById('newPassword').value;

  try {
    const res = await fetch(`/api/auth/reset-password?lang=${window.lang}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code, newPassword })
    });

    const data = await res.json();

    if (data.success) {
      showAuthMessage(data.message, 'success');
      setTimeout(() => {
        showLogin();
        document.getElementById('forgotPasswordForm').querySelector('form').reset();
      }, 2000);
    } else {
      showAuthMessage(data.error || 'Failed to reset password', 'error');
    }
  } catch (error) {
    console.error('Reset password error:', error);
    showAuthMessage('فشل الاتصال بالخادم', 'error');
  }
}

// Show auth message
function showAuthMessage(message, type = 'error') {
  const msg = document.getElementById('authMessage');
  if (msg) {
    msg.textContent = message;
    msg.classList.remove('hidden', 'bg-red-100', 'bg-green-100', 'bg-blue-100', 'text-red-700', 'text-green-700', 'text-blue-700');
    if (type === 'success') {
      msg.classList.add('bg-green-100', 'text-green-700');
    } else if (type === 'info') {
      msg.classList.add('bg-blue-100', 'text-blue-700');
    } else {
      msg.classList.add('bg-red-100', 'text-red-700');
    }
  }
}

function hideAuthMessage() {
  const msg = document.getElementById('authMessage');
  if (msg) msg.classList.add('hidden');
}

// Handle registration
// Handle registration
async function handleRegister(e) {
  e.preventDefault();
  hideAuthMessage();

  const name = document.getElementById('registerName').value;
  const email = document.getElementById('registerEmail').value;
  const password = document.getElementById('registerPassword').value;

  // Get country and language from cookies
  const country = getCookie('country') || 'SA';
  const language = window.lang || 'ar';

  try {
    const res = await fetch(`/api/auth/register?lang=${window.lang}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password, country, language })
    });

    const data = await res.json();

    if (data.success) {
      showAuthMessage(data.message, 'success');
      document.getElementById('registerForm')?.querySelector('form')?.reset();
      // Switch to login tab after 2 seconds
      setTimeout(() => switchAuthTab('login'), 2000);
    } else {
      showAuthMessage(data.error || 'Registration failed', 'error');
    }
  } catch (error) {
    console.error('Registration error:', error);
    showAuthMessage('فشل الاتصال بالخادم', 'error');
  }
}

// Handle login
async function handleLogin(e) {
  e.preventDefault();
  hideAuthMessage();

  const email = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch(`/api/auth/login?lang=${window.lang}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });

    const data = await res.json();

    if (data.success) {
      // Save session
      window.currentUser = data.user;
      window.sessionId = data.sessionId;
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('sessionId', data.sessionId);

      // Update UI
      updateAuthUI();
      hideLoginModal();
      showToast(window.lang === 'ar' ? 'مرحباً بك!' : 'Welcome!', 'success');

      // Reload to refresh data
      setTimeout(() => window.location.reload(), 500);
    } else {
      showAuthMessage(data.error || 'Login failed', 'error');
    }
  } catch (error) {
    console.error('Login error:', error);
    showAuthMessage('فشل الاتصال بالخادم', 'error');
  }
}

// Login with OAuth provider
async function loginWith(provider) {
  const providerNames = {
    google: 'Google',
    facebook: 'Facebook',
    microsoft: 'Microsoft',
    tiktok: 'TikTok',
    twitter: 'X (Twitter)',
    snapchat: 'Snapchat'
  };

  if (provider === 'twitter' || provider === 'snapchat') {
    showComingSoonModal(providerNames[provider]);
    return;
  }

  // Open OAuth in popup window
  const width = 600;
  const height = 700;
  const left = (window.screen.width - width) / 2;
  const top = (window.screen.height - height) / 2;

  const popup = window.open(
    `/api/auth/oauth/${provider}?lang=${window.lang}`,
    'oauth_popup',
    `width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
  );

  if (!popup) {
    showToast(window.lang === 'ar' ? 'يرجى السماح بالنوافذ المنبثقة' : 'Please allow popups', 'warning');
    return;
  }

  // Listen for OAuth callback
  window.addEventListener('message', function handleOAuthCallback(event) {
    // Verify origin
    if (event.origin !== window.location.origin) return;

    if (event.data.type === 'oauth_success' && event.data.session) {
      localStorage.setItem('sessionId', event.data.session);

      // Fetch user info
      fetch('/api/auth/session', {
        headers: { 'Authorization': 'Bearer ' + event.data.session }
      })
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            localStorage.setItem('user', JSON.stringify(data.user));
            window.currentUser = data.user;
            window.sessionId = event.data.session;
            updateAuthUI();
            showToast(window.lang === 'ar' ? 'تم تسجيل الدخول بنجاح' : 'Logged in successfully', 'success');

            // Close login modal if open
            const loginModal = document.getElementById('authModal');
            if (loginModal) loginModal.style.display = 'none';
          }
        });

      // Close popup
      if (popup && !popup.closed) popup.close();

      // Remove event listener
      window.removeEventListener('message', handleOAuthCallback);
    } else if (event.data.type === 'oauth_error') {
      showOAuthError(event.data.error);
      if (popup && !popup.closed) popup.close();
      window.removeEventListener('message', handleOAuthCallback);
    }
  });
}

function showComingSoonModal(providerName) {
  const title = window.lang === 'ar' ? 'قريباً جداً!' : 'Coming Very Soon!';
  const message = window.lang === 'ar'
    ? `نعمل حالياً على إضافة التسجيل عبر ${providerName}. يرجى استخدام طريقة أخرى حالياً.`
    : `We are working on adding ${providerName} login. Please use another method for now.`;
  const btnText = window.lang === 'ar' ? 'حسناً' : 'Got it';

  showCustomModal(title, message, btnText, 'rocket');
}

function showOAuthError(errorCode) {
  let title = window.lang === 'ar' ? 'تنبيه' : 'Notice';
  let message = window.lang === 'ar' ? 'حدث خطأ أثناء تسجيل الدخول' : 'An error occurred during login';
  let icon = 'exclamation-circle';

  if (errorCode === 'INVALID_EMAIL_DOMAIN') {
    title = window.lang === 'ar' ? 'بريد غير مدعوم' : 'Unsupported Email';
    message = window.lang === 'ar'
      ? 'نعتذر، نقبل فقط حسابات Gmail و Outlook و Yahoo.'
      : 'Sorry, we only accept Gmail, Outlook, and Yahoo accounts.';
  } else if (errorCode === 'PROVIDER_ERROR') {
    message = window.lang === 'ar'
      ? 'حدث خطأ في الاتصال مع مزود الخدمة. يرجى المحاولة مرة أخرى.'
      : 'Connection error with the provider. Please try again.';
  }

  showCustomModal(title, message, window.lang === 'ar' ? 'إغلاق' : 'Close', icon);
}

function showCustomModal(title, message, btnText, iconName) {
  // Create modal element with higher z-index to appear above login modal
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in';
  modal.innerHTML = `
    <div class="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-sm w-full p-6 text-center transform transition-all scale-95 animate-scale-in border border-gray-100 dark:border-gray-700">
      <div class="w-16 h-16 bg-purple-100 dark:bg-purple-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
        <i class="fas fa-${iconName} text-2xl text-purple-600 dark:text-purple-400"></i>
      </div>
      <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-2">${title}</h3>
      <p class="text-gray-600 dark:text-gray-300 mb-6">${message}</p>
      <button onclick="this.closest('div.fixed').remove()" class="w-full py-3 px-4 bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white rounded-xl font-medium transition-all shadow-lg hover:shadow-purple-500/25">
        ${btnText}
      </button>
    </div>
  `;
  document.body.appendChild(modal);
}

// Logout
async function logout() {
  try {
    if (window.sessionId) {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + window.sessionId }
      });
    }
  } catch (err) {
    console.error('Logout error:', err);
  }

  localStorage.removeItem('user');
  localStorage.removeItem('sessionId');
  window.currentUser = null;
  window.sessionId = null;

  updateAuthUI();
  showToast(window.lang === 'ar' ? 'تم تسجيل الخروج' : 'Logged out successfully', 'info');

  // Redirect to home
  window.location.href = '/?lang=' + window.lang;
}

// ============================================
// Dark Mode Functions
// ============================================
function toggleDarkMode() {
  window.isDarkMode = !window.isDarkMode;
  localStorage.setItem('darkMode', window.isDarkMode);
  applyDarkMode();
}

function applyDarkMode() {
  const moonIcon = document.getElementById('moonIcon');
  const sunIcon = document.getElementById('sunIcon');

  if (window.isDarkMode) {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');

    // Show sun icon in dark mode, hide moon
    if (moonIcon) moonIcon.classList.add('hidden');
    if (sunIcon) sunIcon.classList.remove('hidden');
  } else {
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');

    // Show moon icon in light mode, hide sun
    if (moonIcon) moonIcon.classList.remove('hidden');
    if (sunIcon) sunIcon.classList.add('hidden');
  }
}

// ============================================
// Country/Language Menu Functions
// ============================================

// Countries data (imported from backend)
let allCountries = [];

// Initialize countries list
async function initCountries() {
  try {
    // Complete list of 130+ countries with native names
    allCountries = [
      // Arabic Countries
      { code: 'SA', name: 'السعودية', lang: 'ar', flag: '🇸🇦', rtl: true },
      { code: 'EG', name: 'مصر', lang: 'ar', flag: '🇪🇬', rtl: true },
      { code: 'AE', name: 'الإمارات', lang: 'ar', flag: '🇦🇪', rtl: true },
      { code: 'KW', name: 'الكويت', lang: 'ar', flag: '🇰🇼', rtl: true },
      { code: 'QA', name: 'قطر', lang: 'ar', flag: '🇶🇦', rtl: true },
      { code: 'BH', name: 'البحرين', lang: 'ar', flag: '🇧🇭', rtl: true },
      { code: 'OM', name: 'عمان', lang: 'ar', flag: '🇴🇲', rtl: true },
      { code: 'JO', name: 'الأردن', lang: 'ar', flag: '🇯🇴', rtl: true },
      { code: 'LB', name: 'لبنان', lang: 'ar', flag: '🇱🇧', rtl: true },
      { code: 'SY', name: 'سوريا', lang: 'ar', flag: '🇸🇾', rtl: true },
      { code: 'IQ', name: 'العراق', lang: 'ar', flag: '🇮🇶', rtl: true },
      { code: 'YE', name: 'اليمن', lang: 'ar', flag: '🇾🇪', rtl: true },
      { code: 'PS', name: 'فلسطين', lang: 'ar', flag: '🇵🇸', rtl: true },
      { code: 'MA', name: 'المغرب', lang: 'ar', flag: '🇲🇦', rtl: true },
      { code: 'DZ', name: 'الجزائر', lang: 'ar', flag: '🇩🇿', rtl: true },
      { code: 'TN', name: 'تونس', lang: 'ar', flag: '🇹🇳', rtl: true },
      { code: 'LY', name: 'ليبيا', lang: 'ar', flag: '🇱🇾', rtl: true },
      { code: 'SD', name: 'السودان', lang: 'ar', flag: '🇸🇩', rtl: true },
      { code: 'SO', name: 'الصومال', lang: 'ar', flag: '🇸🇴', rtl: true },
      { code: 'DJ', name: 'جيبوتي', lang: 'ar', flag: '🇩🇯', rtl: true },
      { code: 'KM', name: 'جزر القمر', lang: 'ar', flag: '🇰🇲', rtl: true },
      { code: 'MR', name: 'موريتانيا', lang: 'ar', flag: '🇲🇷', rtl: true },

      // English-speaking Countries
      { code: 'US', name: 'United States', lang: 'en', flag: '🇺🇸' },
      { code: 'GB', name: 'United Kingdom', lang: 'en', flag: '🇬🇧' },
      { code: 'CA', name: 'Canada', lang: 'en', flag: '🇨🇦' },
      { code: 'AU', name: 'Australia', lang: 'en', flag: '🇦🇺' },
      { code: 'NZ', name: 'New Zealand', lang: 'en', flag: '🇳🇿' },
      { code: 'IE', name: 'Ireland', lang: 'en', flag: '🇮🇪' },
      { code: 'ZA', name: 'South Africa', lang: 'en', flag: '🇿🇦' },
      { code: 'IN', name: 'India', lang: 'en', flag: '🇮🇳' },
      { code: 'PK', name: 'Pakistan', lang: 'en', flag: '🇵🇰' },
      { code: 'NG', name: 'Nigeria', lang: 'en', flag: '🇳🇬' },
      { code: 'KE', name: 'Kenya', lang: 'en', flag: '🇰🇪' },
      { code: 'GH', name: 'Ghana', lang: 'en', flag: '🇬🇭' },
      { code: 'SG', name: 'Singapore', lang: 'en', flag: '🇸🇬' },
      { code: 'PH', name: 'Philippines', lang: 'en', flag: '🇵🇭' },
      { code: 'UG', name: 'Uganda', lang: 'en', flag: '🇺🇬' },
      { code: 'ZW', name: 'Zimbabwe', lang: 'en', flag: '🇿🇼' },
      { code: 'ZM', name: 'Zambia', lang: 'en', flag: '🇿🇲' },
      { code: 'MW', name: 'Malawi', lang: 'en', flag: '🇲🇼' },
      { code: 'BW', name: 'Botswana', lang: 'en', flag: '🇧🇼' },
      { code: 'NA', name: 'Namibia', lang: 'en', flag: '🇳🇦' },

      // European Countries
      { code: 'FR', name: 'France', lang: 'fr', flag: '🇫🇷' },
      { code: 'DE', name: 'Deutschland', lang: 'de', flag: '🇩🇪' },
      { code: 'ES', name: 'España', lang: 'es', flag: '🇪🇸' },
      { code: 'IT', name: 'Italia', lang: 'it', flag: '🇮🇹' },
      { code: 'PT', name: 'Portugal', lang: 'pt', flag: '🇵🇹' },
      { code: 'NL', name: 'Nederland', lang: 'nl', flag: '🇳🇱' },
      { code: 'BE', name: 'België', lang: 'nl', flag: '🇧🇪' },
      { code: 'CH', name: 'Schweiz', lang: 'de', flag: '🇨🇭' },
      { code: 'AT', name: 'Österreich', lang: 'de', flag: '🇦🇹' },
      { code: 'SE', name: 'Sverige', lang: 'sv', flag: '🇸🇪' },
      { code: 'NO', name: 'Norge', lang: 'no', flag: '🇳🇴' },
      { code: 'DK', name: 'Danmark', lang: 'da', flag: '🇩🇰' },
      { code: 'FI', name: 'Suomi', lang: 'fi', flag: '🇫🇮' },
      { code: 'PL', name: 'Polska', lang: 'pl', flag: '🇵🇱' },
      { code: 'CZ', name: 'Česko', lang: 'cs', flag: '🇨🇿' },
      { code: 'GR', name: 'Ελλάδα', lang: 'el', flag: '🇬🇷' },
      { code: 'RO', name: 'România', lang: 'ro', flag: '🇷🇴' },
      { code: 'HU', name: 'Magyarország', lang: 'hu', flag: '🇭🇺' },
      { code: 'BG', name: 'България', lang: 'bg', flag: '🇧🇬' },
      { code: 'HR', name: 'Hrvatska', lang: 'hr', flag: '🇭🇷' },
      { code: 'RS', name: 'Србија', lang: 'sr', flag: '🇷🇸' },
      { code: 'UA', name: 'Україна', lang: 'uk', flag: '🇺🇦' },
      { code: 'IS', name: 'Ísland', lang: 'is', flag: '🇮🇸' },
      { code: 'MT', name: 'Malta', lang: 'mt', flag: '🇲🇹' },
      { code: 'CY', name: 'Κύπρος', lang: 'el', flag: '🇨🇾' },
      { code: 'LU', name: 'Luxembourg', lang: 'fr', flag: '🇱🇺' },
      { code: 'MC', name: 'Monaco', lang: 'fr', flag: '🇲🇨' },
      { code: 'AD', name: 'Andorra', lang: 'ca', flag: '🇦🇩' },
      { code: 'SM', name: 'San Marino', lang: 'it', flag: '🇸🇲' },
      { code: 'VA', name: 'Vaticano', lang: 'it', flag: '🇻🇦' },
      { code: 'LI', name: 'Liechtenstein', lang: 'de', flag: '🇱🇮' },

      // Asian Countries
      { code: 'CN', name: '中国', lang: 'zh', flag: '🇨🇳' },
      { code: 'JP', name: '日本', lang: 'ja', flag: '🇯🇵' },
      { code: 'KR', name: '대한민국', lang: 'ko', flag: '🇰🇷' },
      { code: 'TH', name: 'ประเทศไทย', lang: 'th', flag: '🇹🇭' },
      { code: 'VN', name: 'Việt Nam', lang: 'vi', flag: '🇻🇳' },
      { code: 'ID', name: 'Indonesia', lang: 'id', flag: '🇮🇩' },
      { code: 'MY', name: 'Malaysia', lang: 'ms', flag: '🇲🇾' },
      { code: 'BD', name: 'বাংলাদেশ', lang: 'bn', flag: '🇧🇩' },
      { code: 'MM', name: 'မြန်မာ', lang: 'my', flag: '🇲🇲' },
      { code: 'KH', name: 'កម្ពុជា', lang: 'km', flag: '🇰🇭' },
      { code: 'LA', name: 'ລາວ', lang: 'lo', flag: '🇱🇦' },
      { code: 'NP', name: 'नेपाल', lang: 'ne', flag: '🇳🇵' },
      { code: 'LK', name: 'ශ්‍රී ලංකා', lang: 'si', flag: '🇱🇰' },
      { code: 'AF', name: 'افغانستان', lang: 'fa', flag: '🇦🇫', rtl: true },
      { code: 'IR', name: 'ایران', lang: 'fa', flag: '🇮🇷', rtl: true },
      { code: 'TR', name: 'Türkiye', lang: 'tr', flag: '🇹🇷' },
      { code: 'IL', name: 'ישראל', lang: 'he', flag: '🇮🇱', rtl: true },
      { code: 'AZ', name: 'Azərbaycan', lang: 'az', flag: '🇦🇿' },
      { code: 'GE', name: 'საქართველო', lang: 'ka', flag: '🇬🇪' },
      { code: 'AM', name: 'Հայաստան', lang: 'hy', flag: '🇦🇲' },
      { code: 'KZ', name: 'Қазақстан', lang: 'kk', flag: '🇰🇿' },
      { code: 'UZ', name: 'Oʻzbekiston', lang: 'uz', flag: '🇺🇿' },
      { code: 'TM', name: 'Türkmenistan', lang: 'tk', flag: '🇹🇲' },
      { code: 'KG', name: 'Кыргызстан', lang: 'ky', flag: '🇰🇬' },
      { code: 'TJ', name: 'Тоҷикистон', lang: 'tg', flag: '🇹🇯' },
      { code: 'MN', name: 'Монгол', lang: 'mn', flag: '🇲🇳' },

      // Latin American Countries
      { code: 'MX', name: 'México', lang: 'es', flag: '🇲🇽' },
      { code: 'BR', name: 'Brasil', lang: 'pt', flag: '🇧🇷' },
      { code: 'AR', name: 'Argentina', lang: 'es', flag: '🇦🇷' },
      { code: 'CO', name: 'Colombia', lang: 'es', flag: '🇨🇴' },
      { code: 'CL', name: 'Chile', lang: 'es', flag: '🇨🇱' },
      { code: 'PE', name: 'Perú', lang: 'es', flag: '🇵🇪' },
      { code: 'VE', name: 'Venezuela', lang: 'es', flag: '🇻🇪' },
      { code: 'EC', name: 'Ecuador', lang: 'es', flag: '🇪🇨' },
      { code: 'GT', name: 'Guatemala', lang: 'es', flag: '🇬🇹' },
      { code: 'CU', name: 'Cuba', lang: 'es', flag: '🇨🇺' },
      { code: 'BO', name: 'Bolivia', lang: 'es', flag: '🇧🇴' },
      { code: 'DO', name: 'República Dominicana', lang: 'es', flag: '🇩🇴' },
      { code: 'HN', name: 'Honduras', lang: 'es', flag: '🇭🇳' },
      { code: 'PY', name: 'Paraguay', lang: 'es', flag: '🇵🇾' },
      { code: 'SV', name: 'El Salvador', lang: 'es', flag: '🇸🇻' },
      { code: 'NI', name: 'Nicaragua', lang: 'es', flag: '🇳🇮' },
      { code: 'CR', name: 'Costa Rica', lang: 'es', flag: '🇨🇷' },
      { code: 'PA', name: 'Panamá', lang: 'es', flag: '🇵🇦' },
      { code: 'UY', name: 'Uruguay', lang: 'es', flag: '🇺🇾' },

      // African Countries
      { code: 'ET', name: 'ኢትዮጵያ', lang: 'am', flag: '🇪🇹' },
      { code: 'TZ', name: 'Tanzania', lang: 'sw', flag: '🇹🇿' },
      { code: 'RW', name: 'Rwanda', lang: 'rw', flag: '🇷🇼' },
      { code: 'SN', name: 'Sénégal', lang: 'fr', flag: '🇸🇳' },
      { code: 'CI', name: "Côte d'Ivoire", lang: 'fr', flag: '🇨🇮' },
      { code: 'CM', name: 'Cameroun', lang: 'fr', flag: '🇨🇲' },
      { code: 'MZ', name: 'Moçambique', lang: 'pt', flag: '🇲🇿' },
      { code: 'AO', name: 'Angola', lang: 'pt', flag: '🇦🇴' },

      // Russia and neighbors
      { code: 'RU', name: 'Россия', lang: 'ru', flag: '🇷🇺' },
      { code: 'BY', name: 'Беларусь', lang: 'be', flag: '🇧🇾' },
      { code: 'MD', name: 'Moldova', lang: 'ro', flag: '🇲🇩' },
    ];

    renderCountriesList();
  } catch (err) {
    console.error('Failed to load countries:', err);
  }
}

function toggleCountryMenu() {
  const menu = document.getElementById('countryMenu');
  if (menu) {
    const isHidden = menu.classList.contains('hidden');
    menu.classList.toggle('hidden');

    if (isHidden) {
      // Menu is being opened
      renderCountriesList();
      // Focus search input
      setTimeout(() => {
        const searchInput = document.getElementById('countrySearch');
        if (searchInput) searchInput.focus();
      }, 100);
    }
  }
}

function renderCountriesList(filter = '') {
  const container = document.getElementById('countriesList');
  if (!container) return;

  const currentCountry = getCookie('country') || 'SA';
  const filterLower = filter.toLowerCase();

  const filtered = allCountries.filter(c =>
    c.name.toLowerCase().includes(filterLower) ||
    c.code.toLowerCase().includes(filterLower)
  );

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="p-4 text-center text-gray-400 text-sm">
        ${window.lang === 'ar' ? 'لا توجد نتائج' : 'No results'}
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(country => `
    <button 
      onclick="selectCountry('${country.code}')" 
      class="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${country.code === currentCountry ? 'bg-purple-50 dark:bg-purple-900/30' : ''}"
    >
      <img src="https://flagcdn.com/w40/${country.code.toLowerCase()}.png" class="w-6 h-4 object-cover rounded-sm shadow-sm" alt="${country.code}">
      <span class="flex-1 ${country.rtl ? 'text-right' : 'text-left'} text-sm font-medium text-gray-900 dark:text-white">${country.name}</span>
      ${country.code === currentCountry ? '<i class="fas fa-check text-purple-600 text-sm"></i>' : ''}
    </button>
  `).join('');
}

function filterCountries(query) {
  renderCountriesList(query);
}

function selectCountry(countryCode) {
  const country = allCountries.find(c => c.code === countryCode);
  if (!country) return;

  // Save to cookie
  setCookie('country', countryCode, 365);
  setCookie('lang', country.lang, 365);

  // Save to user profile if logged in
  if (window.currentUser && window.sessionId) {
    updateUserPreferences(countryCode, country.lang);
  }

  // Reload page with new language
  window.location.href = `?lang=${country.lang}`;
}

// Cookie helpers
function setCookie(name, value, days) {
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? match[2] : null;
}

// Update user preferences on server
async function updateUserPreferences(country, lang) {
  try {
    await fetch('/api/users/preferences', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + window.sessionId
      },
      body: JSON.stringify({ country, language: lang })
    });
  } catch (err) {
    console.error('Failed to update preferences:', err);
  }
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
  const countryBtn = e.target.closest('[onclick*="toggleCountryMenu"]');
  const countryMenu = document.getElementById('countryMenu');
  if (!countryBtn && countryMenu && !countryMenu.contains(e.target)) {
    countryMenu.classList.add('hidden');
  }

  const userBtn = e.target.closest('[onclick*="toggleUserMenu"]');
  const userMenu = document.getElementById('userMenu');
  if (!userBtn && userMenu && !userMenu.contains(e.target)) {
    userMenu.classList.add('hidden');
  }
});

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  initCountries();
});

// ============================================
// User Menu Functions
// ============================================
function toggleUserMenu() {
  const menu = document.getElementById('userMenu');
  if (menu) {
    menu.classList.toggle('hidden');
  }
}

// ============================================
// Help Modal
// ============================================
function showHelp() {
  const helpText = window.lang === 'ar'
    ? 'مرحباً بك في منصة ديولي!\n\n• شاهد المنافسات المباشرة والمسجلة\n• سجل دخول للمشاركة وإنشاء منافسات\n• قيّم المتنافسين وشارك بالتعليقات\n\nللمزيد من المعلومات، تواصل معنا عبر البريد: support@dueli.com'
    : 'Welcome to Dueli!\n\n• Watch live and recorded competitions\n• Login to participate and create competitions\n• Rate competitors and share comments\n\nFor more info, contact us at: support@dueli.com';

  alert(helpText);
}

// ============================================
// Toast Notifications
// ============================================
function showToast(message, type = 'info') {
  // Remove existing toast
  const existing = document.querySelector('.toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toast.style.cssText = window.lang === 'ar' ? 'left: 24px;' : 'right: 24px;';

  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ============================================
// Utility Functions
// ============================================
function formatDate(dateStr, lang = 'ar') {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  };
  return date.toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', options);
}

function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

function formatTimeAgo(dateStr, lang = 'ar') {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  const now = new Date();
  const diff = now - date;

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (lang === 'ar') {
    if (minutes < 1) return 'الآن';
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days < 7) return `منذ ${days} يوم`;
    return formatDate(dateStr, lang);
  } else {
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return formatDate(dateStr, lang);
  }
}

function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ============================================
// API Helper
// ============================================
async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (window.sessionId) {
    headers['Authorization'] = 'Bearer ' + window.sessionId;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers
  });

  return response.json();
}

// ============================================
// YouTube Integration Helpers
// ============================================
const youtubeHelpers = {
  extractVideoId(url) {
    if (!url) return null;
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
      /^([a-zA-Z0-9_-]{11})$/
    ];
    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match) return match[1];
    }
    return null;
  },

  getEmbedUrl(videoIdOrUrl, autoplay = false) {
    const videoId = this.extractVideoId(videoIdOrUrl) || videoIdOrUrl;
    return `https://www.youtube.com/embed/${videoId}${autoplay ? '?autoplay=1' : ''}`;
  },

  getThumbnailUrl(videoIdOrUrl, quality = 'hqdefault') {
    const videoId = this.extractVideoId(videoIdOrUrl) || videoIdOrUrl;
    return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
  }
};

// ============================================
// Export Global
// ============================================
window.dueli = {
  checkAuth,
  updateAuthUI,
  showLoginModal,
  hideLoginModal,
  loginWith,
  logout,
  toggleDarkMode,
  toggleUserMenu,
  showHelp,
  showToast,
  formatDate,
  formatNumber,
  formatTimeAgo,
  debounce,
  api,
  youtubeHelpers
};

console.log('🔥 Dueli loaded successfully!');
