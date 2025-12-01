import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { translations, countries, getDir, Language } from './i18n'
import jitsiRoutes from './routes/jitsi'

// Types
type Bindings = {
  DB: D1Database;
  RESEND_API_KEY: string;
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
  const cookieLang = c.req.header('Cookie')?.match(/lang=(\w+)/)?.[1]
  let lang: Language = 'ar'

  if (langParam === 'en' || langParam === 'ar') {
    lang = langParam
  } else if (cookieLang === 'en' || cookieLang === 'ar') {
    lang = cookieLang as Language
  }

  c.set('lang', lang)
  await next()
})

// Mount Jitsi routes
app.route('/api/jitsi', jitsiRoutes)

// ============ API Routes ============

// Get categories
app.get('/api/categories', async (c) => {
  const { DB } = c.env
  try {
    const categories = await DB.prepare(`
      SELECT c.*, p.name_ar as parent_name_ar, p.name_en as parent_name_en
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
    const result = await DB.prepare('SELECT * FROM countries ORDER BY name_en').all()
    return c.json({ success: true, data: result.results })
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
             cat.slug as category_slug,
             subcat.name_ar as subcategory_name_ar,
             subcat.name_en as subcategory_name_en,
             subcat.color as subcategory_color,
             u1.display_name as creator_name,
             u1.avatar_url as creator_avatar,
             u1.username as creator_username,
             u2.display_name as opponent_name,
             u2.avatar_url as opponent_avatar,
             u2.username as opponent_username
      FROM competitions c
      JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
      JOIN users u1 ON c.creator_id = u1.id
      LEFT JOIN users u2 ON c.opponent_id = u2.id
      WHERE 1=1
    `
    const params: any[] = []

    if (status !== 'all') {
      if (status === 'live') {
        query += ' AND c.status = ?'
        params.push('live')
      } else if (status === 'recorded') {
        query += ' AND c.status = ?'
        params.push('completed')
      } else if (status === 'pending') {
        query += ' AND c.status = ?'
        params.push('pending')
      }
    }

    if (category) {
      query += ' AND (c.category_id = ? OR c.subcategory_id = ? OR cat.slug = ?)'
      params.push(category, category, category)
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

    query += ' ORDER BY CASE WHEN c.status = "live" THEN 0 WHEN c.status = "pending" THEN 1 ELSE 2 END, c.total_views DESC, c.created_at DESC LIMIT ? OFFSET ?'
    params.push(limit, offset)

    const competitions = await DB.prepare(query).bind(...params).all()
    return c.json({ success: true, data: competitions.results })
  } catch (error) {
    console.error(error)
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
             cat.color as category_color,
             subcat.name_ar as subcategory_name_ar,
             subcat.name_en as subcategory_name_en,
             u1.display_name as creator_name,
             u1.avatar_url as creator_avatar,
             u1.username as creator_username,
             u1.bio as creator_bio,
             u2.display_name as opponent_name,
             u2.avatar_url as opponent_avatar,
             u2.username as opponent_username,
             u2.bio as opponent_bio
      FROM competitions c
      JOIN categories cat ON c.category_id = cat.id
      LEFT JOIN categories subcat ON c.subcategory_id = subcat.id
      JOIN users u1 ON c.creator_id = u1.id
      LEFT JOIN users u2 ON c.opponent_id = u2.id
      WHERE c.id = ?
    `).bind(id).first()

    if (!competition) {
      return c.json({ success: false, error: 'Competition not found' }, 404)
    }

    // Increment views
    await DB.prepare('UPDATE competitions SET total_views = total_views + 1 WHERE id = ?').bind(id).run()

    // Get comments
    const comments = await DB.prepare(`
      SELECT cm.*, u.display_name, u.avatar_url, u.username
      FROM comments cm
      JOIN users u ON cm.user_id = u.id
      WHERE cm.competition_id = ?
      ORDER BY cm.created_at DESC
      LIMIT 100
    `).bind(id).all()

    // Get ratings summary
    const ratings = await DB.prepare(`
      SELECT competitor_id, AVG(rating) as avg_rating, COUNT(*) as count
      FROM ratings
      WHERE competition_id = ?
      GROUP BY competitor_id
    `).bind(id).all()

    // Get join requests for this competition
    const requests = await DB.prepare(`
      SELECT cr.*, u.display_name, u.avatar_url, u.username
      FROM competition_requests cr
      JOIN users u ON cr.requester_id = u.id
      WHERE cr.competition_id = ?
      ORDER BY cr.created_at DESC
    `).bind(id).all()

    return c.json({
      success: true,
      data: {
        ...competition,
        comments: comments.results,
        ratings: ratings.results,
        requests: requests.results
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

// Request to join competition
app.post('/api/competitions/:id/request', async (c) => {
  const { DB } = c.env
  const competitionId = c.req.param('id')

  try {
    const body = await c.req.json()
    const { requester_id, message } = body

    if (!requester_id) {
      return c.json({ success: false, error: 'Requester ID required' }, 400)
    }

    // Check if already requested
    const existing = await DB.prepare(`
      SELECT id FROM competition_requests 
      WHERE competition_id = ? AND requester_id = ? AND status = 'pending'
    `).bind(competitionId, requester_id).first()

    if (existing) {
      return c.json({ success: false, error: 'Already requested' }, 400)
    }

    const result = await DB.prepare(`
      INSERT INTO competition_requests (competition_id, requester_id, message)
      VALUES (?, ?, ?)
    `).bind(competitionId, requester_id, message || null).run()

    // Create notification for competition creator
    const comp = await DB.prepare('SELECT creator_id, title FROM competitions WHERE id = ?').bind(competitionId).first() as any
    if (comp) {
      await DB.prepare(`
        INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
        VALUES (?, 'request', 'طلب انضمام جديد', ?, 'competition', ?)
      `).bind(comp.creator_id, `طلب انضمام للمنافسة: ${comp.title}`, competitionId).run()
    }

    return c.json({ success: true, data: { id: result.meta.last_row_id } })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to send request' }, 500)
  }
})

// Cancel join request
app.delete('/api/competitions/:id/request', async (c) => {
  const { DB } = c.env
  const competitionId = c.req.param('id')

  try {
    const body = await c.req.json()
    const { requester_id } = body

    await DB.prepare(`
      DELETE FROM competition_requests 
      WHERE competition_id = ? AND requester_id = ? AND status = 'pending'
    `).bind(competitionId, requester_id).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to cancel request' }, 500)
  }
})

// Accept join request
app.post('/api/competitions/:id/accept-request', async (c) => {
  const { DB } = c.env
  const competitionId = c.req.param('id')

  try {
    const body = await c.req.json()
    const { request_id, requester_id } = body

    // Update request status
    await DB.prepare(`
      UPDATE competition_requests SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(request_id).run()

    // Set opponent
    await DB.prepare(`
      UPDATE competitions SET opponent_id = ?, status = 'accepted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(requester_id, competitionId).run()

    // Decline other requests
    await DB.prepare(`
      UPDATE competition_requests SET status = 'declined', responded_at = CURRENT_TIMESTAMP
      WHERE competition_id = ? AND id != ? AND status = 'pending'
    `).bind(competitionId, request_id).run()

    // Notify accepted user
    await DB.prepare(`
      INSERT INTO notifications (user_id, type, title, message, reference_type, reference_id)
      VALUES (?, 'accepted', 'تم قبول طلبك', 'تم قبول طلبك للانضمام للمنافسة', 'competition', ?)
    `).bind(requester_id, competitionId).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to accept request' }, 500)
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
    const { youtube_video_url } = body

    await DB.prepare(`
      UPDATE competitions 
      SET status = 'completed', ended_at = CURRENT_TIMESTAMP, youtube_video_url = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(youtube_video_url, competitionId).run()

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

    await DB.prepare('UPDATE competitions SET total_comments = total_comments + 1 WHERE id = ?').bind(competitionId).run()

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

// OAuth Login simulation
app.post('/api/auth/oauth', async (c) => {
  const { DB } = c.env

  try {
    const body = await c.req.json()
    const { provider, email, name, avatar } = body

    if (!provider || !email) {
      return c.json({ success: false, error: 'Missing provider or email' }, 400)
    }

    // Check if user exists
    let user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()

    if (!user) {
      // Create new user
      const username = email.split('@')[0] + '_' + Math.random().toString(36).substring(7)
      const result = await DB.prepare(`
        INSERT INTO users (email, username, password_hash, display_name, avatar_url)
        VALUES (?, ?, ?, ?, ?)
      `).bind(email, username, 'oauth_' + provider, name || username, avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`).run()

      user = await DB.prepare('SELECT * FROM users WHERE id = ?').bind(result.meta.last_row_id).first()
    }

    // Create session
    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()

    await DB.prepare(`
      INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)
    `).bind(sessionId, (user as any).id, expiresAt).run()

    return c.json({
      success: true,
      data: {
        user: {
          id: (user as any).id,
          email: (user as any).email,
          username: (user as any).username,
          display_name: (user as any).display_name,
          avatar_url: (user as any).avatar_url,
          country: (user as any).country,
          language: (user as any).language
        },
        sessionId
      }
    })
  } catch (error) {
    console.error(error)
    return c.json({ success: false, error: 'Failed to authenticate' }, 500)
  }
})

// Validate session
app.get('/api/auth/session', async (c) => {
  const { DB } = c.env
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')

  if (!sessionId) {
    return c.json({ success: false, user: null })
  }

  try {
    const session = await DB.prepare(`
      SELECT s.*, u.id as user_id, u.email, u.username, u.display_name, u.avatar_url, u.country, u.language, u.is_admin
      FROM sessions s
      JOIN users u ON s.user_id = u.id
      WHERE s.id = ? AND s.expires_at > datetime('now')
    `).bind(sessionId).first()

    if (!session) {
      return c.json({ success: false, user: null })
    }

    return c.json({
      success: true,
      user: {
        id: (session as any).user_id,
        email: (session as any).email,
        username: (session as any).username,
        display_name: (session as any).display_name,
        avatar_url: (session as any).avatar_url,
        country: (session as any).country,
        language: (session as any).language,
        is_admin: (session as any).is_admin
      }
    })
  } catch (error) {
    return c.json({ success: false, user: null })
  }
})

// Logout
app.post('/api/auth/logout', async (c) => {
  const { DB } = c.env
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')

  if (sessionId) {
    try {
      await DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
    } catch (error) { }
  }

  return c.json({ success: true })
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

    const followers = await DB.prepare('SELECT COUNT(*) as count FROM follows WHERE following_id = ?').bind((user as any).id).first()
    const following = await DB.prepare('SELECT COUNT(*) as count FROM follows WHERE follower_id = ?').bind((user as any).id).first()

    const competitions = await DB.prepare(`
      SELECT c.*, cat.name_ar, cat.name_en, cat.icon, cat.color
      FROM competitions c
      JOIN categories cat ON c.category_id = cat.id
      WHERE c.creator_id = ? OR c.opponent_id = ?
      ORDER BY c.created_at DESC
      LIMIT 10
    `).bind((user as any).id, (user as any).id).all()

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

// Update user preferences
app.put('/api/users/preferences', async (c) => {
  const { DB } = c.env
  const sessionId = c.req.header('Authorization')?.replace('Bearer ', '')

  if (!sessionId) {
    return c.json({ success: false, error: 'Unauthorized' }, 401)
  }

  try {
    // Verify session
    const session = await DB.prepare('SELECT user_id FROM sessions WHERE id = ? AND expires_at > datetime("now")').bind(sessionId).first()

    if (!session) {
      return c.json({ success: false, error: 'Unauthorized' }, 401)
    }

    const body = await c.req.json()
    const { country, language } = body

    if (!country || !language) {
      return c.json({ success: false, error: 'Missing required fields' }, 400)
    }

    // Update user
    await DB.prepare('UPDATE users SET country = ?, language = ? WHERE id = ?')
      .bind(country, language, (session as any).user_id)
      .run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to update preferences' }, 500)
  }
})

// ============================================
// AUTH ENDPOINTS
// ============================================

// Helper function to send verification email
async function sendVerificationEmail(email: string, token: string, name: string, lang: string, resendApiKey: string) {
  const verifyUrl = `https://project-8e7c178d.pages.dev/verify?token=${token}&lang=${lang}`

  const subject = lang === 'ar' ? 'تفعيل حسابك في ديولي' : 'Activate your Dueli account'
  const htmlContent = lang === 'ar' ? `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">ديولي</h1>
      </div>
      <h2 style="color: #1f2937;">مرحباً ${name}!</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        شكراً لتسجيلك في منصة ديولي. يرجى الضغط على الزر أدناه لتفعيل حسابك:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background: linear-gradient(135deg, #7c3aed 0%, #f59e0b 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
          تفعيل الحساب
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        أو انسخ هذا الرابط:
        <br>
        <a href="${verifyUrl}" style="color: #7c3aed;">${verifyUrl}</a>
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 40px">
        إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذه الرسالة.
      </p>
    </div>
  ` : `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="color: #7c3aed; margin: 0;">Dueli</h1>
      </div>
      <h2 style="color: #1f2937;">Welcome ${name}!</h2>
      <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
        Thank you for signing up for Dueli. Please click the button below to activate your account:
      </p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${verifyUrl}" style="background: linear-gradient(135deg, #7c3aed 0%, #f59e0b 100%); color: white; padding: 15px 40px; text-decoration: none; border-radius: 50px; font-weight: bold; display: inline-block;">
          Activate Account
        </a>
      </div>
      <p style="color: #6b7280; font-size: 14px;">
        Or copy this link:
        <br>
        <a href="${verifyUrl}" style="color: #7c3aed;">${verifyUrl}</a>
      </p>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 40px;">
        If you didn't create an account, you can ignore this message.
      </p>
    </div>
  `

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${resendApiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: 'Dueli <onboarding@resend.dev>',
      to: [email],
      subject,
      html: htmlContent
    })
  })

  if (!response.ok) {
    throw new Error('Failed to send verification email')
  }

  return await response.json()
}

// Helper to hash password
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Register new user
app.post('/api/auth/register', async (c) => {
  const { DB, RESEND_API_KEY } = c.env
  const lang = c.req.query('lang') || 'ar'

  try {
    const body = await c.req.json()
    const { name, email, password, country, language } = body

    if (!name || !email || !password) {
      return c.json({ success: false, error: lang === 'ar' ? 'جميع الحقول مطلوبة' : 'All fields are required' }, 400)
    }

    // Check if email already exists
    const existingUser = await DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first()
    if (existingUser) {
      return c.json({ success: false, error: lang === 'ar' ? 'البريد الإلكتروني مستخدم بالفعل' : 'Email already exists' }, 400)
    }

    // Hash password
    const passwordHash = await hashPassword(password)

    // Generate verification token
    const verificationToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours

    // Generate username from email (before @)
    const username = email.split('@')[0].toLowerCase().replace(/[^a-z0-9]/g, '')

    // Use provided country/language or defaults
    const userCountry = country || 'SA'
    const userLanguage = language || 'ar'

    // Create user
    const result = await DB.prepare(`
      INSERT INTO users (username, email, password_hash, display_name, country, language, verification_token, verification_expires, email_verified, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'))
    `).bind(username, email, passwordHash, name, userCountry, userLanguage, verificationToken, expiresAt).run()

    // Send verification email
    await sendVerificationEmail(email, verificationToken, name, lang, RESEND_API_KEY)

    return c.json({
      success: true,
      message: lang === 'ar' ? 'تم التسجيل بنجاح! يرجى التحقق من بريدك الإلكتروني.' : 'Registration successful! Please check your email.'
    })
  } catch (error) {
    console.error('Registration error:', error)
    return c.json({ success: false, error: lang === 'ar' ? 'حدث خطأ أثناء التسجيل' : 'Registration failed' }, 500)
  }
})

// Verify email
app.get('/api/auth/verify', async (c) => {
  const { DB } = c.env
  const token = c.req.query('token')
  const lang = c.req.query('lang') || 'ar'

  if (!token) {
    return c.json({ success: false, error: 'Invalid token' }, 400)
  }

  try {
    // Find user with valid token
    const user = await DB.prepare(`
      SELECT id, email FROM users 
      WHERE verification_token = ? 
      AND verification_expires > datetime('now')
      AND email_verified = 0
    `).bind(token).first()

    if (!user) {
      return c.json({ success: false, error: lang === 'ar' ? 'رابط التفعيل غير صالح أو منتهي' : 'Invalid or expired verification link' }, 400)
    }

    // Update user
    await DB.prepare(`
      UPDATE users 
      SET email_verified = 1, verification_token = NULL, verification_expires = NULL
      WHERE id = ?
    `).bind((user as any).id).run()

    return c.json({
      success: true,
      message: lang === 'ar' ? 'تم تفعيل حسابك بنجاح!' : 'Account activated successfully!'
    })
  } catch (error) {
    console.error('Verification error:', error)
    return c.json({ success: false, error: 'Verification failed' }, 500)
  }
})

// Login
app.post('/api/auth/login', async (c) => {
  const { DB } = c.env
  const lang = c.req.query('lang') || 'ar'

  try {
    const body = await c.req.json()
    const { email, password } = body

    if (!email || !password) {
      return c.json({ success: false, error: lang === 'ar' ? 'البريد الإلكتروني وكلمة المرور مطلوبان' : 'Email and password are required' }, 400)
    }

    // Get user
    const user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
    if (!user) {
      return c.json({ success: false, error: lang === 'ar' ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة' : 'Invalid email or password' }, 401)
    }

    // Check if verified
    if (!(user as any).email_verified) {
      return c.json({ success: false, error: lang === 'ar' ? 'يرجى تفعيل حسابك أولاً' : 'Please verify your email first' }, 403)
    }

    // Verify password
    const passwordHash = await hashPassword(password)
    if ((user as any).password_hash !== passwordHash) {
      return c.json({ success: false, error: lang === 'ar' ? 'البريد الإلكتروني أو كلمة المرور غير صحيحة' : 'Invalid email or password' }, 401)
    }

    // Create session
    const sessionId = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days

    await DB.prepare(`
      INSERT INTO sessions (id, user_id, expires_at, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `).bind(sessionId, (user as any).id, expiresAt).run()

    return c.json({
      success: true,
      sessionId,
      user: {
        id: (user as any).id,
        name: (user as any).name,
        email: (user as any).email,
        avatar: (user as any).avatar
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    return c.json({ success: false, error: 'Login failed' }, 500)
  }
})

// Resend verification email
app.post('/api/auth/resend-verification', async (c) => {
  const { DB, RESEND_API_KEY } = c.env
  const lang = c.req.query('lang') || 'ar'

  try {
    const body = await c.req.json()
    const { email } = body

    if (!email) {
      return c.json({ success: false, error: lang === 'ar' ? 'البريد الإلكتروني مطلوب' : 'Email is required' }, 400)
    }

    // Get user
    const user = await DB.prepare('SELECT * FROM users WHERE email = ? AND email_verified = 0').bind(email).first()
    if (!user) {
      return c.json({ success: false, error: lang === 'ar' ? 'المستخدم غير موجود أو تم تفعيله بالفعل' : 'User not found or already verified' }, 404)
    }

    // Generate new token
    const verificationToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()

    await DB.prepare(`
      UPDATE users 
      SET verification_token = ?, verification_expires = ?
      WHERE id = ?
    `).bind(verificationToken, expiresAt, (user as any).id).run()

    // Send email
    await sendVerificationEmail(email, verificationToken, (user as any).name, lang, RESEND_API_KEY)

    return c.json({
      success: true,
      message: lang === 'ar' ? 'تم إرسال رابط التفعيل مرة أخرى' : 'Verification email resent'
    })
  } catch (error) {
    console.error('Resend verification error:', error)
    return c.json({ success: false, error: 'Failed to resend verification' }, 500)
  }
})

// ============================================
// PASSWORD RESET
// ============================================

// Request password reset
app.post('/api/auth/forgot-password', async (c) => {
  const { DB, RESEND_API_KEY } = c.env
  const lang = c.req.query('lang') || 'ar'

  try {
    const body = await c.req.json()
    const { email } = body

    if (!email) {
      return c.json({ success: false, error: lang === 'ar' ? 'البريد الإلكتروني مطلوب' : 'Email is required' }, 400)
    }

    // Get user
    const user = await DB.prepare('SELECT * FROM users WHERE email = ?').bind(email).first()
    if (!user) {
      // Don't reveal if email exists or not for security
      return c.json({
        success: true,
        message: lang === 'ar' ? 'إذا كان هذا البريد مسجلاً، ستصلك رسالة إعادة تعيين' : 'If this email is registered, you will receive a reset link'
      })
    }

    // Generate reset code (6 digits)
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString()
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes

    await DB.prepare(`
      UPDATE users 
      SET reset_token = ?, reset_expires = ?
      WHERE id = ?
    `).bind(resetCode, expiresAt, (user as any).id).run()

    // Send reset email
    const subject = lang === 'ar' ? 'إعادة تعيين كلمة المرور' : 'Reset Your Password'
    const htmlContent = lang === 'ar' ? `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">ديولي</h1>
        </div>
        <h2 style="color: #1f2937;">إعادة تعيين كلمة المرور</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          تلقينا طلباً لإعادة تعيين كلمة المرور. استخدم الرمز التالي:
        </p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 10px; text-align: center; margin: 30px 0;">
          <div style="font-size: 32px; font-weight: bold; color: #7c3aed; letter-spacing: 8px;">${resetCode}</div>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          هذا الرمز صالح لمدة 15 دقيقة فقط.
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 40px">
          إذا لم تطلب إعادة تعيين كلمة المرور، يمكنك تجاهل هذه الرسالة.
        </p>
      </div>
    ` : `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #7c3aed; margin: 0;">Dueli</h1>
        </div>
        <h2 style="color: #1f2937;">Reset Your Password</h2>
        <p style="color: #4b5563; font-size: 16px; line-height: 1.6;">
          We received a request to reset your password. Use this code:
        </p>
        <div style="background: #f3f4f6; padding: 20px; border-radius: 10px; text-align: center; margin: 30px 0;">
          <div style="font-size: 32px; font-weight: bold; color: #7c3aed; letter-spacing: 8px;">${resetCode}</div>
        </div>
        <p style="color: #6b7280; font-size: 14px;">
          This code is valid for 15 minutes only.
        </p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 40px;">
          If you didn't request a password reset, you can ignore this message.
        </p>
      </div>
    `

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Dueli <onboarding@resend.dev>',
        to: [email],
        subject,
        html: htmlContent
      })
    })

    return c.json({
      success: true,
      message: lang === 'ar' ? 'تم إرسال رمز إعادة التعيين إلى بريدك' : 'Reset code sent to your email'
    })
  } catch (error) {
    console.error('Forgot password error:', error)
    return c.json({ success: false, error: 'Failed to process request' }, 500)
  }
})

// Verify reset code
app.post('/api/auth/verify-reset-code', async (c) => {
  const { DB } = c.env
  const lang = c.req.query('lang') || 'ar'

  try {
    const body = await c.req.json()
    const { email, code } = body

    if (!email || !code) {
      return c.json({ success: false, error: lang === 'ar' ? 'البريد والرمز مطلوبان' : 'Email and code are required' }, 400)
    }

    // Find user with valid reset code
    const user = await DB.prepare(`
      SELECT id FROM users 
      WHERE email = ? 
      AND reset_token = ?
      AND reset_expires > datetime('now')
    `).bind(email, code).first()

    if (!user) {
      return c.json({ success: false, error: lang === 'ar' ? 'الرمز غير صحيح أو منتهي' : 'Invalid or expired code' }, 400)
    }

    return c.json({ success: true, message: lang === 'ar' ? 'الرمز صحيح' : 'Code verified' })
  } catch (error) {
    console.error('Verify code error:', error)
    return c.json({ success: false, error: 'Verification failed' }, 500)
  }
})

// Reset password with code
app.post('/api/auth/reset-password', async (c) => {
  const { DB } = c.env
  const lang = c.req.query('lang') || 'ar'

  try {
    const body = await c.req.json()
    const { email, code, newPassword } = body

    if (!email || !code || !newPassword) {
      return c.json({ success: false, error: lang === 'ar' ? 'جميع الحقول مطلوبة' : 'All fields are required' }, 400)
    }

    // Find user with valid reset code
    const user = await DB.prepare(`
      SELECT id FROM users 
      WHERE email = ? 
      AND reset_token = ?
      AND reset_expires > datetime('now')
    `).bind(email, code).first()

    if (!user) {
      return c.json({ success: false, error: lang === 'ar' ? 'الرمز غير صحيح أو منتهي' : 'Invalid or expired code' }, 400)
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword)

    // Update password and clear reset token
    await DB.prepare(`
      UPDATE users 
      SET password_hash = ?, reset_token = NULL, reset_expires = NULL
      WHERE id = ?
    `).bind(passwordHash, (user as any).id).run()

    return c.json({
      success: true,
      message: lang === 'ar' ? 'تم تغيير كلمة المرور بنجاح' : 'Password reset successfully'
    })
  } catch (error) {
    console.error('Reset password error:', error)
    return c.json({ success: false, error: 'Failed to reset password' }, 500)
  }
})

// Get user's pending requests
app.get('/api/users/:id/requests', async (c) => {
  const { DB } = c.env
  const userId = c.req.param('id')

  try {
    const requests = await DB.prepare(`
      SELECT cr.*, c.title as competition_title, c.status as competition_status
      FROM competition_requests cr
      JOIN competitions c ON cr.competition_id = c.id
      WHERE cr.requester_id = ?
      ORDER BY cr.created_at DESC
    `).bind(userId).all()

    return c.json({ success: true, data: requests.results })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch requests' }, 500)
  }
})

// Follow user
app.post('/api/users/:id/follow', async (c) => {
  const { DB } = c.env
  const followingId = c.req.param('id')

  try {
    const body = await c.req.json()
    const { follower_id } = body

    await DB.prepare('INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES (?, ?)').bind(follower_id, followingId).run()

    return c.json({ success: true })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to follow' }, 500)
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
      SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50
    `).bind(userId).all()

    return c.json({ success: true, data: notifications.results })
  } catch (error) {
    return c.json({ success: false, error: 'Failed to fetch notifications' }, 500)
  }
})

// ============ HTML Pages ============

// Dueli Logo SVG - New Design
const DueliLogo = `
<svg width="44" height="44" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <g opacity="0.7">
    <path d="M90 100 L30 30" stroke="currentColor" stroke-width="6" stroke-linecap="round" class="text-gray-400"/>
    <path d="M85 95 L95 105" stroke="currentColor" stroke-width="10" stroke-linecap="round" class="text-gray-400"/>
    <path d="M30 100 L90 30" stroke="currentColor" stroke-width="6" stroke-linecap="round" class="text-gray-400"/>
    <path d="M35 95 L25 105" stroke="currentColor" stroke-width="10" stroke-linecap="round" class="text-gray-400"/>
  </g>
  <g>
    <path d="M28 65 C30 55, 40 50, 50 50 L55 50 C55 45, 45 40, 35 45 L28 65 Z" fill="#a78bfa" stroke="#8b5cf6" stroke-width="2"/>
    <path d="M92 65 C90 55, 80 50, 70 50 L65 50 C65 45, 75 40, 85 45 L92 65 Z" fill="#fcd34d" stroke="#f59e0b" stroke-width="2"/>
    <path d="M50 50 C55 50, 58 55, 60 55 L60 60 C58 60, 55 65, 50 65 Z" fill="#a78bfa" stroke="#8b5cf6" stroke-width="1"/>
    <path d="M70 50 C65 50, 62 55, 60 55 L60 60 C62 60, 65 65, 70 65 Z" fill="#fcd34d" stroke="#f59e0b" stroke-width="1"/>
  </g>
</svg>
`

// Generate HTML function with new design
const generateHTML = (content: string, lang: Language, title: string = 'Dueli') => {
  const dir = getDir(lang)
  const tr = translations[lang]

  return `<!DOCTYPE html>
<html lang="${lang}" dir="${dir}" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - ${tr.app_title}</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <link href="https://fonts.googleapis.com/css2?family=Cairo:wght@300;400;500;600;700;800;900&family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link href="/static/styles.css" rel="stylesheet">
    <script>
      tailwind.config = {
        darkMode: 'class',
        theme: {
          extend: {
            fontFamily: {
              'cairo': ['Cairo', 'system-ui', 'sans-serif'],
              'inter': ['Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
              primary: '#8B5CF6',
              secondary: '#F59E0B',
              dialogue: '#8B5CF6',
              science: '#06B6D4',
              talents: '#F59E0B',
            }
          }
        }
      }
    </script>
    <style>
      body { font-family: ${lang === 'ar' ? "'Cairo'" : "'Inter'"}, system-ui, sans-serif; }
    </style>
</head>
<body class="bg-white dark:bg-[#0f0f0f] text-gray-900 dark:text-gray-100 min-h-screen transition-colors duration-300">
    ${content}
    <script src="/static/app.js"></script>
</body>
</html>`
}

// Navigation component - New Minimalist Design
const getNavigation = (lang: Language) => {
  const tr = translations[lang]
  const isRTL = lang === 'ar'

  return `
    <nav class="sticky top-0 z-50 bg-white/95 dark:bg-[#0f0f0f]/95 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
      <div class="container mx-auto px-4 h-16 flex items-center justify-between">
        <!-- Logo -->
        <a href="/?lang=${lang}" class="flex items-center gap-2 cursor-pointer group">
          <img src="/static/dueli-icon.png" alt="Dueli" class="w-10 h-10 object-contain">
          <span class="text-xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-amber-500 hidden sm:inline">
            ${tr.app_title}
          </span>
        </a>

        <!-- Right Side Actions -->
        <div class="flex items-center gap-1.5">
          <!-- Settings/Help -->
          <!-- Settings/Help -->
          <a href="/about?lang=${lang}" title="${tr.help}" class="nav-icon text-gray-400 hover:text-amber-500 dark:text-gray-400 dark:hover:text-amber-500 transition-colors">
            <i class="far fa-question-circle text-2xl"></i>
          </a>
          
          <!-- Country/Language Switcher -->
          <div class="relative">
            <button onclick="toggleCountryMenu()" class="nav-icon text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-purple-400 transition-colors" title="${lang === 'ar' ? 'البلد واللغة' : 'Country & Language'}">
              <i class="fas fa-globe text-xl"></i>
            </button>
            <div id="countryMenu" class="hidden absolute ${isRTL ? 'left-0' : 'right-0'} top-full mt-2 w-80 bg-white dark:bg-[#1a1a1a] rounded-xl shadow-xl border border-gray-100 dark:border-gray-800 z-50 max-h-96 overflow-hidden flex flex-col">
              <!-- Search Box -->
              <div class="p-3 border-b border-gray-100 dark:border-gray-800 sticky top-0 bg-white dark:bg-[#1a1a1a]">
                <div class="relative">
                  <input 
                    type="text" 
                    id="countrySearch" 
                    placeholder="${lang === 'ar' ? 'ابحث عن بلد...' : 'Search country...'}" 
                    class="w-full px-3 py-2 ${isRTL ? 'pr-9' : 'pl-9'} text-sm border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-purple-500"
                    oninput="filterCountries(this.value)"
                  />
                  <i class="fas fa-search absolute top-1/2 -translate-y-1/2 ${isRTL ? 'right-3' : 'left-3'} text-gray-400 text-sm"></i>
                </div>
              </div>
              <!-- Countries List -->
              <div id="countriesList" class="overflow-y-auto flex-1">
                <!-- Will be populated by JavaScript -->
              </div>
            </div>
          </div>
          
          <!-- Dark Mode Toggle -->
          <!-- Dark Mode Toggle -->
          <button onclick="toggleDarkMode()" class="nav-icon text-gray-500 hover:text-purple-600 dark:text-gray-400 dark:hover:text-amber-400 transition-colors ${isRTL ? 'scale-x-[-1]' : ''}" title="${tr.theme}">
            <i class="far fa-moon dark:hidden text-2xl"></i>
            <i class="fas fa-moon hidden dark:block text-2xl text-amber-400"></i>
          </button>

          <!-- Separator -->
          <div class="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1"></div>

          <!-- Auth Section - Login Button (hidden when logged in) -->
          <div id="authSection">
            <button onclick="showLoginModal()" class="flex items-center justify-center w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-full hover:opacity-90 transition-all shadow-lg shadow-purple-500/30 ${isRTL ? 'scale-x-[-1]' : ''}" title="${tr.login}">
              <i class="fas fa-arrow-right-to-bracket text-lg"></i>
            </button>
          </div>
          
          <!-- User Section (hidden when not logged in) -->
          <div id="userSection" class="hidden">
            <div class="relative">
              <button onclick="toggleUserMenu()" class="flex items-center gap-2 p-1 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
                <img id="userAvatar" src="https://api.dicebear.com/7.x/avataaars/svg?seed=user" alt="" class="w-9 h-9 rounded-full border-2 border-purple-400">
              </button>
              <div id="userMenu" class="hidden user-menu ${isRTL ? 'left-0' : 'right-0'}">
                <div class="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
                  <p id="userName" class="font-bold text-gray-900 dark:text-white">User</p>
                  <p id="userEmail" class="text-sm text-gray-500">email@example.com</p>
                </div>
                <a href="/profile?lang=${lang}" class="user-menu-item">
                  <i class="fas fa-user text-gray-500"></i>
                  <span>${tr.profile}</span>
                </a>
                <a href="/my-competitions?lang=${lang}" class="user-menu-item">
                  <i class="fas fa-trophy text-gray-500"></i>
                  <span>${tr.my_competitions}</span>
                </a>
                <a href="/my-requests?lang=${lang}" class="user-menu-item">
                  <i class="fas fa-inbox text-gray-500"></i>
                  <span>${tr.my_requests}</span>
                </a>
                <button onclick="logout()" class="user-menu-item text-red-600 w-full">
                  <i class="fas fa-sign-out-alt"></i>
                  <span>${tr.logout}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </nav>
  `
}

// Login Modal - New Design with Google, Facebook, Microsoft, Twitter
const getLoginModal = (lang: Language) => {
  const tr = translations[lang]
  const isRTL = lang === 'ar'

  return `
    <div id="loginModal" class="hidden fixed inset-0 z-[100]">
      <div class="modal-backdrop absolute inset-0 bg-black/50 backdrop-blur-sm" onclick="hideLoginModal()"></div>
      <div class="modal-content bg-white dark:bg-[#1a1a1a] rounded-2xl shadow-2xl w-full max-w-md p-8">
        <button onclick="hideLoginModal()" class="absolute top-4 ${isRTL ? 'left-4' : 'right-4'} text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
          <i class="fas fa-times text-xl"></i>
        </button>
        
        <div class="text-center mb-6">
          <div class="flex justify-center mb-4"><img src="/static/dueli-icon.png" alt="Dueli" class="w-12 h-12 object-contain"></div>
          <h2 class="text-2xl font-bold text-gray-900 dark:text-white" id="modalTitle">${tr.login_welcome}</h2>
          <p class="text-gray-500 mt-2 text-sm" id="modalSubtitle">${tr.login_subtitle}</p>
        </div>

        <!-- Tabs -->
        <div class="flex gap-2 mb-6 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
          <button onclick="switchAuthTab('login')" id="loginTab" class="flex-1 py-2 rounded-md text-sm font-semibold transition-all bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm">
            ${lang === 'ar' ? 'تسجيل الدخول' : 'Login'}
          </button>
          <button onclick="switchAuthTab('register')" id="registerTab" class="flex-1 py-2 rounded-md text-sm font-semibold transition-all text-gray-600 dark:text-gray-400">
            ${lang === 'ar' ? 'إنشاء حساب' : 'Register'}
          </button>
        </div>

        <!-- Messages -->
        <div id="authMessage" class="hidden mb-4 p-3 rounded-lg text-sm"></div>

        <!-- Login Form -->
        <div id="loginForm">
          <form onsubmit="handleLogin(event)" class="space-y-4 mb-6">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
              <input type="email" id="loginEmail" required class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
            </div>
            <div>
              <div class="flex justify-between items-center mb-2">
                <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">${lang === 'ar' ? 'كلمة المرور' : 'Password'}</label>
                <button type="button" onclick="showForgotPassword()" class="text-sm text-purple-600 hover:text-purple-500 font-medium">
                  ${lang === 'ar' ? 'نسيت كلمة المرور؟' : 'Forgot Password?'}
                </button>
              </div>
              <input type="password" id="loginPassword" required class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
            </div>
            <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
              ${lang === 'ar' ? 'تسجيل الدخول' : 'Login'}
            </button>
          </form>

          <div class="relative my-6">
            <div class="absolute inset-0 flex items-center"><div class="w-full border-t border-gray-200 dark:border-gray-700"></div></div>
            <div class="relative flex justify-center text-sm"><span class="px-2 bg-white dark:bg-[#1a1a1a] text-gray-500">${lang === 'ar' ? 'أو' : 'Or'}</span></div>
          </div>
        
          <div class="grid grid-cols-2 gap-3">
            <button onclick="loginWith('google')" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <svg class="w-5 h-5" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">Google</span>
            </button>
            
            <button onclick="loginWith('microsoft')" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-microsoft text-xl text-[#00A4EF]"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">Outlook</span>
            </button>

            <button onclick="loginWith('facebook')" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-facebook text-xl text-[#1877F2]"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">Facebook</span>
            </button>
            
            <button onclick="loginWith('twitter')" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-x-twitter text-xl text-gray-800 dark:text-white"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">X</span>
            </button>

            <button onclick="loginWith('tiktok')" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-tiktok text-xl text-black dark:text-white"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">TikTok</span>
            </button>

            <button onclick="loginWith('snapchat')" class="social-btn flex items-center justify-center gap-2 py-2.5 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
              <i class="fab fa-snapchat text-xl text-[#FFFC00] drop-shadow-sm"></i>
              <span class="font-medium text-sm text-gray-700 dark:text-gray-200">Snapchat</span>
            </button>
          </div>
        </div>

        <!-- Forgot Password Form -->
        <div id="forgotPasswordForm" class="hidden">
          <div class="text-center mb-6">
            <button onclick="showLogin()" class="text-sm text-gray-500 hover:text-purple-600 mb-4 flex items-center justify-center gap-2 mx-auto">
              <i class="fas fa-arrow-${isRTL ? 'right' : 'left'}"></i>
              ${lang === 'ar' ? 'العودة لتسجيل الدخول' : 'Back to Login'}
            </button>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white">${lang === 'ar' ? 'استعادة كلمة المرور' : 'Reset Password'}</h3>
          </div>

          <!-- Step 1: Email -->
          <form id="resetStep1" onsubmit="handleForgotPassword(event)" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
              <input type="email" id="resetEmail" required class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
            </div>
            <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
              ${lang === 'ar' ? 'إرسال رمز التحقق' : 'Send Verification Code'}
            </button>
          </form>

          <!-- Step 2: Verify Code -->
          <form id="resetStep2" onsubmit="handleVerifyResetCode(event)" class="space-y-4 hidden">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${lang === 'ar' ? 'رمز التحقق' : 'Verification Code'}</label>
              <input type="text" id="resetCode" required class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 text-center text-2xl tracking-widest">
              <p class="text-xs text-gray-500 mt-2 text-center">${lang === 'ar' ? 'تم إرسال الرمز إلى بريدك الإلكتروني' : 'Code sent to your email'}</p>
            </div>
            <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
              ${lang === 'ar' ? 'تحقق من الرمز' : 'Verify Code'}
            </button>
          </form>

          <!-- Step 3: New Password -->
          <form id="resetStep3" onsubmit="handleResetPassword(event)" class="space-y-4 hidden">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${lang === 'ar' ? 'كلمة المرور الجديدة' : 'New Password'}</label>
              <input type="password" id="newPassword" required minlength="6" class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
            </div>
            <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
              ${lang === 'ar' ? 'تغيير كلمة المرور' : 'Change Password'}
            </button>
          </form>
        </div>

        <!-- Register Form -->
        <div id="registerForm" class="hidden">
          <form onsubmit="handleRegister(event)" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${lang === 'ar' ? 'الاسم' : 'Name'}</label>
              <input type="text" id="registerName" required class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${lang === 'ar' ? 'البريد الإلكتروني' : 'Email'}</label>
              <input type="email" id="registerEmail" required class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">${lang === 'ar' ? 'كلمة المرور' : 'Password'}</label>
              <input type="password" id="registerPassword" required minlength="6" class="w-full px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
              <p class="text-xs text-gray-500 mt-1">${lang === 'ar' ? 'يجب أن تكون 6 أحرف على الأقل' : 'Must be at least 6 characters'}</p>
            </div>
            <button type="submit" class="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-lg font-semibold hover:opacity-90 transition-all">
              ${lang === 'ar' ? 'إنشاء حساب' : 'Create Account'}
            </button>
          </form>
        </div>
        
        <p class="text-xs text-gray-400 text-center mt-6">
          ${lang === 'ar' ? 'بالمتابعة، أنت توافق على شروط الخدمة وسياسة الخصوصية' : 'By continuing, you agree to our Terms and Privacy Policy'}
        </p>
      </div>
    </div>
  `
}

// Footer component
const getFooter = (lang: Language) => {
  const tr = translations[lang]

  return `
    <footer class="bg-gray-50 dark:bg-[#0a0a0a] border-t border-gray-200 dark:border-gray-800 py-6 mt-auto">
      <div class="container mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-3 text-sm text-gray-500 dark:text-gray-400">
        <div class="flex items-center gap-2">
          <img src="/static/dueli-icon.png" alt="Dueli" class="w-8 h-8 object-contain opacity-70 grayscale hover:grayscale-0 transition-all">
          <span class="font-bold text-gray-700 dark:text-white">${tr.app_title}</span>
        </div>
        <p>${tr.footer}</p>
      </div>
    </footer>
  `
}

// Home page - New Design matching screenshots
app.get('/', (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  const isRTL = lang === 'ar'

  const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    
    <div class="flex-1">
      <!-- Search Bar Section -->
      <div class="py-6 px-4">
        <div class="container mx-auto max-w-2xl">
          <div class="relative">
            <input 
              type="text" 
              id="searchInput"
              placeholder="${tr.search_placeholder}"
              class="search-input"
            />
            <div class="absolute top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none ${isRTL ? 'right-4' : 'left-4'}">
              <i class="fas fa-search text-lg"></i>
            </div>
          </div>
        </div>
      </div>

      <!-- Main Tabs (Live / Recorded) -->
      <div class="container mx-auto px-4 mb-6">
        <div class="flex justify-center">
          <div class="bg-gray-100 dark:bg-gray-800 p-1 rounded-full inline-flex gap-1">
            <button onclick="setMainTab('live')" id="tab-live" class="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-active">
              <span class="w-2 h-2 rounded-full bg-red-500 live-pulse"></span>
              ${tr.live}
            </button>
            <button onclick="setMainTab('recorded')" id="tab-recorded" class="px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive">
              <i class="fas fa-play-circle"></i>
              ${tr.recorded}
            </button>
          </div>
        </div>
      </div>

      <!-- Category Tabs -->
      <div class="container mx-auto px-4 mb-8">
        <div class="flex justify-center gap-2 flex-wrap">
          <button onclick="setSubTab('all')" id="subtab-all" class="px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-active">
            <i class="fas fa-star text-xs"></i>
            ${tr.all}
          </button>
          <button onclick="setSubTab('dialogue')" id="subtab-dialogue" class="px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-inactive">
            <i class="fas fa-comments text-xs"></i>
            ${tr.dialogue}
          </button>
          <button onclick="setSubTab('science')" id="subtab-science" class="px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-inactive">
            <i class="fas fa-flask text-xs"></i>
            ${tr.science}
          </button>
          <button onclick="setSubTab('talents')" id="subtab-talents" class="px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-inactive">
            <i class="fas fa-star text-xs"></i>
            ${tr.talents}
          </button>
        </div>
      </div>

      <!-- Main Content -->
      <main class="container mx-auto px-4 pb-24 space-y-10" id="mainContent">
        <div class="flex flex-col items-center justify-center py-16">
          <i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i>
          <p class="text-gray-500">${lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
        </div>
      </main>
    </div>
    
    <!-- Create Competition FAB (hidden for visitors) -->
    <div id="createCompBtn" class="hidden fixed bottom-6 ${isRTL ? 'left-6' : 'right-6'} z-40">
      <a href="/create?lang=${lang}" class="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full shadow-xl shadow-purple-500/30 hover:shadow-2xl hover:scale-105 transition-all font-bold">
        <i class="fas fa-plus"></i>
        <span class="hidden sm:inline">${tr.create_competition}</span>
      </a>
    </div>

    ${getFooter(lang)}
    
    <script>
      const lang = '${lang}';
      const isRTL = ${isRTL};
      const tr = ${JSON.stringify(tr)};
      let currentMainTab = 'live';
      let currentSubTab = 'all';
      
      // Initialize
      document.addEventListener('DOMContentLoaded', () => {
        checkAuth();
        loadCompetitions();
      });
      
      // Load competitions based on filters
      async function loadCompetitions() {
        const container = document.getElementById('mainContent');
        container.innerHTML = '<div class="flex flex-col items-center justify-center py-16"><i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i></div>';
        
        try {
          let url = '/api/competitions?limit=24';
          if (currentMainTab === 'live') url += '&status=live';
          else if (currentMainTab === 'recorded') url += '&status=recorded';
          
          if (currentSubTab !== 'all') {
            const categoryMap = { dialogue: '1', science: '2', talents: '3' };
            url += '&category=' + (categoryMap[currentSubTab] || currentSubTab);
          }
          
          const res = await fetch(url);
          const data = await res.json();
          
          if (!data.success || !data.data?.length) {
            container.innerHTML = \`
              <div class="flex flex-col items-center justify-center py-16 text-center">
                <div class="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                  <i class="fas fa-search text-3xl text-gray-300 dark:text-gray-600"></i>
                </div>
                <p class="text-lg font-medium text-gray-400">\${tr.no_duels}</p>
                <p class="text-sm text-gray-400 mt-1">\${lang === 'ar' ? 'جرب تصفية أخرى أو أنشئ منافسة جديدة' : 'Try a different filter or create a new competition'}</p>
              </div>
            \`;
            return;
          }
          
          // Group by category
          const dialogueItems = data.data.filter(c => c.category_id === 1 || c.category_slug === 'dialogue');
          const scienceItems = data.data.filter(c => c.category_id === 2 || c.category_slug === 'science');
          const talentsItems = data.data.filter(c => c.category_id === 3 || c.category_slug === 'talents');
          
          let html = '';
          
          // Suggested section (top items)
          if (currentSubTab === 'all' && data.data.length > 0) {
            html += renderSection(tr.sections?.suggested || (lang === 'ar' ? 'مقترح لك' : 'Suggested for You'), data.data.slice(0, 8), 'fas fa-fire', 'purple');
          }
          
          // Category sections
          if ((currentSubTab === 'all' || currentSubTab === 'dialogue') && dialogueItems.length > 0) {
            html += renderSection(tr.sections?.dialogue || (lang === 'ar' ? 'ساحة الحوار' : 'Dialogue Space'), dialogueItems, 'fas fa-comments', 'purple');
          }
          
          if ((currentSubTab === 'all' || currentSubTab === 'science') && scienceItems.length > 0) {
            html += renderSection(tr.sections?.science || (lang === 'ar' ? 'المختبر العلمي' : 'Science Lab'), scienceItems, 'fas fa-flask', 'cyan');
          }
          
          if ((currentSubTab === 'all' || currentSubTab === 'talents') && talentsItems.length > 0) {
            html += renderSection(tr.sections?.talents || (lang === 'ar' ? 'مسرح المواهب' : 'Talent Stage'), talentsItems, 'fas fa-star', 'amber');
          }
          
          if (!html) {
            html = \`
              <div class="flex flex-col items-center justify-center py-16 text-center">
                <div class="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-4">
                  <i class="fas fa-search text-3xl text-gray-300 dark:text-gray-600"></i>
                </div>
                <p class="text-lg font-medium text-gray-400">\${tr.no_duels}</p>
              </div>
            \`;
          }
          
          container.innerHTML = html;
        } catch (err) {
          console.error(err);
          container.innerHTML = '<div class="text-center py-16 text-red-500">' + (lang === 'ar' ? 'حدث خطأ' : 'Error loading') + '</div>';
        }
      }
      
      function renderSection(title, items, icon, color = 'purple') {
        const colorClasses = {
          purple: 'bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-400',
          cyan: 'bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400',
          amber: 'bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400'
        };
        
        return \`
          <section class="animate-fade-in">
            <div class="section-header">
              <div class="section-icon \${colorClasses[color] || colorClasses.purple}">
                <i class="\${icon}"></i>
              </div>
              <h2 class="text-lg font-bold text-gray-900 dark:text-white">\${title}</h2>
            </div>
            
            <div class="flex overflow-x-auto pb-4 -mx-4 px-4 gap-4 scrollbar-hide snap-x snap-mandatory">
              \${items.map(item => renderDuelCard(item)).join('')}
            </div>
          </section>
        \`;
      }
      
      function renderDuelCard(item) {
        const bgColors = {
          1: 'duel-bg-dialogue',
          2: 'duel-bg-science',
          3: 'duel-bg-talents'
        };
        const bgColor = bgColors[item.category_id] || 'duel-bg-dialogue';
        const isLive = item.status === 'live';
        const isPending = item.status === 'pending';
        
        return \`
          <a href="/competition/\${item.id}?lang=\${lang}" class="duel-card snap-start">
            <div class="duel-thumbnail \${bgColor} shadow-lg">
              <!-- Gradient overlay -->
              <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/20"></div>
              
              <!-- Category icon watermark -->
              <div class="absolute \${isRTL ? 'right-4' : 'left-4'} bottom-4 opacity-20">
                <i class="\${item.category_icon || 'fas fa-trophy'} text-5xl text-white"></i>
              </div>

              <!-- Competitors -->
              <div class="absolute inset-0 flex items-center justify-center gap-3 z-10 p-4">
                <div class="flex flex-col items-center">
                  <div class="competitor-avatar p-0.5">
                    <img src="\${item.creator_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + item.creator_name}" alt="" class="w-full h-full rounded-full bg-white object-cover">
                  </div>
                </div>

                <div class="w-12 h-12 bg-white rounded-full p-1.5 shadow-lg z-20 flex items-center justify-center">
                  <img src="/static/dueli-icon.png" alt="VS" class="w-full h-full object-contain">
                </div>

                <div class="flex flex-col items-center">
                  <div class="competitor-avatar p-0.5">
                    \${item.opponent_avatar ? 
                      \`<img src="\${item.opponent_avatar}" alt="" class="w-full h-full rounded-full bg-white object-cover">\` :
                      \`<div class="w-full h-full rounded-full bg-white/80 flex items-center justify-center text-gray-400 text-2xl font-bold">?</div>\`
                    }
                  </div>
                </div>
              </div>

              <!-- Status Badge -->
              <div class="absolute top-3 \${isRTL ? 'right-3' : 'left-3'} z-20">
                \${isLive ? \`
                  <span class="badge-live">
                    <span class="w-1.5 h-1.5 rounded-full bg-red-500 live-pulse"></span>
                    \${tr.status_live || 'مباشر'}
                  </span>
                \` : isPending ? \`
                  <span class="badge-pending">\${tr.status_pending || 'قريباً'}</span>
                \` : \`
                  <span class="badge-recorded">
                    <i class="fas fa-play text-xs"></i>
                    \${tr.recorded || 'مسجل'}
                  </span>
                \`}
              </div>

              <!-- Viewers -->
              <div class="absolute bottom-3 \${isRTL ? 'left-3' : 'right-3'} z-20">
                <span class="px-2 py-1 rounded-lg bg-black/50 backdrop-blur-sm text-white text-xs font-medium flex items-center gap-1">
                  <i class="fas fa-eye"></i>
                  \${(item.total_views || 0).toLocaleString()}
                </span>
              </div>
            </div>

            <!-- Card Info -->
            <div class="mt-3 px-1">
              <h3 class="text-sm font-bold text-gray-900 dark:text-white line-clamp-2 leading-tight">
                \${item.title}
              </h3>
              <div class="flex items-center gap-1 mt-1.5 text-xs text-gray-500">
                <span>\${item.creator_name}</span>
                <span class="mx-1">vs</span>
                <span>\${item.opponent_name || '?'}</span>
              </div>
            </div>
          </a>
        \`;
      }
      
      // Tab functions
      function setMainTab(tab) {
        currentMainTab = tab;
        
        const liveTab = document.getElementById('tab-live');
        const recordedTab = document.getElementById('tab-recorded');
        
        if (tab === 'live') {
          liveTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-active';
          recordedTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive';
          liveTab.innerHTML = '<span class="w-2 h-2 rounded-full bg-red-500 live-pulse"></span> ${tr.live}';
        } else {
          liveTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-inactive';
          recordedTab.className = 'px-6 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 tab-active';
          liveTab.innerHTML = '<span class="w-2 h-2 rounded-full bg-gray-400"></span> ${tr.live}';
        }
        
        loadCompetitions();
      }
      
      function setSubTab(tab) {
        currentSubTab = tab;
        
        const tabs = ['all', 'dialogue', 'science', 'talents'];
        tabs.forEach(t => {
          const el = document.getElementById('subtab-' + t);
          if (el) {
            el.className = t === tab
              ? 'px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-active'
              : 'px-5 py-2 rounded-xl text-sm font-semibold transition-all flex items-center gap-2 category-tab-inactive';
          }
        });
        
        loadCompetitions();
      }
      
      // Search handler
      document.getElementById('searchInput')?.addEventListener('input', debounce((e) => {
        const query = e.target.value.trim();
        if (query.length >= 2) {
          window.location.href = '/explore?search=' + encodeURIComponent(query) + '&lang=' + lang;
        }
      }, 500));
    </script>
  `

  return c.html(generateHTML(content, lang, tr.home))
})

// Email Verification Page
app.get('/verify', async (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  const token = c.req.query('token')

  let message = ''
  let isSuccess = false

  if (token) {
    try {
      const res = await fetch(`${c.req.url.split('/verify')[0]}/api/auth/verify?token=${token}&lang=${lang}`)
      const data = await res.json()
      message = data.message || data.error
      isSuccess = data.success
    } catch (error) {
      message = lang === 'ar' ? 'حدث خطأ أثناء التحقق' : 'Verification failed'
    }
  } else {
    message = lang === 'ar' ? 'رابط غير صالح' : 'Invalid link'
  }

  const content = `
    ${getNavigation(lang)}
    
    <div class="min-h-screen bg-white dark:bg-[#0f0f0f] flex items-center justify-center px-4">
      <div class="max-w-md w-full text-center">
        <div class="mb-6">
          <img src="/static/dueli-icon.png" alt="Dueli" class="w-20 h-20 mx-auto mb-6 object-contain">
        </div>
        
        ${isSuccess ? `
          <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
            <i class="fas fa-check text-4xl text-green-600 dark:text-green-400"></i>
          </div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">${message}</h1>
          <p class="text-gray-600 dark:text-gray-400 mb-8">
            ${lang === 'ar' ? 'يمكنك الآن تسجيل الدخول إلى حسابك' : 'You can now log into your account'}
          </p>
          <a href="/?lang=${lang}" class="inline-block px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full font-semibold hover:opacity-90 transition-all">
            ${lang === 'ar' ? 'اذهب إلى الرئيسية' : 'Go to Home'}
          </a>
        ` : `
          <div class="w-20 h-20 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
            <i class="fas fa-times text-4xl text-red-600 dark:text-red-400"></i>
          </div>
          <h1 class="text-3xl font-bold text-gray-900 dark:text-white mb-4">${message}</h1>
          <p class="text-gray-600 dark:text-gray-400 mb-8">
            ${lang === 'ar' ? 'يرجى التحقق من الرابط أو طلب رابط جديد' : 'Please check the link or request a new one'}
          </p>
          <a href="/?lang=${lang}" class="inline-block px-8 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 text-white rounded-full font-semibold hover:opacity-90 transition-all">
            ${lang === 'ar' ? 'العودة' : 'Go Back'}
          </a>
        `}
      </div>
    </div>
    
    ${getFooter(lang)}
  `

  return c.html(generateHTML(content, lang, lang === 'ar' ? 'تفعيل الحساب' : 'Account Verification'))
})

// About Page Route
app.get('/about', (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  const isRTL = lang === 'ar'

  const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    
    <div class="min-h-screen bg-white dark:bg-[#0f0f0f] animate-fade-in">
      <main class="container mx-auto px-4 py-12">
        <!-- Hero Section -->
        <div class="text-center mb-16 max-w-4xl mx-auto">
          <div class="inline-block p-3 rounded-2xl bg-gradient-to-br from-purple-500/10 to-amber-500/10 mb-6">
            <img src="/static/dueli-icon.png" alt="Dueli" class="w-20 h-20 object-contain drop-shadow-xl">
          </div>
          <h1 class="text-4xl md:text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-amber-500 mb-6 leading-tight">
            ${lang === 'ar' ? 'منصة ديولي للمنافسات' : 'Dueli Competition Platform'}
          </h1>
          <p class="text-xl text-gray-600 dark:text-gray-300 leading-relaxed">
            ${lang === 'ar'
      ? 'المنصة الأولى من نوعها التي تجمع بين المنافسات الحية، الحوارات البناءة، واكتشاف المواهب في بيئة تفاعلية عادلة.'
      : 'The first platform of its kind combining live competitions, constructive dialogues, and talent discovery in a fair interactive environment.'}
          </p>
        </div>

        <!-- Features Grid -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-8 mb-20">
          <div class="p-8 rounded-3xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 hover:border-purple-500/30 transition-all group">
            <div class="w-14 h-14 rounded-2xl bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center text-purple-600 dark:text-purple-400 text-2xl mb-6 group-hover:scale-110 transition-transform">
              <i class="fas fa-video"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
              ${lang === 'ar' ? 'بث مباشر وتفاعل حي' : 'Live Streaming & Interaction'}
            </h3>
            <p class="text-gray-500 dark:text-gray-400 leading-relaxed">
              ${lang === 'ar'
      ? 'نظام بث متطور يجمع المتنافسين جنباً إلى جنب مع إمكانية تفاعل الجمهور والتصويت المباشر.'
      : 'Advanced streaming system bringing competitors side-by-side with audience interaction and live voting.'}
            </p>
          </div>

          <div class="p-8 rounded-3xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 hover:border-amber-500/30 transition-all group">
            <div class="w-14 h-14 rounded-2xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center text-amber-600 dark:text-amber-400 text-2xl mb-6 group-hover:scale-110 transition-transform">
              <i class="fas fa-trophy"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
              ${lang === 'ar' ? 'نظام تحكيم عادل' : 'Fair Judging System'}
            </h3>
            <p class="text-gray-500 dark:text-gray-400 leading-relaxed">
              ${lang === 'ar'
      ? 'آليات تحكيم شفافة تعتمد على تصويت الجمهور ولجان التحكيم المختصة لضمان العدالة.'
      : 'Transparent judging mechanisms based on audience voting and expert panels to ensure fairness.'}
            </p>
          </div>

          <div class="p-8 rounded-3xl bg-gray-50 dark:bg-[#1a1a1a] border border-gray-100 dark:border-gray-800 hover:border-cyan-500/30 transition-all group">
            <div class="w-14 h-14 rounded-2xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center text-cyan-600 dark:text-cyan-400 text-2xl mb-6 group-hover:scale-110 transition-transform">
              <i class="fas fa-globe"></i>
            </div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">
              ${lang === 'ar' ? 'مجتمع عالمي' : 'Global Community'}
            </h3>
            <p class="text-gray-500 dark:text-gray-400 leading-relaxed">
              ${lang === 'ar'
      ? 'تواصل مع مبدعين ومفكرين من مختلف أنحاء العالم وشارك في منافسات عابرة للحدود.'
      : 'Connect with creators and thinkers from around the world and participate in cross-border competitions.'}
            </p>
          </div>
        </div>

        <!-- Gallery Section -->
        <div class="mb-20">
          <h2 class="text-3xl font-bold text-center text-gray-900 dark:text-white mb-10">
            ${lang === 'ar' ? 'نظرة على المنصة' : 'Platform Preview'}
          </h2>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <div class="rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all group h-64">
              <img src="/static/about/image-1.png" alt="Preview 1" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
            <div class="rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all group h-64 lg:col-span-2">
              <img src="/static/about/image-2.png" alt="Preview 2" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
            <div class="rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all group h-64 lg:col-span-2">
              <img src="/static/about/image-3.jpg" alt="Preview 3" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
            <div class="rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all group h-64">
              <img src="/static/about/image-4.jpg" alt="Preview 4" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
            <div class="rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all group h-64 md:col-span-2 lg:col-span-3">
              <img src="/static/about/image-5.jpg" alt="Preview 5" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            </div>
          </div>
        </div>

        <!-- Maelsh Section -->
        <div class="bg-gradient-to-br from-gray-900 to-black rounded-3xl p-8 md:p-12 text-white relative overflow-hidden">
          <div class="absolute top-0 right-0 w-64 h-64 bg-purple-600/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2"></div>
          <div class="absolute bottom-0 left-0 w-64 h-64 bg-amber-600/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2"></div>
          
          <div class="relative z-10 flex flex-col md:flex-row items-center gap-10">
            <div class="w-32 h-32 md:w-40 md:h-40 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center border-2 border-white/20 shadow-2xl shrink-0">
              <span class="text-5xl font-black bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-amber-400">M</span>
            </div>
            <div class="text-center md:text-${isRTL ? 'right' : 'left'}">
              <h2 class="text-3xl font-bold mb-4">
                ${lang === 'ar' ? 'تم التطوير بواسطة Maelsh' : 'Developed by Maelsh'}
              </h2>
              <p class="text-gray-300 text-lg leading-relaxed max-w-2xl">
                ${lang === 'ar'
      ? 'نحن في Maelsh نؤمن بقوة الحوار والمنافسة الشريفة في بناء المجتمعات. نسعى لتقديم حلول برمجية مبتكرة تجمع بين الجمالية والوظيفة لخدمة المستخدم العربي والعالمي.'
      : 'At Maelsh, we believe in the power of dialogue and fair competition in building communities. We strive to provide innovative software solutions that combine aesthetics and functionality to serve the Arab and global user.'}
              </p>
              <div class="mt-8 flex gap-4 justify-center md:justify-start">
                <a href="#" class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                  <i class="fab fa-twitter"></i>
                </a>
                <a href="#" class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                  <i class="fab fa-github"></i>
                </a>
                <a href="#" class="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
                  <i class="fas fa-envelope"></i>
                </a>
              </div>
            </div>
          </div>
        </main>
        
        ${getFooter(lang)}
      </div>
    </div>
  `

  return c.html(generateHTML(content, lang, lang === 'ar' ? 'عن ديولي' : 'About Dueli'))
})

// Competition detail page
app.get('/competition/:id', async (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  const id = c.req.param('id')
  const isRTL = lang === 'ar'

  const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    
    <div class="container mx-auto px-4 py-6" id="competitionContainer">
      <div class="flex flex-col items-center justify-center py-16">
        <i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i>
        <p class="text-gray-500">${lang === 'ar' ? 'جاري التحميل...' : 'Loading...'}</p>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      const lang = '${lang}';
      const isRTL = ${isRTL};
      const competitionId = '${id}';
      const tr = ${JSON.stringify(tr)};
      let competitionData = null;
      
      document.addEventListener('DOMContentLoaded', async () => {
        await checkAuth();
        loadCompetition();
      });
      
      async function loadCompetition() {
        try {
          const res = await fetch('/api/competitions/' + competitionId);
          const data = await res.json();
          
          if (!data.success) {
            document.getElementById('competitionContainer').innerHTML = \`
              <div class="text-center py-16">
                <i class="fas fa-exclamation-circle text-6xl text-red-400 mb-4"></i>
                <h2 class="text-2xl font-bold text-gray-600">\${tr.not_found || 'غير موجود'}</h2>
              </div>
            \`;
            return;
          }
          
          competitionData = data.data;
          renderCompetition(competitionData);
        } catch (err) {
          console.error(err);
        }
      }
      
      function renderCompetition(comp) {
        const isLive = comp.status === 'live';
        const isPending = comp.status === 'pending';
        const isCreator = window.currentUser && window.currentUser.id === comp.creator_id;
        const isOpponent = window.currentUser && window.currentUser.id === comp.opponent_id;
        const hasRequested = comp.requests?.some(r => r.requester_id === window.currentUser?.id && r.status === 'pending');
        const needsOpponent = isPending && !comp.opponent_id;
        
        const bgColors = {
          1: 'from-purple-600 to-purple-800',
          2: 'from-cyan-500 to-cyan-700',
          3: 'from-amber-500 to-orange-600'
        };
        const bgColor = bgColors[comp.category_id] || 'from-gray-600 to-gray-800';
        
        document.getElementById('competitionContainer').innerHTML = \`
          <div class="max-w-6xl mx-auto">
            <!-- Back Button & Header -->
            <div class="flex items-center gap-4 mb-6">
              <a href="/?lang=\${lang}" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
                <i class="fas fa-arrow-\${isRTL ? 'right' : 'left'} text-xl text-gray-600 dark:text-gray-300"></i>
              </a>
              <div>
                <div class="flex items-center gap-2 mb-1">
                  <span class="\${
                    isLive ? 'badge-live' :
                    isPending ? 'badge-pending' :
                    'bg-green-100 text-green-600 dark:bg-green-900/40 dark:text-green-400 px-3 py-1 rounded-full text-xs font-bold'
                  } flex items-center gap-1">
                    \${isLive ? '<span class="w-1.5 h-1.5 rounded-full bg-red-500 live-pulse"></span>' : ''}
                    \${isLive ? tr.status_live : isPending ? tr.status_pending : tr.status_completed}
                  </span>
                  <span class="text-sm text-gray-500">
                    <i class="\${comp.category_icon} mr-1"></i>
                    \${lang === 'ar' ? comp.category_name_ar : comp.category_name_en}
                  </span>
                </div>
                <h1 class="text-xl md:text-2xl font-bold text-gray-900 dark:text-white">\${comp.title}</h1>
              </div>
            </div>
            
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <!-- Main Content -->
              <div class="lg:col-span-2 space-y-6">
                <!-- Video Area -->
                <div class="bg-gradient-to-br \${bgColor} rounded-2xl overflow-hidden shadow-xl aspect-video flex items-center justify-center relative">
                  \${comp.youtube_live_id && isLive ? \`
                    <iframe width="100%" height="100%" src="https://www.youtube.com/embed/\${comp.youtube_live_id}?autoplay=1" frameborder="0" allowfullscreen class="absolute inset-0"></iframe>
                  \` : comp.youtube_video_url ? \`
                    <iframe width="100%" height="100%" src="https://www.youtube.com/embed/\${comp.youtube_video_url.split('v=')[1] || comp.youtube_video_url}" frameborder="0" allowfullscreen class="absolute inset-0"></iframe>
                  \` : \`
                    <div class="text-center text-white">
                      <i class="fas fa-video text-6xl opacity-50 mb-4"></i>
                      <p>\${isPending ? tr.status_pending : (lang === 'ar' ? 'البث غير متاح' : 'Stream not available')}</p>
                    </div>
                  \`}
                </div>
                
                <!-- Competitors Card -->
                <div class="card p-6">
                  <h3 class="font-bold text-lg mb-4 text-gray-900 dark:text-white">\${lang === 'ar' ? 'المتنافسون' : 'Competitors'}</h3>
                  <div class="grid grid-cols-2 gap-6">
                    <!-- Creator -->
                    <div class="text-center">
                      <img src="\${comp.creator_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + comp.creator_name}" class="w-20 h-20 rounded-full mx-auto mb-3 border-4 border-purple-200 dark:border-purple-800">
                      <h4 class="font-bold text-gray-900 dark:text-white">\${comp.creator_name}</h4>
                      <p class="text-sm text-gray-500">@\${comp.creator_username}</p>
                      \${isLive && window.currentUser && !isCreator ? \`
                        <div class="mt-3 flex justify-center gap-1">
                          \${[1,2,3,4,5].map(i => \`
                            <button onclick="rate(\${comp.creator_id}, \${i})" class="rating-star text-xl" data-competitor="\${comp.creator_id}" data-rating="\${i}">
                              <i class="fas fa-star"></i>
                            </button>
                          \`).join('')}
                        </div>
                      \` : ''}
                    </div>
                    
                    <!-- Opponent -->
                    <div class="text-center">
                      \${comp.opponent_id ? \`
                        <img src="\${comp.opponent_avatar || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + comp.opponent_name}" class="w-20 h-20 rounded-full mx-auto mb-3 border-4 border-amber-200 dark:border-amber-800">
                        <h4 class="font-bold text-gray-900 dark:text-white">\${comp.opponent_name}</h4>
                        <p class="text-sm text-gray-500">@\${comp.opponent_username}</p>
                        \${isLive && window.currentUser && !isOpponent ? \`
                          <div class="mt-3 flex justify-center gap-1">
                            \${[1,2,3,4,5].map(i => \`
                              <button onclick="rate(\${comp.opponent_id}, \${i})" class="rating-star text-xl" data-competitor="\${comp.opponent_id}" data-rating="\${i}">
                                <i class="fas fa-star"></i>
                              </button>
                            \`).join('')}
                          </div>
                        \` : ''}
                      \` : \`
                        <div class="w-20 h-20 rounded-full mx-auto mb-3 bg-gray-100 dark:bg-gray-700 flex items-center justify-center border-4 border-dashed border-gray-300 dark:border-gray-600">
                          <i class="fas fa-question text-3xl text-gray-400"></i>
                        </div>
                        <h4 class="font-bold text-gray-400">\${lang === 'ar' ? 'بانتظار منافس' : 'Awaiting Opponent'}</h4>
                        \${window.currentUser && !isCreator && !hasRequested ? \`
                          <button onclick="requestJoin()" class="join-btn mt-3">
                            <i class="fas fa-hand-paper"></i>
                            \${tr.request_join}
                          </button>
                        \` : hasRequested ? \`
                          <button onclick="cancelRequest()" class="mt-3 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-sm font-bold hover:bg-gray-300 transition-all">
                            <i class="fas fa-times mr-1"></i>
                            \${tr.cancel_request}
                          </button>
                        \` : !window.currentUser ? \`
                          <button onclick="showLoginModal()" class="join-btn mt-3">
                            <i class="fas fa-sign-in-alt"></i>
                            \${lang === 'ar' ? 'سجل دخول للمنافسة' : 'Login to Compete'}
                          </button>
                        \` : ''}
                      \`}
                    </div>
                  </div>
                </div>
                
                <!-- Rules -->
                <div class="card p-6">
                  <h3 class="font-bold text-lg mb-4 text-gray-900 dark:text-white">\${tr.competition_rules}</h3>
                  <pre class="whitespace-pre-wrap text-gray-600 dark:text-gray-300 text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded-xl">\${comp.rules}</pre>
                </div>
                
                <!-- Join Requests (for creator) -->
                \${isCreator && needsOpponent && comp.requests?.filter(r => r.status === 'pending').length > 0 ? \`
                  <div class="card p-6 border-2 border-purple-200 dark:border-purple-800">
                    <h3 class="font-bold text-lg mb-4 text-purple-600">\${lang === 'ar' ? 'طلبات الانضمام' : 'Join Requests'}</h3>
                    <div class="space-y-3">
                      \${comp.requests.filter(r => r.status === 'pending').map(req => \`
                        <div class="flex items-center justify-between p-4 bg-purple-50 dark:bg-purple-900/30 rounded-xl">
                          <div class="flex items-center gap-3">
                            <img src="\${req.avatar_url}" class="w-12 h-12 rounded-full">
                            <div>
                              <p class="font-bold text-gray-900 dark:text-white">\${req.display_name}</p>
                              <p class="text-sm text-gray-500">@\${req.username}</p>
                            </div>
                          </div>
                          <div class="flex gap-2">
                            <button onclick="acceptRequest(\${req.id}, \${req.requester_id})" class="px-4 py-2 bg-green-500 text-white rounded-lg font-bold hover:bg-green-600 transition-colors">
                              <i class="fas fa-check mr-1"></i> \${tr.accept}
                            </button>
                          </div>
                        </div>
                      \`).join('')}
                    </div>
                  </div>
                \` : ''}
              </div>
              
              <!-- Sidebar -->
              <div class="space-y-6">
                <!-- Stats -->
                <div class="card p-6">
                  <div class="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p class="text-3xl font-bold text-purple-600">\${(comp.total_views || 0).toLocaleString()}</p>
                      <p class="text-sm text-gray-500">\${tr.viewers}</p>
                    </div>
                    <div>
                      <p class="text-3xl font-bold text-purple-600">\${comp.total_comments || 0}</p>
                      <p class="text-sm text-gray-500">\${tr.comments}</p>
                    </div>
                  </div>
                </div>
                
                <!-- Live Chat -->
                <div class="card overflow-hidden">
                  <div class="p-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
                    <h3 class="font-bold text-gray-900 dark:text-white">\${tr.live_chat}</h3>
                  </div>
                  <div class="h-80 overflow-y-auto p-4 space-y-3" id="chatMessages">
                    \${comp.comments?.length ? comp.comments.map(c => \`
                      <div class="flex gap-2 animate-fade-in">
                        <img src="\${c.avatar_url || 'https://api.dicebear.com/7.x/avataaars/svg?seed=' + c.username}" class="w-8 h-8 rounded-full">
                        <div>
                          <p class="text-sm"><span class="font-semibold text-purple-600">\${c.display_name}</span></p>
                          <p class="text-sm text-gray-600 dark:text-gray-300">\${c.content}</p>
                        </div>
                      </div>
                    \`).join('') : '<p class="text-center text-gray-400">' + (lang === 'ar' ? 'لا توجد تعليقات بعد' : 'No comments yet') + '</p>'}
                  </div>
                  <div class="p-4 border-t border-gray-200 dark:border-gray-700">
                    \${window.currentUser ? \`
                      <form onsubmit="sendComment(event)" class="flex gap-2">
                        <input type="text" id="commentInput" placeholder="\${tr.add_comment}..." class="flex-1 border dark:border-gray-600 dark:bg-gray-700 rounded-full px-4 py-2 text-sm">
                        <button type="submit" class="p-2 bg-purple-600 text-white rounded-full hover:bg-purple-700 transition-colors">
                          <i class="fas fa-paper-plane"></i>
                        </button>
                      </form>
                    \` : \`
                      <button onclick="showLoginModal()" class="w-full py-2 text-center text-purple-600 hover:underline text-sm font-medium">
                        \${tr.login_required}
                      </button>
                    \`}
                  </div>
                </div>
              </div>
            </div>
          </div>
        \`;
      }
      
      async function requestJoin() {
        if (!window.currentUser) {
          showLoginModal();
          return;
        }
        
        try {
          const res = await fetch('/api/competitions/' + competitionId + '/request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requester_id: window.currentUser.id })
          });
          const data = await res.json();
          if (data.success) {
            showToast(tr.request_sent || (lang === 'ar' ? 'تم إرسال الطلب' : 'Request sent'), 'success');
            loadCompetition();
          }
        } catch (err) {
          console.error(err);
        }
      }
      
      async function cancelRequest() {
        if (!window.currentUser) return;
        
        try {
          await fetch('/api/competitions/' + competitionId + '/request', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requester_id: window.currentUser.id })
          });
          loadCompetition();
        } catch (err) {
          console.error(err);
        }
      }
      
      async function acceptRequest(requestId, requesterId) {
        try {
          await fetch('/api/competitions/' + competitionId + '/accept-request', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ request_id: requestId, requester_id: requesterId })
          });
          showToast(lang === 'ar' ? 'تم قبول الطلب' : 'Request accepted', 'success');
          loadCompetition();
        } catch (err) {
          console.error(err);
        }
      }
      
      async function rate(competitorId, rating) {
        if (!window.currentUser) {
          showLoginModal();
          return;
        }
        
        try {
          await fetch('/api/competitions/' + competitionId + '/rate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: window.currentUser.id,
              competitor_id: competitorId,
              rating: rating
            })
          });
          
          // Update UI
          document.querySelectorAll(\`.rating-star[data-competitor="\${competitorId}"]\`).forEach(btn => {
            const r = parseInt(btn.dataset.rating);
            if (r <= rating) {
              btn.classList.add('active');
            } else {
              btn.classList.remove('active');
            }
          });
        } catch (err) {
          console.error(err);
        }
      }
      
      async function sendComment(e) {
        e.preventDefault();
        if (!window.currentUser) return;
        
        const input = document.getElementById('commentInput');
        const content = input.value.trim();
        if (!content) return;
        
        try {
          await fetch('/api/competitions/' + competitionId + '/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: window.currentUser.id,
              content: content,
              is_live: competitionData?.status === 'live'
            })
          });
          input.value = '';
          loadCompetition();
        } catch (err) {
          console.error(err);
        }
      }
    </script>
  `

  return c.html(generateHTML(content, lang, tr.competition))
})

// Create competition page
app.get('/create', (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  const isRTL = lang === 'ar'

  const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    
    <div class="container mx-auto px-4 py-8">
      <div class="max-w-2xl mx-auto">
        <div class="flex items-center gap-4 mb-6">
          <a href="/?lang=${lang}" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
            <i class="fas fa-arrow-${isRTL ? 'right' : 'left'} text-xl text-gray-600 dark:text-gray-300"></i>
          </a>
          <h1 class="text-2xl font-bold text-gray-900 dark:text-white">${tr.create_competition}</h1>
        </div>
        
        <div id="createFormContainer">
          <!-- Will check auth and show form or login prompt -->
        </div>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      const lang = '${lang}';
      const isRTL = ${isRTL};
      const tr = ${JSON.stringify(tr)};
      let categories = [];
      
      document.addEventListener('DOMContentLoaded', async () => {
        await checkAuth();
        
        if (!window.currentUser) {
          document.getElementById('createFormContainer').innerHTML = \`
            <div class="card p-8 text-center">
              <div class="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-lock text-3xl text-gray-400"></i>
              </div>
              <h2 class="text-xl font-bold mb-2 text-gray-900 dark:text-white">\${tr.login_required}</h2>
              <p class="text-gray-500 mb-4">\${tr.login_subtitle}</p>
              <button onclick="showLoginModal()" class="btn-primary">
                \${tr.login}
              </button>
            </div>
          \`;
          return;
        }
        
        // Load categories
        const catRes = await fetch('/api/categories');
        const catData = await catRes.json();
        if (catData.success) {
          categories = catData.data;
        }
        
        renderCreateForm();
      });
      
      function renderCreateForm() {
        const mainCats = categories.filter(c => !c.parent_id);
        
        document.getElementById('createFormContainer').innerHTML = \`
          <form id="createForm" class="card p-8 space-y-6">
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">\${tr.competition_title} *</label>
              <input type="text" name="title" required class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-3">
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">\${tr.select_category} *</label>
              <select name="category_id" required class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-3" onchange="updateSubcategories(this.value)">
                <option value="">\${tr.select_category}</option>
                \${mainCats.map(c => \`<option value="\${c.id}">\${lang === 'ar' ? c.name_ar : c.name_en}</option>\`).join('')}
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">\${tr.select_subcategory}</label>
              <select name="subcategory_id" id="subcategorySelect" class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-3">
                <option value="">\${tr.select_subcategory}</option>
              </select>
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">\${tr.competition_description}</label>
              <textarea name="description" rows="3" class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-3"></textarea>
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">\${tr.competition_rules} *</label>
              <textarea name="rules" rows="5" required class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-3" placeholder="\${lang === 'ar' ? '1. مدة الحديث لكل طرف\\n2. قواعد الحوار\\n3. معايير التقييم' : '1. Speaking time per side\\n2. Dialogue rules\\n3. Evaluation criteria'}"></textarea>
            </div>
            
            <div>
              <label class="block text-sm font-medium mb-2 text-gray-700 dark:text-gray-300">\${tr.scheduled_time}</label>
              <input type="datetime-local" name="scheduled_at" class="w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 rounded-xl p-3">
            </div>
            
            <button type="submit" class="btn-primary w-full py-4 text-lg">
              <i class="fas fa-plus mr-2"></i>
              \${tr.create_competition}
            </button>
          </form>
        \`;
        
        document.getElementById('createForm').addEventListener('submit', handleCreate);
      }
      
      function updateSubcategories(parentId) {
        const subCats = categories.filter(c => c.parent_id === parseInt(parentId));
        const select = document.getElementById('subcategorySelect');
        select.innerHTML = '<option value="">' + tr.select_subcategory + '</option>' +
          subCats.map(c => \`<option value="\${c.id}">\${lang === 'ar' ? c.name_ar : c.name_en}</option>\`).join('');
      }
      
      async function handleCreate(e) {
        e.preventDefault();
        const form = e.target;
        
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
              creator_id: window.currentUser.id,
              language: lang,
              country: window.currentUser.country || 'SA',
              scheduled_at: form.scheduled_at.value || null
            })
          });
          
          const data = await res.json();
          if (data.success) {
            window.location.href = '/competition/' + data.data.id + '?lang=' + lang;
          } else {
            showToast(data.error || 'Error creating competition', 'error');
          }
        } catch (err) {
          console.error(err);
          showToast(lang === 'ar' ? 'حدث خطأ' : 'Error occurred', 'error');
        }
      }
    </script>
  `

  return c.html(generateHTML(content, lang, tr.create_competition))
})

// Explore page
app.get('/explore', (c) => {
  const lang = c.get('lang')
  const tr = translations[lang]
  const isRTL = lang === 'ar'

  const content = `
    ${getNavigation(lang)}
    ${getLoginModal(lang)}
    
    <div class="container mx-auto px-4 py-8">
      <div class="flex items-center gap-4 mb-6">
        <a href="/?lang=${lang}" class="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-800 transition-all">
          <i class="fas fa-arrow-${isRTL ? 'right' : 'left'} text-xl text-gray-600 dark:text-gray-300"></i>
        </a>
        <h1 class="text-2xl font-bold text-gray-900 dark:text-white">${tr.explore}</h1>
      </div>
      <div id="exploreContent">
        <div class="flex flex-col items-center justify-center py-16">
          <i class="fas fa-spinner fa-spin text-4xl text-purple-400 mb-4"></i>
        </div>
      </div>
    </div>
    
    ${getFooter(lang)}
    
    <script>
      const lang = '${lang}';
      const tr = ${JSON.stringify(tr)};
      const search = new URLSearchParams(window.location.search).get('search') || '';
      
      document.addEventListener('DOMContentLoaded', async () => {
        checkAuth();
        
        let url = '/api/competitions?limit=50';
        if (search) url += '&search=' + encodeURIComponent(search);
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (!data.success || !data.data?.length) {
          document.getElementById('exploreContent').innerHTML = \`
            <div class="text-center py-16">
              <div class="w-20 h-20 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mx-auto mb-4">
                <i class="fas fa-search text-3xl text-gray-300 dark:text-gray-600"></i>
              </div>
              <p class="text-gray-500">\${tr.no_duels}</p>
            </div>
          \`;
          return;
        }
        
        document.getElementById('exploreContent').innerHTML = \`
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            \${data.data.map(item => {
              const bgColors = {
                1: 'from-purple-600 to-purple-800',
                2: 'from-cyan-500 to-cyan-700',
                3: 'from-amber-500 to-orange-600'
              };
              const bgColor = bgColors[item.category_id] || 'from-gray-600 to-gray-800';
              
              return \`
                <a href="/competition/\${item.id}?lang=\${lang}" class="card card-hover overflow-hidden">
                  <div class="aspect-video bg-gradient-to-br \${bgColor} relative flex items-center justify-center">
                    <span class="text-white font-black text-3xl vs-text">VS</span>
                    \${item.status === 'live' ? '<div class="absolute top-2 left-2 badge-live"><span class="w-1.5 h-1.5 rounded-full bg-red-500 live-pulse"></span> LIVE</div>' : ''}
                  </div>
                  <div class="p-4">
                    <h3 class="font-bold text-gray-900 dark:text-white line-clamp-2">\${item.title}</h3>
                    <div class="flex items-center gap-2 mt-2 text-sm text-gray-500">
                      <span>\${item.creator_name}</span>
                      <span>vs</span>
                      <span>\${item.opponent_name || '?'}</span>
                    </div>
                    <div class="flex items-center gap-2 mt-2 text-xs text-gray-400">
                      <i class="fas fa-eye"></i>
                      <span>\${item.total_views || 0}</span>
                    </div>
                  </div>
                </a>
              \`;
            }).join('')}
          </div>
        \`;
      });
    </script>
  `

  return c.html(generateHTML(content, lang, tr.explore))
})

export default app
