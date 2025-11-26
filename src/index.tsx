import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { translations, t, getDir, Language } from './i18n'

// Types
type Bindings = {
  DB: D1Database;
}

type Variables = {
  lang: Language;
  user: any;
}

const app = new Hono<{ Bindings: Bindings; Variables: Variables }>()

// Middleware
app.use('/api/*', cors())

// Language middleware
app.use('*', async (c, next) => {
  const langParam = c.req.query('lang')
  const acceptLang = c.req.header('Accept-Language')
  let lang: Language = 'ar'
  
  if (langParam === 'en' || langParam === 'ar') {
    lang = langParam
  } else if (acceptLang?.includes('en')) {
    lang = 'en'
  }
  
  c.set('lang', lang)
  await next()
})

// Static files
app.use('/static/*', serveStatic({ root: './public' }))

// ============ API Routes ============

// Get categories
app.get('/api/categories', async (c) => {
  const { DB } = c.env
  try {
    const categories = await DB.prepare(`
      SELECT c.*, 
             p.name_ar as parent_name_ar, 
             p.name_en as parent_name_en
      FROM categories c
      LEFT JOIN categories p ON c.parent_id = p.id
      WHERE c.is_active = 1
      ORDER BY c.parent_id NULLS FIRST, c.sort_order
    `).all()
    
    return c.json({ success: true, data: categories.results })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch categories' }, 500)
  }
})

// Get countries
app.get('/api/countries', async (c) => {
  const { DB } = c.env
  try {
    const countries = await DB.prepare('SELECT * FROM countries ORDER BY name_en').all()
    return c.json({ success: true, data: countries.results })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch countries' }, 500)
  }
})

// Get competitions with filters
app.get('/api/competitions', async (c) => {
  const { DB } = c.env
  const status = c.req.query('status') || 'all'
  const category = c.req.query('category')
  const country = c.req.query('country')
  const language = c.req.query('language')
  const search = c.req.query('search')
  const limit = parseInt(c.req.query('limit') || '20')
  const offset = parseInt(c.req.query('offset') || '0')
  
  try {
    let query = `
      SELECT c.*, 
             cat.name_ar as category_name_ar,
             cat.name_en as category_name_en,
             cat.icon as category_icon,
             cat.color as category_color,
             u1.display_name as creator_name,
             u1.avatar_url as creator_avatar,
             u2.display_name as opponent_name,
             u2.avatar_url as opponent_avatar
      FROM competitions c
      JOIN categories cat ON c.category_id = cat.id
      JOIN users u1 ON c.creator_id = u1.id
      LEFT JOIN users u2 ON c.opponent_id = u2.id
      WHERE 1=1
    `
    const params: any[] = []
    
    if (status !== 'all') {
      query += ' AND c.status = ?'
      params.push(status)
    }
    
    if (category) {
      query += ' AND (c.category_id = ? OR c.subcategory_id = ?)'
      params.push(category, category)
    }
    
    if (country) {
      query += ' AND c.country = ?'
      params.push(country)
    }
    
    if (language) {
      query += ' AND c.language = ?'
      params.push(language)
    }
    
    if (search) {
      query += ' AND (c.title LIKE ? OR c.description LIKE ?)'
      params.push(`%${search}%`, `%${search}%`)
    }
    
    query += ' ORDER BY c.created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)
    
    const competitions = await DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: competitions.results })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch competitions' }, 500)
  }
})

// Get single competition
app.get('/api/competitions/:id', async (c) => {
  const { DB } = c.env
  const id = c.req.param('id')
  
  try {
    const competition = await DB.prepare(`
      SELECT c.*, 
             cat.name_ar as category_name_ar,
             cat.name_en as category_name_en,
             cat.icon as category_icon,
             u1.display_name as creator_name,
             u1.avatar_url as creator_avatar,
             u1.username as creator_username,
             u2.display_name as opponent_name,
             u2.avatar_url as opponent_avatar,
             u2.username as opponent_username
      FROM competitions c
      JOIN categories cat ON c.category_id = cat.id
      JOIN users u1 ON c.creator_id = u1.id
      LEFT JOIN users u2 ON c.opponent_id = u2.id
      WHERE c.id = ?
    `).bind(id).first()
    
    if (!competition) {
      return c.json({ success: false, error: 'Competition not found' }, 404)
    }
    
    // Get comments
    const comments = await DB.prepare(`
      SELECT cm.*, u.display_name, u.avatar_url, u.username
      FROM comments cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.competition_id = ?
      ORDER BY cm.created_at DESC
      LIMIT 50
    `).bind(id).all()
    
    // Get ratings summary
    const ratings = await DB.prepare(`
      SELECT competitor_id, AVG(rating) as avg_rating, COUNT(*) as count
      FROM ratings
      WHERE competition_id = ?
      GROUP BY competitor_id
    `).bind(id).all()
    
    return c.json({ 
      success: true, 
      data: {
        ...competition,
        comments: comments.results,
        ratings: ratings.results
      }
    })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch competition' }, 500)
  }
})

// Create competition
app.post('/api/competitions', async (c) => {
  const { DB } = c.env
  
  try {
    const body = await c.req.json()
    const { title, description, rules, category_id, subcategory_id, creator_id, language, country, scheduled_at } = body
    
    if (!title || !rules || !category_id || !creator_id) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }
    
    const result = await DB.prepare(`
      INSERT INTO competitions (title, description, rules, category_id, subcategory_id, creator_id, language, country, scheduled_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(title, description, rules, category_id, subcategory_id || null, creator_id, language || 'ar', country, scheduled_at || null).run()
    
    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to create competition' }, 500)
  }
})

// Send invite
app.post('/api/competitions/:id/invite', async (c) => {
  const { DB } = c.env
  const competitionId = c.req.param('id')
  
  try {
    const body = await c.req.json()
    const { inviter_id, invitee_id, message } = body
    
    const result = await DB.prepare(`
      INSERT INTO competition_invites (competition_id, inviter_id, invitee_id, message)
      VALUES (?, ?, ?, ?)
    `).bind(competitionId, inviter_id, invitee_id, message || null).run()
    
    // Create notification
    await DB.prepare(`
      INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
      VALUES (?, 'invite', ?, ?, 'competition', ?)
    `).bind(invitee_id, 'دعوة للمنافسة', message || 'لديك دعوة للمشاركة في منافسة', competitionId).run()
    
    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to send invite' }, 500)
  }
})

// Request to join competition
app.post('/api/competitions/:id/request', async (c) => {
  const { DB } = c.env
  const competitionId = c.req.param('id')
  
  try {
    const body = await c.req.json()
    const { requester_id, message } = body
    
    const result = await DB.prepare(`
      INSERT INTO competition_requests (competition_id, requester_id, message)
      VALUES (?, ?, ?)
    `).bind(competitionId, requester_id, message || null).run()
    
    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to send request' }, 500)
  }
})

// Accept competition (set opponent)
app.post('/api/competitions/:id/accept', async (c) => {
  const { DB } = c.env
  const competitionId = c.req.param('id')
  
  try {
    const body = await c.req.json()
    const { opponent_id } = body
    
    await DB.prepare(`
      UPDATE competitions SET opponent_id = ?, status = 'accepted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(opponent_id, competitionId).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to accept competition' }, 500)
  }
})

// Start live competition
app.post('/api/competitions/:id/start', async (c) => {
  const { DB } = c.env
  const competitionId = c.req.param('id')
  
  try {
    const body = await c.req.json()
    const { youtube_live_id } = body
    
    await DB.prepare(`
      UPDATE competitions 
      SET status = 'live', started_at = CURRENT_TIMESTAMP, youtube_live_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(youtube_live_id || null, competitionId).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to start competition' }, 500)
  }
})

// End competition
app.post('/api/competitions/:id/end', async (c) => {
  const { DB } = c.env
  const competitionId = c.req.param('id')
  
  try {
    const body = await c.req.json()
    const { youtube_video_url, ad_revenue } = body
    
    // Calculate earnings based on ratings
    const ratings = await DB.prepare(`
      SELECT competitor_id, AVG(rating) as avg_rating
      FROM ratings WHERE competition_id = ?
      GROUP BY competitor_id
    `).bind(competitionId).all()
    
    let creator_rating = 0, opponent_rating = 0
    ratings.results?.forEach((r: any) => {
      // This is simplified - in production would need proper logic
    })
    
    const totalRating = creator_rating + opponent_rating || 1
    const netRevenue = (ad_revenue || 0) * 0.8 // 80% after platform fee
    const creator_earnings = netRevenue * (creator_rating / totalRating) || netRevenue / 2
    const opponent_earnings = netRevenue * (opponent_rating / totalRating) || netRevenue / 2
    
    await DB.prepare(`
      UPDATE competitions 
      SET status = 'completed', ended_at = CURRENT_TIMESTAMP, 
          youtube_video_url = ?, ad_revenue = ?,
          creator_rating = ?, opponent_rating = ?,
          creator_earnings = ?, opponent_earnings = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(youtube_video_url, ad_revenue || 0, creator_rating, opponent_rating, creator_earnings, opponent_earnings, competitionId).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to end competition' }, 500)
  }
})

// Add comment
app.post('/api/competitions/:id/comments', async (c) => {
  const { DB } = c.env
  const competitionId = c.req.param('id')
  
  try {
    const body = await c.req.json()
    const { user_id, content, is_live } = body
    
    if (!user_id || !content) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }
    
    const result = await DB.prepare(`
      INSERT INTO comments (competition_id, user_id, content, is_live)
      VALUES (?, ?, ?, ?)
    `).bind(competitionId, user_id, content, is_live ? 1 : 0).run()
    
    // Update comment count
    await DB.prepare(`
      UPDATE competitions SET total_comments = total_comments + 1 WHERE id = ?
    `).bind(competitionId).run()
    
    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to add comment' }, 500)
  }
})

