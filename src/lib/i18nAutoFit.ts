/**
 * English-baseline proportional font scaling for constrained UI labels.
 * UNIT 35.2 — compares localized copy width to the English reference.
 * UNIT 42.1 — width heuristics for all 15 global languages:
 *   Latin/Cyrillic ≈ Inter metrics, Perso-Arabic ≈ Cairo/Naskh metrics,
 *   CJK glyphs ≈ 1em squares, Devanagari ≈ moderate width.
 */

export const I18N_FONT_SCALE_MIN = 0.74;
export const I18N_FONT_SCALE_MAX = 1;

/**
 * UNIT 42.1 — minor-expansion tolerance before any shrinking kicks in.
 * W3C i18n guidance: containers are designed to absorb ~150% text expansion
 * (Spanish/French/German copy commonly inflates 30–50% vs the EN baseline).
 * Copy within this envelope keeps scale 1; only copy wider than
 * `enWidth × I18N_EXPANSION_TOLERANCE` is scaled down.
 */
export const I18N_EXPANSION_TOLERANCE = 1.6;

const LANG_WIDTH_FACTOR: Record<string, number> = {
    en: 1,
    ar: 0.92,
    // UNIT 42.1 — per-language average glyph width relative to Inter
    es: 1,
    fr: 1,
    de: 1,
    pt: 1,
    ru: 1.05, // Cyrillic glyphs are slightly wider than Latin
    zh: 1, // CJK glyphs measured by the dedicated CJK branch (≈1em each)
    ja: 1,
    ko: 1,
    tr: 1,
    hi: 0.8, // Devanagari with connecting shirorekha, moderately wide
    id: 1,
    fa: 0.92, // Perso-Arabic script family (Naskh)
    ur: 1.05, // Nastaliq runs wide and flowing
};

function widthFactor(lang: string): number {
    return LANG_WIDTH_FACTOR[lang] ?? 1;
}

/** Heuristic width units (canvas-free; stable in unit tests). */
export function estimateTextWidthUnits(text: string, lang: string): number {
    if (!text) return 0;
    const factor = widthFactor(lang);
    let units = 0;
    for (const ch of text) {
        if (ch === ' ') units += 0.35;
        else if (/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(ch)) units += 0.85 * factor;
        else if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(ch)) units += 1; // Hanzi: full-width square
        else if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(ch)) units += 1; // Kana: full-width square
        else if (/[\uAC00-\uD7AF\u1100-\u11FF]/.test(ch)) units += 0.95; // Hangul syllables
        else if (/[\u0900-\u097F]/.test(ch)) units += 0.7 * factor; // Devanagari
        else if (/[A-Za-z]/.test(ch)) units += 0.55 * factor;
        else if (/[\u0400-\u04FF]/.test(ch)) units += 0.6 * factor; // Cyrillic
        else units += 0.65 * factor;
    }
    return units;
}

export function clampI18nFontScale(scale: number): number {
    if (!Number.isFinite(scale)) return 1;
    return Math.max(I18N_FONT_SCALE_MIN, Math.min(I18N_FONT_SCALE_MAX, scale));
}

/**
 * Scale down localized text when it is wider than the English baseline string.
 * UNIT 42.1: language-aware for all 15 global languages.
 */
export function computeI18nFontScale(enText: string, localizedText: string, lang: string): number {
    if (!enText || !localizedText || lang === 'en') return 1;
    const enW = estimateTextWidthUnits(enText, 'en');
    const locW = estimateTextWidthUnits(localizedText, lang);
    if (locW <= enW * I18N_EXPANSION_TOLERANCE || enW <= 0) return 1;
    return clampI18nFontScale(enW / locW);
}
