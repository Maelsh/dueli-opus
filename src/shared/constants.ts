
// ── Canonical Dueli primary gradient (B4) ────────────────────────────────
// Extracted verbatim from the components already approved on main
// (create/competition CTAs, header primary actions). It is NOT a new design:
// it is the existing `from-purple-600 to-indigo-600` treatment, centralised so
// pages stop falling back to a flat `bg-purple-600`.
export const DUELI_PRIMARY_GRADIENT = 'bg-gradient-to-r from-purple-600 to-indigo-600';
export const DUELI_PRIMARY_GRADIENT_HOVER = 'hover:from-purple-700 hover:to-indigo-700';

// ── Shared UI gradients ────────────────────────────────────────────────────
// Aliases over the canonical treatment so auth CTAs and the custom confirm
// modal cannot drift from the approved gradient. Card overlays use a black
// scrim instead and are untouched.
export const DUELI_AUTH_GRADIENT = DUELI_PRIMARY_GRADIENT;
export const DUELI_MODAL_GRADIENT = 'bg-gradient-to-r from-purple-600 to-blue-600';
export const DUELI_MODAL_GRADIENT_HOVER = 'hover:from-purple-700 hover:to-blue-700';

// Full-bleed page hero (profile header). Owner acceptance (post-#71): the
// previous two-stop `from-purple-600 to-indigo-600` read as one flat purple
// field on the large hero surface. This stays inside the Dueli violet /
// purple / indigo family (no blue banner, no rainbow) but carries a real
// luminance transition — deep violet, vivid purple, luminous indigo — so the
// blend is perceptible across the surface. Depth blobs are layered on top in
// the page markup (see DUELI_HERO_DECOR).
export const DUELI_HERO_GRADIENT = 'bg-gradient-to-br from-violet-800 via-purple-600 to-indigo-500';

// Depth overlay for the hero: two soft analogous glows (fuchsia/indigo at low
// opacity) plus a faint white texture. Pure Tailwind — no inline style, so the
// nonce-only CSP model is untouched. Rendered as the first children of the
// hero container, which must be `relative overflow-hidden`.
export const DUELI_HERO_DECOR = `
    <div class="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div class="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-fuchsia-400/20 blur-3xl"></div>
        <div class="absolute -bottom-32 -right-16 w-[28rem] h-[28rem] rounded-full bg-indigo-300/20 blur-3xl"></div>
        <div class="absolute inset-0 bg-white/[0.04]"></div>
    </div>`;

// Full class set for a primary action (button/link).
export const DUELI_PRIMARY_BTN = `${DUELI_PRIMARY_GRADIENT} text-white rounded-full font-bold shadow-lg shadow-purple-500/20`;

// Tab styling that uses the same canonical gradient for its active state.
export const DUELI_TAB_ACTIVE = DUELI_PRIMARY_GRADIENT;
export const DUELI_TAB_INACTIVE = 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800';

// ── Canonical product-language tokens (owner coherence pass) ───────────────
// One card / input / section treatment reused by earnings, reports, donate and
// the auth-state panels — the radius / shadow / border / dark-mode contract in
// one place instead of a slightly different literal per page. Accent colour
// stays semantic per surface (emerald wallet, orange report, pink donate):
// these tokens carry NO colour, only shape and elevation.
export const DUELI_CARD = 'bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-lg border border-gray-100 dark:border-gray-800';
export const DUELI_CARD_FLAT = 'bg-white dark:bg-[#1a1a1a] rounded-2xl p-6 shadow-lg';
export const DUELI_INPUT = 'w-full px-4 py-3 border border-gray-200 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-[#111] text-gray-900 dark:text-white focus:ring-2 focus:ring-purple-500 outline-none transition';
export const DUELI_SECTION_TITLE = 'text-lg font-bold text-gray-900 dark:text-white mb-4';

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
