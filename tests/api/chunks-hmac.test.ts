import { beforeEach, describe, expect, it } from 'vitest';
import { createHmac, createHash } from 'node:crypto';
import app from '../../src/main';
import { SqliteD1 } from '../helpers/sqlite-d1';
import { CryptoUtils } from '../../src/lib/services/CryptoUtils';

/**
 * C2 (SEC-03): upload-server HMAC authentication on /api/chunks/verify + DELETE /:key.
 *
 * Proven hole: both routes accepted any caller with a spoofable Origin/Referer
 * header (`curl -H "Origin: https://allowed.com"`), and DELETE allowed
 * unauthenticated chunk-key deletion. Prefix matching additionally let
 * `https://allowed.com.attacker.net` through ( since fixed to exact-host ).
 *
 * Fix: HMAC-SHA256 server-to-server auth (X-Signature/X-Timestamp/X-Nonce,
 * 5-minute window, single-use nonces in `chunk_upload_nonces`, constant-time
 * compare) with the exact-host Origin check kept as a second layer.
 */

const SECRET = 'c2-test-upload-secret';
const ORIGIN = 'https://maelshpro.com';

function env(db: SqliteD1, secret: string | false = SECRET) {
    const e: Record<string, unknown> = { DB: db };
    if (secret !== false) e['UPLOAD_SERVER_SECRET'] = secret;
    return e as unknown as Parameters<typeof app.request>[2];
}

function canonical(method: string, path: string, ts: string, nonce: string, body = '') {
    const bodyHash = createHash('sha256').update(body).digest('hex');
    return `${method}\n${path}\n${ts}\n${nonce}\n${bodyHash}`;
}

function sign(method: string, path: string, ts: string, nonce: string, body = '') {
    return createHmac('sha256', SECRET).update(canonical(method, path, ts, nonce, body)).digest('hex');
}

function hmacHeaders(method: string, path: string, ts: string, nonce: string, sig: string, origin = ORIGIN) {
    return {
        'X-Signature': sig,
        'X-Timestamp': ts,
        'X-Nonce': nonce,
        Origin: origin,
        // Global csrfProtection requires Origin == Host on non-GET; mirror production.
        Host: new URL(origin).host,
        'X-CSRF-Token': 'c2-test',
    };
}

const now = () => String(Date.now());

describe('C2 — CryptoUtils.hmacSha256Hex oracle', () => {
    it('matches node:crypto on an independent vector', async () => {
        const expected = createHmac('sha256', 'key').update('The quick brown fox').digest('hex');
        await expect(CryptoUtils.hmacSha256Hex('key', 'The quick brown fox')).resolves.toBe(expected);
    });
});