// Add rating
app.post('/api/competitions/:id/rate', async (c) => {
  const { DB } = c.env
  const competitionId = c.req.param('id')
  
  try {
    const body = await c.req.json()
    const { user_id, competitor_id, rating } = body
    
    if (!user_id || !competitor_id || !rating || rating < 1 || rating > 5) {
      return c.json({ success: false, error: 'Invalid rating data' }, 400)
    }
    
    await DB.prepare(`
      INSERT OR REPLACE INTO ratings (competition_id, user_id, competitor_id, rating)
      VALUES (?, ?, ?, ?)
    `).bind(competitionId, user_id, competitor_id, rating).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to add rating' }, 500)
  }
})

// User registration
app.post('/api/auth/register', async (c) => {
  const { DB } = c.env
  
  try {
    const body = await c.req.json()
    const { email, username, password, display_name, country, language } = body
    
    if (!email || !username || !password || !display_name) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }
    
    // Simple password hash (in production use proper hashing)
    const password_hash = btoa(password + 'dueli_salt')
    
    const result = await DB.prepare(`
      INSERT INTO users (email, username, password_hash, display_name, country, language)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(email, username, password_hash, display_name, country || 'SA', language || 'ar').run()
    
    // Create session
    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    
    await DB.prepare(`
      INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)
    `).bind(sessionId, result.meta.last_row_id, expiresAt).run()
    
    return c.json({ 
      success: true, 
      data: { 
        id: result.meta.last_row_id,
        sessionId 
      }
    })
  } catch (error: any) {
    if (error.message?.includes('UNIQUE')) {
      return c.json({ success: false, error: 'Email or username already exists' }, 400)
    }
    return c.json({ success: false, error: 'Failed to register' }, 500)
  }
})

// User login
app.post('/api/auth/login', async (c) => {
  const { DB } = c.env
  
  try {
    const body = await c.req.json()
    const { email, password } = body
    
    const password_hash = btoa(password + 'dueli_salt')
    
    const user = await DB.prepare(`
      SELECT id, email, username, display_name, avatar_url, country, language, is_admin
      FROM users WHERE email = ? AND password_hash = ?
    `).bind(email, password_hash).first()
    
    if (!user) {
      return c.json({ success: false, error: 'Invalid credentials' }, 401)
    }
    
    // Create session
    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    
    await DB.prepare(`
      INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)
    `).bind(sessionId, user.id, expiresAt).run()
    
    return c.json({ 
      success: true, 
      data: { 
        user,
        sessionId 
      }
    })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to login' }, 500)
  }
})

// Get user profile
app.get('/api/users/:username', async (c) => {
  const { DB } = c.env
  const username = c.req.param('username')
  
  try {
    const user = await DB.prepare(`
      SELECT id, username, display_name, avatar_url, bio, country, language,
             total_competitions, total_wins, total_views, average_rating, total_earnings,
             is_verified, created_at
      FROM users WHERE username = ?
    `).bind(username).first()
    
    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404)
    }
    
    // Get follower counts
    const followers = await DB.prepare(`
      SELECT COUNT(*) as count FROM follows WHERE following_id = ?
    `).bind(user.id).first()
    
    const following = await DB.prepare(`
      SELECT COUNT(*) as count FROM follows WHERE follower_id = ?
    `).bind(user.id).first()
    
    // Get recent competitions
    const competitions = await DB.prepare(`
      SELECT c.*, cat.name_ar, cat.name_en, cat.icon
      FROM competitions c
      JOIN categories cat ON c.category_id = cat.id
      WHERE c.creator_id = ? OR c.opponent_id = ?
      ORDER BY c.created_at DESC
      LIMIT 10
    `).bind(user.id, user.id).all()
    
    return c.json({ 
      success: true, 
      data: {
        ...user,
        followers_count: (followers as any)?.count || 0,
        following_count: (following as any)?.count || 0,
        competitions: competitions.results
      }
    })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch user' }, 500)
  }
})

// Follow user
app.post('/api/users/:id/follow', async (c) => {
  const { DB } = c.env
  const followingId = c.req.param('id')
  
  try {
    const body = await c.req.json()
    const { follower_id } = body
    
    await DB.prepare(`
      INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)
    `).bind(follower_id, followingId).run()
    
    // Create notification
    await DB.prepare(`
      INSERT INTO notifications (user_id, type, title, reference_type, reference_id)
      VALUES (?, 'follow', 'متابع جديد', 'user', ?)
    `).bind(followingId, follower_id).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to follow' }, 500)
  }
})

// Unfollow user
app.delete('/api/users/:id/follow', async (c) => {
  const { DB } = c.env
  const followingId = c.req.param('id')
  
  try {
    const body = await c.req.json()
    const { follower_id } = body
    
    await DB.prepare(`
      DELETE FROM follows WHERE follower_id = ? AND following_id = ?
    `).bind(follower_id, followingId).run()
    
    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to unfollow' }, 500)
  }
})

// Get notifications
app.get('/api/notifications', async (c) => {
  const { DB } = c.env
  const userId = c.req.query('user_id')
  
  if (!userId) {
    return c.json({ success: false, error: 'User ID required' }, 400)
  }
  
  try {
    const notifications = await DB.prepare(`
      SELECT * FROM notifications 
      WHERE user_id = ? 
      ORDER BY created_at DESC 
      LIMIT 50
    `).bind(userId).all()
    
    return c.json({ success: true, data: notifications.results })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch notifications' }, 500)
  }
})

// Search users (for invites)
app.get('/api/users/search', async (c) => {
  const { DB } = c.env
  const query = c.req.query('q')
  const category = c.req.query('category')
  
  if (!query) {
    return c.json({ success: false, error: 'Search query required' }, 400)
  }
  
  try {
    const users = await DB.prepare(`
      SELECT id, username, display_name, avatar_url, country, average_rating, total_competitions
      FROM users 
      WHERE (username LIKE ? OR display_name LIKE ?)
      LIMIT 20
    `).bind(`%${query}%`, `%${query}%`).all()
    
    return c.json({ success: true, data: users.results })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to search users' }, 500)
  }
})

// ============ HTML Pages ============

// Helper function to generate HTML
const generateHTML = (content: string, lang: Language, title: string = 'Dueli') => {
  const dir = getDir(lang)
  const tr = translations[lang]
  
  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - Dueli</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script>
      tailwind.config = {
        theme: {
          extend: {
            fontFamily: {
              'cairo': ['Cairo', 'sans-serif'],
              'inter': ['Inter', 'sans-serif'],
            },
            colors: {
              primary: '#6366F1',
              secondary: '#EC4899',
              dialogue: '#EF4444',
              science: '#10B981',
              talents: '#F59E0B',
            }
          }
        }
      }
    </script>
    <style>
      body { font-family: ${lang === 'ar' ? "'Cairo'" : "'Inter'"}, sans-serif; }
      .gradient-bg { background: linear-gradient(135deg, #6366F1 0%, #EC4899 100%); }
      .card-hover { transition: all 0.3s ease; }
      .card-hover:hover { transform: translateY(-4px); box-shadow: 0 12px 24px rgba(0,0,0,0.15); }
      .live-pulse { animation: pulse 2s infinite; }
      @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
    </style>
</head>
<body class="bg-gray-50 min-h-screen">
    ${content}
    <script src="/static/app.js"></script>
</body>
</html>`
}

// Navigation component
const getNavigation = (lang: Language, currentUser: any = null) => {
  const tr = translations[lang]
  const otherLang = lang === 'ar' ? 'en' : 'ar'
  
  return `
    <nav class="gradient-bg text-white shadow-lg sticky top-0 z-50">
      <div class="max-w-7xl mx-auto px-4">
        <div class="flex justify-between items-center h-16">
          <div class="flex items-center gap-6">
            <a href="/?lang=${lang}" class="text-2xl font-bold flex items-center gap-2">
              <i class="fas fa-fire"></i>
              Dueli
            </a>
            <div class="hidden md:flex items-center gap-4">
              <a href="/?lang=${lang}" class="hover:text-gray-200 transition">${tr.home}</a>
              <a href="/explore?lang=${lang}" class="hover:text-gray-200 transition">${tr.explore}</a>
              <a href="/live?lang=${lang}" class="hover:text-gray-200 transition flex items-center gap-1">
                <span class="w-2 h-2 bg-red-400 rounded-full live-pulse"></span>
                ${tr.live}
              </a>
            </div>
          </div>
          
          <div class="flex items-center gap-4">
            <div class="relative hidden md:block">
              <input type="text" placeholder="${tr.search}" 
                     class="bg-white/20 border-0 rounded-full px-4 py-2 text-sm w-64 placeholder-white/70 focus:outline-none focus:ring-2 focus:ring-white/50"
                     id="searchInput">
              <i class="fas fa-search absolute ${lang === 'ar' ? 'left-3' : 'right-3'} top-1/2 -translate-y-1/2 text-white/70"></i>
            </div>
            
            <a href="?lang=${otherLang}" class="px-3 py-1 bg-white/20 rounded-full text-sm hover:bg-white/30 transition">
              ${otherLang === 'ar' ? 'عربي' : 'EN'}
            </a>
            
            ${currentUser ? `
              <a href="/notifications?lang=${lang}" class="relative hover:text-gray-200">
                <i class="fas fa-bell text-xl"></i>
                <span class="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full text-xs flex items-center justify-center">3</span>
              </a>
              <a href="/profile/${currentUser.username}?lang=${lang}" class="flex items-center gap-2 hover:text-gray-200">
                <img src="${currentUser.avatar_url || 'https://ui-avatars.com/api/?name=' + currentUser.display_name}" 
                     class="w-8 h-8 rounded-full border-2 border-white/50">
              </a>
            ` : `
              <a href="/login?lang=${lang}" class="hover:text-gray-200 transition">${tr.login}</a>
              <a href="/register?lang=${lang}" class="bg-white text-primary px-4 py-2 rounded-full font-medium hover:bg-gray-100 transition">
                ${tr.register}
              </a>
            `}
          </div>
        </div>
      </div>
    </nav>
  `
}

