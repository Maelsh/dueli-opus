import { describe, it, expect } from 'vitest';
import {
    I18N_FONT_SCALE_MIN,
    I18N_FONT_SCALE_MAX,
    computeI18nFontScale,
    clampI18nFontScale,
    estimateTextWidthUnits,
} from '../../src/lib/i18nAutoFit';

describe('UNIT35.2 i18nAutoFit', () => {
    it('keeps English at scale 1', () => {
        expect(computeI18nFontScale('Load more', 'Load more', 'en')).toBe(1);
    });

    it('scales down longer Arabic labels relative to English baseline', () => {
        const en = 'Load more';
        const ar = 'تحميل المزيد من النتائج الطويلة';
        const scale = computeI18nFontScale(en, ar, 'ar');
        expect(scale).toBeLessThan(1);
        expect(scale).toBeGreaterThanOrEqual(I18N_FONT_SCALE_MIN);
    });

    it('clamps scale to readable bounds', () => {
        expect(clampI18nFontScale(0.2)).toBe(I18N_FONT_SCALE_MIN);
        expect(clampI18nFontScale(1.4)).toBe(I18N_FONT_SCALE_MAX);
    });

    it('applies per-language width factors for the same Latin sample', () => {
        const sample = 'abcdef';
        expect(estimateTextWidthUnits(sample, 'ar')).toBeLessThan(estimateTextWidthUnits(sample, 'en'));
    });
});