describe('C2 — /api/chunks/verify HMAC gate', () => {
    let db: SqliteD1;
    beforeEach(() => {
        db = new SqliteD1();
    });

    it('1. Origin alone with no HMAC ⇒ 403 (spoofable header is not auth)', async () => {
        const res = await app.request('/api/chunks/verify?key=k', {
            headers: { Origin: ORIGIN, 'X-CSRF-Token': 'c2-test' },
        }, env(db));
        expect(res.status).toBe(403);
    });

    it('2. missing signature headers ⇒ 403', async () => {
        const res = await app.request('/api/chunks/verify?key=k', {
            headers: { Origin: ORIGIN, 'X-CSRF-Token': 'c2-test' },
        }, env(db));
        expect(res.status).toBe(403);
    });

    it('3. forged signature ⇒ 403', async () => {
        const ts = now();
        const res = await app.request('/api/chunks/verify?key=k', {
            headers: hmacHeaders('GET', '/api/chunks/verify', ts, 'n-c2-3', '0'.repeat(64)),
        }, env(db));
        expect(res.status).toBe(403);
    });

    it('4. 10-minute-old timestamp ⇒ 403', async () => {
        const ts = String(Date.now() - 10 * 60 * 1000);
        const res = await app.request('/api/chunks/verify?key=k', {
            headers: hmacHeaders('GET', '/api/chunks/verify', ts, 'n-c2-4', sign('GET', '/api/chunks/verify', ts, 'n-c2-4')),
        }, env(db));
        expect(res.status).toBe(403);
    });

    it('5. valid signature reaches key lookup (unknown key ⇒ 200 valid:false)', async () => {
        const ts = now();
        const res = await app.request('/api/chunks/verify?key=missing', {
            headers: hmacHeaders('GET', '/api/chunks/verify', ts, 'n-c2-5', sign('GET', '/api/chunks/verify', ts, 'n-c2-5')),
        }, env(db));
        expect(res.status).toBe(200);
        const body = (await res.json()) as { valid: boolean };
        expect(body.valid).toBe(false);
    });

    it('6. replayed nonce ⇒ 403', async () => {
        const ts = now();
        const sig = sign('GET', '/api/chunks/verify', ts, 'n-c2-6');
        const first = await app.request('/api/chunks/verify?key=k', {
            headers: hmacHeaders('GET', '/api/chunks/verify', ts, 'n-c2-6', sig),
        }, env(db));
        expect(first.status).toBe(200);
        const replay = await app.request('/api/chunks/verify?key=k', {
            headers: hmacHeaders('GET', '/api/chunks/verify', ts, 'n-c2-6', sig),
        }, env(db));
        expect(replay.status).toBe(403);
    });

    it('7. valid HMAC but evil Origin ⇒ 403 (second layer holds)', async () => {
        const ts = now();
        const res = await app.request('/api/chunks/verify?key=k', {
            headers: hmacHeaders('GET', '/api/chunks/verify', ts, 'n-c2-7', sign('GET', '/api/chunks/verify', ts, 'n-c2-7'), 'https://evil.com'),
        }, env(db));
        expect(res.status).toBe(403);
    });

    it('8. prefix-attack Origin with valid HMAC ⇒ 403', async () => {
        const ts = now();
        const res = await app.request('/api/chunks/verify?key=k', {
            headers: hmacHeaders('GET', '/api/chunks/verify', ts, 'n-c2-8', sign('GET', '/api/chunks/verify', ts, 'n-c2-8'), 'https://maelshpro.com.evil.net'),
        }, env(db));
        expect(res.status).toBe(403);
    });

    it('9. unconfigured secret ⇒ 503 (fail closed, never open)', async () => {
        const res = await app.request('/api/chunks/verify?key=k', {
            headers: { Origin: ORIGIN, 'X-CSRF-Token': 'c2-test' },
        }, env(db, false));
        expect(res.status).toBe(503);
    });

    it('10. DELETE with valid signature deletes, replay ⇒ 403', async () => {
        await db.prepare(
            `INSERT INTO users (id, email, username, password_hash, display_name) VALUES (1, 'c2@local', 'c2u', 'x', 'C2')`,
        ).run();
        await db.prepare(
            `INSERT INTO categories (id, slug, name_ar, name_en) VALUES (1, 'c2cat', 'C', 'C')`,
        ).run();
        await db.prepare(
            `INSERT INTO competitions (id, title, rules, category_id, creator_id, status) VALUES (1, 'C2', 'r', 1, 1, 'live')`,
        ).run();
        await db.prepare(
            `INSERT INTO chunk_keys (competition_id, chunk_index, chunk_key, user_id, expires_at)
             VALUES (1, 0, 'delkey-c2', 1, datetime('now', '+10 minutes'))`,
        ).run();
        const ts = now();
        const del = await app.request('/api/chunks/delkey-c2', {
            method: 'DELETE',
            headers: hmacHeaders('DELETE', '/api/chunks/delkey-c2', ts, 'n-c2-10', sign('DELETE', '/api/chunks/delkey-c2', ts, 'n-c2-10')),
        }, env(db));
        expect(del.status).toBe(200);
        const replay = await app.request('/api/chunks/delkey-c2', {
            method: 'DELETE',
            headers: hmacHeaders('DELETE', '/api/chunks/delkey-c2', ts, 'n-c2-10', sign('DELETE', '/api/chunks/delkey-c2', ts, 'n-c2-10')),
        }, env(db));
        expect(replay.status).toBe(403);
    });
});
