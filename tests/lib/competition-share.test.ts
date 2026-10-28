import { describe, expect, it } from 'vitest';
import {
    buildCompetitionPublicUrl,
    buildCompetitionShareCopy,
    buildPlatformShareHref,
    resolveShareWinnerName,
} from '../../src/lib/competitionShare';

describe('UNIT35.1 competition share copy', () => {
    const base = {
        id: 42,
        title: 'Final Debate',
        creator_id: 1,
        opponent_id: 2,
        creator_name: 'Alice',
        opponent_name: 'Bob',
    };

    it('builds bilingual text with public URL and no winner for live status', () => {
        const en = buildCompetitionShareCopy({ ...base, status: 'live' }, 'en', 'https://example.com');
        expect(en.url).toBe('https://example.com/competition/42?lang=en');
        expect(en.text).toContain('Alice vs Bob');
        expect(en.text).not.toMatch(/Winner:/);

        const ar = buildCompetitionShareCopy({ ...base, status: 'live' }, 'ar', 'https://example.com');
        expect(ar.text).toContain('Alice ضد Bob');
        expect(ar.text).not.toContain('الفائز');
    });

    it('includes winner only for completed competitions with winner_id', () => {
        const withWinner = buildCompetitionShareCopy(
            { ...base, status: 'completed', winner_id: 2 },
            'en',
            'https://example.com',
        );
        expect(withWinner.text).toContain('Winner: Bob');
        expect(resolveShareWinnerName({ ...base, status: 'completed', winner_id: 2 }, 'en')).toBe('Bob');

        const noWinner = buildCompetitionShareCopy({ ...base, status: 'completed', winner_id: null }, 'en', 'https://example.com');
        expect(noWinner.text).not.toMatch(/Winner:/);

        const pendingWithWinnerId = buildCompetitionShareCopy(
            { ...base, status: 'pending', winner_id: 2 },
            'en',
            'https://example.com',
        );
        expect(pendingWithWinnerId.text).not.toMatch(/Winner:/);
    });

    it('uses only public competition URL fields (no session or token query params)', () => {
        const copy = buildCompetitionShareCopy({ ...base, status: 'live' }, 'en', 'https://example.com');
        expect(copy.url).not.toMatch(/token=|sessionId=|password=/i);
        expect(copy.text).not.toMatch(/Bearer\s|sessionId=/i);
    });

    it('builds official platform share links with encoded text and URL', () => {
        const copy = buildCompetitionShareCopy({ ...base, status: 'live' }, 'en', 'https://example.com');
        expect(buildPlatformShareHref('whatsapp', copy)).toContain(encodeURIComponent(copy.text));
        expect(buildPlatformShareHref('facebook', copy)).toContain(encodeURIComponent(copy.url));
        expect(buildCompetitionPublicUrl(7, 'ar', 'https://example.com/')).toBe('https://example.com/competition/7?lang=ar');
    });
});