// Footer component
const getFooter = (lang: Language) => {
  const tr = translations[lang]
  
  return `
    <footer class="bg-gray-900 text-white py-12 mt-16">
      <div class="max-w-7xl mx-auto px-4">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 class="text-2xl font-bold flex items-center gap-2 mb-4">
              <i class="fas fa-fire text-primary"></i>
              Dueli
            </h3>
            <p class="text-gray-400">${tr.platform_description}</p>
            <div class="flex items-center gap-2 mt-4">
              <span class="px-2 py-1 bg-green-500/20 text-green-400 rounded text-xs">${tr.open_source}</span>
              <span class="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-xs">${tr.non_profit}</span>
            </div>
          </div>
          
          <div>
            <h4 class="font-semibold mb-4">${tr.categories}</h4>
            <ul class="space-y-2 text-gray-400">
              <li><a href="/explore?category=1&lang=${lang}" class="hover:text-white transition"><i class="fas fa-comments text-dialogue ${lang === 'ar' ? 'ml-2' : 'mr-2'}"></i>${tr.dialogue}</a></li>
              <li><a href="/explore?category=2&lang=${lang}" class="hover:text-white transition"><i class="fas fa-flask text-science ${lang === 'ar' ? 'ml-2' : 'mr-2'}"></i>${tr.science}</a></li>
              <li><a href="/explore?category=3&lang=${lang}" class="hover:text-white transition"><i class="fas fa-star text-talents ${lang === 'ar' ? 'ml-2' : 'mr-2'}"></i>${tr.talents}</a></li>
            </ul>
          </div>
          
          <div>
            <h4 class="font-semibold mb-4">${tr.about}</h4>
            <ul class="space-y-2 text-gray-400">
              <li><a href="/about?lang=${lang}" class="hover:text-white transition">${tr.about}</a></li>
              <li><a href="/contact?lang=${lang}" class="hover:text-white transition">${tr.contact}</a></li>
              <li><a href="/terms?lang=${lang}" class="hover:text-white transition">${tr.terms}</a></li>
              <li><a href="/privacy?lang=${lang}" class="hover:text-white transition">${tr.privacy}</a></li>
            </ul>
          </div>
          
          <div>
            <h4 class="font-semibold mb-4">${tr.github}</h4>
            <a href="https://github.com/dueli" target="_blank" class="flex items-center gap-2 text-gray-400 hover:text-white transition">
              <i class="fab fa-github text-2xl"></i>
              <span>dueli/platform</span>
            </a>
            <div class="flex gap-4 mt-4">
              <a href="#" class="text-gray-400 hover:text-white"><i class="fab fa-twitter text-xl"></i></a>
              <a href="#" class="text-gray-400 hover:text-white"><i class="fab fa-discord text-xl"></i></a>
              <a href="#" class="text-gray-400 hover:text-white"><i class="fab fa-telegram text-xl"></i></a>
            </div>
          </div>
        </div>
        
        <div class="border-t border-gray-800 mt-8 pt-8 text-center text-gray-500">
          <p>&copy; 2024 Dueli. ${tr.open_source} - MIT License</p>
        </div>
      </div>
    </footer>
  `
}

