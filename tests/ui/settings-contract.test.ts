/**
 * R1.4 — /settings load/save/feedback must match the live settings
 * contract (P14-001 / P14-002 + dead save-feedback).
 *
 * Live contracts (read-only backend evidence, heeding the
 * SUPPLEMENT-REVIEW warning about stale API assumptions):
 *   GET /api/settings -> { success, data: { settings: {
 *     default_language, default_country, notifications_enabled (0/1),
 *     email_notifications (0/1), ... } } }          (SettingsController.getSettings)
 *   PUT /api/settings accepts default_language, default_country,
 *     notifications_enabled, email_notifications, privacy_level
 *     (SettingsController.updateSettings — `language` and
 *     `push_notifications` are IGNORED)              (pinned by
 *     tests/e2e/beta-core-path.spec.ts:139-145)
 *   The only toast API is window.dueli.showToast(message, type)
 *     (src/client/index.ts) — window.dueli.toast does not exist.
 *
 * Proven page defects (src/modules/pages/settings-page.ts):
 *   D1 load envelope: `currentSettings = data.data || {}` keeps the
 *       `{settings}` wrapper, so saved language/country/prefs never display.
 *   D1b checkbox semantics: `… !== false` is always true for the 0/1
 *       integers the API returns, so OFF prefs render checked.
 *   D1c language select reads `currentSettings.language` (API: default_language).
 *   D2 save keys: `language` / `push_notifications` are ignored by the API
 *       (API: `default_language` / `notifications_enabled`) — prefs never persist.
 *   D3 feedback: `window.dueli?.toast?.success/error` are no-ops
 *       (API: `window.dueli?.showToast(msg, type)`) — zero save feedback.
 *   D4 section title uses `tr.notification?.new_join_request`
 *       (API: `tr.settings_page?.notifications`).
 *   D5/D6 toast/labels use missing keys (`tr.settings_saved`,
 *       `tr.email_notifications`, `tr.push_notifications`) instead of the
 *       existing `tr.settings_page.*` keys.
 *
 * Node-only: source-contract assertions + evaluation of the page's OWN
 * load expression against real-shape fixtures.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from '../../src/i18n';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

const PAGE = 'src/modules/pages/settings-page.ts';

/** Real-shape fixtures (mirror SettingsController envelopes). */
const SETTINGS_ROW = {
    default_language: 'ar',
    default_country: 'EG',
    notifications_enabled: 0,
    email_notifications: 1,
    privacy_level: 'public',
};
const fullPayload = { success: true, data: { settings: SETTINGS_ROW } };
const emptyPayload = { success: true, data: {} };

/** Run the page's OWN load expression against a GET payload. */
function evalPageLoad(src: string, data: unknown): Record<string, unknown> {
    const matches = [...src.matchAll(/currentSettings = (data\.data[^;]+);/g)].map((m) => m[1]);
    expect(matches, 'page must define exactly one data-driven "currentSettings = …" load').toHaveLength(1);
    return new Function('data', `return (${matches[0]});`)(data) as Record<string, unknown>;
}

/** Extract the page's OWN save payload keys. */
function savePayloadKeys(src: string): string[] {
    const m = src.match(/const settings = \{([\s\S]*?)\};/);
    expect(m, 'page must build a "const settings = {…}" save payload').toBeTruthy();
    return [...(m as RegExpMatchArray)[1].matchAll(/^\s*([A-Za-z_]+)\s*:/gm)].map((k) => k[1]);
}

describe('R1.4 /settings contract (P14-001/P14-002)', () => {
    it('loads the settings envelope (data.data.settings), never the wrapper', () => {
        const src = readSrc(PAGE);
        expect(src).toContain('data.data?.settings');
        expect(src, 'wrapper assignment must be gone').not.toContain('currentSettings = data.data ||');
    });

    it('resolves a real GET payload to displayable prefs (incl. OFF == 0)', () => {
        const src = readSrc(PAGE);
        const loaded = evalPageLoad(src, fullPayload);
        expect(loaded.default_language).toBe('ar');
        expect(loaded.default_country).toBe('EG');
        // 0/1 integers must survive as-is so falsy OFF renders unchecked.
        expect(loaded.notifications_enabled).toBe(0);
        expect(loaded.email_notifications).toBe(1);
    });

    it('resolves an empty GET payload to {} (no throw, empty-state path)', () => {
        expect(evalPageLoad(readSrc(PAGE), emptyPayload)).toEqual({});
    });

    it('renders 0/1 pref integers with truthy checks (OFF must not render checked)', () => {
        const src = readSrc(PAGE);
        expect(src, '!== false is always true for 0/1 — must be gone').not.toContain('!== false');
    });

    it('binds the language select to default_language (the API column)', () => {
        const src = readSrc(PAGE);
        expect(src).toContain('currentSettings.default_language');
        expect(src, 'stale currentSettings.language binding must be gone').not.toContain('currentSettings.language');
    });

    it('saves exactly the API-accepted pref keys', () => {
        const keys = savePayloadKeys(readSrc(PAGE));
        for (const k of ['default_language', 'notifications_enabled']) {
            expect(keys, `save payload must include ${k}`).toContain(k);
        }
        for (const k of ['language:', 'push_notifications:']) {
            expect(
                keys.map((x) => x + ':'),
                `ignored key ${k} must not be sent as a pref`,
            ).not.toContain(k);
        }
    });
});

describe('R1.4 /settings save feedback + section strings', () => {
    it('reports save success/failure via window.dueli.showToast (the real toast API)', () => {
        const src = readSrc(PAGE);
        expect(src).toContain('window.dueli?.showToast(');
        expect(src, 'dead dueli.toast chain must be gone').not.toContain('dueli?.toast?.');
        expect(src).toContain("'success'");
        expect(src).toContain("'error'");
    });

    it('titles the notifications section + toast/labels from existing settings_page keys', () => {
        const src = readSrc(PAGE);
        expect(src).toContain('settings_page?.notifications');
        expect(src).toContain('settings_page?.saved');
        expect(src, 'wrong new-join-request section title must be gone').not.toContain('notification?.new_join_request');
        expect(src, 'missing tr.settings_saved must be gone').not.toContain('tr.settings_saved');
        // Keys referenced by the page exist in both languages (no silent English fallback).
        for (const lang of ['ar', 'en'] as const) {
            for (const k of ['notifications', 'saved', 'email_notifications', 'push_notifications'] as const) {
                expect(
                    (translations[lang].settings_page as Record<string, unknown>)[k],
                    `settings_page.${k} missing in ${lang}`,
                ).toBeTruthy();
            }
        }
    });

    it('server-rendered shell leaks no raw placeholders', () => {
        const src = readSrc(PAGE);
        expect(src.slice(0, src.indexOf('<script nonce'))).not.toContain('\\${');
    });
});
