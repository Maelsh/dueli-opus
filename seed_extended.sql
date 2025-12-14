-- Additional Seed Data for Dueli - Extended Test Data
-- بيانات تجريبية إضافية موسعة
-- Note: Append this to seed.sql or run after seed.sql
-- Date: 2024-12-13

-- ============================================
-- Additional Users (مستخدمون إضافيون) - IDs 21-100
-- Password for all: password123
-- ============================================
INSERT OR IGNORE INTO users (id, email, username, password_hash, display_name, avatar_url, bio, country, language, total_competitions, total_wins, total_views, average_rating, is_verified) VALUES
-- More Arabic Users
(21, 'dr.karim@dueli.com', 'dr_karim', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'د. كريم العلي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=karim', 'أستاذ اللغة العربية وآدابها', 'IQ', 'ar', 8, 6, 25000, 4.5, 1),
(22, 'eng.sara@dueli.com', 'eng_sara', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'م. سارة الحمد', 'https://api.dicebear.com/7.x/avataaars/svg?seed=sara', 'مهندسة برمجيات في جوجل', 'AE', 'ar', 12, 9, 38000, 4.6, 1),
(23, 'artist.reem@dueli.com', 'artist_reem', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'ريم الفنانة', 'https://api.dicebear.com/7.x/avataaars/svg?seed=reem', 'فنانة تشكيلية ورسامة', 'LB', 'ar', 15, 12, 55000, 4.7, 1),
(24, 'dr.youssef@dueli.com', 'dr_youssef', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'د. يوسف المغربي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=youssef', 'طبيب جراح ومتخصص في الطب', 'MA', 'ar', 6, 4, 18000, 4.4, 1),
(25, 'coach.ahmad@dueli.com', 'coach_ahmad', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'المدرب أحمد', 'https://api.dicebear.com/7.x/avataaars/svg?seed=coach', 'مدرب رياضي محترف', 'EG', 'ar', 20, 18, 75000, 4.8, 1),
(26, 'dr.hana@dueli.com', 'dr_hana', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'د. هناء السالم', 'https://api.dicebear.com/7.x/avataaars/svg?seed=hana', 'باحثة في علم النفس', 'SA', 'ar', 10, 7, 32000, 4.5, 1),
(27, 'magician.ali@dueli.com', 'magician_ali', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'علي الساحر', 'https://api.dicebear.com/7.x/avataaars/svg?seed=magician', 'ساحر ومقدم عروض خفة', 'EG', 'ar', 18, 15, 68000, 4.7, 1),
(28, 'prof.salim@dueli.com', 'prof_salim', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'أ.د. سليم الراشد', 'https://api.dicebear.com/7.x/avataaars/svg?seed=salim', 'أستاذ الفلسفة والمنطق', 'TN', 'ar', 14, 11, 45000, 4.6, 1),
(29, 'blogger.dana@dueli.com', 'blogger_dana', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'دانا المدونة', 'https://api.dicebear.com/7.x/avataaars/svg?seed=dana', 'مدونة ومؤثرة اجتماعية', 'JO', 'ar', 8, 5, 42000, 4.4, 1),
(30, 'dr.faisal@dueli.com', 'dr_faisal', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'د. فيصل الكندري', 'https://api.dicebear.com/7.x/avataaars/svg?seed=faisal', 'متخصص في الطاقة المتجددة', 'KW', 'ar', 9, 7, 28000, 4.5, 1),
-- More International Users
(31, 'prof.miller@dueli.com', 'prof_miller', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Prof. James Miller', 'https://api.dicebear.com/7.x/avataaars/svg?seed=miller', 'Philosophy Professor at Oxford', 'GB', 'en', 12, 9, 35000, 4.6, 1),
(32, 'dr.johnson@dueli.com', 'dr_johnson', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Dr. Sarah Johnson', 'https://api.dicebear.com/7.x/avataaars/svg?seed=johnson', 'Neuroscientist and Author', 'US', 'en', 15, 12, 48000, 4.7, 1),
(33, 'chef.pierre@dueli.com', 'chef_pierre', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Chef Pierre Dubois', 'https://api.dicebear.com/7.x/avataaars/svg?seed=pierre', 'Michelin Star Chef', 'FR', 'en', 10, 8, 42000, 4.8, 1),
(34, 'singer.anna@dueli.com', 'singer_anna', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Anna Schmidt', 'https://api.dicebear.com/7.x/avataaars/svg?seed=anna', 'Opera Singer', 'DE', 'en', 8, 6, 32000, 4.5, 1),
(35, 'gamer.max@dueli.com', 'gamer_max', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Max Gaming', 'https://api.dicebear.com/7.x/avataaars/svg?seed=max', 'Pro Esports Player', 'US', 'en', 25, 20, 95000, 4.8, 1),
(36, 'dr.tanaka@dueli.com', 'dr_tanaka', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Dr. Yuki Tanaka', 'https://api.dicebear.com/7.x/avataaars/svg?seed=tanaka', 'Robotics Researcher', 'US', 'en', 11, 8, 38000, 4.6, 1),
(37, 'poet.william@dueli.com', 'poet_william', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'William Blake Jr', 'https://api.dicebear.com/7.x/avataaars/svg?seed=william', 'Contemporary Poet', 'GB', 'en', 7, 5, 22000, 4.4, 1),
(38, 'athlete.mike@dueli.com', 'athlete_mike', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Mike Thompson', 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike', 'Former Olympic Athlete', 'US', 'en', 18, 15, 62000, 4.7, 1),
(39, 'comedian.lisa@dueli.com', 'comedian_lisa', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Lisa Rodriguez', 'https://api.dicebear.com/7.x/avataaars/svg?seed=lisa', 'Stand-up Comedian', 'US', 'en', 12, 10, 55000, 4.6, 1),
(40, 'dr.kumar@dueli.com', 'dr_kumar', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Dr. Raj Kumar', 'https://api.dicebear.com/7.x/avataaars/svg?seed=kumar', 'Quantum Computing Expert', 'PK', 'en', 9, 7, 28000, 4.5, 1);

-- Users 41-60 (Quick batch)
INSERT OR IGNORE INTO users (id, email, username, password_hash, display_name, avatar_url, bio, country, language, total_competitions, total_wins, total_views, average_rating, is_verified) VALUES
(41, 'user41@dueli.com', 'user_41', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'محمد الريان', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u41', 'مبرمج ومطور تطبيقات', 'SA', 'ar', 5, 3, 12000, 4.2, 1),
(42, 'user42@dueli.com', 'user_42', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'نورة الصالح', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u42', 'معلمة ومدربة', 'SA', 'ar', 7, 5, 18000, 4.4, 1),
(43, 'user43@dueli.com', 'user_43', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'ياسر النمر', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u43', 'مصمم جرافيك', 'EG', 'ar', 4, 2, 8000, 4.1, 1),
(44, 'user44@dueli.com', 'user_44', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'لمى الحربي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u44', 'كاتبة محتوى', 'KW', 'ar', 6, 4, 15000, 4.3, 1),
(45, 'user45@dueli.com', 'user_45', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'فهد العتيبي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u45', 'محامي', 'SA', 'ar', 8, 6, 22000, 4.5, 1),
(46, 'user46@dueli.com', 'user_46', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'رانيا مصطفى', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u46', 'صحفية', 'EG', 'ar', 9, 7, 28000, 4.5, 1),
(47, 'user47@dueli.com', 'user_47', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'تامر الجندي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u47', 'مخرج سينمائي', 'EG', 'ar', 5, 3, 14000, 4.2, 1),
(48, 'user48@dueli.com', 'user_48', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'هدى العمري', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u48', 'مصورة محترفة', 'JO', 'ar', 7, 5, 19000, 4.4, 1),
(49, 'user49@dueli.com', 'user_49', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'أنس البلوشي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u49', 'رائد أعمال', 'OM', 'ar', 10, 8, 35000, 4.6, 1),
(50, 'user50@dueli.com', 'user_50', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'سلمى الفارسي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u50', 'مدربة يوغا', 'BH', 'ar', 6, 4, 16000, 4.3, 1),
(51, 'user51@dueli.com', 'user_51', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Tom Wilson', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u51', 'Data Scientist', 'US', 'en', 8, 6, 24000, 4.5, 1),
(52, 'user52@dueli.com', 'user_52', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Emily Carter', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u52', 'UX Designer', 'GB', 'en', 6, 4, 18000, 4.3, 1),
(53, 'user53@dueli.com', 'user_53', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'David Brown', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u53', 'Music Producer', 'US', 'en', 12, 10, 42000, 4.6, 1),
(54, 'user54@dueli.com', 'user_54', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Sophie Martin', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u54', 'Fashion Designer', 'FR', 'en', 9, 7, 32000, 4.5, 1),
(55, 'user55@dueli.com', 'user_55', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Chris Anderson', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u55', 'Fitness Coach', 'US', 'en', 15, 12, 55000, 4.7, 1),
(56, 'user56@dueli.com', 'user_56', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Hannah Lee', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u56', 'Yoga Instructor', 'US', 'en', 7, 5, 21000, 4.4, 1),
(57, 'user57@dueli.com', 'user_57', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Michael Davis', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u57', 'Architect', 'GB', 'en', 5, 3, 15000, 4.2, 1),
(58, 'user58@dueli.com', 'user_58', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Jessica Taylor', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u58', 'Entrepreneur', 'US', 'en', 11, 9, 38000, 4.6, 1),
(59, 'user59@dueli.com', 'user_59', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Daniel Moore', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u59', 'Film Director', 'US', 'en', 8, 6, 28000, 4.5, 1),
(60, 'user60@dueli.com', 'user_60', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Rachel Green', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u60', 'Marketing Expert', 'US', 'en', 6, 4, 17000, 4.3, 1);

-- Users 61-80 (Another batch)
INSERT OR IGNORE INTO users (id, email, username, password_hash, display_name, avatar_url, bio, country, language, total_competitions, total_wins, total_views, average_rating, is_verified) VALUES
(61, 'user61@dueli.com', 'user_61', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'عبدالله القحطاني', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u61', 'مهندس معماري', 'SA', 'ar', 7, 5, 20000, 4.4, 1),
(62, 'user62@dueli.com', 'user_62', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'منى الزهراني', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u62', 'طبيبة أطفال', 'SA', 'ar', 9, 7, 28000, 4.5, 1),
(63, 'user63@dueli.com', 'user_63', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'زياد الشمري', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u63', 'مدير تسويق', 'KW', 'ar', 5, 3, 14000, 4.2, 1),
(64, 'user64@dueli.com', 'user_64', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'ندى العوضي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u64', 'مذيعة تلفزيونية', 'AE', 'ar', 11, 9, 42000, 4.6, 1),
(65, 'user65@dueli.com', 'user_65', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'سعد المالكي', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u65', 'لاعب كرة قدم', 'SA', 'ar', 18, 15, 65000, 4.8, 1),
(66, 'user66@dueli.com', 'user_66', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'آمنة البدر', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u66', 'ناشطة اجتماعية', 'BH', 'ar', 8, 6, 25000, 4.5, 1),
(67, 'user67@dueli.com', 'user_67', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'عمار الدوسري', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u67', 'محلل مالي', 'SA', 'ar', 6, 4, 18000, 4.3, 1),
(68, 'user68@dueli.com', 'user_68', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'روان الخطيب', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u68', 'مصممة أزياء', 'LB', 'ar', 10, 8, 35000, 4.6, 1),
(69, 'user69@dueli.com', 'user_69', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'بلال الحسن', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u69', 'مهندس صوت', 'EG', 'ar', 7, 5, 22000, 4.4, 1),
(70, 'user70@dueli.com', 'user_70', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'ديما السعود', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u70', 'مدربة حياة', 'JO', 'ar', 12, 10, 45000, 4.7, 1),
(71, 'user71@dueli.com', 'user_71', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Oliver White', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u71', 'Blockchain Developer', 'GB', 'en', 9, 7, 30000, 4.5, 1),
(72, 'user72@dueli.com', 'user_72', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Sophia Adams', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u72', 'Classical Musician', 'DE', 'en', 8, 6, 25000, 4.4, 1),
(73, 'user73@dueli.com', 'user_73', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'James Williams', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u73', 'Sports Commentator', 'US', 'en', 15, 12, 52000, 4.7, 1),
(74, 'user74@dueli.com', 'user_74', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Olivia Harris', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u74', 'Environmental Scientist', 'US', 'en', 7, 5, 21000, 4.4, 1),
(75, 'user75@dueli.com', 'user_75', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Ethan Clark', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u75', 'Cyber Security Expert', 'US', 'en', 10, 8, 35000, 4.6, 1),
(76, 'user76@dueli.com', 'user_76', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Ava Robinson', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u76', 'Interior Designer', 'GB', 'en', 6, 4, 18000, 4.3, 1),
(77, 'user77@dueli.com', 'user_77', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Noah Martinez', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u77', 'Video Editor', 'US', 'en', 8, 6, 28000, 4.5, 1),
(78, 'user78@dueli.com', 'user_78', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Isabella Lewis', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u78', 'Podcast Host', 'US', 'en', 11, 9, 38000, 4.6, 1),
(79, 'user79@dueli.com', 'user_79', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Liam Walker', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u79', 'Mobile App Developer', 'US', 'en', 7, 5, 22000, 4.4, 1),
(80, 'user80@dueli.com', 'user_80', 'ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f', 'Mia Young', 'https://api.dicebear.com/7.x/avataaars/svg?seed=u80', 'Dance Choreographer', 'US', 'en', 13, 11, 45000, 4.7, 1);

-- ============================================
-- Additional Competitions (منافسات إضافية) - IDs 19-100
-- ============================================
-- Generate 82 more competitions across different categories

-- Live Competitions (19-30)
INSERT OR IGNORE INTO competitions (id, title, description, rules, category_id, subcategory_id, creator_id, opponent_id, status, language, country, total_views, started_at, likes_count, dislikes_count) VALUES
(19, 'AI vs Human Creativity: Who Wins?', 'Discussing whether AI can truly be creative', 'Respectful debate, 5 min each', 2, 12, 18, 36, 'live', 'en', 'US', 856, datetime('now', '-45 minutes'), 124, 8),
(20, 'Gaming Tournament: Final Round', 'Live gaming competition finals', 'Standard tournament rules', 3, 21, 12, 35, 'live', 'en', 'US', 2340, datetime('now', '-20 minutes'), 342, 15),
(21, 'الطاقة المتجددة: الواقع والمستقبل', 'نقاش حول تقنيات الطاقة النظيفة', 'قواعد الحوار المحترم', 2, 12, 30, 22, 'live', 'ar', 'KW', 567, datetime('now', '-35 minutes'), 89, 4),
(22, 'Poetry Slam: Modern vs Classical', 'Poetry competition between styles', 'Original work only', 3, 16, 37, 8, 'live', 'en', 'GB', 423, datetime('now', '-15 minutes'), 67, 3),
(23, 'مناظرة: التعليم التقليدي أم الإلكتروني؟', 'مناقشة أساليب التعليم الحديثة', 'وقت متساو للطرفين', 1, 8, 15, 26, 'live', 'ar', 'JO', 789, datetime('now', '-50 minutes'), 112, 7),
(24, 'Cooking Challenge: East vs West', 'Culinary competition', 'Same ingredients, different styles', 3, 20, 33, 11, 'live', 'en', 'FR', 634, datetime('now', '-25 minutes'), 98, 5);

-- Recorded Competitions (25-50)
INSERT OR IGNORE INTO competitions (id, title, description, rules, category_id, subcategory_id, creator_id, opponent_id, status, language, country, total_views, started_at, ended_at, likes_count, dislikes_count) VALUES
(25, 'Quantum Physics Debate', 'Deep dive into quantum mechanics', 'Academic discussion rules', 2, 13, 40, 9, 'recorded', 'en', 'US', 12500, datetime('now', '-3 days'), datetime('now', '-3 days', '+2 hours'), 1856, 45),
(26, 'Stand-up Comedy Battle', 'Who is the funniest?', 'Clean humor only', 3, 19, 39, 13, 'recorded', 'en', 'US', 28000, datetime('now', '-2 days'), datetime('now', '-2 days', '+1 hour'), 3421, 89),
(27, 'فن الخط العربي: تحدي الإبداع', 'مسابقة في فن الخط', 'استخدام الأدوات التقليدية', 3, 17, 23, 43, 'recorded', 'ar', 'LB', 8500, datetime('now', '-4 days'), datetime('now', '-4 days', '+2 hours'), 1234, 23),
(28, 'Fitness Challenge: HIIT vs Yoga', 'Which is more effective?', 'Demonstrate techniques', 3, 18, 55, 56, 'recorded', 'en', 'US', 15600, datetime('now', '-5 days'), datetime('now', '-5 days', '+1 hour'), 2156, 67),
(29, 'الشعر العربي المعاصر', 'إلقاء شعري احترافي', 'قصائد أصلية فقط', 3, 16, 7, 8, 'recorded', 'ar', 'KW', 45000, datetime('now', '-1 day'), datetime('now', '-1 day', '+90 minutes'), 5678, 123),
(30, 'Blockchain Technology Explained', 'Technical discussion on crypto', 'Facts-based arguments', 2, 12, 71, 75, 'recorded', 'en', 'GB', 9800, datetime('now', '-6 days'), datetime('now', '-6 days', '+2 hours'), 1456, 34),
(31, 'Magic Show Showdown', 'Best magic tricks competition', 'Original acts only', 3, 22, 27, 19, 'recorded', 'ar', 'EG', 22000, datetime('now', '-2 days'), datetime('now', '-2 days', '+1 hour'), 3245, 56),
(32, 'Climate Change Solutions', 'Scientific discussion', 'Evidence-based only', 2, 14, 74, 17, 'recorded', 'en', 'US', 11200, datetime('now', '-7 days'), datetime('now', '-7 days', '+2 hours'), 1678, 89),
(33, 'الفلسفة الإسلامية والغربية', 'حوار فلسفي عميق', 'احترام الآراء المختلفة', 2, 19, 28, 31, 'recorded', 'ar', 'TN', 7800, datetime('now', '-4 days'), datetime('now', '-4 days', '+2 hours'), 1123, 28),
(34, 'Guitar Hero Challenge', 'Rock vs Blues guitar', 'Original compositions', 3, 15, 53, 72, 'recorded', 'en', 'US', 18500, datetime('now', '-3 days'), datetime('now', '-3 days', '+1 hour'), 2567, 45),
(35, 'الطهي الخليجي التقليدي', 'مسابقة طبخ تقليدي', 'وصفات أصيلة', 3, 20, 11, 50, 'recorded', 'ar', 'AE', 9500, datetime('now', '-5 days'), datetime('now', '-5 days', '+2 hours'), 1345, 23),
(36, 'Esports Analysis Live', 'Pro gaming strategies', 'Technical breakdown', 3, 21, 35, 12, 'recorded', 'en', 'US', 34000, datetime('now', '-1 day'), datetime('now', '-1 day', '+2 hours'), 4567, 78),
(37, 'نظريات المؤامرة: حقيقة أم خيال؟', 'مناقشة نقدية', 'أدلة علمية فقط', 1, 8, 46, 15, 'recorded', 'ar', 'EG', 16000, datetime('now', '-6 days'), datetime('now', '-6 days', '+2 hours'), 2234, 156),
(38, 'Fashion Design Face-off', 'Runway design challenge', 'Original designs only', 3, 17, 54, 68, 'recorded', 'en', 'FR', 12400, datetime('now', '-4 days'), datetime('now', '-4 days', '+3 hours'), 1789, 34),
(39, 'الطب النبوي والحديث', 'مقارنة علمية', 'مصادر موثقة', 2, 18, 24, 62, 'recorded', 'ar', 'SA', 8900, datetime('now', '-8 days'), datetime('now', '-8 days', '+2 hours'), 1234, 89),
(40, 'Film Directors Debate', 'Discussing cinema techniques', 'Professional analysis', 3, 17, 59, 47, 'recorded', 'en', 'US', 7600, datetime('now', '-5 days'), datetime('now', '-5 days', '+2 hours'), 1045, 23);

-- Pending/Upcoming Competitions (41-70)
INSERT OR IGNORE INTO competitions (id, title, description, rules, category_id, subcategory_id, creator_id, status, language, country, scheduled_at, competition_type) VALUES
(41, 'The Future of Work: AI Impact', 'Discussion on AI in workplaces', 'Respectful debate', 2, 12, 18, 'pending', 'en', 'US', datetime('now', '+2 hours'), 'scheduled'),
(42, 'مسابقة الشعر الفصيح', 'منافسة شعرية رسمية', 'قصائد فصيحة فقط', 3, 16, 7, 'pending', 'ar', 'KW', datetime('now', '+4 hours'), 'scheduled'),
(43, 'Cooking with Limited Ingredients', 'Culinary creativity challenge', 'Use only 5 ingredients', 3, 20, 33, 'pending', 'en', 'FR', datetime('now', '+6 hours'), 'scheduled'),
(44, 'الذكاء الاصطناعي في الطب', 'مناقشة تطبيقات AI الطبية', 'نقاش علمي', 2, 18, 62, 'pending', 'ar', 'SA', datetime('now', '+3 hours'), 'scheduled'),
(45, 'Pro Gaming Tournament Q1', 'Quarterly esports championship', 'Tournament rules apply', 3, 21, 35, 'pending', 'en', 'US', datetime('now', '+8 hours'), 'scheduled'),
(46, 'حوار الحضارات', 'مناقشة التفاعل الحضاري', 'احترام متبادل', 1, 4, 3, 'pending', 'ar', 'EG', datetime('now', '+5 hours'), 'scheduled'),
(47, 'Space Exploration Debate', 'Mars vs Moon colonization', 'Scientific arguments', 2, 13, 32, 'pending', 'en', 'US', datetime('now', '+7 hours'), 'scheduled'),
(48, 'الموسيقى العربية الكلاسيكية', 'عرض موسيقي تنافسي', 'آلات تقليدية', 3, 15, 69, 'pending', 'ar', 'EG', datetime('now', '+4 hours'), 'scheduled'),
(49, 'Stand-up Comedy Night', 'Open mic competition', 'Original material, 10 min each', 3, 19, 39, 'pending', 'en', 'US', datetime('now', '+9 hours'), 'scheduled'),
(50, 'الاقتصاد الرقمي', 'مستقبل العملات الرقمية', 'تحليل اقتصادي', 1, 7, 1, 'pending', 'ar', 'SA', datetime('now', '+6 hours'), 'scheduled'),
(51, 'Photography Challenge', 'Best shot competition', 'Theme: Urban Life', 3, 17, 48, 'pending', 'en', 'JO', datetime('now', '+10 hours'), 'scheduled'),
(52, 'علم الفلك الحديث', 'اكتشافات فلكية جديدة', 'عرض علمي', 2, 13, 9, 'pending', 'ar', 'EG', datetime('now', '+5 hours'), 'scheduled'),
(53, 'Dance Battle', 'Hip-hop vs Contemporary', 'Original choreography', 3, 18, 80, 'pending', 'en', 'US', datetime('now', '+8 hours'), 'scheduled'),
(54, 'السياسة الدولية', 'تحليل الأوضاع الراهنة', 'موضوعية تامة', 1, 6, 15, 'pending', 'ar', 'JO', datetime('now', '+4 hours'), 'scheduled'),
(55, 'Tech Startup Pitch', 'Best business idea wins', 'Elevator pitch format', 2, 12, 58, 'pending', 'en', 'US', datetime('now', '+12 hours'), 'scheduled'),
(56, 'فن الإلقاء', 'مسابقة خطابية', 'خطاب أصلي', 3, 16, 21, 'pending', 'ar', 'IQ', datetime('now', '+3 hours'), 'scheduled'),
(57, 'Mental Health Awareness', 'Discussing modern challenges', 'Sensitive handling', 2, 19, 26, 'pending', 'en', 'GB', datetime('now', '+7 hours'), 'scheduled'),
(58, 'الرياضيات التطبيقية', 'حل مسائل رياضية', 'مستوى متقدم', 2, 16, 10, 'pending', 'ar', 'SA', datetime('now', '+5 hours'), 'scheduled'),
(59, 'Voice Acting Competition', 'Character voice challenge', 'Various genres', 3, 15, 53, 'pending', 'en', 'US', datetime('now', '+6 hours'), 'scheduled'),
(60, 'الإعلام الجديد', 'مستقبل الصحافة الرقمية', 'نقاش مهني', 1, 8, 46, 'pending', 'ar', 'EG', datetime('now', '+4 hours'), 'scheduled'),
(61, 'Art Critique Session', 'Analyzing modern art', 'Professional standards', 3, 17, 23, 'pending', 'en', 'FR', datetime('now', '+8 hours'), 'scheduled'),
(62, 'البيولوجيا الجزيئية', 'اكتشافات حديثة', 'عرض بحثي', 2, 14, 24, 'pending', 'ar', 'MA', datetime('now', '+6 hours'), 'scheduled'),
(63, 'Comedy Roast Battle', 'Friendly roasting competition', 'No personal attacks', 3, 19, 13, 'pending', 'en', 'US', datetime('now', '+10 hours'), 'scheduled'),
(64, 'قضايا المرأة العربية', 'نقاش اجتماعي', 'احترام الآراء', 1, 8, 42, 'pending', 'ar', 'SA', datetime('now', '+5 hours'), 'scheduled'),
(65, 'Yoga Challenge', 'Advanced poses competition', 'Safety first', 3, 18, 56, 'pending', 'en', 'US', datetime('now', '+4 hours'), 'scheduled'),
(66, 'الكيمياء الخضراء', 'مستقبل الكيمياء المستدامة', 'بحث علمي', 2, 15, 30, 'pending', 'ar', 'KW', datetime('now', '+7 hours'), 'scheduled'),
(67, 'Speed Coding Challenge', 'Algorithm competition', 'Standard rules', 2, 12, 79, 'pending', 'en', 'US', datetime('now', '+9 hours'), 'scheduled'),
(68, 'الأدب المقارن', 'مقارنة أدبية', 'تحليل نقدي', 3, 16, 44, 'pending', 'ar', 'KW', datetime('now', '+6 hours'), 'scheduled'),
(69, 'Basketball Skills Challenge', 'Individual skills competition', 'NBA rules', 3, 18, 38, 'pending', 'en', 'US', datetime('now', '+8 hours'), 'scheduled'),
(70, 'التنمية المستدامة', 'مناقشة البيئة', 'حلول عملية', 1, 7, 49, 'pending', 'ar', 'OM', datetime('now', '+5 hours'), 'scheduled');

-- Instant/Spontaneous Pending Competitions (71-85)  
INSERT OR IGNORE INTO competitions (id, title, description, rules, category_id, subcategory_id, creator_id, status, language, country, competition_type) VALUES
(71, 'Quick Debate: Social Media Impact', 'Join now for instant discussion', 'Respectful dialogue', 1, 8, 52, 'pending', 'en', 'GB', 'instant'),
(72, 'تحدي الطبخ السريع', 'انضم الآن', 'وقت محدود', 3, 20, 11, 'pending', 'ar', 'AE', 'instant'),
(73, 'Freestyle Rap Battle', 'Show your skills', 'Original lyrics', 3, 15, 53, 'pending', 'en', 'US', 'instant'),
(74, 'مناظرة سريعة: التكنولوجيا', 'انضم للنقاش', 'آراء مبنية', 2, 12, 22, 'pending', 'ar', 'AE', 'instant'),
(75, 'Trivia Challenge', 'Test your knowledge', 'Fastest answer wins', 2, 16, 51, 'pending', 'en', 'US', 'instant'),
(76, 'تحدي الرسم السريع', 'ارسم في 10 دقائق', 'إبداع فوري', 3, 17, 23, 'pending', 'ar', 'LB', 'instant'),
(77, 'Joke Battle', 'Best joke wins', 'Clean humor', 3, 19, 39, 'pending', 'en', 'US', 'instant'),
(78, 'نقاش رياضي', 'من الأفضل؟', 'حوار رياضي', 3, 18, 65, 'pending', 'ar', 'SA', 'instant'),
(79, 'Guitar Riff Challenge', 'Best riff wins', 'Original only', 3, 15, 34, 'pending', 'en', 'DE', 'instant'),
(80, 'مسابقة المعلومات', 'اختبر معلوماتك', 'أسرع إجابة', 2, 16, 41, 'pending', 'ar', 'SA', 'instant');

-- ============================================
-- Additional Likes (إعجابات إضافية)
-- ============================================
INSERT OR IGNORE INTO likes (user_id, competition_id) VALUES
(1, 25), (2, 25), (3, 25), (5, 25), (7, 25), (8, 25), (10, 25), (12, 25),
(1, 26), (2, 26), (4, 26), (6, 26), (7, 26), (8, 26), (11, 26), (13, 26), (14, 26), (16, 26),
(3, 29), (5, 29), (7, 29), (8, 29), (11, 29), (14, 29), (21, 29), (22, 29), (23, 29),
(18, 30), (20, 30), (31, 30), (32, 30), (36, 30), (40, 30),
(12, 36), (20, 36), (35, 36), (51, 36), (55, 36), (57, 36), (59, 36);

-- ============================================
-- Additional Comments (تعليقات إضافية)
-- ============================================
INSERT OR IGNORE INTO comments (competition_id, user_id, content) VALUES
(25, 5, 'Amazing discussion on quantum mechanics!'),
(25, 9, 'Very insightful points from both sides'),
(26, 12, 'This was hilarious! 😂'),
(26, 35, 'Best comedy battle ever'),
(29, 3, 'إبداع شعري راقي'),
(29, 8, 'من أجمل ما سمعت'),
(36, 20, 'Pro-level gaming strategies!'),
(36, 12, 'Learned so much from this');

-- ============================================
-- Additional Follows (متابعات إضافية)
-- ============================================
INSERT OR IGNORE INTO follows (follower_id, following_id) VALUES
(21, 1), (21, 7), (22, 5), (22, 18), (23, 8), (23, 14),
(24, 3), (25, 12), (26, 5), (27, 7), (28, 3), (29, 1),
(30, 5), (31, 18), (32, 17), (33, 11), (34, 14), (35, 12),
(36, 18), (37, 7), (38, 25), (39, 13), (40, 9),
(41, 1), (42, 5), (43, 8), (44, 7), (45, 15),
(46, 3), (47, 11), (48, 14), (49, 1), (50, 5);

-- ============================================
-- Additional Notifications (إشعارات إضافية)
-- ============================================
INSERT OR IGNORE INTO notifications (user_id, type, title, message, reference_type, reference_id, is_read, is_starred) VALUES
(18, 'competition_reminder', 'Upcoming Competition', 'Your competition starts in 15 minutes', 'competition', 41, 0, 0),
(7, 'competition_reminder', 'تذكير بالمنافسة', 'منافستك تبدأ بعد 15 دقيقة', 'competition', 42, 0, 1),
(1, 'earnings', 'أرباح جديدة', 'تم إضافة $25 لحسابك', 'user', 1, 0, 0),
(12, 'new_follower', 'متابع جديد', 'Alex Tech بدأ متابعتك', 'user', 20, 0, 0),
(35, 'competition_started', 'Competition Live', 'Gaming Tournament has started!', 'competition', 20, 0, 1),
(3, 'request', 'طلب انضمام', 'طلب جديد للانضمام لمنافستك', 'competition', 46, 0, 0);