// Home page
app.get('/', (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  
  const content = `
    ${getNavigation(lang)}
    
    <!-- Hero Section -->
    <section class="gradient-bg text-white py-20">
      <div class="max-w-7xl mx-auto px-4 text-center">
        <h1 class="text-5xl md:text-6xl font-bold mb-6">${tr.hero_title}</h1>
        <p class="text-xl md:text-2xl mb-8 text-white/80">${tr.hero_subtitle}</p>
        <div class="flex flex-wrap justify-center gap-4">
          <a href="/register?lang=${lang}" class="bg-white text-primary px-8 py-3 rounded-full font-bold text-lg hover:bg-gray-100 transition shadow-lg">
            <i class="fas fa-rocket ${lang === 'ar' ? 'ml-2' : 'mr-2'}"></i>${tr.get_started}
          </a>
          <a href="/live?lang=${lang}" class="bg-white/20 px-8 py-3 rounded-full font-bold text-lg hover:bg-white/30 transition">
            <i class="fas fa-play ${lang === 'ar' ? 'ml-2' : 'mr-2'}"></i>${tr.watch_live}
          </a>
        </div>
      </div>
    </section>
    
    <!-- Categories Section -->
    <section class="py-16">
      <div class="max-w-7xl mx-auto px-4">
        <h2 class="text-3xl font-bold text-center mb-12">${tr.categories}</h2>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8">
          <!-- Dialogue -->
          <a href="/explore?category=1&lang=${lang}" class="card-hover bg-white rounded-2xl p-8 shadow-lg border-t-4 border-dialogue">
            <div class="w-16 h-16 bg-dialogue/10 rounded-full flex items-center justify-center mb-4">
              <i class="fas fa-comments text-3xl text-dialogue"></i>
            </div>
            <h3 class="text-2xl font-bold mb-2">${tr.dialogue}</h3>
            <p class="text-gray-600 mb-4">${lang === 'ar' ? 'مناظرات وحوارات فكرية حول الأديان والسياسة والقضايا المعاصرة' : 'Intellectual debates on religions, politics, and contemporary issues'}</p>
            <div class="flex flex-wrap gap-2">
              <span class="px-3 py-1 bg-gray-100 rounded-full text-sm">${tr.religions}</span>
              <span class="px-3 py-1 bg-gray-100 rounded-full text-sm">${tr.politics}</span>
              <span class="px-3 py-1 bg-gray-100 rounded-full text-sm">${tr.disputes}</span>
            </div>
          </a>
          
          <!-- Science -->
          <a href="/explore?category=2&lang=${lang}" class="card-hover bg-white rounded-2xl p-8 shadow-lg border-t-4 border-science">
            <div class="w-16 h-16 bg-science/10 rounded-full flex items-center justify-center mb-4">
              <i class="fas fa-flask text-3xl text-science"></i>
            </div>
            <h3 class="text-2xl font-bold mb-2">${tr.science}</h3>
            <p class="text-gray-600 mb-4">${lang === 'ar' ? 'مناقشات علمية ونظريات مع مشاركة الجمهور في فهم العلوم' : 'Scientific discussions and theories with public participation'}</p>
            <div class="flex flex-wrap gap-2">
              <span class="px-3 py-1 bg-gray-100 rounded-full text-sm">${tr.physics}</span>
              <span class="px-3 py-1 bg-gray-100 rounded-full text-sm">${tr.technology}</span>
              <span class="px-3 py-1 bg-gray-100 rounded-full text-sm">${tr.philosophy}</span>
            </div>
          </a>
          
          <!-- Talents -->
          <a href="/explore?category=3&lang=${lang}" class="card-hover bg-white rounded-2xl p-8 shadow-lg border-t-4 border-talents">
            <div class="w-16 h-16 bg-talents/10 rounded-full flex items-center justify-center mb-4">
              <i class="fas fa-star text-3xl text-talents"></i>
            </div>
            <h3 class="text-2xl font-bold mb-2">${tr.talents}</h3>
            <p class="text-gray-600 mb-4">${lang === 'ar' ? 'عرض المواهب والقدرات مع فرصة للربح من التقييمات' : 'Showcase talents with earning opportunities from ratings'}</p>
            <div class="flex flex-wrap gap-2">
              <span class="px-3 py-1 bg-gray-100 rounded-full text-sm">${tr.singing}</span>
              <span class="px-3 py-1 bg-gray-100 rounded-full text-sm">${tr.poetry}</span>
              <span class="px-3 py-1 bg-gray-100 rounded-full text-sm">${tr.gaming}</span>
            </div>
          </a>
        </div>
      </div>
    </section>
    
    <!-- Live Now Section -->
    <section class="py-16 bg-gray-100">
      <div class="max-w-7xl mx-auto px-4">
        <div class="flex justify-between items-center mb-8">
          <h2 class="text-3xl font-bold flex items-center gap-3">
            <span class="w-3 h-3 bg-red-500 rounded-full live-pulse"></span>
            ${tr.live}
          </h2>
          <a href="/live?lang=${lang}" class="text-primary hover:underline font-medium">${tr.view_all} <i class="fas fa-arrow-${lang === 'ar' ? 'left' : 'right'}"></i></a>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="liveCompetitions">
          <!-- Will be loaded dynamically -->
          <div class="col-span-full text-center py-12 text-gray-500">
            <i class="fas fa-spinner fa-spin text-3xl mb-4"></i>
            <p>${lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
          </div>
        </div>
      </div>
    </section>
    
    <!-- Upcoming Competitions -->
    <section class="py-16">
      <div class="max-w-7xl mx-auto px-4">
        <div class="flex justify-between items-center mb-8">
          <h2 class="text-3xl font-bold">${tr.upcoming}</h2>
          <a href="/explore?status=pending&lang=${lang}" class="text-primary hover:underline font-medium">${tr.view_all} <i class="fas fa-arrow-${lang === 'ar' ? 'left' : 'right'}"></i></a>
        </div>
        
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6" id="upcomingCompetitions">
          <!-- Will be loaded dynamically -->
          <div class="col-span-full text-center py-12 text-gray-500">
            <i class="fas fa-spinner fa-spin text-3xl mb-4"></i>
            <p>${lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
          </div>
        </div>
      </div>
    </section>
    
    <!-- How It Works -->
    <section class="py-16 bg-gray-900 text-white">
      <div class="max-w-7xl mx-auto px-4">
        <h2 class="text-3xl font-bold text-center mb-12">${lang === 'ar' ? 'كيف تعمل المنصة؟' : 'How It Works?'}</h2>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div class="text-center">
            <div class="w-16 h-16 gradient-bg rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">1</div>
            <h3 class="text-xl font-bold mb-2">${lang === 'ar' ? 'سجّل' : 'Register'}</h3>
            <p class="text-gray-400">${lang === 'ar' ? 'أنشئ حسابك واربط قناتك على يوتيوب' : 'Create your account and link your YouTube channel'}</p>
          </div>
          <div class="text-center">
            <div class="w-16 h-16 gradient-bg rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">2</div>
            <h3 class="text-xl font-bold mb-2">${lang === 'ar' ? 'أنشئ' : 'Create'}</h3>
            <p class="text-gray-400">${lang === 'ar' ? 'أنشئ منافسة وحدد القوانين والشروط' : 'Create a competition and set the rules'}</p>
          </div>
          <div class="text-center">
            <div class="w-16 h-16 gradient-bg rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">3</div>
            <h3 class="text-xl font-bold mb-2">${lang === 'ar' ? 'نافس' : 'Compete'}</h3>
            <p class="text-gray-400">${lang === 'ar' ? 'ابدأ البث المباشر ونافس خصمك' : 'Start live streaming and compete'}</p>
          </div>
          <div class="text-center">
            <div class="w-16 h-16 gradient-bg rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">4</div>
            <h3 class="text-xl font-bold mb-2">${lang === 'ar' ? 'اربح' : 'Earn'}</h3>
            <p class="text-gray-400">${lang === 'ar' ? 'احصل على 80% من إيرادات الإعلانات حسب تقييمك' : 'Get 80% of ad revenue based on your rating'}</p>
          </div>
        </div>
      </div>
    </section>
    
    <!-- CTA Section -->
    <section class="py-20 gradient-bg text-white">
      <div class="max-w-4xl mx-auto px-4 text-center">
        <h2 class="text-4xl font-bold mb-6">${lang === 'ar' ? 'هل أنت مستعد للمنافسة؟' : 'Ready to Compete?'}</h2>
        <p class="text-xl mb-8 text-white/80">${lang === 'ar' ? 'انضم إلى آلاف المتنافسين حول العالم وشارك أفكارك ومواهبك' : 'Join thousands of competitors worldwide and share your ideas and talents'}</p>
        <a href="/register?lang=${lang}" class="bg-white text-primary px-8 py-4 rounded-full font-bold text-lg hover:bg-gray-100 transition shadow-lg inline-block">
          ${tr.get_started} <i class="fas fa-arrow-${lang === 'ar' ? 'left' : 'right'} ${lang === 'ar' ? 'mr-2' : 'ml-2'}"></i>
        </a>
      </div>
    </section>
    
    ${getFooter(lang)}
    
    <script>
      const lang = '${lang}';
      
      // Load live competitions
      async function loadLiveCompetitions() {
        try {
          const res = await fetch('/api/competitions?status=live&limit=6');
          const data = await res.json();
          const container = document.getElementById('liveCompetitions');
          
          if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(comp => \`
              <a href="/competition/\${comp.id}?lang=${lang}" class="card-hover bg-white rounded-xl overflow-hidden shadow-lg">
                <div class="relative aspect-video bg-gray-900">
                  <div class="absolute inset-0 flex items-center justify-center">
                    <i class="fas fa-play-circle text-white/50 text-5xl"></i>
                  </div>
                  <div class="absolute top-3 \${lang === 'ar' ? 'right-3' : 'left-3'} flex items-center gap-2">
                    <span class="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                      <span class="w-2 h-2 bg-white rounded-full live-pulse"></span>
                      ${tr.live}
                    </span>
                  </div>
                  <div class="absolute bottom-3 \${lang === 'ar' ? 'left-3' : 'right-3'} bg-black/60 text-white px-2 py-1 rounded text-xs">
                    <i class="fas fa-eye \${lang === 'ar' ? 'ml-1' : 'mr-1'}"></i>\${comp.total_views} ${tr.viewers}
                  </div>
                </div>
                <div class="p-4">
                  <h3 class="font-bold mb-2 line-clamp-1">\${comp.title}</h3>
                  <div class="flex items-center justify-between text-sm text-gray-500">
                    <span><i class="\${comp.category_icon} \${lang === 'ar' ? 'ml-1' : 'mr-1'}" style="color: \${comp.category_color}"></i>\${lang === 'ar' ? comp.category_name_ar : comp.category_name_en}</span>
                  </div>
                  <div class="flex items-center gap-4 mt-3 pt-3 border-t">
                    <div class="flex items-center gap-2 flex-1">
                      <img src="https://ui-avatars.com/api/?name=\${comp.creator_name}&size=32" class="w-8 h-8 rounded-full">
                      <span class="text-sm font-medium truncate">\${comp.creator_name}</span>
                    </div>
                    <span class="text-gray-400">VS</span>
                    <div class="flex items-center gap-2 flex-1 justify-end">
                      <span class="text-sm font-medium truncate">\${comp.opponent_name || '?'}</span>
                      <img src="https://ui-avatars.com/api/?name=\${comp.opponent_name || '?'}&size=32" class="w-8 h-8 rounded-full">
                    </div>
                  </div>
                </div>
              </a>
            \`).join('');
          } else {
            container.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500"><i class="fas fa-video-slash text-4xl mb-4"></i><p>${lang === 'ar' ? 'لا توجد منافسات مباشرة حالياً' : 'No live competitions right now'}</p></div>';
          }
        } catch (err) {
          console.error(err);
        }
      }
      
      // Load upcoming competitions
      async function loadUpcomingCompetitions() {
        try {
          const res = await fetch('/api/competitions?status=pending&limit=8');
          const data = await res.json();
          const container = document.getElementById('upcomingCompetitions');
          
          if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(comp => \`
              <a href="/competition/\${comp.id}?lang=${lang}" class="card-hover bg-white rounded-xl p-4 shadow-lg">
                <div class="flex items-center gap-2 mb-3">
                  <span class="w-8 h-8 rounded-full flex items-center justify-center" style="background: \${comp.category_color}20">
                    <i class="\${comp.category_icon}" style="color: \${comp.category_color}"></i>
                  </span>
                  <span class="text-sm text-gray-500">\${lang === 'ar' ? comp.category_name_ar : comp.category_name_en}</span>
                </div>
                <h3 class="font-bold mb-2 line-clamp-2">\${comp.title}</h3>
                <div class="flex items-center gap-2 text-sm text-gray-500">
                  <img src="https://ui-avatars.com/api/?name=\${comp.creator_name}&size=24" class="w-6 h-6 rounded-full">
                  <span>\${comp.creator_name}</span>
                </div>
                <div class="mt-3 pt-3 border-t">
                  <span class="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded">${tr.status_pending}</span>
                </div>
              </a>
            \`).join('');
          } else {
            container.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500"><p>${lang === 'ar' ? 'لا توجد منافسات قادمة' : 'No upcoming competitions'}</p></div>';
          }
        } catch (err) {
          console.error(err);
        }
      }
      
      loadLiveCompetitions();
      loadUpcomingCompetitions();
    </script>
  `
  
  return c.html(generateHTML(content, lang, tr.home))
})

