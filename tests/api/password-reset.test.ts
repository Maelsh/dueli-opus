import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../../src/main';
import { FakeD1 } from '../helpers/fake-d1';

// R2-AUTH-1: password-reset journey (forgot → verify → reset).
// Proves the CORRECT send attempt (recipient + reset template) and the
// failure contracts (expired/invalid/used, no enumeration, no secret leak).

let ipSeq = 100;
function csrfHeaders() {
    ipSeq += 1;
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'test',
        'X-Forwarded-For': `10.77.77.${(ipSeq % 250) + 1}`
    };
}

function env(db: FakeD1, extra: Record<string, string> = {}) {
    return { DB: db, ...extra } as any;
}

const MAIL_ENV = {
    EMAIL_API_KEY: 'test-key',
    EMAIL_API_URL: 'https://mail.example.com/send-email.php',
    EMAIL_FROM: 'noreply@example.com'
};

function okFetch(fetchMock: ReturnType<typeof vi.fn>) {
    fetchMock.mockImplementation(async () =>
        new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        })
    );
}

async function registerUser(db: FakeD1, email = 'reset@test.com') {
    const res = await app.request(
        '/api/auth/register?lang=en',
        {
            method: 'POST',
            headers: csrfHeaders(),
            body: JSON.stringify({ name: 'Reset User', email, password: 'password123' })
        },
        env(db)
    );
    expect(res.status).toBe(201);
    // mark verified so login works later
    const user = db.users.find((u) => u.email === email.toLowerCase());
    if (user) user.is_verified = 1;
    return user!;
}

async function forgot(db: FakeD1, email: string, extraEnv: Record<string, string> = MAIL_ENV, lang = 'en') {
    return app.request(`/api/auth/forgot-password?lang=${lang}`, {
        method: 'POST',
        headers: csrfHeaders(),
        body: JSON.stringify({ email })
    }, env(db, extraEnv));
}

