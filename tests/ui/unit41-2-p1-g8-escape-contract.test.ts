/**
 * UNIT41.2-P1 (G8) — text/attribute escaping keeps the apostrophe human.
 *
 * Contract under test:
 * - Sanitize.escapeHtmlText escapes `& < > "` and leaves `'` LITERAL —
 *   `World's` renders as a natural apostrophe, never the visible `&#39;`.
 * - Sanitize.escapeHtmlAttr (double-quoted attribute values) has the same
 *   four-character set (the quote pair is `"`, so `'` needs no entity).
 * - The two temping sinks on every page — layout `<title>` and seo meta —
 *   use them (esc() for attributes, escapeHtmlText for text content), while
 *   the legacy store-escape path (escapeHtml) keeps `&#39;` for its
 *   round-trip contract (unescapeHtml inverts it exactly).
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Sanitize } from '../../src/lib/services/Sanitize';

const read = (p: string): string => readFileSync(join(process.cwd(), p), 'utf-8');

describe('UNIT41.2-P1 G8 — escape contracts', () => {
    it('1. escapeHtmlText keeps the apostrophe and escapes the four breakers', () => {
        expect(Sanitize.escapeHtmlText("World's Dueli & <Rivals> \"Cup\""))
            .toBe("World's Dueli &amp; &lt;Rivals&gt; &quot;Cup&quot;");
        expect(Sanitize.escapeHtmlText("محمد's")).not.toContain('&#39;');
        expect(Sanitize.escapeHtmlText('')).toBe('');
        expect(Sanitize.escapeHtmlText(null as unknown as string)).toBe('');
    });

    it('2. escapeHtmlAttr matches the text set (double-quoted attribute sink)', () => {
        const tricky = "Dueli's cup & <a> \"b\"";
        const escaped = Sanitize.escapeHtmlAttr(tricky);
        expect(escaped).toBe("Dueli's cup &amp; &lt;a&gt; &quot;b&quot;");
        expect(escaped).not.toContain('&#39;');
        // The attribute value can never escape the double-quoted attribute.
        expect(escaped).not.toContain('"');
    });

    it('3. layout <title> and seo meta ride the new helpers', () => {
        const layout = read('src/shared/templates/layout.ts');
        expect(layout).toMatch(/Sanitize\.escapeHtmlText\(title\)/);
        expect(layout).toMatch(/Sanitize\.escapeHtmlText\(seo\.metaTitle\)/);
        const seo = read('src/shared/templates/seo.ts');
        expect(seo).toMatch(/Sanitize\.escapeHtmlAttr/);
    });

    it('4. the legacy store-escape path is untouched (round-trip contract)', () => {
        const raw = "O'Neil & Sons \"Ltd\" <x>";
        expect(Sanitize.escapeHtml(raw)).toBe('O&#39;Neil &amp; Sons &quot;Ltd&quot; &lt;x&gt;');
        // unescapeHtml is the exact inverse of the TEXT helper as well.
        expect(Sanitize.unescapeHtml(Sanitize.escapeHtmlText(raw))).toBe(raw);
    });
});