// Explore page
app.get('/explore', (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  const category = c.req.query('category')
  const status = c.req.query('status')
  
  const content = `
    ${getNavigation(lang)}
    
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex flex-col md:flex-row gap-8">
        <!-- Sidebar Filters -->
        <aside class="w-full md:w-64 shrink-0">
          <div class="bg-white rounded-xl p-6 shadow-lg sticky top-20">
            <h3 class="font-bold text-lg mb-4">${tr.filter}</h3>
            
            <!-- Categories -->
            <div class="mb-6">
              <h4 class="font-medium mb-3 text-gray-700">${tr.categories}</h4>
              <div class="space-y-2">
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="category" value="" checked class="text-primary" onchange="applyFilters()">
                  <span>${tr.all}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="category" value="1" ${category === '1' ? 'checked' : ''} class="text-primary" onchange="applyFilters()">
                  <i class="fas fa-comments text-dialogue"></i>
                  <span>${tr.dialogue}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="category" value="2" ${category === '2' ? 'checked' : ''} class="text-primary" onchange="applyFilters()">
                  <i class="fas fa-flask text-science"></i>
                  <span>${tr.science}</span>
                </label>
                <label class="flex items-center gap-2 cursor-pointer">
                  <input type="radio" name="category" value="3" ${category === '3' ? 'checked' : ''} class="text-primary" onchange="applyFilters()">
                  <i class="fas fa-star text-talents"></i>
                  <span>${tr.talents}</span>
                </label>
              </div>
            </div>
            
            <!-- Status -->
            <div class="mb-6">
              <h4 class="font-medium mb-3 text-gray-700">${tr.filter_by_status}</h4>
              <select id="statusFilter" class="w-full border rounded-lg p-2" onchange="applyFilters()">
                <option value="">${tr.all}</option>
                <option value="live" ${status === 'live' ? 'selected' : ''}>${tr.status_live}</option>
                <option value="pending" ${status === 'pending' ? 'selected' : ''}>${tr.status_pending}</option>
                <option value="completed" ${status === 'completed' ? 'selected' : ''}>${tr.status_completed}</option>
              </select>
            </div>
            
            <!-- Language -->
            <div class="mb-6">
              <h4 class="font-medium mb-3 text-gray-700">${tr.filter_by_language}</h4>
              <select id="languageFilter" class="w-full border rounded-lg p-2" onchange="applyFilters()">
                <option value="">${tr.all}</option>
                <option value="ar">${lang === 'ar' ? 'العربية' : 'Arabic'}</option>
                <option value="en">${lang === 'ar' ? 'الإنجليزية' : 'English'}</option>
              </select>
            </div>
            
            <!-- Country -->
            <div class="mb-6">
              <h4 class="font-medium mb-3 text-gray-700">${tr.filter_by_country}</h4>
              <select id="countryFilter" class="w-full border rounded-lg p-2" onchange="applyFilters()">
                <option value="">${tr.all}</option>
              </select>
            </div>
            
            <button onclick="resetFilters()" class="w-full py-2 border rounded-lg hover:bg-gray-50 transition">
              <i class="fas fa-redo ${lang === 'ar' ? 'ml-2' : 'mr-2'}"></i>${lang === 'ar' ? 'إعادة تعيين' : 'Reset'}
            </button>
          </div>
        </aside>
        
        <!-- Main Content -->
        <main class="flex-1">
          <div class="flex justify-between items-center mb-6">
            <h1 class="text-2xl font-bold">${tr.explore}</h1>
            <a href="/create?lang=${lang}" class="gradient-bg text-white px-6 py-2 rounded-full font-medium hover:opacity-90 transition">
              <i class="fas fa-plus ${lang === 'ar' ? 'ml-2' : 'mr-2'}"></i>${tr.create_competition}
            </a>
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="competitionsGrid">
            <div class="col-span-full text-center py-12 text-gray-500">
              <i class="fas fa-spinner fa-spin text-3xl mb-4"></i>
              <p>${lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
            </div>
          </div>
          
          <div class="text-center mt-8">
            <button onclick="loadMore()" id="loadMoreBtn" class="px-8 py-3 border-2 border-primary text-primary rounded-full font-medium hover:bg-primary hover:text-white transition hidden">
              ${tr.load_more}
            </button>
          </div>
        </main>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      const lang = '${lang}';
      let offset = 0;
      const limit = 12;
      
      async function loadCountries() {
        const res = await fetch('/api/countries');
        const data = await res.json();
        const select = document.getElementById('countryFilter');
        if (data.success) {
          data.data.forEach(country => {
            const option = document.createElement('option');
            option.value = country.code;
            option.textContent = lang === 'ar' ? country.name_ar : country.name_en;
            select.appendChild(option);
          });
        }
      }
      
      async function loadCompetitions(append = false) {
        const category = document.querySelector('input[name="category"]:checked')?.value || '';
        const status = document.getElementById('statusFilter').value;
        const language = document.getElementById('languageFilter').value;
        const country = document.getElementById('countryFilter').value;
        
        const params = new URLSearchParams({
          limit: limit.toString(),
          offset: offset.toString()
        });
        if (category) params.append('category', category);
        if (status) params.append('status', status);
        if (language) params.append('language', language);
        if (country) params.append('country', country);
        
        try {
          const res = await fetch('/api/competitions?' + params);
          const data = await res.json();
          const container = document.getElementById('competitionsGrid');
          
          if (data.success) {
            const html = data.data.map(comp => \`
              <a href="/competition/\${comp.id}?lang=${lang}" class="card-hover bg-white rounded-xl overflow-hidden shadow-lg">
                <div class="relative aspect-video bg-gray-900">
                  <div class="absolute inset-0 flex items-center justify-center">
                    <i class="fas fa-play-circle text-white/50 text-5xl"></i>
                  </div>
                  \${comp.status === 'live' ? \`
                    <div class="absolute top-3 \${lang === 'ar' ? 'right-3' : 'left-3'}">
                      <span class="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                        <span class="w-2 h-2 bg-white rounded-full live-pulse"></span>
                        ${tr.live}
                      </span>
                    </div>
                  \` : ''}
                </div>
                <div class="p-4">
                  <div class="flex items-center gap-2 mb-2">
                    <span class="w-6 h-6 rounded-full flex items-center justify-center" style="background: \${comp.category_color}20">
                      <i class="\${comp.category_icon} text-xs" style="color: \${comp.category_color}"></i>
                    </span>
                    <span class="text-sm text-gray-500">\${lang === 'ar' ? comp.category_name_ar : comp.category_name_en}</span>
                  </div>
                  <h3 class="font-bold mb-2 line-clamp-2">\${comp.title}</h3>
                  <div class="flex items-center gap-4 mt-3 pt-3 border-t text-sm">
                    <div class="flex items-center gap-2">
                      <img src="https://ui-avatars.com/api/?name=\${comp.creator_name}&size=24" class="w-6 h-6 rounded-full">
                      <span class="truncate">\${comp.creator_name}</span>
                    </div>
                    <span class="text-gray-400">VS</span>
                    <div class="flex items-center gap-2">
                      <span class="truncate">\${comp.opponent_name || '?'}</span>
                    </div>
                  </div>
                </div>
              </a>
            \`).join('');
            
            if (append) {
              container.innerHTML += html;
            } else {
              container.innerHTML = html || '<div class="col-span-full text-center py-12 text-gray-500"><p>${lang === 'ar' ? 'لا توجد منافسات' : 'No competitions found'}</p></div>';
            }
            
            document.getElementById('loadMoreBtn').classList.toggle('hidden', data.data.length < limit);
          }
        } catch (err) {
          console.error(err);
        }
      }
      
      function applyFilters() {
        offset = 0;
        loadCompetitions();
      }
      
      function loadMore() {
        offset += limit;
        loadCompetitions(true);
      }
      
      function resetFilters() {
        document.querySelector('input[name="category"][value=""]').checked = true;
        document.getElementById('statusFilter').value = '';
        document.getElementById('languageFilter').value = '';
        document.getElementById('countryFilter').value = '';
        applyFilters();
      }
      
      loadCountries();
      loadCompetitions();
    </script>
  `
  
  return c.html(generateHTML(content, lang, tr.explore))
})

// Login page
app.get('/login', (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  
  const content = `
    ${getNavigation(lang)}
    
    <div class="min-h-[80vh] flex items-center justify-center px-4">
      <div class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold gradient-bg bg-clip-text text-transparent">${tr.login}</h1>
          <p class="text-gray-500 mt-2">${lang === 'ar' ? 'سجل دخولك للمنافسة' : 'Login to compete'}</p>
        </div>
        
        <form id="loginForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">${tr.email}</label>
            <input type="email" name="email" required 
                   class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary"
                   placeholder="${lang === 'ar' ? 'example@email.com' : 'example@email.com'}">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">${tr.password}</label>
            <input type="password" name="password" required 
                   class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary"
                   placeholder="••••••••">
          </div>
          
          <div id="errorMsg" class="text-red-500 text-sm hidden"></div>
          
          <button type="submit" class="w-full gradient-bg text-white py-3 rounded-lg font-bold hover:opacity-90 transition">
            ${tr.login}
          </button>
        </form>
        
        <div class="mt-6 text-center">
          <p class="text-gray-500">
            ${lang === 'ar' ? 'ليس لديك حساب؟' : "Don't have an account?"}
            <a href="/register?lang=${lang}" class="text-primary font-medium hover:underline">${tr.register}</a>
          </p>
        </div>
        
        <div class="mt-6 pt-6 border-t">
          <p class="text-center text-gray-500 text-sm mb-4">${lang === 'ar' ? 'أو سجل دخولك بـ' : 'Or login with'}</p>
          <div class="flex gap-4">
            <button class="flex-1 flex items-center justify-center gap-2 border rounded-lg py-3 hover:bg-gray-50 transition">
              <i class="fab fa-google text-red-500"></i>
              Google
            </button>
            <button class="flex-1 flex items-center justify-center gap-2 border rounded-lg py-3 hover:bg-gray-50 transition">
              <i class="fab fa-youtube text-red-600"></i>
              YouTube
            </button>
          </div>
        </div>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const errorMsg = document.getElementById('errorMsg');
        
        try {
          const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: form.email.value,
              password: form.password.value
            })
          });
          
          const data = await res.json();
          
          if (data.success) {
            localStorage.setItem('sessionId', data.data.sessionId);
            localStorage.setItem('user', JSON.stringify(data.data.user));
            window.location.href = '/?lang=${lang}';
          } else {
            errorMsg.textContent = data.error;
            errorMsg.classList.remove('hidden');
          }
        } catch (err) {
          errorMsg.textContent = '${lang === 'ar' ? 'حدث خطأ' : 'An error occurred'}';
          errorMsg.classList.remove('hidden');
        }
      });
    </script>
  `
  
  return c.html(generateHTML(content, lang, tr.login))
})