describe('R2-AUTH-1 password reset journey', () => {
    let db: FakeD1;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        db = new FakeD1();
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('forgot-password attempts ONE send to the exact recipient with the reset template and persists a 6-digit code with ~15min TTL', async () => {
        okFetch(fetchMock);
        await registerUser(db);

        const res = await forgot(db, 'reset@test.com');
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.success).toBe(true);

        // exactly one send attempt, to the right recipient, via the right provider
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe(MAIL_ENV.EMAIL_API_URL);
        expect((init as any).headers['X-API-Key']).toBe(MAIL_ENV.EMAIL_API_KEY);
        const payload = JSON.parse((init as any).body);
        expect(payload.to).toBe('reset@test.com');
        expect(payload.fromEmail).toBe(MAIL_ENV.EMAIL_FROM);

        // code persisted and matches the template subject/html
        const user = db.users.find((u) => u.email === 'reset@test.com')!;
        expect(user.reset_token).toMatch(/^\d{6}$/);
        const code: string = user.reset_token;
        expect(payload.html).toContain(code);
        expect(payload.subject).toMatch(/reset/i);
        expect(payload.html).toMatch(/15/); // TTL mentioned in template

        // TTL ~15 minutes in the future
        const expires = new Date(user.reset_token_expires).getTime();
        const skew = expires - (Date.now() + 15 * 60 * 1000);
        expect(Math.abs(skew)).toBeLessThan(60 * 1000);

        // response carries no secret
        expect(JSON.stringify(body)).not.toContain(code);
    });

    it('forgot-password normalizes case/whitespace so the send reaches the real address', async () => {
        okFetch(fetchMock);
        await registerUser(db);

        const res = await forgot(db, '  RESET@test.com  ');
        expect(res.status).toBe(200);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [, init] = fetchMock.mock.calls[0];
        const payload = JSON.parse((init as any).body);
        expect(payload.to).toBe('reset@test.com');
    });

    it('forgot-password for an unknown address returns the SAME generic message and sends nothing (no enumeration)', async () => {
        okFetch(fetchMock);
        await registerUser(db);

        const known = await forgot(db, 'reset@test.com');
        const unknown = await forgot(db, 'nobody@test.com');
        expect(known.status).toBe(200);
        expect(unknown.status).toBe(200);
        const knownBody = (await known.json()) as any;
        const unknownBody = (await unknown.json()) as any;
        expect(knownBody.success).toBe(true);
        expect(unknownBody.success).toBe(true);
        expect(unknownBody.data?.message ?? unknownBody.message).toBe(
            knownBody.data?.message ?? knownBody.message
        );
        // only the known address triggered a send
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('forgot-password without EMAIL vars returns the SAME generic message (no 500 config leak, no enumeration oracle)', async () => {
        await registerUser(db);
        const res = await forgot(db, 'reset@test.com', {});
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.success).toBe(true);

        const unknown = await forgot(db, 'nobody@test.com', {});
        expect(unknown.status).toBe(200);
        const unknownBody = (await unknown.json()) as any;
        expect(unknownBody.data?.message ?? unknownBody.message).toBe(
            body.data?.message ?? body.message
        );
    });

    it('forgot-password survives a provider failure with the SAME generic message (no 500 enumeration oracle)', async () => {
        await registerUser(db);
        fetchMock.mockRejectedValueOnce(new Error('provider down'));
        const res = await forgot(db, 'reset@test.com');
        expect(res.status).toBe(200);
        const body = (await res.json()) as any;
        expect(body.success).toBe(true);
        expect(JSON.stringify(body)).not.toContain('provider');
    });

    it('forgot-password survives a provider non-OK response with the SAME generic message', async () => {
        await registerUser(db);
        fetchMock.mockImplementationOnce(async () => new Response('smtp error', { status: 502 }));
        const res = await forgot(db, 'reset@test.com');
        expect(res.status).toBe(200);
        expect(((await res.json()) as any).success).toBe(true);
    });

    it('correct code verifies within TTL and completes the reset; the code is one-time', async () => {
        okFetch(fetchMock);
        await registerUser(db);
        await forgot(db, 'reset@test.com');
        const code = db.users.find((u) => u.email === 'reset@test.com')!.reset_token;

        const verify = await app.request('/api/auth/verify-reset-code?lang=en', {
            method: 'POST', headers: csrfHeaders(), body: JSON.stringify({ email: 'reset@test.com', code })
        }, env(db, MAIL_ENV));
        expect(verify.status).toBe(200);
        expect(((await verify.json()) as any).success).toBe(true);

        const newPassword = 'newpassword123';
        const reset = await app.request('/api/auth/reset-password?lang=en', {
            method: 'POST', headers: csrfHeaders(),
            body: JSON.stringify({ email: 'reset@test.com', code, newPassword })
        }, env(db, MAIL_ENV));
        expect(reset.status).toBe(200);
        const resetBody = (await reset.json()) as any;
        expect(resetBody.success).toBe(true);
        // no secret leak in any response
        for (const b of [resetBody]) {
            expect(JSON.stringify(b)).not.toContain(code);
            expect(JSON.stringify(b)).not.toContain(newPassword);
        }

        // login works with the new password
        const login = await app.request('/api/auth/login?lang=en', {
            method: 'POST', headers: csrfHeaders(),
            body: JSON.stringify({ email: 'reset@test.com', password: newPassword })
        }, env(db));
        expect(login.status).toBe(200);
        expect(((await login.json()) as any).success).toBe(true);

        // one-time use: the same code is now rejected by the contract
        const reuse = await app.request('/api/auth/reset-password?lang=en', {
            method: 'POST', headers: csrfHeaders(),
            body: JSON.stringify({ email: 'reset@test.com', code, newPassword: 'anotherpass123' })
        }, env(db, MAIL_ENV));
        expect(reuse.status).not.toBe(200);
        const reuseBody = (await reuse.json()) as any;
        expect(reuseBody.success).toBe(false);
    });

    it('expired / invalid / unknown codes fail with the SAME contract message', async () => {
        okFetch(fetchMock);
        await registerUser(db);
        await forgot(db, 'reset@test.com');
        const user = db.users.find((u) => u.email === 'reset@test.com')!;
        const code = user.reset_token;

        const wrong = await app.request('/api/auth/verify-reset-code?lang=en', {
            method: 'POST', headers: csrfHeaders(),
            body: JSON.stringify({ email: 'reset@test.com', code: '000000' })
        }, env(db, MAIL_ENV));
        expect(wrong.status).not.toBe(200);

        // expire the code
        user.reset_token_expires = new Date(Date.now() - 60 * 1000).toISOString();
        const expired = await app.request('/api/auth/verify-reset-code?lang=en', {
            method: 'POST', headers: csrfHeaders(),
            body: JSON.stringify({ email: 'reset@test.com', code })
        }, env(db, MAIL_ENV));
        expect(expired.status).not.toBe(200);

        const unknown = await app.request('/api/auth/verify-reset-code?lang=en', {
            method: 'POST', headers: csrfHeaders(),
            body: JSON.stringify({ email: 'nobody@test.com', code: '000000' })
        }, env(db, MAIL_ENV));
        expect(unknown.status).not.toBe(200);

        const wrongMsg = ((await wrong.json()) as any).error;
        const expiredMsg = ((await expired.json()) as any).error;
        const unknownMsg = ((await unknown.json()) as any).error;
        expect(wrongMsg).toBe(expiredMsg);
        expect(wrongMsg).toBe(unknownMsg);

        // expired code cannot reset either
        const resetExpired = await app.request('/api/auth/reset-password?lang=en', {
            method: 'POST', headers: csrfHeaders(),
            body: JSON.stringify({ email: 'reset@test.com', code, newPassword: 'newpassword123' })
        }, env(db, MAIL_ENV));
        expect(resetExpired.status).not.toBe(200);
    });

    it('reset messages are localized (ar != en)', async () => {
        okFetch(fetchMock);
        await registerUser(db);
        const en = await forgot(db, 'reset@test.com', MAIL_ENV, 'en');
        const ar = await forgot(db, 'reset@test.com', MAIL_ENV, 'ar');
        expect(en.status).toBe(200);
        expect(ar.status).toBe(200);
        const enMsg = ((await en.json()) as any).data?.message;
        const arMsg = ((await ar.json()) as any).data?.message;
        expect(enMsg).toBeTruthy();
        expect(arMsg).toBeTruthy();
        expect(enMsg).not.toBe(arMsg);
    });
});
