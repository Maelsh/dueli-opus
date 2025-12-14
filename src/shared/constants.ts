
// Main category colors (from database)
export const CATEGORY_COLORS: Record<string, string> = {
    'dialogue': '#08771a',  // Green (as updated in seed.sql)
    'science': '#06B6D4',   // Cyan
    'talents': '#F59E0B',   // Orange/Amber
};

// Main category icons
export const CATEGORY_ICONS: Record<string, string> = {
    'dialogue': 'fas fa-comments',
    'science': 'fas fa-flask',
    'talents': 'fas fa-star',
};

export const SUBCATEGORY_COLORS: Record<string, string> = {
    // Dialogue (matching seed.sql)
    'religions': '#F97316',
    'sects': '#A855F7',
    'politics': '#EF4444',
    'economics': '#10B981',
    'ethnic-conflicts': '#70863d',  // Fixed: was #EA580C
    'local-events': '#2563EB',
    'global-events': '#6b200d',     // Fixed: was #4F46E5
    'other-disputes': '#6366F1',

    // Science (matching seed.sql)
    'physics': '#0891B2',
    'chemistry': '#9333EA',
    'math': '#CA8A04',
    'astronomy': '#312E81',
    'biology': '#16A34A',
    'technology': '#475569',
    'energy': '#e72020',            // Fixed: was #65A30D
    'economics-science': '#0D9488',
    'mixed': '#C026D3',
    'other-science': '#71717A',

    // Talents (matching seed.sql)
    'physical': '#DC2626',
    'mental': '#0284C7',
    'vocal': '#e0cd1f',             // Fixed: was #DB2777
    'poetry': '#0c7226',            // Fixed: was #E11D48
    'psychological': '#7C3AED',
    'creative': '#D97706',
    'crafts': '#78350F',
    'other-talents': '#525252'
};

export const SUBCATEGORY_ORDER = [
    // Dialogue
    'religions', 'sects', 'politics', 'economics', 'ethnic-conflicts', 'local-events', 'global-events', 'other-disputes',
    // Science
    'physics', 'chemistry', 'math', 'astronomy', 'biology', 'technology', 'energy', 'economics-science', 'mixed', 'other-science',
    // Talents
    'physical', 'mental', 'vocal', 'poetry', 'psychological', 'creative', 'crafts', 'other-talents'
];

// Mapping of main categories to their subcategories
export const CATEGORY_SUBCATEGORIES: Record<string, string[]> = {
    'dialogue': ['religions', 'sects', 'politics', 'economics', 'ethnic-conflicts', 'local-events', 'global-events', 'other-disputes'],
    'science': ['physics', 'chemistry', 'math', 'astronomy', 'biology', 'technology', 'energy', 'economics-science', 'mixed', 'other-science'],
    'talents': ['physical', 'mental', 'vocal', 'poetry', 'psychological', 'creative', 'crafts', 'other-talents']
};

// Subcategory icons (matching database)
export const SUBCATEGORY_ICONS: Record<string, string> = {
    // Dialogue
    'religions': 'fas fa-pray',
    'sects': 'fas fa-book',
    'politics': 'fas fa-landmark',
    'economics': 'fas fa-chart-line',
    'ethnic-conflicts': 'fas fa-users',
    'local-events': 'fas fa-map-marker-alt',
    'global-events': 'fas fa-globe',
    'other-disputes': 'fas fa-balance-scale',
    // Science
    'physics': 'fas fa-atom',
    'chemistry': 'fas fa-vial',
    'math': 'fas fa-calculator',
    'astronomy': 'fas fa-star',
    'biology': 'fas fa-dna',
    'technology': 'fas fa-microchip',
    'energy': 'fas fa-bolt',
    'economics-science': 'fas fa-chart-pie',
    'mixed': 'fas fa-layer-group',
    'other-science': 'fas fa-flask',
    // Talents
    'physical': 'fas fa-running',
    'mental': 'fas fa-brain',
    'vocal': 'fas fa-microphone',
    'poetry': 'fas fa-feather-alt',
    'psychological': 'fas fa-heart',
    'creative': 'fas fa-lightbulb',
    'crafts': 'fas fa-tools',
    'other-talents': 'fas fa-star'
};
