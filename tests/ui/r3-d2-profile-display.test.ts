/**
 * R3-D2 — Profile display contract (ar/en + RTL/LTR).
 *
 * - i18n keys exist in both locales and differ (no hardcoded visible text).
 * - The profile page renders the Profile block: a contested Profile shows
 *   the value + participation count; a fresh user sees the translated
 *   "no competitions yet" state (never a division-by-zero, never NaN).
 * - Markup carries the translated aria-label and stays inside the
 *   dark-mode/RTL-aware hero (no layout/dir change).
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import app from '../../src/main';
import { UserModel, CompetitionModel } from '../../src/models';
import { FollowModel } from '../../src/models/FollowModel';
import { UserSignalsModel } from '../../src/models/UserSignalsModel';
import { FakeD1 } from '../helpers/fake-d1';
import { translations } from '../../src/i18n';

const env = (db: FakeD1) => ({ DB: db }) as never;

describe('R3-D2 profile display i18n', () => {
    it('profile keys exist in ar+en and differ', () => {
        for (const key of ['profile_score', 'profile_hint', 'profile_empty', 'profile_participations'] as const) {
            const ar = translations.ar[key];
            const en = translations.en[key];
            expect(ar, key).toBeTruthy();
            expect(en, key).toBeTruthy();
            expect(ar, key).not.toBe(en);
        }
        expect(translations.ar.profile_empty).toBe('لا توجد منافسات بعد');
        expect(translations.en.profile_empty).toBe('No competitions yet');
    });
});

describe('R3-D2 profile page Profile block', () => {
    let db: FakeD1;

    beforeEach(async () => {
        db = new FakeD1();
        const users = new UserModel(db as unknown as D1Database);
        await users.create({
            email: 'duelist@test.com',
            username: 'duelist',
            display_name: 'Duelist',
            bio: 'Fighter',
            country: 'SA',
            language: 'ar',
        });
        vi.spyOn(CompetitionModel.prototype, 'findByUser').mockResolvedValue([]);
        vi.spyOn(FollowModel.prototype, 'getFollowersCount').mockResolvedValue(0 as never);
        vi.spyOn(FollowModel.prototype, 'getFollowingCount').mockResolvedValue(0 as never);
    });

    afterEach(() => vi.restoreAllMocks());

    it.each(['ar', 'en'] as const)('fresh user sees the translated empty state (%s)', async (lang) => {
        vi.spyOn(UserSignalsModel.prototype, 'getProfile').mockResolvedValue({
            userId: 1, starsSum: 0, competitions: 0, profile: null,
        });
        const res = await app.request(`/profile/duelist?lang=${lang}`, {}, env(db));
        expect(res.status).toBe(200);
        const html = await res.text();
        expect(html).toContain(translations[lang].profile_empty);
        expect(html).toContain(translations[lang].profile_score);
        expect(html).toContain('aria-label');
        // RTL/LTR shell preserved.
        expect(html).toContain(lang === 'ar' ? 'dir="rtl"' : 'dir="ltr"');
    });

    it.each(['ar', 'en'] as const)('contested Profile renders value + count, never clamped (%s)', async (lang) => {
        vi.spyOn(UserSignalsModel.prototype, 'getProfile').mockResolvedValue({
            userId: 1, starsSum: 60, competitions: 2, profile: 30,
        });
        const res = await app.request(`/profile/duelist?lang=${lang}`, {}, env(db));
        expect(res.status).toBe(200);
        const html = await res.text();
        // 30.0 may exceed 5 — rendered as-is, never "5/5".
        expect(html).toContain('30.0');
        expect(html).not.toContain('NaN');
        expect(html).toContain(translations[lang].profile_hint);
    });
});
