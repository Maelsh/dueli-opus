/**
 * UNIT35 / R4-UX-I18N-1 — static contracts (VIS-04 stack, header help, mojibake).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getNavigation } from '../../src/shared/components/navigation';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

describe('UNIT35 UX/I18N static contracts', () => {
    it('VIS-04: toast stacks above invite hover card and overlay', () => {
        const css = readSrc('src/styles.css');
        expect(css).toMatch(/\.invite-panel-overlay[\s\S]*z-index:\s*9000/);
        expect(css).toMatch(/\.invite-hover-card[\s\S]*z-index:\s*9100/);
        expect(css).toMatch(/\.toast[\s\S]*z-index:\s*9200/);
    });

    it('InvitePanel removes mojibake separators (uses icons / middle dot)', () => {
        const src = readSrc('src/client/ui/InvitePanel.ts');
        expect(src).not.toMatch(/آ·|â­|ًں/);
        expect(src).toContain('formatInviteCompatibilityPercent');
    });

    it('header Help is guest-only (account menu for members)', () => {
        const auth = readSrc('src/client/services/AuthService.ts');
        expect(auth).toContain("helpIcon.classList.add('auth-hidden')");
        const nav = getNavigation('en');
        expect(nav).toContain('id="helpIcon"');
        expect(nav).toContain('guests only');
    });

    it('navigation keeps notifications dropdown within small viewports', () => {
        const css = readSrc('src/styles.css');
        expect(css).toContain('#notificationsDropdown');
        expect(css).toContain('calc(100vw - 1rem)');
    });

    it('embedded player controls use logical time layout classes', () => {
        const page = readSrc('src/modules/pages/competition-page.ts');
        expect(page).toContain('embedded-vod-controls-inner');
        expect(page).toContain('embedded-time-display');
        expect(page).toContain('syncReminderButton');
    });
});
