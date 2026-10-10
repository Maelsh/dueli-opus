/**
 * R4-LIVE-INT-1 FINAL i18n — the production live room must not show
 * hardcoded English strings: join-failure toasts resolve through
 * tr.live_signaling.* (ar + en). Regression pins for the two strings
 * flagged by REMOTE (room_create_failed, session_join_failed).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from '../../src/i18n';
import { liveRoomPage } from '../../src/modules/pages/live-room-page';

const root = resolve(__dirname, '../..');
const PAGE = 'src/modules/pages/live-room-page.ts';

function mockCtx(lang: 'ar' | 'en') {
    return {
        get: (k: string) => (k === 'lang' ? lang : k === 'cspNonce' ? 'test-nonce' : null),
        html: (s: string) => s,
        req: { url: `http://localhost/live/7?lang=${lang}`, param: () => '7' },
    } as never;
}

async function renderRoom(lang: 'ar' | 'en'): Promise<string> {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () =>
        new Response(JSON.stringify({ success: true, data: { id: 7, title: 'Room', status: 'live' } }), {
            headers: { 'Content-Type': 'application/json' },
        })) as unknown as typeof fetch;
    try {
        return (await (liveRoomPage as (c: never) => Promise<string>)(mockCtx(lang))) as string;
    } finally {
        globalThis.fetch = realFetch;
    }
}

describe('R4-LIVE-INT-1 live room join-failure i18n', () => {
    it('has no hardcoded English failure toasts in the production room page', () => {
        const src = readFileSync(resolve(root, PAGE), 'utf-8');
        expect(src).not.toMatch(/showMessage\('Failed to/);
        expect(src).toContain('tr.live_signaling.room_create_failed');
        expect(src).toContain('tr.live_signaling.session_join_failed');
    });

    it('defines both keys in ar and en (non-empty, actually translated)', () => {
        for (const key of ['room_create_failed', 'session_join_failed'] as const) {
            const arText = (translations.ar.live_signaling as Record<string, unknown>)[key];
            const enText = (translations.en.live_signaling as Record<string, unknown>)[key];
            expect(typeof arText, `ar.${key}`).toBe('string');
            expect(typeof enText, `en.${key}`).toBe('string');
            expect((arText as string).length, `ar.${key} non-empty`).toBeGreaterThan(0);
            expect((enText as string).length, `en.${key} non-empty`).toBeGreaterThan(0);
            expect(arText, `${key} translated (ar !== en)`).not.toBe(enText);
        }
    });

    it.each(['en', 'ar'] as const)('renders the translated toast text (%s)', async (lang) => {
        const html = await renderRoom(lang);
        const tr = lang === 'ar' ? translations.ar : translations.en;
        expect(html).toContain(tr.live_signaling.room_create_failed);
        expect(html).toContain(tr.live_signaling.session_join_failed);
    });
});
