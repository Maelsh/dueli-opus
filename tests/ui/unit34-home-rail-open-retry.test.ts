/**
 * UNIT34-C — bounded client retry on rail open (no infinite loop).
 */
import { describe, expect, it, vi } from 'vitest';
import { HomePage } from '../../src/client/pages/HomePage';

describe('UNIT34-C home rail open backoff', () => {
    it('attempts openRailOnce at most RAIL_OPEN_MAX_ATTEMPTS times', async () => {
        const spy = vi.spyOn(HomePage as any, 'openRailOnce').mockResolvedValue(null);
        const def = {
            key: 'k',
            kind: 'suggested' as const,
            title: 't',
            icon: 'i',
            color: '#000',
            category: '',
            subcategory: '',
            status: 'live' as const,
        };
        const result = await HomePage.openRail(def);
        expect(result).toBeNull();
        expect(spy).toHaveBeenCalledTimes(HomePage.RAIL_OPEN_MAX_ATTEMPTS);
        spy.mockRestore();
    });
});
