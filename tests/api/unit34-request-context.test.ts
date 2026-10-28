/**
 * UNIT34-A — request ID + structured error logging.
 */
import { describe, expect, it, vi } from 'vitest';
import app from '../../src/main';
import { FailingDb } from '../helpers/d1-measurement';

type Env = Parameters<typeof app.request>[2];
const envOf = (db: unknown): Env => ({ DB: db }) as unknown as Env;

describe('UNIT34-A request context', () => {
    it('returns propagated X-Request-Id on API responses', async () => {
        const id = 'client-req-id-12345678';
        const res = await app.request('/api/countries?lang=en', {
            headers: { 'X-Request-Id': id },
        });
        expect(res.headers.get('X-Request-Id')).toBe(id);
    });

    it('generates X-Request-Id when the client omits it', async () => {
        const res = await app.request('/api/countries?lang=en');
        const rid = res.headers.get('X-Request-Id');
        expect(rid).toBeTruthy();
        expect(rid!.length).toBeGreaterThanOrEqual(8);
    });

    it('logs structured JSON on D1 failure without leaking SQL (correlation)', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const res = await app.request('/api/search/users?lang=en&q=testuser', {}, envOf(new FailingDb()));
        expect(res.status).toBe(500);
        expect(res.headers.get('X-Request-Id')).toBeTruthy();
        const logged = errSpy.mock.calls.map((c) => String(c[0])).join('\n');
        expect(logged).toMatch(/"type":"server_error"/);
        expect(logged).toMatch(/"requestId":/);
        expect(logged).not.toMatch(/D1_ERROR|select .* from/i);
        errSpy.mockRestore();
    });
});
