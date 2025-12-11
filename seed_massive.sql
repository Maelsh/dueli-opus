-- =====================================================
-- Dueli - Massive Seed Data for Testing
-- بيانات تجريبية ضخمة لاختبار منصة دويلي
-- =====================================================
-- Note: This file contains massive amounts of test data
-- Password for all test users: password123
-- SHA-256 hash: ef92b778bafe771e89245b89ecbc08a44a4e166c06659911881f383d4473e94f
-- =====================================================

-- Clean existing data (optional - uncomment if needed)
-- DELETE FROM post_likes;
-- DELETE FROM posts;
-- DELETE FROM messages;
-- DELETE FROM scheduled_competitions;
-- DELETE FROM notifications;
-- DELETE FROM follows;
-- DELETE FROM comments;
-- DELETE FROM ratings;
-- DELETE FROM competition_requests;
-- DELETE FROM competition_invites;
-- DELETE FROM competitions;
-- DELETE FROM users;
-- DELETE FROM countries;
-- DELETE FROM categories;

-- ============================================
-- Countries (الدول) - 50+ countries
-- ============================================
INSERT OR IGNORE INTO countries (code, name_ar, name_en, flag_emoji) VALUES
-- Arab Countries
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
('OM', 'عمان', 'Oman', '🇴🇲'),
('BH', 'البحرين', 'Bahrain', '🇧🇭'),
('LY', 'ليبيا', 'Libya', '🇱🇾'),
('MR', 'موريتانيا', 'Mauritania', '🇲🇷'),
('KM', 'جزر القمر', 'Comoros', '🇰🇲'),
('DJ', 'جيبوتي', 'Djibouti', '🇩🇯'),
('SO', 'الصومال', 'Somalia', '🇸🇴'),
-- International Countries
('US', 'الولايات المتحدة', 'United States', '🇺🇸'),
('GB', 'المملكة المتحدة', 'United Kingdom', '🇬🇧'),
('DE', 'ألمانيا', 'Germany', '🇩🇪'),
('FR', 'فرنسا', 'France', '🇫🇷'),
('ES', 'إسبانيا', 'Spain', '🇪🇸'),
('IT', 'إيطاليا', 'Italy', '🇮🇹'),
('RU', 'روسيا', 'Russia', '🇷🇺'),
('CN', 'الصين', 'China', '🇨🇳'),
('JP', 'اليابان', 'Japan', '🇯🇵'),
('KR', 'كوريا الجنوبية', 'South Korea', '🇰🇷'),
('IN', 'الهند', 'India', '🇮🇳'),
('PK', 'باكستان', 'Pakistan', '🇵🇰'),
('BD', 'بنغلادش', 'Bangladesh', '🇧🇩'),
('ID', 'إندونيسيا', 'Indonesia', '🇮🇩'),
('MY', 'ماليزيا', 'Malaysia', '🇲🇾'),
('TR', 'تركيا', 'Turkey', '🇹🇷'),
('IR', 'إيران', 'Iran', '🇮🇷'),
('BR', 'البرازيل', 'Brazil', '🇧🇷'),
('MX', 'المكسيك', 'Mexico', '🇲🇽'),
('AR', 'الأرجنتين', 'Argentina', '🇦🇷'),
('CA', 'كندا', 'Canada', '🇨🇦'),
('AU', 'أستراليا', 'Australia', '🇦🇺'),
('NZ', 'نيوزيلندا', 'New Zealand', '🇳🇿'),
('ZA', 'جنوب أفريقيا', 'South Africa', '🇿🇦'),
('NG', 'نيجيريا', 'Nigeria', '🇳🇬'),
('KE', 'كينيا', 'Kenya', '🇰🇪'),
('GH', 'غانا', 'Ghana', '🇬🇭'),
('ET', 'إثيوبيا', 'Ethiopia', '🇪🇹'),
('SE', 'السويد', 'Sweden', '🇸🇪'),
('NO', 'النرويج', 'Norway', '🇳🇴'),
('DK', 'الدنمارك', 'Denmark', '🇩🇰'),
('FI', 'فنلندا', 'Finland', '🇫🇮'),
('NL', 'هولندا', 'Netherlands', '🇳🇱'),
('BE', 'بلجيكا', 'Belgium', '🇧🇪'),
('CH', 'سويسرا', 'Switzerland', '🇨🇭'),
('AT', 'النمسا', 'Austria', '🇦🇹'),
('PL', 'بولندا', 'Poland', '🇵🇱'),
('UA', 'أوكرانيا', 'Ukraine', '🇺🇦'),
('GR', 'اليونان', 'Greece', '🇬🇷'),
('PT', 'البرتغال', 'Portugal', '🇵🇹');

-- ============================================
-- Main Categories (الأقسام الرئيسية)
-- ============================================
INSERT OR IGNORE INTO categories (id, slug, name_ar, name_en, description_ar, description_en, icon, color, sort_order) VALUES
(1, 'dialogue', 'الحوار', 'Dialogue', 'منافسات حوارية ومناظرات فكرية', 'Dialogue competitions and intellectual debates', 'fas fa-comments', '#8B5CF6', 1),
(2, 'science', 'العلوم', 'Science', 'مناقشات علمية ونظريات', 'Scientific discussions and theories', 'fas fa-flask', '#06B6D4', 2),
(3, 'talents', 'المواهب', 'Talents', 'عرض المواهب والقدرات', 'Showcase talents and abilities', 'fas fa-star', '#F59E0B', 3);

-- ============================================
-- Dialogue Subcategories (الحوار)
-- ============================================
INSERT OR IGNORE INTO categories (slug, name_ar, name_en, description_ar, description_en, icon, color, parent_id, sort_order) VALUES
('religions', 'الأديان', 'Religions', 'حوارات بين الأديان المختلفة', 'Inter-religious dialogues', 'fas fa-pray', '#F97316', 1, 1),
('sects', 'المذاهب', 'Sects', 'حوارات بين المذاهب الفكرية', 'Discussions between different sects', 'fas fa-book', '#8B5CF6', 1, 2),
('politics', 'السياسة', 'Politics', 'نقاشات سياسية وأيديولوجية', 'Political and ideological discussions', 'fas fa-landmark', '#EF4444', 1, 3),
('economics', 'الاقتصاد', 'Economics', 'مناقشة الأنظمة الاقتصادية', 'Economic systems discussions', 'fas fa-chart-line', '#10B981', 1, 4),
('current-affairs', 'قضايا الساعة', 'Current Affairs', 'مناقشة القضايا الراهنة', 'Current events and issues', 'fas fa-newspaper', '#3B82F6', 1, 5),
('disputes', 'النزاعات الأخرى', 'Other Disputes', 'نقاشات ومنازعات متنوعة', 'Various disputes and discussions', 'fas fa-balance-scale', '#6366F1', 1, 6);

-- ============================================
-- Science Subcategories (العلوم)
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
-- Talents Subcategories (المواهب)
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
