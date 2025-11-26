-- Seed Data for Dueli
-- البيانات الأولية للمنصة

-- إدراج الأقسام الرئيسية
INSERT OR IGNORE INTO categories (id, slug, name_ar, name_en, description_ar, description_en, icon, color, sort_order) VALUES
(1, 'dialogue', 'الحوار', 'Dialogue', 'منافسات حوارية ومناظرات فكرية', 'Dialogue competitions and intellectual debates', 'fas fa-comments', '#EF4444', 1),
(2, 'science', 'العلوم', 'Science', 'مناقشات علمية ونظريات', 'Scientific discussions and theories', 'fas fa-flask', '#10B981', 2),
(3, 'talents', 'المواهب', 'Talents', 'عرض المواهب والقدرات', 'Showcase talents and abilities', 'fas fa-star', '#F59E0B', 3);

-- الأقسام الفرعية للحوار
INSERT OR IGNORE INTO categories (slug, name_ar, name_en, description_ar, description_en, icon, parent_id, sort_order) VALUES
('religions', 'الأديان', 'Religions', 'حوارات بين الأديان المختلفة', 'Inter-religious dialogues', 'fas fa-pray', 1, 1),
('sects', 'المذاهب', 'Sects', 'حوارات بين المذاهب الفكرية', 'Discussions between different sects', 'fas fa-book', 1, 2),
('politics', 'السياسة', 'Politics', 'نقاشات سياسية وأيديولوجية', 'Political and ideological discussions', 'fas fa-landmark', 1, 3),
('economics', 'الاقتصاد', 'Economics', 'مناقشة الأنظمة الاقتصادية', 'Economic systems discussions', 'fas fa-chart-line', 1, 4),
('current-affairs', 'قضايا الساعة', 'Current Affairs', 'مناقشة القضايا الراهنة', 'Current events and issues', 'fas fa-newspaper', 1, 5),
('disputes', 'النزاعات الأخرى', 'Other Disputes', 'نقاشات ومنازعات متنوعة', 'Various disputes and discussions', 'fas fa-balance-scale', 1, 6);

-- الأقسام الفرعية للعلوم
INSERT OR IGNORE INTO categories (slug, name_ar, name_en, description_ar, description_en, icon, parent_id, sort_order) VALUES
('physics', 'الفيزياء', 'Physics', 'نظريات ومناقشات فيزيائية', 'Physics theories and discussions', 'fas fa-atom', 2, 1),
('biology', 'الأحياء', 'Biology', 'علوم الحياة والتطور', 'Life sciences and evolution', 'fas fa-dna', 2, 2),
('chemistry', 'الكيمياء', 'Chemistry', 'مناقشات كيميائية', 'Chemistry discussions', 'fas fa-vial', 2, 3),
('math', 'الرياضيات', 'Mathematics', 'نظريات ومسائل رياضية', 'Mathematical theories and problems', 'fas fa-calculator', 2, 4),
('technology', 'التقنية', 'Technology', 'تكنولوجيا وذكاء اصطناعي', 'Technology and AI', 'fas fa-microchip', 2, 5),
('medicine', 'الطب', 'Medicine', 'مناقشات طبية وصحية', 'Medical and health discussions', 'fas fa-stethoscope', 2, 6),
('philosophy', 'الفلسفة', 'Philosophy', 'مناقشات فلسفية', 'Philosophical discussions', 'fas fa-brain', 2, 7);

-- الأقسام الفرعية للمواهب
INSERT OR IGNORE INTO categories (slug, name_ar, name_en, description_ar, description_en, icon, parent_id, sort_order) VALUES
('singing', 'الغناء', 'Singing', 'مواهب غنائية وموسيقية', 'Singing and musical talents', 'fas fa-microphone', 3, 1),
('poetry', 'الشعر', 'Poetry', 'إلقاء شعري وأدبي', 'Poetry and literary recitation', 'fas fa-feather-alt', 3, 2),
('art', 'الفن', 'Art', 'رسم وفنون تشكيلية', 'Drawing and visual arts', 'fas fa-palette', 3, 3),
('sports', 'الرياضة', 'Sports', 'مواهب رياضية', 'Sports talents', 'fas fa-running', 3, 4),
('comedy', 'الكوميديا', 'Comedy', 'مواهب كوميدية', 'Comedy talents', 'fas fa-laugh', 3, 5),
('cooking', 'الطبخ', 'Cooking', 'مواهب الطهي', 'Cooking talents', 'fas fa-utensils', 3, 6),
('gaming', 'الألعاب', 'Gaming', 'مواهب في الألعاب', 'Gaming talents', 'fas fa-gamepad', 3, 7),
('magic', 'الخدع', 'Magic', 'خدع سحرية', 'Magic tricks', 'fas fa-magic', 3, 8);

-- إدراج الدول الأساسية
INSERT OR IGNORE INTO countries (code, name_ar, name_en, flag_emoji) VALUES
('SA', 'السعودية', 'Saudi Arabia', '🇸🇦'),
('EG', 'مصر', 'Egypt', '🇪🇬'),
('AE', 'الإمارات', 'UAE', '🇦🇪'),
('KW', 'الكويت', 'Kuwait', '🇰🇼'),
('QA', 'قطر', 'Qatar', '🇶🇦'),
('BH', 'البحرين', 'Bahrain', '🇧🇭'),
('OM', 'عُمان', 'Oman', '🇴🇲'),
('JO', 'الأردن', 'Jordan', '🇯🇴'),
('LB', 'لبنان', 'Lebanon', '🇱🇧'),
('SY', 'سوريا', 'Syria', '🇸🇾'),
('IQ', 'العراق', 'Iraq', '🇮🇶'),
('PS', 'فلسطين', 'Palestine', '🇵🇸'),
('YE', 'اليمن', 'Yemen', '🇾🇪'),
('LY', 'ليبيا', 'Libya', '🇱🇾'),
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
('IN', 'الهند', 'India', '🇮🇳'),
('CN', 'الصين', 'China', '🇨🇳'),
('JP', 'اليابان', 'Japan', '🇯🇵'),
('KR', 'كوريا الجنوبية', 'South Korea', '🇰🇷');

-- مستخدم تجريبي
INSERT OR IGNORE INTO users (id, email, username, password_hash, display_name, bio, country, language) VALUES
(1, 'demo@dueli.com', 'demo', 'demo123hash', 'مستخدم تجريبي', 'حساب تجريبي لاختبار المنصة', 'SA', 'ar');
