import { describe, expect, it } from 'vitest';
import {
    ratingAverageLabel,
    shouldShowEarlyWithdrawalRatingNote,
} from '../../src/lib/competitionRatingDisplay';

const labels = {
    zeroScore: 'No score yet',
    liveAwaiting: 'Awaiting audience ratings',
    zeroCompleted: '—',
    scoreScaleHint: '',
    uniqueRaters: '',
    drawLabel: '',
    earlyWithdrawalNote: '',
};

describe('competition rating display (PR149 stop-the-line)', () => {
    it('shows early-withdrawal note when completed with zero raters', () => {
        expect(shouldShowEarlyWithdrawalRatingNote({
            status: 'completed',
            resultSource: 'SYSTEM_EARLY_END',
            uniqueRaterCount: 0,
            competitors: [],
            names: {},
            labels,
        })).toBe(true);
    });

    it('uses live awaiting copy instead of zero score during live', () => {
        expect(ratingAverageLabel('live', null, labels)).toBe('Awaiting audience ratings');
        expect(ratingAverageLabel('completed', null, labels)).toBe('—');
    });
});
