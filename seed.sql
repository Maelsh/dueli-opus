-- Seed Data for Dueli - Comprehensive Test Data
-- البيانات التجريبية الشاملة للمنصة
-- Note: This data is for testing only - will be removed before launch

-- ============================================
-- Main Categories (الأقسام الرئيسية)
-- ============================================
INSERT OR IGNORE INTO categories (id, slug, name_ar, name_en, description_ar, description_en, icon, color, sort_order) VALUES
(1, 'dialogue', 'الحوار', 'Dialogue', 'منافسات حوارية ومناظرات فكرية', 'Dialogue competitions and intellectual debates', 'fas fa-comments', '#8B5CF6', 1),
(2, 'science', 'العلوم', 'Science', 'مناقشات علمية ونظريات', 'Scientific discussions and theories', 'fas fa-flask', '#06B6D4', 2),
(3, 'talents', 'المواهب', 'Talents', 'عرض المواهب والقدرات', 'Showcase talents and abilities', 'fas fa-star', '#F59E0B', 3);

-- ============================================
-- Dialogue Subcategories (الأقسام الفرعية للحوار)
-- ============================================
INSERT OR IGNORE INTO categories (slug, name_ar, name_en, description_ar, description_en, icon, color, parent_id, sort_order) VALUES
('religions', 'الأديان', 'Religions', 'حوارات بين الأديان المختلفة', 'Inter-religious dialogues', 'fas fa-pray', '#F97316', 1, 1),
('sects', 'المذاهب', 'Sects', 'حوارات بين المذاهب الفكرية', 'Discussions between different sects', 'fas fa-book', '#8B5CF6', 1, 2),
('politics', 'السياسة', 'Politics', 'نقاشات سياسية وأيديولوجية', 'Political and ideological discussions', 'fas fa-landmark', '#EF4444', 1, 3),
('economics', 'الاقتصاد', 'Economics', 'مناقشة الأنظمة الاقتصادية', 'Economic systems discussions', 'fas fa-chart-line', '#10B981', 1, 4),
('current-affairs', 'قضايا الساعة', 'Current Affairs', 'مناقشة القضايا الراهنة', 'Current events and issues', 'fas fa-newspaper', '#3B82F6', 1, 5),
('disputes', 'النزاعات الأخرى', 'Other Disputes', 'نقاشات ومنازعات متنوعة', 'Various disputes and discussions', 'fas fa-balance-scale', '#6366F1', 1, 6);

-- ============================================
-- Science Subcategories (الأقسام الفرعية للعلوم)
-- ============================================
INSERT OR IGNORE INTO categories (slug, name_ar, name_en, description_ar, description_en, icon, color, parent_id, sort_order) VALUES
('physics', 'الفيزياء', 'Physics', 'نظريات ومناقشات فيزيائية', 'Physics theories and discussions', 'fas fa-atom', '#06B6D4', 2, 1),
('biology', 'الأحياء', 'Biology', 'علوم الحياة والتطور', 'Life sciences and evolution', 'fas fa-dna', '#22C55E', 2, 2),
('chemistry', 'الكيمياء', 'Chemistry', 'مناقشات كيميائية', 'Chemistry discussions', 'fas fa-vial', '#A855F7', 2, 3),
('math', 'الرياضيات', 'Mathematics', 'نظريات ومسائل رياضية', 'Mathematical theories and problems', 'fas fa-calculator', '#F59E0B', 2, 4),
('technology', 'التقنية', 'Technology', 'تكنولوجيا وذكاء اصطناعي', 'Technology and AI', 'fas fa-microchip', '#3B82F6', 2, 5),
('medicine', 'الطب', 'Medicine', 'مناقشات طبية وصحية', 'Medical and health discussions', 'fas fa-stethoscope', '#EF4444', 2, 6),
('philosophy', 'الفلسفة', 'Philosophy', 'مناقشات فلسفية', 'Philosophical discussions', 'fas fa-brain', '#8B5CF6', 2, 7);

