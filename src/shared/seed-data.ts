/**
 * @file src/shared/seed-data.ts
 * @description بيانات تجريبية للاختبار
 * @module shared/seed
 */

/**
 * Sample Categories
 */
export const sampleCategories = [
    // Main Categories (Level 1)
    { id: 1, name_ar: 'الحوار', name_en: 'Dialogue', slug: 'dialogue', icon: 'fa-comments', color: '#8B5CF6', parent_id: null },
    { id: 2, name_ar: 'العلوم', name_en: 'Sciences', slug: 'sciences', icon: 'fa-flask', color: '#10B981', parent_id: null },
    { id: 3, name_ar: 'المواهب', name_en: 'Talents', slug: 'talents', icon: 'fa-star', color: '#F59E0B', parent_id: null },

    // Subcategories (Level 2) - Dialogue
    { id: 4, name_ar: 'سياسة', name_en: 'Politics', slug: 'politics', icon: 'fa-landmark', color: '#7C3AED', parent_id: 1 },
    { id: 5, name_ar: 'دين', name_en: 'Religion', slug: 'religion', icon: 'fa-moon', color: '#6366F1', parent_id: 1 },
    { id: 6, name_ar: 'اجتماع', name_en: 'Social', slug: 'social', icon: 'fa-users', color: '#8B5CF6', parent_id: 1 },

    // Subcategories (Level 2) - Sciences
    { id: 7, name_ar: 'فيزياء', name_en: 'Physics', slug: 'physics', icon: 'fa-atom', color: '#059669', parent_id: 2 },
    { id: 8, name_ar: 'رياضيات', name_en: 'Mathematics', slug: 'math', icon: 'fa-calculator', color: '#10B981', parent_id: 2 },
    { id: 9, name_ar: 'تاريخ', name_en: 'History', slug: 'history', icon: 'fa-book', color: '#34D399', parent_id: 2 },

    // Subcategories (Level 2) - Talents
    { id: 10, name_ar: 'شعر', name_en: 'Poetry', slug: 'poetry', icon: 'fa-feather', color: '#D97706', parent_id: 3 },
    { id: 11, name_ar: 'موسيقى', name_en: 'Music', slug: 'music', icon: 'fa-music', color: '#F59E0B', parent_id: 3 },
    { id: 12, name_ar: 'فن', name_en: 'Art', slug: 'art', icon: 'fa-palette', color: '#FBBF24', parent_id: 3 },
];

/**
 * Sample Users
 */
export const sampleUsers = [
    { id: 1, username: 'ahmed_m', display_name: 'أحمد محمد', email: 'ahmed@test.com', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Ahmed' },
    { id: 2, username: 'sarah_k', display_name: 'سارة خالد', email: 'sarah@test.com', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Sarah' },
    { id: 3, username: 'omar_h', display_name: 'عمر حسن', email: 'omar@test.com', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Omar' },
    { id: 4, username: 'fatima_a', display_name: 'فاطمة علي', email: 'fatima@test.com', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Fatima' },
    { id: 5, username: 'khaled_r', display_name: 'خالد رشيد', email: 'khaled@test.com', avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=Khaled' },
];

/**
 * Sample Competitions
 */
export const sampleCompetitions = [
    {
        id: 1,
        title: 'هل الديمقراطية مناسبة للعالم العربي؟',
        description: 'نقاش حول مدى ملاءمة النظام الديمقراطي للمجتمعات العربية',
        rules: 'الاحترام المتبادل، عدم التعرض للأشخاص، الالتزام بالوقت',
        category_id: 4,
        creator_id: 1,
        opponent_id: 2,
        status: 'scheduled',
        language: 'ar',
        country: 'SA',
        scheduled_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        views_count: 150
    },
    {
        id: 2,
        title: 'تفسير ميكانيكا الكم: كوبنهاغن vs العوالم المتعددة',
        description: 'مقارنة بين تفسيري كوبنهاغن والعوالم المتعددة',
        rules: 'استخدام المصادر العلمية، شرح مبسط للمفاهيم',
        category_id: 7,
        creator_id: 3,
        opponent_id: null,
        status: 'pending',
        language: 'ar',
        country: 'EG',
        scheduled_at: null,
        views_count: 45
    },
    {
        id: 3,
        title: 'مباراة شعرية: الغزل vs الحماسة',
        description: 'مسابقة شعرية بين غرضين من أغراض الشعر العربي',
        rules: 'الالتزام بالأوزان الخليلية، جودة المعاني',
        category_id: 10,
        creator_id: 4,
        opponent_id: 5,
        status: 'live',
        language: 'ar',
        country: 'JO',
        scheduled_at: null,
        views_count: 320
    },
    {
        id: 4,
        title: 'Is AI a threat to humanity?',
        description: 'Debating the potential risks and benefits of artificial intelligence',
        rules: 'Use factual arguments, cite sources, be respectful',
        category_id: 6,
        creator_id: 2,
        opponent_id: 3,
        status: 'completed',
        language: 'en',
        country: 'US',
        scheduled_at: null,
        views_count: 890
    }
];

/**
 * Generate SQL for seeding
 */
export function generateSeedSQL(): string {
    let sql = '-- Seed Data for Dueli\n\n';

    // Categories
    sql += '-- Categories\n';
    sampleCategories.forEach(cat => {
        sql += `INSERT OR IGNORE INTO categories (id, name_ar, name_en, slug, icon, color, parent_id, is_active, sort_order) VALUES (${cat.id}, '${cat.name_ar}', '${cat.name_en}', '${cat.slug}', '${cat.icon}', '${cat.color}', ${cat.parent_id || 'NULL'}, 1, ${cat.id});\n`;
    });

    sql += '\n-- Users\n';
    sampleUsers.forEach(user => {
        sql += `INSERT OR IGNORE INTO users (id, username, display_name, email, avatar_url, is_verified, created_at) VALUES (${user.id}, '${user.username}', '${user.display_name}', '${user.email}', '${user.avatar_url}', 1, datetime('now'));\n`;
    });

    sql += '\n-- Competitions\n';
    sampleCompetitions.forEach(comp => {
        sql += `INSERT OR IGNORE INTO competitions (id, title, description, rules, category_id, creator_id, opponent_id, status, language, country, scheduled_at, views_count, created_at) VALUES (${comp.id}, '${comp.title}', '${comp.description}', '${comp.rules}', ${comp.category_id}, ${comp.creator_id}, ${comp.opponent_id || 'NULL'}, '${comp.status}', '${comp.language}', '${comp.country}', ${comp.scheduled_at ? `'${comp.scheduled_at}'` : 'NULL'}, ${comp.views_count}, datetime('now'));\n`;
    });

    return sql;
}

export default { sampleCategories, sampleUsers, sampleCompetitions, generateSeedSQL };
