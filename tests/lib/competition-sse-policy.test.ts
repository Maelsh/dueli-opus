import { describe, expect, it } from 'vitest';
import { isCompetitionLiveSseAllowed } from '../../src/lib/competitionSsePolicy';

describe('competition SSE policy (PR149 stop-the-line)', () => {
    it('allows SSE only while the competition room can still change', () => {
        expect(isCompetitionLiveSseAllowed('live')).toBe(true);
        expect(isCompetitionLiveSseAllowed('accepted')).toBe(true);
        expect(isCompetitionLiveSseAllowed('pending')).toBe(true);
        expect(isCompetitionLiveSseAllowed(undefined)).toBe(true);
    });

    it('blocks SSE for terminal competitions', () => {
        expect(isCompetitionLiveSseAllowed('completed')).toBe(false);
        expect(isCompetitionLiveSseAllowed('cancelled')).toBe(false);
        expect(isCompetitionLiveSseAllowed('archived')).toBe(false);
    });
});
