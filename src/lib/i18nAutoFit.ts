/**
 * English-baseline proportional font scaling for constrained UI labels.
 * UNIT 35.2 — compares localized copy width to the English reference.
 */

export const I18N_FONT_SCALE_MIN = 0.74;
export const I18N_FONT_SCALE_MAX = 1;

const LANG_WIDTH_FACTOR: Record<string, number> = {
    en: 1,
    ar: 0.92,
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
        else if (/[\u0600-\u06FF]/.test(ch)) units += 0.85 * factor;
        else if (/[A-Za-z]/.test(ch)) units += 0.55 * factor;
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
 */
export function computeI18nFontScale(enText: string, localizedText: string, lang: string): number {
    if (!enText || !localizedText || lang === 'en') return 1;
    const enW = estimateTextWidthUnits(enText, 'en');
    const locW = estimateTextWidthUnits(localizedText, lang);
    if (locW <= enW || enW <= 0) return 1;
    return clampI18nFontScale(enW / locW);
}