// Register page
app.get('/register', (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  
  const content = `
    ${getNavigation(lang)}
    
    <div class="min-h-[80vh] flex items-center justify-center px-4 py-8">
      <div class="bg-white rounded-2xl shadow-xl p-8 w-full max-w-md">
        <div class="text-center mb-8">
          <h1 class="text-3xl font-bold gradient-bg bg-clip-text text-transparent">${tr.register}</h1>
          <p class="text-gray-500 mt-2">${lang === 'ar' ? 'انضم إلى مجتمع المنافسين' : 'Join the competitors community'}</p>
        </div>
        
        <form id="registerForm" class="space-y-4">
          <div>
            <label class="block text-sm font-medium mb-2">${tr.display_name}</label>
            <input type="text" name="display_name" required 
                   class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary"
                   placeholder="${lang === 'ar' ? 'اسمك المعروض' : 'Your display name'}">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">${tr.username}</label>
            <input type="text" name="username" required pattern="[a-zA-Z0-9_]+"
                   class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary"
                   placeholder="username">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">${tr.email}</label>
            <input type="email" name="email" required 
                   class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary"
                   placeholder="example@email.com">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">${tr.password}</label>
            <input type="password" name="password" required minlength="8"
                   class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary"
                   placeholder="••••••••">
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2">${tr.country}</label>
              <select name="country" class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary" id="countrySelect">
                <option value="SA">${lang === 'ar' ? 'السعودية' : 'Saudi Arabia'}</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">${tr.language}</label>
              <select name="language" class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary">
                <option value="ar" ${lang === 'ar' ? 'selected' : ''}>العربية</option>
                <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
              </select>
            </div>
          </div>
          
          <div id="errorMsg" class="text-red-500 text-sm hidden"></div>
          
          <button type="submit" class="w-full gradient-bg text-white py-3 rounded-lg font-bold hover:opacity-90 transition">
            ${tr.register}
          </button>
        </form>
        
        <div class="mt-6 text-center">
          <p class="text-gray-500">
            ${lang === 'ar' ? 'لديك حساب بالفعل؟' : 'Already have an account?'}
            <a href="/login?lang=${lang}" class="text-primary font-medium hover:underline">${tr.login}</a>
          </p>
        </div>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      // Load countries
      fetch('/api/countries').then(r => r.json()).then(data => {
        if (data.success) {
          const select = document.getElementById('countrySelect');
          select.innerHTML = data.data.map(c => 
            \`<option value="\${c.code}">\${'${lang}' === 'ar' ? c.name_ar : c.name_en}</option>\`
          ).join('');
        }
      });
      
      document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const errorMsg = document.getElementById('errorMsg');
        
        try {
          const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              display_name: form.display_name.value,
              username: form.username.value,
              email: form.email.value,
              password: form.password.value,
              country: form.country.value,
              language: form.language.value
            })
          });
          
          const data = await res.json();
          
          if (data.success) {
            localStorage.setItem('sessionId', data.data.sessionId);
            window.location.href = '/login?lang=${lang}&registered=1';
          } else {
            errorMsg.textContent = data.error;
            errorMsg.classList.remove('hidden');
          }
        } catch (err) {
          errorMsg.textContent = '${lang === 'ar' ? 'حدث خطأ' : 'An error occurred'}';
          errorMsg.classList.remove('hidden');
        }
      });
    </script>
  `
  
  return c.html(generateHTML(content, lang, tr.register))
})

// Create competition page
app.get('/create', (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  
  const content = `
    ${getNavigation(lang)}
    
    <div class="max-w-3xl mx-auto px-4 py-8">
      <div class="bg-white rounded-2xl shadow-xl p-8">
        <h1 class="text-3xl font-bold mb-8">${tr.create_competition}</h1>
        
        <form id="createForm" class="space-y-6">
          <div>
            <label class="block text-sm font-medium mb-2">${tr.competition_title} *</label>
            <input type="text" name="title" required 
                   class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary"
                   placeholder="${lang === 'ar' ? 'عنوان المنافسة' : 'Competition title'}">
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">${tr.select_category} *</label>
            <select name="category_id" required class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary" id="categorySelect">
              <option value="">${lang === 'ar' ? 'اختر القسم' : 'Select category'}</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">${tr.select_subcategory}</label>
            <select name="subcategory_id" class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary" id="subcategorySelect">
              <option value="">${lang === 'ar' ? 'اختر القسم الفرعي' : 'Select subcategory'}</option>
            </select>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">${tr.competition_description}</label>
            <textarea name="description" rows="3"
                      class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary"
                      placeholder="${lang === 'ar' ? 'وصف المنافسة...' : 'Competition description...'}"></textarea>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">${tr.competition_rules} *</label>
            <textarea name="rules" rows="5" required
                      class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary"
                      placeholder="${lang === 'ar' ? 'قوانين المنافسة (مثال: مدة الحديث لكل طرف، قواعد الحوار، معايير الفوز...)' : 'Competition rules (e.g., speaking time per side, dialogue rules, winning criteria...)'}"></textarea>
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium mb-2">${tr.language}</label>
              <select name="language" class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary">
                <option value="ar" ${lang === 'ar' ? 'selected' : ''}>العربية</option>
                <option value="en" ${lang === 'en' ? 'selected' : ''}>English</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium mb-2">${tr.country}</label>
              <select name="country" class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary" id="countrySelect2">
              </select>
            </div>
          </div>
          
          <div>
            <label class="block text-sm font-medium mb-2">${tr.scheduled_time}</label>
            <input type="datetime-local" name="scheduled_at"
                   class="w-full border rounded-lg p-3 focus:ring-2 focus:ring-primary focus:border-primary">
          </div>
          
          <div id="errorMsg" class="text-red-500 text-sm hidden"></div>
          
          <div class="flex gap-4">
            <button type="submit" class="flex-1 gradient-bg text-white py-3 rounded-lg font-bold hover:opacity-90 transition">
              ${tr.create_competition}
            </button>
            <a href="/explore?lang=${lang}" class="px-6 py-3 border rounded-lg hover:bg-gray-50 transition">
              ${tr.cancel}
            </a>
          </div>
        </form>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      let categories = [];
      
      // Load categories
      fetch('/api/categories').then(r => r.json()).then(data => {
        if (data.success) {
          categories = data.data;
          const mainCats = categories.filter(c => !c.parent_id);
          document.getElementById('categorySelect').innerHTML = 
            '<option value="">${lang === 'ar' ? 'اختر القسم' : 'Select category'}</option>' +
            mainCats.map(c => \`<option value="\${c.id}">\${'${lang}' === 'ar' ? c.name_ar : c.name_en}</option>\`).join('');
        }
      });
      
      // Load subcategories on category change
      document.getElementById('categorySelect').addEventListener('change', (e) => {
        const parentId = parseInt(e.target.value);
        const subCats = categories.filter(c => c.parent_id === parentId);
        document.getElementById('subcategorySelect').innerHTML = 
          '<option value="">${lang === 'ar' ? 'اختر القسم الفرعي' : 'Select subcategory'}</option>' +
          subCats.map(c => \`<option value="\${c.id}">\${'${lang}' === 'ar' ? c.name_ar : c.name_en}</option>\`).join('');
      });
      
      // Load countries
      fetch('/api/countries').then(r => r.json()).then(data => {
        if (data.success) {
          document.getElementById('countrySelect2').innerHTML = 
            data.data.map(c => \`<option value="\${c.code}">\${'${lang}' === 'ar' ? c.name_ar : c.name_en}</option>\`).join('');
        }
      });
      
      document.getElementById('createForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const errorMsg = document.getElementById('errorMsg');
        
        const user = JSON.parse(localStorage.getItem('user') || '{}');
        if (!user.id) {
          window.location.href = '/login?lang=${lang}';
          return;
        }
        
        try {
          const res = await fetch('/api/competitions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: form.title.value,
              description: form.description.value,
              rules: form.rules.value,
              category_id: parseInt(form.category_id.value),
              subcategory_id: form.subcategory_id.value ? parseInt(form.subcategory_id.value) : null,
              creator_id: user.id,
              language: form.language.value,
              country: form.country.value,
              scheduled_at: form.scheduled_at.value || null
            })
          });
          
          const data = await res.json();
          
          if (data.success) {
            window.location.href = '/competition/' + data.data.id + '?lang=${lang}';
          } else {
            errorMsg.textContent = data.error;
            errorMsg.classList.remove('hidden');
          }
        } catch (err) {
          errorMsg.textContent = '${lang === 'ar' ? 'حدث خطأ' : 'An error occurred'}';
          errorMsg.classList.remove('hidden');
        }
      });
    </script>
  `
  
  return c.html(generateHTML(content, lang, tr.create_competition))
})

