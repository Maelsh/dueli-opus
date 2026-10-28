/**
 * UNIT35 / I-01 — invite compatibility display (no NaN, unavailable when invalid).
 */
import { describe, expect, it } from 'vitest';
import { formatInviteCompatibilityPercent } from '../../src/lib/inviteCompatibility';
import { ar } from '../../src/i18n/ar';
import { en } from '../../src/i18n/en';

describe('UNIT35 invite compatibility', () => {
    it('maps valid scores to 0–100% labels', () => {
        expect(formatInviteCompatibilityPercent(72, 'en').label).toBe('72%');
        expect(formatInviteCompatibilityPercent(0, 'en').percent).toBe(0);
    });

    it('returns translated unavailable for missing or non-numeric scores', () => {
        expect(formatInviteCompatibilityPercent(null, 'en').label).toBe(
            en.matchmaking.compatibility_unavailable
        );
        expect(formatInviteCompatibilityPercent(undefined, 'ar').label).toBe(
            ar.matchmaking.compatibility_unavailable
        );
        expect(formatInviteCompatibilityPercent('nope', 'en').percent).toBeNull();
        expect(formatInviteCompatibilityPercent(Number.NaN, 'en').percent).toBeNull();
    });
});
