import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailService } from '../../src/lib/services/EmailService';
import { DEFAULT_PLATFORM_URL } from '../../src/config/defaults';

// EMAIL DELIVERABILITY CLEANUP: generated auth emails must carry the official
// production domain identity (dueli.maelshpro.com), never pages.dev.

const OFFICIAL = 'https://dueli.maelshpro.com';
const STALE = 'project-8e7c178d.pages.dev';

describe('email domain identity', () => {
    let fetchMock: ReturnType<typeof vi.fn>;
    let lastPayload: any;

    beforeEach(() => {
        lastPayload = null;
        fetchMock = vi.fn(async (_url: any, init: any) => {
            lastPayload = JSON.parse(init.body);
            return new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        });
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    function service() {
        return new EmailService('test-key', 'https://mail.example.com/send-email.php', 'dueli@maelshpro.com');
    }

    it('SSOT is the official production domain', () => {
        expect(DEFAULT_PLATFORM_URL).toBe(OFFICIAL);
    });

    it.each(['ar', 'en'] as const)('verification email (%s): logo + platform + fallback link use the official domain, no pages.dev', async (lang) => {
        await service().sendVerificationEmail('user@test.com', 'token-123', 'User', lang, '');
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const full = `${lastPayload.subject} ${lastPayload.html}`;
        expect(full).not.toContain(STALE);
        expect(lastPayload.html).toContain(`${OFFICIAL}/static/dueli-icon.png`);
        expect(lastPayload.html).toContain(`href="${OFFICIAL}"`);
        // fallback verification link (empty origin) targets the official domain
        expect(lastPayload.html).toContain(`${OFFICIAL}/verify?token=token-123`);
    });

    it('verification email honors an explicit origin when provided', async () => {
        await service().sendVerificationEmail('user@test.com', 'token-abc', 'User', 'en', 'https://custom.example');
        const full = `${lastPayload.subject} ${lastPayload.html}`;
        expect(full).not.toContain(STALE);
        expect(lastPayload.html).toContain('https://custom.example/verify?token=token-abc');
    });

    it.each(['ar', 'en'] as const)('password-reset email (%s): template uses the official domain, no pages.dev', async (lang) => {
        await service().sendPasswordResetEmail('user@test.com', '123456', lang);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const full = `${lastPayload.subject} ${lastPayload.html}`;
        expect(full).not.toContain(STALE);
        expect(lastPayload.to).toBe('user@test.com');
        expect(lastPayload.html).toContain(`${OFFICIAL}/static/dueli-icon.png`);
        expect(lastPayload.html).toContain(`href="${OFFICIAL}"`);
        expect(lastPayload.html).toContain('123456');
    });
});
