import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { translations } from '../../src/i18n';
import { State } from '../../src/client/core/State';
import { Modal } from '../../src/client/ui/Modal';
import { AuthService } from '../../src/client/services/AuthService';

// EMAIL-SENT UX NOTICE: every real email-send success state must show the
// shared Spam/Junk guidance (i18n key only); failures must not.

const AR_NOTICE = 'إذا لم تجد الرسالة، تحقق من مجلد البريد غير المرغوب فيه (Spam).';
const EN_NOTICE = 'If you don’t see the email, check your Spam or Junk folder.';

// ---- minimal DOM shim (node env, same approach as modal-accessibility) ----
class El {
    textContent = '';
    value = '';
    id = '';
    type = '';
    disabled = false;
    onclick: (() => unknown) | null = null;
    classes = new Set<string>();
    qs: El | null = null;
    resetCalled = false;
    classList = {
        add: (...c: string[]) => c.forEach((x) => x && this.classes.add(x)),
        remove: (...c: string[]) => c.forEach((x) => this.classes.delete(x)),
        contains: (c: string) => this.classes.has(c),
    };
    querySelector(_sel: string): El | null {
        return this.qs;
    }
    insertAdjacentElement(_pos: string, el: El): void {
        registry[el.id] = el;
    }
    reset(): void {
        this.resetCalled = true;
    }
}

let registry: Record<string, El> = {};

function makeDoc() {
    registry = {};
    for (const id of [
        'authMessage',
        'resetEmail',
        'resetCode',
        'newPassword',
        'resetStep1',
        'resetStep2',
        'registerName',
        'registerEmail',
        'registerPassword',
        'registerForm',
    ]) {
        registry[id] = new El();
        registry[id].id = id;
    }
    registry['registerForm'].qs = new El();
    return {
        cookie: '',
        getElementById: (id: string): El | null => registry[id] ?? null,
        createElement: (_tag: string): El => new El(),
    };
}

function okJson(body: unknown) {
    return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

const evt = { preventDefault: () => undefined } as unknown as Event;

describe('email-sent spam/junk notice', () => {
    beforeEach(() => {
        vi.stubGlobal('document', makeDoc());
        vi.stubGlobal('setTimeout', (() => 0) as unknown as typeof setTimeout);
        State.lang = 'en';
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        State.lang = 'en';
    });

    it('i18n key exists with the required ar/en meaning', () => {
        expect((translations as any).ar.auth_check_spam_folder).toBe(AR_NOTICE);
        expect((translations as any).en.auth_check_spam_folder).toBe(EN_NOTICE);
        expect(AR_NOTICE).not.toBe(EN_NOTICE);
    });

    it('no hardcoded notice text in the touched client sources (key-only)', () => {
        // Modal owns the shared key; handlers go through showEmailSentMessage.
        const modal = readFileSync(resolve('src/client/ui/Modal.ts'), 'utf8');
        expect(modal).not.toContain('البريد غير المرغوب');
        expect(modal).not.toContain('Spam or Junk');
        expect(modal).toContain('auth_check_spam_folder');
        expect(modal).toContain('showEmailSentMessage');

        const svc = readFileSync(resolve('src/client/services/AuthService.ts'), 'utf8');
        expect(svc).not.toContain('البريد غير المرغوب');
        expect(svc).not.toContain('Spam or Junk');
        // wired on the three email-sent success paths, nowhere else as success
        expect(svc.match(/showEmailSentMessage/g)?.length).toBe(3);
    });

    it('Modal.showEmailSentMessage appends the notice ar/en; plain success does not', () => {
        State.lang = 'ar';
        Modal.showEmailSentMessage('تم');
        expect(registry['authMessage'].textContent).toBe(`تم\n${AR_NOTICE}`);

        State.lang = 'en';
        Modal.showEmailSentMessage('Done');
        expect(registry['authMessage'].textContent).toBe(`Done\n${EN_NOTICE}`);

        Modal.showAuthMessage('Done', 'success');
        expect(registry['authMessage'].textContent).toBe('Done');
    });

    it('forgot-password success shows the notice; failure does not', async () => {
        State.lang = 'en';
        registry['resetEmail'].value = 'u@test.com';
        vi.stubGlobal('fetch', vi.fn(async () => okJson({ success: true, data: { message: 'Reset code sent' } })));
        await AuthService.handleForgotPassword(evt);
        expect(registry['authMessage'].textContent).toContain('Reset code sent');
        expect(registry['authMessage'].textContent).toContain(EN_NOTICE);

        vi.stubGlobal('fetch', vi.fn(async () => okJson({ success: false, error: 'bad' })));
        await AuthService.handleForgotPassword(evt);
        expect(registry['authMessage'].textContent).toBe('bad');
        expect(registry['authMessage'].textContent).not.toContain(EN_NOTICE);
    });

    it('register success shows the notice, but email_not_configured (no send) does not', async () => {
        State.lang = 'ar';
        registry['registerName'].value = 'n';
        registry['registerEmail'].value = 'e@test.com';
        registry['registerPassword'].value = 'password123';

        vi.stubGlobal('fetch', vi.fn(async () => okJson({ success: true, data: { message: 'ok-register' } })));
        await AuthService.handleRegister(evt);
        expect(registry['authMessage'].textContent).toContain('ok-register');
        expect(registry['authMessage'].textContent).toContain(AR_NOTICE);

        vi.stubGlobal(
            'fetch',
            vi.fn(async () => okJson({ success: true, data: { message: 'ok-nowarn', warning: 'email_not_configured' } }))
        );
        await AuthService.handleRegister(evt);
        expect(registry['authMessage'].textContent).toBe('ok-nowarn');
        expect(registry['authMessage'].textContent).not.toContain(AR_NOTICE);
        expect(registry['resendVerificationBtn']).toBeTruthy();
    });

    it('resend-verification success shows the notice; failure does not', async () => {
        State.lang = 'en';
        registry['registerName'].value = 'n';
        registry['registerEmail'].value = 'e@test.com';
        registry['registerPassword'].value = 'password123';
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => okJson({ success: true, data: { message: 'warn', warning: 'email_not_configured' } }))
        );
        await AuthService.handleRegister(evt);
        const btn = registry['resendVerificationBtn'];
        expect(btn).toBeTruthy();

        vi.stubGlobal('fetch', vi.fn(async () => okJson({ success: true, data: { message: 'resent-ok' } })));
        await btn.onclick!();
        expect(registry['authMessage'].textContent).toContain('resent-ok');
        expect(registry['authMessage'].textContent).toContain(EN_NOTICE);

        vi.stubGlobal('fetch', vi.fn(async () => okJson({ success: false, error: 'resend-bad' })));
        await btn.onclick!();
        expect(registry['authMessage'].textContent).toBe('resend-bad');
        expect(registry['authMessage'].textContent).not.toContain(EN_NOTICE);
    });
});