-- ============================================
-- Talents Subcategories (الأقسام الفرعية للمواهب)
-- ============================================
INSERT OR IGNORE INTO categories (slug, name_ar, name_en, description_ar, description_en, icon, color, parent_id, sort_order) VALUES
('singing', 'الغناء', 'Singing', 'مواهب غنائية وموسيقية', 'Singing and musical talents', 'fas fa-microphone', '#EC4899', 3, 1),
('poetry', 'الشعر', 'Poetry', 'إلقاء شعري وأدبي', 'Poetry and literary recitation', 'fas fa-feather-alt', '#8B5CF6', 3, 2),
('art', 'الفن', 'Art', 'رسم وفنون تشكيلية', 'Drawing and visual arts', 'fas fa-palette', '#F59E0B', 3, 3),
('sports', 'الرياضة', 'Sports', 'مواهب رياضية', 'Sports talents', 'fas fa-running', '#22C55E', 3, 4),
('comedy', 'الكوميديا', 'Comedy', 'مواهب كوميدية', 'Comedy talents', 'fas fa-laugh', '#FBBF24', 3, 5),
('cooking', 'الطبخ', 'Cooking', 'مواهب الطهي', 'Cooking talents', 'fas fa-utensils', '#EF4444', 3, 6),
('gaming', 'الألعاب', 'Gaming', 'مواهب في الألعاب', 'Gaming talents', 'fas fa-gamepad', '#6366F1', 3, 7),
('magic', 'الخدع', 'Magic', 'خدع سحرية', 'Magic tricks', 'fas fa-magic', '#A855F7', 3, 8);

-- ============================================
-- Countries (الدول)
-- ============================================
INSERT OR IGNORE INTO countries (code, name_ar, name_en, flag_emoji) VALUES
('SA', 'السعودية', 'Saudi Arabia', '🇸🇦'),
('EG', 'مصر', 'Egypt', '🇪🇬'),
('AE', 'الإمارات', 'UAE', '🇦🇪'),
('KW', 'الكويت', 'Kuwait', '🇰🇼'),
('QA', 'قطر', 'Qatar', '🇶🇦'),
('JO', 'الأردن', 'Jordan', '🇯🇴'),
('LB', 'لبنان', 'Lebanon', '🇱🇧'),
('SY', 'سوريا', 'Syria', '🇸🇾'),
('IQ', 'العراق', 'Iraq', '🇮🇶'),
('PS', 'فلسطين', 'Palestine', '🇵🇸'),
('YE', 'اليمن', 'Yemen', '🇾🇪'),
('TN', 'تونس', 'Tunisia', '🇹🇳'),
('DZ', 'الجزائر', 'Algeria', '🇩🇿'),
('MA', 'المغرب', 'Morocco', '🇲🇦'),
('SD', 'السودان', 'Sudan', '🇸🇩'),
('US', 'الولايات المتحدة', 'United States', '🇺🇸'),
('GB', 'المملكة المتحدة', 'United Kingdom', '🇬🇧'),
('DE', 'ألمانيا', 'Germany', '🇩🇪'),
('FR', 'فرنسا', 'France', '🇫🇷'),
('TR', 'تركيا', 'Turkey', '🇹🇷'),
('PK', 'باكستان', 'Pakistan', '🇵🇰'),
('ID', 'إندونيسيا', 'Indonesia', '🇮🇩'),
('MY', 'ماليزيا', 'Malaysia', '🇲🇾'),
('OM', 'عمان', 'Oman', '🇴🇲'),
('BH', 'البحرين', 'Bahrain', '🇧🇭'),
('LY', 'ليبيا', 'Libya', '🇱🇾');