// Competition room page
app.get('/competition/:id', async (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  const id = c.req.param('id')
  
  const content = `
    ${getNavigation(lang)}
    
    <div class="max-w-7xl mx-auto px-4 py-6">
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Main Video Area -->
        <div class="lg:col-span-2">
          <div class="bg-black rounded-2xl overflow-hidden shadow-xl">
            <div class="aspect-video flex items-center justify-center" id="videoContainer">
              <div class="text-white text-center">
                <i class="fas fa-spinner fa-spin text-4xl mb-4"></i>
                <p>${lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
              </div>
            </div>
          </div>
          
          <!-- Competition Info -->
          <div class="bg-white rounded-2xl p-6 mt-6 shadow-lg" id="competitionInfo">
            <!-- Loaded dynamically -->
          </div>
          
          <!-- Competitors -->
          <div class="bg-white rounded-2xl p-6 mt-6 shadow-lg">
            <h3 class="font-bold text-lg mb-4">${lang === 'ar' ? 'المتنافسون' : 'Competitors'}</h3>
            <div class="grid grid-cols-2 gap-6" id="competitors">
              <!-- Loaded dynamically -->
            </div>
          </div>
        </div>
        
        <!-- Sidebar -->
        <div class="space-y-6">
          <!-- Rating Panel -->
          <div class="bg-white rounded-2xl p-6 shadow-lg" id="ratingPanel">
            <h3 class="font-bold text-lg mb-4">${tr.rate_competitor}</h3>
            <div id="ratingSection">
              <!-- Loaded dynamically -->
            </div>
          </div>
          
          <!-- Live Chat -->
          <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
            <div class="p-4 border-b flex justify-between items-center">
              <h3 class="font-bold">${tr.live_chat}</h3>
              <span class="text-sm text-gray-500" id="viewerCount">0 ${tr.viewers}</span>
            </div>
            <div class="h-96 overflow-y-auto p-4 space-y-3" id="chatMessages">
              <!-- Loaded dynamically -->
            </div>
            <div class="p-4 border-t">
              <form id="chatForm" class="flex gap-2">
                <input type="text" name="message" placeholder="${tr.add_comment}..." 
                       class="flex-1 border rounded-full px-4 py-2 focus:outline-none focus:ring-2 focus:ring-primary">
                <button type="submit" class="gradient-bg text-white px-4 py-2 rounded-full">
                  <i class="fas fa-paper-plane"></i>
                </button>
              </form>
              <p class="text-xs text-gray-400 mt-2">${tr.registered_only}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      const lang = '${lang}';
      const competitionId = '${id}';
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      
      async function loadCompetition() {
        try {
          const res = await fetch('/api/competitions/' + competitionId);
          const data = await res.json();
          
          if (!data.success) {
            document.getElementById('competitionInfo').innerHTML = '<p class="text-red-500">${lang === 'ar' ? 'المنافسة غير موجودة' : 'Competition not found'}</p>';
            return;
          }
          
          const comp = data.data;
          
          // Update video container
          if (comp.youtube_live_id && comp.status === 'live') {
            document.getElementById('videoContainer').innerHTML = \`
              <iframe width="100%" height="100%" 
                      src="https://www.youtube.com/embed/\${comp.youtube_live_id}?autoplay=1" 
                      frameborder="0" allowfullscreen></iframe>
            \`;
          } else if (comp.youtube_video_url) {
            const videoId = comp.youtube_video_url.split('v=')[1] || comp.youtube_video_url.split('/').pop();
            document.getElementById('videoContainer').innerHTML = \`
              <iframe width="100%" height="100%" 
                      src="https://www.youtube.com/embed/\${videoId}" 
                      frameborder="0" allowfullscreen></iframe>
            \`;
          } else {
            document.getElementById('videoContainer').innerHTML = \`
              <div class="text-white text-center">
                <i class="fas fa-video text-6xl mb-4 opacity-50"></i>
                <p>\${comp.status === 'pending' ? '${lang === 'ar' ? 'في انتظار المنافس' : 'Waiting for opponent'}' : '${lang === 'ar' ? 'البث غير متاح حالياً' : 'Stream not available'}'}</p>
              </div>
            \`;
          }
          
          // Update info
          document.getElementById('competitionInfo').innerHTML = \`
            <div class="flex items-center gap-2 mb-4">
              <span class="px-3 py-1 rounded-full text-sm font-medium \${
                comp.status === 'live' ? 'bg-red-100 text-red-600' :
                comp.status === 'pending' ? 'bg-yellow-100 text-yellow-600' :
                comp.status === 'completed' ? 'bg-green-100 text-green-600' :
                'bg-gray-100 text-gray-600'
              }">
                \${comp.status === 'live' ? '${tr.status_live}' :
                   comp.status === 'pending' ? '${tr.status_pending}' :
                   comp.status === 'completed' ? '${tr.status_completed}' : comp.status}
              </span>
              <span class="text-sm text-gray-500">
                <i class="\${comp.category_icon} \${lang === 'ar' ? 'ml-1' : 'mr-1'}"></i>
                \${lang === 'ar' ? comp.category_name_ar : comp.category_name_en}
              </span>
            </div>
            <h1 class="text-2xl font-bold mb-4">\${comp.title}</h1>
            <p class="text-gray-600 mb-4">\${comp.description || ''}</p>
            <div class="bg-gray-50 rounded-lg p-4">
              <h4 class="font-medium mb-2">${tr.competition_rules}</h4>
              <p class="text-gray-600 whitespace-pre-wrap">\${comp.rules}</p>
            </div>
            <div class="flex items-center gap-6 mt-4 text-sm text-gray-500">
              <span><i class="fas fa-eye \${lang === 'ar' ? 'ml-1' : 'mr-1'}"></i>\${comp.total_views} ${tr.viewers}</span>
              <span><i class="fas fa-comments \${lang === 'ar' ? 'ml-1' : 'mr-1'}"></i>\${comp.total_comments} ${tr.comments}</span>
            </div>
          \`;
          
          // Update competitors
          document.getElementById('competitors').innerHTML = \`
            <div class="text-center p-4 bg-gray-50 rounded-xl">
              <img src="https://ui-avatars.com/api/?name=\${comp.creator_name}&size=80" class="w-20 h-20 rounded-full mx-auto mb-3">
              <h4 class="font-bold">\${comp.creator_name}</h4>
              <a href="/profile/\${comp.creator_username}?lang=${lang}" class="text-sm text-gray-500">@\${comp.creator_username}</a>
              <div class="mt-3">
                <div class="flex items-center justify-center gap-1 text-yellow-500">
                  \${[1,2,3,4,5].map(i => \`<i class="fas fa-star \${i <= Math.round(comp.creator_rating || 0) ? '' : 'opacity-30'}"></i>\`).join('')}
                </div>
                <p class="text-sm text-gray-500 mt-1">\${(comp.creator_rating || 0).toFixed(1)}</p>
              </div>
            </div>
            <div class="text-center p-4 bg-gray-50 rounded-xl">
              \${comp.opponent_id ? \`
                <img src="https://ui-avatars.com/api/?name=\${comp.opponent_name}&size=80" class="w-20 h-20 rounded-full mx-auto mb-3">
                <h4 class="font-bold">\${comp.opponent_name}</h4>
                <a href="/profile/\${comp.opponent_username}?lang=${lang}" class="text-sm text-gray-500">@\${comp.opponent_username}</a>
                <div class="mt-3">
                  <div class="flex items-center justify-center gap-1 text-yellow-500">
                    \${[1,2,3,4,5].map(i => \`<i class="fas fa-star \${i <= Math.round(comp.opponent_rating || 0) ? '' : 'opacity-30'}"></i>\`).join('')}
                  </div>
                  <p class="text-sm text-gray-500 mt-1">\${(comp.opponent_rating || 0).toFixed(1)}</p>
                </div>
              \` : \`
                <div class="w-20 h-20 rounded-full mx-auto mb-3 bg-gray-200 flex items-center justify-center">
                  <i class="fas fa-question text-3xl text-gray-400"></i>
                </div>
                <h4 class="font-bold text-gray-400">${lang === 'ar' ? 'في انتظار منافس' : 'Waiting for opponent'}</h4>
                \${user.id && user.id !== comp.creator_id ? \`
                  <button onclick="requestJoin()" class="mt-3 gradient-bg text-white px-4 py-2 rounded-full text-sm">
                    ${tr.join_competition}
                  </button>
                \` : ''}
              \`}
            </div>
          \`;
          
          // Update rating section
          if (user.id && comp.status === 'live') {
            document.getElementById('ratingSection').innerHTML = \`
              <div class="space-y-4">
                <div>
                  <p class="text-sm text-gray-500 mb-2">\${comp.creator_name}</p>
                  <div class="flex gap-2">
                    \${[1,2,3,4,5].map(i => \`
                      <button onclick="rate(\${comp.creator_id}, \${i})" class="text-2xl text-gray-300 hover:text-yellow-500 transition rating-star" data-competitor="\${comp.creator_id}" data-rating="\${i}">
                        <i class="fas fa-star"></i>
                      </button>
                    \`).join('')}
                  </div>
                </div>
                \${comp.opponent_id ? \`
                  <div>
                    <p class="text-sm text-gray-500 mb-2">\${comp.opponent_name}</p>
                    <div class="flex gap-2">
                      \${[1,2,3,4,5].map(i => \`
                        <button onclick="rate(\${comp.opponent_id}, \${i})" class="text-2xl text-gray-300 hover:text-yellow-500 transition rating-star" data-competitor="\${comp.opponent_id}" data-rating="\${i}">
                          <i class="fas fa-star"></i>
                        </button>
                      \`).join('')}
                    </div>
                  </div>
                \` : ''}
              </div>
            \`;
          } else {
            document.getElementById('ratingSection').innerHTML = \`
              <p class="text-gray-500 text-sm">\${comp.status === 'live' ? '${tr.login_required}' : '${lang === 'ar' ? 'التقييم متاح أثناء البث المباشر فقط' : 'Rating is only available during live broadcast'}'}</p>
            \`;
          }
          
          // Load comments
          if (comp.comments && comp.comments.length > 0) {
            document.getElementById('chatMessages').innerHTML = comp.comments.map(c => \`
              <div class="flex gap-2">
                <img src="\${c.avatar_url || 'https://ui-avatars.com/api/?name=' + c.display_name}" class="w-8 h-8 rounded-full">
                <div>
                  <p class="text-sm"><span class="font-medium">\${c.display_name}</span> <span class="text-gray-400 text-xs">@\${c.username}</span></p>
                  <p class="text-sm">\${c.content}</p>
                </div>
              </div>
            \`).join('');
          } else {
            document.getElementById('chatMessages').innerHTML = '<p class="text-center text-gray-400">${lang === 'ar' ? 'لا توجد تعليقات بعد' : 'No comments yet'}</p>';
          }
          
          document.getElementById('viewerCount').textContent = comp.total_views + ' ${tr.viewers}';
          
        } catch (err) {
          console.error(err);
        }
      }
      
      async function rate(competitorId, rating) {
        if (!user.id) {
          window.location.href = '/login?lang=${lang}';
          return;
        }
        
        try {
          await fetch('/api/competitions/' + competitionId + '/rate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: user.id,
              competitor_id: competitorId,
              rating: rating
            })
          });
          
          // Update UI
          document.querySelectorAll(\`.rating-star[data-competitor="\${competitorId}"]\`).forEach(btn => {
            const r = parseInt(btn.dataset.rating);
            btn.classList.toggle('text-yellow-500', r <= rating);
            btn.classList.toggle('text-gray-300', r > rating);
          });
        } catch (err) {
          console.error(err);
        }
      }
      
      async function requestJoin() {
        if (!user.id) {
          window.location.href = '/login?lang=${lang}';
          return;
        }
        
        try {
          await fetch('/api/competitions/' + competitionId + '/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requester_id: user.id
            })
          });
          alert('${lang === 'ar' ? 'تم إرسال طلبك بنجاح' : 'Request sent successfully'}');
        } catch (err) {
          console.error(err);
        }
      }
      
      document.getElementById('chatForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!user.id) {
          window.location.href = '/login?lang=${lang}';
          return;
        }
        
        const input = e.target.message;
        const content = input.value.trim();
        if (!content) return;
        
        try {
          await fetch('/api/competitions/' + competitionId + '/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: user.id,
              content: content,
              is_live: true
            })
          });
          
          input.value = '';
          loadCompetition(); // Reload to show new comment
        } catch (err) {
          console.error(err);
        }
      });
      
      loadCompetition();
      
      // Refresh every 30 seconds for live competitions
      setInterval(loadCompetition, 30000);
    </script>
  `
  
  return c.html(generateHTML(content, lang, tr.competition))
})

