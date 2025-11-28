// Dueli Frontend JavaScript - New Design
// منصة المنافسات والحوارات

// ============================================
// Global State
// ============================================
window.currentUser = null;
window.sessionId = null;
window.lang = 'ar';
window.isDarkMode = false;

// ============================================
// Initialize
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  // Get current language from URL
  const urlParams = new URLSearchParams(window.location.search);
  window.lang = urlParams.get('lang') || 'ar';
  
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
    }, 300);
  }
}

// Login with OAuth provider
async function loginWith(provider) {
  // In production, this would redirect to actual OAuth flow
  // For demo, we'll simulate OAuth login with mock data
  
  const mockUsers = {
    google: {
      email: 'demo.user@gmail.com',
      name: window.lang === 'ar' ? 'مستخدم تجريبي' : 'Demo User',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=google'
    },
    facebook: {
      email: 'demo.user@facebook.com',
      name: window.lang === 'ar' ? 'مستخدم فيسبوك' : 'Facebook User',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=facebook'
    },
    microsoft: {
      email: 'demo.user@outlook.com',
      name: window.lang === 'ar' ? 'مستخدم مايكروسوفت' : 'Microsoft User',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=microsoft'
    },
    twitter: {
      email: 'demo.user@twitter.com',
      name: window.lang === 'ar' ? 'مستخدم تويتر' : 'Twitter User',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=twitter'
    }
  };
  
  const mockUser = mockUsers[provider] || mockUsers.google;
  
  try {
    const res = await fetch('/api/auth/oauth', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: provider,
        email: mockUser.email,
        name: mockUser.name,
        avatar: mockUser.avatar
      })
    });
    
    const data = await res.json();
    
    if (data.success) {
      window.currentUser = data.data.user;
      window.sessionId = data.data.sessionId;
      
      localStorage.setItem('user', JSON.stringify(data.data.user));
      localStorage.setItem('sessionId', data.data.sessionId);
      
      hideLoginModal();
      updateAuthUI();
      showToast(window.lang === 'ar' ? 'تم تسجيل الدخول بنجاح!' : 'Login successful!', 'success');
      
      // Reload competitions if on home page
      if (typeof loadCompetitions === 'function') {
        loadCompetitions();
      }
    } else {
      showToast(data.error || 'Login failed', 'error');
    }
  } catch (err) {
    console.error('Login error:', err);
    showToast(window.lang === 'ar' ? 'حدث خطأ أثناء تسجيل الدخول' : 'Login error occurred', 'error');
  }
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
  if (window.isDarkMode) {
    document.documentElement.classList.add('dark');
    document.body.classList.add('dark');
    document.body.classList.remove('light');
  } else {
    document.documentElement.classList.remove('dark');
    document.body.classList.remove('dark');
    document.body.classList.add('light');
  }
}

// ============================================
// Language Menu Functions
// ============================================
function toggleLangMenu() {
  const menu = document.getElementById('langMenu');
  if (menu) {
    menu.classList.toggle('hidden');
  }
}

// Close menus when clicking outside
document.addEventListener('click', (e) => {
  const langBtn = e.target.closest('[onclick*="toggleLangMenu"]');
  const langMenu = document.getElementById('langMenu');
  if (!langBtn && langMenu && !langMenu.contains(e.target)) {
    langMenu.classList.add('hidden');
  }
  
  const userBtn = e.target.closest('[onclick*="toggleUserMenu"]');
  const userMenu = document.getElementById('userMenu');
  if (!userBtn && userMenu && !userMenu.contains(e.target)) {
    userMenu.classList.add('hidden');
  }
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
  toggleLangMenu,
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
