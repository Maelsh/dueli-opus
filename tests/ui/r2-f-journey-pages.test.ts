/**
 * R2-F — page-level regression pins for the fixed journeys.
 *
 * 1. advertiser + complaint pages: every inline generated script must
 *    compile (was: SyntaxError from data-csp-args quoting broke ALL page JS),
 *    use the canonical session fallback, and emit numeric CSP args.
 * 2. profile (other user): actions include Follow + Message + Report entry
 *    (was: no report entry) and hydrate follow state from the API after
 *    refresh (was: always reset to Follow).
 * 3. navigation exposes /advertiser and /complaints (were: unreachable —
 *    no menu entry anywhere).
 * 4. /donate exposes the donor's own history (was: API existed, UI absent);
 *    /reports uses the current {target_type,target_id,reason} contract
 *    (was: legacy {type,subject,description} ⇒ always 422).
 * 5. ar/en shells keep RTL/LTR + dark variants on the touched pages.
 */
import { describe, it, expect } from 'vitest';
import { Script } from 'node:vm';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';

function env(db: SqliteD1) {
    return { DB: db } as unknown as Parameters<typeof app.request>[2];
}

function inlineScripts(html: string): string[] {
    return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
}

describe('R2-F page pins', () => {
    it('1a. /advertiser scripts compile, share one session contract, numeric CSP args', async () => {
        const db = new SqliteD1();
        for (const lang of ['en', 'ar']) {
            const html = await (await app.request(`/advertiser?lang=${lang}`, {}, env(db))).text();
            const scripts = inlineScripts(html);
            expect(scripts.length).toBeGreaterThan(0);
            for (const s of scripts) {
                expect(() => new Script(s), `advertiser[${lang}] compiles`).not.toThrow();
            }
            // Canonical session fallback everywhere (no session_id-only reads).
            expect(html).not.toMatch(/localStorage\.getItem\('session_id'\)(?! \|)/);
            expect(html).toContain("localStorage.getItem('session_id') || localStorage.getItem('sessionId')");
            // No broken string-concat quoting remains (was: data-csp-args='[" + id + "]'
            // inside a single-quoted JS string ⇒ SyntaxError killing ALL page JS).
            // Static JSON string args ('["@event"]', '["login"]', …) are valid.
            expect(html).not.toContain('data-csp-args=\'[" +');
        }
    });

    it('1b. /complaints scripts compile with the same session contract', async () => {
        const db = new SqliteD1();
        for (const lang of ['en', 'ar']) {
            const html = await (await app.request(`/complaints?lang=${lang}`, {}, env(db))).text();
            const scripts = inlineScripts(html);
            expect(scripts.length).toBeGreaterThan(0);
            for (const s of scripts) {
                expect(() => new Script(s), `complaints[${lang}] compiles`).not.toThrow();
            }
            expect(html).not.toMatch(/localStorage\.getItem\('session_id'\)(?! \|)/);
            expect(html).not.toContain('data-csp-args=\'[" +');
        }
    });

    it('2. profile of another user: Follow + Message + Report + follow hydration', async () => {
        const db = new SqliteD1();
        await db.prepare(
            `INSERT INTO users (id, email, username, display_name, password_hash, is_active)
             VALUES (201, 'p1@local', 'r2fowner', 'Owner', 'x', 1)`
        ).run();
        const html = await (await app.request('/profile/r2fowner?lang=en', {}, env(db))).text();
        expect(html).toContain('id="profileActions"');
        expect(html).toContain('refreshFollowState');
        expect(html).toContain('paintFollowButton');
        expect(html).toContain('/reports?target_type=user&target_id=');
        expect(html).toContain('report');
        for (const s of inlineScripts(html)) {
            expect(() => new Script(s), 'profile compiles').not.toThrow();
        }
    });

    it('3. navigation reaches /advertiser and /complaints', async () => {
        const db = new SqliteD1();
        const html = await (await app.request('/donate?lang=en', {}, env(db))).text();
        expect(html).toContain('/advertiser?lang=');
        expect(html).toContain('/complaints?lang=');
    });

    it('4a. /donate renders the donor history region on the live contract', async () => {
        const db = new SqliteD1();
        for (const lang of ['en', 'ar']) {
            const html = await (await app.request(`/donate?lang=${lang}`, {}, env(db))).text();
            expect(html).toContain('myDonationsCard');
            expect(html).toContain('loadMyDonations');
            expect(html).toContain('/api/donations/my');
            for (const s of inlineScripts(html)) {
                expect(() => new Script(s), `donate[${lang}] compiles`).not.toThrow();
            }
        }
        const ar = await (await app.request('/donate?lang=ar', {}, env(new SqliteD1()))).text();
        expect(ar).toContain('تبرعاتي');
    });

    it('4b. /reports form uses target_type/target_id/reason + prefill from profile link', async () => {
        const db = new SqliteD1();
        const html = await (await app.request('/reports?lang=en', {}, env(db))).text();
        expect(html).toContain('reportTargetType');
        expect(html).toContain('reportTargetId');
        expect(html).toContain('reportReason');
        expect(html).toContain('/api/reports/reasons');
        expect(html).toContain('target_type');
        expect(html).not.toContain('reportSubject');
        expect(html).not.toContain('input[name="reportType"]');
        for (const s of inlineScripts(html)) {
            expect(() => new Script(s), 'reports compiles').not.toThrow();
        }
    });

    it('5. touched pages keep RTL/LTR + dark variants in ar and en', async () => {
        const db = new SqliteD1();
        const ar = await (await app.request('/advertiser?lang=ar', {}, env(db))).text();
        expect(ar).toContain('dir="rtl"');
        expect(ar).toContain('dark:');
        const en = await (await app.request('/complaints?lang=en', {}, env(db))).text();
        expect(en).toContain('dir="ltr"');
        expect(en).toContain('dark:');
    });
});