// Live page
app.get('/live', (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  
  const content = `
    ${getNavigation(lang)}
    
    <div class="max-w-7xl mx-auto px-4 py-8">
      <div class="flex items-center gap-4 mb-8">
        <span class="w-4 h-4 bg-red-500 rounded-full live-pulse"></span>
        <h1 class="text-3xl font-bold">${tr.live}</h1>
      </div>
      
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6" id="liveGrid">
        <div class="col-span-full text-center py-12 text-gray-500">
          <i class="fas fa-spinner fa-spin text-3xl mb-4"></i>
          <p>${lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
        </div>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      async function loadLive() {
        try {
          const res = await fetch('/api/competitions?status=live&limit=50');
          const data = await res.json();
          const container = document.getElementById('liveGrid');
          
          if (data.success && data.data.length > 0) {
            container.innerHTML = data.data.map(comp => \`
              <a href="/competition/\${comp.id}?lang=${lang}" class="card-hover bg-white rounded-xl overflow-hidden shadow-lg">
                <div class="relative aspect-video bg-gray-900">
                  <div class="absolute inset-0 flex items-center justify-center">
                    <i class="fas fa-play-circle text-white/50 text-5xl"></i>
                  </div>
                  <div class="absolute top-3 \${lang === 'ar' ? 'right-3' : 'left-3'}">
                    <span class="bg-red-500 text-white px-2 py-1 rounded text-xs font-bold flex items-center gap-1">
                      <span class="w-2 h-2 bg-white rounded-full live-pulse"></span>
                      ${tr.live}
                    </span>
                  </div>
                  <div class="absolute bottom-3 \${lang === 'ar' ? 'left-3' : 'right-3'} bg-black/60 text-white px-2 py-1 rounded text-xs">
                    <i class="fas fa-eye \${lang === 'ar' ? 'ml-1' : 'mr-1'}"></i>\${comp.total_views} ${tr.viewers}
                  </div>
                </div>
                <div class="p-4">
                  <h3 class="font-bold mb-2 line-clamp-2">\${comp.title}</h3>
                  <div class="flex items-center gap-4 mt-3 pt-3 border-t text-sm">
                    <div class="flex items-center gap-2 flex-1">
                      <img src="https://ui-avatars.com/api/?name=\${comp.creator_name}&size=24" class="w-6 h-6 rounded-full">
                      <span class="truncate">\${comp.creator_name}</span>
                    </div>
                    <span class="text-gray-400">VS</span>
                    <div class="flex items-center gap-2 flex-1 justify-end">
                      <span class="truncate">\${comp.opponent_name || '?'}</span>
                    </div>
                  </div>
                </div>
              </a>
            \`).join('');
          } else {
            container.innerHTML = \`
              <div class="col-span-full text-center py-16">
                <i class="fas fa-video-slash text-6xl text-gray-300 mb-4"></i>
                <h3 class="text-xl font-bold text-gray-600 mb-2">${lang === 'ar' ? 'لا توجد منافسات مباشرة حالياً' : 'No live competitions right now'}</h3>
                <p class="text-gray-500 mb-6">${lang === 'ar' ? 'تصفح المنافسات القادمة أو أنشئ منافستك' : 'Browse upcoming competitions or create your own'}</p>
                <a href="/explore?lang=${lang}" class="gradient-bg text-white px-6 py-3 rounded-full font-medium inline-block">
                  ${tr.explore}
                </a>
              </div>
            \`;
          }
        } catch (err) {
          console.error(err);
        }
      }
      
      loadLive();
      setInterval(loadLive, 30000);
    </script>
  `
  
  return c.html(generateHTML(content, lang, tr.live))
})

// Profile page
app.get('/profile/:username', (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  const username = c.req.param('username')
  
  const content = `
    ${getNavigation(lang)}
    
    <div class="max-w-5xl mx-auto px-4 py-8" id="profileContainer">
      <div class="text-center py-12 text-gray-500">
        <i class="fas fa-spinner fa-spin text-3xl mb-4"></i>
        <p>${lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      const lang = '${lang}';
      const username = '${username}';
      const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
      
      async function loadProfile() {
        try {
          const res = await fetch('/api/users/' + username);
          const data = await res.json();
          
          if (!data.success) {
            document.getElementById('profileContainer').innerHTML = \`
              <div class="text-center py-16">
                <i class="fas fa-user-slash text-6xl text-gray-300 mb-4"></i>
                <h3 class="text-xl font-bold text-gray-600">${lang === 'ar' ? 'المستخدم غير موجود' : 'User not found'}</h3>
              </div>
            \`;
            return;
          }
          
          const user = data.data;
          
          document.getElementById('profileContainer').innerHTML = \`
            <!-- Profile Header -->
            <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
              <div class="gradient-bg h-32"></div>
              <div class="px-6 pb-6 -mt-16">
                <div class="flex flex-col md:flex-row items-center md:items-end gap-4">
                  <img src="\${user.avatar_url || 'https://ui-avatars.com/api/?name=' + user.display_name + '&size=128'}" 
                       class="w-32 h-32 rounded-full border-4 border-white shadow-lg">
                  <div class="flex-1 text-center md:text-\${lang === 'ar' ? 'right' : 'left'}">
                    <div class="flex items-center justify-center md:justify-start gap-2">
                      <h1 class="text-2xl font-bold">\${user.display_name}</h1>
                      \${user.is_verified ? '<i class="fas fa-check-circle text-blue-500"></i>' : ''}
                    </div>
                    <p class="text-gray-500">@\${user.username}</p>
                    <p class="mt-2 text-gray-600">\${user.bio || ''}</p>
                  </div>
                  <div class="flex gap-3">
                    \${currentUser.id && currentUser.id !== user.id ? \`
                      <button onclick="toggleFollow(\${user.id})" class="gradient-bg text-white px-6 py-2 rounded-full font-medium" id="followBtn">
                        ${tr.follow}
                      </button>
                      <a href="/messages?to=\${user.username}&lang=${lang}" class="border px-6 py-2 rounded-full font-medium hover:bg-gray-50">
                        <i class="fas fa-envelope"></i>
                      </a>
                    \` : currentUser.id === user.id ? \`
                      <a href="/settings?lang=${lang}" class="border px-6 py-2 rounded-full font-medium hover:bg-gray-50">
                        <i class="fas fa-cog \${lang === 'ar' ? 'ml-2' : 'mr-2'}"></i>${tr.edit}
                      </a>
                    \` : ''}
                  </div>
                </div>
                
                <!-- Stats -->
                <div class="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-6 border-t">
                  <div class="text-center">
                    <p class="text-2xl font-bold">\${user.total_competitions}</p>
                    <p class="text-sm text-gray-500">${tr.total_competitions}</p>
                  </div>
                  <div class="text-center">
                    <p class="text-2xl font-bold">\${user.total_wins}</p>
                    <p class="text-sm text-gray-500">${tr.total_wins}</p>
                  </div>
                  <div class="text-center">
                    <p class="text-2xl font-bold">\${user.followers_count}</p>
                    <p class="text-sm text-gray-500">${tr.followers}</p>
                  </div>
                  <div class="text-center">
                    <p class="text-2xl font-bold">\${user.following_count}</p>
                    <p class="text-sm text-gray-500">${tr.following}</p>
                  </div>
                  <div class="text-center">
                    <div class="flex items-center justify-center gap-1 text-yellow-500">
                      <i class="fas fa-star"></i>
                      <span class="text-2xl font-bold text-gray-900">\${(user.average_rating || 0).toFixed(1)}</span>
                    </div>
                    <p class="text-sm text-gray-500">${tr.average_rating}</p>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- Competitions -->
            <div class="mt-8">
              <h2 class="text-xl font-bold mb-4">${tr.competitions}</h2>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                \${user.competitions && user.competitions.length > 0 ? user.competitions.map(comp => \`
                  <a href="/competition/\${comp.id}?lang=${lang}" class="card-hover bg-white rounded-xl p-4 shadow-lg flex gap-4">
                    <div class="w-16 h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <i class="\${comp.icon} text-2xl" style="color: \${comp.color || '#6366F1'}"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                      <h3 class="font-bold truncate">\${comp.title}</h3>
                      <p class="text-sm text-gray-500">\${lang === 'ar' ? comp.name_ar : comp.name_en}</p>
                      <span class="text-xs px-2 py-1 rounded \${
                        comp.status === 'completed' ? 'bg-green-100 text-green-600' :
                        comp.status === 'live' ? 'bg-red-100 text-red-600' :
                        'bg-yellow-100 text-yellow-600'
                      }">\${comp.status}</span>
                    </div>
                  </a>
                \`).join('') : \`
                  <div class="col-span-full text-center py-8 text-gray-500">
                    <p>${lang === 'ar' ? 'لا توجد منافسات بعد' : 'No competitions yet'}</p>
                  </div>
                \`}
              </div>
            </div>
          \`;
        } catch (err) {
          console.error(err);
        }
      }
      
      async function toggleFollow(userId) {
        if (!currentUser.id) {
          window.location.href = '/login?lang=${lang}';
          return;
        }
        
        try {
          await fetch('/api/users/' + userId + '/follow', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ follower_id: currentUser.id })
          });
          loadProfile();
        } catch (err) {
          console.error(err);
        }
      }
      
      loadProfile();
    </script>
  `
  
  return c.html(generateHTML(content, lang, tr.profile))
})

export default app
