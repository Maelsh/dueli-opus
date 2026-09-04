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
