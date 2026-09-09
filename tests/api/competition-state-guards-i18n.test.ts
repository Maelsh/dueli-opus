import { describe, expect, it } from 'vitest';
import { t } from '../../src/i18n';

describe('B5-1 competition state-guards i18n', () => {
    it('not_eligible_to_start ar/en', () => {
        expect(t('competition_errors.not_eligible_to_start', 'ar')).toBe('لا يمكن بدء المنافسة في حالتها الحالية');
        expect(t('competition_errors.not_eligible_to_start', 'en')).toBe('Competition cannot be started in its current state');
    });
    it('not_live ar/en', () => {
        expect(t('competition_errors.not_live', 'ar')).toBe('المنافسة ليست جارية');
        expect(t('competition_errors.not_live', 'en')).toBe('Competition is not live');
    });
    it('already_completed ar/en', () => {
        expect(t('competition_errors.already_completed', 'ar')).toBe('المنافسة منتهية بالفعل');
        expect(t('competition_errors.already_completed', 'en')).toBe('Competition is already completed');
    });
});
