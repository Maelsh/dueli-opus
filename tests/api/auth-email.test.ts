import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../../src/main';
import { FakeD1 } from '../helpers/fake-d1';

// NOTE: rate limiting keys requests by IP — give every call a unique fake IP
// so the suite tests handler logic, not the limiter.
let ipSeq = 0;
function csrfHeaders() {
    ipSeq += 1;
    return {
        'Content-Type': 'application/json',
        'X-CSRF-Token': 'test',
        'X-Forwarded-For': `10.9.9.${(ipSeq % 250) + 1}`
    };
}

function env(db: FakeD1, extra: Record<string, string> = {}) {
    return { DB: db, ...extra } as any;
}

async function register(db: FakeD1, body: any, extraEnv: Record<string, string> = {}) {
    return app.request(
        '/api/auth/register?lang=en',
        { method: 'POST', headers: csrfHeaders(), body: JSON.stringify(body) },
        env(db, extraEnv)
    );
}

describe('register without EMAIL vars', () => {
    let db: FakeD1;

    beforeEach(() => {
        db = new FakeD1();
    });

    it('still creates the user and returns warning=email_not_configured', async () => {
        const res = await register(db, {
            name: 'NoMail',
            email: 'nomail@test.com',
            password: 'password123'
        });
        expect(res.status).toBe(201);
        const data = (await res.json()) as any;
        expect(data.success).toBe(true);
        expect(data.data?.warning).toBe('email_not_configured');

        // user was really created
        expect(db.users.length).toBe(1);
        expect(db.users[0].email).toBe('nomail@test.com');
    });
});

describe('register with EMAIL vars (mocked fetch)', () => {
    let db: FakeD1;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        db = new FakeD1();
        fetchMock = vi.fn(async () =>
            new Response(JSON.stringify({ ok: true }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            })
        );
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('queues the verification email (no warning)', async () => {
        const res = await register(
            db,
            { name: 'Mailed', email: 'mailed@test.com', password: 'password123' },
            {
                EMAIL_API_KEY: 'test-key',
                EMAIL_API_URL: 'https://mail.example.com/send-email.php',
                EMAIL_FROM: 'noreply@example.com'
            }
        );
        expect(res.status).toBe(201);
        const data = (await res.json()) as any;
        expect(data.success).toBe(true);
        expect(data.data?.warning).toBeUndefined();
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toBe('https://mail.example.com/send-email.php');
        // API key must travel in headers, never in the logged URL/body
        expect((init as any).headers['X-API-Key']).toBe('test-key');
    });
});

describe('resend-verification (anti-enumeration)', () => {
    let db: FakeD1;

    beforeEach(async () => {
        db = new FakeD1();
        // seed one unverified user (no EMAIL vars needed for creation)
        await app.request(
            '/api/auth/register?lang=en',
            {
                method: 'POST',
                headers: csrfHeaders(),
                body: JSON.stringify({
                    name: 'Existing',
                    email: 'existing@test.com',
                    password: 'password123'
                })
            },
            env(db)
        );
    });

    async function resend(email: string, extraEnv: Record<string, string> = {}) {
        return app.request(
            '/api/auth/resend-verification?lang=en',
            { method: 'POST', headers: csrfHeaders(), body: JSON.stringify({ email }) },
            env(db, extraEnv)
        );
    }

    it('returns the SAME message for existing and non-existing emails', async () => {
        const mailEnv = {
            EMAIL_API_KEY: 'test-key',
            EMAIL_API_URL: 'https://mail.example.com/send-email.php'
        };
        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        try {
            const existingRes = await resend('existing@test.com', mailEnv);
            const missingRes = await resend('nobody@test.com', mailEnv);
            expect(existingRes.status).toBe(200);
            expect(missingRes.status).toBe(200);
            const existingBody = (await existingRes.json()) as any;
            const missingBody = (await missingRes.json()) as any;
            expect(existingBody.success).toBe(true);
            expect(missingBody.success).toBe(true);
            expect(existingBody.data?.message ?? existingBody.message).toBe(
                missingBody.data?.message ?? missingBody.message
            );
        } finally {
            vi.unstubAllGlobals();
        }
    });

    it('does not leak server misconfiguration (no EMAIL vars -> same generic message)', async () => {
        const existingRes = await resend('existing@test.com');
        const missingRes = await resend('nobody@test.com');
        expect(existingRes.status).toBe(200);
        expect(missingRes.status).toBe(200);
        const existingBody = (await existingRes.json()) as any;
        const missingBody = (await missingRes.json()) as any;
        expect(existingBody.data?.message ?? existingBody.message).toBe(
            missingBody.data?.message ?? missingBody.message
        );
    });
});

describe('register provider failure (machine-readable warning)', () => {
    it('returns 201 with warning=email_send_failed (stable code, not message text)', async () => {
        const db = new FakeD1();
        const fetchMock = vi.fn(async () => {
            throw new Error('provider down');
        });
        vi.stubGlobal('fetch', fetchMock);
        try {
            const res = await register(
                db,
                { name: 'FailMail', email: 'failmail@test.com', password: 'password123' },
                {
                    EMAIL_API_KEY: 'test-key',
                    EMAIL_API_URL: 'https://mail.example.com/send-email.php'
                }
            );
            expect(res.status).toBe(201);
            const data = (await res.json()) as any;
            expect(data.success).toBe(true);
            expect(data.data?.warning).toBe('email_send_failed');
            // user was still created (retry via resend path)
            expect(db.users.length).toBe(1);
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

describe('resend-verification provider failure stays generic (no enumeration)', () => {
    it('returns the SAME generic 200 whether the send succeeds or the provider fails', async () => {
        const db = new FakeD1();
        await app.request(
            '/api/auth/register?lang=en',
            {
                method: 'POST',
                headers: csrfHeaders(),
                body: JSON.stringify({ name: 'Existing', email: 'existing@test.com', password: 'password123' })
            },
            env(db)
        );
        const mailEnv = {
            EMAIL_API_KEY: 'test-key',
            EMAIL_API_URL: 'https://mail.example.com/send-email.php'
        };
        async function resendOnce(email: string) {
            return app.request(
                '/api/auth/resend-verification?lang=en',
                { method: 'POST', headers: csrfHeaders(), body: JSON.stringify({ email }) },
                env(db, mailEnv)
            );
        }

        const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
        vi.stubGlobal('fetch', fetchMock);
        const okRes = await resendOnce('existing@test.com');
        vi.unstubAllGlobals();

        const failMock = vi.fn(async () => {
            throw new Error('provider down');
        });
        vi.stubGlobal('fetch', failMock);
        let failRes: Response;
        try {
            failRes = await resendOnce('existing@test.com');
        } finally {
            vi.unstubAllGlobals();
        }

        expect(okRes.status).toBe(200);
        expect(failRes!.status).toBe(200);
        const okBody = (await okRes.json()) as any;
        const failBody = (await failRes!.json()) as any;
        expect(okBody.success).toBe(true);
        expect(failBody.success).toBe(true);
        expect(failBody.data?.message ?? failBody.message).toBe(okBody.data?.message ?? okBody.message);
        // no warning channel to match on — the client must not assume a send
        expect(failBody.data?.warning).toBeUndefined();
    });
});
