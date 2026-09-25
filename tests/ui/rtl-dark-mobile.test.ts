/**
 * B15 — RTL / Dark / Mobile polish (RED-first).
 *
 * يثبت سلوك الواجهة الموجود فعلياً بدل إعادة تصميمها:
 * 1. العربية تنتج dir="rtl" والإنجليزية dir="ltr".
 * 2. الوضع الداكن يطبق حالة dark الصحيحة (CSS + ThemeService).
 * 3. القواعد الـresponsive المطلوبة موجودة (لا overflow أفقي مقصود).
 *
 * يعمل على Node فقط: يفحص HTML المولّد server-side ومصدر CSS،
 * بلا framework جديد وبلا متصفح.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getDir, isRTL, t } from '../../src/i18n';
import { generateHTML } from '../../src/shared/templates/layout';
import { getNavigation } from '../../src/shared/components/navigation';
import { getCompetitionCard } from '../../src/shared/components/competition-card';
import { getUserCard } from '../../src/shared/components/user-card';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

function minimalCompetition() {
    return {
        id: 1,
        title: 'Test',
        creator_id: 1,
        status: 'pending',
        created_at: new Date().toISOString(),
    } as any;
}

describe('B15 RTL direction', () => {
    it('Arabic resolves to rtl, English to ltr', () => {
        expect(isRTL('ar')).toBe(true);
        expect(isRTL('en')).toBe(false);
        expect(getDir('ar')).toBe('rtl');
        expect(getDir('en')).toBe('ltr');
    });

    it('generated <html> carries dir="rtl" for ar and dir="ltr" for en', () => {
        expect(generateHTML('<p>x</p>', 'ar' as any)).toContain('<html lang="ar" dir="rtl"');
        expect(generateHTML('<p>x</p>', 'en' as any)).toContain('<html lang="en" dir="ltr"');
    });

    it('navigation mirrors dropdown anchoring per direction', () => {
        const arNav = getNavigation('ar' as any);
        const enNav = getNavigation('en' as any);
        // user menu + notification/message dropdowns anchor to the inline-end side
        expect(arNav).toContain('user-menu left-0');
        expect(enNav).toContain('user-menu right-0');
        // Country menu receives its inline-end offset at runtime from the globe
        // button; no static RTL/LTR class may push it outside the viewport.
        expect(arNav).toContain('id="countryButton"');
        expect(enNav).toContain('id="countryButton"');
        expect(arNav).toContain('id="countryMenu" class="dropdown-panel hidden w-80');
        expect(enNav).toContain('id="countryMenu" class="dropdown-panel hidden w-80');
    });

    it('competition card mirrors corner badges per direction', () => {
        const arCard = getCompetitionCard(minimalCompetition(), 'ar' as any);
        const enCard = getCompetitionCard(minimalCompetition(), 'en' as any);
        expect(arCard).toContain('top-3 left-3');
        expect(enCard).toContain('top-3 right-3');
    });

    it('user-card verified badge uses static RTL/LTR classes (Tailwind-JIT visible)', () => {
        const arCard = getUserCard({ id: 1, username: 'u', is_verified: true }, 'ar' as any);
        const enCard = getUserCard({ id: 1, username: 'u', is_verified: true }, 'en' as any);
        expect(arCard).toContain('-bottom-1 -left-1');
        expect(enCard).toContain('-bottom-1 -right-1');
        // لا فئات مبنية ديناميكياً (Tailwind لا يراها في المسح)
        const src = readSrc('src/shared/components/user-card.ts');
        expect(src).not.toMatch(/-\$\{rtl/);
    });

    it('no forbidden full-page/icon flip hacks (scaleX) in UI sources', () => {
        for (const f of [
            'src/shared/components/navigation.ts',
            'src/shared/components/user-card.ts',
            'src/shared/components/competition-card.ts',
            'src/shared/components/competition-section.ts',
            'src/modules/pages/competition-page.ts',
            'src/modules/pages/profile-page.ts',
            'src/styles.css',
        ]) {
            const src = readSrc(f);
            expect(src, `scaleX flip in ${f}`).not.toMatch(/scaleX\(-1\)|scale-x-\[-1\]/);
        }
    });

    it('directional icon margins use logical properties (me-/ms-) not physical mr-/ml-', () => {
        for (const f of [
            'src/modules/pages/competition-page.ts',
            'src/modules/pages/create-page.ts',
        ]) {
            const src = readSrc(f);
            // physical margins next to fa- icons break RTL mirroring.
            // Scope: Beta UI markup only — live-streaming internals
            // (modeBadge/VOD badge, frozen per B15) are excluded.
            const lines = src.split('\n').filter(
                l => !l.includes('modeBadge') && !l.includes('badge.innerHTML') && !l.includes('badge.classList'),
            );
            const stripped = lines.join('\n').replace(/\$\{isRTL \? 'ml-\d' : 'mr-\d'\}/g, '');
            expect(stripped, `physical icon margin in ${f}`).not.toMatch(/fa-[a-z-]+[^"']*?\sm[rl]-[12]/);
            expect(stripped, `physical icon margin (i tag) in ${f}`).not.toMatch(/<i class="fas fa-[a-z-]+ m[rl]-/);
        }
    });
});

describe('B15 dark mode', () => {
    it('ThemeService toggles the dark class on <html> and <body>', () => {
        const src = readSrc('src/client/services/ThemeService.ts');
        expect(src).toContain("classList.add('dark')");
        expect(src).toContain("classList.remove('dark')");
        expect(src).toContain('document.documentElement');
        expect(src).toContain('document.body');
    });

    it('custom CSS covers dark variants (no light-only surfaces/badges)', () => {
        const css = readSrc('src/styles.css');
        expect(css).toContain('body.dark .card');
        expect(css).toContain('body.dark .badge-live');
        expect(css).toContain('body.dark .badge-pending');
        expect(css).toContain('body.dark .user-menu');
        expect(css).toContain('body.dark .tab-inactive');
    });
});

describe('B15 i18n', () => {
    it('carousel prev/next aria-labels go through t() (ar + en)', () => {
        expect(t('previous', 'ar')).toBe('السابق');
        expect(t('next', 'ar')).toBe('التالي');
        expect(t('previous', 'en')).toBe('Previous');
        expect(t('next', 'en')).toBe('Next');
        const src = readSrc('src/shared/components/competition-section.ts');
        expect(src).toContain("t('previous', lang)");
        expect(src).toContain("t('next', lang)");
        expect(src).not.toContain("|| 'Previous'");
        expect(src).not.toContain('|| "Previous"');
        expect(src).not.toContain("|| 'Next'");
        expect(src).not.toContain('|| "Next"');
    });

    it('carousel arrows stay tappable on touch (no hover-only controls)', () => {
        const src = readSrc('src/shared/components/competition-section.ts');
        expect(src).toContain('max-sm:opacity-100');
    });
});

describe('B15 mobile / overflow guards', () => {
    it('page clips unintended horizontal overflow without breaking sticky nav', () => {
        const css = readSrc('src/styles.css');
        expect(css).toMatch(/overflow-x:\s*clip/);
    });

    it('wide dropdown panels are capped to the viewport width', () => {
        const css = readSrc('src/styles.css');
        expect(css).toMatch(/\.dropdown-panel[\s\S]*?max-width:\s*calc\(100vw - 2rem\)/);
        const nav = getNavigation('ar' as any);
        expect(nav).toContain('dropdown-panel');
    });

    it('modal and competition layout use fluid widths (no fixed desktop-only widths)', () => {
        const css = readSrc('src/styles.css');
        expect(css).toMatch(/\.modal-content[\s\S]*?width:\s*90vw/);
        expect(css).toMatch(/@media\s*\(max-width:\s*640px\)/);
    });
});
