/**
 * R3-C1 — contextual help + FAQ/role guides + accessibility/i18n.
 *
 * Pins (ar/en, static contract):
 * - GET /help + /faq serve the same helpPage; every #anchor referenced
 *   from contextual "Learn more" links exists as an id on the help page.
 * - All new user-facing strings live in tr.help_guide (ar/en, ar≠en);
 *   no forbidden promises (Inbox/KYC guarantees, future features,
 *   production admin setup claims).
 * - Entry points: nav help icon for everyone, user-menu + footer links,
 *   404 help link; Modal.showHelp routes instead of alert()ing a
 *   missing key.
 * - Touched-surface a11y: zoomable viewport, skip link target, toast
 *   live region, associated form labels, dialog semantics + Escape,
 *   accessible names on icon-only controls, stars radiogroup.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ar } from '../../src/i18n/ar';
import { en } from '../../src/i18n/en';

const SRC = (p: string) => readFileSync(resolve(__dirname, '../../src', p), 'utf-8');

const HELP = SRC('modules/pages/help-page.ts');
const MAIN = SRC('main.ts');
const NAV = SRC('shared/components/navigation.ts');
const FOOTER = SRC('shared/components/footer.ts');
const LAYOUT = SRC('shared/templates/layout.ts');
const MODAL = SRC('client/ui/Modal.ts');
const TOAST = SRC('client/ui/Toast.ts');
const LOGIN_MODAL = SRC('shared/components/login-modal.ts');
const AUTH_SVC = SRC('client/services/AuthService.ts');
const SETTINGS = SRC('client/ui/SettingsUI.ts');
const SCHEDULE = SRC('client/ui/ScheduleUI.ts');
const REPORT = SRC('client/ui/InteractionsUI.ts');
const INVITE = SRC('client/ui/InvitePanel.ts');
const CAROUSEL = SRC('client/ui/RecommendationCarousel.ts');
const CREATE = SRC('modules/pages/create-page.ts');
const COMP = SRC('modules/pages/competition-page.ts');
const LIVE_ROOM = SRC('modules/pages/live-room-page.ts');
const HOST = SRC('modules/pages/live/views/host.ts');
const GUEST = SRC('modules/pages/live/views/guest.ts');
const VIEWER = SRC('modules/pages/live/views/viewer.ts');
const EARNINGS = SRC('modules/pages/earnings-page.ts');
const DONATE = SRC('modules/pages/donate-page.ts');
const MESSAGES = SRC('modules/pages/messages-page.ts');

function leaves(obj: any, prefix = ''): Array<[string, unknown]> {
    return Object.entries(obj ?? {}).flatMap(([k, v]) =>
        v !== null && typeof v === 'object' && !Array.isArray(v)
            ? leaves(v, prefix ? `${prefix}.${k}` : k)
            : [[prefix ? `${prefix}.${k}` : k, v]],
    );
}

describe('R3-C1 help page + routes', () => {
    it('1. /help and /faq serve helpPage; page exported from the index', () => {
        expect(MAIN).toContain("app.get('/help', helpPage)");
        expect(MAIN).toContain("app.get('/faq', helpPage)");
        expect(MAIN).toContain('helpPage');
        expect(SRC('modules/pages/index.ts')).toContain('helpPage');
    });

    it('2. help page has overview + 3 role guides + topics + FAQ + access sections', () => {
        // Static ids plus ids passed to the roleCard()/topic() builders
        // (nested-template interpolation is resolved at runtime).
        const ids = new Set<string>();
        for (const m of HELP.matchAll(/id="([a-z-]+)"/g)) ids.add(m[1]);
        for (const m of HELP.matchAll(/(?:roleCard|topic)\('([a-z-]+)'/g)) ids.add(m[1]);
        for (const id of [
            'overview', 'roles', 'role-creator', 'role-opponent', 'role-viewer',
            'topics', 'topic-create', 'topic-invite', 'topic-live', 'topic-recording',
            'topic-ratings', 'topic-reactions', 'topic-comments', 'topic-discover',
            'topic-payout', 'topic-support', 'faq', 'access',
        ]) {
            expect(ids, `section #${id}`).toContain(id);
        }
        expect(HELP).toContain('<main id="main-content"');
        expect(HELP).toContain('<nav aria-label=');
        expect(HELP).toContain('<details');
        expect(HELP).toContain('<summary');
        expect(HELP).toContain('dark:');
    });

    it('3. every in-product help anchor resolves to a real section id', () => {
        const ids = new Set<string>();
        for (const m of HELP.matchAll(/id="([a-z-]+)"/g)) ids.add(m[1]);
        for (const m of HELP.matchAll(/(?:roleCard|topic)\('([a-z-]+)'/g)) ids.add(m[1]);
        const referring = [CREATE, COMP, LIVE_ROOM, EARNINGS, DONATE, MESSAGES, MAIN];
        const anchors = new Set<string>();
        for (const src of referring) {
            for (const m of src.matchAll(/#(topic-[a-z]+|role-[a-z]+|faq|overview|roles|topics|access)/g)) {
                anchors.add(m[1]);
            }
        }
        expect(anchors.size).toBeGreaterThan(5);
        for (const a of anchors) {
            expect(ids, `anchor #${a}`).toContain(a);
        }
    });

    it('4. help links point only at routes that exist in main.ts', () => {
        const hrefs = new Set<string>();
        for (const src of [HELP, CREATE, COMP, LIVE_ROOM, EARNINGS, DONATE, MESSAGES]) {
            for (const m of src.matchAll(/href="(\/[a-z?=-]+)(?:\?lang=)?"/g)) hrefs.add(m[1]);
        }
        const allowed = [
            '/', '/about', '/help', '/faq', '/verify', '/competition', '/create',
            '/explore', '/profile', '/messages', '/notifications', '/settings',
            '/my-competitions', '/my-requests', '/live', '/earnings', '/reports',
            '/donate', '/transparency', '/advertiser', '/admin', '/complaints',
        ];
        for (const h of hrefs) {
            const base = h.split('?')[0].replace(/\/:\w+|\/\d+$/, '');
            expect(allowed.some((r) => base === r || base.startsWith(`${r}/`)), `href ${h}`).toBe(true);
        }
    });

    it('5. no forbidden promises in help content', () => {
        for (const s of ['Inbox', 'KYC', 'guarantee', 'licensed bank', '24/7 support']) {
            expect(HELP).not.toContain(s);
        }
    });
});

describe('R3-C1 entry points', () => {
    it('6. nav help icon goes to /help and is visible to everyone', () => {
        expect(NAV).toContain('href="/help?lang=${lang}"');
        expect(NAV).toContain('id="helpIcon"');
        expect(NAV).not.toMatch(/id="helpIcon"[^>]*auth-hidden/);
        expect(NAV).toContain('aria-label="${tr.help');
        expect(NAV).toContain('href="/help?lang=${lang}" class="user-menu-item"');
        expect(AUTH_SVC).not.toContain("helpIcon) helpIcon.classList.add('auth-hidden')");
    });

    it('7. footer + 404 link to help', () => {
        expect(FOOTER).toContain('/help?lang=${lang}');
        expect(FOOTER).toContain('/messages?tab=admin');
        expect(FOOTER).toContain('<nav aria-label=');
        expect(MAIN).toContain('/help?lang=${lang}');
    });

    it('8. Modal.showHelp routes to /help instead of alerting a missing key', () => {
        expect(MODAL).toContain('/help?lang=');
        expect(MODAL).not.toContain('alert(');
        expect(MODAL).not.toContain('client.help.content');
    });
});

describe('R3-C1 i18n parity (ar/en)', () => {
    it('9. every help_guide leaf exists in both languages and differs', () => {
        const a = new Map(leaves((ar as any).help_guide));
        const e = new Map(leaves((en as any).help_guide));
        expect(a.size).toBeGreaterThan(50);
        expect(e.size).toBe(a.size);
        for (const [k, av] of a) {
            expect(e.has(k), `en.help_guide.${k}`).toBe(true);
            expect(av, `ar.help_guide.${k}`).toBeTruthy();
            expect(e.get(k), `en.help_guide.${k}`).toBeTruthy();
            expect(String(av)).not.toBe(String(e.get(k)));
        }
        expect((ar as any).skip_to_content).toBeTruthy();
        expect((en as any).skip_to_content).toBeTruthy();
        expect((ar as any).skip_to_content).not.toBe((en as any).skip_to_content);
    });

    it('10. contextual links reuse the shared learn_more key (no hardcoded label)', () => {
        for (const [name, src] of [
            ['create', CREATE], ['competition', COMP], ['live-room', LIVE_ROOM],
            ['earnings', EARNINGS], ['donate', DONATE], ['messages', MESSAGES],
        ] as const) {
            expect(src, `${name} learn_more`).toMatch(/help_guide.+learn_more|learn_more.+\|\| 'Learn more'/);
        }
    });
});

describe('R3-C1 accessibility on touched surfaces', () => {
    it('11. viewport allows pinch zoom; skip link targets a real main', () => {
        expect(LAYOUT).toContain('name="viewport"');
        expect(LAYOUT).not.toContain('maximum-scale');
        expect(LAYOUT).not.toContain('user-scalable=no');
        expect(LAYOUT).toContain('href="#main-content"');
        expect(HELP).toContain('id="main-content"');
        expect(MAIN).toContain('id="main-content"');
    });

    it('12. toast is announced; form errors use role=alert', () => {
        expect(TOAST).toContain(`'role', 'status'`);
        expect(TOAST).toContain(`'aria-live', 'polite'`);
        expect(LOGIN_MODAL).toContain('role="alert"');
        expect(EARNINGS).toContain('id="withdrawError" role="alert"');
    });

    it('13. labels are programmatically associated', () => {
        for (const id of ['loginEmail', 'loginPassword', 'resetEmail', 'resetCode', 'newPassword', 'registerName', 'registerEmail', 'registerPassword']) {
            expect(LOGIN_MODAL, `login label ${id}`).toContain(`for="${id}"`);
        }
        for (const id of ['setting-language', 'setting-country', 'setting-privacy']) {
            expect(SETTINGS, `settings label ${id}`).toContain(`for="${id}"`);
        }
        for (const id of ['report-reason', 'report-description']) {
            expect(REPORT, `report label ${id}`).toContain(`for="${id}"`);
        }
        for (const id of ['createTitle', 'createCategory', 'subcategorySelect', 'createDescription', 'createRules', 'createScheduled']) {
            expect(CREATE, `create label ${id}`).toContain(`for="${id}"`);
        }
        for (const id of ['withdrawAmount', 'withdrawMethod', 'withdrawDetails']) {
            expect(EARNINGS, `withdraw label ${id}`).toContain(`for="${id}"`);
        }
        expect(INVITE).toContain('aria-label="${t(\'matchmaking.search_users\'');
    });

    it('14. custom dialogs expose dialog semantics, labelled close, and Escape', () => {
        for (const [name, src] of [['settings', SETTINGS], ['schedule', SCHEDULE], ['report', REPORT]] as const) {
            expect(src, `${name} role`).toContain(`'role', 'dialog'`);
            expect(src, `${name} modal`).toContain(`'aria-modal', 'true'`);
            expect(src, `${name} escape`).toContain("'Escape'");
        }
        expect(INVITE).toContain('role="dialog"');
        expect(INVITE).toContain('aria-modal="true"');
    });

    it('15. icon-only controls carry accessible names', () => {
        for (const id of ['fullscreenBtn', 'screenBtn', 'cameraBtn', 'switchCamBtn', 'micBtn', 'speakerBtn', 'hideLocalBtn', 'connectBtn', 'reconnectBtn', 'disconnectBtn']) {
            expect(HOST, `host ${id}`).toContain(`id="${id}" aria-label="`);
        }
        for (const id of ['joinBtn', 'reconnectBtn', 'disconnectBtn']) {
            expect(GUEST, `guest ${id}`).toContain(`id="${id}" aria-label="`);
        }
        expect(VIEWER).toContain('id="playPauseBtn"');
        expect(VIEWER).toContain('aria-label="Play/Pause"');
        expect(LIVE_ROOM).toContain('id="swapBtn"');
        expect(LIVE_ROOM).toContain('aria-label="${tr.swap_videos');
        expect(LIVE_ROOM).toContain('role="button" tabindex="0"');
        expect(CAROUSEL).toContain("t('previous'");
        expect(CAROUSEL).toContain("t('next'");
        expect(NAV).toContain('aria-label="${tr.login');
        // competition-page.ts renders inside an escaped nested template (\${...});
        expect(COMP).toContain('aria-label="\\${tr.report');
        expect(NAV).toContain('aria-label="${tr.login');
    });

    it('16. rating stars form a labelled radiogroup per competitor', () => {
        expect(COMP).toContain('role="radiogroup"');
        expect(COMP).toContain('role="radio"');
        expect(COMP).toContain('aria-checked="false"');
    });

    it('17. RTL/LTR + dark variants preserved on new and touched markup', () => {
        expect(NAV).toContain('dark:');
        expect(FOOTER).toContain('dark:');
        expect(CREATE).toContain('dark:');
        expect(LAYOUT).toContain('dir="${dir}"');
        expect(HELP).toContain('?lang=${lang}');
    });
});