-- ============================================
-- Test Users (مستخدمون تجريبيون)
-- Password for all test users: password123
-- SHA-256 hash: ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f
-- ============================================
INSERT OR IGNORE INTO users (id, email, username, password_hash, display_name, avatar_url, bio, country, language, total_competitions, total_wins, total_views, average_rating, is_verified) VALUES
-- Arabic Users
(1, 'dr.sami@dueli.com', 'dr_sami', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'د. سامي الخالدي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=sami&backgroundColor=8B5CF6', 'أستاذ الاقتصاد الدولي - جامعة الملك سعود', 'SA', 'ar', 15, 12, 45000, 4.8, 1),
(2, 'eng.alaa@dueli.com', 'eng_alaa', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'م. علاء محمود', 'https://api.dicebear.com/7.x/avataaars/svg?seed=alaa&backgroundColor=06B6D4', 'مهندس اقتصادي ومحلل أسواق', 'EG', 'ar', 10, 6, 32000, 4.5, 1),
(3, 'sheikh.ahmed@dueli.com', 'sheikh_ahmed', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'الشيخ أحمد المصري', 'https://api.dicebear.com/7.x/avataaars/svg?seed=sheikh&backgroundColor=F59E0B', 'عالم دين وباحث في الحوار بين الأديان', 'EG', 'ar', 20, 18, 89000, 4.9, 1),
(4, 'father.yohanna@dueli.com', 'father_yohanna', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'الأب يوحنا بولس', 'https://api.dicebear.com/7.x/avataaars/svg?seed=father&backgroundColor=8B5CF6', 'كاهن ومتخصص في اللاهوت المقارن', 'LB', 'ar', 18, 14, 75000, 4.8, 1),
(5, 'prof.nadia@dueli.com', 'prof_nadia', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'أ.د. نادية حسين', 'https://api.dicebear.com/7.x/avataaars/svg?seed=nadia&backgroundColor=EC4899', 'أستاذة الذكاء الاصطناعي - جامعة القاهرة', 'EG', 'ar', 12, 10, 56000, 4.7, 1),
(6, 'dr.omar@dueli.com', 'dr_omar', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'د. عمر السعيد', 'https://api.dicebear.com/7.x/avataaars/svg?seed=omar&backgroundColor=06B6D4', 'باحث في تعلم الآلة والشبكات العصبية', 'SA', 'ar', 8, 5, 28000, 4.4, 1),
(7, 'poet.khalid@dueli.com', 'poet_khalid', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'خالد الشاعر', 'https://api.dicebear.com/7.x/avataaars/svg?seed=khalid&backgroundColor=F59E0B', 'شاعر وأديب حائز على جوائز عربية', 'KW', 'ar', 25, 22, 120000, 4.9, 1),
(8, 'writer.maya@dueli.com', 'writer_maya', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'مايا الأديبة', 'https://api.dicebear.com/7.x/avataaars/svg?seed=maya&backgroundColor=EC4899', 'كاتبة وشاعرة من الجيل الجديد', 'JO', 'ar', 20, 15, 95000, 4.7, 1),
(9, 'prof.physics@dueli.com', 'prof_physics', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'د. أحمد الفيزيائي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=physics&backgroundColor=06B6D4', 'أستاذ الفيزياء النظرية', 'EG', 'ar', 10, 8, 42000, 4.6, 1),
(10, 'student.ali@dueli.com', 'student_ali', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'علي الطالب', 'https://api.dicebear.com/7.x/avataaars/svg?seed=ali&backgroundColor=22C55E', 'طالب دكتوراه في فيزياء الكم', 'SA', 'ar', 5, 2, 15000, 4.2, 1),
-- More Arabic Users
(11, 'chef.fatima@dueli.com', 'chef_fatima', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'الشيف فاطمة', 'https://api.dicebear.com/7.x/avataaars/svg?seed=fatima&backgroundColor=EF4444', 'شيف محترفة ومقدمة برامج طبخ', 'AE', 'ar', 15, 12, 68000, 4.8, 1),
(12, 'gamer.hassan@dueli.com', 'gamer_hassan', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'حسن الجيمر', 'https://api.dicebear.com/7.x/avataaars/svg?seed=hassan&backgroundColor=6366F1', 'لاعب محترف وصانع محتوى', 'SA', 'ar', 30, 25, 150000, 4.9, 1),
(13, 'comedian.ahmad@dueli.com', 'comedian_ahmad', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'أحمد الكوميدي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=ahmad&backgroundColor=FBBF24', 'كوميدي ومقدم ستاند أب كوميدي', 'EG', 'ar', 18, 15, 85000, 4.7, 1),
(14, 'singer.layla@dueli.com', 'singer_layla', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'ليلى المغنية', 'https://api.dicebear.com/7.x/avataaars/svg?seed=layla&backgroundColor=EC4899', 'مغنية ومؤلفة أغاني', 'LB', 'ar', 12, 10, 72000, 4.8, 1),
(15, 'dr.politics@dueli.com', 'dr_politics', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'د. محمد السياسي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=politics&backgroundColor=EF4444', 'محلل سياسي وباحث في العلاقات الدولية', 'JO', 'ar', 22, 18, 95000, 4.6, 1),
-- International Users
(16, 'john.smith@dueli.com', 'john_smith', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'John Smith', 'https://api.dicebear.com/7.x/avataaars/svg?seed=john&backgroundColor=3B82F6', 'Political Analyst & Economist', 'US', 'en', 8, 5, 22000, 4.3, 1),
(17, 'emma.watson@dueli.com', 'emma_watson', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Emma Watson', 'https://api.dicebear.com/7.x/avataaars/svg?seed=emma&backgroundColor=EC4899', 'Science Communicator', 'GB', 'en', 6, 4, 18000, 4.4, 1),
(18, 'dr.chen@dueli.com', 'dr_chen', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Dr. Wei Chen', 'https://api.dicebear.com/7.x/avataaars/svg?seed=chen&backgroundColor=06B6D4', 'AI Researcher at MIT', 'US', 'en', 10, 8, 35000, 4.7, 1),
(19, 'maria.garcia@dueli.com', 'maria_garcia', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Maria Garcia', 'https://api.dicebear.com/7.x/avataaars/svg?seed=maria&backgroundColor=F59E0B', 'Flamenco Dancer & Artist', 'US', 'en', 14, 12, 48000, 4.8, 1),
(20, 'alex.tech@dueli.com', 'alex_tech', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Alex Tech', 'https://api.dicebear.com/7.x/avataaars/svg?seed=alextech&backgroundColor=8B5CF6', 'Tech YouTuber & Developer', 'DE', 'en', 20, 16, 110000, 4.6, 1);

-- ============================================
-- LIVE Competitions (منافسات مباشرة)
-- ============================================
INSERT OR IGNORE INTO competitions (id, title, description, rules, category_id, subcategory_id, creator_id, opponent_id, status, language, country, total_views, total_comments, youtube_live_id, started_at) VALUES
-- Dialogue Live
(1, 'مستقبل الاقتصاد العالمي: هل نحن أمام نظام جديد؟', 
   'نقاش معمق حول التحولات الاقتصادية العالمية وتأثير العملات الرقمية والتكتلات الجديدة',
   '1. مدة الحديث لكل طرف 5 دقائق\n2. يسمح بالأسئلة المتبادلة\n3. احترام الرأي الآخر\n4. الاستناد للمصادر العلمية',
   1, 7, 1, 2, 'live', 'ar', 'SA', 1240, 156, 'demo_live_1', datetime('now', '-30 minutes')),

(2, 'حوار الأديان: نقاط الالتقاء في القيم الإنسانية',
   'حوار حضاري بين عالم دين مسلم وكاهن مسيحي حول القيم المشتركة',
   '1. الاحترام المتبادل\n2. التركيز على المشتركات\n3. عدم الإساءة للمقدسات\n4. البناء على القيم الإنسانية',
   1, 4, 3, 4, 'live', 'ar', 'EG', 3500, 420, 'demo_live_2', datetime('now', '-45 minutes')),

-- Science Live  
(3, 'الذكاء الاصطناعي العام: حلم أم كابوس؟',
   'مناظرة علمية حول مستقبل الذكاء الاصطناعي ومخاطره المحتملة',
   '1. الاعتماد على الأبحاث العلمية\n2. تقديم الأدلة\n3. مناقشة الجوانب الأخلاقية\n4. طرح الحلول',
   2, 14, 5, 6, 'live', 'ar', 'EG', 1500, 200, 'demo_live_3', datetime('now', '-20 minutes')),

(4, 'The Future of Quantum Computing',
   'Expert debate on the potential and challenges of quantum computing',
   '1. Evidence-based arguments\n2. Technical accuracy\n3. Future predictions\n4. Real-world applications',
   2, 14, 18, 17, 'live', 'en', 'US', 890, 120, 'demo_live_4', datetime('now', '-15 minutes')),

-- Talents Live
(5, 'نهائي الإلقاء الشعري: قصائد الفخر',
   'منافسة شعرية بين أفضل شاعرين في موسم الفخر والاعتزاز',
   '1. قصيدة واحدة لكل شاعر\n2. التقييم على الإلقاء والمعنى\n3. التفاعل مع الجمهور\n4. احترام الوقت المحدد',
   3, 18, 7, 8, 'live', 'ar', 'KW', 5000, 650, 'demo_live_5', datetime('now', '-15 minutes')),

(6, 'تحدي الطبخ العربي الأصيل',
   'منافسة طبخ بين أفضل شيفين في تحضير طبق تقليدي',
   '1. طبق واحد لكل متسابق\n2. وقت محدد 30 دقيقة\n3. التقييم على المذاق والتقديم',
   3, 22, 11, 14, 'live', 'ar', 'AE', 2800, 340, 'demo_live_6', datetime('now', '-10 minutes'));

-- ============================================
-- RECORDED Competitions (منافسات مسجلة)
-- ============================================
INSERT OR IGNORE INTO competitions (id, title, description, rules, category_id, subcategory_id, creator_id, opponent_id, status, language, country, total_views, total_comments, youtube_video_url, started_at, ended_at) VALUES
(7, 'تبسيط ميكانيكا الكم لغير المتخصصين',
   'شرح مبسط لأساسيات ميكانيكا الكم بين أستاذ وطالب دكتوراه',
   '1. استخدام أمثلة بسيطة\n2. تجنب المعادلات المعقدة\n3. التفاعل مع أسئلة المشاهدين',
   2, 10, 9, 10, 'completed', 'ar', 'EG', 800, 95, 'https://youtube.com/watch?v=demo5', datetime('now', '-2 days'), datetime('now', '-2 days', '+1 hour')),

(8, 'مستقبل العملات الرقمية في الاقتصاد العربي',
   'نقاش حول تأثير العملات المشفرة على الاقتصادات العربية',
   '1. تقديم الحجج بأدلة\n2. مناقشة المخاطر والفرص\n3. احترام الوقت',
   1, 7, 1, 16, 'completed', 'ar', 'SA', 2500, 180, 'https://youtube.com/watch?v=demo6', datetime('now', '-5 days'), datetime('now', '-5 days', '+1.5 hours')),

(9, 'الفن الرقمي: هل يهدد الفن التقليدي؟',
   'مناقشة حول تأثير الذكاء الاصطناعي على الفنون',
   '1. عرض أمثلة من الجانبين\n2. مناقشة الجانب الإبداعي\n3. طرح رؤى مستقبلية',
   3, 19, 5, 17, 'completed', 'en', 'US', 1800, 120, 'https://youtube.com/watch?v=demo7', datetime('now', '-3 days'), datetime('now', '-3 days', '+1 hour')),

(10, 'مناظرة الفلسفة: الوجودية ضد المادية',
   'حوار فلسفي عميق حول معنى الوجود والغاية من الحياة',
   '1. احترام كل الآراء\n2. الاستناد للمدارس الفلسفية\n3. أمثلة من الواقع',
   2, 16, 9, 15, 'completed', 'ar', 'EG', 4200, 280, 'https://youtube.com/watch?v=demo8', datetime('now', '-7 days'), datetime('now', '-7 days', '+2 hours')),

(11, 'Comedy Battle: East vs West',
   'Comedy showdown between comedians from different cultures',
   '1. Keep it clean\n2. 5 minutes per set\n3. Audience votes',
   3, 21, 13, 19, 'completed', 'en', 'US', 12000, 890, 'https://youtube.com/watch?v=demo9', datetime('now', '-4 days'), datetime('now', '-4 days', '+1 hour')),

(12, 'Gaming Championship Finals',
   'The ultimate gaming showdown between top players',
   '1. Best of 5 matches\n2. Standard tournament rules\n3. No exploits',
   3, 23, 12, 20, 'completed', 'ar', 'SA', 25000, 1500, 'https://youtube.com/watch?v=demo10', datetime('now', '-1 day'), datetime('now', '-1 day', '+3 hours'));

-- ============================================
-- PENDING Competitions (منافسات منتظرة)
-- ============================================
INSERT OR IGNORE INTO competitions (id, title, description, rules, category_id, subcategory_id, creator_id, opponent_id, status, language, country, scheduled_at) VALUES
(13, 'الديمقراطية في العالم العربي: التحديات والفرص',
   'نقاش حول مستقبل الديمقراطية في المنطقة العربية',
   '1. احترام كل الآراء\n2. الابتعاد عن الشخصنة\n3. التركيز على الأفكار',
   1, 6, 15, NULL, 'pending', 'ar', 'JO', datetime('now', '+2 days')),

(14, 'تطور لغات البرمجة: أيها الأفضل للمستقبل؟',
   'مقارنة بين لغات البرمجة الحديثة وتوقعات المستقبل',
   '1. تقديم أدلة تقنية\n2. مقارنة عملية\n3. مناقشة حالات الاستخدام',
   2, 14, 5, NULL, 'pending', 'ar', 'EG', datetime('now', '+3 days')),

(15, 'مسابقة الغناء العربي الأصيل',
   'منافسة في أداء الأغاني العربية التراثية',
   '1. أغنية واحدة لكل متسابق\n2. التقييم على الصوت والأداء\n3. احترام التراث',
   3, 17, 14, NULL, 'pending', 'ar', 'LB', datetime('now', '+1 day')),

(16, 'AI Ethics Debate',
   'Discussion on the ethical implications of artificial intelligence',
   '1. Evidence-based arguments\n2. Consider multiple perspectives\n3. Focus on practical solutions',
   2, 14, 18, NULL, 'pending', 'en', 'US', datetime('now', '+4 days')),

(17, 'تحدي الشعر المعاصر',
   'منافسة في كتابة وإلقاء الشعر الحر والمعاصر',
   '1. قصيدة أصلية\n2. 3 دقائق للإلقاء\n3. التقييم على الإبداع والإلقاء',
   3, 18, 7, NULL, 'pending', 'ar', 'KW', datetime('now', '+5 days')),

(18, 'مناظرة: التعليم التقليدي ضد التعليم عن بعد',
   'مقارنة بين أساليب التعليم المختلفة',
   '1. تقديم إحصائيات\n2. أمثلة من الواقع\n3. حلول عملية',
   1, 8, 9, NULL, 'pending', 'ar', 'EG', datetime('now', '+6 days'));

-- ============================================
-- Competition Requests (طلبات الانضمام)
-- ============================================
INSERT OR IGNORE INTO competition_requests (competition_id, requester_id, status, message) VALUES
(13, 2, 'pending', 'أرغب في المشاركة في هذا النقاش الهام حول الديمقراطية'),
(13, 16, 'pending', 'I would like to offer an international perspective on this topic'),
(14, 6, 'pending', 'متخصص في لغات البرمجة وأحب المشاركة'),
(14, 20, 'pending', 'I have experience with multiple programming languages'),
(15, 8, 'pending', 'لدي خبرة في الغناء العربي الأصيل'),
(16, 17, 'pending', 'I specialize in AI ethics and would love to debate'),
(17, 8, 'pending', 'أكتب الشعر الحر وأود المنافسة'),
(18, 5, 'pending', 'لدي خبرة في كلا النظامين التعليميين');

-- ============================================
-- Comments (التعليقات)
-- ============================================
INSERT OR IGNORE INTO comments (competition_id, user_id, content, is_live) VALUES
-- Competition 1 comments
(1, 3, 'نقاش رائع ومعمق!', 1),
(1, 4, 'أتفق مع د. سامي في النقطة الأخيرة', 1),
(1, 7, 'متابع من الكويت، حوار ممتاز', 1),
(1, 8, 'أتمنى المزيد من هذه النقاشات', 1),
(1, 12, 'محتوى مميز 🔥', 1),
-- Competition 2 comments
(2, 1, 'حوار حضاري راقي', 1),
(2, 5, 'هذا هو الحوار الذي نحتاجه', 1),
(2, 15, 'نقاش محترم ومفيد', 1),
(2, 11, 'ما شاء الله، حوار مثمر', 1),
-- Competition 3 comments
(3, 7, 'موضوع مهم جداً للمستقبل', 1),
(3, 12, 'AI is the future!', 1),
(3, 1, 'نقاش علمي ممتاز', 1),
-- Competition 5 comments
(5, 1, 'إبداع في الإلقاء!', 1),
(5, 3, 'ما شاء الله، شعر رائع', 1),
(5, 11, 'فخورة بشعرائنا', 1),
(5, 15, 'كلمات تصل للقلب', 1),
-- Competition 6 comments
(6, 7, 'يا سلام على الطبخ!', 1),
(6, 8, 'أريد تجربة هذه الوصفة', 1),
(6, 3, 'طعام شهي', 1);

-- ============================================
-- Ratings (التقييمات)
-- ============================================
INSERT OR IGNORE INTO ratings (competition_id, user_id, competitor_id, rating) VALUES
-- Competition 1 ratings
(1, 3, 1, 5),
(1, 4, 1, 4),
(1, 7, 1, 5),
(1, 3, 2, 4),
(1, 4, 2, 5),
(1, 7, 2, 4),
-- Competition 2 ratings
(2, 1, 3, 5),
(2, 5, 3, 5),
(2, 15, 3, 5),
(2, 1, 4, 5),
(2, 5, 4, 4),
(2, 15, 4, 5),
-- Competition 3 ratings
(3, 7, 5, 5),
(3, 8, 5, 4),
(3, 12, 5, 5),
(3, 7, 6, 4),
(3, 8, 6, 4),
-- Competition 5 ratings
(5, 1, 7, 5),
(5, 3, 7, 5),
(5, 11, 7, 5),
(5, 1, 8, 4),
(5, 3, 8, 5),
-- Competition 6 ratings
(6, 7, 11, 5),
(6, 8, 11, 5),
(6, 7, 14, 4),
(6, 8, 14, 5);

-- ============================================
-- Follows (المتابعات)
-- ============================================
INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES
(1, 3), (1, 5), (1, 7), (1, 12),
(2, 1), (2, 3), (2, 5), (2, 15),
(3, 1), (3, 4), (3, 7), (3, 9),
(4, 3), (4, 5), (4, 7),
(5, 1), (5, 6), (5, 9), (5, 18),
(6, 5), (6, 9), (6, 18),
(7, 8), (7, 1), (7, 14),
(8, 7), (8, 3), (8, 14),
(9, 5), (9, 10), (9, 18),
(10, 9), (10, 5), (10, 6),
(11, 14), (11, 7), (11, 8),
(12, 20), (12, 7), (12, 1),
(13, 7), (13, 8), (13, 14),
(14, 11), (14, 7), (14, 8),
(15, 1), (15, 3), (15, 9),
(16, 18), (16, 1), (16, 17),
(17, 18), (17, 5), (17, 16),
(18, 5), (18, 17), (18, 20),
(19, 13), (19, 14), (19, 20),
(20, 12), (20, 18), (20, 19);

-- ============================================
-- Notifications (إشعارات تجريبية)
-- ============================================
INSERT OR IGNORE INTO notifications (user_id, type, title, message, reference_type, reference_id, is_read) VALUES
(15, 'request', 'طلب انضمام جديد', 'م. علاء محمود يريد الانضمام لمنافستك', 'competition', 13, 0),
(15, 'request', 'طلب انضمام جديد', 'John Smith يريد الانضمام لمنافستك', 'competition', 13, 0),
(5, 'request', 'طلب انضمام جديد', 'د. عمر السعيد يريد الانضمام لمنافستك', 'competition', 14, 0),
(14, 'request', 'طلب انضمام جديد', 'مايا الأديبة تريد الانضمام لمنافستك', 'competition', 15, 0),
(1, 'follow', 'متابع جديد', 'م. علاء محمود بدأ متابعتك', 'user', 2, 1),
(7, 'comment', 'تعليق جديد', 'علق أحدهم على منافستك', 'competition', 5, 0);
