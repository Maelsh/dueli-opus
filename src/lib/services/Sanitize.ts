/**
 * @file src/lib/services/Sanitize.ts
 * @description خدمة تنقية المدخلات من أكواد HTML/JS - T1.4 (XSS)
 *
 * تُطبق على كل نص يدخله المستخدم ويُخزن ثم يُعرض لغيره.
 * التنقية عند الإدخال (store-escaped) تحمي كل نقاط العرض دفعة واحدة.
 */

export class Sanitize {

    /**
     * Escape HTML special characters to prevent stored XSS
     */
    static escapeHtml(input: string): string {
        if (!input) return '';
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    /**
     * UNIT41.2-P1 (G8): escape a TEXT-content sink (`<title>`, element text).
     *
     * Escapes the four characters that can break out of text or a
     * double-quoted attribute — `&`, `<`, `>`, `"` — and deliberately leaves
     * the apostrophe untouched. A natural apostrophe in a title such as
     * `World's` must not be rendered as the visible entity `&#39;`.
     */
    static escapeHtmlText(input: string): string {
        if (!input) return '';
        return input
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * UNIT41.2-P1 (G8): escape a DOUBLE-QUOTED attribute value
     * (`content="..."`, `href="..."`). Same four characters as
     * {@link escapeHtmlText}; `'` is safe inside double quotes and stays
     * literal so meta content reads naturally.
     */
    static escapeHtmlAttr(input: string): string {
        return Sanitize.escapeHtmlText(input);
    }

    /**
     * Exact inverse of escapeHtml (reverse order, &amp; decoded LAST).
     *
     * Boundary use ONLY: decoding a value that escapeHtml/cleanTitle
     * produced, immediately before a sink that escapes again (e.g. the
     * live-room <title>, where generateHTML escapes centrally). Never apply
     * to untrusted raw input — that would un-neutralize an attack string.
     * unescapeHtml(escapeHtml(x)) === x for every x.
     */
    static unescapeHtml(input: string | undefined | null): string {
        if (!input) return '';
        return String(input)
            .replace(/&#39;/g, "'")
            .replace(/&quot;/g, '"')
            .replace(/&gt;/g, '>')
            .replace(/&lt;/g, '<')
            .replace(/&amp;/g, '&');
    }

    /**
     * Escape then trim — the standard treatment for user text fields
     */
    static cleanText(input: string | undefined | null): string {
        if (!input) return '';
        return this.escapeHtml(String(input).trim());
    }

    /**
     * Strip control characters and cap length (for titles etc.)
     */
    static cleanTitle(input: string | undefined | null, maxLength = 200): string {
        const cleaned = this.cleanText(input);
        // Remove control chars except newline/tab already trimmed by escape
        return cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '').slice(0, maxLength);
    }
}

export default Sanitize;
