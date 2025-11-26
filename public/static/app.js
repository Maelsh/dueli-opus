// Dueli Frontend JavaScript
// منصة المنافسات والحوارات

// Global state
const state = {
  user: null,
  sessionId: null,
  lang: 'ar'
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
  // Load user from localStorage
  const savedUser = localStorage.getItem('user');
  const savedSession = localStorage.getItem('sessionId');
  
  if (savedUser && savedSession) {
    state.user = JSON.parse(savedUser);
    state.sessionId = savedSession;
  }
  
  // Get current language
  const urlParams = new URLSearchParams(window.location.search);
  state.lang = urlParams.get('lang') || 'ar';
  
  // Update UI based on auth state
  updateAuthUI();
});

// Update UI based on authentication state
function updateAuthUI() {
  const authButtons = document.querySelectorAll('[data-auth-required]');
  authButtons.forEach(btn => {
    if (!state.user) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.location.href = '/login?lang=' + state.lang;
      });
    }
  });
}

// Logout function
function logout() {
  localStorage.removeItem('user');
  localStorage.removeItem('sessionId');
  state.user = null;
  state.sessionId = null;
  window.location.href = '/?lang=' + state.lang;
}

// Format date
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

// Format number with K/M suffix
function formatNumber(num) {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  }
  if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toString();
}

// Show toast notification
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-4 ${state.lang === 'ar' ? 'left-4' : 'right-4'} px-6 py-3 rounded-lg shadow-lg z-50 animate-fade-in ${
    type === 'success' ? 'bg-green-500 text-white' :
    type === 'error' ? 'bg-red-500 text-white' :
    'bg-gray-800 text-white'
  }`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.remove();
  }, 3000);
}

// Debounce function
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

// API helper
async function api(endpoint, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  if (state.sessionId) {
    headers['Authorization'] = 'Bearer ' + state.sessionId;
  }
  
  const response = await fetch(endpoint, {
    ...options,
    headers
  });
  
  return response.json();
}

// Search functionality
const searchInput = document.getElementById('searchInput');
if (searchInput) {
  searchInput.addEventListener('input', debounce(async (e) => {
    const query = e.target.value.trim();
    if (query.length < 2) return;
    
    // Redirect to explore with search query
    window.location.href = `/explore?search=${encodeURIComponent(query)}&lang=${state.lang}`;
  }, 500));
}

// YouTube Integration helpers
const youtubeHelpers = {
  // Extract video ID from various YouTube URL formats
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
  
  // Generate embed URL
  getEmbedUrl(videoIdOrUrl, autoplay = false) {
    const videoId = this.extractVideoId(videoIdOrUrl) || videoIdOrUrl;
    return `https://www.youtube.com/embed/${videoId}${autoplay ? '?autoplay=1' : ''}`;
  },
  
  // Generate thumbnail URL
  getThumbnailUrl(videoIdOrUrl, quality = 'hqdefault') {
    const videoId = this.extractVideoId(videoIdOrUrl) || videoIdOrUrl;
    return `https://img.youtube.com/vi/${videoId}/${quality}.jpg`;
  }
};

// Export for global use
window.dueli = {
  state,
  logout,
  formatDate,
  formatNumber,
  showToast,
  api,
  youtubeHelpers
};

console.log('🔥 Dueli loaded successfully!');
