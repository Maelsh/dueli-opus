/**
 * R1.2 — /messages must not leak raw template placeholders (P01-001/P04-005).
 *
 * Historical defect, still live: two server-rendered spots in
 * src/modules/pages/messages-page.ts used an escaped `\${...}` inside
 * STATIC HTML (not inside the client <script>), so users saw the literal
 * text `${tr.messages?.select_conversation || ...}` and
 * `${tr.messages?.type_message || ...}` instead of translated strings.
 *
 * Node-only: renders the page handler with a mock Hono context (same
 * pattern as tests/api/discovery-endpoints.test.ts) for ar + en and
 * asserts translated output with no raw placeholders.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from '../../src/i18n';
import { messagesPage } from '../../src/modules/pages/messages-page';

const root = resolve(__dirname, '../..');
const readSrc = (rel: string) => readFileSync(resolve(root, rel), 'utf-8');

async function renderMessages(lang: 'ar' | 'en'): Promise<string> {
    const ctx = {
        get: (k: string) => (k === 'lang' ? lang : k === 'cspNonce' ? 'test-nonce' : null),
        html: (s: string) => s,
    } as never;
    return (await (messagesPage as (c: never) => Promise<string>)(ctx)) as string;
}

describe('R1.2 /messages template rendering (P01-001/P04-005)', () => {
    it.each(['en', 'ar'] as const)('renders translated empty-state + input placeholder (%s), no raw placeholders', async (lang) => {
        const html = await renderMessages(lang);
        // Client-side <script> legitimately ships `${tr.…}` for BROWSER-side
        // evaluation — scope the leak check to the STATIC HTML region only.
        const staticHtml = html.slice(0, html.indexOf('<script nonce'));
        expect(staticHtml, 'raw ${tr.…} placeholder leaked to users').not.toContain('${tr.messages');
        expect(staticHtml, 'raw ${tr.…} placeholder leaked to users').not.toContain('${tr.');
        // Translated strings actually appear in the static markup.
        expect(staticHtml).toContain(translations[lang].messages.select_conversation);
        expect(staticHtml).toContain(translations[lang].messages.type_message);
    });

    it('keeps client-side script interpolations escaped (no server/client mix-up)', () => {
        // Inside <script> the page intentionally uses `\${…}` for CLIENT-side
        // evaluation against the serialized `tr` const — that usage must stay.
        const src = readSrc('src/modules/pages/messages-page.ts');
        const script = src.slice(src.indexOf('<script nonce'));
        expect(script).toContain('\\${tr.');
        // …but the STATIC HTML region before <script> must not contain any.
        const staticHtml = src.slice(0, src.indexOf('<script nonce'));
        expect(staticHtml, 'escaped placeholder in static HTML region').not.toContain('\\${');
    });
});
